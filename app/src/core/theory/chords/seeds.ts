/**
 * Hand-authored chord voicings with fingerings, written for standard-interval tunings
 * (docs/specs/03-theory-content.md §2). Notation is low string → high string, as on chord charts.
 *
 * `open: true` shapes use open strings and exist only at their own root.
 * Every shape may also be moved up the neck: the open strings then become a barre
 * (that is how the CAGED barre chords arise), unless `movable: false`.
 */
import type { Finger } from '../types';
import { parseFingers, parseFrets, type CagedForm } from './voicing';

export interface SeedVoicing {
  /** Root note name in standard tuning, e.g. "C", "F#", "Bb". */
  root: string;
  quality: string;
  frets: number[];
  fingers: Finger[];
  /** CAGED family of the shape, when it is one of the five forms. */
  form?: CagedForm;
  /** False for shapes that only make sense in open position. */
  movable: boolean;
  /**
   * Shape to use when moved up the neck, if it differs from the open one
   * (typically an open top string that cannot be reached by the barre is dropped).
   */
  movedFrets?: number[];
}

const seed = (
  root: string,
  quality: string,
  frets: string,
  fingers: string,
  options: { form?: CagedForm; movable?: boolean; moved?: string } = {},
): SeedVoicing => {
  const parsedFrets = parseFrets(frets);
  const parsedFingers = parseFingers(fingers);
  if (parsedFrets.length !== 6 || parsedFingers.length !== 6)
    throw new Error(`seed ${root}${quality} "${frets}" must describe six strings`);
  const voicing: SeedVoicing = {
    root,
    quality,
    frets: parsedFrets,
    fingers: parsedFingers,
    movable: options.movable ?? true,
  };
  if (options.form) voicing.form = options.form;
  if (options.moved) voicing.movedFrets = parseFrets(options.moved);
  return voicing;
};

export const SEED_VOICINGS: SeedVoicing[] = [
  // ----- Major: the five CAGED forms in open position -----
  seed('C', 'maj', 'x32010', 'x32010', { form: 'C' }),
  seed('A', 'maj', 'x02220', 'x01230', { form: 'A' }),
  seed('G', 'maj', '320003', '210003', { form: 'G' }),
  seed('E', 'maj', '022100', '023100', { form: 'E' }),
  seed('D', 'maj', 'xx0232', 'xx0132', { form: 'D' }),
  seed('F', 'maj', 'xx3211', 'xx3211', { movable: false }),
  seed('G', 'maj', '320033', '210034', { movable: false }),

  // ----- Minor -----
  seed('C', 'min', 'x310xx', 'x310xx', { form: 'C' }),
  seed('A', 'min', 'x02210', 'x02310', { form: 'A' }),
  seed('G', 'min', '310033', '210034', { form: 'G' }),
  seed('E', 'min', '022000', '023000', { form: 'E' }),
  seed('D', 'min', 'xx0231', 'xx0231', { form: 'D' }),

  // ----- Dominant seventh -----
  seed('C', '7', 'x32310', 'x32410', { form: 'C', moved: 'x3231x' }),
  seed('A', '7', 'x02020', 'x02030', { form: 'A' }),
  seed('G', '7', '320001', '320001', { form: 'G' }),
  seed('E', '7', '020100', '020100', { form: 'E' }),
  seed('D', '7', 'xx0212', 'xx0213', { form: 'D' }),
  seed('B', '7', 'x21202', 'x21304', { movable: false }),

  // ----- Major seventh -----
  seed('C', 'maj7', 'x32000', 'x32000', { form: 'C' }),
  seed('A', 'maj7', 'x02120', 'x02130', { form: 'A' }),
  seed('G', 'maj7', '320002', '310002', { form: 'G' }),
  seed('E', 'maj7', '021100', '031200', { form: 'E' }),
  seed('D', 'maj7', 'xx0222', 'xx0111', { form: 'D' }),
  seed('F', 'maj7', 'xx3210', 'xx3210', { movable: false }),

  // ----- Minor seventh -----
  seed('C', 'm7', 'x3131x', 'x3141x', { form: 'C' }),
  seed('A', 'm7', 'x02010', 'x02010', { form: 'A' }),
  seed('G', 'm7', '310031', '310042', { form: 'G', movable: false }),
  seed('E', 'm7', '020000', '020000', { form: 'E' }),
  seed('D', 'm7', 'xx0211', 'xx0211', { form: 'D' }),
  seed('E', 'm7', '022030', '023040', { movable: false }),

  // ----- Suspended -----
  seed('A', 'sus2', 'x02200', 'x02300'),
  seed('D', 'sus2', 'xx0230', 'xx0130'),
  seed('A', 'sus4', 'x02230', 'x01230'),
  seed('D', 'sus4', 'xx0233', 'xx0134'),
  seed('E', 'sus4', '022200', '023400'),
  seed('A', '7sus4', 'x02030', 'x02030'),
  seed('D', '7sus4', 'xx0213', 'xx0213'),
  seed('E', '7sus4', '020200', '020300'),

  // ----- Power chords (movable two- and three-string shapes) -----
  seed('E', '5', '022xxx', '011xxx'),
  seed('A', '5', 'x022xx', 'x011xx'),
  seed('D', '5', 'xx023x', 'xx013x'),

  // ----- Sixths -----
  seed('C', '6', 'x32210', 'x42310'),
  seed('A', '6', 'x02222', 'x01111'),
  seed('G', '6', '320000', '320000'),
  seed('E', '6', '022120', '023140'),
  seed('D', '6', 'xx0202', 'xx0102'),
  seed('A', 'm6', 'x02212', 'x02314'),
  seed('E', 'm6', '022020', '012030'),
  seed('D', 'm6', 'xx0201', 'xx0201'),

  // ----- Added ninth -----
  seed('C', 'add9', 'x32030', 'x21030'),
  seed('G', 'add9', '320203', '310204', { movable: false }),
  seed('A', 'add9', 'x02420', 'x01320', { movable: false }),
  seed('E', 'add9', '024100', '024100', { movable: false }),
  seed('A', 'madd9', 'x02410', 'x02410', { movable: false }),
  seed('E', 'madd9', '024000', '013000', { movable: false }),

  // ----- Diminished and augmented -----
  seed('A', 'dim', 'x0121x', 'x0132x'),
  seed('D', 'dim', 'xx0131', 'xx0132'),
  seed('B', 'dim7', 'x2313x', 'x2314x'),
  seed('D', 'dim7', 'xx0101', 'xx0102'),
  seed('B', 'm7b5', 'x2323x', 'x1213x'),
  seed('F#', 'm7b5', '2x221x', '2x341x'),
  seed('C', 'aug', 'x32110', 'x43120'),
  seed('E', 'aug', '032110', '043120'),
  seed('A', 'aug', 'x03221', 'x04231'),

  // ----- Extended and altered (movable jazz and funk shapes) -----
  seed('C', '9', 'x3233x', 'x2134x'),
  seed('E', '9', '020102', '020103', { movable: false }),
  seed('C', 'maj9', 'x3243x', 'x2143x'),
  seed('A', 'maj9', 'x02424', 'x01314', { movable: false }),
  seed('D', 'm9', 'x5355x', 'x2134x'),
  seed('E', 'm9', '020002', '020003', { movable: false }),
  seed('C', '7#9', 'x3234x', 'x2134x'),
  seed('E', '7#9', '020103', '020103', { movable: false }),
  seed('C', '7b9', 'x3232x', 'x2131x'),
  seed('A', 'mMaj7', 'x02110', 'x03120'),
  seed('E', 'mMaj7', '021000', '021000'),
  seed('C', '6/9', 'x3223x', 'x2113x'),
  seed('G', '13', '3x345x', '1x123x'),
  seed('A', '13', 'x02022', 'x01023', { movable: false }),
  seed('G', '11', '3x321x', '3x421x'),
  seed('A', '11', 'x00000', 'x00000', { movable: false }),
];
