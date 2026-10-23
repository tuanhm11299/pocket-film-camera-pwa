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

/**
 * Crops and scales the source into the output, bends it through the lens, varies the
 * exposure for this shot, then applies the preset's color LUT.
 */
export const sourceShader = `${common}
uniform sampler2D u_source;
uniform vec4 u_crop; // x, y, width, height in source UV, origin at the top left
uniform vec2 u_size;
uniform float u_distortion; // radial coefficient, + barrel, - pincushion
uniform float u_distortionScale; // keeps the edges inside the source
uniform float u_aberration;
uniform vec3 u_gain; // per-shot exposure and white balance, in linear light
uniform bool u_useLUT;
uniform sampler3D u_lut;
uniform float u_lutSize;

vec3 sampleSource(vec2 p) {
  // Source images have their first row at the top; the pipeline's origin is the bottom left.
  vec2 uv = u_crop.xy + vec2(p.x, 1.0 - p.y) * u_crop.zw;
  return texture(u_source, uv).rgb;
}

void main() {
  // Offset from the center, measured so that the corners are at radius 1.
  vec2 halfSize = 0.5 * u_size;
  vec2 d = (v_uv - 0.5) * u_size / length(halfSize);
  float r2 = dot(d, d);
  vec2 lensUV = 0.5 + d * (1.0 + u_distortion * r2) / u_distortionScale * length(halfSize) / u_size;
  vec3 c;
  if (u_aberration > 0.0) {
    // Red is spread a little wider than green, blue a little narrower, more so at the edges.
    vec2 shift = (lensUV - 0.5) * u_aberration * r2;
    c = vec3(
      sampleSource(lensUV + shift).r,
      sampleSource(lensUV).g,
      sampleSource(lensUV - shift).b
    );
  } else {
    c = sampleSource(lensUV);
  }
  c *= u_gain;
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

/** Luminance above a threshold, with a soft knee, stretched back to 0...1. */
export const highlightShader = `${common}
uniform sampler2D u_source;
uniform float u_threshold;
void main() {
  vec3 c = texture(u_source, v_uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float h = smoothstep(u_threshold, 1.0, l);
  outColor = vec4(vec3(h * h), 1.0);
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

/** Blends in a blurred copy toward the edges and corners, like a lens that is soft there. */
export const edgeBlurShader = `${common}
uniform sampler2D u_source;
uniform sampler2D u_blurred;
uniform vec2 u_size;
uniform float u_amount;
void main() {
  vec2 d = (v_uv - 0.5) * u_size / (0.5 * length(u_size));
  float t = smoothstep(0.25, 1.0, length(d)) * u_amount;
  outColor = vec4(mix(texture(u_source, v_uv).rgb, texture(u_blurred, v_uv).rgb, t), 1.0);
}
`

/** On-camera flash, vignette and light leak, in that order. */
export const lightShader = `${common}
uniform sampler2D u_source;
uniform vec2 u_size;
uniform float u_flash;
uniform vec3 u_flashColor;
uniform float u_vignette;
uniform bool u_leak;
// Up to three glowing blobs: center x, y and radius across, along, in output pixels.
uniform vec4 u_leak0;
uniform vec4 u_leak1;
uniform vec4 u_leak2;
uniform vec3 u_leakStrength;
uniform vec3 u_leakColor;
uniform vec3 u_leakEdgeColor;

// A radial gradient from white inside r0 to gray 'edge' at r1, as an sRGB value.
float radialMask(float d, float r0, float r1, float edge) {
  float t = clamp((d - r0) / max(r1 - r0, 1e-4), 0.0, 1.0);
  return toLinear(mix(1.0, edge, t));
}

// One leak blob: hot core color, fading through the edge color to nothing, as an sRGB value.
vec3 leakBlob(vec2 p, vec4 blob, float strength) {
  if (strength <= 0.0) return vec3(0.0);
  float t = length((p - blob.xy) / blob.zw);
  float falloff = 1.0 - smoothstep(0.0, 1.0, t);
  vec3 color = mix(u_leakColor, u_leakEdgeColor, smoothstep(0.0, 0.7, t));
  return color * falloff * falloff * strength;
}

void main() {
  vec3 c = texture(u_source, v_uv).rgb;
  vec2 p = v_uv * u_size;
  float shortEdge = min(u_size.x, u_size.y);
  float halfDiagonal = length(u_size) * 0.5;
  float d = distance(p, u_size * 0.5);

  if (u_flash > 0.0) {
    c *= exp2(0.5 * u_flash) * mix(vec3(1.0), u_flashColor, u_flash);
    c *= radialMask(d, shortEdge * 0.1, halfDiagonal, 1.0 - 0.6 * u_flash);
  }
  if (u_vignette > 0.0) {
    c *= radialMask(d, shortEdge * 0.3, halfDiagonal * 1.05, 1.0 - 0.75 * u_vignette);
  }
  if (u_leak) {
    vec3 leak = leakBlob(p, u_leak0, u_leakStrength.x)
      + leakBlob(p, u_leak1, u_leakStrength.y)
      + leakBlob(p, u_leak2, u_leakStrength.z);
    c = screen(clamp(c, 0.0, 1.0), toLinear(clamp(leak, 0.0, 1.0)));
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
uniform float u_grainChroma;
uniform float u_grainRoughness;
uniform vec3 u_grainResponse; // strength in the shadows, midtones and highlights
uniform bool u_stamp;
uniform sampler2D u_stampTexture;
uniform vec4 u_stampRect; // x, y, width, height in output pixels, origin at the bottom left

vec3 softLight(vec3 b, vec3 s) {
  vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
  return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
}

vec3 grain(vec3 c, vec2 p) {
  float tileSize = 512.0 * u_noiseScale;
  vec3 n = texture(u_noise, (p + u_noiseOffset) / tileSize).rgb - 0.5;
  if (u_grainRoughness > 0.0) {
    // Coarser clumps from another part of the tile, keeping the overall strength.
    vec3 coarse = texture(u_noise, (p * 0.43 + u_noiseOffset.yx) / tileSize).rgb - 0.5;
    n = (n + u_grainRoughness * coarse) / sqrt(1.0 + u_grainRoughness * u_grainRoughness);
  }
  n = mix(vec3(n.r), n, u_grainChroma);
  // Tone in perceptual terms, so "shadows" means what it looks like.
  float tone = pow(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 1.0 / 2.2);
  float shadows = 1.0 - smoothstep(0.0, 0.5, tone);
  float highlights = smoothstep(0.5, 1.0, tone);
  vec3 weights = vec3(shadows, 1.0 - shadows - highlights, highlights);
  float amount = u_grainAmount * dot(weights, u_grainResponse);
  return softLight(c, clamp(0.5 + amount * n, 0.0, 1.0));
}

void main() {
  vec3 c = clamp(texture(u_source, v_uv).rgb, 0.0, 1.0);
  vec2 p = v_uv * u_size;
  if (u_grain) c = grain(c, p);
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
