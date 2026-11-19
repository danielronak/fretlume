/**
 * One entry point for every tab file the player brings (phase 5 task 5.6): Fretlume JSON, ASCII tab,
 * ChordPro / chord sheets, and Guitar Pro or MusicXML through alphaTab. Text is sniffed by content,
 * binary files by name and magic bytes.
 */
import { fromAscii, TabParseError } from '@core/tab/ascii';
import { fromChordPro, looksLikeChordPro } from '@core/tab/chordpro';
import { sanitizeTab } from '@core/tab/sanitize';
import { importScoreBytes, type ImportedTrack } from './alphatab';

export type ImportFormat = 'json' | 'ascii' | 'chordpro' | 'score';
export interface ImportResult {
  format: ImportFormat;
  tracks: ImportedTrack[];
}

/** Larger files are refused before parsing (a long Guitar Pro file is well under 1 MB). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const SCORE_EXT = /\.(gp|gp[345x]|gpx|musicxml|mxl|xml)$/i;

const single = (format: ImportFormat, tab: ImportedTrack['tab']): ImportResult => ({
  format,
  tracks: [{ name: tab.title, tab }],
});

/** Pasted or text-file content. */
export function importTabText(text: string, id: string): ImportResult {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      raw = null;
    }
    // A Fretlume tab file is the tab itself, or { tab } from an export wrapper.
    const tab =
      sanitizeTab(raw, id) ??
      (raw && typeof raw === 'object' && 'tab' in raw ? sanitizeTab(raw.tab, id) : null);
    if (tab) return single('json', { ...tab, id });
    if (raw !== null)
      throw new TabParseError('unreadable', 'This JSON file is not a Fretlume tab.');
  }
  try {
    return single('ascii', fromAscii(text, id));
  } catch (error) {
    if (!(error instanceof TabParseError)) throw error;
    if (looksLikeChordPro(text) || error.code === 'noTab') {
      try {
        return single('chordpro', fromChordPro(text, id));
      } catch {
        // fall through to the ASCII message, the more common case
      }
    }
    throw error;
  }
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;
const isGpBinary = (b: Uint8Array) =>
  // GP3–GP5 start with a length byte then "FICHIER GUITAR PRO"; GPX with "BCFZ"/"BCFS".
  new TextDecoder('latin1').decode(b.subarray(0, 32)).includes('GUITAR PRO') ||
  new TextDecoder('latin1').decode(b.subarray(0, 4)).startsWith('BCF');

/** A file from the file picker or a drop. */
export async function importTabFile(
  name: string,
  bytes: Uint8Array,
  id: string,
): Promise<ImportResult> {
  if (bytes.length > MAX_IMPORT_BYTES)
    throw new TabParseError('tooBig', 'This file is too large to be a tab.');
  const xmlText = /\.(xml|musicxml)$/i.test(name);
  if (SCORE_EXT.test(name) || isZip(bytes) || isGpBinary(bytes)) {
    let tracks: ImportedTrack[];
    try {
      tracks = await importScoreBytes(bytes, id);
    } catch {
      if (!xmlText) throw new TabParseError('unreadable', 'This file could not be read.');
      tracks = [];
    }
    if (tracks.length) return { format: 'score', tracks };
    throw new TabParseError('noTracks', 'This file has no guitar or bass track.');
  }
  return importTabText(new TextDecoder().decode(bytes), id);
}
