'use strict';

/*
 * "Tile Table" — an original crossword tile game played on this phone.
 * Board layout, tile set and letter values are this app's own design.
 * Pass-the-phone for people, plus computer opponents (easy / medium / hard).
 * Loaded after app.js and reuses its storage, dictionary, players and history.
 */

const TT = (() => {
  const SIZE = 15;
  const CENTER = 7;
  const RACK = 7;
  const FULL_RACK_BONUS = 40;
  const GAME_NAME = 'Tile Table';

  // [count, value] per letter; '?' is a blank (wild) tile. 100 tiles in total.
  const TILESET = {
    A: [9, 1], B: [2, 4], C: [3, 3], D: [4, 2], E: [10, 1], F: [2, 4], G: [3, 3], H: [3, 3], I: [8, 1],
    J: [1, 9], K: [1, 5], L: [4, 2], M: [3, 3], N: [6, 1], O: [7, 1], P: [2, 3], Q: [1, 10], R: [6, 1],
    S: [5, 1], T: [6, 1], U: [4, 2], V: [2, 5], W: [2, 4], X: [1, 8], Y: [2, 4], Z: [1, 9], '?': [2, 0],
  };
  const VAL = {};
  Object.keys(TILESET).forEach((k) => { VAL[k] = TILESET[k][1]; });

  // Bonus squares, defined for one eighth of the board (row <= col <= 7) and mirrored.
  const OCTANT = {
    tw: [[0, 3]],
    dw: [[2, 6], [4, 4]],
    tl: [[0, 7], [1, 4], [3, 7]],
    dl: [[0, 0], [2, 2], [3, 5], [5, 6], [1, 6]],
  };
  const PREM = new Array(SIZE * SIZE).fill('');
  Object.keys(OCTANT).forEach((type) => {
    OCTANT[type].forEach(([r, c]) => {
      const m = SIZE - 1;
      [[r, c], [c, r], [r, m - c], [m - c, r], [m - r, c], [c, m - r], [m - r, m - c], [m - c, m - r]]
        .forEach(([a, b]) => { PREM[a * SIZE + b] = type; });
    });
  });
  PREM[CENTER * SIZE + CENTER] = 'st';
  const PREM_LABEL = { tw: '3W', dw: '2W', tl: '3L', dl: '2L', st: '★' };

  const CPU_LEVELS = {
    easy: { name: 'Computer (Easy)', color: '#8a8f98' },
    medium: { name: 'Computer (Medium)', color: '#6b7280' },
    hard: { name: 'Computer (Hard)', color: '#374151' },
  };
  const isCpu = (id) => String(id).startsWith('cpu-');

  /* ---------- Helpers ---------- */

  const idx = (r, c) => r * SIZE + c;
  const inB = (r, c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;
  const tileVal = (t) => (t.b ? 0 : VAL[t.l]);
  const rackVal = (rack) => rack.reduce((s, l) => s + VAL[l], 0);
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------- Move analysis & scoring ---------- */

  // placed: [{r, c, l, b}]  ->  { error } or { words: [{text, score}], score, bingo }
  function analyze(board, placed) {
    if (!placed.length) return { error: 'Place tiles on the board.' };
    const map = new Map(placed.map((p) => [idx(p.r, p.c), p]));
    const at = (r, c) => (inB(r, c) ? (map.get(idx(r, c)) || board[idx(r, c)]) : null);
    if (placed.some((p) => board[idx(p.r, p.c)])) return { error: 'That square is taken.' };

    const sameRow = placed.every((p) => p.r === placed[0].r);
    const sameCol = placed.every((p) => p.c === placed[0].c);
    if (!sameRow && !sameCol) return { error: 'Tiles must be in one row or one column.' };
    const p0 = placed[0];
    let horiz;
    if (sameRow && !sameCol) horiz = true;
    else if (sameCol && !sameRow) horiz = false;
    else horiz = !!(at(p0.r, p0.c - 1) || at(p0.r, p0.c + 1));
    const [dr, dc] = horiz ? [0, 1] : [1, 0];

    const sorted = placed.slice().sort((a, b) => (a.r - b.r) || (a.c - b.c));
    const first = sorted[0]; const last = sorted[sorted.length - 1];
    for (let r = first.r, c = first.c; r <= last.r && c <= last.c; r += dr, c += dc) {
      if (!at(r, c)) return { error: 'Leave no gaps between your tiles.' };
    }

    const boardEmpty = board.every((x) => !x);
    if (boardEmpty) {
      if (!map.has(idx(CENTER, CENTER))) return { error: 'The first word must cover the ★ square.' };
      if (placed.length < 2) return { error: 'The first word needs at least two letters.' };
    } else {
      const touches = placed.some((p) => [[-1, 0], [1, 0], [0, -1], [0, 1]]
        .some(([a, b]) => inB(p.r + a, p.c + b) && board[idx(p.r + a, p.c + b)]));
      if (!touches) return { error: 'Your word must connect to tiles on the board.' };
    }

    const wordAt = (r, c, wr, wc) => {
      while (at(r - wr, c - wc)) { r -= wr; c -= wc; }
      const cells = [];
      while (at(r, c)) { cells.push([r, c]); r += wr; c += wc; }
      return cells;
    };
    const lines = [];
    const main = wordAt(p0.r, p0.c, dr, dc);
    if (main.length >= 2) lines.push(main);
    placed.forEach((p) => { const cross = wordAt(p.r, p.c, dc, dr); if (cross.length >= 2) lines.push(cross); });
    if (!lines.length) return { error: 'Words need at least two letters.' };

    const words = lines.map((cells) => {
      let sum = 0; let wm = 1; let text = '';
      cells.forEach(([r, c]) => {
        const t = at(r, c);
        let v = tileVal(t);
        text += t.l;
        if (map.has(idx(r, c))) {
          const pr = PREM[idx(r, c)];
          if (pr === 'dl') v *= 2; else if (pr === 'tl') v *= 3;
          else if (pr === 'dw' || pr === 'st') wm *= 2; else if (pr === 'tw') wm *= 3;
        }
        sum += v;
      });
      return { text, score: sum * wm };
    });
    const bingo = placed.length === RACK;
    const score = words.reduce((s, w) => s + w.score, 0) + (bingo ? FULL_RACK_BONUS : 0);
    return { words, score, bingo };
  }

  /* ---------- Compact word trie for the computer player ---------- */

  let trie = null;
  function getTrie() {
    if (trie && trie.size === Dict.words.size) return trie;
    let cap = 1 << 19;
    let letter = new Uint8Array(cap); let first = new Int32Array(cap); let next = new Int32Array(cap);
    let lastC = new Int32Array(cap); let term = new Uint8Array(cap);
    const grow = () => {
      cap *= 2;
      const g = (A, T) => { const n = new T(cap); n.set(A); return n; };
      letter = g(letter, Uint8Array); first = g(first, Int32Array); next = g(next, Int32Array);
      lastC = g(lastC, Int32Array); term = g(term, Uint8Array);
    };
    first[0] = -1; next[0] = -1; lastC[0] = -1;
    let n = 1;
    const words = Array.from(Dict.words).filter((w) => w.length <= SIZE).sort();
    const path = [0]; let prev = '';
    for (const w of words) {
      let k = 0;
      while (k < prev.length && k < w.length && prev[k] === w[k]) k++;
      path.length = k + 1;
      let node = path[k];
      for (let i = k; i < w.length; i++) {
        if (n >= cap) grow();
        const m = n++;
        letter[m] = w.charCodeAt(i) - 65; first[m] = -1; next[m] = -1; lastC[m] = -1; term[m] = 0;
        if (first[node] === -1) first[node] = m; else next[lastC[node]] = m;
        lastC[node] = m;
        node = m;
        path.push(m);
      }
      term[node] = 1;
      prev = w;
    }
    trie = { letter, first, next, term, size: Dict.words.size };
    return trie;
  }

  // Finds every legal move for a rack (anchor-based search over rows, then columns).
  function generateMoves(board, rack) {
    const T = getTrie();
    const child = (node, ci) => { for (let m = T.first[node]; m !== -1; m = T.next[m]) if (T.letter[m] === ci) return m; return -1; };
    const counts = new Array(27).fill(0);
    rack.forEach((l) => { counts[l === '?' ? 26 : l.charCodeAt(0) - 65]++; });
    const empty = board.every((x) => !x);
    const ALL = (1 << 26) - 1;
    const found = new Map();

    for (const transpose of [false, true]) {
      const get = (r, c) => (inB(r, c) ? board[transpose ? idx(c, r) : idx(r, c)] : undefined);
      for (let r = 0; r < SIZE; r++) {
        const cross = new Int32Array(SIZE); const anchor = new Uint8Array(SIZE);
        for (let c = 0; c < SIZE; c++) {
          if (get(r, c)) continue;
          let up = ''; let rr = r - 1;
          while (get(rr, c)) { up = get(rr, c).l + up; rr--; }
          let down = ''; rr = r + 1;
          while (get(rr, c)) { down += get(rr, c).l; rr++; }
          if (!up && !down) cross[c] = ALL;
          else {
            let m = 0;
            for (let i = 0; i < 26; i++) if (Dict.words.has(up + String.fromCharCode(65 + i) + down)) m |= 1 << i;
            cross[c] = m;
          }
          anchor[c] = empty ? (r === CENTER && c === CENTER ? 1 : 0) : ((up || down || get(r, c - 1) || get(r, c + 1)) ? 1 : 0);
        }

        const record = (placed) => {
          const tiles = placed.map((p) => (transpose ? { r: p.c, c: r, l: p.l, b: p.b } : { r, c: p.c, l: p.l, b: p.b }));
          const key = tiles.map((t) => `${t.r},${t.c},${t.l},${t.b ? 1 : 0}`).sort().join('|');
          if (!found.has(key)) found.set(key, tiles);
        };

        for (let a = 0; a < SIZE; a++) {
          if (!anchor[a]) continue;
          const extend = (col, node, placed) => {
            const cell = get(r, col);
            if (!cell) {
              if (col > a && T.term[node] && placed.length) record(placed);
              if (cell === undefined) return;
              const mask = cross[col];
              for (let m = T.first[node]; m !== -1; m = T.next[m]) {
                const ci = T.letter[m];
                if (!(mask & (1 << ci))) continue;
                const L = String.fromCharCode(65 + ci);
                if (counts[ci] > 0) {
                  counts[ci]--; placed.push({ c: col, l: L, b: false }); extend(col + 1, m, placed); placed.pop(); counts[ci]++;
                } else if (counts[26] > 0) {
                  counts[26]--; placed.push({ c: col, l: L, b: true }); extend(col + 1, m, placed); placed.pop(); counts[26]++;
                }
              }
            } else {
              const m = child(node, cell.l.charCodeAt(0) - 65);
              if (m >= 0) extend(col + 1, m, placed);
            }
          };
          const left = (node, limit, part) => {
            extend(a, node, part.map((t, j) => ({ c: a - part.length + j, l: t.l, b: t.b })));
            if (limit <= 0) return;
            for (let m = T.first[node]; m !== -1; m = T.next[m]) {
              const ci = T.letter[m];
              const L = String.fromCharCode(65 + ci);
              if (counts[ci] > 0) {
                counts[ci]--; left(m, limit - 1, part.concat({ l: L, b: false })); counts[ci]++;
              } else if (counts[26] > 0) {
                counts[26]--; left(m, limit - 1, part.concat({ l: L, b: true })); counts[26]++;
              }
            }
          };

          if (get(r, a - 1)) {
            let s = a - 1;
            while (get(r, s - 1)) s--;
            let node = 0;
            for (let c = s; c < a && node >= 0; c++) node = child(node, get(r, c).l.charCodeAt(0) - 65);
            if (node >= 0) extend(a, node, []);
          } else {
            let limit = 0; let c = a - 1;
            while (c >= 0 && !get(r, c) && !anchor[c]) { limit++; c--; }
            left(0, Math.min(limit, RACK - 1), []);
          }
        }
      }
    }

    const moves = [];
    found.forEach((tiles) => {
      const res = analyze(board, tiles);
      if (!res.error) moves.push({ tiles, ...res });
    });
    return moves;
  }

  // How good are the tiles we keep? Used by the hard computer.
  function leaveValue(rack) {
    let v = 0;
    const cnt = {};
    rack.forEach((l) => { cnt[l] = (cnt[l] || 0) + 1; });
    if (cnt['?']) v += 8 * cnt['?'];
    if (cnt.S) v += 3 * Math.min(cnt.S, 2);
    if (cnt.Q && !cnt.U) v -= 7;
    Object.keys(cnt).forEach((l) => { if (cnt[l] > 1 && l !== '?') v -= 2 * (cnt[l] - 1); });
    const vowels = rack.filter((l) => 'AEIOU'.includes(l)).length;
    const cons = rack.filter((l) => l !== '?' && !'AEIOU'.includes(l)).length;
    v -= Math.abs(vowels - cons) * 1.5;
    return v;
  }

  function chooseCpuMove(game, level) {
    const p = game.players[game.turn];
    const rack = game.racks[p.id];
    const moves = generateMoves(game.board, rack);
    if (!moves.length) return null;
    if (level === 'hard') {
      let best = null; let bestV = -Infinity;
      moves.forEach((m) => {
        const used = m.tiles.map((t) => (t.b ? '?' : t.l));
        const keep = rack.slice();
        used.forEach((u) => { const i = keep.indexOf(u); if (i >= 0) keep.splice(i, 1); });
        const v = m.score + (game.bag.length ? leaveValue(keep) : 0);
        if (v > bestV) { bestV = v; best = m; }
      });
      return best;
    }
    moves.sort((a, b) => b.score - a.score);
    if (level === 'medium') {
      const i = Math.floor(moves.length * (0.05 + Math.random() * 0.3));
      return moves[Math.min(i, moves.length - 1)];
    }
    // easy: short words, middling scores
    const pool = moves.filter((m) => m.words[0].text.length <= 5 && !m.tiles.some((t) => t.b));
    const list = pool.length ? pool : moves;
    const i = Math.floor(list.length * (0.4 + Math.random() * 0.45));
    return list[Math.min(i, list.length - 1)];
  }

  /* ---------- Game state ---------- */

  const gameOf = () => db.phone || null;

  function newGame(players) {
    const bag = [];
    Object.keys(TILESET).forEach((l) => { for (let i = 0; i < TILESET[l][0]; i++) bag.push(l); });
    shuffle(bag);
    const g = {
      id: uid(),
      startedAt: Date.now(),
      players,
      board: new Array(SIZE * SIZE).fill(null),
      bag,
      racks: {},
      scores: {},
      turn: 0,
      moveNo: 0,
      scoreless: 0,
      log: [],
      lastMove: [],
    };
    players.forEach((p) => { g.racks[p.id] = []; g.scores[p.id] = 0; draw(g, p.id); });
    return g;
  }

  function draw(g, pid) {
    while (g.racks[pid].length < RACK && g.bag.length) g.racks[pid].push(g.bag.pop());
  }

  function removeFromRack(rack, letters) {
    letters.forEach((l) => { const i = rack.indexOf(l); if (i >= 0) rack.splice(i, 1); });
  }

  function commitPlay(g, move) {
    const p = g.players[g.turn];
    move.tiles.forEach((t) => { g.board[idx(t.r, t.c)] = { l: t.l, b: !!t.b, o: p.id }; });
    removeFromRack(g.racks[p.id], move.tiles.map((t) => (t.b ? '?' : t.l)));
    g.scores[p.id] += move.score;
    g.lastMove = move.tiles.map((t) => idx(t.r, t.c));
    g.log.push({
      playerId: p.id, type: 'play', manual: null, bingo: move.bingo, score: move.score, at: Date.now(),
      words: move.words.map((w) => ({ text: w.text, mods: [], wm: 1, pts: w.score })),
    });
    g.scoreless = move.score > 0 ? 0 : g.scoreless + 1;
    draw(g, p.id);
    afterTurn(g, p.id);
  }

  function commitPass(g, exchange = []) {
    const p = g.players[g.turn];
    if (exchange.length) {
      const rack = g.racks[p.id];
      removeFromRack(rack, exchange);
      draw(g, p.id);
      g.bag.push(...exchange);
      shuffle(g.bag);
    }
    g.lastMove = [];
    g.log.push({ playerId: p.id, type: exchange.length ? 'exchange' : 'pass', words: [], manual: null, bingo: false, score: 0, at: Date.now(), n: exchange.length });
    g.scoreless++;
    afterTurn(g, p.id);
  }

  function afterTurn(g, pid) {
    g.moveNo++;
    if (!g.bag.length && !g.racks[pid].length) return endGame(g, pid);
    if (g.scoreless >= g.players.length * 3) return endGame(g, null);
    g.turn = (g.turn + 1) % g.players.length;
    save();
  }

  function endGame(g, outId, reason = 'scoreless') {
    const adjust = {};
    let pool = 0;
    g.players.forEach((p) => { const v = rackVal(g.racks[p.id]); adjust[p.id] = -v; pool += v; });
    if (outId) adjust[outId] += pool;
    const record = {
      id: g.id,
      mode: 'phone',
      startedAt: g.startedAt,
      endedAt: Date.now(),
      finished: true,
      playerIds: g.players.map((p) => p.id),
      players: g.players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
      turns: g.log,
      adjust,
      leftovers: Object.fromEntries(g.players.map((p) => [p.id, g.racks[p.id].join('')])),
    };
    db.games.push(record);
    db.phone = null;
    resetUi();
    save();
    go('match/' + record.id);
    toast(outId ? 'Game over! Saved to your history.' : reason === 'manual' ? 'Game ended and saved to your history.' : 'Game over: everyone passed or swapped three turns in a row. Saved to your history.');
    return true;
  }

  /* ---------- UI state ---------- */

  let ui;
  function resetUi() { ui = { sel: null, pending: [], revealed: -1, zoom: false, thinking: false, msg: '' }; }
  resetUi();

  const current = (g) => g.players[g.turn];
  const humanCount = (g) => g.players.filter((p) => !isCpu(p.id)).length;
  const needsCover = (g) => !isCpu(current(g).id) && humanCount(g) > 1 && ui.revealed !== g.moveNo;

  // Rack letters still in hand (not yet placed on the board this turn)
  function handIndexes(g) {
    const used = new Set(ui.pending.map((p) => p.ri));
    return g.racks[current(g).id].map((l, i) => i).filter((i) => !used.has(i));
  }

  /* ---------- Views ---------- */

  TITLES.play = 'Play on this phone';
  TITLES.board = GAME_NAME;

  let pickSel = [];
  VIEWS.play = () => {
    const humans = db.players;
    const cpus = Object.keys(CPU_LEVELS).map((k) => ({ id: 'cpu-' + k, ...CPU_LEVELS[k] }));
    pickSel = pickSel.filter((id) => isCpu(id) || playerById(id));
    const row = (p) => {
      const n = pickSel.indexOf(p.id);
      return `<div class="pick ${n >= 0 ? 'on' : ''}" style="--pc:${esc(p.color)}" data-g="pick" data-id="${p.id}" role="button" tabindex="0">
        <span class="dot"></span> ${esc(p.name)} <span class="order">${n >= 0 ? n + 1 : ''}</span></div>`;
    };
    const warn = gameOf() ? '<p class="muted">Starting a new game replaces the game in progress.</p>' : '';
    return `
      <div class="card">
        <h2>${GAME_NAME}</h2>
        <p class="muted">An original crossword tile game. Tap players in turn order (2–4). With two or more people, pass the phone and your letters stay hidden between turns.</p>
        <h3>People</h3>
        ${humans.length ? humans.map(row).join('') : '<p class="muted">No players yet.</p>'}
        <a href="#/player/new" class="muted">＋ Add a player</a>
        <h3>Computer</h3>
        ${cpus.map(row).join('')}
      </div>
      ${warn}
      <button class="btn block" data-g="start" ${pickSel.length >= 2 && pickSel.length <= 4 ? '' : 'disabled'}>Deal tiles</button>
      <div class="card" style="margin-top:16px">
        <h2>How to play</h2>
        <ul class="muted" style="padding-left:18px;margin:0">
          <li>Tap a tile in your rack, then tap a square to place it. Tap a placed tile to take it back.</li>
          <li>The first word must cover the ★. After that, words must connect to tiles already on the board.</li>
          <li>Every word you make must be in the dictionary.</li>
          <li>Bonus squares: 2L/3L multiply a letter, 2W/3W multiply the word. Using all 7 tiles earns +${FULL_RACK_BONUS}.</li>
          <li>The game ends when someone uses their last tile with the bag empty, or when every player passes or swaps three turns in a row.</li>
        </ul>
      </div>`;
  };

  VIEWS.board = () => {
    const g = gameOf();
    if (!g) return `<div class="card center"><p>No game in progress.</p><a class="btn" href="#/play">Start a game</a></div>`;
    const cur = current(g);
    const cpuTurn = isCpu(cur.id);
    const cover = needsCover(g);
    const pendMap = new Map(ui.pending.map((p) => [idx(p.r, p.c), p]));
    const last = new Set(g.lastMove);

    const scores = g.players.map((p, i) => `
      <div class="pcard mini ${i === g.turn ? 'active' : ''}" style="--pc:${esc(p.color)}">
        <div class="name">${esc(p.name)}</div><div class="score">${g.scores[p.id]}</div>
      </div>`).join('');

    let cells = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const t = g.board[i]; const pd = pendMap.get(i);
      if (t) {
        cells += `<div class="sq tile-sq ${last.has(i) ? 'last' : ''}">${t.l}<sub>${t.b ? '' : VAL[t.l]}</sub></div>`;
      } else if (pd) {
        cells += `<button class="sq tile-sq pending" data-g="unplace" data-i="${i}">${pd.l}<sub>${pd.b ? '' : VAL[pd.l]}</sub></button>`;
      } else {
        const pr = PREM[i];
        cells += `<button class="sq ${pr ? 'p-' + pr : ''}" data-g="place" data-i="${i}" aria-label="Row ${Math.floor(i / SIZE) + 1} column ${(i % SIZE) + 1}">${pr ? PREM_LABEL[pr] : ''}</button>`;
      }
    }

    let preview = '';
    let canPlay = false;
    if (ui.pending.length) {
      const res = analyze(g.board, ui.pending.map(({ r, c, l, b }) => ({ r, c, l, b })));
      if (res.error) preview = `<span class="verdict no">${esc(res.error)}</span>`;
      else {
        const checks = res.words.map((w) => ({ ...w, ok: Dict.check(w.text) }));
        canPlay = checks.every((w) => w.ok === true);
        preview = checks.map((w) => `<span class="verdict ${w.ok ? 'ok' : w.ok === false ? 'no' : 'muted'}">${esc(w.text)} ${w.ok ? '✓' : w.ok === false ? '✗' : '…'} ${w.score}</span>`).join(' &nbsp;')
          + (res.bingo ? ` <span class="badge">ALL 7 +${FULL_RACK_BONUS}</span>` : '')
          + ` <b style="margin-left:6px">= ${res.score}</b>`;
      }
    }

    let rackArea;
    if (cpuTurn) {
      rackArea = `<div class="card center"><p><b>${esc(cur.name)}</b> is thinking…</p></div>`;
    } else if (cover) {
      const lastLog = g.log[g.log.length - 1];
      const lastTxt = lastLog ? `<p class="muted">${esc(gamePlayer({ players: g.players }, lastLog.playerId).name)} ${lastLog.type === 'play' ? `played ${esc(lastLog.words.map((w) => w.text).join(', '))} for ${lastLog.score}` : lastLog.type === 'exchange' ? `swapped ${lastLog.n} tile${lastLog.n > 1 ? 's' : ''}` : 'passed'}.</p>` : '';
      rackArea = `<div class="card center cover" style="border-top:6px solid ${esc(cur.color)}">
        ${lastTxt}
        <p style="font-size:1.1rem">Pass the phone to <b>${esc(cur.name)}</b></p>
        <button class="btn" data-g="reveal">I'm ${esc(cur.name)}, show my tiles</button></div>`;
    } else {
      const rack = g.racks[cur.id];
      const hand = handIndexes(g);
      rackArea = `
        <div class="preview">${preview || '<span class="muted">Tap a tile, then a square.</span>'}</div>
        <div class="rack">${hand.map((i) => `<button class="tile lg ${ui.sel === i ? 'sel' : ''} ${rack[i] === '?' ? 'blank' : ''}" data-g="sel" data-ri="${i}">${rack[i] === '?' ? '' : rack[i]}<sub>${VAL[rack[i]] || ''}</sub></button>`).join('')}</div>
        <div class="row" style="justify-content:center">
          ${ui.pending.length
            ? '<button class="btn secondary small" data-g="recall">Recall</button>'
            : '<button class="btn secondary small" data-g="shuffle">Shuffle</button>'}
          <button class="btn secondary small" data-g="exchange" ${g.bag.length >= RACK && !ui.pending.length ? '' : 'disabled'}>Swap</button>
          <button class="btn secondary small" data-g="pass" ${ui.pending.length ? 'disabled' : ''}>Pass</button>
          <button class="btn" data-g="play" ${canPlay ? '' : 'disabled'}>Play</button>
        </div>`;
    }

    return `
      <div class="scoreboard mini">${scores}</div>
      <div class="board-wrap ${ui.zoom ? 'zoomed' : ''}" id="boardWrap"><div class="board">${cells}</div></div>
      <div class="row" style="margin:6px 0 10px">
        <span class="bag-count">${g.bag.length} tiles in bag</span>
        <span class="spacer"></span>
        <button class="btn ghost small light" data-g="zoom">${ui.zoom ? 'Zoom out' : 'Zoom in'}</button>
        <button class="btn ghost small light" data-g="menu">⋯</button>
      </div>
      ${rackArea}`;
  };

  AFTER.board = () => {
    const g = gameOf();
    if (!g) return;
    if (ui.msg) { toast(ui.msg); ui.msg = ''; }
    if (isCpu(current(g).id) && !ui.thinking) runCpu();
  };

  // Re-render the board screen without jumping to the top or losing zoom scroll.
  function refresh() {
    const wrap = $('#boardWrap');
    const sx = wrap ? wrap.scrollLeft : 0; const sy = wrap ? wrap.scrollTop : 0; const wy = window.scrollY;
    $('#app').innerHTML = VIEWS.board();
    const w2 = $('#boardWrap');
    if (w2) { w2.scrollLeft = sx; w2.scrollTop = sy; }
    window.scrollTo(0, wy);
    AFTER.board();
  }

  async function runCpu() {
    const g = gameOf();
    if (!g) return;
    ui.thinking = true;
    let moved = false;
    try {
      if (Dict.state !== 'ready') await Dict.load();
      if (Dict.state !== 'ready') { toast('The computer needs the dictionary. Connect to the internet, then reopen the game.'); return; }
      await new Promise((res) => setTimeout(res, 400)); // let "thinking…" paint
      if (gameOf() !== g) return;
      const p = current(g);
      const move = chooseCpuMove(g, p.id.slice(4));
      if (move) {
        commitPlay(g, move);
        ui.msg = `${p.name} played ${move.words.map((w) => w.text).join(', ')} for ${move.score}.`;
      } else if (g.bag.length >= RACK) {
        const rack = g.racks[p.id].slice().sort((a, b) => VAL[b] - VAL[a]);
        commitPass(g, rack.slice(0, Math.min(4, rack.length)));
        ui.msg = `${p.name} swapped tiles.`;
      } else {
        commitPass(g);
        ui.msg = `${p.name} passed.`;
      }
      moved = true;
    } catch (e) {
      console.error(e);
      toast('The computer got stuck and passed.');
      if (gameOf() === g) { commitPass(g); moved = true; }
    } finally {
      ui.thinking = false;
      if (moved && gameOf() && route().name === 'board') refresh();
    }
  }

  /* ---------- Modals ---------- */

  function pickBlank(cb) {
    openModal(`<h2>Blank tile</h2><p class="muted">Which letter should it be? It scores 0.</p>
      <div class="letter-grid">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `<button class="tile" data-blank="${l}">${l}</button>`).join('')}</div>
      <div class="row end" style="margin-top:12px"><button class="btn ghost" data-action="close-modal">Cancel</button></div>`);
    $$('[data-blank]').forEach((b) => b.addEventListener('click', () => { closeModal(); cb(b.dataset.blank); }));
  }

  function openExchange(g) {
    const rack = g.racks[current(g).id];
    const chosen = new Set();
    openModal(`<h2>Swap tiles</h2><p class="muted">Pick the tiles to put back in the bag. You'll draw new ones and lose this turn.</p>
      <div class="rack">${rack.map((l, i) => `<button class="tile lg ${l === '?' ? 'blank' : ''}" data-x="${i}">${l === '?' ? '' : l}<sub>${VAL[l] || ''}</sub></button>`).join('')}</div>
      <div class="row end" style="margin-top:12px"><button class="btn ghost" data-action="close-modal">Cancel</button><button class="btn" id="doSwap" disabled>Swap</button></div>`);
    $$('[data-x]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.x);
      if (chosen.has(i)) chosen.delete(i); else chosen.add(i);
      b.classList.toggle('sel', chosen.has(i));
      $('#doSwap').disabled = !chosen.size;
    }));
    $('#doSwap').addEventListener('click', () => {
      closeModal();
      commitPass(g, [...chosen].map((i) => rack[i]));
      ui.pending = []; ui.sel = null;
      refresh();
    });
  }

  function openMenu(g) {
    openModal(`<h2>Game options</h2>
      <div class="menu">
        <button class="btn secondary" id="mEnd">End game now & save</button>
        <button class="btn danger" id="mDiscard">Discard game</button>
        <button class="btn ghost" data-action="close-modal">Back to game</button>
      </div>
      <p class="muted">Ending now subtracts everyone's remaining tiles, as if no one went out.</p>`);
    $('#mEnd').addEventListener('click', () => { closeModal(); endGame(g, null, 'manual'); });
    $('#mDiscard').addEventListener('click', () => {
      confirmModal('Discard this game? It will not be saved.', 'Discard', () => { db.phone = null; resetUi(); save(); go(''); });
    });
  }

  /* ---------- Events ---------- */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-g]');
    if (!el) return;
    const a = el.dataset.g;
    const g = gameOf();

    if (a === 'pick') {
      const id = el.dataset.id;
      const i = pickSel.indexOf(id);
      if (i >= 0) pickSel.splice(i, 1);
      else if (pickSel.length < 4) pickSel.push(id);
      else toast('Up to 4 players.');
      render();
      return;
    }
    if (a === 'start') {
      const players = pickSel.map((id) => (isCpu(id)
        ? { id, ...CPU_LEVELS[id.slice(4)] }
        : { id, name: playerById(id).name, color: playerById(id).color }));
      db.phone = newGame(players);
      pickSel = [];
      resetUi();
      save();
      go('board');
      if (Dict.state !== 'ready') toast('Loading the dictionary…');
      return;
    }
    if (!g) return;
    const cur = current(g);

    switch (a) {
      case 'reveal': ui.revealed = g.moveNo; refresh(); break;
      case 'zoom': ui.zoom = !ui.zoom; refresh(); break;
      case 'menu': openMenu(g); break;
      case 'sel': {
        const ri = Number(el.dataset.ri);
        ui.sel = ui.sel === ri ? null : ri;
        refresh();
        break;
      }
      case 'place': {
        if (ui.sel == null) {
          const hand = handIndexes(g);
          if (hand.length === 1) ui.sel = hand[0];
          else { toast('Tap a tile in your rack first.'); break; }
        }
        const i = Number(el.dataset.i);
        const ri = ui.sel;
        const letter = g.racks[cur.id][ri];
        const put = (l, b) => {
          ui.pending.push({ r: Math.floor(i / SIZE), c: i % SIZE, l, b, ri });
          ui.sel = null;
          refresh();
        };
        if (letter === '?') pickBlank((l) => put(l, true)); else put(letter, false);
        break;
      }
      case 'unplace': {
        const i = Number(el.dataset.i);
        const k = ui.pending.findIndex((p) => idx(p.r, p.c) === i);
        if (k >= 0) { ui.sel = ui.pending[k].ri; ui.pending.splice(k, 1); }
        refresh();
        break;
      }
      case 'recall': ui.pending = []; ui.sel = null; refresh(); break;
      case 'shuffle': shuffle(g.racks[cur.id]); ui.sel = null; save(); refresh(); break;
      case 'exchange': openExchange(g); break;
      case 'pass':
        confirmModal('Pass this turn without playing?', 'Pass', () => { commitPass(g); ui.pending = []; ui.sel = null; refresh(); });
        break;
      case 'play': {
        if (Dict.state !== 'ready') { toast('The dictionary is still loading.'); break; }
        const tiles = ui.pending.map(({ r, c, l, b }) => ({ r, c, l, b }));
        const res = analyze(g.board, tiles);
        if (res.error) { toast(res.error); break; }
        const bad = res.words.filter((w) => !Dict.check(w.text));
        if (bad.length) { toast(`${bad.map((w) => w.text).join(', ')} isn't in the dictionary.`); break; }
        ui.pending = []; ui.sel = null;
        commitPlay(g, { tiles, ...res });
        if (gameOf() === g) {
          if (humanCount(g) <= 1) ui.msg = `${cur.name} scored ${res.score}.`;
          refresh();
        }
        break;
      }
      default: break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.g === 'pick') { e.preventDefault(); e.target.click(); }
  });

  return { analyze, generateMoves, chooseCpuMove, newGame, PREM, VAL, SIZE, GAME_NAME, gameOf };
})();

render();
