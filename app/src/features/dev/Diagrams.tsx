import {
  cagedChordShape,
  chordSymbol,
  chordQuality,
  chordVoicings,
  formatFrets,
  voicingToShape,
} from '@core/theory/chords/index';
import { arpeggioShape, intervalShape, noteFinderShape } from '@core/theory/extras';
import { parseNote, spelledPc } from '@core/theory/pitch';
import { scalePositionShape, scaleShape } from '@core/theory/scales/index';
import { triadShape, STRING_SETS } from '@core/theory/triads';
import type { Shape } from '@core/theory/types';
import { t } from '@i18n/index';
import type { ColorMode, LabelMode } from '@overlay/display';
import { FlatFretboard } from '@overlay/FlatFretboard';

const pc = (name: string): number => {
  const note = parseNote(name);
  if (!note) throw new Error(`bad note ${name}`);
  return spelledPc(note);
};

const BOX_CHORDS: [string, string][] = [
  ['C', 'maj'],
  ['G', 'maj'],
  ['D', 'maj'],
  ['A', 'min'],
  ['E', 'min'],
  ['F', 'maj'],
  ['B', 'min'],
  ['B', '7'],
  ['C', 'maj7'],
  ['D', 'm7'],
  ['E', '7#9'],
  ['G', '13'],
  ['Bb', 'maj'],
  ['F#', 'm7b5'],
  ['C', '9'],
  ['A', 'sus4'],
];

interface NeckItem {
  shape: Shape;
  note: string;
  labelMode: LabelMode;
  colorMode: ColorMode;
  frets?: number;
  leftHanded?: boolean;
  activeGroups?: string[];
}

function neckItems(): NeckItem[] {
  const position = scalePositionShape(pc('A'), 'minor-pentatonic', 'E');
  return [
    {
      shape: cagedChordShape(pc('C'), 'maj'),
      note: 'five CAGED chord shapes · notes · by shape',
      labelMode: 'notes',
      colorMode: 'group',
    },
    {
      shape: cagedChordShape(pc('A'), 'min'),
      note: 'CAGED chord shapes · intervals · by shape',
      labelMode: 'intervals',
      colorMode: 'group',
    },
    {
      shape: cagedChordShape(pc('G'), '7'),
      note: 'CAGED chord shapes · notes · by degree',
      labelMode: 'notes',
      colorMode: 'degree',
    },
    {
      shape: scaleShape(pc('A'), 'major', 'caged'),
      note: 'CAGED positions · notes · by shape',
      labelMode: 'notes',
      colorMode: 'group',
    },
    {
      shape: scaleShape(pc('A'), 'major', 'caged'),
      note: 'same, E shape highlighted',
      labelMode: 'notes',
      colorMode: 'group',
      activeGroups: ['E'],
    },
    {
      shape: scaleShape(pc('A'), 'minor-pentatonic', 'caged'),
      note: 'CAGED positions · intervals · by degree',
      labelMode: 'intervals',
      colorMode: 'degree',
    },
    ...(position
      ? [
          {
            shape: position,
            note: 'one position · notes · by degree',
            labelMode: 'notes' as const,
            colorMode: 'degree' as const,
          },
        ]
      : []),
    {
      shape: scaleShape(pc('E'), 'blues', 'caged', { maxFret: 22 }),
      note: '22-fret neck · intervals · by shape',
      labelMode: 'intervals',
      colorMode: 'group',
      frets: 22,
    },
    {
      shape: scaleShape(pc('D'), 'dorian', 'neck'),
      note: 'whole neck · notes · by note',
      labelMode: 'notes',
      colorMode: 'note',
    },
    {
      shape: scaleShape(pc('C'), 'major', 'nps', { maxFret: 22 }),
      note: 'three notes per string · notes · by position',
      labelMode: 'notes',
      colorMode: 'group',
      frets: 22,
    },
    {
      shape: scaleShape(pc('A'), 'harmonic-minor', 'caged'),
      note: 'CAGED positions · notes · by shape',
      labelMode: 'notes',
      colorMode: 'group',
    },
    {
      shape: scaleShape(pc('Eb'), 'major', 'caged'),
      note: 'flat key spelling · notes · by shape',
      labelMode: 'notes',
      colorMode: 'group',
    },
    ...STRING_SETS.map((set) => ({
      shape: triadShape(pc('C'), 'maj', set),
      note: `strings ${set} · notes · by inversion`,
      labelMode: 'notes' as const,
      colorMode: 'group' as const,
    })),
    {
      shape: triadShape(pc('A'), 'min', '321'),
      note: 'strings 321 · intervals · by inversion',
      labelMode: 'intervals',
      colorMode: 'group',
    },
    {
      shape: arpeggioShape(pc('C'), 'maj7'),
      note: 'arpeggio · intervals · by degree',
      labelMode: 'intervals',
      colorMode: 'degree',
    },
    {
      shape: intervalShape({ string: 6, fret: 3 }, 12),
      note: 'interval · notes · by degree',
      labelMode: 'notes',
      colorMode: 'degree',
    },
    {
      shape: noteFinderShape(pc('C')),
      note: 'note finder · notes · single colour',
      labelMode: 'notes',
      colorMode: 'single',
    },
    {
      shape: scaleShape(pc('G'), 'major', 'caged'),
      note: 'left-handed · notes · by shape',
      labelMode: 'notes',
      colorMode: 'group',
      leftHanded: true,
    },
    {
      shape: scaleShape(pc('A'), 'minor-pentatonic', 'caged'),
      note: 'no labels · by shape',
      labelMode: 'none',
      colorMode: 'group',
    },
  ];
}

/** Developer route: a contact sheet of generated diagrams for visual review (phase 1 exit gate). */
export function Diagrams() {
  const boxes = BOX_CHORDS.map(([root, qualityId]) => {
    const voicing = chordVoicings(pc(root), qualityId)[0];
    if (!voicing) throw new Error(`no voicing for ${root}${qualityId}`);
    return {
      symbol: chordSymbol(pc(root), chordQuality(qualityId)),
      frets: formatFrets(voicing.frets),
      shape: voicingToShape(pc(root), qualityId, voicing),
    };
  });
  const barre = chordVoicings(pc('F'), 'maj').find((v) => formatFrets(v.frets) === '133211');
  const high = chordVoicings(pc('C'), 'maj').find((v) => formatFrets(v.frets) === '8-10-10-9-8-8');

  return (
    <section className="screen" data-testid="screen-diagrams">
      <h1>{t('diagramsTitle')}</h1>
      <p className="screen__lede">{t('diagramsIntro')}</p>

      <div className="sheet" data-testid="sheet-boxes">
        {boxes.map((box) => (
          <figure key={box.symbol} className="sheet__item">
            <FlatFretboard shape={box.shape} layout="box" />
            <figcaption>{box.symbol}</figcaption>
            <small>{box.frets}</small>
          </figure>
        ))}
        {[barre, high].map((voicing, i) =>
          voicing ? (
            <figure key={i} className="sheet__item">
              <FlatFretboard
                shape={voicingToShape(pc(i === 0 ? 'F' : 'C'), 'maj', voicing)}
                layout="box"
                labelMode="notes"
                colorMode="degree"
                leftHanded={i === 1}
              />
              <figcaption>{i === 0 ? 'F' : 'C'}</figcaption>
              <small>{formatFrets(voicing.frets)}</small>
            </figure>
          ) : null,
        )}
      </div>

      <div className="sheet sheet--wide" data-testid="sheet-necks">
        {neckItems().map((item, i) => (
          <figure key={i} className="sheet__item">
            <figcaption>{item.shape.title}</figcaption>
            <small>{item.note}</small>
            <FlatFretboard
              shape={item.shape}
              labelMode={item.labelMode}
              colorMode={item.colorMode}
              {...(item.frets ? { frets: item.frets } : {})}
              {...(item.leftHanded ? { leftHanded: true } : {})}
              {...(item.activeGroups ? { activeGroups: item.activeGroups } : {})}
            />
          </figure>
        ))}
      </div>
    </section>
  );
}
