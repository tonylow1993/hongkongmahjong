"""One persistent ONNX process. The compare script sends one table snapshot per line."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ai_assistant"))

from actor import choose_act  # noqa: E402
from local_onnx_engine import LocalONNXEngine  # noqa: E402

engine = LocalONNXEngine()
if not engine.ready:
    print(json.dumps({"error": "missing-model"}), flush=True)
    raise SystemExit(1)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    act = choose_act(engine, json.loads(line))
    if act is None:
        print(json.dumps({"error": "no-action"}), flush=True)
        continue
    print(json.dumps(act), flush=True)
