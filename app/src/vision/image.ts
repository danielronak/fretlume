/** Image access for the trackers: 8-bit gray or RGBA, row-major, with bilinear luma sampling. */

export interface Image {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
  /** 1 = gray, 4 = RGBA. */
  channels: 1 | 4;
}

/** Luma of pixel (x, y) (integers, in range). */
export function lumaAt(image: Image, x: number, y: number): number {
  const i = (y * image.width + x) * image.channels;
  if (image.channels === 1) return image.data[i]!;
  // ITU-R BT.601 weights, as OpenCV's BGR2GRAY.
  return 0.299 * image.data[i]! + 0.587 * image.data[i + 1]! + 0.114 * image.data[i + 2]!;
}

/** Bilinear luma at a real position; NaN outside the image. */
export function sampleLuma(image: Image, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 >= image.width - 1 || y0 >= image.height - 1) {
    // Allow the exact last row/column.
    if (x0 === image.width - 1 && y0 >= 0 && y0 < image.height && x === x0)
      return lumaAt(image, x0, Math.min(y0, image.height - 1));
    return Number.NaN;
  }
  const fx = x - x0;
  const fy = y - y0;
  const a = lumaAt(image, x0, y0);
  const b = lumaAt(image, x0 + 1, y0);
  const c = lumaAt(image, x0, y0 + 1);
  const d = lumaAt(image, x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
