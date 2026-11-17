/**
 * Quality tiers (phase 3 task 3.5): the worker reads frames at 720p, 540p or 360p. The tier drops
 * when frames take too long to process and climbs back when there is plenty of headroom.
 */
export const TIER_SCALES = [1, 0.75, 0.5] as const;

export class TierController {
  private ema = 0;
  private frames = 0;
  tier = 0;

  constructor(
    private readonly budgetMs = 28,
    private readonly settleFrames = 30,
  ) {}

  get scale(): number {
    return TIER_SCALES[this.tier]!;
  }

  /** Report one frame's processing time; returns true when the tier changed. */
  report(ms: number): boolean {
    this.ema = this.frames === 0 ? ms : 0.9 * this.ema + 0.1 * ms;
    this.frames++;
    if (this.frames < this.settleFrames) return false;
    if (this.ema > this.budgetMs && this.tier < TIER_SCALES.length - 1) {
      this.tier++;
    } else if (this.ema < 0.35 * this.budgetMs && this.tier > 0) {
      this.tier--;
    } else return false;
    this.frames = 0;
    return true;
  }
}
