#!/usr/bin/env bash
# Copy the Vite /app build (including preview.html) into landing for hosting + local dev.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building frontend (preview entry)…"
(cd "$ROOT/frontend" && npm run build)

echo "Syncing frontend/dist → landing/app (Firebase Hosting)…"
rm -rf "$ROOT/landing/app"
mkdir -p "$ROOT/landing/app"
cp -R "$ROOT/frontend/dist/." "$ROOT/landing/app/"

echo "Syncing frontend/dist → landing/public/app (Vite dev static)…"
rm -rf "$ROOT/landing/public/app"
mkdir -p "$ROOT/landing/public/app"
cp -R "$ROOT/frontend/dist/." "$ROOT/landing/public/app/"

echo "Done. /app/preview.html is available on hosting and landing dev server."
