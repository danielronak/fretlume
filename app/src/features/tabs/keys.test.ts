import { describe, expect, it } from 'vitest';
import { keyCommand } from './keys';

describe('editor keys', () => {
  it('digits, arrows, techniques, durations', () => {
    expect(keyCommand({ key: '7' }, 5)).toEqual({ type: 'digit', digit: 7, tMs: 5 });
    expect(keyCommand({ key: 'ArrowDown' }, 0)).toEqual({ type: 'move', strings: 1 });
    expect(keyCommand({ key: 'H' }, 0)).toEqual({ type: 'tech', tech: 'h' });
    expect(keyCommand({ key: '\\' }, 0)).toEqual({ type: 'tech', tech: '\\' });
    expect(keyCommand({ key: 'm' }, 0)).toEqual({ type: 'tech', tech: 'pm' });
    expect(keyCommand({ key: '-' }, 0)).toEqual({ type: 'duration', op: 'halve' });
    expect(keyCommand({ key: ' ' }, 0)).toEqual({ type: 'play' });
  });

  it('modifiers: undo, redo, bars; unknown keys are left to the browser', () => {
    expect(keyCommand({ key: 'z', ctrlKey: true }, 0)).toEqual({ type: 'undo' });
    expect(keyCommand({ key: 'Z', metaKey: true, shiftKey: true }, 0)).toEqual({ type: 'redo' });
    expect(keyCommand({ key: 'Enter', ctrlKey: true }, 0)).toEqual({ type: 'insertBar' });
    expect(keyCommand({ key: 'Delete', shiftKey: true }, 0)).toEqual({ type: 'deleteBeat' });
    expect(keyCommand({ key: 'Tab' }, 0)).toBeNull();
    expect(keyCommand({ key: 'q' }, 0)).toBeNull();
    expect(keyCommand({ key: 'r', ctrlKey: true }, 0)).toBeNull();
  });
});
