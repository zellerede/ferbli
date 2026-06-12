#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/web/public/cards.webp"
mkdir -p "$(dirname "$OUT")"
URL="https://www.saseskos.hu/img/25298/KTM100002581_altpic_1/KTM100002581.webp?time=1704786172"
echo "Downloading sprite to $OUT"
curl -fsSL "$URL" -o "$OUT"
echo "Done."
