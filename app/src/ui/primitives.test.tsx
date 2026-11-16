// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Chip, Tabs, Toggle } from './index';

afterEach(cleanup);

describe('Toggle', () => {
  it('is a switch that reports the next state', () => {
    const onChange = vi.fn();
    render(<Toggle label="Mirror camera" checked={false} onChange={onChange} />);
    const el = screen.getByRole('switch', { name: 'Mirror camera' });
    expect(el.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(el);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Chip', () => {
  it('exposes pressed state', () => {
    const onToggle = vi.fn();
    render(
      <Chip selected onToggle={onToggle}>
        C shape
      </Chip>,
    );
    const el = screen.getByRole('button', { name: 'C shape' });
    expect(el.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(el);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'a', label: 'Chords', panel: <p>chords panel</p> },
    { id: 'b', label: 'Scales', panel: <p>scales panel</p> },
  ];

  it('shows the active panel and moves with arrow keys', () => {
    const onChange = vi.fn();
    render(<Tabs label="Library" items={items} value="a" onChange={onChange} />);
    expect(screen.getByRole('tabpanel').textContent).toBe('chords panel');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('b');
  });
});
