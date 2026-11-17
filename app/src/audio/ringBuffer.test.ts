import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ringBuffer';

describe('RingBuffer', () => {
  it('returns the newest samples oldest-first, zero-padding when short', () => {
    const ring = new RingBuffer(8);
    ring.write([1, 2, 3]);
    const out = new Float32Array(5);
    expect(ring.readLatest(out)).toBe(3);
    expect([...out]).toEqual([0, 0, 1, 2, 3]);
  });

  it('wraps around and keeps only the last `capacity` samples', () => {
    const ring = new RingBuffer(4);
    ring.write([1, 2, 3]);
    ring.write([4, 5, 6]);
    const out = new Float32Array(4);
    ring.readLatest(out);
    expect([...out]).toEqual([3, 4, 5, 6]);
    expect(ring.total).toBe(6);
    expect(ring.size).toBe(4);
  });

  it('handles blocks larger than the buffer', () => {
    const ring = new RingBuffer(3);
    ring.write([1, 2, 3, 4, 5]);
    const out = new Float32Array(3);
    ring.readLatest(out);
    expect([...out]).toEqual([3, 4, 5]);
  });

  it('matches a plain array model for any sequence of writes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 64 }),
        fc.array(fc.array(fc.integer({ min: -100, max: 100 }), { maxLength: 80 }), {
          maxLength: 20,
        }),
        fc.integer({ min: 1, max: 96 }),
        (capacity, blocks, readLength) => {
          const ring = new RingBuffer(capacity);
          const model: number[] = [];
          for (const block of blocks) {
            ring.write(block);
            model.push(...block);
          }
          const out = new Float32Array(readLength);
          const copied = ring.readLatest(out);
          const want = Math.min(readLength, capacity, model.length);
          expect(copied).toBe(want);
          const expected = model.slice(model.length - want);
          expect([...out.slice(readLength - want)]).toEqual(expected);
        },
      ),
    );
  });

  it('rejects silly capacities and clears', () => {
    expect(() => new RingBuffer(0)).toThrow();
    const ring = new RingBuffer(2);
    ring.write([1]);
    ring.clear();
    expect(ring.total).toBe(0);
  });
});
