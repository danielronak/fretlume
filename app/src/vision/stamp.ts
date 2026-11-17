/**
 * Reads the frame number that synthetic test clips carry in their bottom-left corner (16 bits,
 * 8×8 blocks, bit 0 leftmost; ml/synth/render.py `stamp_index`). Debug and e2e only.
 */
import { lumaAt, type Image } from './image';

/** `scale` = processing px per video px (the blocks shrink with the frame). */
export function readFrameStamp(image: Image, scale = 1): number {
  const block = 8 * scale;
  const y = image.height - block / 2;
  let index = 0;
  for (let bit = 0; bit < 16; bit++) {
    const x = Math.min(image.width - 1, Math.floor(bit * block + block / 2));
    if (lumaAt(image, x, Math.floor(y)) > 127) index |= 1 << bit;
  }
  return index;
}
