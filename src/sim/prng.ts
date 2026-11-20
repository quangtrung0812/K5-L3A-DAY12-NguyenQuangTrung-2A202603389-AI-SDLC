/**
 * Deterministic Mulberry32 PRNG for reproducible simulation across runs and platforms.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = (Math.trunc(seed) >>> 0) || 0x6d2b79f5;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}
