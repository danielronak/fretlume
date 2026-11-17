import { describe, expect, it } from 'vitest';
import { readFrameStamp } from './stamp';

function stamped(index: number, width: number, height: number, scale: number) {
  const data = new Uint8ClampedArray(width * height * 4).fill(90);
  const block = 8 * scale;
  for (let bit = 0; bit < 16; bit++) {
    const v = (index >> bit) & 1 ? 255 : 0;
    for (let y = Math.round(height - block); y < height; y++)
      for (let x = Math.round(bit * block); x < Math.round((bit + 1) * block); x++)
        for (let c = 0; c < 3; c++) data[(y * width + x) * 4 + c] = v;
  }
  return { width, height, data, channels: 4 as const };
}

describe('readFrameStamp', () => {
  it('reads the number at full and reduced size', () => {
    expect(readFrameStamp(stamped(0, 200, 50, 1))).toBe(0);
    expect(readFrameStamp(stamped(37, 200, 50, 1))).toBe(37);
    expect(readFrameStamp(stamped(40000, 200, 50, 1))).toBe(40000);
    expect(readFrameStamp(stamped(1234, 150, 40, 0.75), 0.75)).toBe(1234);
  });
});
