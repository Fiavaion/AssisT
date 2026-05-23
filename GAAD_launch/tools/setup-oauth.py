#!/usr/bin/env python3
"""
setup-oauth.py — One-time Google OAuth 2.0 setup for YouTube Data API v3.

Run this once before using upload-youtube.py.
It will open your browser, ask you to approve access, and save token.json.

Prerequisites:
    pip install google-auth-oauthlib google-api-python-client

Steps before running:
    1. Go to https://console.cloud.google.com/
    2. Create a project (e.g. "AssisT YouTube")
    3. Enable YouTube Data API v3
    4. Create credentials → OAuth 2.0 Client ID → Desktop app
    5. Download the JSON → save as client_secrets.json next to this script
    6. Run: python setup-oauth.py
"""

import json
import os
import sys
from pathlib import Path

TOOLS_DIR     = Path(__file__).parent
SECRETS_FILE  = TOOLS_DIR / "client_secrets.json"
TOKEN_FILE    = TOOLS_DIR / "token.json"
SCOPES        = ["https://www.googleapis.com/auth/youtube.upload",
                 "https://www.googleapis.com/auth/youtube"]

def main():
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.oauth2.credentials import Credentials
    except ImportError:
        print("ERROR: Required packages not installed.")
        print("Run: pip install google-auth-oauthlib google-api-python-client")
        sys.exit(1)

    if not SECRETS_FILE.exists():
        print(f"ERROR: {SECRETS_FILE} not found.")
        print("\nTo fix this:")
        print("  1. Go to https://console.cloud.google.com/")
        print("  2. Create a project → enable YouTube Data API v3")
        print("  3. Credentials → Create → OAuth 2.0 Client ID → Desktop app")
        print(f"  4. Download JSON → rename to client_secrets.json → place in {TOOLS_DIR}/")
        sys.exit(1)

    if TOKEN_FILE.exists():
        print(f"token.json already exists at {TOKEN_FILE}")
        answer = input("Re-authorise? (y/N): ").strip().lower()
        if answer != "y":
            print("Keeping existing token.")
            return

    print("Opening browser for Google authorisation...")
    print("(If it doesn't open automatically, follow the URL printed below)\n")

    flow = InstalledAppFlow.from_client_secrets_file(str(SECRETS_FILE), SCOPES)
    credentials = flow.run_local_server(port=0, open_browser=True)

    token_data = {
        "token":         credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri":     credentials.token_uri,
        "client_id":     credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes":        list(credentials.scopes),
    }
    TOKEN_FILE.write_text(json.dumps(token_data, indent=2), encoding="utf-8")
    print(f"\nAuthorisation successful. Token saved to {TOKEN_FILE}")
    print("\nNext step: python upload-youtube.py --dry-run")


if __name__ == "__main__":
    main()
