# Lunar

A score-keeping app for word game nights that installs on iPhone and Android. It has no build step and no server. Everything is plain HTML, CSS and JavaScript in this folder.

## Features
- **Players:** each player keeps a saved name and color.
- **Scoring:** 2–4 players per game. Type the word, then tap letters to mark DL, TL or blank. Set the word multiplier (×2, ×3, ×4, ×9), add cross words and the 50-point bingo, or just type the points.
- **Dictionary check:** each word shows ✓/✗ against the word list while you enter it.
- **Turn fixes:** undo the last turn, edit any turn, or log a pass/exchange.
- **End of game:** enter each player's leftover tiles. The penalty is subtracted and the player who went out gets the bonus.
- **Match history:** every finished game is saved with its turn-by-turn log.
- **Stats:** head-to-head record, wins/losses, win %, average score and streak.
- **Personal bests:** best game, best turn, bingo count and all-time records.
- **Dictionary page:** look up whether a word is playable. It uses the public-domain ENABLE list (~173k words), works offline, and is very close to the North American list.
- **Backup:** export/import a file to copy records between phones. Importing merges and never deletes.

## Using it
Once GitHub Pages serves this branch, open `https://<user>.github.io/kapraulit/scrabble/` on each phone:
- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** ⋮ → *Install app*

Data is stored on the device (localStorage).

## Word list
On first launch the app downloads the ENABLE list and caches it on the phone, so it works offline after that. To bundle the list with the app instead, run `scrabble/tools/fetch-wordlist.sh` and commit `scrabble/words.txt`.

## Updating
After changing files, bump `VERSION` in `sw.js` so installed copies pick up the new version.

## Tile Table (play on this phone)
An original crossword tile game, separate from the scorekeeper. It has its own board layout, tile set and letter values.
- **Players:** 2–4, any mix of people and computer opponents (Easy, Medium, Hard).
- **Pass the phone:** each person's tiles stay hidden behind a "pass the phone" screen between turns.
- **Word check:** every word is checked against the dictionary before it can be played.
- **Bonuses:** squares for 2× / 3× letter and word. Using all 7 tiles earns +40.
- **History:** finished games go into the same match history and stats as the scorekeeper.

The game logic is in `game.js`. Board layout, tile counts and values are at the top of that file.
