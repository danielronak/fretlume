# Phase 11 — Performance, robustness, accessibility, mobile (release v0.10 🎸)

**Goal.** It runs smoothly on modest laptops, tablets and phones, in imperfect light, for every player.
**Read first:** `MASTER_PLAN.md` §4, §6; `specs/05-ux.md` §6–§8; `specs/06` §4.
**Sessions:** 3.

## Tasks
- [ ] **11.1 Profiling build:** in-app performance HUD (dev + diagnostics): per-stage ms (capture, strip,
      tracker, hands, overlay), fps, dropped frames, audio analysis load. Logged into diagnostics bundles.
- [ ] **11.2 Pipeline optimisation:** zero-copy frame transfer; strip-only pixel access (never read the
      full frame in tracking); WebGL/WebGPU strip rectification if the HUD shows the CPU path dominating;
      WASM (AssemblyScript or Rust) only for measured hot loops; hands on ROI at adaptive rate;
      NeckNet on WebGPU where available.
- [ ] **11.3 Quality tiers + auto-select:** High / Balanced / Battery chosen from a 3-second startup
      benchmark; tier changes strip size, hand rate, overlay DPR.
- [ ] **11.4 Robustness:** low-light detection and guidance; auto-exposure-drift handling; camera
      disconnect/reconnect; tab hidden/visible; device rotation; multiple cameras (prefer the user's
      last choice); glare handling on frets (evidence saturation clamp).
- [ ] **11.5 Mobile & tablet UX:** phone-landscape Stage, compact deck, large controls, safe areas,
      front/back camera switch, wake lock, installed-PWA camera permission flows on Android Chrome and
      iOS Safari (documented limits), haptic ticks for the metronome where supported.
- [ ] **11.6 Accessibility pass:** keyboard map + help overlay, focus order, ARIA, contrast audit,
      colour-blind palettes + shapes mode, reduced motion, captions for all audio feedback, font scaling.
- [ ] **11.7 Diagnostics loop complete:** export bundle (consent screen), `tools/replay` reproduces a bundle
      in the container and adds it to the regression suite; "Report a problem" page explains how to send
      the file to the maintainer (no automatic upload).
- [ ] **11.8 More instruments (stretch):** bass-4, ukulele, 7-string profiles through the instrument
      model; tracker parameters derived from the model; library filtered accordingly.
- [ ] **11.9** Regression benches all green; tag `v0.10`, deploy; 🎸 request: phone + laptop test with the
      performance HUD on, export diagnostics from each.

## Acceptance (exit gate)
All MASTER_PLAN §4 gates measured; proxy budgets hold (tracker ≤ 2.0 M samples/frame; audio ≤ 25 % of a
container core); owner-reported fps ≥ 30 (laptop) / ≥ 20 (phone) or the tier system brings it there;
accessibility checklist in `docs/A11Y.md` complete; replay tool reproduces at least one real bundle.

## Fallback ladder
- Phone performance insufficient → Balanced tier default on phones: tracker at 15 Hz with pose
  prediction, hands off by default.
- iOS limitations (e.g. camera in installed PWA) → documented; recommend Safari tab; keep flat-diagram mode.
