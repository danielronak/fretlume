#!/usr/bin/env bash
# One resumable training chunk (≤ 100 minutes), as background work in the container:
#   bash ml/train/run_chunk.sh [minutes]
# Resumes from ml/checkpoints/latest.pt; writes ml/checkpoints/necknet-ema.pt and log.jsonl.
set -euo pipefail
cd "$(dirname "$0")/.."
MINUTES="${1:-95}"
uv run --group train python -m train.train --minutes "$MINUTES" --threads 4 --workers 1
uv run --group train python -m train.bench --limit 2048 || true
