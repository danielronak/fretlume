# Phase 8 — Curriculum & songs (release v0.7)

**Goal.** A complete, structured course from first note to CAGED/triads, taught on the player's own
neck with listening feedback, plus songs to play.
**Read first:** `specs/04-learning.md` §1–§3, §8, §9; `specs/03` §8; `specs/05-ux.md` §2.
**Sessions:** 4–5.

## Tasks
- [ ] **8.1 Lesson engine:** schema + validator (CI), section players (explain, demo, guided, drill,
      check), drill implementations (one-minute changes, tempo ladder, string-by-string, scale run,
      call-and-response, note-finder, triad walk, CAGED walk, strum-pattern), mastery rules, resume state.
- [ ] **8.2 Skill graph:** ~120 skills with prerequisites as data; validator (acyclic, no orphans); skill
      map view on Learn.
- [ ] **8.3 Author track 1 "Start here" (8) and track 2 "Open chords & rhythm" (16).**
      Writing rules: ≤ 60 words per explain card; one idea per card; every lesson has demo → guided →
      drill → check; total 4–8 minutes; kind, plain language; no jargon before it is introduced.
- [ ] **8.4 Author track 3 "Lead basics" (14)** incl. bend pitch-contour check (target semitone ± 30 cents)
      and slides/hammer-ons (onset pattern + pitch sequence).
- [ ] **8.5 Author track 4 "Barre chords & the CAGED map" (14) and track 5 "Triads & harmony" (12),
      track 6 "Fretboard fluency" (6).**
- [ ] **8.6 Songs (≥ 15 original arrangements of public-domain pieces)** in three difficulty tiers —
      candidates: Ode to Joy, Amazing Grace, Scarborough Fair, Greensleeves, House of the Rising Sun
      (traditional), Auld Lang Syne, Oh! Susanna, Shenandoah, Wayfaring Stranger, Aura Lee, Für Elise
      (theme), Spanish Romance (anon.), Londonderry Air, Simple Gifts, When the Saints Go Marching In,
      12-bar blues studies (original). For each: verify public-domain status of the composition, write
      melody tab + chord strum arrangement yourself, record the source/status in
      `content/songs/LICENSES.md`. Each song links to the lessons that teach its chords.
- [ ] **8.7 Scripted-player e2e:** perfect player completes every lesson (**G8.2**); struggling player
      gets targeted feedback (**G8.3**). Runs in the nightly workflow (long).
- [ ] **8.8 Content QA:** generate a printable "course book" HTML (all lessons with diagrams) and review
      screenshots of every lesson for diagram correctness and tone; fix issues.
- [ ] **8.9** Tag `v0.7`, deploy.

## Acceptance (exit gate)
G8.1–G8.3 pass; ≥ 70 lessons and ≥ 15 songs present; every lesson reachable from the skill map; the
course works with microphone denied (self-report mode) and without a camera (flat diagram mode).

## Fallback ladder
- Authoring volume: ship tracks 1–3 + songs as v0.7 and tracks 4–6 as v0.7.1 — never lower the per-lesson
  quality bar to hit the count.
- A drill's judging proves unreliable (e.g. bends) → make that drill self-assessed with the pitch
  contour shown as visual feedback.
