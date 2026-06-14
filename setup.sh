#!/usr/bin/env bash
# Lyte - Installation (macOS / Linux). Prerequis : Python 3.11+, Node 18+
set -e
cd "$(dirname "$0")"

echo "[1/3] Environnement Python…"
cd backend
python3 -m venv .venv
source .venv/bin/activate

echo "[2/3] Dependances backend…"
python -m pip install --upgrade pip
pip install -r requirements.txt
cd ..

echo "[3/3] Dependances frontend…"
cd frontend
npm install
cd ..

echo "Installation terminee. Lancez ./start.sh"
