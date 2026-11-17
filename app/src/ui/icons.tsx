/** Original line icons, drawn for this app on a 24×24 grid. Decorative: callers supply the label. */
import type { ReactNode } from 'react';

export type IconName =
  | 'today'
  | 'learn'
  | 'library'
  | 'stage'
  | 'tabs'
  | 'tools'
  | 'progress'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'close'
  | 'heart'
  | 'heartFilled'
  | 'folder'
  | 'search'
  | 'play'
  | 'trash'
  | 'edit'
  | 'help';

const paths: Record<IconName, ReactNode> = {
  // A sun rising over a horizon line.
  today: (
    <>
      <path d="M3 18h18" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 6v3M5.2 10.2l2 2M18.8 10.2l-2 2" />
    </>
  ),
  // Steps going up.
  learn: <path d="M3 20h5v-5h5v-5h5V5h3" />,
  // A short fretboard: strings and frets.
  library: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M9 5v14M15 5v14M3 9.7h18M3 14.3h18" />
    </>
  ),
  // A camera frame with a neck crossing it.
  stage: (
    <>
      <path d="M3 8V6a2 2 0 0 1 2-2h2M17 4h2a2 2 0 0 1 2 2v2M21 16v2a2 2 0 0 1-2 2h-2M7 20H5a2 2 0 0 1-2-2v-2" />
      <path d="M6 14.5 18 9.5" />
      <circle cx="10" cy="12.8" r="1.4" />
      <circle cx="15" cy="10.8" r="1.4" />
    </>
  ),
  // Tab staff lines with a note.
  tabs: (
    <>
      <path d="M3 7h18M3 12h18M3 17h18" />
      <circle cx="8" cy="12" r="2.2" />
      <circle cx="16" cy="7" r="2.2" />
    </>
  ),
  // A tuning-fork-like tool.
  tools: (
    <>
      <path d="M8 3v7a4 4 0 0 0 8 0V3" />
      <path d="M12 14v7" />
    </>
  ),
  // Rising bars.
  progress: <path d="M5 20v-6M12 20V9M19 20V4" />,
  // Sliders.
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  heartFilled: (
    <path
      d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
      fill="currentColor"
    />
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  play: <path d="M8 5v14l11-7Z" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3" />
      <path d="M12 17h.01" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
