# Research 02 — Feasibility spikes (run 2026-11-16 in the cloud build container)

Container: 4 vCPU, 15 GB RAM, no GPU, Node 22, Python 3.13, ffmpeg, Java, Chromium + Playwright 1.63
pre-installed. These results are the evidence behind the architecture decisions in `MASTER_PLAN.md`.

## S1 — The agent can test camera + microphone code with no human  ✅
`spikes/browser_harness/` — headless Chromium launched by Playwright with
`--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<file.y4m>
--use-file-for-fake-audio-capture=<file.wav> --use-fake-ui-for-media-stream`.

| Check | Result |
|---|---|
| `getUserMedia` video | 1280×720 frames delivered from a `.y4m` file |
| `getUserMedia` audio | 110 Hz sine WAV measured as 110.36 Hz through an AnalyserNode (44.1 kHz context) |
| MediaPipe Hand Landmarker (`@mediapipe/tasks-vision` 1.2.3, self-hosted wasm + `.task`) | runs: CPU delegate 81 ms/frame, GPU delegate works through SwiftShader (567 ms — test only) |
| `onnxruntime-web` 1.31.1 self-hosted | loads |
| WebGPU in headless | `navigator.gpu` present with `--enable-unsafe-webgpu` |
| `crossOriginIsolated` | false on a plain static server → no SharedArrayBuffer → ORT WASM is single-threaded unless COOP/COEP headers are served |
| Canvas2D 1280×720 `getImageData` | 36 ms in software rendering (expect 2–5 ms on real hardware) |

**Consequences.** Every vision and audio feature gets an automated end-to-end test driven by a
rendered video file and a synthesized audio file. Performance numbers measured in the container
are *not* representative (software GL); performance gates use relative budgets and are confirmed
in the user's field test.

## S2 — Hosts reachable from the container
Reachable: npm registry, PyPI, `storage.googleapis.com` (MediaPipe model files), `raw.githubusercontent.com`,
`dl.google.com`. After user approval on 2026-11-16: `guitarry.com`, `apps.microsoft.com`,
`store-images.s-microsoft.com`.
Blocked: `huggingface.co`, `download.pytorch.org`, `zenodo.org`, `*.wikimedia.org`, `pexels.com`,
`universe.roboflow.com`, `kaggle.com`, `cdn.jsdelivr.net`, GitHub release downloads (`github.com/.../releases` → 403).

**Consequences.** (1) Everything needed for the build comes from npm/PyPI/apt or is generated.
(2) PyTorch installs from PyPI (the CUDA build, 5.7 GB venv; works on CPU). (3) Optional real-media
evaluation needs an environment allowlist change — see Phase 0, task 0.7.

## S3 — CPU-only training is fast enough for the models we need  ✅
`spikes/train_bench.py` — MobileNetV3-small encoder + light decoder, 0.99 M params, torch 2.15, 4 threads:

| Input | Train throughput | Inference (PyTorch CPU) |
|---|---|---|
| 160×288 | 85 img/s (≈ 300 k images/hour) | 16 ms |
| 224×384 | 46 img/s | 16 ms |

**Consequences.** A 1–2 M-sample synthetic training run fits in 4–8 h of CPU, i.e. several resumable
≤100-minute background chunks, or a single free GitHub Actions job (6 h limit).

## S4 — Classical "rectify-then-measure" registration is precise, but has a narrow basin  ✅ / ⚠️
`spikes/edge_tracker/proto.py` (Python reference, ~350 lines; read it before writing the TS port).
Synthetic 1280×720 frames: procedurally textured neck, random homography, clutter, blur, noise,
hand-like occluder. Start from the true homography with Gaussian noise of σ px on each of the four
board corners, refine, and report the worst error over frets 0–17 × 3 strings.

| Init corner noise σ | Worst-fret error after refine (median, fret spacings) | Worst across error (median, string spacings) | Success* single start | Success* 9-start |
|---|---|---|---|---|
| 2 px | 0.017 | 0.08 | **100 %** | 100 % |
| 5 px | 0.017–0.019 | 0.13 | 78 % | 85 % |
| 8 px | 0.022 | 0.19–0.27 | 50 % | 60 % |
| 12 px | 0.03 | 0.47–0.69 | 27 % | 32 % |
| 16 px | >1 | >1 | 3 % | 20 % |

\*success = worst along-error < 0.25 fret **and** worst across-error < 0.35 string spacing.
Cost: ≈ 8 ms per iteration in Python/OpenCV (768×128 strip).

What made it work (keep these in the port):
1. **Rectify first.** Warp the neck into a canonical strip with the current homography; all
   measurements become axis-aligned 1-D problems.
2. **Fret evidence = second derivative along the neck** (`-d²I/dx²`, clamp ≥ 0) and a **median over
   rows** — strings, inlays and fingers disappear from the column profile.
3. **Global comb alignment** (3 anchor frets → 1-D projective map, exhaustive small grid) before
   any local peak search. Purely local search aliases onto the neighbouring fret: success at σ = 5 px
   went 38 % → 78–85 % with the comb.
4. **Two bands (bass half / treble half)** measured separately to recover skew.
5. **Fret-wire ends as the across-neck cue** (the wire stops exactly at the board edge): across error
   0.24 → 0.08 string spacings. Generic "strongest horizontal edge" was not good enough.
6. Weighted DLT + Tukey IRLS for the re-fit.

What it means for the design:
- **Tracking is solved by this method.** Frame-to-frame motion gives an init error of ≤ 2–3 px, where
  the method is at 100 % and sub-2 %-of-a-fret accurate. No neural network is needed per frame.
- **Lock (initialisation) needs a start within ≈ ±3–5 px corner error.** A coarse detector alone will not
  deliver that. Required ladder (Phase 3/4): manual 4-tap with a magnifier loupe → pyramid + multi-start
  → (if the gate still fails) a small learned strip refiner. Gate numbers are in `specs/01-vision.md` §9.
- **The fret comb is self-similar.** Shifting every fret index by one is an (almost) exact projective
  symmetry of the wire pattern, so wires alone can never tell fret 3 from fret 4. The nut (and inlays,
  headstock) must anchor the index, and the UI must let the user confirm/nudge it. See `specs/01-vision.md` §5.

## Not yet tested (first tasks of the relevant phases)
- Real-guitar imagery (the synthetic textures here are crude). Phase 4 builds a much richer generator and
  a small real "golden set"; the user's field test is the final word.
- TS/WASM speed of the tracker on real hardware (expected 3–6 ms per frame; Phase 3 gate).
- MediaPipe hand accuracy on real fretting hands (Phase 7; known to be imperfect → advisory use only).
