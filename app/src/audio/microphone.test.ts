import { describe, expect, it } from 'vitest';
import { classifyError } from './microphone';

const err = (name: string) => Object.assign(new Error(name), { name });

describe('classifyError', () => {
  it('maps getUserMedia failures to states the player can act on', () => {
    expect(classifyError(err('NotAllowedError'))).toBe('denied');
    expect(classifyError(err('SecurityError'))).toBe('denied');
    expect(classifyError(err('NotFoundError'))).toBe('no-device');
    expect(classifyError(err('OverconstrainedError'))).toBe('no-device');
    expect(classifyError(err('NotReadableError'))).toBe('busy');
    expect(classifyError(err('Whatever'))).toBe('error');
    expect(classifyError('nope')).toBe('error');
  });
});
