#!/bin/bash
# Install Math Quest as a desktop app for the current user (Raspberry Pi OS / any Linux with Chromium).
# Run from an extracted copy of the repository:  bash desktop/install.sh [--player older|younger]
# Safe to re-run: it updates the app and never touches saved progress except to import/merge it.
set -euo pipefail

PLAYER=""
ORIGIN="https://m-mccaffrey.github.io"
while [ $# -gt 0 ]; do
  case "$1" in
    --player) PLAYER="$2"; shift 2 ;;
    --origin) ORIGIN="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/math-quest"
DATA="$HOME/.local/share/math-quest"
PORT=8765

BROWSER="$(command -v chromium-browser || command -v chromium || true)"
if [ -z "$BROWSER" ]; then
  echo "Chromium is not installed (needed to show the app)." >&2
  exit 1
fi

echo "== Installing app files to $APP"
mkdir -p "$APP" "$DATA"
rm -rf "$APP/app.new"
mkdir -p "$APP/app.new"
(cd "$SRC" && for item in * ; do [ "$item" = desktop ] || cp -r "$item" "$APP/app.new/"; done)
rm -rf "$APP/app"
mv "$APP/app.new" "$APP/app"
cp "$SRC/desktop/server.py" "$SRC/desktop/import_chromium.py" "$SRC/desktop/icon.svg" "$APP/"

# Only on first install: later runs must never overwrite progress made in the app with older browser data.
if [ -f "$DATA/save.json" ]; then
  echo "== Keeping existing app progress (no browser import on re-install)"
else
echo "== Importing progress from the browser"
# The site's progress lived in Chromium's storage; copy the folder first so a running browser can't change it mid-read.
for PROFILE in "$HOME/.config/chromium/Default" "$HOME/.config/chromium/Profile 1"; do
  LS="$PROFILE/Local Storage/leveldb"
  [ -d "$LS" ] || continue
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/Local Storage"
  cp -r "$LS" "$TMP/Local Storage/"
  python3 -I "$APP/import_chromium.py" --origin "$ORIGIN" --profile "$TMP" --data "$DATA"
  rm -rf "$TMP"
done
fi

if [ -n "$PLAYER" ]; then
  echo "== Setting player profile: $PLAYER"
  python3 -I - "$DATA/save.json" "$PLAYER" <<'PY'
import json, os, sys
path, player = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
data["mathQuestPlayerProfile"] = player
with open(path + ".tmp", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
os.replace(path + ".tmp", path)
PY
fi

echo "== Creating launcher"
cat > "$APP/math-quest" <<EOF
#!/bin/bash
# Start the save-file server if it isn't running, then open the app window.
if ! python3 -c "import socket; socket.create_connection(('127.0.0.1', $PORT), 0.5)" 2>/dev/null; then
  nohup python3 "$APP/server.py" --port $PORT --root "$APP/app" --data "$DATA" >/dev/null 2>&1 &
  for i in \$(seq 1 50); do
    python3 -c "import socket; socket.create_connection(('127.0.0.1', $PORT), 0.2)" 2>/dev/null && break
    sleep 0.1
  done
fi
exec "$BROWSER" --app="http://127.0.0.1:$PORT/character/index.html" \\
  --user-data-dir="$DATA/browser" --class=MathQuest --no-first-run --start-maximized
EOF
chmod +x "$APP/math-quest"

DESKTOP_ENTRY="[Desktop Entry]
Type=Application
Name=Math Quest
Comment=Practice quests
Exec=$APP/math-quest
Icon=$APP/icon.svg
Terminal=false
Categories=Education;
StartupWMClass=MathQuest"

mkdir -p "$HOME/.local/share/applications"
echo "$DESKTOP_ENTRY" > "$HOME/.local/share/applications/math-quest.desktop"
DESK="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
mkdir -p "$DESK"
echo "$DESKTOP_ENTRY" > "$DESK/math-quest.desktop"
chmod +x "$DESK/math-quest.desktop" "$HOME/.local/share/applications/math-quest.desktop"
# Let the file manager launch it without asking (Raspberry Pi OS / PCManFM).
mkdir -p "$HOME/.config/libfm"
if [ -f "$HOME/.config/libfm/libfm.conf" ]; then
  grep -q '^quick_exec=' "$HOME/.config/libfm/libfm.conf" \
    && sed -i 's/^quick_exec=.*/quick_exec=1/' "$HOME/.config/libfm/libfm.conf" \
    || sed -i 's/^\[config\]$/[config]\nquick_exec=1/' "$HOME/.config/libfm/libfm.conf"
else
  printf '[config]\nquick_exec=1\n' > "$HOME/.config/libfm/libfm.conf"
fi
command -v gio >/dev/null && gio set "$DESK/math-quest.desktop" metadata::trusted true 2>/dev/null || true

echo "== Done. Saved progress: $DATA/save.json"
python3 -I -c "
import json; d = json.load(open('$DATA/save.json')) if __import__('os').path.exists('$DATA/save.json') else {}
for k in sorted(d):
    try: v = json.loads(d[k])
    except ValueError: v = d[k]
    print('  %-32s %s' % (k, 'level %s' % v.get('level') if isinstance(v, dict) and 'level' in v else repr(v)[:40]))
"
