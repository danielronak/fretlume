/**
 * Stage (phase 3 tasks 3.7–3.9, docs/specs/05-ux.md §3): live camera, manual lock, overlay, deck.
 * Video frames are processed in a worker on this device and never stored.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSettings } from '@/state/settings';
import { camera, type CameraStatus } from '@/camera/camera';
import { debugEnabled, VisionClient } from '@/camera/visionClient';
import { INSTRUMENTS, type InstrumentModel } from '@core/guitar/instrument';
import { isLibraryKind, parseRootSlug, isValidType } from '@features/library/model';
import { TUNINGS } from '@core/theory/tuning';
import type { Shape } from '@core/theory/types';
import { t, type MessageKey } from '@i18n/index';
import { FlatFretboard } from '@overlay/FlatFretboard';
import { projectShape, type OverlayItem } from '@overlay/projection';
import { Button, Slider, Toggle } from '@ui/index';
import type { InstrumentId, LockReply } from '@vision/core';
import { apply, type Mat3, type Pt } from '@vision/geometry';
import { homographyFromTaps, shiftFrets, tapPointsMm, VERIFIED_CONFIDENCE } from '@vision/lock';
import type { AutoMessage, PoseMessage } from '@vision/messages';
import type { SearchHint } from '@vision/autoLock';
import { readFrameStamp } from '@vision/stamp';
import { diagnostics } from '@/diagnostics/recorder';
import { buildDeck, type DeckEntry } from './deck';
import { clearColorCache, drawGrid, drawOverlay, toCanvas, toVideo, type View } from './draw';
import './stage.css';

type Phase = 'framing' | 'marking' | 'snapping' | 'confirm' | 'tracking';

const INSTRUMENT_ID: Record<string, InstrumentId> = {
  'steel-acoustic': 'steelAcoustic',
  electric: 'electric',
  classical: 'classical',
};

const CAMERA_MESSAGE: Partial<Record<CameraStatus, MessageKey>> = {
  denied: 'stageCameraDenied',
  'no-device': 'stageCameraMissing',
  unavailable: 'stageCameraMissing',
  busy: 'stageCameraBusy',
  lost: 'stageCameraLost',
  error: 'stageCameraError',
};

const HANDLE_LABELS: MessageKey[] = [
  'stageLockHandle1',
  'stageLockHandle2',
  'stageLockHandle3',
  'stageLockHandle4',
  'stageLockHandle5',
  'stageLockHandle6',
];

/** A starting guess for the taps: a neck across the middle of the frame, headstock to the right. */
function defaultTaps(width: number, height: number, model: InstrumentModel, six: boolean): Pt[] {
  const nutX = width * 0.82;
  const x12 = width * 0.34;
  const k = (nutX - x12) / (model.scaleMm / 2);
  const H: Mat3 = [-k, 0, nutX, 0, k, height * 0.5, 0, 0, 1];
  return tapPointsMm(model, six ? 6 : 4).map((p) => apply(H, p.x, p.y));
}

interface StageDebug {
  phase: Phase;
  pose: PoseMessage | null;
  items: OverlayItem[];
  lock: (LockReply & { shift: number }) | null;
  video: { width: number; height: number };
  /** Frame number stamped in the frozen frame of synthetic test clips. */
  frozenStamp: number | null;
  taps: Pt[];
}

/** Debug: the stamped frame number of a still (synthetic test clips only). */
function stampOf(bitmap: ImageBitmap): number | null {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return readFrameStamp({ width: bitmap.width, height: bitmap.height, data, channels: 4 });
}

declare global {
  interface Window {
    __fretlumeStage?: StageDebug;
  }
}

export function StageScreen() {
  const params = useParams();
  const settings = useSettings();
  const update = useSettings((s) => s.update);
  const cam = useSyncExternalStore(camera.subscribe, camera.getSnapshot);
  const model = INSTRUMENTS[INSTRUMENT_ID[settings.guitar] ?? 'steelAcoustic'];
  const tuning = TUNINGS[settings.tuning];

  // ---------- what to show ----------
  const root = parseRootSlug(params.root);
  const kind = isLibraryKind(params.kind) ? params.kind : null;
  const deck = useMemo(() => {
    if (!kind || root === null || !params.type || !isValidType(kind, params.type)) return null;
    return buildDeck(kind, root, params.type, tuning, model.frets);
  }, [kind, root, params.type, tuning, model.frets]);
  const [entryIndex, setEntryIndex] = useState(0);
  const [loop, setLoop] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const entry: DeckEntry | null =
    deck?.entries[Math.min(entryIndex, deck.entries.length - 1)] ?? null;

  // ---------- camera and vision ----------
  const [withoutCamera, setWithoutCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<VisionClient | null>(null);
  const poseRef = useRef<PoseMessage | null>(null);
  const [status, setStatus] = useState<{ state: string; confidence: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('framing');
  const [boxWidth, setBoxWidth] = useState(0);
  const frozenRef = useRef<{ bitmap: ImageBitmap; tMs: number } | null>(null);
  const frozenStampRef = useRef<number | null>(null);
  const frameCanvas = useRef<HTMLCanvasElement | null>(null);
  const [taps, setTaps] = useState<Pt[]>([]);
  const [six, setSix] = useState(false);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const [lock, setLock] = useState<LockReply | null>(null);
  const autoRef = useRef<AutoMessage | null>(null);
  const [autoView, setAutoView] = useState<{ state: string; hint: SearchHint | null }>({
    state: 'off',
    hint: null,
  });
  const [autoAvailable, setAutoAvailable] = useState<boolean | null>(null);
  const [shift, setShift] = useState(0);

  const videoSize = { width: cam.width || 1280, height: cam.height || 720 };
  const view: View = {
    scale: boxWidth / videoSize.width || 1,
    mirror: settings.mirrorView,
    videoWidth: videoSize.width,
  };

  const client = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new VisionClient();
      clientRef.current.onPose((pose) => {
        poseRef.current = pose;
        diagnostics.pose(pose);
        setStatus((s) =>
          s && s.state === pose.state && Math.abs(s.confidence - pose.confidence) < 0.1
            ? s
            : { state: pose.state, confidence: pose.confidence },
        );
      });
      clientRef.current.onAuto((a) => {
        autoRef.current = a;
        setAutoView((v) =>
          v.state === a.state && v.hint === a.hint ? v : { state: a.state, hint: a.hint },
        );
        if (a.state === 'locked' && a.H) void onAutoLocked(a);
      });
    }
    return clientRef.current;
  }, []);

  useEffect(() => {
    clientRef.current?.setInstrument(INSTRUMENT_ID[settings.guitar] ?? 'steelAcoustic');
  }, [settings.guitar]);

  const startCamera = useCallback(async () => {
    const stream = await camera.start();
    const video = videoRef.current;
    if (!stream || !video) return;
    video.srcObject = stream;
    await video.play().catch(() => undefined);
    client().setInstrument(INSTRUMENT_ID[useSettings.getState().guitar] ?? 'steelAcoustic');
  }, [client]);

  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
      frozenRef.current?.bitmap.close();
      camera.stop();
    },
    [],
  );

  // Keep the video box size in step with the layout.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setBoxWidth(box.clientWidth));
    observer.observe(box);
    setBoxWidth(box.clientWidth);
    return () => observer.disconnect();
  }, [cam.status]);

  // Screen wake lock while the camera runs.
  useEffect(() => {
    if (cam.status !== 'running' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    navigator.wakeLock
      .request('screen')
      .then((s) => (sentinel = s))
      .catch(() => undefined);
    return () => void sentinel?.release();
  }, [cam.status]);

  // ---------- lock flow ----------
  const freeze = useCallback(
    async (startTaps?: Pt[]) => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      video.pause();
      clientRef.current?.stop();
      frozenRef.current?.bitmap.close();
      frozenRef.current = { bitmap: await createImageBitmap(video), tMs: performance.now() };
      frozenStampRef.current = debugEnabled() ? stampOf(frozenRef.current.bitmap) : null;
      const remembered = useSettings.getState().lockTaps;
      const w = video.videoWidth;
      const h = video.videoHeight;
      const fromSettings =
        remembered.length > 0
          ? Array.from({ length: remembered.length / 2 }, (_, i) => ({
              x: remembered[2 * i]! * w,
              y: remembered[2 * i + 1]! * h,
            }))
          : null;
      const initial = startTaps ?? fromSettings ?? defaultTaps(w, h, model, false);
      setSix(initial.length === 6);
      setTaps(initial);
      setLock(null);
      setShift(0);
      setPhase('marking');
    },
    [model],
  );

  /** An automatic lock: freeze that moment and ask the player to confirm, as after a manual snap. */
  const onAutoLockedRef = useRef<(a: AutoMessage) => Promise<void>>(async () => undefined);
  onAutoLockedRef.current = async (a: AutoMessage) => {
    const video = videoRef.current;
    if (phase !== 'framing' || !video || !a.H) return;
    video.pause();
    clientRef.current?.stop();
    frozenRef.current?.bitmap.close();
    frozenRef.current = { bitmap: await createImageBitmap(video), tMs: performance.now() };
    frozenStampRef.current = debugEnabled() ? stampOf(frozenRef.current.bitmap) : null;
    diagnostics.event(
      performance.now(),
      `auto-lock ${a.confidence.toFixed(2)} index ${a.indexSure}`,
    );
    setTaps(tapPointsMm(model, 4).map((p) => apply(a.H!, p.x, p.y)));
    setLock({
      H: a.H,
      polarity: a.polarity,
      confidence: a.confidence,
      found: true,
      verified: a.indexSure && a.confidence >= VERIFIED_CONFIDENCE,
    });
    setShift(0);
    setPhase('confirm');
  };
  const onAutoLocked = (a: AutoMessage) => onAutoLockedRef.current(a);

  // While framing with the camera on: stream frames to the worker, which looks for the neck.
  useEffect(() => {
    const video = videoRef.current;
    if (phase !== 'framing' || cam.status !== 'running' || !settings.autoLock || !video) {
      if (phase === 'framing') setAutoView({ state: 'off', hint: null });
      return;
    }
    const c = client();
    let cancelled = false;
    void c.setAuto(true).then((ok) => {
      if (cancelled) return;
      setAutoAvailable(ok);
      if (ok) c.start(video);
    });
    return () => {
      cancelled = true;
      c.stop();
    };
  }, [phase, cam.status, settings.autoLock, client]);

  const toggleSix = (on: boolean) => {
    setSix(on);
    if (on && taps.length === 4) {
      const H = homographyFromTaps(taps, model);
      setTaps([
        ...taps,
        ...tapPointsMm(model, 6)
          .slice(4)
          .map((p) => apply(H, p.x, p.y)),
      ]);
    } else if (!on) setTaps(taps.slice(0, 4));
  };

  const snap = async () => {
    const frozen = frozenRef.current;
    if (!frozen) return;
    setPhase('snapping');
    const w = frozen.bitmap.width;
    const h = frozen.bitmap.height;
    update({ lockTaps: taps.flatMap((p) => [p.x / w, p.y / h]) });
    const reply = await client().lock(await createImageBitmap(frozen.bitmap), taps);
    diagnostics.lock({
      tMs: frozen.tMs,
      taps,
      video: { width: w, height: h },
      reply: {
        H: reply.H,
        polarity: reply.polarity,
        confidence: reply.confidence,
        found: reply.found,
        verified: reply.verified,
      },
    });
    setLock(
      reply.found
        ? reply
        : {
            H: homographyFromTaps(taps, model),
            polarity: 'bright',
            confidence: 0,
            found: false,
            verified: false,
          },
    );
    setShift(0);
    setPhase('confirm');
  };

  const confirmedH = lock ? shiftFrets(lock.H, model, shift) : null;

  const start = async () => {
    const frozen = frozenRef.current;
    const video = videoRef.current;
    if (!lock || !confirmedH || !frozen || !video) return;
    const c = client();
    const scale = c.tiers.scale;
    const frame = await createImageBitmap(frozen.bitmap, {
      resizeWidth: Math.round(frozen.bitmap.width * scale),
      resizeHeight: Math.round(frozen.bitmap.height * scale),
    });
    c.confirm(confirmedH, lock.polarity, frozen.tMs, frame);
    diagnostics.confirm(shift);
    await video.play().catch(() => undefined);
    c.start(video);
    setPhase('tracking');
  };

  const adjust = () => {
    if (!confirmedH) return;
    setTaps(tapPointsMm(model, six ? 6 : 4).map((p) => apply(confirmedH, p.x, p.y)));
    setPhase('marking');
  };

  const relock = () => {
    diagnostics.event(performance.now(), 'relock');
    const pose = poseRef.current;
    const H = pose?.H;
    void freeze(H ? tapPointsMm(model, 4).map((p) => apply(H, p.x, p.y)) : undefined);
  };

  // ---------- deck ----------
  const count = deck?.entries.length ?? 0;
  const step = useCallback(
    (delta: number) =>
      setEntryIndex((i) => {
        const next = i + delta;
        if (next < 0) return loop ? count - 1 : 0;
        if (next >= count) return loop ? 0 : count - 1;
        return next;
      }),
    [count, loop],
  );
  useEffect(() => {
    if (!settings.stageAutoSeconds || count < 2) return;
    const id = window.setInterval(() => step(1), settings.stageAutoSeconds * 1000);
    return () => clearInterval(id);
  }, [settings.stageAutoSeconds, count, step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key.toLowerCase() === 'l') setLoop((v) => !v);
      else if (e.key.toLowerCase() === 'r' && phase === 'tracking') relock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shownShape: Shape | null = useMemo(() => {
    if (!entry) return null;
    if (showAll || entry.activeGroups.length === 0) return entry.shape;
    return {
      ...entry.shape,
      marks: entry.shape.marks.filter((m) => m.groups.some((g) => entry.activeGroups.includes(g))),
    };
  }, [entry, showAll]);

  // ---------- drawing ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cam.status !== 'running') return;
    clearColorCache();
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(boxWidth * dpr);
      const h = Math.round((boxWidth * videoSize.height * dpr) / videoSize.width);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let items: OverlayItem[] = [];
      const auto = autoRef.current;
      if (phase === 'framing' && auto?.H && auto.state !== 'searching') {
        drawGrid(ctx, view, auto.H, model, { numbers: true, color: '#9ad7ff' });
      } else if (phase === 'marking' && taps.length >= 4) {
        try {
          drawGrid(ctx, view, homographyFromTaps(taps, model), model, {
            numbers: false,
            color: '#7fe3c8',
          });
        } catch {
          /* degenerate handles while dragging */
        }
      } else if ((phase === 'confirm' || phase === 'snapping') && confirmedH) {
        drawGrid(ctx, view, confirmedH, model, { numbers: true, color: '#ffd166' });
      } else if (phase === 'tracking') {
        const pose = poseRef.current;
        if (pose?.H && shownShape) {
          items = projectShape(shownShape, pose.H, model, {
            labelMode: settings.labelMode,
            colorMode:
              entry && entry.activeGroups.length === 0 && settings.colorMode === 'group'
                ? 'degree'
                : settings.colorMode,
            activeGroups: entry?.activeGroups ?? [],
            dotScale: settings.dotScale,
            flipStrings: settings.flipStrings,
          });
          const fade = pose.state === 'locked' ? 1 : pose.state === 'recovering' ? 0.4 : 0.15;
          drawOverlay(ctx, view, items, fade);
        }
      }
      const now = performance.now();
      const video = videoRef.current;
      if (phase === 'tracking' && video && diagnostics.wantsFrame(now)) {
        // Only after the player agreed (Settings → Field test); kept in memory for the export.
        const small =
          frameCanvas.current ?? (frameCanvas.current = document.createElement('canvas'));
        small.width = 320;
        small.height = Math.round((320 * videoSize.height) / videoSize.width);
        small.getContext('2d')?.drawImage(video, 0, 0, small.width, small.height);
        diagnostics.frame(now, small.toDataURL('image/jpeg', 0.6));
      }
      if (debugEnabled()) {
        window.__fretlumeStage = {
          phase,
          pose: poseRef.current,
          items,
          lock: lock ? { ...lock, shift } : null,
          video: videoSize,
          frozenStamp: frozenStampRef.current,
          taps,
        };
      }
    };
    draw();
    return () => cancelAnimationFrame(frame);
  });

  // Loupe: the frozen frame magnified around the handle being moved.
  useEffect(() => {
    const loupe = loupeRef.current;
    const frozen = frozenRef.current;
    if (!loupe || !frozen || activeHandle === null || !taps[activeHandle]) return;
    const ctx = loupe.getContext('2d');
    if (!ctx) return;
    const size = loupe.width;
    const zoom = 4;
    const p = taps[activeHandle]!;
    const half = size / zoom / 2;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    if (settings.mirrorView) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frozen.bitmap, p.x - half, p.y - half, 2 * half, 2 * half, 0, 0, size, size);
    ctx.restore();
    ctx.strokeStyle = '#7fe3c8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();
  }, [activeHandle, taps, settings.mirrorView]);

  // ---------- handles ----------
  const dragRef = useRef<number | null>(null);
  const moveHandle = (index: number, clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const p = toVideo(view, { x: clientX - box.left, y: clientY - box.top });
    const clamped = {
      x: Math.min(videoSize.width, Math.max(0, p.x)),
      y: Math.min(videoSize.height, Math.max(0, p.y)),
    };
    setTaps((ts) => ts.map((q, i) => (i === index ? clamped : q)));
  };
  const nudge = (index: number, dx: number, dy: number) =>
    setTaps((ts) =>
      ts.map((q, i) => (i === index ? { x: q.x + (view.mirror ? -dx : dx), y: q.y + dy } : q)),
    );

  // ---------- render ----------
  const cameraMessage = CAMERA_MESSAGE[cam.status];
  const running = cam.status === 'running';
  const pill: { tone: 'ok' | 'warn' | 'bad'; text: string } | null =
    phase !== 'tracking' || !status
      ? null
      : status.state === 'locked'
        ? { tone: 'ok', text: t('stageStatusLocked') }
        : status.state === 'recovering'
          ? { tone: 'warn', text: t('stageStatusHold') }
          : { tone: 'bad', text: t('stageStatusLost') };

  return (
    <section className="screen stage" data-testid="screen-stage">
      <header className="stage__head">
        <h1>{deck?.title ?? t('stageTitle')}</h1>
        {pill ? (
          <span className={`stage__pill stage__pill--${pill.tone}`} role="status">
            {pill.text}
          </span>
        ) : null}
      </header>

      {!deck ? (
        <p className="screen__lede">
          {t('stageNothing')} <Link to="/library">{t('stageNothingAction')}</Link>
        </p>
      ) : null}

      {withoutCamera || (!running && cam.status !== 'requesting' && cam.status !== 'idle') ? (
        <div className="stage__nocam">
          {cameraMessage ? <p role="alert">{t(cameraMessage)}</p> : null}
          <div className="stage__actions">
            <Button variant="primary" onClick={() => (setWithoutCamera(false), void startCamera())}>
              {t('stageCameraStart')}
            </Button>
          </div>
        </div>
      ) : null}
      {!running && !withoutCamera && (cam.status === 'idle' || cam.status === 'requesting') ? (
        <div className="stage__nocam">
          <p>{t('stageCameraNeed')}</p>
          <div className="stage__actions">
            <Button
              variant="primary"
              onClick={() => void startCamera()}
              disabled={cam.status === 'requesting'}
            >
              {t('stageCameraStart')}
            </Button>
            <Button variant="ghost" onClick={() => setWithoutCamera(true)}>
              {t('stageNoCamera')}
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className={`stage__box${running && !withoutCamera ? '' : ' stage__box--hidden'}`}
        ref={boxRef}
        style={{ aspectRatio: `${videoSize.width} / ${videoSize.height}` }}
      >
        <video
          ref={videoRef}
          className={settings.mirrorView ? 'stage__video stage__video--mirror' : 'stage__video'}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="stage__canvas" data-testid="stage-canvas" />
        {phase === 'marking'
          ? taps.map((p, i) => {
              const c = toCanvas(view, p);
              return (
                <button
                  key={i}
                  type="button"
                  className={`stage__handle${activeHandle === i ? ' stage__handle--active' : ''}`}
                  style={{ left: c.x, top: c.y }}
                  aria-label={t(HANDLE_LABELS[i]!)}
                  data-testid={`lock-handle-${i + 1}`}
                  onPointerDown={(e) => {
                    dragRef.current = i;
                    setActiveHandle(i);
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (dragRef.current === i) moveHandle(i, e.clientX, e.clientY);
                  }}
                  onPointerUp={() => {
                    dragRef.current = null;
                    setActiveHandle(null);
                  }}
                  onFocus={() => setActiveHandle(i)}
                  onBlur={() => setActiveHandle(null)}
                  onKeyDown={(e) => {
                    const d = e.shiftKey ? 10 : 1;
                    const moves: Record<string, [number, number]> = {
                      ArrowLeft: [-d, 0],
                      ArrowRight: [d, 0],
                      ArrowUp: [0, -d],
                      ArrowDown: [0, d],
                    };
                    const m = moves[e.key];
                    if (m) {
                      e.preventDefault();
                      e.stopPropagation();
                      nudge(i, m[0], m[1]);
                    }
                  }}
                >
                  {i + 1}
                </button>
              );
            })
          : null}
        {phase === 'marking' && activeHandle !== null ? (
          <canvas ref={loupeRef} className="stage__loupe" width={140} height={140} aria-hidden />
        ) : null}
      </div>

      {running && !withoutCamera ? (
        <div className="stage__panel">
          {phase === 'framing' ? (
            <>
              <p data-testid="stage-hint">
                {settings.autoLock && autoAvailable !== false
                  ? hintText(autoView, settings.mirrorView)
                  : t('stageFrame')}
              </p>
              {autoAvailable === false && settings.autoLock ? (
                <p className="stage__note">{t('stageAutoUnavailable')}</p>
              ) : null}
              <Toggle
                label={t('stageAutoLock')}
                checked={settings.autoLock}
                onChange={(v) => update({ autoLock: v })}
              />
              <div className="stage__actions">
                <Button variant="primary" onClick={() => void freeze()} data-testid="stage-lock">
                  {t('stageLock')}
                </Button>
              </div>
            </>
          ) : null}
          {phase === 'marking' ? (
            <>
              <h2>{t('stageLockTitle')}</h2>
              <p>{t('stageLockHint')}</p>
              <Toggle label={t('stageLockSix')} checked={six} onChange={toggleSix} />
              <div className="stage__actions">
                <Button variant="primary" onClick={() => void snap()} data-testid="stage-snap">
                  {t('stageLockSnap')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    void videoRef.current?.play();
                    setPhase('framing');
                  }}
                >
                  {t('stageLockCancel')}
                </Button>
              </div>
            </>
          ) : null}
          {phase === 'snapping' ? <p role="status">{t('stageLockSnapping')}</p> : null}
          {phase === 'confirm' && lock ? (
            <>
              <h2>{t('stageConfirmTitle')}</h2>
              <p data-testid="stage-confirm-message">
                {!lock.found
                  ? t('stageConfirmNotFound')
                  : lock.verified
                    ? t('stageConfirmVerified')
                    : t('stageConfirmCheck')}
              </p>
              <div className="stage__actions">
                <Button
                  variant="secondary"
                  aria-label={t('stageShiftDown')}
                  onClick={() => setShift((k) => k - 1)}
                >
                  ◄
                </Button>
                <span className="stage__shift">{shift > 0 ? `+${shift}` : shift}</span>
                <Button
                  variant="secondary"
                  aria-label={t('stageShiftUp')}
                  onClick={() => setShift((k) => k + 1)}
                >
                  ►
                </Button>
              </div>
              <div className="stage__actions">
                <Button variant="primary" onClick={() => void start()} data-testid="stage-confirm">
                  {t('stageConfirmYes')}
                </Button>
                <Button variant="ghost" onClick={adjust}>
                  {t('stageConfirmAdjust')}
                </Button>
              </div>
            </>
          ) : null}
          {phase === 'tracking' ? (
            <div className="stage__actions">
              <Button onClick={relock} data-testid="stage-relock">
                {t('stageRelock')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void boxRef.current?.requestFullscreen?.().catch(() => undefined)}
              >
                {t('stageFullscreen')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  clientRef.current?.stop();
                  camera.stop();
                  setPhase('framing');
                }}
              >
                {t('stageEnd')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {deck && entry ? (
        <div className="stage__deck" data-testid="stage-deck">
          <div className="stage__deck-title">
            <strong data-testid="stage-entry">{entry.label}</strong>
            <span>
              {entryIndex + 1} / {count}
            </span>
          </div>
          {withoutCamera || !running ? (
            <FlatFretboard
              shape={entry.shape}
              frets={model.frets}
              labelMode={settings.labelMode}
              colorMode={settings.colorMode}
              leftHanded={settings.handedness === 'left'}
              activeGroups={entry.activeGroups}
            />
          ) : null}
          <div className="stage__actions">
            <Button onClick={() => step(-1)} aria-label={t('stageDeckBack')}>
              ◄ {t('stageDeckBack')}
            </Button>
            <Button onClick={() => step(1)} aria-label={t('stageDeckNext')} data-testid="deck-next">
              {t('stageDeckNext')} ►
            </Button>
            <Button variant="ghost" onClick={() => setEntryIndex(0)}>
              {t('stageDeckRestart')}
            </Button>
            <Toggle label={t('stageDeckLoop')} checked={loop} onChange={setLoop} />
            <Toggle
              label={showAll ? t('stageDeckAllShapes') : t('stageDeckOneShape')}
              checked={showAll}
              onChange={setShowAll}
            />
          </div>
          <div className="stage__settings">
            <label className="stage__select">
              {t('stageDeckAuto')}
              <select
                value={settings.stageAutoSeconds}
                onChange={(e) => update({ stageAutoSeconds: Number(e.target.value) })}
              >
                {[0, 4, 8, 15, 30].map((s) => (
                  <option key={s} value={s}>
                    {s === 0 ? t('stageDeckAutoOff') : t('stageDeckAutoSeconds', { s })}
                  </option>
                ))}
              </select>
            </label>
            <Slider
              label={t('stageDotSize')}
              value={settings.dotScale}
              min={0.6}
              max={1.6}
              step={0.1}
              onChange={(v) => update({ dotScale: v })}
              format={(v) => `${Math.round(v * 100)} %`}
            />
            <Toggle
              label={t('stageMirror')}
              checked={settings.mirrorView}
              onChange={(v) => update({ mirrorView: v })}
            />
            <Toggle
              label={t('stageFlip')}
              checked={settings.flipStrings}
              onChange={(v) => update({ flipStrings: v })}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** The tip shown while looking for the neck (docs/specs/05-ux.md §3). Sides follow what the player sees. */
function hintText(view: { state: string; hint: SearchHint | null }, mirror: boolean): string {
  if (view.state === 'verifying') return t('stageHintVerifying');
  const flip = (side: 'left' | 'right') => (mirror ? (side === 'left' ? 'right' : 'left') : side);
  switch (view.hint) {
    case 'too-dark':
      return t('stageHintDark');
    case 'cut-off-left':
      return t('stageHintCut', {
        side: t(flip('left') === 'left' ? 'stageSideLeft' : 'stageSideRight'),
      });
    case 'cut-off-right':
      return t('stageHintCut', {
        side: t(flip('right') === 'left' ? 'stageSideLeft' : 'stageSideRight'),
      });
    case 'cut-off-top':
      return t('stageHintCut', { side: t('stageSideTop') });
    case 'cut-off-bottom':
      return t('stageHintCut', { side: t('stageSideBottom') });
    case 'hold-still':
      return t('stageHintHold');
    case 'lift-hand':
      return t('stageHintHand');
    default:
      return t('stageHintSearching');
  }
}
