import { randomSeed } from './splitmix64'

export interface RenderOptions {
  /** Varies grain and light leaks between photos. The same seed gives the same result. */
  seed: bigint
  /** Printed by presets with a date stamp. */
  date: Date
}

export function newRenderOptions(date = new Date()): RenderOptions {
  return { seed: randomSeed(), date }
}

/** The orange "'98 10 12" date imprint of point-and-shoot and disposable cameras. */
export function dateStampText(date: Date): string {
  const year = String(date.getFullYear() % 100).padStart(2, '0')
  return `'${year} ${date.getMonth() + 1} ${date.getDate()}`
}
