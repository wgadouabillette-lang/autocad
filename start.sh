#!/usr/bin/env bash
# Lyte - Demarrage (macOS / Linux)
set -e
cd "$(dirname "$0")"

cleanup() { kill 0 2>/dev/null; }
trap cleanup EXIT

echo "Backend  → http://127.0.0.1:8000/docs"
(cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000) &

sleep 2
echo "Frontend → http://localhost:5173"
(cd frontend && npm run dev) &

wait
