import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { t } from './index';

describe('t', () => {
  it('returns the message for a key', () => {
    expect(t('navLibrary')).toBe('Library');
  });

  it('fills placeholders', () => {
    expect(t('kitchenTabPanel', { name: 'Scales' })).toBe('Showing Scales');
  });

  it('leaves unknown placeholders intact', () => {
    expect(t('kitchenTabPanel', { other: 1 })).toBe('Showing {name}');
  });

  it('has no empty messages', () => {
    for (const [key, value] of Object.entries(en)) expect(value.trim(), key).not.toBe('');
  });

  it('substitutes any value verbatim', () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        expect(t('kitchenTabPanel', { name })).toBe(`Showing ${name}`);
      }),
    );
  });
});
