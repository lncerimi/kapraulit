'use strict';

/* ---------- Constants ---------- */

const LETTER_VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};
const BINGO_BONUS = 50;
const WORD_MULTS = [1, 2, 3, 4, 9];
const TILE_MODS = ['n', 'dl', 'tl', 'b']; // normal, double letter, triple letter, blank
const PALETTE = ['#d2453b', '#2f7fc1', '#2e7d4f', '#c9962b', '#7b4fa8', '#e07a2f', '#d1588f', '#2a9d9a', '#5b3a1e', '#444444'];

const STORE_KEY = 'scrabble-scorekeeper.v1';
// The app looks for a bundled word list first, then falls back to downloading the
// public-domain ENABLE list once and caching it on the device for offline use.
const DICT_LOCAL = 'words.txt';
const DICT_REMOTE = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';
const DICT_CACHE = 'scrabble-dict-v1';

/* ---------- Storage ---------- */

function emptyDb() { return { version: 1, players: [], games: [], activeGameId: null }; }

function loadDb() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyDb();
    const data = JSON.parse(raw);
    return Object.assign(emptyDb(), data);
  } catch (e) {
    console.error('Could not read saved data', e);
    return emptyDb();
  }
}

let db = loadDb();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('Could not save — storage may be full.');
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- Helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lettersOnly = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function tileHtml(letter, mod = 'n', size = '', asButton = false, attrs = '') {
  const val = mod === 'b' ? 0 : (LETTER_VALUES[letter] || 0);
  const cls = ['tile', size, mod === 'n' ? '' : (mod === 'b' ? 'blank' : mod)].filter(Boolean).join(' ');
  const tag = mod === 'dl' ? 'DL' : mod === 'tl' ? 'TL' : '';
  const inner = `${tag ? `<span class="tag">${tag}</span>` : ''}${esc(letter)}<sub>${val}</sub>`;
  return asButton
    ? `<button type="button" class="${cls}" ${attrs}>${inner}</button>`
    : `<span class="${cls}" ${attrs}>${inner}</span>`;
}

function baseWordScore(word) {
  return lettersOnly(word).split('').reduce((sum, l) => sum + (LETTER_VALUES[l] || 0), 0);
}

/* ---------- Players ---------- */

const playerById = (id) => db.players.find((p) => p.id === id);

// Prefer the current player record (so renames/recolors show everywhere),
// falling back to the snapshot saved with the game if the player was deleted.
function gamePlayer(game, id) {
  const live = playerById(id);
  if (live) return live;
  return (game.players || []).find((p) => p.id === id) || { id, name: 'Unknown', color: '#888' };
}

/* ---------- Scoring ---------- */

function scoreWord(w) {
  const letters = lettersOnly(w.text).split('');
  let sum = 0;
  letters.forEach((l, i) => {
    const mod = w.mods[i] || 'n';
    if (mod === 'b') return;
    const v = LETTER_VALUES[l] || 0;
    sum += mod === 'dl' ? v * 2 : mod === 'tl' ? v * 3 : v;
  });
  return sum * (w.wm || 1);
}

function scoreDraft(d) {
  if (d.manual !== '' && d.manual != null && !isNaN(Number(d.manual))) return Math.trunc(Number(d.manual));
  const words = d.words.reduce((s, w) => s + scoreWord(w), 0);
  return words + (d.bingo ? BINGO_BONUS : 0);
}

function gameScores(game) {
  const scores = {};
  game.playerIds.forEach((id) => { scores[id] = 0; });
  game.turns.forEach((t) => { scores[t.playerId] = (scores[t.playerId] || 0) + t.score; });
  if (game.adjust) Object.keys(game.adjust).forEach((id) => { scores[id] += game.adjust[id]; });
  return scores;
}

function winnersOf(game) {
  const scores = gameScores(game);
  const max = Math.max(...game.playerIds.map((id) => scores[id]));
  return game.playerIds.filter((id) => scores[id] === max);
}

const currentPlayerId = (game) => game.playerIds[game.turns.length % game.playerIds.length];
const activeGame = () => db.games.find((g) => g.id === db.activeGameId && !g.finished) || null;

function describeTurn(t) {
  if (t.type === 'pass') return '<span class="muted">Pass / exchange</span>';
  if (t.manual != null) {
    const words = t.words.filter((w) => w.text).map((w) => esc(w.text)).join(', ');
    return `${words ? words + ' · ' : ''}<span class="muted">entered points</span>`;
  }
  const parts = t.words.filter((w) => w.text).map((w) => `${esc(w.text)} <span class="muted">${scoreWord(w)}</span>`);
  return parts.join(' + ') + (t.bingo ? ' <span class="badge">BINGO +50</span>' : '');
}

/* ---------- Dictionary ---------- */

const Dict = {
  words: null,
  state: 'idle', // idle | loading | ready | error
  promise: null,
  source: '',

  load(force = false) {
    if (this.promise && !force) return this.promise;
    this.state = 'loading';
    updateDictStatus();
    this.promise = (async () => {
      let text = null;
      const cache = ('caches' in window) ? await caches.open(DICT_CACHE).catch(() => null) : null;
      if (cache && !force) {
        const hit = await cache.match('dictionary');
        if (hit) { text = await hit.text(); this.source = 'saved on this device'; }
      }
      if (!text) {
        for (const url of [DICT_LOCAL, DICT_REMOTE]) {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) continue;
            const t = await res.text();
            if (t.split('\n').length < 1000) continue; // sanity check: not a real word list
            text = t;
            this.source = url === DICT_LOCAL ? 'bundled with the app' : 'downloaded (ENABLE list)';
            if (cache) await cache.put('dictionary', new Response(t, { headers: { 'Content-Type': 'text/plain' } }));
            break;
          } catch (e) { /* try next source */ }
        }
      }
      if (!text) throw new Error('No dictionary available');
      const set = new Set();
      for (const line of text.split(/\r?\n/)) {
        const w = line.trim().toUpperCase();
        if (w && /^[A-Z]+$/.test(w)) set.add(w);
      }
      this.words = set;
      this.state = 'ready';
    })().catch((e) => {
      console.warn(e);
      this.state = 'error';
      this.promise = null;
    }).finally(() => {
      updateDictStatus();
      // refresh any open verdicts
      $$('[data-verdict]').forEach((el) => renderVerdict(el, el.dataset.verdict));
      if (route().name === 'dict') renderDictResult();
    });
    return this.promise;
  },

  check(word) {
    if (this.state !== 'ready') return null;
    return this.words.has(lettersOnly(word));
  },
};

function updateDictStatus() {
  const el = $('#dictStatus');
  if (!el) return;
  el.textContent = Dict.state === 'loading' ? 'Loading words…' : Dict.state === 'error' ? 'Dictionary offline' : '';
}

function renderVerdict(el, word) {
  word = lettersOnly(word);
  el.dataset.verdict = word;
  if (word.length < 2) { el.textContent = ''; el.className = 'verdict'; return; }
  const ok = Dict.check(word);
  if (ok === null) {
    el.textContent = Dict.state === 'loading' ? 'checking…' : 'dictionary unavailable';
    el.className = 'verdict muted';
  } else {
    el.textContent = ok ? '✓ valid' : '✗ not in dictionary';
    el.className = 'verdict ' + (ok ? 'ok' : 'no');
  }
}

/* ---------- Routing ---------- */

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'home', arg: parts[1] || null };
}
function go(path) { location.hash = '#/' + path; }

const TITLES = {
  home: 'Scorekeeper', players: 'Players', player: 'Player', new: 'New game', game: 'Game',
  history: 'Match history', match: 'Match', stats: 'Stats & records', dict: 'Dictionary', settings: 'Settings',
};

function render() {
  const r = route();
  closeModal();
  $('#title').textContent = TITLES[r.name] || 'Scorekeeper';
  $('.back').hidden = r.name === 'home';
  const view = VIEWS[r.name] || VIEWS.home;
  $('#app').innerHTML = view(r.arg);
  if (AFTER[r.name]) AFTER[r.name](r.arg);
  window.scrollTo(0, 0);
}

function back() {
  const r = route();
  const parent = { player: 'players', match: 'history' }[r.name] || '';
  go(parent);
}

/* ---------- Views ---------- */

const VIEWS = {};
const AFTER = {};

VIEWS.home = () => {
  const g = activeGame();
  let current = '';
  if (g) {
    const scores = gameScores(g);
    current = `
      <div class="card">
        <h2>Game in progress</h2>
        <div class="row" style="margin-bottom:12px">
          ${g.playerIds.map((id) => { const p = gamePlayer(g, id); return `<span style="--pc:${esc(p.color)}"><span class="dot"></span> ${esc(p.name)} <b>${scores[id]}</b></span>`; }).join('<span class="muted">·</span>')}
        </div>
        <a class="btn block" href="#/game">Continue game</a>
      </div>`;
  }
  return `
    <div class="logo">${'SCORE'.split('').map((l) => tileHtml(l, 'n', 'lg')).join('')}</div>
    ${current}
    <nav class="menu">
      <a class="btn" href="#/new"><span class="ico">＋</span> New game</a>
      <a class="btn secondary" href="#/dict"><span class="ico">📖</span> Check a word</a>
      <a class="btn secondary" href="#/history"><span class="ico">🗂</span> Match history</a>
      <a class="btn secondary" href="#/stats"><span class="ico">🏆</span> Stats & records</a>
      <a class="btn secondary" href="#/players"><span class="ico">👥</span> Players</a>
      <a class="btn secondary" href="#/settings"><span class="ico">⚙︎</span> Settings & backup</a>
    </nav>`;
};

/* Players list */
VIEWS.players = () => `
  <div class="card">
    <h2>Players</h2>
    ${db.players.length ? `<ul class="list">
      ${db.players.map((p) => `
        <li style="--pc:${esc(p.color)}">
          <button class="linkish" data-action="edit-player" data-id="${p.id}">
            <span class="dot"></span><span class="grow">${esc(p.name)}</span><span class="muted">Edit ›</span>
          </button>
        </li>`).join('')}
    </ul>` : '<p class="empty">No players yet. Add yourselves to get started.</p>'}
  </div>
  <a class="btn block" href="#/player/new">＋ Add player</a>`;

/* Player add/edit */
VIEWS.player = (id) => {
  const p = id === 'new' ? { name: '', color: PALETTE[db.players.length % PALETTE.length] } : playerById(id);
  if (!p) return '<p class="card">Player not found.</p>';
  return `
    <form class="card" id="playerForm" data-id="${esc(id)}">
      <label class="field"><span>Name</span>
        <input type="text" name="name" value="${esc(p.name)}" maxlength="24" required autocomplete="off" placeholder="e.g. Lulzim">
      </label>
      <div class="field"><span class="muted">Color</span>
        <div class="swatches" style="margin-top:6px">
          ${PALETTE.map((c) => `<button type="button" class="swatch ${c === p.color ? 'on' : ''}" style="--pc:${c}" data-action="pick-color" data-color="${c}" aria-label="Color ${c}"></button>`).join('')}
          <input type="color" name="custom" value="${esc(p.color)}" aria-label="Custom color" title="Custom color">
        </div>
        <input type="hidden" name="color" value="${esc(p.color)}">
      </div>
      <div class="row" style="margin-top:16px">
        ${id !== 'new' ? '<button type="button" class="btn danger small" data-action="delete-player">Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="submit" class="btn">Save</button>
      </div>
    </form>
    ${id !== 'new' ? '<p class="muted center">Deleting a player keeps their past games in your history.</p>' : ''}`;
};

/* New game */
let newGameSelection = [];
VIEWS.new = () => {
  newGameSelection = newGameSelection.filter((id) => playerById(id));
  if (!db.players.length) {
    return `<div class="card center"><p>Add players first, with a name and color for each.</p>
      <a class="btn" href="#/player/new">＋ Add player</a></div>`;
  }
  const warn = activeGame() ? '<p class="muted">Starting a new game will finish the current one without saving it to your records. You can resume it instead from the home screen.</p>' : '';
  return `
    <div class="card">
      <h2>Who's playing?</h2>
      <p class="muted">Tap players in the order they'll take turns (2–4).</p>
      ${db.players.map((p) => {
        const idx = newGameSelection.indexOf(p.id);
        return `<div class="pick ${idx >= 0 ? 'on' : ''}" style="--pc:${esc(p.color)}" data-action="toggle-pick" data-id="${p.id}" role="button" tabindex="0">
          <span class="dot"></span> ${esc(p.name)} <span class="order">${idx >= 0 ? idx + 1 : ''}</span></div>`;
      }).join('')}
      <a href="#/player/new" class="muted">＋ Add another player</a>
    </div>
    ${warn}
    <button class="btn block" data-action="start-game" ${newGameSelection.length >= 2 && newGameSelection.length <= 4 ? '' : 'disabled'}>Start game</button>`;
};

/* Game in progress */
let draft = null;
let editIndex = null;

function freshDraft() { return { words: [{ text: '', mods: [], wm: 1 }], bingo: false, manual: '' }; }
function draftFromTurn(t) {
  return {
    words: t.words.length ? t.words.map((w) => ({ text: w.text, mods: w.mods.slice(), wm: w.wm })) : [{ text: '', mods: [], wm: 1 }],
    bingo: !!t.bingo,
    manual: t.manual != null ? String(t.manual) : '',
  };
}

VIEWS.game = () => {
  const g = activeGame();
  if (!g) return `<div class="card center"><p>No game in progress.</p><a class="btn" href="#/new">Start a new game</a></div>`;
  if (!draft) { draft = freshDraft(); editIndex = null; }
  const scores = gameScores(g);
  const curId = editIndex != null ? g.turns[editIndex].playerId : currentPlayerId(g);
  const cur = gamePlayer(g, curId);

  const board = g.playerIds.map((id) => {
    const p = gamePlayer(g, id);
    return `<div class="pcard ${id === curId ? 'active' : ''}" style="--pc:${esc(p.color)}">
      <div class="name">${esc(p.name)}</div>
      <div class="score">${scores[id]}</div>
      <div class="turnflag">${id === curId ? (editIndex != null ? 'editing turn' : 'to play') : '&nbsp;'}</div>
    </div>`;
  }).join('');

  const log = g.turns.map((t, i) => ({ t, i })).reverse().map(({ t, i }) => {
    const p = gamePlayer(g, t.playerId);
    return `<li style="--pc:${esc(p.color)}">
      <span class="who"></span>
      <button class="linkish" data-action="edit-turn" data-index="${i}">
        <span class="grow"><b>${esc(p.name)}</b> · ${describeTurn(t)}</span>
        <span class="pts">${t.score}</span>
      </button>
    </li>`;
  }).join('');

  return `
    <div class="scoreboard">${board}</div>

    <div class="card" id="turnCard" style="border-top:6px solid ${esc(cur.color)}">
      <div class="row">
        <h2 style="margin:0">${editIndex != null ? `Edit turn ${editIndex + 1} — ` : ''}${esc(cur.name)}'s turn</h2>
        <span class="spacer"></span>
        ${editIndex != null ? '<button class="btn ghost small" data-action="cancel-edit">Cancel</button>' : ''}
      </div>
      <p class="hint">Type the word, then tap letters that landed on a bonus square (tap again for triple, or blank).</p>
      <div id="wordBlocks">${draft.words.map((w, i) => wordBlockHtml(w, i)).join('')}</div>
      <button class="btn ghost small" data-action="add-word">＋ Another word formed this turn</button>

      <div class="row" style="margin-top:12px">
        <button class="chip bingo ${draft.bingo ? 'on' : ''}" data-action="toggle-bingo">Bingo +50 <span class="muted">(used all 7 tiles)</span></button>
      </div>

      <label class="field" style="margin-top:12px"><span>…or just type the points</span>
        <input type="number" inputmode="numeric" id="manualPts" value="${esc(draft.manual)}" placeholder="Points (optional)">
      </label>

      <div class="row">
        <span class="muted">Turn score</span>
        <span class="turn-total" id="turnTotal">${scoreDraft(draft)}</span>
        <span class="spacer"></span>
        ${editIndex != null
          ? `<button class="btn danger small" data-action="delete-turn">Delete</button>
             <button class="btn" data-action="submit-turn">Save turn</button>`
          : `<button class="btn secondary small" data-action="pass-turn">Pass</button>
             <button class="btn" data-action="submit-turn">Add score</button>`}
      </div>
    </div>

    <div class="card">
      <div class="row">
        <h2 style="margin:0">Turns</h2>
        <span class="spacer"></span>
        ${g.turns.length && editIndex == null ? '<button class="btn ghost small" data-action="undo-turn">↶ Undo last</button>' : ''}
      </div>
      ${g.turns.length ? `<ul class="list turnlog">${log}</ul><p class="hint">Tap a turn to fix it.</p>` : '<p class="empty">No turns yet.</p>'}
    </div>

    <div class="row">
      <button class="btn danger small" data-action="abandon-game">Discard game</button>
      <span class="spacer"></span>
      <button class="btn" data-action="end-game">End game & tally</button>
    </div>`;
};

function wordBlockHtml(w, i) {
  const letters = lettersOnly(w.text).split('').filter(Boolean);
  return `
    <div class="word-block" data-word="${i}">
      <div class="row">
        <input type="text" class="word-input" data-role="word" data-index="${i}" value="${esc(w.text)}"
          placeholder="${i === 0 ? 'Main word' : 'Cross word'}" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" style="flex:1">
        ${draft.words.length > 1 ? `<button class="btn ghost small" data-action="remove-word" data-index="${i}" aria-label="Remove word">✕</button>` : ''}
      </div>
      <div class="tiles" data-role="tiles">${tilesHtml(letters, w.mods, i)}</div>
      <div class="row">
        <div class="mult" role="group" aria-label="Word multiplier">
          ${WORD_MULTS.map((m) => `<button type="button" class="chip ${m === 2 || m === 4 ? 'dw' : ''} ${w.wm === m ? 'on' : ''}" data-action="set-wm" data-index="${i}" data-wm="${m}">${m === 1 ? 'No word bonus' : '×' + m}</button>`).join('')}
        </div>
      </div>
      <div class="row" style="margin-top:6px">
        <span class="verdict" data-verdict="${esc(lettersOnly(w.text))}"></span>
        <span class="spacer"></span>
        <span class="muted" data-role="wordscore">${letters.length ? scoreWord(w) + ' pts' : ''}</span>
      </div>
    </div>`;
}

function tilesHtml(letters, mods, wi) {
  if (!letters.length) return '<span class="muted" style="align-self:center">Letters appear here</span>';
  return letters.map((l, li) => tileHtml(l, mods[li] || 'n', '', true, `data-action="cycle-tile" data-index="${wi}" data-letter="${li}" aria-label="${l}, tap to change bonus"`)).join('');
}

function refreshWordBlock(i) {
  const w = draft.words[i];
  const block = $(`.word-block[data-word="${i}"]`);
  if (!block) return;
  const letters = lettersOnly(w.text).split('').filter(Boolean);
  $('[data-role="tiles"]', block).innerHTML = tilesHtml(letters, w.mods, i);
  $('[data-role="wordscore"]', block).textContent = letters.length ? scoreWord(w) + ' pts' : '';
  $$('[data-action="set-wm"]', block).forEach((b) => b.classList.toggle('on', Number(b.dataset.wm) === w.wm));
  renderVerdict($('.verdict', block), w.text);
  refreshTotal();
}

function refreshTotal() {
  const el = $('#turnTotal');
  if (el) el.textContent = scoreDraft(draft);
}

AFTER.game = () => {
  $$('.verdict[data-verdict]').forEach((el) => renderVerdict(el, el.dataset.verdict));
};

/* History */
VIEWS.history = () => {
  const games = db.games.filter((g) => g.finished).sort((a, b) => b.endedAt - a.endedAt);
  if (!games.length) return '<div class="card"><p class="empty">Finished games will show up here.</p></div>';
  return `<div class="card"><ul class="list">
    ${games.map((g) => {
      const scores = gameScores(g);
      const wins = winnersOf(g);
      return `<li><button class="linkish" data-action="open-match" data-id="${g.id}">
        <span class="grow">
          <div class="muted">${fmtDate(g.endedAt)}</div>
          <div>${g.playerIds.map((id) => { const p = gamePlayer(g, id); return `<span style="--pc:${esc(p.color)}"><span class="dot"></span> ${wins.includes(id) ? '<b>' : ''}${esc(p.name)} ${scores[id]}${wins.includes(id) ? '</b>' : ''}</span>`; }).join(' &nbsp; ')}</div>
        </span><span class="muted">›</span></button></li>`;
    }).join('')}
  </ul></div>`;
};

/* Single match */
VIEWS.match = (id) => {
  const g = db.games.find((x) => x.id === id);
  if (!g) return '<div class="card"><p>Match not found.</p></div>';
  const scores = gameScores(g);
  const wins = winnersOf(g);
  const winnerText = wins.length > 1 ? 'Tie game!' : `🏆 ${esc(gamePlayer(g, wins[0]).name)} wins`;
  const rows = g.playerIds.map((pid) => {
    const p = gamePlayer(g, pid);
    const turns = g.turns.filter((t) => t.playerId === pid);
    const best = turns.reduce((b, t) => (t.score > (b ? b.score : -1) ? t : b), null);
    const bingos = turns.filter((t) => t.bingo).length;
    const adj = (g.adjust && g.adjust[pid]) || 0;
    return `<tr style="--pc:${esc(p.color)}"><td><span class="dot"></span> ${esc(p.name)}</td>
      <td>${scores[pid] - adj}</td><td>${adj > 0 ? '+' : ''}${adj || '–'}</td><td><b>${scores[pid]}</b></td>
      <td>${best ? best.score : '–'}</td><td>${bingos}</td></tr>`;
  }).join('');
  const log = g.turns.map((t, i) => {
    const p = gamePlayer(g, t.playerId);
    return `<li style="--pc:${esc(p.color)}"><span class="who"></span><span class="muted">${i + 1}</span>
      <span class="grow"><b>${esc(p.name)}</b> · ${describeTurn(t)}</span><span class="pts">${t.score}</span></li>`;
  }).join('');
  return `
    <div class="card">
      <div class="winner-banner">${winnerText}</div>
      <p class="muted center">${fmtDateTime(g.startedAt)} – ${fmtDateTime(g.endedAt)}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Player</th><th>Turns</th><th>Tiles</th><th>Final</th><th>Best</th><th>Bingos</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="hint">“Tiles” is the leftover-tile adjustment at the end of the game.</p>
    </div>
    <div class="card"><h2>Turns</h2>${g.turns.length ? `<ul class="list turnlog">${log}</ul>` : '<p class="empty">No turns recorded.</p>'}</div>
    <button class="btn danger small" data-action="delete-match" data-id="${g.id}">Delete this match</button>`;
};

/* Stats */
function computeStats() {
  const games = db.games.filter((g) => g.finished).sort((a, b) => a.endedAt - b.endedAt);
  const per = {};
  const ensure = (g, id) => {
    if (!per[id]) {
      const p = gamePlayer(g, id);
      per[id] = { id, name: p.name, color: p.color, games: 0, wins: 0, losses: 0, ties: 0, total: 0, high: 0, bestTurn: null, bingos: 0, results: [] };
    }
    return per[id];
  };
  const pairs = {};
  let topGame = null; let topTurn = null;

  games.forEach((g) => {
    const scores = gameScores(g);
    const wins = winnersOf(g);
    g.playerIds.forEach((id) => {
      const s = ensure(g, id);
      s.games++;
      s.total += scores[id];
      s.high = Math.max(s.high, scores[id]);
      const res = wins.includes(id) ? (wins.length > 1 ? 'T' : 'W') : 'L';
      if (res === 'W') s.wins++; else if (res === 'L') s.losses++; else s.ties++;
      s.results.push(res);
      if (!topGame || scores[id] > topGame.score) topGame = { score: scores[id], pid: id, g };
    });
    g.turns.forEach((t) => {
      const s = ensure(g, t.playerId);
      if (t.bingo) s.bingos++;
      if (t.type === 'pass') return;
      if (!s.bestTurn || t.score > s.bestTurn.score) s.bestTurn = { score: t.score, turn: t, g };
      if (!topTurn || t.score > topTurn.score) topTurn = { score: t.score, turn: t, pid: t.playerId, g };
    });
    // head to head for every pair in this game
    for (let i = 0; i < g.playerIds.length; i++) {
      for (let j = i + 1; j < g.playerIds.length; j++) {
        const [a, b] = [g.playerIds[i], g.playerIds[j]].sort();
        const key = a + '|' + b;
        const rec = pairs[key] || (pairs[key] = { a, b, aw: 0, bw: 0, t: 0 });
        if (scores[a] > scores[b]) rec.aw++; else if (scores[b] > scores[a]) rec.bw++; else rec.t++;
      }
    }
  });

  Object.values(per).forEach((s) => {
    const last = s.results[s.results.length - 1];
    let n = 0;
    for (let i = s.results.length - 1; i >= 0 && s.results[i] === last; i--) n++;
    s.streak = last ? `${last}${n}` : '–';
  });
  return { games, per: Object.values(per), pairs: Object.values(pairs), topGame, topTurn };
}

function turnWords(t) {
  return t.words.filter((w) => w.text).map((w) => lettersOnly(w.text)).join(' + ') || 'points entered';
}

VIEWS.stats = () => {
  const st = computeStats();
  if (!st.games.length) return '<div class="card"><p class="empty">Finish a game to start building stats.</p></div>';
  const nameOf = (id) => { const s = st.per.find((p) => p.id === id); return s ? s.name : '?'; };
  const colorOf = (id) => { const s = st.per.find((p) => p.id === id); return s ? s.color : '#888'; };
  const per = st.per.slice().sort((a, b) => b.wins - a.wins || b.total / b.games - a.total / a.games);

  const h2h = st.pairs.map((r) => `
    <li><span class="grow" style="--pc:${esc(colorOf(r.a))}"><span class="dot"></span> ${esc(nameOf(r.a))}</span>
      <span class="pts" style="font-size:1.3rem">${r.aw} – ${r.bw}</span>
      <span class="grow" style="text-align:right;--pc:${esc(colorOf(r.b))}">${esc(nameOf(r.b))} <span class="dot"></span></span></li>
    ${r.t ? `<li class="muted" style="justify-content:center;border:0;padding-top:0">${r.t} tie${r.t > 1 ? 's' : ''}</li>` : ''}`).join('');

  return `
    <div class="card">
      <h2>Head to head</h2>
      <ul class="list">${h2h}</ul>
    </div>
    <div class="card">
      <h2>Players</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Player</th><th>Games</th><th>W-L${per.some((p) => p.ties) ? '-T' : ''}</th><th>Win %</th><th>Avg</th><th>Streak</th></tr></thead>
        <tbody>${per.map((s) => `<tr style="--pc:${esc(s.color)}">
          <td><span class="dot"></span> ${esc(s.name)}</td><td>${s.games}</td>
          <td>${s.wins}-${s.losses}${per.some((p) => p.ties) ? '-' + s.ties : ''}</td>
          <td>${Math.round((s.wins / s.games) * 100)}%</td><td>${Math.round(s.total / s.games)}</td><td>${s.streak}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <h2>Personal bests</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Player</th><th>Best game</th><th>Best turn</th><th>Bingos</th></tr></thead>
        <tbody>${per.map((s) => `<tr style="--pc:${esc(s.color)}">
          <td><span class="dot"></span> ${esc(s.name)}</td><td>${s.high}</td>
          <td>${s.bestTurn ? `${s.bestTurn.score} <span class="muted">${esc(turnWords(s.bestTurn.turn))}</span>` : '–'}</td>
          <td>${s.bingos}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <h2>All-time records</h2>
      <ul class="list">
        ${st.topGame ? `<li><span class="grow">Highest game score<div class="muted">${esc(nameOf(st.topGame.pid))} · ${fmtDate(st.topGame.g.endedAt)}</div></span><span class="badge gold">${st.topGame.score}</span></li>` : ''}
        ${st.topTurn ? `<li><span class="grow">Best single turn<div class="muted">${esc(nameOf(st.topTurn.pid))} · ${esc(turnWords(st.topTurn.turn))}</div></span><span class="badge gold">${st.topTurn.score}</span></li>` : ''}
        <li><span class="grow">Games played</span><span class="pts">${st.games.length}</span></li>
      </ul>
    </div>`;
};

/* Dictionary */
VIEWS.dict = () => `
  <div class="card">
    <h2>Is it a word?</h2>
    <input type="search" id="dictInput" class="word-input" placeholder="Type a word" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" enterkeyhint="search">
    <div class="dict-result" id="dictResult"></div>
  </div>
  <p class="muted center">Uses the ENABLE word list, a free list that is very close to the North American Scrabble list.</p>`;

function renderDictResult() {
  const input = $('#dictInput');
  const out = $('#dictResult');
  if (!input || !out) return;
  const word = lettersOnly(input.value);
  if (!word) { out.innerHTML = Dict.state === 'loading' ? '<p class="muted">Loading the word list…</p>' : Dict.state === 'error' ? dictErrorHtml() : ''; return; }
  const tiles = `<div class="tiles" style="justify-content:center">${word.split('').map((l) => tileHtml(l, 'n', word.length > 9 ? 'sm' : '')).join('')}</div>`;
  const ok = Dict.check(word);
  let verdict;
  if (ok === null) verdict = Dict.state === 'loading' ? '<div class="big muted">Loading word list…</div>' : dictErrorHtml();
  else if (word.length < 2) verdict = '<div class="big no">Too short</div><p class="muted">Words must be at least 2 letters.</p>';
  else verdict = ok ? '<div class="big ok">✓ Playable</div>' : '<div class="big no">✗ Not in the dictionary</div>';
  out.innerHTML = `${tiles}${verdict}<p class="muted">Face value: ${baseWordScore(word)} points</p>`;
}

function dictErrorHtml() {
  return `<p class="muted">The word list couldn't be loaded. Connect to the internet once so it can be saved to this device.</p>
    <button class="btn small" data-action="retry-dict">Try again</button>`;
}

AFTER.dict = () => {
  const input = $('#dictInput');
  input.addEventListener('input', renderDictResult);
  input.focus();
  renderDictResult();
};

/* Settings */
VIEWS.settings = () => `
  <div class="card">
    <h2>Install on your phone</h2>
    <p><b>iPhone (Safari):</b> tap the Share button, then <i>Add to Home Screen</i>.</p>
    <p><b>Android (Chrome):</b> tap the ⋮ menu, then <i>Install app</i> or <i>Add to Home screen</i>.</p>
    <p class="muted">Once installed it opens full-screen and works offline.</p>
  </div>
  <div class="card">
    <h2>Backup & share records</h2>
    <p class="muted">Your games are saved on this phone. Export a backup file and import it on the other phone to merge your records. Importing never deletes anything.</p>
    <div class="row">
      <button class="btn" data-action="export">Export backup</button>
      <label class="btn secondary">Import backup<input type="file" id="importFile" accept="application/json,.json" hidden></label>
    </div>
  </div>
  <div class="card">
    <h2>Dictionary</h2>
    <p class="muted">${Dict.state === 'ready' ? `${Dict.words.size.toLocaleString()} words, ${esc(Dict.source)}.` : Dict.state === 'loading' ? 'Loading…' : 'Not loaded yet.'}</p>
    <button class="btn secondary small" data-action="retry-dict">Re-download word list</button>
  </div>
  <div class="card">
    <h2>Danger zone</h2>
    <button class="btn danger small" data-action="wipe">Delete all players & games</button>
  </div>`;

AFTER.settings = () => {
  $('#importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(importData).catch(() => toast('Could not read that file.'));
  });
};

/* ---------- Actions ---------- */

function startGame() {
  const ids = newGameSelection.slice();
  if (ids.length < 2 || ids.length > 4) return;
  const prev = activeGame();
  if (prev) db.games = db.games.filter((g) => g.id !== prev.id);
  const g = {
    id: uid(),
    startedAt: Date.now(),
    endedAt: null,
    finished: false,
    playerIds: ids,
    players: ids.map((id) => { const p = playerById(id); return { id, name: p.name, color: p.color }; }),
    turns: [],
    adjust: null,
  };
  db.games.push(g);
  db.activeGameId = g.id;
  newGameSelection = [];
  draft = freshDraft();
  editIndex = null;
  save();
  go('game');
}

function submitTurn(isPass = false) {
  const g = activeGame();
  if (!g) return;
  const words = isPass ? [] : draft.words
    .map((w) => ({ text: lettersOnly(w.text), mods: w.mods.slice(0, lettersOnly(w.text).length), wm: w.wm }))
    .filter((w) => w.text);
  const manual = !isPass && draft.manual !== '' && !isNaN(Number(draft.manual)) ? Math.trunc(Number(draft.manual)) : null;
  if (!isPass && !words.length && manual == null) { toast('Type a word or enter the points.'); return; }
  const turn = {
    playerId: editIndex != null ? g.turns[editIndex].playerId : currentPlayerId(g),
    type: isPass ? 'pass' : 'play',
    words,
    bingo: !isPass && manual == null && draft.bingo,
    manual,
    score: isPass ? 0 : scoreDraft(draft),
    at: editIndex != null ? g.turns[editIndex].at : Date.now(),
  };
  if (editIndex != null) g.turns[editIndex] = turn; else g.turns.push(turn);
  if (!isPass) {
    const bad = words.filter((w) => Dict.check(w.text) === false).map((w) => w.text);
    toast(bad.length ? `Saved. Heads up: ${bad.join(', ')} isn't in the dictionary.` : `${turn.score} points saved.`);
  }
  draft = freshDraft();
  editIndex = null;
  save();
  render();
}

function openEndGame() {
  const g = activeGame();
  if (!g) return;
  openModal(`
    <h2>End game</h2>
    <p class="muted">Type the letters each player has left on their rack. Leave it empty for the player who went out. They get everyone else's leftover points.</p>
    ${g.playerIds.map((id) => { const p = gamePlayer(g, id); return `
      <label class="field" style="--pc:${esc(p.color)}"><span><span class="dot"></span> ${esc(p.name)} <b data-left-val="${id}"></b></span>
        <input type="text" class="word-input" data-left="${id}" placeholder="Leftover letters (e.g. QZ)" autocomplete="off" autocapitalize="characters" spellcheck="false">
      </label>`; }).join('')}
    <div id="endPreview" class="muted"></div>
    <div class="row end" style="margin-top:12px">
      <button class="btn ghost" data-action="close-modal">Back to game</button>
      <button class="btn" data-action="finish-game">Finish & save</button>
    </div>`);
  const update = () => {
    const adj = computeAdjust(g);
    const scores = gameScores(g);
    $$('[data-left-val]').forEach((el) => {
      const id = el.dataset.leftVal;
      const a = adj[id];
      el.textContent = a ? `(${a > 0 ? '+' : ''}${a})` : '';
    });
    $('#endPreview').innerHTML = 'Final: ' + g.playerIds.map((id) => `${esc(gamePlayer(g, id).name)} ${scores[id] + adj[id]}`).join(' · ');
  };
  $$('[data-left]').forEach((el) => el.addEventListener('input', update));
  update();
}

function computeAdjust(g) {
  const left = {};
  $$('[data-left]').forEach((el) => { left[el.dataset.left] = lettersOnly(el.value); });
  const adj = {};
  let pool = 0;
  g.playerIds.forEach((id) => {
    const v = baseWordScore(left[id] || '');
    adj[id] = -v;
    pool += v;
  });
  const out = g.playerIds.filter((id) => !(left[id] || '').length);
  if (out.length === 1 && pool > 0) adj[out[0]] += pool;
  return adj;
}

function finishGame() {
  const g = activeGame();
  if (!g) return;
  g.adjust = computeAdjust(g);
  g.finished = true;
  g.endedAt = Date.now();
  db.activeGameId = null;
  draft = null;
  editIndex = null;
  save();
  closeModal();
  go('match/' + g.id);
  toast('Game saved to your history.');
}

function exportData() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const name = `scrabble-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Scrabble scores backup' }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function importData(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { toast('That file is not a valid backup.'); return; }
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.games)) { toast('That file is not a valid backup.'); return; }
  let np = 0; let ng = 0;
  data.players.forEach((p) => {
    if (!p || !p.id) return;
    const existing = playerById(p.id);
    if (!existing) { db.players.push({ id: p.id, name: String(p.name || 'Player'), color: String(p.color || '#888') }); np++; }
  });
  data.games.forEach((g) => {
    if (!g || !g.id || !g.finished || !Array.isArray(g.playerIds) || !Array.isArray(g.turns)) return;
    if (!db.games.some((x) => x.id === g.id)) { db.games.push(g); ng++; }
  });
  save();
  toast(`Imported ${ng} game${ng === 1 ? '' : 's'} and ${np} player${np === 1 ? '' : 's'}.`);
  render();
}

/* ---------- Modal ---------- */

function openModal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

function confirmModal(message, okLabel, onOk) {
  openModal(`<p>${message}</p><div class="row end"><button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn danger" id="confirmOk">${esc(okLabel)}</button></div>`);
  $('#confirmOk').addEventListener('click', () => { closeModal(); onOk(); });
}

/* ---------- Event wiring ---------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) {
    if (e.target.id === 'modal') closeModal();
    return;
  }
  const a = el.dataset.action;
  const idx = el.dataset.index != null ? Number(el.dataset.index) : null;

  switch (a) {
    case 'back': back(); break;
    case 'close-modal': closeModal(); break;

    case 'edit-player': go('player/' + el.dataset.id); break;
    case 'pick-color': {
      const form = $('#playerForm');
      form.elements.color.value = el.dataset.color;
      form.elements.custom.value = el.dataset.color;
      $$('.swatch', form).forEach((s) => s.classList.toggle('on', s === el));
      break;
    }
    case 'delete-player': {
      const id = $('#playerForm').dataset.id;
      const p = playerById(id);
      confirmModal(`Delete ${esc(p.name)}? Past games stay in your history.`, 'Delete', () => {
        db.players = db.players.filter((x) => x.id !== id);
        save();
        go('players');
      });
      break;
    }

    case 'toggle-pick': {
      const id = el.dataset.id;
      const i = newGameSelection.indexOf(id);
      if (i >= 0) newGameSelection.splice(i, 1);
      else if (newGameSelection.length < 4) newGameSelection.push(id);
      else toast('Up to 4 players.');
      render();
      break;
    }
    case 'start-game': startGame(); break;

    case 'cycle-tile': {
      const w = draft.words[idx];
      const li = Number(el.dataset.letter);
      const cur = w.mods[li] || 'n';
      w.mods[li] = TILE_MODS[(TILE_MODS.indexOf(cur) + 1) % TILE_MODS.length];
      refreshWordBlock(idx);
      break;
    }
    case 'set-wm': draft.words[idx].wm = Number(el.dataset.wm); refreshWordBlock(idx); break;
    case 'add-word':
      draft.words.push({ text: '', mods: [], wm: 1 });
      render();
      setTimeout(() => { const ins = $$('[data-role="word"]'); ins[ins.length - 1].focus(); }, 0);
      break;
    case 'remove-word': draft.words.splice(idx, 1); render(); break;
    case 'toggle-bingo': draft.bingo = !draft.bingo; el.classList.toggle('on', draft.bingo); refreshTotal(); break;
    case 'submit-turn': submitTurn(false); break;
    case 'pass-turn': submitTurn(true); break;
    case 'undo-turn': {
      const g = activeGame();
      const t = g.turns.pop();
      save();
      render();
      toast(`Removed ${gamePlayer(g, t.playerId).name}'s ${t.score}-point turn.`);
      break;
    }
    case 'edit-turn': {
      const g = activeGame();
      if (!g) break;
      editIndex = idx;
      draft = draftFromTurn(g.turns[idx]);
      render();
      break;
    }
    case 'cancel-edit': editIndex = null; draft = freshDraft(); render(); break;
    case 'delete-turn': {
      const g = activeGame();
      const i = editIndex;
      confirmModal('Delete this turn? Turn order is based on the number of turns, so later turns may shift to another player.', 'Delete turn', () => {
        g.turns.splice(i, 1);
        editIndex = null;
        draft = freshDraft();
        save();
        render();
      });
      break;
    }
    case 'end-game': openEndGame(); break;
    case 'finish-game': finishGame(); break;
    case 'abandon-game':
      confirmModal('Discard this game? It will not be saved to your history.', 'Discard', () => {
        const g = activeGame();
        db.games = db.games.filter((x) => x.id !== g.id);
        db.activeGameId = null;
        draft = null;
        save();
        go('');
      });
      break;

    case 'open-match': go('match/' + el.dataset.id); break;
    case 'delete-match':
      confirmModal('Delete this match from your history? This also removes it from your stats.', 'Delete', () => {
        db.games = db.games.filter((x) => x.id !== el.dataset.id);
        save();
        go('history');
      });
      break;

    case 'retry-dict': Dict.load(true); if (route().name === 'settings') setTimeout(render, 0); break;
    case 'export': exportData(); break;
    case 'wipe':
      confirmModal('Delete <b>all</b> players and games on this phone? Export a backup first if you want to keep them.', 'Delete everything', () => {
        db = emptyDb();
        save();
        go('');
      });
      break;
    default: break;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.role === 'word') {
    const i = Number(t.dataset.index);
    const w = draft.words[i];
    const clean = lettersOnly(t.value);
    if (t.value !== clean) {
      const pos = t.selectionStart;
      t.value = clean;
      try { t.setSelectionRange(pos, pos); } catch (err) { /* ignore */ }
    }
    // keep bonus marks for letters that didn't change position
    w.mods = w.mods.slice(0, clean.length);
    w.text = clean;
    refreshWordBlock(i);
  } else if (t.id === 'manualPts') {
    draft.manual = t.value;
    refreshTotal();
  } else if (t.name === 'custom' && t.form && t.form.id === 'playerForm') {
    t.form.elements.color.value = t.value;
    $$('.swatch', t.form).forEach((s) => s.classList.remove('on'));
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.role === 'word') {
    e.preventDefault();
    e.target.blur();
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.action === 'toggle-pick') {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === 'Escape') closeModal();
});

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'playerForm') return;
  e.preventDefault();
  const f = e.target;
  const name = f.elements.name.value.trim();
  if (!name) { toast('Please enter a name.'); return; }
  const id = f.dataset.id;
  if (db.players.some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) { toast('Someone already has that name.'); return; }
  if (id === 'new') db.players.push({ id: uid(), name, color: f.elements.color.value });
  else Object.assign(playerById(id), { name, color: f.elements.color.value });
  save();
  go('players');
});

window.addEventListener('hashchange', render);

/* ---------- Boot ---------- */

render();
Dict.load();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
}
