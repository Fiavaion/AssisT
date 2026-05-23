#!/usr/bin/env python3
"""
split-chapters.py — Split an OBS MKV recording into per-chapter MP4 files.

Usage:
    python split-chapters.py <input.mkv>
    python split-chapters.py <input.mkv> --output-dir ./my-output
    python split-chapters.py <input.mkv> --list-only

Requires ffmpeg and ffprobe on PATH.
Output files are named  NN_slug.mp4  using the order from metadata.json.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

TOOLS_DIR  = Path(__file__).parent
META_FILE  = TOOLS_DIR / "metadata.json"
OUTPUT_DIR = TOOLS_DIR / "output"


def run(cmd, **kwargs):
    return subprocess.run(cmd, check=True, **kwargs)


def probe_chapters(input_path: Path) -> list[dict]:
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_chapters",
            str(input_path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    data = json.loads(result.stdout)
    return data.get("chapters", [])


def hms(seconds: float) -> str:
    seconds = float(seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


def load_panel_order(meta_file: Path) -> list[str]:
    with open(meta_file, encoding="utf-8") as f:
        meta = json.load(f)
    return [p["file"] for p in sorted(meta["panels"], key=lambda p: p["order"])]


def extract_chapter(input_path: Path, start: str, end: str | None, out_path: Path):
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-ss", start,
    ]
    if end:
        cmd += ["-to", end]
    cmd += [
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        str(out_path),
    ]
    run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def validate(out_path: Path, min_duration: float = 10.0) -> bool:
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            str(out_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return False
    try:
        duration = float(json.loads(result.stdout)["format"]["duration"])
        return duration >= min_duration
    except (KeyError, ValueError, json.JSONDecodeError):
        return False


def main():
    parser = argparse.ArgumentParser(description="Split OBS MKV into per-chapter MP4 files")
    parser.add_argument("input", help="Path to OBS MKV recording")
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR), help="Directory for output MP4s")
    parser.add_argument("--list-only", action="store_true", help="Print chapters without splitting")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Probing chapters in {input_path.name} ...")
    chapters = probe_chapters(input_path)

    if not chapters:
        print("WARNING: No embedded chapter markers found in this file.")
        print("Make sure OBS recorded in MKV format with chapter markers enabled.")
        print("\nIf you recorded in MP4 format, convert first:")
        print(f"  ffmpeg -i {input_path} -c copy recording.mkv")
        sys.exit(1)

    panel_files = load_panel_order(META_FILE)
    print(f"\nFound {len(chapters)} chapters in recording, {len(panel_files)} panels in metadata.json")

    if len(chapters) != len(panel_files):
        print(f"\nWARNING: Chapter count mismatch ({len(chapters)} vs {len(panel_files)} panels).")
        print("Chapters will be named by index. Rename output files manually if needed.\n")

    if args.list_only:
        print("\nChapters detected:")
        for i, ch in enumerate(chapters):
            start = hms(ch["start_time"])
            end   = hms(ch["end_time"])
            title = ch.get("tags", {}).get("title", f"Chapter {i+1}")
            out   = panel_files[i] if i < len(panel_files) else f"{i+1:02d}_unknown.mp4"
            print(f"  [{i+1:02d}] {start} → {end}  {title!r}  →  {out}")
        return

    print(f"\nSplitting into {output_dir}/\n")
    errors = []
    for i, ch in enumerate(chapters):
        start = ch["start_time"]
        end   = ch["end_time"] if float(ch["end_time"]) > 0 else None
        if i < len(panel_files):
            out_name = panel_files[i]
        else:
            out_name = f"{i+1:02d}_chapter-{i+1}.mp4"

        out_path = output_dir / out_name
        title = ch.get("tags", {}).get("title", f"Chapter {i+1}")
        print(f"  [{i+1:02d}/{len(chapters)}] {hms(float(start))} → {hms(float(end)) if end else 'end'}  →  {out_name}", end=" ", flush=True)

        try:
            extract_chapter(input_path, str(float(start)), str(float(end)) if end else None, out_path)
            ok = validate(out_path)
            if ok:
                size_mb = out_path.stat().st_size / 1_048_576
                print(f"✓ ({size_mb:.1f} MB)")
            else:
                print(f"✗ VALIDATION FAILED (too short or corrupt)")
                errors.append(out_name)
        except subprocess.CalledProcessError as e:
            print(f"✗ FFMPEG ERROR")
            errors.append(out_name)

    print(f"\n{'='*60}")
    if errors:
        print(f"DONE with {len(errors)} error(s):")
        for e in errors:
            print(f"  ✗ {e}")
        sys.exit(1)
    else:
        print(f"DONE — {len(chapters)} clips written to {output_dir}/")
        print("Next step: run upload-youtube.py")


if __name__ == "__main__":
    main()
