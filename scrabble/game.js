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

  // The board screen shows either the one-phone game or an online game (by join code).
  let activeCode = null;
  const onlineMeta = (code = activeCode) => (code && db.online ? db.online[code] || null : null);
  const gameOf = () => (activeCode ? (onlineMeta() ? onlineMeta().game : null) : (db.phone || null));

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
    if (g.code) pushOnline(g.code);
  }

  const endMessage = (outId, reason) => (outId ? 'Game over! Saved to your history.'
    : reason === 'manual' ? 'Game ended and saved to your history.'
      : 'Game over: everyone passed or swapped three turns in a row. Saved to your history.');

  // History record for a finished game. mapId translates another phone's player ids to this phone's.
  function buildRecord(g, adjust, endedAt, mapId = (id) => id) {
    return {
      id: g.id,
      mode: g.code ? 'online' : 'phone',
      startedAt: g.startedAt,
      endedAt,
      finished: true,
      playerIds: g.players.map((p) => mapId(p.id)),
      players: g.players.map((p) => ({ id: mapId(p.id), name: p.name, color: p.color })),
      turns: g.log.map((t) => ({ ...t, playerId: mapId(t.playerId) })),
      adjust: Object.fromEntries(Object.keys(adjust).map((k) => [mapId(k), adjust[k]])),
      leftovers: Object.fromEntries(g.players.map((p) => [mapId(p.id), g.racks[p.id].join('')])),
    };
  }

  function endGame(g, outId, reason = 'scoreless') {
    const adjust = {};
    let pool = 0;
    g.players.forEach((p) => { const v = rackVal(g.racks[p.id]); adjust[p.id] = -v; pool += v; });
    if (outId) adjust[outId] += pool;
    if (g.code) {
      // Online: mark the shared game as over; each phone files it into its own history once synced.
      g.over = { outId, reason, adjust, endedAt: Date.now() };
      save();
      pushOnline(g.code);
      return true;
    }
    const record = buildRecord(g, adjust, Date.now());
    db.games.push(record);
    db.phone = null;
    resetUi();
    save();
    go('match/' + record.id);
    toast(endMessage(outId, reason));
    return true;
  }

  /* ---------- Online play (two phones) ---------- */

  const API = (window.LUNAR_API || 'https://lunar-games-api.netlify.app') + '/api/game/';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function newCode() {
    const a = new Uint32Array(8);
    crypto.getRandomValues(a);
    let s = '';
    a.forEach((x, i) => { s += CODE_CHARS[x % CODE_CHARS.length]; if (i === 3) s += '-'; });
    return s;
  }
  function normalizeCode(raw) {
    const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
  }

  async function api(method, code, body) {
    const res = await fetch(API + encodeURIComponent(code), {
      method,
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    return { status: res.status, data };
  }

  function adopt(code, game, etag) {
    const meta = onlineMeta(code);
    game.code = code;
    meta.game = game;
    meta.etag = etag;
    meta.dirty = false;
  }

  function refreshIfViewing(code) {
    if (route().name === 'online' && activeCode === code && onlineMeta(code)) refresh();
  }

  // Send this phone's copy of the game to the service.
  async function pushOnline(code) {
    const meta = onlineMeta(code);
    if (!meta) return 'gone';
    meta.dirty = true;
    save();
    try {
      const r = await api('PUT', code, { game: meta.game, etag: meta.etag });
      if (r.status === 200) {
        meta.etag = r.data.etag; meta.dirty = false; save();
        if (meta.game.over) finishOnline(code);
        return 'ok';
      }
      if (r.status === 409 && r.data && r.data.game) {
        adopt(code, r.data.game, r.data.etag); save();
        toast('The game changed on the other phone, so this phone was updated to match.');
        if (meta.game.over) finishOnline(code); else refreshIfViewing(code);
        return 'conflict';
      }
      throw new Error('HTTP ' + r.status);
    } catch (e) {
      toast("Saved on this phone. It'll sync when you're back online.");
      refreshIfViewing(code);
      return 'offline';
    }
  }

  // Fetch the latest copy from the service (sending ours first if it hasn't gone out yet).
  async function pullOnline(code) {
    const meta = onlineMeta(code);
    if (!meta) return 'gone';
    if (meta.dirty) {
      const p = await pushOnline(code);
      if (p === 'offline') return 'offline';
      if (p === 'conflict') return 'changed';
      if (!onlineMeta(code)) return 'changed';
    }
    try {
      const r = await api('GET', code);
      if (r.status === 404) return 'missing';
      if (r.status !== 200) return 'offline';
      if (r.data.etag === meta.etag) return 'same';
      adopt(code, r.data.game, r.data.etag); save();
      if (meta.game.over) finishOnline(code);
      return 'changed';
    } catch (e) { return 'offline'; }
  }

  // Once a shared game is over and synced: file it in this phone's history and drop it from the list.
  function finishOnline(code) {
    const meta = onlineMeta(code);
    if (!meta || !meta.game.over || meta.dirty) return;
    const g = meta.game; const o = g.over;
    const mapId = (id) => (meta.map && meta.map[id]) || id;
    if (!db.games.some((x) => x.id === g.id)) db.games.push(buildRecord(g, o.adjust, o.endedAt, mapId));
    delete db.online[code];
    save();
    if (route().name === 'online' && activeCode === code) {
      resetUi();
      go('match/' + g.id);
      toast(endMessage(o.outId, o.reason));
    } else if (route().name === 'home') render();
  }

  async function publishOnline(g, me) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = newCode();
      g.code = code;
      let r;
      try { r = await api('PUT', code, { game: g, etag: null }); } catch (e) { delete g.code; throw e; }
      if (r.status === 200) {
        db.online = db.online || {};
        db.online[code] = { code, me, etag: r.data.etag, game: g, map: {}, dirty: false, joinedAt: Date.now() };
        save();
        return code;
      }
      if (r.status !== 409) { delete g.code; throw new Error('HTTP ' + r.status); }
    }
    delete g.code;
    throw new Error('Could not get a free game code');
  }

  const joinUrl = (code) => `${location.origin}${location.pathname}#/join/${code}`;

  function showShare(code) {
    openModal(`<h2>Game code</h2>
      <p class="muted">On the other phone, open Lunar → Play → <b>Join a game</b> and enter this code, or send them the link.</p>
      <div class="code-big">${esc(code)}</div>
      <div class="row end" style="margin-top:12px">
        <button class="btn ghost" data-action="close-modal">Done</button>
        <button class="btn" id="shareCode">Send to the other phone</button>
      </div>`);
    $('#shareCode').addEventListener('click', async () => {
      const text = `Join my Lunar game! Code: ${code}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Lunar', text, url: joinUrl(code) });
        else { await navigator.clipboard.writeText(`${text}\n${joinUrl(code)}`); toast('Copied. Paste it in a text to the other player.'); }
      } catch (e) { /* share sheet closed */ }
    });
  }

  let pollTimer = null;
  function startPolling(code) {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (route().name !== 'online' || activeCode !== code || !onlineMeta(code)) { clearInterval(pollTimer); return; }
      const meta = onlineMeta(code);
      const waiting = current(meta.game).id !== meta.me;
      if ((waiting || meta.dirty) && $('#modal').hidden && document.visibilityState === 'visible') syncAndRefresh(code);
    }, 8000);
  }

  async function syncAndRefresh(code, manual = false) {
    const r = await pullOnline(code);
    const meta = onlineMeta(code);
    if (!(route().name === 'online' && activeCode === code && meta)) return;
    if (r === 'changed') {
      ui.pending = []; ui.sel = null;
      if (current(meta.game).id === meta.me) ui.msg = 'Your turn!';
      refresh();
    } else if (manual) {
      toast(r === 'offline' ? "Couldn't reach the game service. Check your connection." : r === 'missing' ? 'This game is no longer on the server.' : 'No new moves yet.');
      refresh();
    }
  }

  let lastHomeSync = 0;
  async function refreshAllOnline() {
    const codes = Object.keys(db.online || {});
    if (!codes.length || Date.now() - lastHomeSync < 3000) return;
    lastHomeSync = Date.now();
    const results = await Promise.all(codes.map((c) => pullOnline(c)));
    if (results.includes('changed') && route().name === 'home') render();
  }

  function homeCards() {
    const list = Object.values(db.online || {}).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    if (!list.length) return '';
    return `<div class="card"><h2>Online games</h2><ul class="list">${list.map((m) => {
      const g = m.game; const cur = current(g); const mine = cur.id === m.me;
      const others = g.players.filter((p) => p.id !== m.me).map((p) => esc(p.name)).join(', ');
      const scores = g.players.map((p) => `${esc(p.name)} ${g.scores[p.id]}`).join(' · ');
      return `<li><button class="linkish" data-g="open-online" data-code="${esc(m.code)}">
        <span class="grow"><b>vs ${others}</b><div class="muted">${scores}</div></span>
        ${mine ? '<span class="badge gold">Your turn!</span>' : `<span class="muted">${esc(cur.name)}'s turn</span>`}
      </button></li>`;
    }).join('')}</ul></div>`;
  }
  AFTER.home = () => { refreshAllOnline(); };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (route().name === 'home') { lastHomeSync = 0; refreshAllOnline(); }
    if (route().name === 'online' && activeCode) syncAndRefresh(activeCode);
  });

  /* ---------- UI state ---------- */

  let ui;
  function resetUi() { ui = { sel: null, pending: [], revealed: -1, zoom: false, thinking: false, msg: '' }; }
  resetUi();

  const current = (g) => g.players[g.turn];
  const humanCount = (g) => g.players.filter((p) => !isCpu(p.id)).length;
  const needsCover = (g) => !g.code && !isCpu(current(g).id) && humanCount(g) > 1 && ui.revealed !== g.moveNo;

  // Rack letters still in hand (not yet placed on the board this turn)
  function handIndexes(g) {
    const used = new Set(ui.pending.map((p) => p.ri));
    return g.racks[handOwner(g)].map((l, i) => i).filter((i) => !used.has(i));
  }
  const handOwner = (g) => (g.code && onlineMeta(g.code) ? onlineMeta(g.code).me : current(g).id);
  const isMyTurn = (g) => !g.code || !onlineMeta(g.code) || current(g).id === onlineMeta(g.code).me;

  /* ---------- Views ---------- */

  TITLES.play = 'Play';
  TITLES.board = GAME_NAME;
  TITLES.online = GAME_NAME;
  TITLES.join = 'Join a game';

  let pickSel = [];
  let pickMode = 'phone';
  let meSel = null;
  VIEWS.play = () => {
    const humans = db.players;
    if (pickMode === 'online') pickSel = pickSel.filter((id) => !isCpu(id));
    if (!pickSel.includes(meSel)) meSel = pickSel.find((id) => !isCpu(id)) || null;
    const cpus = Object.keys(CPU_LEVELS).map((k) => ({ id: 'cpu-' + k, ...CPU_LEVELS[k] }));
    pickSel = pickSel.filter((id) => isCpu(id) || playerById(id));
    const row = (p) => {
      const n = pickSel.indexOf(p.id);
      return `<div class="pick ${n >= 0 ? 'on' : ''}" style="--pc:${esc(p.color)}" data-g="pick" data-id="${p.id}" role="button" tabindex="0">
        <span class="dot"></span> ${esc(p.name)} <span class="order">${n >= 0 ? n + 1 : ''}</span></div>`;
    };
    const online = pickMode === 'online';
    const warn = !online && db.phone ? '<p class="muted">Starting a new one-phone game replaces the one in progress.</p>' : '';
    const meRow = online && pickSel.length ? `<h3>Which one is you?</h3><div class="row">${pickSel.map((id) => {
      const p = playerById(id);
      return `<button class="chip ${meSel === id ? 'on bingo' : ''}" data-g="me" data-id="${id}">${esc(p ? p.name : id)}</button>`;
    }).join('')}</div>` : '';
    return `
      <div class="card">
        <h2>${GAME_NAME}</h2>
        <div class="seg" role="group" aria-label="Where to play" style="margin-bottom:12px">
          <button data-g="mode" data-mode="phone" class="${online ? '' : 'on'}">One phone</button>
          <button data-g="mode" data-mode="online" class="${online ? 'on' : ''}">Two phones</button>
        </div>
        <p class="muted">${online
          ? 'Each person plays on their own phone, anywhere. Tap the players in turn order, then send the game code to the other phone.'
          : 'Tap players in turn order (2–4). With two or more people, pass the phone and your letters stay hidden between turns.'}</p>
        <h3>People</h3>
        ${humans.length ? humans.map(row).join('') : '<p class="muted">No players yet.</p>'}
        <a href="#/player/new" class="muted">＋ Add a player</a>
        ${online ? meRow : `<h3>Computer</h3>${cpus.map(row).join('')}`}
      </div>
      ${warn}
      <button class="btn block" data-g="start" ${pickSel.length >= 2 && pickSel.length <= 4 ? '' : 'disabled'}>${online ? 'Create online game' : 'Deal tiles'}</button>
      <a class="btn secondary block" href="#/join" style="margin-top:10px">Have a code? Join a game</a>
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

  VIEWS.board = () => { activeCode = null; return boardHtml(); };
  VIEWS.online = (code) => { activeCode = normalizeCode(code); return boardHtml(); };

  function boardHtml() {
    const g = gameOf();
    if (!g) return `<div class="card center"><p>No game in progress.</p><a class="btn" href="#/play">Start a game</a></div>`;
    const cur = current(g);
    const meta = g.code ? onlineMeta(g.code) : null;
    const cpuTurn = isCpu(cur.id);
    const cover = needsCover(g);
    const pendMap = new Map(ui.pending.map((p) => [idx(p.r, p.c), p]));
    const last = new Set(g.lastMove);

    const scores = g.players.map((p, i) => `
      <div class="pcard mini ${i === g.turn ? 'active' : ''}" style="--pc:${esc(p.color)}">
        <div class="name">${esc(p.name)}${meta && p.id === meta.me ? ' <span class="muted">(you)</span>' : ''}</div><div class="score">${g.scores[p.id]}</div>
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
    if (meta && !isMyTurn(g)) {
      const mine = g.racks[meta.me] || [];
      rackArea = `
        <div class="preview"><span class="muted">Waiting for <b>${esc(cur.name)}</b> to play…</span></div>
        <div class="rack">${mine.map((l) => `<span class="tile lg ${l === '?' ? 'blank' : ''}">${l === '?' ? '' : l}<sub>${VAL[l] || ''}</sub></span>`).join('')}</div>
        <div class="row" style="justify-content:center"><button class="btn secondary small" data-g="sync">Check for their move</button></div>`;
    } else if (cpuTurn) {
      rackArea = `<div class="card center"><p><b>${esc(cur.name)}</b> is thinking…</p></div>`;
    } else if (cover) {
      const lastLog = g.log[g.log.length - 1];
      const lastTxt = lastLog ? `<p class="muted">${esc(gamePlayer({ players: g.players }, lastLog.playerId).name)} ${lastLog.type === 'play' ? `played ${esc(lastLog.words.map((w) => w.text).join(', '))} for ${lastLog.score}` : lastLog.type === 'exchange' ? `swapped ${lastLog.n} tile${lastLog.n > 1 ? 's' : ''}` : 'passed'}.</p>` : '';
      rackArea = `<div class="card center cover" style="border-top:6px solid ${esc(cur.color)}">
        ${lastTxt}
        <p style="font-size:1.1rem">Pass the phone to <b>${esc(cur.name)}</b></p>
        <button class="btn" data-g="reveal">I'm ${esc(cur.name)}, show my tiles</button></div>`;
    } else {
      const rack = g.racks[handOwner(g)];
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
      ${rackArea}
      ${meta ? `<p class="sync-line">Online game <b>${esc(g.code)}</b> · ${meta.dirty
        ? 'not synced yet <button class="btn ghost small" data-g="sync">Retry</button>'
        : 'synced'}</p>` : ''}`;
  }

  AFTER.online = (code) => {
    const c = normalizeCode(code);
    if (ui.share === c) { ui.share = null; showShare(c); }
    if (!onlineMeta(c)) return;
    if (ui.msg) { toast(ui.msg); ui.msg = ''; }
    startPolling(c);
    syncAndRefresh(c);
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
    $('#app').innerHTML = boardHtml();
    const w2 = $('#boardWrap');
    if (w2) { w2.scrollLeft = sx; w2.scrollTop = sy; }
    window.scrollTo(0, wy);
    if (activeCode) { if (ui.msg) { toast(ui.msg); ui.msg = ''; } } else AFTER.board();
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
    const rack = g.racks[handOwner(g)];
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
    if (g.code) {
      openModal(`<h2>Game options</h2>
        <div class="menu">
          <button class="btn secondary" id="mShare">Show game code</button>
          <button class="btn secondary" id="mEnd">End game now & save</button>
          <button class="btn danger" id="mLeave">Remove from this phone</button>
          <button class="btn ghost" data-action="close-modal">Back to game</button>
        </div>
        <p class="muted">Ending now ends it on both phones and subtracts everyone's remaining tiles. Removing only takes it off this phone. You can rejoin with the code.</p>`);
      $('#mShare').addEventListener('click', () => showShare(g.code));
      $('#mEnd').addEventListener('click', () => { closeModal(); endGame(g, null, 'manual'); });
      $('#mLeave').addEventListener('click', () => {
        confirmModal('Remove this online game from this phone? The other phone keeps it.', 'Remove', () => {
          delete db.online[g.code]; resetUi(); save(); go('');
        });
      });
      return;
    }
    const allPeople = g.players.every((p) => !isCpu(p.id));
    openModal(`<h2>Game options</h2>
      <div class="menu">
        ${allPeople ? '<button class="btn" id="mOnline">Continue on two phones</button>' : ''}
        <button class="btn secondary" id="mEnd">End game now & save</button>
        <button class="btn danger" id="mDiscard">Discard game</button>
        <button class="btn ghost" data-action="close-modal">Back to game</button>
      </div>
      <p class="muted">${allPeople ? 'Continue on two phones moves this game online so you can each play from your own phone. ' : ''}Ending now subtracts everyone's remaining tiles, as if no one went out.</p>`);
    if (allPeople) $('#mOnline').addEventListener('click', () => chooseSeatAndPublish(g));
    $('#mEnd').addEventListener('click', () => { closeModal(); endGame(g, null, 'manual'); });
    $('#mDiscard').addEventListener('click', () => {
      confirmModal('Discard this game? It will not be saved.', 'Discard', () => { db.phone = null; resetUi(); save(); go(''); });
    });
  }

  function chooseSeatAndPublish(g) {
    openModal(`<h2>Continue on two phones</h2><p class="muted">Which player is on <b>this</b> phone?</p>
      <div class="menu">${g.players.map((p) => `<button class="btn secondary" data-seat="${esc(p.id)}" style="--pc:${esc(p.color)}"><span class="dot"></span> ${esc(p.name)}</button>`).join('')}</div>
      <div class="row end" style="margin-top:12px"><button class="btn ghost" data-action="close-modal">Cancel</button></div>`);
    $$('[data-seat]').forEach((b) => b.addEventListener('click', async () => {
      $$('[data-seat]').forEach((x) => { x.disabled = true; });
      try {
        const code = await publishOnline(g, b.dataset.seat);
        if (db.phone === g) db.phone = null;
        resetUi();
        ui.share = code;
        save();
        closeModal();
        go('online/' + code);
      } catch (e) {
        closeModal();
        toast("Couldn't reach the game service. Check your connection and try again.");
      }
    }));
  }

  /* ---------- Join a game ---------- */

  let joinFound = null;
  VIEWS.join = (code) => `
    <div class="card">
      <h2>Join a game</h2>
      <p class="muted">Enter the code shown on the other phone.</p>
      <div class="row">
        <input type="text" id="joinCode" class="word-input" placeholder="ABCD-1234" value="${esc(normalizeCode(code || ''))}" autocomplete="off" autocapitalize="characters" spellcheck="false" style="flex:1">
        <button class="btn" data-g="find">Find</button>
      </div>
      <div id="joinResult" style="margin-top:12px"></div>
    </div>`;
  AFTER.join = (code) => {
    $('#joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findGame($('#joinCode').value); } });
    if (code) findGame(code);
  };

  async function findGame(raw) {
    const code = normalizeCode(raw);
    const out = $('#joinResult');
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) { out.innerHTML = '<p class="verdict no">Codes look like ABCD-1234.</p>'; return; }
    if (onlineMeta(code)) { go('online/' + code); return; }
    out.innerHTML = '<p class="muted">Looking for the game…</p>';
    let r;
    try { r = await api('GET', code); } catch (e) { out.innerHTML = '<p class="verdict no">Couldn\'t reach the game service. Check your connection.</p>'; return; }
    if (r.status === 404) { out.innerHTML = '<p class="verdict no">No game with that code.</p>'; return; }
    if (r.status !== 200) { out.innerHTML = '<p class="verdict no">Something went wrong. Try again.</p>'; return; }
    const g = r.data.game;
    if (g.over) { out.innerHTML = '<p class="muted">That game has already finished.</p>'; return; }
    joinFound = { code, game: g, etag: r.data.etag };
    out.innerHTML = `<h3>Which player are you?</h3>
      ${g.players.map((p) => `<div class="pick" style="--pc:${esc(p.color)}" data-g="claim" data-id="${esc(p.id)}" role="button" tabindex="0"><span class="dot"></span> ${esc(p.name)}</div>`).join('')}`;
  }

  function claimSeat(id) {
    if (!joinFound) return;
    const { code, game, etag } = joinFound;
    // Match the game's players to this phone's players by id or name, adding any that are missing.
    const map = {};
    game.players.forEach((p) => {
      if (playerById(p.id)) { map[p.id] = p.id; return; }
      const same = db.players.find((x) => x.name.trim().toLowerCase() === p.name.trim().toLowerCase());
      if (same) map[p.id] = same.id;
      else { db.players.push({ id: p.id, name: p.name, color: p.color }); map[p.id] = p.id; }
    });
    game.code = code;
    db.online = db.online || {};
    db.online[code] = { code, me: id, etag, game, map, dirty: false, joinedAt: Date.now() };
    joinFound = null;
    resetUi();
    save();
    go('online/' + code);
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
    if (a === 'mode') { pickMode = el.dataset.mode; render(); return; }
    if (a === 'me') { meSel = el.dataset.id; render(); return; }
    if (a === 'open-online') { go('online/' + el.dataset.code); return; }
    if (a === 'find') { findGame($('#joinCode').value); return; }
    if (a === 'claim') { claimSeat(el.dataset.id); return; }
    if (a === 'start') {
      const players = pickSel.map((id) => (isCpu(id)
        ? { id, ...CPU_LEVELS[id.slice(4)] }
        : { id, name: playerById(id).name, color: playerById(id).color }));
      if (pickMode === 'online') {
        el.disabled = true;
        el.textContent = 'Creating…';
        publishOnline(newGame(players), meSel || players[0].id).then((code) => {
          pickSel = []; meSel = null; pickMode = 'phone';
          resetUi();
          ui.share = code;
          go('online/' + code);
        }).catch(() => {
          el.disabled = false;
          el.textContent = 'Create online game';
          toast("Couldn't reach the game service. Check your connection and try again.");
        });
        return;
      }
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
    if (a === 'sync') { if (g.code) syncAndRefresh(g.code, true); return; }
    const turnActions = ['sel', 'place', 'unplace', 'recall', 'shuffle', 'exchange', 'pass', 'play'];
    if (turnActions.includes(a) && !isMyTurn(g)) { toast(`It's ${cur.name}'s turn.`); return; }

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
        const letter = g.racks[handOwner(g)][ri];
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
      case 'shuffle': shuffle(g.racks[handOwner(g)]); ui.sel = null; save(); refresh(); break;
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
          if (humanCount(g) <= 1 || g.code) ui.msg = `${cur.name} scored ${res.score}.`;
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

  return { analyze, generateMoves, chooseCpuMove, newGame, PREM, VAL, SIZE, GAME_NAME, gameOf, homeCards, pullOnline };
})();

render();
