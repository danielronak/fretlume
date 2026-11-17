import type { Image } from './image';

/** Mean luma of a frame from a sparse grid of samples (cheap darkness check). */
export function luma(image: Image): number {
  const { width, height, data, channels } = image;
  let sum = 0;
  let n = 0;
  for (let y = 4; y < height; y += 16)
    for (let x = 4; x < width; x += 16) {
      const i = (y * width + x) * channels;
      sum +=
        channels === 1 ? data[i]! : 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      n++;
    }
  return n ? sum / n : 0;
}
