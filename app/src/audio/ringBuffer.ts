/**
 * Fixed-size ring buffer of audio samples. The capture worklet writes blocks into it;
 * analysers (tuner, listening engine) read the most recent window without copying the history.
 */
export class RingBuffer {
  private readonly data: Float32Array;
  private writeIndex = 0;
  /** Samples written since creation (not capped). */
  total = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new Error('capacity must be a positive integer');
    this.data = new Float32Array(capacity);
  }

  write(block: ArrayLike<number>): void {
    const n = block.length;
    if (n >= this.capacity) {
      // Only the newest `capacity` samples matter.
      for (let i = 0; i < this.capacity; i++) this.data[i] = block[n - this.capacity + i] ?? 0;
      this.writeIndex = 0;
    } else {
      for (let i = 0; i < n; i++) {
        this.data[this.writeIndex] = block[i] ?? 0;
        this.writeIndex = (this.writeIndex + 1) % this.capacity;
      }
    }
    this.total += n;
  }

  /** Samples currently held (≤ capacity). */
  get size(): number {
    return Math.min(this.total, this.capacity);
  }

  /**
   * Copy the newest `out.length` samples into `out`, oldest first. If fewer have been written,
   * the start of `out` is zero-filled. Returns how many real samples were copied.
   */
  readLatest(out: Float32Array): number {
    const want = Math.min(out.length, this.capacity);
    const have = Math.min(want, this.size);
    const pad = out.length - have;
    out.fill(0, 0, pad);
    let index = (this.writeIndex - have + this.capacity) % this.capacity;
    for (let i = 0; i < have; i++) {
      out[pad + i] = this.data[index] ?? 0;
      index = (index + 1) % this.capacity;
    }
    return have;
  }

  clear(): void {
    this.data.fill(0);
    this.writeIndex = 0;
    this.total = 0;
  }
}
