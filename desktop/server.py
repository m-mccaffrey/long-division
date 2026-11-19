#!/usr/bin/env python3
"""Math Quest desktop server: serves the quests on localhost and keeps progress in a save file.

Usage: server.py [--port 8765] [--root DIR] [--data DIR]
"""
import argparse
import json
import os
import shutil
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

MAX_BODY = 5 * 1024 * 1024
KEEP_BACKUPS = 30


class Store:
    def __init__(self, data_dir):
        self.dir = data_dir
        self.path = os.path.join(data_dir, "save.json")
        self.backups = os.path.join(data_dir, "backups")
        os.makedirs(self.backups, exist_ok=True)

    def load(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def save(self, data):
        self._daily_backup()
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.path)

    def _daily_backup(self):
        # One copy per day of the save as it was before that day's first change.
        if not os.path.exists(self.path):
            return
        dest = os.path.join(self.backups, "save-%s.json" % time.strftime("%Y-%m-%d"))
        if not os.path.exists(dest):
            shutil.copy2(self.path, dest)
            old = sorted(n for n in os.listdir(self.backups) if n.startswith("save-"))
            for name in old[:-KEEP_BACKUPS]:
                os.remove(os.path.join(self.backups, name))


class Handler(SimpleHTTPRequestHandler):
    store = None

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        # Always serve fresh files so an update shows up on the next launch.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/save":
            return self._json(200, self.store.load())
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/save":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._json(400, {"error": "bad size"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError:
            return self._json(400, {"error": "bad json"})
        if not isinstance(data, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in data.items()):
            return self._json(400, {"error": "expected an object of strings"})
        self.store.save(data)
        return self._json(200, {"ok": True})

    do_POST = do_PUT


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--root", default=os.path.join(here, "app"))
    ap.add_argument("--data", default=os.path.expanduser("~/.local/share/math-quest"))
    args = ap.parse_args()
    Handler.store = Store(args.data)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=args.root))
    server.serve_forever()


if __name__ == "__main__":
    main()
