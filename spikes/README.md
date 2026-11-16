# Spikes (planning session, 2026-11-16)

Throw-away prototypes that back the plan. Results: `docs/research/02-spike-results.md`.

| Spike | Run | Needs |
|---|---|---|
| `edge_tracker/proto.py` — rectify-then-measure fretboard registration on synthetic frames. **Executable spec for `app/src/vision/edgeTracker.ts`.** | `python proto.py --trials 200 [--multistart] [--dump DIR]` | `numpy`, `opencv-python-headless` |
| `browser_harness/` — headless Chromium with a fake webcam + microphone running MediaPipe hands and onnxruntime-web. | copy `@mediapipe/tasks-vision` (`vision_bundle.mjs`, `wasm/` → `mpwasm/`), `onnxruntime-web/dist` → `ort/`, and `hand_landmarker.task` next to `index.html`; create `cam.y4m` and `mic.wav` with ffmpeg; serve on :8765; `node run.cjs` | Playwright, ffmpeg |
| `train_bench.py` — CPU training throughput of a ~1 M-parameter detector. | `python train_bench.py` | `torch`, `torchvision` |
