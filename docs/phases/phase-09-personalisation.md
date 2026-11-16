# Phase 9 — Personalisation (release v0.8 🎸)

**Goal.** The app adapts to the individual: where to start, what to practise today, how fast, what to
review, which weakness to fix — and it removes the overlay as the player stops needing it.
**Read first:** `specs/04-learning.md` §4–§7, §9.
**Sessions:** 3.

## Tasks
- [ ] **9.1 Learner model:** per-skill mastery update from `AttemptEvent`s; fluency terms; levels;
      FSRS cards for memory items (`ts-fsrs`), automatic grade mapping; tempo ladder state for motor items;
      all pure, unit-tested, stored in Dexie; recomputable from the event log (migration-safe).
- [ ] **9.2 Onboarding & placement:** questionnaire + optional play-check; seeds mastery; picks the
      start lesson; editable later in Settings.
- [ ] **9.3 Daily plan generator** (deterministic) + **Today** screen: blocks, swap/skip, time chips,
      resume; "Just play" bypass.
- [ ] **9.4 Adaptive tempo & difficulty** inside drills and tab play-along: auto slow-down on repeated
      misses, speed-up on clean streaks, target-tempo memory per item, "challenge" suggestions.
- [ ] **9.5 Scaffold fading:** overlay level per shape from mastery (full → outline → root → none),
      hint-on-hesitation, lapse recovery; indicator in the deck; per-session override.
- [ ] **9.6 Weakness analytics:** chord-change matrix, per-string mute rate, timing bias, recall-latency
      heat-map; "focus drill" generator that turns the worst item into a 2-minute drill.
- [ ] **9.7 Progress screen:** mastery map on the neck, streak calendar, minutes, personal bests, change
      matrix, timing chart (use the `dataviz` skill guidance for charts; colour-blind safe).
- [ ] **9.8 Goals & motivation:** goal paths weight the planner; streaks with a weekly "freeze";
      milestone badges tied to real skills (first clean G→C in under 2 s, all five pentatonic boxes…);
      no manipulative mechanics, no notifications by default.
- [ ] **9.9 Simulation harness** (`tools/sim`): three learner archetypes (fast, steady, inconsistent)
      driven by parametric skill curves → 30 simulated days → gates **G9.1–G9.3**; plots saved to
      `docs/benchmarks/sim/`.
- [ ] **9.10** Tag `v0.8`, deploy, 🎸 request: "use Today for three days; does the plan feel right?"

## Acceptance (exit gate)
G9.1–G9.3 pass; e2e: a fresh profile answering "never played" starts at lesson 1 with full scaffold; a
profile that passes the play-check starts later; after simulated mastery the same chord appears with a
reduced overlay; backup/restore preserves the learner model.

## Fallback ladder
- FSRS grades from automatic judging too noisy → use coarse 2-grade mapping (Again/Good) and widen
  intervals conservatively.
- Planner feels rigid in field test → expose block weights as three simple sliders (review / new / fun).
