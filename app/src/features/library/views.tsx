import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/state/settings';
import {
  cagedChordShape,
  chordVoicings,
  formatFrets,
  hasStandardIntervals,
  voicingToShape,
} from '@core/theory/chords/index';
import { arpeggioShape } from '@core/theory/extras';
import { buildKey, capoSuggestions, type HarmonicRole } from '@core/theory/keys';
import { scaleDef, scaleShape, type ScaleLayout } from '@core/theory/scales/index';
import {
  STRING_SETS,
  triadShape,
  type Inversion,
  type StringSet,
  type TriadQuality,
} from '@core/theory/triads';
import type { PitchClass, Shape, Tuning } from '@core/theory/types';
import { t, type MessageKey } from '@i18n/index';
import { groupColor, type ColorMode, type LabelMode } from '@overlay/display';
import { FlatFretboard } from '@overlay/FlatFretboard';
import { Chip } from '@ui/index';
import { activeGroupIds, chipGroups, hasCagedChordShapes, libraryPath } from './model';

export interface ViewProps {
  root: PitchClass;
  typeId: string;
  tuning: Tuning;
  /** Frets drawn on the neck (15 acoustic/classical, 22 electric). */
  frets: number;
  leftHanded: boolean;
}

/* ---------- shared pieces ---------- */

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="lib-chips">
      <span className="lib-chips__label">{label}</span>
      <div className="row" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

const LABEL_KEYS: Record<LabelMode, MessageKey> = {
  notes: 'labelNotes',
  intervals: 'labelIntervals',
  fingers: 'labelFingers',
  none: 'labelNone',
};
const COLOUR_KEYS: Record<ColorMode, MessageKey> = {
  group: 'colourGroup',
  note: 'colourNote',
  degree: 'colourDegree',
  finger: 'colourFinger',
  single: 'colourSingle',
};

/**
 * Label and colour choices. They are stored as the player's defaults; a kind that cannot show
 * the stored choice (fingers on a scale) falls back without overwriting it.
 */
function useDisplay(labels: LabelMode[], colours: ColorMode[]) {
  const settings = useSettings();
  const labelMode = labels.includes(settings.labelMode) ? settings.labelMode : labels[0]!;
  const colorMode = colours.includes(settings.colorMode) ? settings.colorMode : colours[0]!;
  const controls = (
    <>
      <ChipRow label={t('libLabels')}>
        {labels.map((mode) => (
          <Chip
            key={mode}
            selected={labelMode === mode}
            onToggle={() => settings.update({ labelMode: mode })}
          >
            {t(LABEL_KEYS[mode])}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label={t('libColours')}>
        {colours.map((mode) => (
          <Chip
            key={mode}
            selected={colorMode === mode}
            onToggle={() => settings.update({ colorMode: mode })}
          >
            {t(COLOUR_KEYS[mode])}
          </Chip>
        ))}
      </ChipRow>
    </>
  );
  return { labelMode, colorMode, controls };
}

/** "All shapes" plus one chip per shape; several can be on at once. */
function GroupChips({
  label,
  allLabel,
  shape,
  selected,
  onChange,
  chipLabel,
}: {
  label: string;
  allLabel: string;
  shape: Shape;
  selected: string[];
  onChange: (next: string[]) => void;
  chipLabel: (base: string) => string;
}) {
  const chips = chipGroups(shape.groups.map((g) => g.id));
  if (chips.length < 2) return null;
  return (
    <ChipRow label={label}>
      <Chip selected={selected.length === 0} onToggle={() => onChange([])}>
        {allLabel}
      </Chip>
      {chips.map((base) => (
        <Chip
          key={base}
          swatch={groupColor(base)}
          selected={selected.includes(base)}
          onToggle={(on) =>
            onChange(on ? [...selected, base] : selected.filter((chip) => chip !== base))
          }
        >
          {chipLabel(base)}
        </Chip>
      ))}
    </ChipRow>
  );
}

function Neck({
  shape,
  frets,
  leftHanded,
  labelMode,
  colorMode,
  active,
}: {
  shape: Shape;
  frets: number;
  leftHanded: boolean;
  labelMode: LabelMode;
  colorMode: ColorMode;
  active: string[];
}) {
  return (
    <div className="lib-neck" data-testid="library-neck">
      <FlatFretboard
        shape={shape}
        frets={frets}
        labelMode={labelMode}
        colorMode={colorMode}
        leftHanded={leftHanded}
        activeGroups={activeGroupIds(
          shape.groups.map((g) => g.id),
          active,
        )}
      />
    </div>
  );
}

const shapeLabel = (base: string) => t('libShape', { form: base });

/* ---------- chords ---------- */

export function ChordView({ root, typeId, tuning, frets, leftHanded }: ViewProps) {
  const voicings = useMemo(
    () => chordVoicings(root, typeId, { tuning, maxFret: frets, limit: 8 }),
    [root, typeId, tuning, frets],
  );
  const caged = useMemo(() => {
    if (!hasCagedChordShapes(typeId)) return null;
    const shape = cagedChordShape(root, typeId, { tuning, maxFret: frets });
    return shape.groups.length >= 2 ? shape : null;
  }, [root, typeId, tuning, frets]);
  const [selected, setSelected] = useState<number | null>(null);
  const [forms, setForms] = useState<string[]>([]);
  const { labelMode, colorMode, controls } = useDisplay(
    ['notes', 'intervals', 'fingers'],
    caged ? ['group', 'note', 'degree', 'finger'] : ['degree', 'note', 'finger'],
  );

  const chosen = selected !== null ? voicings[selected] : caged ? undefined : voicings[0];
  const shape = chosen ? voicingToShape(root, typeId, chosen, tuning) : caged;
  if (!shape) return null;
  // A single voicing has no shape groups to colour by.
  const neckColour = chosen && colorMode === 'group' ? 'degree' : colorMode;
  const neckFrets = Math.max(frets, shape.window[1] + 1);

  return (
    <>
      <div className="lib-controls">
        {controls}
        {caged ? (
          <GroupChips
            label={t('libShapes')}
            allLabel={t('libAllShapes')}
            shape={caged}
            selected={chosen ? ['__none__'] : forms}
            onChange={(next) => {
              setSelected(null);
              setForms(next.filter((f) => f !== '__none__'));
            }}
            chipLabel={shapeLabel}
          />
        ) : null}
      </div>
      <Neck
        shape={shape}
        frets={neckFrets}
        leftHanded={leftHanded}
        labelMode={labelMode}
        colorMode={neckColour}
        active={chosen ? [] : forms}
      />
      <section className="lib-section" aria-label={t('libVoicings')}>
        <h3>{t('libVoicings')}</h3>
        <p className="lib-hint">{t('libVoicingsHint')}</p>
        <div className="lib-voicings">
          {voicings.map((voicing, index) => {
            const box = voicingToShape(root, typeId, voicing, tuning);
            const frets = formatFrets(voicing.frets);
            return (
              <button
                key={frets}
                type="button"
                className="lib-voicing"
                aria-pressed={selected === index}
                aria-label={t('libVoicingLabel', { name: box.title, frets })}
                onClick={() => setSelected(selected === index ? null : index)}
              >
                <FlatFretboard shape={box} layout="box" leftHanded={leftHanded} />
                <span className="lib-voicing__frets">{frets}</span>
                {voicing.form ? (
                  <span className="lib-voicing__tag">{shapeLabel(voicing.form)}</span>
                ) : null}
                {voicing.source === 'generated' ? (
                  <span className="lib-voicing__tag" title={t('libGeneratedHint')}>
                    {t('libGenerated')}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ---------- scales ---------- */

export function ScaleView({ root, typeId, tuning, frets, leftHanded }: ViewProps) {
  const scale = scaleDef(typeId);
  const standard = hasStandardIntervals(tuning);
  const layouts: [ScaleLayout, MessageKey][] = [
    ...(standard ? ([['caged', 'libLayoutCaged']] as [ScaleLayout, MessageKey][]) : []),
    ...(standard && scale.degrees.length === 7
      ? ([['nps', 'libLayoutNps']] as [ScaleLayout, MessageKey][])
      : []),
    ['neck', 'libLayoutNeck'],
  ];
  const [chosenLayout, setLayout] = useState<ScaleLayout>('caged');
  const layout = layouts.some(([id]) => id === chosenLayout) ? chosenLayout : layouts[0]![0];
  const [positions, setPositions] = useState<string[]>([]);
  const shape = useMemo(
    () => scaleShape(root, typeId, layout, { tuning, maxFret: frets }),
    [root, typeId, layout, tuning, frets],
  );
  const { labelMode, colorMode, controls } = useDisplay(
    ['notes', 'intervals', 'none'],
    shape.groups.length > 0 ? ['group', 'note', 'degree'] : ['degree', 'note'],
  );

  return (
    <>
      <div className="lib-controls">
        {controls}
        {layouts.length > 1 ? (
          <ChipRow label={t('libLayout')}>
            {layouts.map(([id, key]) => (
              <Chip
                key={id}
                selected={layout === id}
                onToggle={() => {
                  setLayout(id);
                  setPositions([]);
                }}
              >
                {t(key)}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
        <GroupChips
          label={t('libShapes')}
          allLabel={t('libAllShapes')}
          shape={shape}
          selected={positions}
          onChange={setPositions}
          chipLabel={(base) =>
            base.startsWith('nps') ? t('libPosition', { n: base.slice(3) }) : shapeLabel(base)
          }
        />
      </div>
      {!standard ? <p className="lib-hint">{t('libNoCaged')}</p> : null}
      <Neck
        shape={shape}
        frets={frets}
        leftHanded={leftHanded}
        labelMode={labelMode}
        colorMode={colorMode}
        active={positions}
      />
    </>
  );
}

/* ---------- triads ---------- */

const INVERSION_KEYS: Record<Inversion, MessageKey> = {
  root: 'libInvRoot',
  '1st': 'libInvFirst',
  '2nd': 'libInvSecond',
};

export function TriadView({ root, typeId, tuning, frets, leftHanded }: ViewProps) {
  const [stringSet, setStringSet] = useState<StringSet>('321');
  const [inversions, setInversions] = useState<string[]>([]);
  const shape = useMemo(
    () => triadShape(root, typeId as TriadQuality, stringSet, { tuning, maxFret: frets }),
    [root, typeId, stringSet, tuning, frets],
  );
  const { labelMode, colorMode, controls } = useDisplay(
    ['notes', 'intervals', 'none'],
    ['group', 'note', 'degree'],
  );

  return (
    <>
      <div className="lib-controls">
        {controls}
        <ChipRow label={t('libStrings')}>
          {STRING_SETS.map((set) => (
            <Chip key={set} selected={stringSet === set} onToggle={() => setStringSet(set)}>
              {t('libStringSet', { set })}
            </Chip>
          ))}
        </ChipRow>
        <GroupChips
          label={t('libInversions')}
          allLabel={t('libAllInversions')}
          shape={shape}
          selected={inversions}
          onChange={setInversions}
          chipLabel={(base) => t(INVERSION_KEYS[base as Inversion])}
        />
      </div>
      <Neck
        shape={shape}
        frets={frets}
        leftHanded={leftHanded}
        labelMode={labelMode}
        colorMode={colorMode}
        active={inversions}
      />
    </>
  );
}

/* ---------- arpeggios ---------- */

export function ArpeggioView({ root, typeId, tuning, frets, leftHanded }: ViewProps) {
  const [positions, setPositions] = useState<string[]>([]);
  const shape = useMemo(
    () => arpeggioShape(root, typeId, { tuning, maxFret: frets }),
    [root, typeId, tuning, frets],
  );
  const { labelMode, colorMode, controls } = useDisplay(
    ['intervals', 'notes', 'none'],
    shape.groups.length > 0 ? ['group', 'degree', 'note'] : ['degree', 'note'],
  );
  return (
    <>
      <div className="lib-controls">
        {controls}
        <GroupChips
          label={t('libShapes')}
          allLabel={t('libAllShapes')}
          shape={shape}
          selected={positions}
          onChange={setPositions}
          chipLabel={shapeLabel}
        />
      </div>
      <Neck
        shape={shape}
        frets={frets}
        leftHanded={leftHanded}
        labelMode={labelMode}
        colorMode={colorMode}
        active={positions}
      />
    </>
  );
}

/* ---------- keys ---------- */

const ROLE_KEYS: Record<HarmonicRole, MessageKey> = {
  tonic: 'libRoleTonic',
  predominant: 'libRolePredominant',
  dominant: 'libRoleDominant',
};

export function KeyView({ root, typeId, tuning, frets, leftHanded }: ViewProps) {
  const mode = typeId === 'minor' ? 'minor' : 'major';
  const key = useMemo(() => buildKey(root, mode), [root, mode]);
  const [sevenths, setSevenths] = useState(false);
  const [positions, setPositions] = useState<string[]>([]);
  const shape = useMemo(
    () =>
      scaleShape(root, mode, hasStandardIntervals(tuning) ? 'caged' : 'neck', {
        tuning,
        maxFret: frets,
      }),
    [root, mode, tuning, frets],
  );
  const { labelMode, colorMode, controls } = useDisplay(
    ['notes', 'intervals', 'none'],
    shape.groups.length > 0 ? ['group', 'note', 'degree'] : ['degree', 'note'],
  );
  const capo = capoSuggestions(root, mode).slice(0, 3);
  const chords = sevenths ? key.sevenths : key.triads;

  return (
    <>
      <section className="lib-section" aria-label={t('libChords')}>
        <div className="lib-section__head">
          <h3>{t('libChords')}</h3>
          <div className="row" role="group" aria-label={t('libChords')}>
            <Chip selected={!sevenths} onToggle={() => setSevenths(false)}>
              {t('libTriadsToggle')}
            </Chip>
            <Chip selected={sevenths} onToggle={() => setSevenths(true)}>
              {t('libSevenths')}
            </Chip>
          </div>
        </div>
        <ol className="lib-key-chords">
          {chords.map((chord) => {
            const voicing = chordVoicings(chord.root, chord.quality.id, { tuning, limit: 1 })[0];
            return (
              <li key={chord.step}>
                <Link
                  className={`lib-key-chord lib-key-chord--${chord.role}`}
                  to={libraryPath('chord', chord.root, chord.quality.id)}
                >
                  <span className="lib-key-chord__numeral">{chord.numeral}</span>
                  <span className="lib-key-chord__symbol">{chord.symbol}</span>
                  <span className="lib-key-chord__role">{t(ROLE_KEYS[chord.role])}</span>
                  {voicing ? (
                    <span className="lib-key-chord__box">
                      <FlatFretboard
                        shape={voicingToShape(chord.root, chord.quality.id, voicing, tuning)}
                        layout="box"
                        leftHanded={leftHanded}
                      />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ol>
        {capo.length > 0 ? (
          <p className="lib-hint">
            <strong>{t('libCapo')}: </strong>
            {capo
              .map((c) =>
                c.capo === 0
                  ? t('libCapoNone', { shapes: c.shapesOf })
                  : t('libCapoLine', { capo: c.capo, shapes: c.shapesOf }),
              )
              .join(' · ')}
          </p>
        ) : null}
      </section>
      <div className="lib-controls">
        {controls}
        <GroupChips
          label={t('libShapes')}
          allLabel={t('libAllShapes')}
          shape={shape}
          selected={positions}
          onChange={setPositions}
          chipLabel={shapeLabel}
        />
      </div>
      <Neck
        shape={shape}
        frets={frets}
        leftHanded={leftHanded}
        labelMode={labelMode}
        colorMode={colorMode}
        active={positions}
      />
    </>
  );
}
