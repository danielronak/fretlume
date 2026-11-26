/**
 * Streaming band-limited resampler (windowed sinc, Blackman window): the microphone runs at 44.1 or
 * 48 kHz; the listening engine analyses at 22.05 kHz (docs/specs/02-audio.md §1). The kernel is
 * tabulated once (512 points per input sample, linearly interpolated), so each tap is a lookup, not
 * a sine and two cosines. Pure.
 */
const TABLE_STEPS = 512;

export class Resampler {
  private readonly ratio: number;
  private readonly cutoff: number;
  private readonly half: number;
  private readonly table: Float64Array;
  private buf: Float64Array = new Float64Array(0);
  /** Absolute input index of buf[0]. */
  private bufStart = 0;
  /** Next output sample's position in input samples. */
  private pos = 0;

  constructor(
    readonly inRate: number,
    readonly outRate: number,
    zeroCrossings = 12,
  ) {
    this.ratio = inRate / outRate;
    // Below the output's Nyquist, with a little room for the transition band.
    this.cutoff = Math.min(1, outRate / inRate) * 0.92;
    this.half = Math.ceil(zeroCrossings / this.cutoff);
    this.table = new Float64Array(this.half * TABLE_STEPS + 2);
    for (let i = 0; i < this.table.length; i++) this.table[i] = this.exact(i / TABLE_STEPS);
  }

  private exact(x: number): number {
    if (x === 0) return this.cutoff;
    if (Math.abs(x) >= this.half) return 0;
    const w =
      0.42 +
      0.5 * Math.cos((Math.PI * x) / this.half) +
      0.08 * Math.cos((2 * Math.PI * x) / this.half);
    return (Math.sin(Math.PI * this.cutoff * x) / (Math.PI * x)) * w;
  }

  /** The kernel at distance x (symmetric), from the table. */
  private kernel(x: number): number {
    const a = Math.abs(x) * TABLE_STEPS;
    const i = Math.floor(a);
    if (i >= this.table.length - 1) return 0;
    const f = a - i;
    return this.table[i]! + (this.table[i + 1]! - this.table[i]!) * f;
  }

  /** Push input samples; returns the output samples now computable. */
  push(input: ArrayLike<number>): Float32Array {
    const next = new Float64Array(this.buf.length + input.length);
    next.set(this.buf);
    for (let i = 0; i < input.length; i++) next[this.buf.length + i] = input[i]!;
    this.buf = next;
    const out: number[] = [];
    const lastAvailable = this.bufStart + this.buf.length - 1;
    while (this.pos + this.half <= lastAvailable) {
      const centre = Math.floor(this.pos);
      let acc = 0;
      for (let k = Math.max(centre - this.half + 1, this.bufStart); k <= centre + this.half; k++)
        acc += this.buf[k - this.bufStart]! * this.kernel(this.pos - k);
      out.push(acc);
      this.pos += this.ratio;
    }
    // Keep what the next outputs still need.
    const keepFrom = Math.max(0, Math.floor(this.pos) - this.half - this.bufStart);
    if (keepFrom > 0) {
      this.buf = this.buf.slice(keepFrom);
      this.bufStart += keepFrom;
    }
    return Float32Array.from(out);
  }
}
