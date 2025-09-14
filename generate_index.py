#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_index.py
-----------------
Scan `docs/data` (or a specified directory) recursively and generate
`index.json` for MextDataViewer.

Usage:
  python3 generate_index.py                # scans ./docs/data and writes ./docs/data/index.json
  python3 generate_index.py --data-dir docs/data --label-mode full
  python3 generate_index.py --label-mode top
  python3 generate_index.py --dry-run

Label modes:
  - full   : Use the full relative directory path as the "folder" label (e.g., "NISTEP/2023/原本").
  - parent : Use only the immediate parent directory name.
  - top    : Use only the top-level directory name under data/.

Notes:
  - Only files with extensions in --ext are included (default: .csv,.tsv).
  - Hidden files/folders (starting with ".") are ignored.
  - Paths in JSON are POSIX-style (with "/") and always start with "data/".
"""

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List


def posix_path(p: Path) -> str:
    """Path -> POSIX style string (with forward slashes)."""
    return str(p).replace(os.sep, "/")


def is_hidden(path: Path) -> bool:
    """Return True if any path part starts with a dot (.)"""
    return any(part.startswith(".") for part in path.parts)


def build_label(rel_dir: Path, mode: str) -> str:
    """
    Build the dataset 'folder' label from a relative directory path under data/.
    - full   : "NISTEP/2023/原本"
    - parent : "原本"
    - top    : "NISTEP"
    """
    if rel_dir == Path(".") or rel_dir == Path(""):
        return "(root)"
    parts = rel_dir.parts
    if mode == "top":
        return parts[0]
    elif mode == "parent":
        return parts[-1]
    else:  # full
        return posix_path(rel_dir)


def main():
    ap = argparse.ArgumentParser(description="Generate docs/data/index.json for MextDataViewer")
    ap.add_argument("--data-dir", default="docs/data", help="Directory to scan (default: docs/data)")
    ap.add_argument("--label-mode", choices=["full", "parent", "top"], default="full",
                    help="How to build the 'folder' label from directory path (default: full)")
    ap.add_argument("--ext", default=".csv,.tsv",
                    help="Comma-separated extensions to include (default: .csv,.tsv)")
    ap.add_argument("--dry-run", action="store_true", help="Print JSON to stdout instead of writing the file")
    ap.add_argument("--encoding", default="utf-8", help="Encoding for writing index.json (default: utf-8)")
    args = ap.parse_args()

    base = Path(args.data_dir).resolve()
    if not base.exists():
        raise SystemExit(f"[ERROR] data-dir not found: {base}")

    include_exts = {e.strip().lower() for e in args.ext.split(",") if e.strip()}
    groups: Dict[str, List[Dict[str, str]]] = {}

    # Walk files under data/
    for p in base.rglob("*"):
        if not p.is_file():
            continue
        if is_hidden(p):
            continue
        if p.suffix.lower() not in include_exts:
            continue

        rel = p.relative_to(base)            # e.g., NISTEP/2023/原本/ファイル.csv
        rel_dir = rel.parent                 # e.g., NISTEP/2023/原本
        label = build_label(rel_dir, args.label_mode)
        json_path = "data/" + posix_path(rel)  # path from /docs/
        title = p.stem
