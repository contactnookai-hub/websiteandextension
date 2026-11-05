#!/bin/sh
# Builds a Chrome Web Store zip with manifest.json at the archive root.
set -e
cd "$(dirname "$0")"
OUT="$(pwd)/nook-v7.zip"
rm -f "$OUT"
find . -type f \
  ! -path './_metadata/*' \
  ! -name 'zip.sh' \
  ! -name 'STORE_SUBMISSION_NOTES.md' \
  ! -name 'nook-v7.zip' \
  ! -name '.DS_Store' \
  | sed 's|^\./||' \
  | zip -@ "$OUT"
echo "Wrote $OUT"
unzip -l "$OUT" | awk 'NR<=4 || /manifest.json/ || /gemini-visible/ || /_metadata/ || /STORE_/'
