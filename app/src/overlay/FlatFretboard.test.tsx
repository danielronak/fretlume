// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { chordVoicings, voicingToShape } from '@core/theory/chords/index';
import { scaleShape } from '@core/theory/scales/index';
import { triadShape } from '@core/theory/triads';
import { groupColor, isActive, markColors, markLabel } from './display';
import { FlatFretboard } from './FlatFretboard';

afterEach(cleanup);

const cMajor = voicingToShape(0, 'maj', chordVoicings(0, 'maj')[0]!); // x32010
const fMajorBarre = voicingToShape(
  5,
  'maj',
  chordVoicings(5, 'maj').find((v) => v.frets.every((f) => f > 0))!,
);

describe('display rules', () => {
  const root = cMajor.marks.find((m) => m.string === 5)!;
  const third = cMajor.marks.find((m) => m.string === 4)!;

  it('labels by note, interval or finger', () => {
    expect(markLabel(root, 'notes')).toBe('C');
    expect(markLabel(third, 'intervals')).toBe('3');
    expect(markLabel(root, 'fingers')).toBe('3');
    expect(
      markLabel(
        cMajor.marks.find((m) => m.fret === 0)!,
        'fingers',
      ),
    ).toBe('');
    expect(markLabel(root, 'none')).toBe('');
  });

  it('colours by group, note, degree or finger', () => {
    expect(markColors(root, 'degree')).toEqual(['var(--deg-root)']);
    expect(markColors(third, 'degree')).toEqual(['var(--deg-third)']);
    expect(markColors(root, 'note')).toEqual(['var(--note-0)']);
    expect(markColors(root, 'finger')).toEqual(['var(--finger-3)']);
    expect(markColors(root, 'group')).toEqual(['var(--shape-c)']); // the open C chord is the C shape
    expect(groupColor('E+12')).toBe('var(--shape-e)');
    expect(groupColor('1st')).toBe('var(--inv-first)');
  });

  it('gives shared notes two colours', () => {
    const scale = scaleShape(9, 'major', 'caged');
    const shared = scale.marks.find((m) => m.groups.length === 2)!;
    expect(markColors(shared, 'group')).toHaveLength(2);
    expect(isActive(shared, [shared.groups[0]!])).toBe(true);
    expect(isActive(shared, ['nope'])).toBe(false);
    expect(isActive(shared, undefined)).toBe(true);
  });
});

describe('<FlatFretboard> neck layout', () => {
  it('draws one dot per mark at the right string and fret, with an accessible description', () => {
    const { container } = render(<FlatFretboard shape={cMajor} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('C major: string 5 fret 3 C');
    expect(svg.getAttribute('aria-label')).toContain('muted strings 6');
    const dots = [...container.querySelectorAll('.fretboard__mark')];
    expect(
      dots.map((d) => `${d.getAttribute('data-string')}:${d.getAttribute('data-fret')}`),
    ).toEqual(cMajor.marks.map((m) => `${m.string}:${m.fret}`));
    expect(container.querySelectorAll('.fretboard__muted')).toHaveLength(1);
    expect(container.querySelectorAll('.fretboard__ring')).toHaveLength(2); // two C notes
  });

  it('places notes between the right fret wires and higher strings above lower ones', () => {
    const { container } = render(<FlatFretboard shape={cMajor} labelMode="none" />);
    const wires = [...container.querySelectorAll('.fretboard__fret')].map((l) =>
      Number(l.getAttribute('x1')),
    );
    const nut = Number(container.querySelector('.fretboard__nut')!.getAttribute('x1'));
    const dot = (s: number) => {
      const g = container.querySelector(`.fretboard__mark[data-string="${s}"]`)!;
      const c = g.querySelector('circle')!;
      return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) };
    };
    // String 5 fret 3: between wire 2 and wire 3. String 2 fret 1: between the nut and wire 1.
    expect(dot(5).x).toBeGreaterThan(wires[1]!);
    expect(dot(5).x).toBeLessThan(wires[2]!);
    expect(dot(2).x).toBeGreaterThan(nut);
    expect(dot(2).x).toBeLessThan(wires[0]!);
    // Open strings sit behind the nut.
    expect(dot(3).x).toBeLessThan(nut);
    expect(dot(2).y).toBeLessThan(dot(5).y);
  });

  it('mirrors for left-handed players', () => {
    const right = render(<FlatFretboard shape={cMajor} />);
    const rightX = Number(
      right.container.querySelector('.fretboard__mark[data-string="5"] circle')!.getAttribute('cx'),
    );
    const rightNut = Number(right.container.querySelector('.fretboard__nut')!.getAttribute('x1'));
    cleanup();
    const left = render(<FlatFretboard shape={cMajor} leftHanded />);
    const leftX = Number(
      left.container.querySelector('.fretboard__mark[data-string="5"] circle')!.getAttribute('cx'),
    );
    const leftNut = Number(left.container.querySelector('.fretboard__nut')!.getAttribute('x1'));
    expect(rightX).toBeGreaterThan(rightNut);
    expect(leftX).toBeLessThan(leftNut);
  });

  it('shows labels, split dots and dimming', () => {
    const scale = scaleShape(9, 'major', 'caged');
    const { container } = render(
      <FlatFretboard shape={scale} labelMode="notes" activeGroups={['E']} />,
    );
    const labels = new Set(
      [...container.querySelectorAll('.fretboard__label')].map((n) => n.textContent),
    );
    expect(labels).toEqual(new Set(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']));
    expect(container.querySelectorAll('.fretboard__mark path').length).toBeGreaterThan(0); // split dots
    const dimmed = container.querySelectorAll('.fretboard__mark--dim').length;
    expect(dimmed).toBeGreaterThan(0);
    expect(dimmed).toBeLessThan(scale.marks.length);
  });

  it('draws the requested number of frets and strings', () => {
    const { container } = render(<FlatFretboard shape={triadShape(0, 'maj', '321')} frets={12} />);
    expect(container.querySelectorAll('.fretboard__fret')).toHaveLength(12);
    expect(container.querySelectorAll('.fretboard__string')).toHaveLength(6);
    expect(container.querySelectorAll('.fretboard__number')).toHaveLength(12);
  });
});

describe('<FlatFretboard> box layout', () => {
  it('shows open and muted strings above the nut and finger numbers on the dots', () => {
    const { container } = render(<FlatFretboard shape={cMajor} layout="box" />);
    expect(container.querySelector('.fretboard__nut')).not.toBeNull();
    expect(container.querySelectorAll('.fretboard__open')).toHaveLength(2);
    expect(container.querySelectorAll('.fretboard__muted')).toHaveLength(1);
    const labels = [...container.querySelectorAll('.fretboard__label')]
      .map((n) => n.textContent)
      .sort();
    expect(labels).toEqual(['1', '2', '3']);
  });

  it('puts the low string on the left and lower frets nearer the top', () => {
    const { container } = render(<FlatFretboard shape={cMajor} layout="box" />);
    const at = (s: number) => {
      const c = container.querySelector(`.fretboard__mark[data-string="${s}"] circle`)!;
      return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) };
    };
    expect(at(5).x).toBeLessThan(at(4).x);
    expect(at(4).x).toBeLessThan(at(2).x);
    expect(at(2).y).toBeLessThan(at(4).y); // fret 1 above fret 2
    expect(at(4).y).toBeLessThan(at(5).y); // fret 2 above fret 3
  });

  it('labels the starting fret instead of drawing a nut for shapes up the neck', () => {
    const high = voicingToShape(
      0,
      'maj',
      chordVoicings(0, 'maj').find((v) => Math.min(...v.frets.filter((f) => f > 0)) === 8)!,
    );
    const { container, getByTestId } = render(<FlatFretboard shape={high} layout="box" />);
    expect(container.querySelector('.fretboard__nut')).toBeNull();
    expect(getByTestId('box-position').textContent).toBe('8');
    expect(container.querySelectorAll('.fretboard__mark')).toHaveLength(high.marks.length);
  });

  it('keeps a first-fret barre chord at the nut', () => {
    const { container } = render(<FlatFretboard shape={fMajorBarre} layout="box" />);
    expect(container.querySelector('.fretboard__nut')).not.toBeNull();
    expect(container.querySelectorAll('.fretboard__mark')).toHaveLength(6);
  });
});
