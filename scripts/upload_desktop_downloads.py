#!/usr/bin/env python3
"""Upload desktop installers to Firebase Storage with public read via storage.rules."""
from __future__ import annotations

import mimetypes
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, storage

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ID = "forma-cad-dev"
BUCKET = "forma-cad-dev.firebasestorage.app"
MAC_SRC = ROOT / "landing/public/downloads/Lyte-mac.dmg"
WIN_SRC = ROOT / "landing/public/downloads/Lyte-windows.exe"


def upload(path: Path, dest: str) -> str:
    if not path.is_file():
        return ""
    bucket = storage.bucket(BUCKET)
    blob = bucket.blob(dest)
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    print(f"Upload {path.name} → gs://{BUCKET}/{dest}")
    blob.upload_from_filename(str(path), content_type=content_type)
    return (
        f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/"
        f"{dest.replace('/', '%2F')}?alt=media"
    )


def main() -> int:
    if not firebase_admin._apps:
        cred_path = Path.home() / ".config/firebase"
        adc_files = sorted(cred_path.glob("*_application_default_credentials.json"))
        if adc_files:
            import os

            os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS", str(adc_files[0]))
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {"storageBucket": BUCKET})

    if not MAC_SRC.is_file():
        print(f"macOS installer missing: {MAC_SRC}", file=sys.stderr)
        print("Run: ./scripts/prepare-landing-downloads.sh", file=sys.stderr)
        return 1

    mac_url = upload(MAC_SRC, "downloads/Lyte-mac.dmg")
    win_url = upload(WIN_SRC, "downloads/Lyte-windows.exe") if WIN_SRC.is_file() else ""

    print("\nPublic URLs:")
    print(f"  macOS   : {mac_url}")
    if win_url:
        print(f"  Windows : {win_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
