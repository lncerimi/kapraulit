#!/usr/bin/env bash
# Bundles the public-domain ENABLE word list into the app as scrabble/words.txt.
# Optional: without it, the app downloads the same list on first launch and
# caches it on the phone. Bundling it makes the very first launch work offline.
set -euo pipefail
cd "$(dirname "$0")/.."
curl -fsSL https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt -o words.txt
echo "Saved $(wc -l < words.txt) words to scrabble/words.txt"
