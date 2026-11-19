#!/usr/bin/env python3
"""Copy the quests' saved progress out of a Chromium profile into the desktop app's save file.

Chromium keeps each site's localStorage in a LevelDB folder ("Local Storage/leveldb"). This reads
that folder directly (log files + table files, including Snappy blocks) with only the standard
library, picks out the entries for one origin, and merges them into save.json.

Usage: import_chromium.py --origin https://m-mccaffrey.github.io [--profile DIR] [--data DIR] [--dry-run]
"""
import argparse
import glob
import json
import os
import struct
import sys


# ---------- Snappy (raw block format) ----------

def _varint(buf, pos):
    result = shift = 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, pos
        shift += 7


def snappy_decompress(buf):
    length, pos = _varint(buf, 0)
    out = bytearray()
    while pos < len(buf):
        tag = buf[pos]
        pos += 1
        kind = tag & 3
        if kind == 0:
            n = tag >> 2
            if n >= 60:
                extra = n - 59
                n = int.from_bytes(buf[pos:pos + extra], "little")
                pos += extra
            n += 1
            out += buf[pos:pos + n]
            pos += n
            continue
        if kind == 1:
            n = ((tag >> 2) & 7) + 4
            off = ((tag >> 5) << 8) | buf[pos]
            pos += 1
        elif kind == 2:
            n = (tag >> 2) + 1
            off = int.from_bytes(buf[pos:pos + 2], "little")
            pos += 2
        else:
            n = (tag >> 2) + 1
            off = int.from_bytes(buf[pos:pos + 4], "little")
            pos += 4
        start = len(out) - off
        for i in range(n):  # copies may overlap their own output
            out.append(out[start + i])
    if len(out) != length:
        raise ValueError("snappy length mismatch")
    return bytes(out)


# ---------- LevelDB reading ----------

def read_log(path):
    """Yield (seq, key, value_or_None) from a LevelDB write-ahead log."""
    data = open(path, "rb").read()
    records, pending = [], b""
    pos = 0
    while pos + 7 <= len(data):
        block_left = 32768 - (pos % 32768)
        if block_left < 7:
            pos += block_left
            continue
        length, rtype = struct.unpack_from("<HB", data, pos + 4)
        payload = data[pos + 7:pos + 7 + length]
        pos += 7 + length
        if rtype == 0:
            break
        if rtype == 1:
            records.append(payload)
        elif rtype == 2:
            pending = payload
        elif rtype == 3:
            pending += payload
        elif rtype == 4:
            records.append(pending + payload)
            pending = b""
    for rec in records:
        if len(rec) < 12:
            continue
        seq, count = struct.unpack_from("<QI", rec, 0)
        p = 12
        for i in range(count):
            kind = rec[p]
            p += 1
            klen, p = _varint(rec, p)
            key = rec[p:p + klen]
            p += klen
            if kind == 1:
                vlen, p = _varint(rec, p)
                yield seq + i, key, rec[p:p + vlen]
                p += vlen
            else:
                yield seq + i, key, None


def _block(data, offset, size):
    raw = data[offset:offset + size]
    ctype = data[offset + size]
    return snappy_decompress(raw) if ctype == 1 else raw


def _block_entries(block):
    num_restarts = struct.unpack_from("<I", block, len(block) - 4)[0]
    end = len(block) - 4 - 4 * num_restarts
    pos, key = 0, b""
    while pos < end:
        shared, pos = _varint(block, pos)
        unshared, pos = _varint(block, pos)
        vlen, pos = _varint(block, pos)
        key = key[:shared] + block[pos:pos + unshared]
        pos += unshared
        yield key, block[pos:pos + vlen]
        pos += vlen


def read_table(path):
    """Yield (seq, key, value_or_None) from a LevelDB .ldb/.sst table file."""
    data = open(path, "rb").read()
    footer = data[-48:]
    _, p = _varint(footer, 0)
    _, p = _varint(footer, p)
    idx_off, p = _varint(footer, p)
    idx_size, p = _varint(footer, p)
    for _, handle in _block_entries(_block(data, idx_off, idx_size)):
        off, q = _varint(handle, 0)
        size, _ = _varint(handle, q)
        for ikey, value in _block_entries(_block(data, off, size)):
            tag = struct.unpack_from("<Q", ikey, len(ikey) - 8)[0]
            yield tag >> 8, ikey[:-8], (value if tag & 0xFF == 1 else None)


def read_leveldb(folder):
    latest = {}
    files = glob.glob(os.path.join(folder, "*.ldb")) + glob.glob(os.path.join(folder, "*.sst"))
    entries = []
    for f in files:
        entries.extend(read_table(f))
    for f in glob.glob(os.path.join(folder, "*.log")):
        entries.extend(read_log(f))
    for seq, key, value in entries:
        if key not in latest or seq >= latest[key][0]:
            latest[key] = (seq, value)
    return {k: v for k, (s, v) in latest.items() if v is not None}


# ---------- Chromium localStorage encoding ----------

def _decode(b):
    if not b:
        return ""
    if b[0] == 0:
        return b[1:].decode("utf-16-le")
    return b[1:].decode("latin-1")


def local_storage_for(folder, origin):
    prefix = b"_" + origin.encode() + b"\x00"
    out = {}
    for key, value in read_leveldb(folder).items():
        if key.startswith(prefix):
            out[_decode(key[len(prefix):])] = _decode(value)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", required=True)
    ap.add_argument("--profile", default=os.path.expanduser("~/.config/chromium/Default"))
    ap.add_argument("--data", default=os.path.expanduser("~/.local/share/math-quest"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    folder = os.path.join(args.profile, "Local Storage", "leveldb")
    if not os.path.isdir(folder):
        print("No Chromium local storage at %s" % folder)
        return 0
    found = local_storage_for(folder, args.origin)
    print("Found %d saved entries for %s" % (len(found), args.origin))
    for k in sorted(found):
        print("  %s (%d bytes)" % (k, len(found[k])))
    if args.dry_run or not found:
        return 0

    os.makedirs(args.data, exist_ok=True)
    path = os.path.join(args.data, "save.json")
    current = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            current = json.load(f)
        with open(path + ".before-import", "w", encoding="utf-8") as f:
            json.dump(current, f, indent=1, sort_keys=True)
    # The browser copy wins for keys it has; anything only in the save file is kept.
    current.update(found)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(current, f, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, path)
    print("Imported into %s" % path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
