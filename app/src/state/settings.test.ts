import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';

describe('sanitizeSettings', () => {
  it('fills defaults and keeps valid values', () => {
    expect(sanitizeSettings({ handedness: 'left', capo: 3 })).toEqual({
      ...DEFAULT_SETTINGS,
      handedness: 'left',
      capo: 3,
    });
  });

  it('drops unknown keys and wrong types, and clamps ranges', () => {
    const out = sanitizeSettings({ theme: 7, extra: 'x', capo: 40, a4Hz: 500 });
    expect(out.theme).toBe('dark');
    expect('extra' in out).toBe(false);
    expect(out.capo).toBe(12);
    expect(out.a4Hz).toBe(450);
  });

  it('rejects unknown choices', () => {
    expect(sanitizeSettings({ handedness: 'both', tuning: 'weird' })).toEqual(DEFAULT_SETTINGS);
  });

  it('copes with garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('stage settings', () => {
  it('clamps dot size and validates remembered taps', () => {
    expect(sanitizeSettings({ dotScale: 5 }).dotScale).toBe(1.6);
    expect(
      sanitizeSettings({ lockTaps: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }).lockTaps,
    ).toHaveLength(8);
    expect(sanitizeSettings({ lockTaps: [0.1, 2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] }).lockTaps).toEqual(
      [],
    );
    expect(sanitizeSettings({ lockTaps: 'x' }).lockTaps).toEqual([]);
    expect(sanitizeSettings({ stageAutoSeconds: 7 }).stageAutoSeconds).toBe(0);
  });
});
