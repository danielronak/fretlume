/**
 * The deck's frame (parity P-F3): a title bar with a collapse toggle; in full screen the deck floats
 * over the video and can be dragged by its handle. Content is the caller's.
 */
import { useRef, useState, type ReactNode } from 'react';
import { t } from '@i18n/index';

export function DeckFrame({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const apply = () => {
    ref.current?.style.setProperty('--deck-x', `${offset.current.x}px`);
    ref.current?.style.setProperty('--deck-y', `${offset.current.y}px`);
  };
  return (
    <div
      ref={ref}
      className={`stage__deck${collapsed ? ' is-collapsed' : ''}`}
      data-testid="stage-deck"
    >
      <div className="stage__deck-title">
        <button
          type="button"
          className="stage__deck-move"
          aria-label={t('stageDeckMove')}
          title={t('stageDeckMove')}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              ox: offset.current.x,
              oy: offset.current.y,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            offset.current = { x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y };
            apply();
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={(e) => {
            const step = 24;
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            const m = moves[e.key];
            if (!m) return;
            e.preventDefault();
            e.stopPropagation();
            offset.current = { x: offset.current.x + m[0], y: offset.current.y + m[1] };
            apply();
          }}
        >
          ⠿
        </button>
        <div className="stage__deck-heading">{title}</div>
        <button
          type="button"
          className="stage__deck-toggle"
          aria-expanded={!collapsed}
          data-testid="deck-collapse"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? t('stageDeckExpand') : t('stageDeckCollapse')}
        </button>
        <button
          type="button"
          className="stage__deck-exitfs"
          onClick={() => void document.exitFullscreen?.().catch(() => undefined)}
        >
          {t('stageExitFullscreen')}
        </button>
      </div>
      {collapsed ? null : children}
    </div>
  );
}
