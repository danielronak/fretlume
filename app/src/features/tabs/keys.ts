/**
 * Editor keyboard (phase 5 task 5.5): one place that turns a key press into an editor action, so
 * the screen, the on-screen key list and the tests agree. Pure.
 */
import type { EditAction } from '@core/tab/edit';
import type { Technique } from '@core/tab/model';

export interface KeyPress {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export type KeyCommand = EditAction | { type: 'play' } | { type: 'save' };

const TECH_KEYS: Record<string, Technique> = {
  h: 'h',
  p: 'p',
  '/': '/',
  '\\': '\\',
  b: 'b',
  r: 'r',
  x: 'x',
  '~': '~',
  m: 'pm',
};

/** The action for a key press, or null when the editor does not use it (let the browser have it). */
export function keyCommand(e: KeyPress, tMs: number): KeyCommand | null {
  const mod = e.ctrlKey === true || e.metaKey === true;
  const key = e.key;
  if (mod) {
    switch (key.toLowerCase()) {
      case 'z':
        return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
      case 'y':
        return { type: 'redo' };
      case 'c':
        return { type: 'copyBar' };
      case 'v':
        return { type: 'pasteBar' };
      case 's':
        return { type: 'save' };
      case 'enter':
        return { type: 'insertBar' };
      case 'backspace':
      case 'delete':
        return { type: 'deleteBar' };
      case 'arrowleft':
        return { type: 'moveBar', bars: -1 };
      case 'arrowright':
        return { type: 'moveBar', bars: 1 };
      default:
        return null;
    }
  }
  if (e.altKey) return null;
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: Number(key), tMs };
  switch (key) {
    case 'ArrowLeft':
      return { type: 'move', beats: -1 };
    case 'ArrowRight':
      return { type: 'move', beats: 1 };
    case 'ArrowUp':
      return { type: 'move', strings: -1 };
    case 'ArrowDown':
      return { type: 'move', strings: 1 };
    case 'PageUp':
      return { type: 'moveBar', bars: -1 };
    case 'PageDown':
      return { type: 'moveBar', bars: 1 };
    case 'Home':
      return { type: 'home' };
    case 'End':
      return { type: 'end' };
    case 'Backspace':
    case 'Delete':
      return e.shiftKey ? { type: 'deleteBeat' } : { type: 'clear' };
    case 'Enter':
      return { type: 'insertBeat' };
    case '+':
    case '=':
      return { type: 'duration', op: 'double' };
    case '-':
    case '_':
      return { type: 'duration', op: 'halve' };
    case ' ':
      return { type: 'play' };
  }
  const tech = TECH_KEYS[key.length === 1 ? key.toLowerCase() : ''];
  return tech ? { type: 'tech', tech } : null;
}

/** The key list shown in the editor's help panel: [keys, i18n key of what they do]. */
export const KEY_HELP = [
  ['0–9', 'tabKeyFret'],
  ['← → ↑ ↓', 'tabKeyMove'],
  ['PgUp PgDn', 'tabKeyBar'],
  ['h p / \\ b r x ~ m', 'tabKeyTech'],
  ['+ −', 'tabKeyDuration'],
  ['Enter', 'tabKeyInsertBeat'],
  ['Del', 'tabKeyClear'],
  ['Shift+Del', 'tabKeyDeleteBeat'],
  ['Ctrl+Enter', 'tabKeyInsertBar'],
  ['Ctrl+Del', 'tabKeyDeleteBar'],
  ['Ctrl+C Ctrl+V', 'tabKeyCopyBar'],
  ['Ctrl+Z Ctrl+Y', 'tabKeyUndo'],
  ['Space', 'tabKeyPlay'],
] as const;
