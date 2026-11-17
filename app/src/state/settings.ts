/**
 * Player settings (docs/phases/phase-02-shell-library-tuner.md task 2.1).
 * Kept in localStorage through Zustand's persist middleware so they are available synchronously
 * at startup (theme before first paint, handedness before the first diagram). Included in backups.
 * DECISIONS D-012.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { STORAGE_PREFIX } from '@/config';
import type { ColorMode, LabelMode } from '@overlay/display';

export type Theme = 'dark' | 'light';
export type Handedness = 'right' | 'left';
export type GuitarProfileId = 'steel-acoustic' | 'electric' | 'classical';
export type TuningId = 'standard' | 'dropD' | 'halfStepDown' | 'dadgad' | 'openG' | 'openD';

export interface Settings {
  theme: Theme;
  handedness: Handedness;
  /** Show the camera like a mirror (Phase 3). */
  mirrorView: boolean;
  guitar: GuitarProfileId;
  tuning: TuningId;
  capo: number;
  /** Concert pitch reference for the tuner and reference tones. */
  a4Hz: number;
  labelMode: LabelMode;
  colorMode: ColorMode;
  /** Chosen microphone; empty = system default. */
  audioInputId: string;
  /** First-run welcome finished or skipped. */
  onboarded: boolean;
  metronomeBpm: number;
  /** "4/4", "6/8" … */
  metronomeTime: string;
  metronomeSubdivision: number;
  metronomeAccent: boolean;
  metronomeCountIn: boolean;
  /** Tuner: true = one string at a time from the low E. */
  tunerGuided: boolean;
  /** Stage overlay dot size multiplier, 0.6–1.6. */
  dotScale: number;
  /** Left-handed stringing: the thin string is where the thick one usually is. */
  flipStrings: boolean;
  /** Last manual-lock taps as fractions of the frame, x0, y0, x1, y1 … (4 or 6 points); [] = none. */
  lockTaps: number[];
  /** Stage deck auto-advance in seconds; 0 = off. */
  stageAutoSeconds: number;
  /** Look for the neck automatically on the Stage (Phase 4). */
  autoLock: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  handedness: 'right',
  mirrorView: true,
  guitar: 'steel-acoustic',
  tuning: 'standard',
  capo: 0,
  a4Hz: 440,
  labelMode: 'notes',
  colorMode: 'group',
  audioInputId: '',
  onboarded: false,
  metronomeBpm: 90,
  metronomeTime: '4/4',
  metronomeSubdivision: 1,
  metronomeAccent: true,
  metronomeCountIn: false,
  tunerGuided: false,
  dotScale: 1,
  flipStrings: false,
  lockTaps: [],
  stageAutoSeconds: 0,
  autoLock: true,
};

export const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8'] as const;

export const SETTINGS_STORAGE_KEY = `${STORAGE_PREFIX}.settings`;
export const SETTINGS_VERSION = 1;

interface SettingsActions {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  /** Replace everything (backup import). Unknown keys are dropped, missing keys get defaults. */
  replace: (next: Partial<Settings>) => void;
}

export type SettingsStore = Settings & SettingsActions;

const ALLOWED: Partial<Record<keyof Settings, readonly string[]>> = {
  theme: ['dark', 'light'],
  handedness: ['right', 'left'],
  guitar: ['steel-acoustic', 'electric', 'classical'],
  tuning: ['standard', 'dropD', 'halfStepDown', 'dadgad', 'openG', 'openD'],
  labelMode: ['notes', 'intervals', 'fingers', 'none'],
  colorMode: ['group', 'note', 'degree', 'finger', 'single'],
  metronomeTime: TIME_SIGNATURES,
};

/** Keep only known keys with values of the right type (and, for choices, a known value). */
export function sanitizeSettings(input: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return out;
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = record[key];
    const allowed = ALLOWED[key];
    if (allowed && !allowed.includes(value as string)) continue;
    if (value !== undefined && typeof value === typeof DEFAULT_SETTINGS[key]) {
      (out as unknown as Record<string, unknown>)[key] = value;
    }
  }
  out.capo = Math.min(12, Math.max(0, Math.round(out.capo)));
  out.a4Hz = Math.min(450, Math.max(430, out.a4Hz));
  out.metronomeBpm = Math.min(260, Math.max(30, Math.round(out.metronomeBpm)));
  if (![1, 2, 3, 4].includes(out.metronomeSubdivision)) out.metronomeSubdivision = 1;
  out.dotScale = Number.isFinite(out.dotScale) ? Math.min(1.6, Math.max(0.6, out.dotScale)) : 1;
  const taps = out.lockTaps;
  out.lockTaps =
    Array.isArray(taps) &&
    (taps.length === 8 || taps.length === 12) &&
    taps.every((v) => typeof v === 'number' && v >= 0 && v <= 1)
      ? [...taps]
      : [];
  if (![0, 4, 8, 15, 30].includes(out.stageAutoSeconds)) out.stageAutoSeconds = 0;
  return out;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set({ ...DEFAULT_SETTINGS }),
      replace: (next) => set(sanitizeSettings(next)),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): Settings => sanitizeSettings(state),
      merge: (persisted, current) => ({ ...current, ...sanitizeSettings(persisted) }),
      migrate: (persisted) => sanitizeSettings(persisted),
    },
  ),
);

/** Plain settings object, for backups. */
export function currentSettings(): Settings {
  return sanitizeSettings(useSettings.getState());
}
