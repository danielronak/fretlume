/**
 * Guitar Pro (GP3–GP7) and MusicXML import through alphaTab (MPL-2.0, loaded only when a file is
 * imported). alphaTab reads the file into its score model; `scoreToTabs` maps each stringed track to
 * our Tab. Only the first voice is used; ties lengthen the previous beat; grace notes are skipped.
 */
import { placePitches } from '@core/tab/fingering';
import {
  MAX_FRET,
  STANDARD_TAB_TUNING,
  type Bar,
  type Beat,
  type Tab,
  type TabNote,
  type Technique,
} from '@core/tab/model';
import { sanitizeTab } from '@core/tab/sanitize';

/** The parts of alphaTab's model we read (structural, so tests can build scores with alphaTab itself). */
interface AtNote {
  string: number;
  fret: number;
  realValue: number;
  isDead: boolean;
  isPalmMute: boolean;
  vibrato: number;
  bendType: number;
  bendPoints: { value: number }[] | null;
  hammerPullOrigin: AtNote | null;
  slideOutType: number;
  slideTarget: AtNote | null;
  isTieDestination: boolean;
}
interface AtBeat {
  notes: AtNote[];
  isRest: boolean;
  playbackDuration: number;
  graceType: number;
  chord: { name: string } | null;
}
interface AtBar {
  voices: { beats: AtBeat[] }[];
  masterBar: { timeSignatureNumerator: number; timeSignatureDenominator: number };
}
interface AtStaff {
  tuning: number[];
  capo: number;
  isPercussion?: boolean;
  bars: AtBar[];
}
export interface AtScore {
  title: string;
  tempo: number;
  tracks: { name: string; isPercussion: boolean; staves: AtStaff[] }[];
}

export interface ImportedTrack {
  name: string;
  tab: Tab;
}

/** alphaTab ticks per quarter note. */
const AT_TPQ = 960;
const BEND_RELEASE = new Set([3, 8]); // Release, PrebendRelease
const SLIDES = new Set([1, 2]); // Shift, Legato

function technique(
  n: AtNote,
  slideTech: Map<AtNote, Technique>,
): Pick<TabNote, 'tech' | 'bendSemis'> {
  if (n.isDead) return { tech: 'x' };
  if (n.hammerPullOrigin) return { tech: n.fret >= n.hammerPullOrigin.fret ? 'h' : 'p' };
  const slide = slideTech.get(n);
  if (slide) return { tech: slide };
  if (n.bendType !== 0 && n.bendPoints?.length) {
    const quarterTones = Math.max(...n.bendPoints.map((p) => p.value));
    const semis = Math.min(4, Math.max(0.5, Math.round(quarterTones) / 2));
    return { tech: BEND_RELEASE.has(n.bendType) ? 'r' : 'b', bendSemis: semis };
  }
  if (n.vibrato > 0) return { tech: '~' };
  if (n.isPalmMute) return { tech: 'pm' };
  return {};
}

function staffToTab(title: string, tempo: number, staff: AtStaff, id: string): Tab | null {
  // A staff without tab (MusicXML notation only) has no tuning: place it on a standard guitar.
  const tuning = staff.tuning.length ? staff.tuning : [...STANDARD_TAB_TUNING];
  const strings = tuning.length;
  if (strings < 4 || strings > 8) return null;
  const first = staff.bars[0]?.masterBar;
  const slideTech = new Map<AtNote, Technique>();
  let hand = 0;
  const bars: Bar[] = staff.bars.map((bar) => {
    const beats: Beat[] = [];
    let chordSymbol: string | undefined;
    for (const b of bar.voices[0]?.beats ?? []) {
      if (b.graceType !== 0) continue;
      const durTicks = Math.max(1, Math.round((b.playbackDuration * 480) / AT_TPQ));
      chordSymbol ??= b.chord?.name || undefined;
      const sounding = b.isRest ? [] : b.notes.filter((n) => !n.isTieDestination);
      if (!b.isRest && b.notes.length > 0 && sounding.length === 0 && beats.length > 0) {
        beats[beats.length - 1]!.durTicks += durTicks; // all tied: the previous beat rings on
        continue;
      }
      for (const n of sounding)
        if (SLIDES.has(n.slideOutType) && n.slideTarget)
          slideTech.set(n.slideTarget, n.slideTarget.fret >= n.fret ? '/' : '\\');
      let notes: TabNote[];
      const hasTab = sounding.every((n) => n.string >= 1 && n.fret >= 0 && n.fret <= MAX_FRET);
      if (hasTab) {
        // alphaTab counts strings from the lowest; we count from the highest.
        notes = sounding.map((n) => ({
          string: strings - n.string + 1,
          fret: n.fret,
          ...technique(n, slideTech),
        }));
      } else {
        const placed = placePitches(
          sounding.map((n) => n.realValue),
          tuning,
          staff.capo,
          hand,
        );
        hand = placed.handFret;
        notes = placed.notes;
      }
      beats.push(notes.length ? { durTicks, notes } : { durTicks, notes: [], rest: true });
    }
    return chordSymbol ? { beats, chordSymbol } : { beats };
  });
  return sanitizeTab(
    {
      id,
      title: title || 'Imported tab',
      tuning,
      capo: staff.capo,
      tempoBpm: Math.round(tempo),
      timeSig: [first?.timeSignatureNumerator ?? 4, first?.timeSignatureDenominator ?? 4],
      tracks: [{ bars }],
    },
    id,
  );
}

/** Every stringed track of a score as a Tab (percussion and odd string counts are skipped). */
export function scoreToTabs(score: AtScore, id: string): ImportedTrack[] {
  const out: ImportedTrack[] = [];
  score.tracks.forEach((track, i) => {
    if (track.isPercussion) return;
    const staff = track.staves.find((s) => !s.isPercussion);
    if (!staff) return;
    const title =
      score.tracks.length > 1 ? `${score.title || 'Imported tab'} – ${track.name}` : score.title;
    const tab = staffToTab(title, score.tempo, staff, id);
    if (tab) out.push({ name: track.name || `Track ${i + 1}`, tab });
  });
  return out;
}

/** Read a Guitar Pro or MusicXML file; throws when alphaTab cannot read it. */
export async function importScoreBytes(bytes: Uint8Array, id: string): Promise<ImportedTrack[]> {
  const alphaTab = await import('@coderline/alphatab/core');
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  return scoreToTabs(score as unknown as AtScore, id);
}
