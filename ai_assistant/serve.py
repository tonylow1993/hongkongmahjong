"""Local advice server. The browser posts the live table here.

  pip install onnxruntime numpy
  python ai_assistant/serve.py
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from actor import choose_act
from local_onnx_engine import LocalONNXEngine, get_engine
from reasoning_engine import advise
from state_encoding import snapshot_to_arrays

ENGINE = get_engine()


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, b"")

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/status":
            self._send(404, b"{}")
            return
        body = json.dumps({"ready": ENGINE.ready}).encode()
        self._send(200, body)

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length") or 0)
        snap = json.loads(self.rfile.read(n) or b"{}")
        level = snap.get("level")
        engine = get_engine(level)
        if self.path == "/act":
            act = choose_act(engine, snap)
            if act is None:
                self._send(503, b'{"error":"model-missing"}')
                return
            self._send(200, json.dumps(act).encode())
            return
        if self.path != "/advise":
            self._send(404, b"{}")
            return
        arrays = snapshot_to_arrays(snap)
        model = engine.infer(arrays)
        body = json.dumps(advise(snap, arrays, model), ensure_ascii=False).encode()
        self._send(200, body)

    def log_message(self, fmt: str, *args) -> None:
        return

    def _send(self, code: int, body: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("AI 戰術教練 http://127.0.0.1:8765/advise")
    print("對局動作 http://127.0.0.1:8765/act")
    print("model", "ready" if ENGINE.ready else "missing models/hk_mahjong_agent.onnx（仍可用規則說明）")
    ThreadingHTTPServer(("127.0.0.1", 8765), Handler).serve_forever()
