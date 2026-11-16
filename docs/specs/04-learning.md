# Spec 04 — Curriculum, lesson engine and personalisation

## 1. Session engine (shared by lessons, practice runs, tabs, songs, games)
A **session** is a sequence of **steps**. A step declares what is shown on the neck, what the player
should do, how it is judged, and when it ends.
```ts
interface Step {
  id: string;
  show: { shape?: ShapeRef; tab?: TabRange; text?: I18nKey; highlight?: Position[]; labels?: LabelMode; colors?: ColorMode };
  expect?: { kind: 'chord'|'notes-any-order'|'notes-in-order'|'tab'|'strum-pattern'|'hold'; target: … ;
             leniency?: 'relaxed'|'standard'|'strict' };
  advance: 'manual' | { auto: 'timer', seconds } | { auto: 'on-correct', holdMs? } | { auto: 'bars', n };
  tempo?: { bpm: number; adaptive?: boolean };
  scaffold?: 'full'|'outline'|'hint-on-hesitation'|'none';
  judge: 'none'|'audio'|'audio+vision';
}
```
- With no microphone permission every step degrades to `advance: manual/timer`, `judge: none` — which
  is exactly the reference app's behaviour. Listening is an enhancement, never a requirement.
- **Wait-mode** = `advance: on-correct`. **Loop**, **Back/Next**, **Restart**, **Auto n seconds** are deck
  controls over the same step list (parity features P-F3, P-F10).
- Each judged attempt emits an `AttemptEvent` (§5) — the only input to the learner model.

## 2. Lesson format
Lessons are data (`app/src/content/lessons/*.ts`, typed, validated in CI):
```ts
interface Lesson { id; track; title; summary; minutes; prerequisites: SkillId[]; teaches: SkillId[];
                   sections: Section[]; mastery: MasteryRule }
type Section =
 | { kind: 'explain', bodyKey, figure?: DiagramSpec }          // short text + diagram, never a wall of text
 | { kind: 'demo', steps: Step[] }                             // watch the overlay, app plays the sound
 | { kind: 'guided', steps: Step[] }                           // wait-mode with full scaffold
 | { kind: 'drill', drill: DrillSpec }                         // timed/tempo practice
 | { kind: 'check', steps: Step[], pass: PassRule }            // mastery gate
```
**Drill types:** one-minute chord changes (count clean changes), tempo ladder (metronome, +4 bpm after
3 clean reps, −6 after 2 misses), string-by-string chord check, scale up/down with rhythm, call-and-
response (ear), note-finder (find all the A's), triad walk (inversions along a string set), CAGED walk
(same chord through five shapes), strum-pattern trainer (onset timing only).

## 3. Curriculum (Phase 8 authors the lessons; this is the skeleton)
Tracks and approximate lesson counts (≈ 70 total; each 4–8 minutes):
1. **Start here (8)** — hold & tune, reading the overlay, first fretted notes, clean fretting, simple riffs on
   one string, two-string riffs, first rhythm, practice habits.
2. **Open chords & rhythm (16)** — Em, Am, E, A, D, G, C, Dm; switching pairs (one-minute changes);
   strumming patterns; first progressions (I–IV–V, I–V–vi–IV); G–C–D songs; F (small barre) ; 7th chords;
   sus/add colours; capo; public-domain songs.
3. **Lead basics (14)** — minor pentatonic box 1, alternate picking, bends/slides/hammer-ons (visual +
   audio pitch-contour check for bends), 5 pentatonic boxes, connecting boxes, blues scale, 12-bar blues
   soloing over the backing band, major pentatonic, phrasing games.
4. **Barre chords & the CAGED map (14)** — E- and A-form barres, power chords, the five forms of one
   chord, moving a progression up the neck, major-scale positions, linking chord forms to scale
   positions, arpeggios per position.
5. **Triads & harmony (12)** — triads on 321, 432, 543, 654; inversions; voice-leading a progression
   on one string set; keys and diatonic chords; roman-numeral progressions; modes as colours.
6. **Fretboard fluency (6)** — note names by string, octave shapes, interval shapes, note-finder speed runs.

**Skill graph.** ~120 skills (`chord:G`, `change:G→C`, `scale:Am-pent:box1`, `tech:hammer-on`,
`note:string6`, `triad:maj:321`, `rhythm:8ths-down-up`, …) with prerequisite edges. A lesson unlocks when
its prerequisites are *familiar*; the player can always override ("I know this — test me").

## 4. Learner model
Per skill `k`:
- `mastery ∈ [0,1]` — exponentially-weighted accuracy combined with a fluency term
  (`tempoAchieved / tempoTarget` or `changesPerMinute / target`), updated per AttemptEvent.
  Levels: new < 0.2 ≤ learning < 0.5 ≤ familiar < 0.8 ≤ mastered.
- **Memory items** (chord shapes, scale positions, note locations, triad shapes) are additionally
  scheduled with **FSRS** (`ts-fsrs`): a review = playing the shape from its *name only* (no overlay);
  grade derived automatically: Again (failed/needed full overlay), Hard (needed hint or > 2× target
  latency), Good, Easy (< target latency, clean).
- **Motor items** (changes, tempo drills) use the tempo ladder: store `bpmClean`, `bpmTarget`.

**Scaffold fading** (the overlay as training wheels): scaffold level for a shape is a function of its
mastery — full dots → outline dots → root only → nothing, with a hint appearing after 2.5 s of
hesitation or one wrong attempt. Always user-overridable per session.

## 5. Events and analytics (all local)
```ts
interface AttemptEvent { tMs; sessionId; stepId; skillIds; target; verdict; perNote; timingMs?; latencyMs;
                         scaffold; usedHint; source: 'audio'|'audio+vision'|'self-report' }
```
Derived, shown on the Progress screen and used by the planner:
- chord-change matrix (median seconds from last clean chord A to clean chord B),
- per-string mute/buzz rate per chord, most-confused finger placements,
- timing bias (ms early/late) and spread per tempo,
- note-recall latency heat-map over the fretboard,
- practice minutes, streak, lessons done, shapes mastered, tempo personal bests.

## 6. Placement and goals (onboarding, skippable, < 3 minutes)
Questions: handedness, guitar type, experience (never / a few chords / plays songs / intermediate),
goal (campfire songs · lead & blues · fingerstyle & theory · fretboard mastery), minutes per day
(5/10/20/30). Then an optional play-check: tune, play Em, change G→C→D for 20 s, play A-minor
pentatonic box 1 → seeds mastery values and the starting lesson. Without microphone: self-report sliders.

## 7. Daily plan generator
Input: time budget, goal weights, learner model. Output: an ordered session:
1. Warm-up (1–2 min): a mastered item at easy tempo.
2. Review (≈ 30 %): FSRS-due items, weakest first; capped.
3. New (≈ 40 %): next lesson on the goal-weighted track whose prerequisites are met (never more than
   2 new skills a day; none if the review backlog is large or yesterday's new skills are still < 0.3).
4. Target a weakness (≈ 15 %): the worst chord change / string / timing issue as a focused drill.
5. Fun (≈ 15 %): a song, jam or game using today's material.
Deterministic given (date, state) so tests can snapshot it. The player can swap or skip any block.

## 8. Feedback copy
Rule-based, short, specific, kind. Template keys chosen from the verdict:
`string_muted(n)`, `finger_one_fret_low(finger, string)`, `rushing(ms)`, `clean_streak(n)`,
`tempo_up(bpm)`, `try_string_by_string`, `great_change(a,b,seconds)`. Maximum one correction at a time,
most important first (wrong note > missing note > timing > tone). Celebrate improvements against the
player's own history, not absolute standards.

## 9. Gates
| ID | Gate |
|---|---|
| G8.1 | All lessons validate against the schema; every referenced shape/skill exists; no orphan skills; the graph is acyclic |
| G8.2 | A scripted "perfect player" (fixtures synthesized from each step's target) completes every lesson end-to-end in e2e |
| G8.3 | A scripted "struggling player" (30 % faulty fixtures) gets targeted feedback and is not falsely passed on > 5 % of faulty attempts in standard leniency |
| G9.1 | Planner property tests: respects time budget ±10 %, never schedules a locked lesson, review share bounds, deterministic |
| G9.2 | Simulation: 30 simulated days for 3 learner archetypes → no starvation, backlog bounded, tempo targets rise for the fast learner and hold for the slow one |
| G9.3 | Scaffold fading: overlay level decreases monotonically with mastery in the simulation and returns after lapses |
