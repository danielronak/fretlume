/**
 * One-Euro filter (Casiez, Roussel & Vogel, CHI 2012): a low-pass whose cutoff rises with speed, so
 * a still neck stops jittering and a moving one does not lag.
 */
export interface OneEuroOptions {
  /** Cutoff at rest (Hz). Lower = smoother when still. */
  minCutoffHz: number;
  /** How fast the cutoff rises with speed (per unit/s). Higher = less lag when moving. */
  beta: number;
  /** Cutoff for the speed estimate (Hz). Default 1. */
  dCutoffHz?: number;
}

const alpha = (cutoffHz: number, dtS: number) => {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtS);
};

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private tMs = 0;

  constructor(private readonly options: OneEuroOptions) {}

  reset(): void {
    this.x = null;
    this.dx = 0;
  }

  filter(value: number, tMs: number): number {
    if (this.x === null) {
      this.x = value;
      this.tMs = tMs;
      return value;
    }
    const dtS = Math.max(1e-3, (tMs - this.tMs) / 1000);
    this.tMs = tMs;
    const rawDx = (value - this.x) / dtS;
    this.dx += alpha(this.options.dCutoffHz ?? 1, dtS) * (rawDx - this.dx);
    const cutoff = this.options.minCutoffHz + this.options.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dtS) * (value - this.x);
    return this.x;
  }
}
