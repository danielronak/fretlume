# ml/

Python side of Fretlume: the synthetic frame generator (`synth/`, Phase 3), training (`train/`, Phase 4),
ONNX export (`export/`) and evaluation (`eval/`). Environments are managed with `uv`:

```bash
cd ml
uv sync
uv run python -c "import cv2, numpy; print(cv2.__version__, numpy.__version__)"
```

Training-only dependencies (torch, onnx, onnxruntime) are added in Phase 4 as an optional group so that
fixture generation stays light.
