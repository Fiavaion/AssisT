#!/usr/bin/env python3
"""
upload-youtube.py — Upload AssisT how-to videos to YouTube with scheduled publishing.

Usage:
    python upload-youtube.py                   # Upload all videos
    python upload-youtube.py --from 5          # Resume from video #5 (1-indexed order)
    python upload-youtube.py --only 1,3,28     # Upload specific videos by order number
    python upload-youtube.py --dry-run         # Print metadata without uploading
    python upload-youtube.py --list            # List all videos and their status

Requires:
    pip install google-api-python-client google-auth-oauthlib

Run setup-oauth.py first to generate token.json.
"""

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

TOOLS_DIR   = Path(__file__).parent
META_FILE   = TOOLS_DIR / "metadata.json"
TOKEN_FILE  = TOOLS_DIR / "token.json"
SECRETS     = TOOLS_DIR / "client_secrets.json"
OUTPUT_DIR  = TOOLS_DIR / "output"
LOG_FILE    = TOOLS_DIR / "upload-log.csv"

SCOPES      = ["https://www.googleapis.com/auth/youtube.upload",
               "https://www.googleapis.com/auth/youtube"]
CHUNK_SIZE  = 1024 * 1024 * 8   # 8 MB resumable upload chunks
DELAY_SECS  = 30                 # between uploads — quota safety


def load_meta() -> dict:
    with open(META_FILE, encoding="utf-8") as f:
        return json.load(f)


def build_youtube_client():
    try:
        from googleapiclient.discovery import build
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
    except ImportError:
        print("ERROR: Required packages not installed.")
        print("Run: pip install google-api-python-client google-auth-oauthlib")
        sys.exit(1)

    if not TOKEN_FILE.exists():
        print(f"ERROR: {TOKEN_FILE} not found. Run setup-oauth.py first.")
        sys.exit(1)

    token_data = json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    creds = Credentials(
        token         = token_data.get("token"),
        refresh_token = token_data.get("refresh_token"),
        token_uri     = token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id     = token_data.get("client_id"),
        client_secret = token_data.get("client_secret"),
        scopes        = token_data.get("scopes", SCOPES),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_data["token"] = creds.token
        TOKEN_FILE.write_text(json.dumps(token_data, indent=2), encoding="utf-8")

    return build("youtube", "v3", credentials=creds)


def get_or_create_playlist(youtube, playlist_title: str, playlist_cache: dict) -> str:
    if playlist_title in playlist_cache:
        return playlist_cache[playlist_title]

    response = youtube.playlists().list(
        part="snippet",
        mine=True,
        maxResults=50,
    ).execute()

    for pl in response.get("items", []):
        if pl["snippet"]["title"] == playlist_title:
            playlist_cache[playlist_title] = pl["id"]
            return pl["id"]

    create_response = youtube.playlists().insert(
        part="snippet,status",
        body={
            "snippet": {
                "title":       playlist_title,
                "description": f"AssisT accessibility extension — {playlist_title}",
                "defaultLanguage": "en-GB",
            },
            "status": {"privacyStatus": "public"},
        },
    ).execute()

    pl_id = create_response["id"]
    playlist_cache[playlist_title] = pl_id
    print(f"    Created playlist: {playlist_title!r} ({pl_id})")
    return pl_id


def add_to_playlist(youtube, video_id: str, playlist_id: str):
    youtube.playlistItems().insert(
        part="snippet",
        body={
            "snippet": {
                "playlistId": playlist_id,
                "resourceId": {
                    "kind":    "youtube#video",
                    "videoId": video_id,
                },
            },
        },
    ).execute()


def upload_video(youtube, panel: dict, defaults: dict, dry_run: bool) -> str | None:
    from googleapiclient.http import MediaFileUpload

    mp4_path = OUTPUT_DIR / panel["file"]
    if not mp4_path.exists():
        print(f"    SKIP — file not found: {mp4_path}")
        return None

    tags = panel["tags"] + defaults["tags"]
    description = panel["description"] + defaults["descriptionFooter"]
    publish_at  = panel["publishAt"]

    if dry_run:
        print(f"    [DRY RUN] title:      {panel['title']}")
        print(f"             file:       {panel['file']} ({mp4_path.stat().st_size / 1_048_576:.1f} MB)")
        print(f"             playlist:   {panel['playlist']}")
        print(f"             publishAt:  {publish_at}")
        print(f"             tags:       {tags[:5]}{'...' if len(tags) > 5 else ''}")
        return "DRY_RUN_ID"

    body = {
        "snippet": {
            "title":           panel["title"],
            "description":     description,
            "tags":            tags,
            "categoryId":      defaults["categoryId"],
            "defaultLanguage": defaults["defaultLanguage"],
        },
        "status": {
            "privacyStatus": "private",
            "publishAt":     publish_at,
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(
        str(mp4_path),
        mimetype="video/mp4",
        chunksize=CHUNK_SIZE,
        resumable=True,
    )

    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media,
    )

    size_mb  = mp4_path.stat().st_size / 1_048_576
    response = None
    bar_len  = 30

    while response is None:
        status, response = request.next_chunk()
        if status:
            pct  = int(status.progress() * 100)
            done = int(status.progress() * bar_len)
            bar  = "█" * done + "░" * (bar_len - done)
            print(f"\r    [{bar}] {pct:3d}%  ({size_mb * status.progress():.1f}/{size_mb:.1f} MB)", end="", flush=True)

    print(f"\r    [{('█' * bar_len)}] 100%  ({size_mb:.1f} MB)  ✓")
    return response["id"]


def load_log() -> dict[str, str]:
    uploaded = {}
    if LOG_FILE.exists():
        with open(LOG_FILE, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("video_id") and row["video_id"] != "DRY_RUN_ID":
                    uploaded[row["panel_id"]] = row["video_id"]
    return uploaded


def append_log(panel: dict, video_id: str, publish_at: str):
    write_header = not LOG_FILE.exists()
    with open(LOG_FILE, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(["order", "panel_id", "file", "title", "video_id", "url", "publish_at", "uploaded_at"])
        w.writerow([
            panel["order"],
            panel["id"],
            panel["file"],
            panel["title"],
            video_id,
            f"https://www.youtube.com/watch?v={video_id}" if video_id != "DRY_RUN_ID" else "",
            publish_at,
            datetime.now(timezone.utc).isoformat(),
        ])


def main():
    parser = argparse.ArgumentParser(description="Upload AssisT videos to YouTube")
    parser.add_argument("--from",    dest="from_order", type=int, default=1,
                        help="Start from this upload order number (1-indexed)")
    parser.add_argument("--only",    type=str, default="",
                        help="Comma-separated list of order numbers to upload (e.g. 1,3,28)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print metadata without uploading")
    parser.add_argument("--list",    action="store_true",
                        help="List all videos and whether their output file exists")
    args = parser.parse_args()

    meta     = load_meta()
    defaults = meta["channelDefaults"]
    panels   = sorted(meta["panels"], key=lambda p: p["uploadOrder"])

    if args.only:
        only_set = set(int(x.strip()) for x in args.only.split(","))
        panels   = [p for p in panels if p["uploadOrder"] in only_set]
    else:
        panels = [p for p in panels if p["uploadOrder"] >= args.from_order]

    if args.list:
        uploaded = load_log()
        print(f"\n{'#':>3}  {'Status':<12}  {'File':<36}  Title")
        print("-" * 90)
        for p in sorted(meta["panels"], key=lambda x: x["order"]):
            mp4 = OUTPUT_DIR / p["file"]
            if p["id"] in uploaded:
                status = "✓ uploaded"
            elif mp4.exists():
                status = "ready"
            else:
                status = "no file"
            print(f"{p['order']:>3}  {status:<12}  {p['file']:<36}  {p['title'][:50]}")
        return

    if not args.dry_run:
        youtube      = build_youtube_client()
        pl_cache     = {}
        pl_titles    = {pl["id"]: pl["title"] for pl in meta["playlists"]}
        already_done = load_log()
    else:
        youtube  = None
        pl_cache = {}
        pl_titles = {pl["id"]: pl["title"] for pl in meta["playlists"]}
        already_done = load_log()

    print(f"\nAssisT YouTube Uploader — {len(panels)} video(s) queued\n")
    if args.dry_run:
        print("DRY RUN MODE — no uploads will be made\n")

    for i, panel in enumerate(panels):
        if panel["id"] in already_done and not args.dry_run:
            print(f"[{panel['uploadOrder']:02d}/{len(meta['panels'])}] SKIP (already uploaded): {panel['title']}")
            continue

        print(f"[{panel['uploadOrder']:02d}/{len(meta['panels'])}] {panel['title']}")
        print(f"    Scheduled: {panel['publishAt']}")

        video_id = upload_video(youtube, panel, defaults, args.dry_run)

        if video_id and not args.dry_run:
            pl_title = pl_titles.get(panel["playlist"], panel["playlist"])
            pl_id    = get_or_create_playlist(youtube, pl_title, pl_cache)
            add_to_playlist(youtube, video_id, pl_id)
            print(f"    Added to playlist: {pl_title}")

        append_log(panel, video_id or "FAILED", panel["publishAt"])

        if video_id and video_id != "DRY_RUN_ID":
            print(f"    URL: https://www.youtube.com/watch?v={video_id}\n")
        else:
            print()

        if i < len(panels) - 1 and not args.dry_run:
            print(f"    Waiting {DELAY_SECS}s (quota safety)...")
            time.sleep(DELAY_SECS)

    print("\nDone. Log saved to:", LOG_FILE)
    if not args.dry_run:
        print("Check YouTube Studio to review videos before GAAD launch.")


if __name__ == "__main__":
    main()
