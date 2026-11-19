/**
 * Flat fretboard diagram (docs/phases/phase-01-theory-engine.md task 1.8).
 * Draws any `Shape` either along the neck ("neck") or as a vertical chord box ("box").
 * The camera overlay (Phase 3) draws the same shapes with the same label and colour rules.
 */
import { INLAY_FRETS, isDoubleInlay } from '@core/guitar/instrument';
import { describeShape } from '@core/theory/shape';
import type { Mark, Shape } from '@core/theory/types';
import { isActive, markColors, markLabel, type ColorMode, type LabelMode } from './display';
import './fretboard.css';

export interface FlatFretboardProps {
  shape: Shape;
  layout?: 'neck' | 'box';
  /** Highest fret drawn in the neck layout. Default 15. */
  frets?: number;
  strings?: number;
  labelMode?: LabelMode;
  colorMode?: ColorMode;
  /** Mirror the diagram for left-handed players. */
  leftHanded?: boolean;
  /** Groups to emphasise; marks outside them are dimmed. */
  activeGroups?: readonly string[];
  /** Dots sounding right now ("string-fret" keys): drawn with a bright pulse ring. */
  pulse?: ReadonlySet<string>;
  /** Tab play-along (neck layout): notes coming up, as rings sliding in from the bridge side. */
  approach?: readonly { string: number; fret: number; lead: number }[];
}

interface DotProps {
  x: number;
  y: number;
  r: number;
  mark: Mark;
  labelMode: LabelMode;
  colorMode: ColorMode;
  dim: boolean;
  pulse?: boolean;
}

/** One note: a filled dot (split in two colours when it belongs to two groups), ring on roots, label. */
function Dot({ x, y, r, mark, labelMode, colorMode, dim, pulse }: DotProps) {
  const colors = markColors(mark, colorMode);
  const label = markLabel(mark, labelMode);
  const classes = [
    'fretboard__mark',
    mark.role === 'ghost' ? 'fretboard__mark--ghost' : '',
    dim ? 'fretboard__mark--dim' : '',
    pulse ? 'fretboard__mark--pulse' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const fontSize = label.length >= 3 ? r * 0.82 : label.length === 2 ? r * 1.0 : r * 1.18;
  return (
    <g className={classes} data-string={mark.string} data-fret={mark.fret} data-role={mark.role}>
      {colors.length === 2 ? (
        <>
          <path d={`M ${x} ${y - r} A ${r} ${r} 0 0 0 ${x} ${y + r} Z`} fill={colors[0]} />
          <path d={`M ${x} ${y - r} A ${r} ${r} 0 0 1 ${x} ${y + r} Z`} fill={colors[1]} />
        </>
      ) : (
        <circle cx={x} cy={y} r={r} fill={colors[0]} />
      )}
      <circle className="fretboard__dot-outline" cx={x} cy={y} r={r} />
      {mark.role === 'root' ? (
        <>
          <circle className="fretboard__ring-shadow" cx={x} cy={y} r={r + 2.5} />
          <circle className="fretboard__ring" cx={x} cy={y} r={r + 2.5} />
        </>
      ) : null}
      {pulse ? <circle className="fretboard__pulse" cx={x} cy={y} r={r + 4} /> : null}
      {label ? (
        <text className="fretboard__label" x={x} y={y} fontSize={fontSize}>
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Frets where one finger holds several strings: drawn as a bar behind the dots. */
export function barres(
  marks: readonly Mark[],
): { finger: number; fret: number; from: number; to: number }[] {
  const byFinger = new Map<string, Mark[]>();
  for (const mark of marks) {
    if (typeof mark.finger !== 'number' || mark.finger === 0 || mark.fret === 0) continue;
    const key = `${mark.finger}:${mark.fret}`;
    byFinger.set(key, [...(byFinger.get(key) ?? []), mark]);
  }
  return [...byFinger.values()]
    .filter((group) => group.length >= 2)
    .map((group) => ({
      finger: group[0]?.finger as number,
      fret: group[0]?.fret ?? 0,
      from: Math.max(...group.map((m) => m.string)),
      to: Math.min(...group.map((m) => m.string)),
    }));
}

function Cross({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g className="fretboard__muted">
      <line x1={x - size} y1={y - size} x2={x + size} y2={y + size} />
      <line x1={x - size} y1={y + size} x2={x + size} y2={y - size} />
    </g>
  );
}

function NeckDiagram({
  shape,
  frets = 15,
  strings = 6,
  labelMode = 'notes',
  colorMode = 'group',
  leftHanded = false,
  activeGroups,
  pulse,
  approach,
}: FlatFretboardProps) {
  const fretW = 56;
  const stringH = 26;
  const padLeft = 44; // room for open-string markers
  const padRight = 14;
  const padTop = 18;
  const padBottom = 28; // fret numbers
  const width = padLeft + frets * fretW + padRight;
  const boardH = (strings - 1) * stringH;
  const height = padTop + boardH + padBottom;
  const r = stringH * 0.44;

  const flip = (x: number) => (leftHanded ? width - x : x);
  const wireX = (fret: number) => flip(padLeft + fret * fretW);
  const rawNoteX = (fret: number) =>
    fret === 0 ? padLeft - 22 : padLeft + (fret - 1) * fretW + fretW * 0.62;
  const noteX = (fret: number) => flip(rawNoteX(fret));
  const stringY = (s: number) => padTop + (s - 1) * stringH; // string 1 (high e) on top, like tab
  const midY = padTop + boardH / 2;

  const boardX = Math.min(wireX(0), wireX(frets));
  return (
    <svg
      className="fretboard fretboard--neck"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={describeShape(shape)}
    >
      <rect
        className="fretboard__board"
        x={boardX}
        y={padTop - 6}
        width={frets * fretW}
        height={boardH + 12}
        rx="3"
      />
      {INLAY_FRETS.filter((fret) => fret <= frets).map((fret) => {
        const x = (wireX(fret - 1) + wireX(fret)) / 2;
        return isDoubleInlay(fret) ? (
          <g key={fret} className="fretboard__inlay">
            <circle cx={x} cy={midY - stringH} r="5" />
            <circle cx={x} cy={midY + stringH} r="5" />
          </g>
        ) : (
          <circle key={fret} className="fretboard__inlay" cx={x} cy={midY} r="5" />
        );
      })}
      {Array.from({ length: frets }, (_, i) => i + 1).map((fret) => (
        <line
          key={fret}
          className="fretboard__fret"
          x1={wireX(fret)}
          x2={wireX(fret)}
          y1={padTop - 6}
          y2={padTop + boardH + 6}
        />
      ))}
      <line
        className="fretboard__nut"
        x1={wireX(0)}
        x2={wireX(0)}
        y1={padTop - 6}
        y2={padTop + boardH + 6}
      />
      {Array.from({ length: strings }, (_, i) => i + 1).map((s) => (
        <line
          key={s}
          className="fretboard__string"
          x1={Math.min(wireX(0), wireX(frets))}
          x2={Math.max(wireX(0), wireX(frets))}
          y1={stringY(s)}
          y2={stringY(s)}
          strokeWidth={1 + (s - 1) * 0.35}
        />
      ))}
      {Array.from({ length: frets }, (_, i) => i + 1).map((fret) => (
        <text
          key={fret}
          className="fretboard__number"
          x={(wireX(fret - 1) + wireX(fret)) / 2}
          y={height - 8}
        >
          {fret}
        </text>
      ))}
      {shape.muted.map((s) => (
        <Cross key={s} x={noteX(0)} y={stringY(s)} size={6} />
      ))}
      {shape.marks
        .filter((mark) => mark.fret <= frets && mark.string <= strings)
        .map((mark) => (
          <Dot
            key={`${mark.string}:${mark.fret}`}
            x={noteX(mark.fret)}
            y={stringY(mark.string)}
            r={r}
            mark={mark}
            labelMode={labelMode}
            colorMode={colorMode}
            dim={!isActive(mark, activeGroups)}
            pulse={pulse?.has(`${mark.string}-${mark.fret}`) ?? false}
          />
        ))}
      {approach
        ?.filter((a) => a.fret <= frets && a.string <= strings)
        .map((a, i) => (
          <circle
            key={`a${i}`}
            className="fretboard__approach"
            data-testid="fretboard-approach"
            cx={flip(rawNoteX(a.fret) + a.lead * fretW * 1.5)}
            cy={stringY(a.string)}
            r={r * (1 + a.lead)}
            opacity={0.35 + 0.65 * (1 - a.lead)}
          />
        ))}
    </svg>
  );
}

function BoxDiagram({
  shape,
  strings = 6,
  labelMode = 'fingers',
  colorMode = 'degree',
  leftHanded = false,
  activeGroups,
  pulse,
}: FlatFretboardProps) {
  const rows = 5;
  const stringW = 30;
  const fretH = 38;
  const padSide = 34;
  const padTop = 34; // open / muted markers
  const padBottom = 12;
  const width = padSide * 2 + (strings - 1) * stringW;
  const height = padTop + rows * fretH + padBottom;
  const r = stringW * 0.4;

  // Show the nut when the shape lives in the first five frets; otherwise start at its lowest fret.
  const [low, high] = shape.window;
  const start = high <= rows ? 1 : low;
  const stringX = (s: number) => {
    const x = padSide + (strings - s) * stringW; // low string on the left
    return leftHanded ? width - x : x;
  };
  const wireY = (row: number) => padTop + row * fretH;
  const noteY = (fret: number) => padTop + (fret - start) * fretH + fretH * 0.56;

  return (
    <svg
      className="fretboard fretboard--box"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={describeShape(shape)}
    >
      <rect
        className="fretboard__board"
        x={padSide}
        y={padTop}
        width={(strings - 1) * stringW}
        height={rows * fretH}
      />
      {Array.from({ length: rows }, (_, i) => i + 1).map((row) => (
        <line
          key={row}
          className="fretboard__fret"
          x1={padSide}
          x2={padSide + (strings - 1) * stringW}
          y1={wireY(row)}
          y2={wireY(row)}
        />
      ))}
      {start === 1 ? (
        <line
          className="fretboard__nut"
          x1={padSide - 1}
          x2={padSide + (strings - 1) * stringW + 1}
          y1={wireY(0)}
          y2={wireY(0)}
        />
      ) : (
        <>
          <line
            className="fretboard__fret"
            x1={padSide}
            x2={padSide + (strings - 1) * stringW}
            y1={wireY(0)}
            y2={wireY(0)}
          />
          <text
            className="fretboard__position"
            x={leftHanded ? width - 4 : 4}
            y={noteY(start)}
            textAnchor={leftHanded ? 'end' : 'start'}
            data-testid="box-position"
          >
            {start}
          </text>
        </>
      )}
      {Array.from({ length: strings }, (_, i) => i + 1).map((s) => (
        <line
          key={s}
          className="fretboard__string"
          x1={stringX(s)}
          x2={stringX(s)}
          y1={padTop}
          y2={padTop + rows * fretH}
          strokeWidth={1 + (s - 1) * 0.35}
        />
      ))}
      {shape.muted.map((s) => (
        <Cross key={s} x={stringX(s)} y={padTop - 16} size={5.5} />
      ))}
      {barres(shape.marks)
        .filter((barre) => barre.fret >= start && barre.fret < start + rows)
        .map((barre) => (
          <line
            key={`${barre.finger}:${barre.fret}`}
            className="fretboard__barre"
            x1={stringX(barre.from)}
            x2={stringX(barre.to)}
            y1={noteY(barre.fret)}
            y2={noteY(barre.fret)}
            strokeWidth={r * 1.5}
          />
        ))}
      {shape.marks
        .filter((mark) => mark.string <= strings)
        .map((mark) =>
          mark.fret === 0 ? (
            <circle
              key={`${mark.string}:0`}
              className="fretboard__open"
              cx={stringX(mark.string)}
              cy={padTop - 16}
              r="6.5"
              data-string={mark.string}
              data-fret="0"
            />
          ) : mark.fret >= start && mark.fret < start + rows ? (
            <Dot
              key={`${mark.string}:${mark.fret}`}
              x={stringX(mark.string)}
              y={noteY(mark.fret)}
              r={r}
              mark={mark}
              labelMode={labelMode}
              colorMode={colorMode}
              dim={!isActive(mark, activeGroups)}
              pulse={pulse?.has(`${mark.string}-${mark.fret}`) ?? false}
            />
          ) : null,
        )}
    </svg>
  );
}

export function FlatFretboard(props: FlatFretboardProps) {
  return props.layout === 'box' ? <BoxDiagram {...props} /> : <NeckDiagram {...props} />;
}
