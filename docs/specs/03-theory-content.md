# Spec 03 — Music-theory engine and library content

All of this is pure TypeScript in `app/src/core/theory` with exhaustive unit tests. The library the
user browses is *generated* by this engine from small hand-authored seed tables.

## 1. Primitives
```ts
type PitchClass = 0..11            // 0 = C
type Midi = number                 // E2 = 40
interface Tuning { id; name; strings: Midi[] }   // index 0 = string 1 (high e): standard = [64,59,55,50,45,40]
interface Position { string: 1..N; fret: number }            // fret 0 = open
interface Mark extends Position {
  midi: Midi; pc: PitchClass; degree?: string;               // '1','b3','#4'…
  finger?: 0|1|2|3|4|'T'; role?: 'root'|'tone'|'ghost'|'muted'|'open'; group?: string; // group = CAGED shape / inversion id
}
interface Shape { id; kind:'chord'|'scale'|'triad'|'arpeggio'|'interval'|'notes'; title; marks: Mark[];
                  window:[minFret,maxFret]; meta }
```
`noteAt(tuning, capo, position)`, enharmonic spelling by key context (sharp keys spell sharps, flat keys
flats; default table for the 12 roots matches common practice: C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab,
A, A#/Bb, B), interval naming, transposition. Capo `c`: frets are numbered relative to the capo in the
UI, absolute on the neck for drawing.

## 2. Chords
- **Quality table** (formula in semitones + symbol aliases): maj, min, 5, sus2, sus4, 7, maj7, m7, m7b5,
  dim, dim7, aug, 6, m6, add9, madd9, 9, maj9, m9, 11, 13, 7sus4, 7#9, 7b9, mMaj7, 6/9 (+ slash bass).
- **Seed voicings** (hand-authored, with fingerings): ~45 open chords; movable forms for each CAGED
  shape (E-, A-, C-, G-, D-form) in maj/min/7/maj7/m7/sus; power chords; common jazz shells (root on 6/5).
  Stored as `{ frets: [e,B,G,D,A,E] with −1 = muted, fingers: [...], barre?: {fret, from, to}, form }`.
- **CAGED chord set**: for root R and quality Q, the five forms placed along the neck, each tagged
  `group: 'C'|'A'|'G'|'E'|'D'` — drives the "5 shapes across the fretboard" view with per-shape colour.
- **Voicing generator** for qualities without seeds: enumerate fret assignments within a 4-fret span
  (5 with open strings), require root or specified bass in the lowest voice, all essential tones
  (3rd/7th before 5th), ≤ 4 fingers with barre logic, no interior muted string unless reachable; rank by
  an ergonomic cost (span, finger count, barre length, string skips) and keep the top 3 per position.
- **Fingering inference** for any voicing lacking fingers: sort notes by fret then string; detect barre
  (lowest fret covering ≥ 2 strings with nothing lower between); assign 1–4 by ascending fret; tests
  against all seed fingerings (≥ 90 % exact agreement).
- **Reverse lookup**: set of positions → chord names (root candidates, inversions, slash).

## 3. Scales and positions
- **Scale table**: major + 7 modes, natural/harmonic/melodic minor, major & minor pentatonic, blues
  (major/minor), whole-tone, diminished (HW/WH), phrygian dominant, lydian dominant, altered, bebop
  dominant, harmonic major, Hungarian minor. Each with degrees and descriptive tags (§6).
- **Full-neck marks**: every position 0…maxFret whose pitch class is in the scale; `role: 'root'` on roots.
- **CAGED positions (5)**: defined for the major scale by five *templates* anchored on the root positions
  of the corresponding chord form (E-form: root on string 6; D-form: root on string 4; C-form: root on
  string 5 (high side); A-form: root on string 5; G-form: root on string 6 (high side)). Each template is
  a per-string fret-offset list relative to the anchor root. Other 7-note scales reuse the templates of
  their parent major (modes) or are derived by altering degrees in place and re-fitting to the window
  (harmonic/melodic minor). Pentatonics/blues are subsets (+ blue note). `group` = shape letter;
  adjacent positions overlap — shared notes carry both groups (rendered as split-colour dots).
- **3-notes-per-string (7 positions)** as an alternative segmentation.
- **Reference tests (must pass):** A minor pentatonic box 1 = strings 6→1 frets (5,8)(5,7)(5,7)(5,7)(5,8)(5,8);
  G major E-form position = (2,3,5)(2,3,5)(2,4,5)(2,4,5)(3,5)(2,3,5) on strings 6→1 (window rule, DECISIONS D-009); C major open position;
  every position of every key contains only scale tones and spans ≤ 5 frets (≤ 6 for 3NPS);
  the union of the five positions equals the full-neck set between the lowest and highest position.

## 4. Triads, arpeggios, intervals
- **Triads**: qualities maj/min/dim/aug × string sets {654, 543, 432, 321} (also spread sets 6-4-3 etc.
  as an extension) × inversions root/1st/2nd, enumerated along the neck in close voicing (span ≤ 4);
  `group` = inversion. Test: C major on string set 321, ascending the neck = e:0/B:1/G:0 (2nd inversion, G–C–E),
  e:3/B:5/G:5 (root position, C–E–G), e:8/B:8/G:9 (1st inversion, E–G–C), e:12/B:13/G:12 (2nd inversion
  again); exactly 3 voicings per string set per octave, cycling root → 1st → 2nd going up.
- **Arpeggios**: chord tones laid out per CAGED position.
- **Intervals**: all shapes of an interval from a chosen root (for ear/fretboard games).
- **Note finder**: all positions of a pitch class.

## 5. Keys and harmony
- For major and the three minors: seven diatonic triads and sevenths, roman numerals, harmonic role
  (tonic / predominant / dominant), relative and parallel keys, common progressions
  (I–V–vi–IV, ii–V–I, I–IV–V, 12-bar blues, vi–IV–I–V, i–bVII–bVI–V, …), secondary dominants,
  borrowed chords, capo suggestions ("play in G shapes with capo 2").
- **Chord-scale map** for jam mode: for chord X in key K → recommended scale(s) and target tones (chord
  tones highlighted, avoid notes dimmed).

## 6. Library index and "search by description"
Every generated item gets: canonical name, aliases (`Cmaj7`, `CΔ`, `C major seventh`), tags
(mood: happy/sad/dark/dreamy/tense/bluesy/jazzy/spanish/eastern/funky; use: campfire/rock/blues/jazz/metal;
difficulty 1–5; technique: open/barre/movable; position), and structural facets (root, quality, string set).
Search = MiniSearch over names + aliases + tags with fuzzy matching and a tiny query grammar:
`"sad chords in G"`, `"bluesy scale A"`, `"easy F"`, `"triads on top three strings"`, `"what has C E G"`.
Tests: 60 query → expected-top-3 pairs.

## 7. Display options (shared by diagram and camera overlay)
Label mode: note names · intervals/degrees · fingers · none. Colour mode: by shape (CAGED / inversion) ·
by note (12-colour wheel) · by degree (root/3rd/5th/7th palette) · by finger · single colour.
Root emphasis ring. Left-handed mirroring. Fret range. All palettes have colour-blind-safe variants.

## 8. Songs and tabs (data model)
```ts
interface Tab { id; title; tuning; capo; tempoBpm; timeSig; tracks: [{ bars: Bar[] }] }
interface Bar { beats: Beat[]; chordSymbol?: string }
interface Beat { durTicks; notes: { string; fret; tech?: 'h'|'p'|'/'|'\\'|'b'|'r'|'~'|'x'|'pm'; bendSemis? }[]; rest? }
```
Importers → this model: alphaTab (GP3–GP8, MusicXML), ASCII tab parser (6-line blocks, bar lines,
`h p / \ b r x ~`), ChordPro (chord sheet → strum-along with bars estimated from the time signature).
Exporters: JSON, ASCII. Bundled songs are original arrangements of public-domain pieces only
(Phase 8 lists candidates; verify public-domain status of the *composition* — published before 1929 or
traditional — and write the arrangement yourself).
