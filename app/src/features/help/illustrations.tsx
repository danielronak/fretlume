/** Illustrations for the guides, drawn in code from the theme tokens. Decorative: text carries the meaning. */

export function MicSetupIllustration() {
  return (
    <svg className="illustration" viewBox="0 0 400 190" role="presentation" aria-hidden="true">
      {/* laptop */}
      <rect x="22" y="40" width="120" height="78" rx="6" className="ill-line" />
      <rect x="32" y="50" width="100" height="58" rx="2" className="ill-soft" />
      <path d="M10 126h144l-10 12H20Z" className="ill-line" />
      <circle cx="82" cy="45" r="2.5" className="ill-accent-fill" />
      {/* sound waves from the guitar towards the laptop */}
      <path d="M168 84a18 18 0 0 1 0 22" className="ill-accent" />
      <path d="M180 76a30 30 0 0 1 0 38" className="ill-accent" />
      <path d="M192 68a42 42 0 0 1 0 54" className="ill-accent" />
      {/* guitar: body, sound hole, neck, headstock */}
      <g transform="translate(-14 4) rotate(-18 280 110)">
        <path
          d="M216 96c0-22 22-30 40-22 8 4 16 4 24 0 18-8 40 0 40 22s-22 30-40 22c-8-4-16-4-24 0-18 8-40 0-40-22Z"
          className="ill-line ill-wood"
        />
        <circle cx="268" cy="96" r="9" className="ill-line" />
        <rect x="296" y="92" width="58" height="8" rx="2" className="ill-line" />
        <rect x="352" y="88" width="16" height="16" rx="3" className="ill-line" />
      </g>
      <path d="M40 152h84" className="ill-line ill-dash" />
      <text x="82" y="174" textAnchor="middle" className="ill-label">
        about 1 m
      </text>
    </svg>
  );
}

export function MetronomeIllustration() {
  const beats = [0, 1, 2, 3];
  return (
    <svg className="illustration" viewBox="0 0 360 120" role="presentation" aria-hidden="true">
      {beats.map((beat) => {
        const x = 60 + beat * 80;
        return (
          <g key={beat}>
            <circle
              cx={x}
              cy="50"
              r={beat === 0 ? 18 : 13}
              className={beat === 0 ? 'ill-accent-fill' : 'ill-line'}
            />
            <text x={x} y="100" textAnchor="middle" className="ill-label">
              {beat + 1}
            </text>
            {/* eighth-note subdivisions */}
            <circle cx={x + 40} cy="50" r="5" className="ill-soft-fill" />
          </g>
        );
      })}
    </svg>
  );
}

export function InstallIllustration() {
  return (
    <svg className="illustration" viewBox="0 0 360 160" role="presentation" aria-hidden="true">
      {/* browser window */}
      <rect x="16" y="20" width="190" height="120" rx="8" className="ill-line" />
      <path d="M16 44h190" className="ill-line" />
      <circle cx="32" cy="32" r="3" className="ill-soft-fill" />
      <circle cx="44" cy="32" r="3" className="ill-soft-fill" />
      <rect x="140" y="26" width="56" height="12" rx="6" className="ill-accent" />
      <path d="M160 32h16M168 28v8" className="ill-accent" />
      {/* arrow */}
      <path d="M216 80h52m-10-10 10 10-10 10" className="ill-line" />
      {/* home-screen tile */}
      <rect x="284" y="50" width="60" height="60" rx="14" className="ill-dark" />
      <path d="M298 70h32M298 80h32M298 90h32" className="ill-tile-string" />
      <circle cx="313" cy="80" r="6" className="ill-accent-fill" />
      <text x="314" y="132" textAnchor="middle" className="ill-label">
        Fretlume
      </text>
    </svg>
  );
}

/** Small legend glyphs that match the diagram renderer. */
export function LegendGlyph({ kind }: { kind: 'root' | 'note' | 'open' | 'muted' | 'shared' }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" className="legend-glyph">
      {kind === 'root' ? (
        <>
          <circle cx="18" cy="18" r="11" fill="var(--deg-root)" />
          <circle
            cx="18"
            cy="18"
            r="13.5"
            fill="none"
            stroke="var(--dot-outline)"
            strokeWidth="5"
          />
          <circle cx="18" cy="18" r="13.5" fill="none" stroke="var(--dot-ring)" strokeWidth="2.5" />
        </>
      ) : null}
      {kind === 'note' ? <circle cx="18" cy="18" r="11" fill="var(--deg-third)" /> : null}
      {kind === 'open' ? (
        <circle cx="18" cy="18" r="7" fill="none" stroke="var(--text-muted)" strokeWidth="2" />
      ) : null}
      {kind === 'muted' ? (
        <path
          d="M12 12l12 12M24 12 12 24"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : null}
      {kind === 'shared' ? (
        <>
          <path d="M18 7a11 11 0 0 0 0 22Z" fill="var(--shape-e)" />
          <path d="M18 7a11 11 0 0 1 0 22Z" fill="var(--shape-d)" />
        </>
      ) : null}
    </svg>
  );
}
