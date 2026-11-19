/** The six-line tab grid: bars wrap like a printed tab; each beat is a column of string cells. */
import { memo, useMemo } from 'react';
import { durationToken, noteToken } from '@core/tab/ascii';
import type { Cursor } from '@core/tab/edit';
import { TPQ, type Bar, type Tab } from '@core/tab/model';
import { t } from '@i18n/index';
import type { Playhead } from './useTabPlayback';

const STRING_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const stringName = (tab: Tab, s: number) => {
  const name = STRING_NAMES[(((tab.tuning[s - 1] ?? 0) % 12) + 12) % 12]!;
  return s === 1 ? name.toLowerCase() : name;
};

/** Column width grows gently with the note length. */
const colWidth = (ticks: number) =>
  `${(1.8 + 0.35 * Math.log2(Math.max(1, ticks / (TPQ / 8)))).toFixed(2)}em`;

interface BarProps {
  names: readonly string[];
  timeSig: Tab['timeSig'];
  bar: Bar;
  index: number;
  fill: number;
  cursor: Cursor | null;
  playBeat: number | null;
  onPick: (c: Cursor) => void;
  onChord: (bar: number, symbol: string) => void;
}

const TabBar = memo(function TabBar({
  names,
  timeSig,
  bar,
  index,
  fill,
  cursor,
  playBeat,
  onPick,
  onChord,
}: BarProps) {
  const strings = names.length;
  const beatUnits = (TPQ * 4) / timeSig[1];
  const wantTicks = timeSig[0] * beatUnits;
  const diffBeats = Math.abs(1 - fill) * (wantTicks / beatUnits);
  return (
    <div className="tabbar" data-testid="tab-bar">
      <input
        className="tabbar__chord"
        aria-label={t('tabChordLabel', { bar: index + 1 })}
        defaultValue={bar.chordSymbol ?? ''}
        key={bar.chordSymbol ?? ''}
        maxLength={16}
        placeholder="·"
        onBlur={(e) => {
          if (e.target.value.trim() !== (bar.chordSymbol ?? '')) onChord(index, e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <div className="tabbar__body">
        <div className="tabbar__names" aria-hidden="true">
          {names.map((name, i) => (
            <span key={i}>{name}</span>
          ))}
          <span className="tabbar__num">{index + 1}</span>
        </div>
        {bar.beats.map((beat, b) => {
          const here = cursor?.beat === b;
          return (
            <div
              key={b}
              className={`tabcol${here ? ' is-col' : ''}${playBeat === b ? ' is-playing' : ''}`}
              style={{ width: colWidth(beat.durTicks) }}
              data-testid="tab-col"
            >
              {Array.from({ length: strings }, (_, i) => {
                const s = i + 1;
                const note = beat.notes.find((n) => n.string === s);
                const isCursor = here && cursor?.string === s;
                return (
                  <div
                    key={s}
                    id={isCursor ? 'tab-cursor' : undefined}
                    className={`tabcell${isCursor ? ' is-cursor' : ''}${note?.tech === 'pm' ? ' is-pm' : ''}`}
                    data-testid={`tab-cell-${index}-${b}-${s}`}
                    onPointerDown={(e) => {
                      e.preventDefault(); // keep focus on the grid
                      onPick({ bar: index, beat: b, string: s });
                    }}
                  >
                    {note ? <span className="tabcell__note">{noteToken(note)}</span> : null}
                  </div>
                );
              })}
              <div className="tabcol__dur" aria-hidden="true">
                {durationToken(beat.durTicks)}
              </div>
            </div>
          );
        })}
      </div>
      {Math.abs(fill - 1) > 1e-6 ? (
        <p className={`tabbar__fill ${fill < 1 ? 'is-short' : 'is-long'}`}>
          {t(fill < 1 ? 'tabBarShort' : 'tabBarLong', {
            bar: index + 1,
            beats: Math.round(diffBeats * 100) / 100,
          })}
        </p>
      ) : null}
    </div>
  );
});

export function TabGrid({
  tab,
  cursor,
  fills,
  head,
  onPick,
  onChord,
}: {
  tab: Tab;
  cursor: Cursor;
  fills: number[];
  head: Playhead | null;
  onPick: (c: Cursor) => void;
  onChord: (bar: number, symbol: string) => void;
}) {
  const names = useMemo(
    () => tab.tuning.map((_, i) => stringName(tab, i + 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.tuning],
  );
  return (
    <div className="tabgrid">
      <div className="tabgrid__bars">
        {(tab.tracks[0]?.bars ?? []).map((bar, i) => (
          <TabBar
            key={i}
            names={names}
            timeSig={tab.timeSig}
            bar={bar}
            index={i}
            fill={fills[i] ?? 1}
            cursor={cursor.bar === i ? cursor : null}
            playBeat={head?.bar === i ? head.beat : null}
            onPick={onPick}
            onChord={onChord}
          />
        ))}
      </div>
    </div>
  );
}
