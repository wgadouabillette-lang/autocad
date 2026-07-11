#!/usr/bin/env bash
# Build l'installateur Hall desktop (Mac .dmg ou Windows .exe selon l'OS)
set -e
cd "$(dirname "$0")/.."

case "$(uname -s)" in
  Darwin)
    exec ./scripts/build-desktop-mac.sh
    ;;
  MINGW*|MSYS*|CYGWIN*)
    exec cmd.exe /c "scripts\\build-desktop-win.bat"
    ;;
  *)
    if [[ -n "${WINDIR:-}" ]] && [[ -f scripts/build-desktop-win.bat ]]; then
      exec cmd.exe /c "scripts\\build-desktop-win.bat"
    fi
    echo "OS non supporté pour le build desktop : $(uname -s)"
    echo ""
    echo "  macOS  → ./scripts/build-desktop-mac.sh"
    echo "  Windows → scripts\\build-desktop-win.bat"
    exit 1
    ;;
esac
