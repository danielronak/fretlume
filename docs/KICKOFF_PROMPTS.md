# Kickoff prompts — copy/paste, nothing else needed

## The standing prompt (use this for almost every session)
```
Continue building Fretlume. Read CLAUDE.md and docs/STATE.md, then carry on with the next
unchecked task in the current phase. Work until the phase's exit gate passes or you hit a
blocker only I can clear. Commit and push after every green step and keep docs/STATE.md current.
```

## First build session (if the repo is brand new)
```
I created an empty GitHub repo called <owner>/<name> for Fretlume. Attach it with push access,
put the plan in it (from /home/user/fretlume if it still exists, otherwise read every file of
the plan artifact https://claude.ai/artifact/5bxogPgjSBccJHwsNQz1Sc and write them at the same
paths), then start Phase 0 per CLAUDE.md and docs/STATE.md.
```

## After a 🎸 field test
```
Field test for phase <N> done on <device/browser>. Diagnostics file attached. What I noticed:
<free text — what locked, what drifted, what it misheard>. Replay the bundle, add failures to the
regression set, fix what you can, then continue with docs/STATE.md.
```

## When you want to change direction
```
Decision for Fretlume: <e.g. rename the app to X / skip phase 10 / prioritise phone support>.
Record it in docs/DECISIONS.md and docs/STATE.md, adjust the affected phase files, then continue.
```

## Status check (cheap)
```
Give me a five-line status of Fretlume from docs/STATE.md: current phase, last gate numbers,
what is next, anything you need from me.
```
