# Phase 12 — Packaging & 1.0

**Goal.** A polished, documented, legally clean 1.0 that anyone can install for free.
**Read first:** `MASTER_PLAN.md` §1, §4, §9; `CLAUDE.md` § Hard product rules.
**Sessions:** 2.

## Tasks
- [ ] **12.1 Install experience:** install prompts (desktop/Android), iOS "Add to Home Screen" guide,
      offline-ready indicator, update flow, storage-persistence request (`navigator.storage.persist()`),
      backup reminder (local, gentle).
- [ ] **12.2 Landing page** (same GitHub Pages site, `/`): what it is, how to frame the guitar, privacy
      statement, open-source link, "Open the app". Original illustrations and screenshots of *our* app.
- [ ] **12.3 Optional desktop wrappers (stretch, no owner cost):** Tauri v2 builds for Windows/macOS/Linux
      on GitHub Actions runners, unsigned, attached to the GitHub Release with a note about OS warnings.
      Skip if CI time or complexity is excessive — the PWA is the product.
- [ ] **12.4 Optional Android APK (stretch):** Trusted Web Activity (Bubblewrap) or Capacitor, built in CI,
      attached to the release (side-load). Store listings are out of scope (accounts/fees).
- [ ] **12.5 Documentation:** user guide (in-app Help + `docs/user/`), `CONTRIBUTING.md`, architecture
      overview with diagrams, model card, content authoring guide (how to add lessons/songs as data).
- [ ] **12.6 Audits:** licence audit (`docs/THIRD_PARTY.md` complete, in-app Licences screen), content
      audit (public-domain statuses), originality audit (no reference-app wording/assets/look),
      privacy audit (zero network at runtime; diagnostics/recording only on explicit action),
      bundle-size report, security review of file importers (size limits, parser fuzz smoke test).
- [ ] **12.7 Final regression:** full e2e + benches + scripted players; fix-or-document every failure.
- [ ] **12.8 Release:** changelog, tag `v1.0.0`, GitHub Release, deploy; `STATE.md` → maintenance mode with
      a prioritised backlog (ideas parked during the build).

## Acceptance (exit gate)
Every gate in MASTER_PLAN §4 is green or explicitly documented with its measured value and reason;
`docs/PARITY.md` complete; all audits recorded in `docs/audits/`; a fresh browser profile can go from
URL → install → offline → lock → lesson → listening feedback in an e2e test.
