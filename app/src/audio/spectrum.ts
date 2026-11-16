/**
 * Small spectrum helpers shared by the media probe now and the tuner later.
 * Pure functions: no Web Audio objects in here.
 */

/**
 * Frequency of the strongest bin in a dB magnitude spectrum, refined by parabolic
 * interpolation over the peak and its two neighbours.
 *
 * @param db         magnitudes in dB, one per bin (as from AnalyserNode.getFloatFrequencyData)
 * @param sampleRate sample rate in Hz
 * @param fftSize    FFT size that produced the spectrum (bins = fftSize / 2)
 * @param minHz      ignore bins below this frequency (skips DC and mains hum)
 */
export function peakFrequencyHz(
  db: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  minHz = 30,
): number {
  const binHz = sampleRate / fftSize;
  const first = Math.max(1, Math.ceil(minHz / binHz));
  let peak = -1;
  let peakDb = -Infinity;
  for (let i = first; i < db.length - 1; i++) {
    const v = db[i] ?? -Infinity;
    if (v > peakDb) {
      peakDb = v;
      peak = i;
    }
  }
  if (peak < 0 || !Number.isFinite(peakDb)) return 0;
  const a = db[peak - 1] ?? peakDb;
  const c = db[peak + 1] ?? peakDb;
  const denom = a - 2 * peakDb + c;
  const offset =
    denom < 0 && Number.isFinite(a) && Number.isFinite(c) ? (0.5 * (a - c)) / denom : 0;
  return (peak + offset) * binHz;
}
