const mask64 = (1n << 64n) - 1n

/**
 * Small deterministic random number generator, so a given seed always gives
 * the same grain and light leaks.
 */
export class SplitMix64 {
  private state: bigint

  constructor(seed: bigint) {
    this.state = BigInt.asUintN(64, seed)
  }

  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & mask64
    let z = this.state
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & mask64
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & mask64
    return z ^ (z >> 31n)
  }

  /** An integer in `0..<upperBound`. */
  nextInt(upperBound: number): number {
    return Number(this.next() % BigInt(upperBound))
  }

  /** A number in `min...max`. */
  nextDouble(min = 0, max = 1): number {
    const unit = Number(this.next() >> 11n) / 2 ** 53
    return min + unit * (max - min)
  }

  nextBool(): boolean {
    return (this.next() & 1n) === 1n
  }
}

export function randomSeed(): bigint {
  const values = new BigUint64Array(1)
  crypto.getRandomValues(values)
  return values[0]!
}
