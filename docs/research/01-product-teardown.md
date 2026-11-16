# Research 01 — Product teardown and competitive landscape

Captured 2026-11-16 from the reference app's own website and its Microsoft Store listing
(description, release notes, 8 screenshots). The Instagram and TikTok pages (`guitarry_`)
could not be opened from the build sandbox (login wall + network policy); everything below
comes from the two public pages that could be read directly.

> **Originality rule.** The reference app defines the *functional bar* the user wants.
> We do not reuse its name, logo, copy, colour scheme, brushed-metal teal look, screenshots
> or any asset. Our app has its own name, visual identity, wording and content. See
> `CLAUDE.md` § Originality.

## 1. The reference app (Guitarry) — what it is

| Fact | Value |
|---|---|
| Platforms | Windows (Microsoft Store, x64) and macOS (Mac App Store). iOS "coming soon". Not a web app. |
| Price | USD 2.99 one-time (was a subscription before Oct 2026). No account, no trial. |
| Size | ~262 MB download, ~622 MB installed |
| Permissions | Webcam, microphone |
| Released | Aug 2026; last update Oct 2026 |
| Instruments | Standard 6-string acoustic or electric only. No bass, ukulele, 7+ strings. |
| Stated limit | *"It shows you the neck — it does not yet listen to your playing or grade it."* |

### 1.1 Core loop (from the site's "How it works")
1. **Pick a topic** — a chord, scale, triad or key.
2. **Frame your fretboard** — prop the guitar so the *whole* neck is in the laptop camera.
3. **Start learning** — the overlay is drawn on your strings; play along live.

### 1.2 Feature inventory (parity checklist)

| # | Feature | Detail seen in listing / screenshots |
|---|---|---|
| F1 | Live camera overlay | Finds strings and frets, draws note dots on the real neck. Mirrored (selfie) view. Dots sit between frets on each string; open-string notes are drawn beside the nut; root notes get a white ring. |
| F2 | Lock model | A "finding your neck" phase with on-screen camera messages, then a locked board. Buttons: **re-lock board**, **flip strings**, overlay size `− 1.0× +`, **End session**, full-screen toggle. |
| F3 | Floating "deck" panel over the video | Shows the same shape on a flat diagram; title of the current card; **Start / Restart / Loop / Back / Next**; **AUTO** advance with a seconds stepper (e.g. 6 s); "ONE SHAPE" mode; **Reset deck**; draggable (**MOVE**), collapsible. |
| F4 | Fretboard Library | Tabs: **Chords · Scales · Triads · Keys**. Root picker (12 pitch classes). Search box ("search by what you can describe, not just by name"). |
| F5 | Label modes | **Notes / Intervals / Fingers** (chords); Notes / Intervals (scales, triads). |
| F6 | CAGED everywhere | Chords: the 5 CAGED shapes of a chord across the neck, filter chips per shape, colour per shape. Scales: 5 CAGED scale positions, **Color by shape / Color by note**, full-neck view "not boxed into one shape". |
| F7 | Triads | String-set selector **654 / 543 / 432 / 321**; inversion filter **Root / 1st / 2nd**, colour per inversion. |
| F8 | Keys | Seven diatonic chords of a key with roman numerals and harmonic role (Tonic / Predominant / Dominant). |
| F9 | Neck profiles | Acoustic (15 frets drawn) vs electric (22 frets). |
| F10 | Practice runs | 3-step builder: *Choose material → Setup practice → Review & confirm*. Pick any cards from the library, step through them, save a run by name and reopen it. Scale notes "coloured to match their cards, and light up as they play". |
| F11 | Tuner | Chromatic, microphone-based; headstock graphic with six pegs; tap a peg to hear the reference tone; FLAT/SHARP needle ±50 cents; guided "start on low E" flow; handles mic unplug. |
| F12 | Tab editor | "Native string-and-fret editor"; techniques visible in screenshot: hammer-on (`2h4`), slide (`4/6`), bend (`6b1½`), muted (`x`), chord names above bars. **Create a tab** / **Import from this device**; "see it on the fretboard as you play". |
| F13 | Lessons, Playground | Named in the listing ("camera practice views, lessons, playground"); "How To Use" guides with a picture per step. No detail available. |
| F14 | Left-handed | String flip + mirrored camera view, remembered. |
| F15 | Privacy / data | All video processed locally; library, folders, favourites and tabs stored locally; export/restore a private backup from Settings. |

### 1.3 Camera framing (from the live screenshot) — drives our vision design
- Guitar resting on the player's lap/sofa, camera ~0.6–1 m away, **neck fills ~80 % of the frame
  width** (nut at ~6 % of width, 15th fret at ~86 %); neck tilted ~10–15°.
- The lock is taken with the **fretting hand off the neck**.
- Background is a real living room + the player's torso (clothing with print) directly behind
  the neck — the hardest clutter is *the player*, not the room.
- Acoustic body and the strumming hand enter the frame on one side.

## 2. Competitive landscape

| Product | Model | Notable | Gap we can exploit |
|---|---|---|---|
| **Guitarry** | Desktop, $2.99 | See above. Good library + CAGED + tabs. | Doesn't listen or grade; no hand tracking; desktop only; paid; closed. |
| **JamCam** (jamcam.io) | Browser, free tier + ~$14.99/mo Pro | Enter a chord progression + BPM, see best notes per chord change; guided solos; "AI coach". | Subscription; online. |
| **Fretcam** | Web | Real-time chord/note recognition, AR overlay, auto-tab. | Online/paid. |
| **GrabTab** | App | Record → tab; camera watches the fretting hand to pick string/fret. | Transcription only. |
| **Fretello Mirror** | Mobile | "AR mirror" inside a subscription course app. | Subscription. |
| Yousician / Simply Guitar / Rocksmith+ | Subscription | Listening + grading + curriculum, but **no on-instrument overlay**. | The combination is the opportunity. |
| LED hardware (Fret Zealot, Fretlight, LiteJam) | $100–$400 hardware | Lights on the neck. | We do it with a webcam for free. |

Open-source prior art (confirms feasibility, none is a finished product):
`DecoudJuan/Guitar-Learning` (browser; 4 clicks on the neck corners + NCC anchor tracking + MediaPipe hands),
`suryaj13/AR-Guitar-` (4-tap + Lucas–Kanade), `addetude/guitara` and `manbr21/Computer-Vision-Guitar-Tutor`
(ArUco markers stuck on the guitar), `winfieldhunter/guitar-AI` (YOLO for neck/frets/nut).
Research: *GuiFiR* (IEEE Access 2026) trains fretboard/hand pose from **synthetic composites** and notes that
off-the-shelf hand trackers (MediaPipe etc.) are imperfect on guitar grips — so finger-level visual feedback
must be treated as advisory and fused with audio (see `specs/02-audio.md`, `specs/01-vision.md` §7).

Datasets: no public dataset has fret/string keypoints. Roboflow Universe has a few small
fret/neck box datasets (need an API key → not used). GuitarSet (Zenodo) has audio with
string/fret annotations (optional audio evaluation). **Conclusion: train on synthetic data only.**

## 3. Where we go beyond (the "next level" list)

1. **It listens.** Note, chord and timing verification from the microphone; per-string diagnosis
   ("your B string is muted"); wait-mode that advances only when you play it right. *(The reference
   app explicitly does not do this.)*
2. **It sees your hand.** Finger-level guidance before you even strum ("ring finger is one string too low").
3. **A real curriculum.** Structured tracks from "never held a guitar" to CAGED/triads/modes, with
   measurable mastery gates instead of a reference library you browse.
4. **Personalisation.** Placement, adaptive tempo, spaced repetition of shapes, weakness analytics
   (slow chord changes, muted strings, rushing), a daily plan sized to your time, and overlays that
   *fade as you master a shape* (training wheels that come off).
5. **Songs & jam.** Play-along for your own Guitar Pro/MusicXML/ASCII tabs on the neck, public-domain
   song arrangements, generated backing tracks with scale-per-chord highlighting.
6. **Free, offline, everywhere.** Installable PWA (Windows, macOS, Linux, ChromeOS, Android, iPadOS/iOS
   Safari), ~30–40 MB instead of 262 MB, no account, no telemetry, open source.
7. **More instruments & setups.** Capo, alternate tunings, 7-string, bass, ukulele through one
   parametric instrument model.
8. **Robust lock.** Automatic lock *plus* a 4-tap manual lock that always works, and continuous
   tracking so the overlay survives a moving guitar.

## Sources
- https://guitarry.com/
- https://apps.microsoft.com/detail/9p34t47bzjq9
- https://jamcam.io/ · https://www.fretcam.com/ · https://grabtab.app/
- https://fretello.com/news/mirror-revolutionizing-guitar-learning-with-augmented-reality/
- https://github.com/DecoudJuan/Guitar-Learning · https://github.com/suryaj13/AR-Guitar- · https://github.com/addetude/guitara · https://github.com/manbr21/Computer-Vision-Guitar-Tutor · https://github.com/winfieldhunter/guitar-AI
- https://ailab.kookmin.ac.kr/publications/2026-07-15-guifir-weakly-supervised-learning-of-han/
- https://arxiv.org/abs/2603.23639 · https://zenodo.org/records/3371780
