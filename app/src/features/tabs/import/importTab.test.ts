import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as alphaTab from '@coderline/alphatab/core';
import { describe, expect, it } from 'vitest';
import { fromAscii, toAscii, TabParseError } from '@core/tab/ascii';
import { TPQ, type Beat } from '@core/tab/model';
import { importTabFile, importTabText } from './importTab';

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../../../../fixtures/tabs/${name}`, import.meta.url))),
  );

/** A Guitar Pro 7 file written by alphaTab's own exporter from alphaTex (our own riff). */
function gp7(tex: string): Uint8Array {
  const settings = new alphaTab.Settings();
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString(tex, settings);
  return new alphaTab.exporter.Gp7Exporter().export(importer.readScore(), settings);
}

const RIFF_TEX =
  '\\title "GP Riff" \\tempo 112 \\ts (4 4) ' +
  '5.3.4 {ch "Am"} 5.4{h}.8 7.4.8 7.4{sl}.4 9.4.4 | 8.2{b (0 4)}.4 x.6.8 5.5{pm}.8 5.1{v}.2 | 3.6.2 3.6.2';

describe('tab import', () => {
  it('ASCII file', async () => {
    const { format, tracks } = await importTabFile('riff.txt', fixture('riff.txt'), 'a');
    expect(format).toBe('ascii');
    const tab = tracks[0]!.tab;
    expect([tab.title, tab.tempoBpm]).toEqual(['Fixture Riff', 96]);
    const bar1 = tab.tracks[0]!.bars[0]!.beats;
    expect(bar1.map((b) => [b.durTicks, b.notes[0]?.tech ?? '', b.notes[0]?.fret ?? -1])).toEqual([
      [TPQ, '', 5],
      [TPQ / 2, 'h', 7],
      [TPQ / 2, '/', 9],
      [TPQ * 2, '', -1],
    ]);
  });

  it('ChordPro file', async () => {
    const { format, tracks } = await importTabFile('chords.cho', fixture('chords.cho'), 'c');
    expect(format).toBe('chordpro');
    expect(tracks[0]!.tab.tracks[0]!.bars.map((b) => b.chordSymbol)).toEqual(['C', 'Am', 'F', 'G']);
  });

  it('JSON export comes back; junk JSON is a friendly error', () => {
    const { tracks } = importTabText(
      JSON.stringify({
        id: 'old',
        title: 'J',
        tuning: [64, 59, 55, 50, 45, 40],
        tracks: [{ bars: [{ beats: [{ durTicks: 480, notes: [{ string: 1, fret: 3 }] }] }] }],
      }),
      'new',
    );
    expect(tracks[0]!.tab.id).toBe('new');
    expect(() => importTabText('{"hello": 1}', 'x')).toThrow(TabParseError);
  });

  it('Guitar Pro 7 file: techniques, chord name, ties, strings counted from high e', async () => {
    const { format, tracks } = await importTabFile('riff.gp', gp7(RIFF_TEX), 'g');
    expect(format).toBe('score');
    const tab = tracks[0]!.tab;
    expect([tab.title, tab.tempoBpm, tab.timeSig]).toEqual(['GP Riff', 112, [4, 4]]);
    const [b1, b2] = tab.tracks[0]!.bars;
    expect(b1!.chordSymbol).toBe('Am');
    const show = (beats: Beat[]) =>
      beats.map((b) =>
        b.notes
          .map((n) => `${n.string}:${n.tech ?? ''}${n.fret}${n.bendSemis ? `+${n.bendSemis}` : ''}`)
          .join(','),
      );
    expect(show(b1!.beats)).toEqual(['3:5', '4:5', '4:h7', '4:7', '4:/9']);
    expect(show(b2!.beats)).toEqual(['2:b8+2', '6:x0', '5:pm5', '1:~5']);
    // The ASCII export of an imported file is readable and complete.
    expect(toAscii(tab)).toContain('8b10');
  });

  it('MusicXML without a tab staff: pitches are placed on strings', async () => {
    const { tracks } = await importTabFile('melody.musicxml', fixture('melody.musicxml'), 'm');
    const tab = tracks[0]!.tab;
    expect(tab.title).toBe('Fixture Melody');
    const beats = tab.tracks[0]!.bars[0]!.beats;
    const midi = beats.map((b) =>
      b.notes.map((n) => tab.tuning[n.string - 1]! + tab.capo + n.fret),
    );
    expect(midi).toEqual([[64], [67], [69], [71], [64, 60]]);
    expect(beats.map((b) => b.durTicks)).toEqual([TPQ, TPQ, TPQ / 2, TPQ / 2, TPQ]);
  });

  it('files that are not tabs give friendly errors', async () => {
    await expect(importTabFile('x.gp', new Uint8Array([1, 2, 3]), 'x')).rejects.toThrow(
      TabParseError,
    );
    await expect(
      importTabFile('notes.txt', new TextEncoder().encode('hello'), 'x'),
    ).rejects.toThrow(/No tab found/);
  });

  it('every fixture round-trips through ASCII and JSON (exit gate 3)', async () => {
    const files: [string, Uint8Array][] = [
      ['riff.txt', fixture('riff.txt')],
      ['chords.cho', fixture('chords.cho')],
      ['melody.musicxml', fixture('melody.musicxml')],
      ['riff.gp', gp7(RIFF_TEX)],
    ];
    for (const [name, bytes] of files) {
      const tab = (await importTabFile(name, bytes, 'r')).tracks[0]!.tab;
      expect(fromAscii(toAscii(tab), 'r'), name).toEqual(tab);
      expect(importTabText(JSON.stringify(tab), 'r').tracks[0]!.tab, name).toEqual(tab);
    }
  });
});
