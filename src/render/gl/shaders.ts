// GLSL ES 3.00 shaders for the film pipeline.
//
// Intermediate textures are SRGB8_ALPHA8, so the GPU decodes to linear light on every read
// and encodes on every write. Blending therefore happens in linear light, like Core Image.

/** A full-screen triangle; no vertex buffers needed. `v_uv` has its origin at the bottom left. */
export const vertexShader = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

const common = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_uv;
out vec4 outColor;

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
float toLinear(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 screen(vec3 a, vec3 b) {
  return 1.0 - (1.0 - a) * (1.0 - b);
}
`

/** Crops and scales the source into the output, then applies the preset's color LUT. */
export const sourceShader = `${common}
uniform sampler2D u_source;
uniform vec4 u_crop; // x, y, width, height in source UV, origin at the top left
uniform bool u_useLUT;
uniform sampler3D u_lut;
uniform float u_lutSize;

void main() {
  // Source images have their first row at the top; the pipeline's origin is the bottom left.
  vec2 uv = u_crop.xy + vec2(v_uv.x, 1.0 - v_uv.y) * u_crop.zw;
  vec3 c = texture(u_source, uv).rgb;
  if (u_useLUT) {
    // The LUT maps sRGB values to sRGB values.
    vec3 s = clamp(toSRGB(c), 0.0, 1.0);
    vec3 coord = (s * (u_lutSize - 1.0) + 0.5) / u_lutSize;
    c = toLinear(texture(u_lut, coord).rgb);
  }
  outColor = vec4(c, 1.0);
}
`

export const copyShader = `${common}
uniform sampler2D u_source;
void main() {
  outColor = vec4(texture(u_source, v_uv).rgb, 1.0);
}
`

/** Luminance above 0.7, stretched back to 0...1. */
export const highlightShader = `${common}
uniform sampler2D u_source;
void main() {
  vec3 c = texture(u_source, v_uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float h = clamp((l - 0.7) / 0.3, 0.0, 1.0);
  outColor = vec4(vec3(h), 1.0);
}
`

/** One direction of a separable Gaussian blur. */
export const blurShader = `${common}
uniform sampler2D u_source;
uniform vec2 u_step;  // one texel in the blur direction
uniform float u_sigma;
uniform int u_radius;
void main() {
  vec3 sum = texture(u_source, v_uv).rgb;
  float total = 1.0;
  for (int i = 1; i <= 48; i++) {
    if (i > u_radius) break;
    float w = exp(-float(i * i) / (2.0 * u_sigma * u_sigma));
    vec2 offset = u_step * float(i);
    sum += w * (texture(u_source, v_uv + offset).rgb + texture(u_source, v_uv - offset).rgb);
    total += 2.0 * w;
  }
  outColor = vec4(sum / total, 1.0);
}
`

/** Screen-blends a tinted glow over the image (halation and lens softness). */
export const glowShader = `${common}
uniform sampler2D u_source;
uniform sampler2D u_glow;
uniform vec3 u_tint;
void main() {
  vec3 base = texture(u_source, v_uv).rgb;
  vec3 glow = texture(u_glow, v_uv).rgb * u_tint;
  outColor = vec4(screen(base, glow), 1.0);
}
`

/** On-camera flash, vignette and light leak, in that order. */
export const lightShader = `${common}
uniform sampler2D u_source;
uniform vec2 u_size;
uniform float u_flash;
uniform float u_vignette;
uniform bool u_leak;
uniform vec2 u_leakCenter;
uniform float u_leakRadius;
uniform vec3 u_leakColor;

// A radial gradient from white inside r0 to gray 'edge' at r1, as an sRGB value.
float radialMask(float d, float r0, float r1, float edge) {
  float t = clamp((d - r0) / max(r1 - r0, 1e-4), 0.0, 1.0);
  return toLinear(mix(1.0, edge, t));
}

void main() {
  vec3 c = texture(u_source, v_uv).rgb;
  vec2 p = v_uv * u_size;
  float shortEdge = min(u_size.x, u_size.y);
  float halfDiagonal = length(u_size) * 0.5;
  float d = distance(p, u_size * 0.5);

  if (u_flash > 0.0) {
    c *= exp2(0.5 * u_flash);
    c *= radialMask(d, shortEdge * 0.1, halfDiagonal, 1.0 - 0.6 * u_flash);
  }
  if (u_vignette > 0.0) {
    c *= radialMask(d, shortEdge * 0.3, halfDiagonal * 1.05, 1.0 - 0.75 * u_vignette);
  }
  if (u_leak) {
    float t = clamp(distance(p, u_leakCenter) / u_leakRadius, 0.0, 1.0);
    c = screen(clamp(c, 0.0, 1.0), toLinear(mix(u_leakColor, vec3(0.0), t)));
  }
  outColor = vec4(c, 1.0);
}
`

/** Grain and date stamp, then the output in sRGB. Draws to the canvas itself. */
export const finishShader = `${common}
uniform sampler2D u_source;
uniform vec2 u_size;
uniform bool u_grain;
uniform sampler2D u_noise;
uniform vec2 u_noiseOffset;
uniform float u_noiseScale;
uniform float u_grainAmount;
uniform bool u_stamp;
uniform sampler2D u_stampTexture;
uniform vec4 u_stampRect; // x, y, width, height in output pixels, origin at the bottom left

vec3 softLight(vec3 b, float s) {
  vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
  return s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b);
}

void main() {
  vec3 c = clamp(texture(u_source, v_uv).rgb, 0.0, 1.0);
  vec2 p = v_uv * u_size;
  if (u_grain) {
    float n = texture(u_noise, (p + u_noiseOffset) / (512.0 * u_noiseScale)).r;
    c = softLight(c, clamp(0.5 + u_grainAmount * (n - 0.5), 0.0, 1.0));
  }
  if (u_stamp) {
    vec2 q = (p - u_stampRect.xy) / u_stampRect.zw;
    if (all(greaterThanEqual(q, vec2(0.0))) && all(lessThanEqual(q, vec2(1.0)))) {
      vec4 s = texture(u_stampTexture, vec2(q.x, 1.0 - q.y));
      c = mix(c, s.rgb, s.a);
    }
  }
  outColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}
`
