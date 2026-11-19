# Phase 5 — Practice runs, playground, tabs (release v0.4 = reference-app parity)

**Goal.** Close every remaining parity item (P-F10, P-F12, P-F13) so that, feature for feature, the app
does everything the reference app does — free and offline.
**Read first:** `research/01-product-teardown.md` §1.2; `specs/04-learning.md` §1; `specs/03` §8; `specs/05-ux.md` §2, §4.
**Sessions:** 3–4. Independent of Phase 4 (works with manual lock).

## Tasks
- [x] **5.1 Session engine** (`learn/session.ts`): step list, deck transport (start, pause, restart,
      loop, back, next, auto-advance timer/bars), events; pure reducer with unit tests. `judge: 'none'`
      only in this phase.
- [x] **5.2 Practice-run builder:** three-step flow (choose cards from library/favourites/folders →
      order, repeats, seconds or bars per card, tempo, label/colour options → review); save by name;
      list, duplicate, edit, delete; run on Stage or on the flat diagram; "notes light up as they play"
      (app plays the shape with the string synth in time, the matching dots pulse).
- [x] **5.3 Playground:** free canvas — pick any item, stack up to 3 layers (e.g. chord + pentatonic +
      triads) with per-layer colour/opacity, quick root/position steppers, a progression strip (enter
      `C G Am F`, step through chords with their CAGED options), send to Stage.
- [x] **5.4 Tab model + playback engine:** `Tab` model, tick clock on the audio scheduler, string synth
      playback with techniques (hammer/pull = no re-pluck, slide = pitch glide, bend = pitch curve,
      mute = noise burst, palm mute = short decay), tempo %, loop A–B, count-in.
- [x] **5.5 Tab editor:** six-line grid; keyboard-first editing (arrows, digits incl. two-digit frets,
      duration keys, `h p / \ b r x ~`, bar insert/delete, copy/paste, undo/redo); touch editing with a
      fret pad; chord-symbol row; tuning/capo/tempo/time signature; autosave to IndexedDB.
- [x] **5.6 Import/export:** alphaTab for GP3–GP8 and MusicXML (pick the guitar track; map to `Tab`);
      ASCII tab parser; ChordPro chord sheets; export JSON and ASCII. Test files: author small fixtures
      in each text format; for binary GP formats generate fixtures with alphaTab's own exporter if
      available, else cover with MusicXML + ASCII and mark GP import "best effort" with a parser smoke test.
- [x] **5.7 Tab play-along on the neck and on the diagram:** current notes solid, upcoming notes as
      approaching rings (spec 05 §4), chord ghost one beat early, scrolling tab strip in the deck.
- [x] **5.8 Lessons shell + how-to guides:** lesson list and player UI running `explain`/`demo` sections
      (content arrives in Phase 8); 6 short how-to guides with our own illustrations.
- [x] **5.9 Parity audit.** Walk the checklist P-F1…P-F15 in `research/01` §1.2; for each, an e2e test id
      and a screenshot in `docs/screens/phase-5/parity/`. Write `docs/PARITY.md` (feature → status → evidence).
- [x] **5.10** Tag `v0.4`, deploy, update `STATE.md`.

## Acceptance (exit gate)
1. `docs/PARITY.md` shows all 15 parity features implemented with a passing e2e test each.
2. E2E: build a run of 4 cards → save → reload → reopen → auto-advance through it on Stage with the
   `track-hand` clip; create a tab with hammer-on/slide/bend → play it → export ASCII → re-import equal.
3. Importers: MusicXML + ASCII + ChordPro fixtures round-trip; malformed files give a friendly error.
4. Bundle still ≤ 40 MB first load (alphaTab is lazy-loaded only when importing).

## Fallback ladder
- alphaTab too heavy or licence/packaging trouble → lazy chunk; if still unusable, ship MusicXML + ASCII
  + ChordPro import and record GP import as a Phase 12 stretch.
- Editor scope creep → ship keyboard grid + essentials; advanced notation (tuplets, voices) out of scope.
