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

/** A neck seen by the camera, the four lock handles on its corners. */
export function LockIllustration() {
  const corners: [number, number, string][] = [
    [62, 52, '1'],
    [62, 108, '2'],
    [330, 40, '3'],
    [330, 120, '4'],
  ];
  return (
    <svg className="illustration" viewBox="0 0 400 170" role="presentation" aria-hidden="true">
      <rect x="8" y="8" width="384" height="154" rx="12" className="ill-line" />
      {/* the neck in perspective: narrower at the nut, wider toward the body */}
      <path d="M62 52 330 40v80L62 108Z" className="ill-line ill-wood" />
      {[110, 160, 206, 248, 288].map((x, i) => (
        <path key={x} d={`M${x} ${50 - i * 2.2}v${60 + i * 4.4}`} className="ill-line" />
      ))}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <path key={k} d={`M62 ${55 + k * 10}L330 ${45 + k * 14}`} className="ill-tile-string" />
      ))}
      {corners.map(([x, y, n]) => (
        <g key={n}>
          <circle cx={x} cy={y} r="10" className="ill-accent-fill" />
          <text x={x} y={y + 4} textAnchor="middle" className="ill-label ill-on-accent">
            {n}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Cards in a row, each with a timer, and an arrow moving on. */
export function RunIllustration() {
  return (
    <svg className="illustration" viewBox="0 0 400 140" role="presentation" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => {
        const x = 20 + i * 95;
        return (
          <g key={i}>
            <rect
              x={x}
              y="24"
              width="78"
              height="92"
              rx="10"
              className={i === 1 ? 'ill-accent' : 'ill-line'}
            />
            {[0, 1, 2].map((k) => (
              <path key={k} d={`M${x + 12} ${46 + k * 14}h54`} className="ill-tile-string" />
            ))}
            <circle cx={x + 30 + (i % 3) * 8} cy={60} r="5" className="ill-accent-fill" />
            <circle cx={x + 39} cy="98" r="8" className="ill-line" />
            <path d={`M${x + 39} 98v-5M${x + 39} 98h4`} className="ill-line" />
            {i < 3 ? <path d={`M${x + 82} 70h9m-4-4 4 4-4 4`} className="ill-line" /> : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Two layers of dots on one neck; shared notes split in two colours. */
export function LayersIllustration() {
  const a: [number, number][] = [
    [80, 40],
    [140, 60],
    [200, 80],
    [140, 100],
  ];
  const b: [number, number][] = [
    [200, 40],
    [260, 60],
    [200, 80],
    [320, 100],
  ];
  return (
    <svg className="illustration" viewBox="0 0 400 140" role="presentation" aria-hidden="true">
      <rect x="40" y="26" width="320" height="88" rx="4" className="ill-line ill-wood" />
      {[0, 1, 2, 3, 4].map((k) => (
        <path key={k} d={`M40 ${40 + k * 20}h320`} className="ill-tile-string" />
      ))}
      {[110, 170, 230, 290].map((x) => (
        <path key={x} d={`M${x} 26v88`} className="ill-line" />
      ))}
      {a.map(([x, y], i) => (
        <circle key={`a${i}`} cx={x} cy={y} r="9" className="ill-accent-fill" />
      ))}
      {b.map(([x, y], i) =>
        x === 200 && y === 80 ? (
          <path key={`b${i}`} d={`M${x} ${y - 9}a9 9 0 0 1 0 18Z`} className="ill-info-fill" />
        ) : (
          <circle key={`b${i}`} cx={x} cy={y} r="9" className="ill-info-fill" />
        ),
      )}
    </svg>
  );
}

/** Six lines of tab with a hammer-on, a slide and a bend, and the editing cursor. */
export function TabIllustration() {
  const notes: [number, number, string][] = [
    [70, 3, '5'],
    [120, 3, 'h7'],
    [170, 3, '/9'],
    [235, 2, '8b10'],
    [310, 1, '12'],
  ];
  return (
    <svg className="illustration" viewBox="0 0 400 160" role="presentation" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <path key={s} d={`M30 ${18 + s * 20}h340`} className="ill-tile-string" />
      ))}
      <path d="M30 38v100M370 38v100" className="ill-line" />
      <rect x="292" y="28" width="36" height="20" rx="5" className="ill-accent" />
      {notes.map(([x, s, text]) => (
        <text key={x} x={x} y={18 + s * 20 + 5} textAnchor="middle" className="ill-label ill-mono">
          {text}
        </text>
      ))}
    </svg>
  );
}

/** A file turning into a tab. */
export function ImportIllustration() {
  return (
    <svg className="illustration" viewBox="0 0 400 150" role="presentation" aria-hidden="true">
      <path d="M40 20h70l24 24v76H40Z" className="ill-line" />
      <path d="M110 20v24h24" className="ill-line" />
      {[0, 1, 2, 3].map((k) => (
        <path key={k} d={`M54 ${62 + k * 14}h64`} className="ill-tile-string" />
      ))}
      <text x="87" y="136" textAnchor="middle" className="ill-label">
        .gp · .xml · .txt
      </text>
      <path d="M156 70h60m-10-10 10 10-10 10" className="ill-line" />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <path key={k} d={`M240 ${30 + k * 16}h130`} className="ill-tile-string" />
      ))}
      <text x="270" y="66" textAnchor="middle" className="ill-label ill-mono">
        3
      </text>
      <text x="310" y="82" textAnchor="middle" className="ill-label ill-mono">
        5
      </text>
      <text x="350" y="50" textAnchor="middle" className="ill-label ill-mono">
        0
      </text>
    </svg>
  );
}

/** Rings sliding along a string toward the dot to play now. */
export function ApproachIllustration() {
  return (
    <svg className="illustration" viewBox="0 0 400 120" role="presentation" aria-hidden="true">
      <rect x="20" y="20" width="360" height="80" rx="4" className="ill-line ill-wood" />
      {[0, 1, 2, 3].map((k) => (
        <path key={k} d={`M20 ${32 + k * 19}h360`} className="ill-tile-string" />
      ))}
      {[90, 160, 230, 300].map((x) => (
        <path key={x} d={`M${x} 20v80`} className="ill-line" />
      ))}
      <circle cx="125" cy="51" r="10" className="ill-accent-fill" />
      <circle cx="125" cy="51" r="15" className="ill-accent" />
      <circle cx="210" cy="70" r="14" className="ill-line" />
      <circle cx="300" cy="70" r="20" className="ill-line" opacity="0.45" />
      <path d="M330 70h30" className="ill-line ill-dash" />
      <path d="M232 70h40" className="ill-line ill-dash" />
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
