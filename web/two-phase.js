/**
 * two-phase.js — Kociemba's two-phase solver
 *
 * LBL (see cube-solver.js) is a method humans can memorise, not a short one; it
 * needs ~130 moves. This searches instead, and lands around 20.
 *
 *   Phase 1: any state  ->  the subgroup G1 = <U, D, R2, L2, F2, B2>
 *            (corners oriented, edges oriented, the four middle-layer edges home)
 *   Phase 2: move only within G1, all the way to solved
 *
 * Each phase runs IDA* over coordinates — integers that each collapse one aspect
 * of the cube. The coordinate transition tables and the lower-bound (pruning)
 * tables are built once, on first use.
 *
 * Transition tables are filled by breadth-first search outward from the solved
 * state, so no coordinate-to-state decoder is needed and there is one less
 * convention to get wrong. The turns themselves are imported from
 * cube-solver.js, so the cube on screen and the cube being searched can never
 * disagree about what "R" means.
 *
 * Depends on (loaded before this file):
 *   window.CubeSolver   (cube-solver.js)
 */

(function () {
  'use strict';

  const FACES  = ['U', 'R', 'F', 'D', 'L', 'B'];
  const SUFFIX = ['', '2', "'"];

  // Move index = face * 3 + power, where power 0/1/2 means '' / '2' / "'".
  const MOVE_NAMES = [];
  for (const f of FACES) for (const s of SUFFIX) MOVE_NAMES.push(f + s);

  // Phase 2 may turn U and D freely, everything else only 180 degrees.
  const PHASE2 = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16];

  // How long solve() may keep looking for a shorter answer, and the length at
  // which it stops looking. Typical results sit at 20-21 moves, so a target of
  // 21 usually ends the search well inside the budget.
  const DEFAULT_BUDGET_MS = 200;
  const DEFAULT_TARGET = 21;
  const TIME_CHECK_NODES = 4096;   // how many search nodes between clock reads

  // Slot -> its stickers. The order within each entry defines orientation
  // (twist for corners, flip for edges).
  // Corners are URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB — clockwise seen from
  // outside the corner, U/D sticker first.
  const CORNER_FACELETS = [
    [['U', 8], ['R', 0], ['F', 2]],
    [['U', 6], ['F', 0], ['L', 2]],
    [['U', 0], ['L', 0], ['B', 2]],
    [['U', 2], ['B', 0], ['R', 2]],
    [['D', 2], ['F', 8], ['R', 6]],
    [['D', 0], ['L', 8], ['F', 6]],
    [['D', 6], ['B', 8], ['L', 6]],
    [['D', 8], ['R', 8], ['B', 6]],
  ];
  // Edges are UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR. Indices 8-11 are
  // the middle-layer four. U/D sticker first, or the F/B sticker for the middle
  // layer.
  const EDGE_FACELETS = [
    [['U', 5], ['R', 1]], [['U', 7], ['F', 1]], [['U', 3], ['L', 1]], [['U', 1], ['B', 1]],
    [['D', 5], ['R', 7]], [['D', 1], ['F', 7]], [['D', 3], ['L', 7]], [['D', 7], ['B', 7]],
    [['F', 5], ['R', 3]], [['F', 3], ['L', 5]], [['B', 5], ['L', 3]], [['B', 3], ['R', 5]],
  ];

  const CORNER_FACES = CORNER_FACELETS.map(t => t.map(([f]) => f));
  const EDGE_FACES   = EDGE_FACELETS.map(t => t.map(([f]) => f));

  const N_TWIST = 2187;         // 3^7   corner orientation
  const N_FLIP  = 2048;         // 2^11  edge orientation
  const N_SLICE = 495;          // C(12,4)  where the middle-layer edges sit, order ignored
  const N_PERM8 = 40320;        // 8!
  const N_SLICE_PERM = 24;      // 4!

  // ── Piece-level state ───────────────────────────────────────────────────────
  // cp[i]: which corner sits in slot i / co[i]: its twist (0,1,2)
  // ep[i]: which edge sits in slot i   / eo[i]: its flip (0,1)

  function faceletsToCubie(state) {
    const colorToFace = {};
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) colorToFace[state[f][4]] = f;

    const cp = new Uint8Array(8), co = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      const seen = CORNER_FACELETS[i].map(([f, idx]) => colorToFace[state[f][idx]]);
      const found = locate(CORNER_FACES, seen, 3);
      if (!found) throw new Error('Invalid cube state: unknown corner at slot ' + i);
      cp[i] = found.piece;
      co[i] = found.shift;
    }

    const ep = new Uint8Array(12), eo = new Uint8Array(12);
    for (let i = 0; i < 12; i++) {
      const seen = EDGE_FACELETS[i].map(([f, idx]) => colorToFace[state[f][idx]]);
      const found = locate(EDGE_FACES, seen, 2);
      if (!found) throw new Error('Invalid cube state: unknown edge at slot ' + i);
      ep[i] = found.piece;
      eo[i] = found.shift;
    }
    return { cp, co, ep, eo };
  }

  // Which piece are these faces, and by how much is it turned in its slot?
  function locate(table, seen, n) {
    for (let piece = 0; piece < table.length; piece++) {
      for (let shift = 0; shift < n; shift++) {
        let hit = true;
        for (let k = 0; k < n && hit; k++) hit = table[piece][(k + shift) % n] === seen[k];
        if (hit) return { piece, shift };
      }
    }
    return null;
  }

  // Apply one turn. `mv` is that same turn expressed as "the solved cube after it".
  function applyCubie(s, mv) {
    const cp = new Uint8Array(8), co = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      cp[i] = s.cp[mv.cp[i]];
      co[i] = (s.co[mv.cp[i]] + mv.co[i]) % 3;
    }
    const ep = new Uint8Array(12), eo = new Uint8Array(12);
    for (let i = 0; i < 12; i++) {
      ep[i] = s.ep[mv.ep[i]];
      eo[i] = (s.eo[mv.ep[i]] + mv.eo[i]) % 2;
    }
    return { cp, co, ep, eo };
  }

  // ── Coordinates ─────────────────────────────────────────────────────────────

  function twistOf(co) { let t = 0; for (let i = 0; i < 7; i++)  t = t * 3 + co[i]; return t; }
  function flipOf(eo)  { let f = 0; for (let i = 0; i < 11; i++) f = f * 2 + eo[i]; return f; }

  function sliceOf(ep) {
    let a = 0, x = 0;
    for (let j = 11; j >= 0; j--) if (ep[j] >= 8) { a += binom(11 - j, x + 1); x++; }
    return a;
  }

  const BINOM = [];
  function binom(n, k) {
    if (k < 0 || k > n) return 0;
    if (!BINOM[n]) {
      BINOM[n] = [1];
      for (let i = 1; i <= n; i++) BINOM[n][i] = binom(n - 1, i - 1) + binom(n - 1, i);
    }
    return BINOM[n][k];
  }

  function permOf(a, n, off) {
    let idx = 0;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = i + 1; j < n; j++) if (a[off + j] < a[off + i]) c++;
      idx = idx * (n - i) + c;
    }
    return idx;
  }

  const cornPermOf  = s => permOf(s.cp, 8, 0);
  const edge8PermOf = s => permOf(s.ep, 8, 0);
  const slicePermOf = s => permOf([s.ep[8] - 8, s.ep[9] - 8, s.ep[10] - 8, s.ep[11] - 8], 4, 0);

  // ── Tables ──────────────────────────────────────────────────────────────────

  const T = {};        // transition and pruning tables
  const MOVES = [];    // the 18 turns, piece-level
  let ready = false;

  function solvedCubie() {
    return {
      cp: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), co: new Uint8Array(8),
      ep: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), eo: new Uint8Array(12),
    };
  }

  // Breadth-first outward from solved. States sharing a coordinate share its
  // transitions, so one representative per coordinate is enough.
  function buildMoveTable(size, moveIdx, coordOf) {
    const table = new Uint16Array(size * moveIdx.length);
    const repr = new Array(size);
    const start = solvedCubie();
    repr[coordOf(start)] = start;

    let frontier = [coordOf(start)], filled = 1;
    while (frontier.length) {
      const nextFrontier = [];
      for (const c of frontier) {
        for (let i = 0; i < moveIdx.length; i++) {
          const moved = applyCubie(repr[c], MOVES[moveIdx[i]]);
          const nc = coordOf(moved);
          table[c * moveIdx.length + i] = nc;
          if (repr[nc] === undefined) { repr[nc] = moved; nextFrontier.push(nc); filled++; }
        }
      }
      frontier = nextFrontier;
    }
    if (filled !== size) throw new Error(`move table incomplete: ${filled}/${size}`);
    return table;
  }

  // Exact distance to solved for a pair of coordinates — a lower bound for the
  // real cube, which is what IDA* needs. Built from the transition tables alone.
  function buildPruning(sizeA, moveA, sizeB, moveB, nMoves) {
    const table = new Uint8Array(sizeA * sizeB).fill(0xff);
    const total = sizeA * sizeB;
    table[0] = 0;
    for (let depth = 0; ; depth++) {
      let grew = 0;
      for (let idx = 0; idx < total; idx++) {
        if (table[idx] !== depth) continue;
        const a = (idx / sizeB) | 0, b = idx % sizeB;
        for (let m = 0; m < nMoves; m++) {
          const n = moveA[a * nMoves + m] * sizeB + moveB[b * nMoves + m];
          if (table[n] === 0xff) { table[n] = depth + 1; grew++; }
        }
      }
      // Pairs no real cube can present may stay at 0xff; they are never looked up.
      if (grew === 0) return table;
    }
  }

  function init() {
    if (ready) return;
    if (typeof CubeSolver === 'undefined') throw new Error('cube-solver.js must be loaded first');

    // Take each turn as "the solved cube after it", so the search and the
    // displayed cube share one definition of every move.
    for (const name of MOVE_NAMES) {
      const c = new CubeSolver();
      c.applyMove(name);
      MOVES.push(faceletsToCubie(c.getState()));
    }

    const all18 = MOVES.map((_, i) => i);
    T.twist = buildMoveTable(N_TWIST, all18, s => twistOf(s.co));
    T.flip  = buildMoveTable(N_FLIP,  all18, s => flipOf(s.eo));
    T.slice = buildMoveTable(N_SLICE, all18, s => sliceOf(s.ep));

    T.cornPerm  = buildMoveTable(N_PERM8, PHASE2, cornPermOf);
    T.edge8Perm = buildMoveTable(N_PERM8, PHASE2, edge8PermOf);
    T.slicePerm = buildMoveTable(N_SLICE_PERM, PHASE2, slicePermOf);

    T.pruneTwistSlice = buildPruning(N_TWIST, T.twist, N_SLICE, T.slice, 18);
    T.pruneFlipSlice  = buildPruning(N_FLIP,  T.flip,  N_SLICE, T.slice, 18);
    T.pruneCornSlice  = buildPruning(N_PERM8, T.cornPerm,  N_SLICE_PERM, T.slicePerm, PHASE2.length);
    T.pruneEdgeSlice  = buildPruning(N_PERM8, T.edge8Perm, N_SLICE_PERM, T.slicePerm, PHASE2.length);

    ready = true;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  // Never turn the same face twice in a row. Opposite faces commute, so allow
  // only one of the two orders and stop counting the same sequence twice — every
  // sequence still has an allowed form, so nothing is lost.
  function blocked(face, lastFace) {
    if (lastFace < 0) return false;
    return face === lastFace || ((face + 3) % 6 === lastFace && face < 3);
  }

  /**
   * Finish a cube already in G1. Returns move indices, or null within `limit`.
   * Gives up past `deadline`; pass Infinity when there is no answer to fall back
   * on, since abandoning this search would leave nothing at all.
   */
  function searchPhase2(cubie, limit, lastFace, deadline) {
    const cp0 = cornPermOf(cubie), e80 = edge8PermOf(cubie), sp0 = slicePermOf(cubie);
    const path = new Int8Array(19);
    let countdown = TIME_CHECK_NODES;
    let timedOut = false;

    const dfs = (cp, e8, sp, depth, remaining, lastF) => {
      if (remaining === 0) return cp === 0 && e8 === 0 && sp === 0 ? depth : -1;
      if (--countdown <= 0) {           // reading the clock per node costs more than it saves
        countdown = TIME_CHECK_NODES;
        if (Date.now() > deadline) { timedOut = true; return -1; }
      }
      const h = Math.max(T.pruneCornSlice[cp * N_SLICE_PERM + sp],
                         T.pruneEdgeSlice[e8 * N_SLICE_PERM + sp]);
      if (h > remaining) return -1;
      for (let i = 0; i < PHASE2.length; i++) {
        const m = PHASE2[i];
        const face = (m / 3) | 0;
        if (blocked(face, lastF)) continue;
        path[depth] = m;
        const r = dfs(T.cornPerm[cp * PHASE2.length + i],
                      T.edge8Perm[e8 * PHASE2.length + i],
                      T.slicePerm[sp * PHASE2.length + i],
                      depth + 1, remaining - 1, face);
        if (r >= 0) return r;
      }
      return -1;
    };

    for (let d = 0; d <= limit && !timedOut; d++) {
      const r = dfs(cp0, e80, sp0, 0, d, lastFace);
      if (r >= 0) return Array.from(path.slice(0, r));
    }
    return null;
  }

  /** Solve a piece-level state. Returns move indices, or null if none was found. */
  function solveCubie(start, opts) {
    const budgetMs = (opts && opts.budgetMs) || DEFAULT_BUDGET_MS;
    const target   = (opts && opts.target)   || DEFAULT_TARGET;
    const deadline = Date.now() + budgetMs;

    let best = null;
    const path1 = new Int8Array(13);

    // A phase-1 solution of length `len`: finish it off and keep it if it beats
    // what we have. Returns true when the result is good enough to stop.
    const finish = (len) => {
      let s = start;
      for (let i = 0; i < len; i++) s = applyCubie(s, MOVES[path1[i]]);
      const limit = best ? best.length - len - 1 : 18;
      if (limit < 0) return false;
      const tail = searchPhase2(s, limit, len ? (path1[len - 1] / 3) | 0 : -1,
                                best ? deadline : Infinity);
      if (!tail) return false;
      best = Array.from(path1.slice(0, len)).concat(tail);
      return best.length <= target;
    };

    const dfs1 = (t, f, sl, depth, remaining, lastF) => {
      if (remaining === 0) return t === 0 && f === 0 && sl === 0 ? finish(depth) : false;
      const h = Math.max(T.pruneTwistSlice[t * N_SLICE + sl], T.pruneFlipSlice[f * N_SLICE + sl]);
      if (h > remaining) return false;
      for (let m = 0; m < 18; m++) {
        const face = (m / 3) | 0;
        if (blocked(face, lastF)) continue;
        path1[depth] = m;
        if (dfs1(T.twist[t * 18 + m], T.flip[f * 18 + m], T.slice[sl * 18 + m],
                 depth + 1, remaining - 1, face)) return true;
        // Out of time: keep whatever we already have rather than nothing.
        if (Date.now() > deadline) return best !== null;
      }
      return false;
    };

    // Walk phase-1 solutions shortest-first; each one gives another shot at a
    // shorter total. Phase 1 never needs more than 12 moves.
    const t0 = twistOf(start.co), f0 = flipOf(start.eo), s0 = sliceOf(start.ep);
    for (let d = 0; d <= 12; d++) {
      if (dfs1(t0, f0, s0, 0, d, -1)) break;
      if (best && Date.now() > deadline) break;
      if (best && best.length <= d + 1) break;   // nothing shorter is left to find
    }
    return best;
  }

  // Fold neighbouring turns of the same face together — the join between the two
  // phases can leave a pair like U2 U'.
  function toNames(moves) {
    const out = [];
    for (const m of moves) {
      const face = (m / 3) | 0, power = (m % 3) + 1;
      if (out.length && out[out.length - 1].face === face) {
        const merged = (out[out.length - 1].power + power) % 4;
        out.pop();
        if (merged) out.push({ face, power: merged });
      } else {
        out.push({ face, power });
      }
    }
    return out.map(({ face, power }) => FACES[face] + SUFFIX[power - 1]);
  }

  window.TwoPhaseSolver = {
    /** Build the tables. Takes about 0.35 s, so call it before the first solve. */
    init,
    get ready() { return ready; },

    /**
     * Solve a facelet state (the shape CubeSolver.getState() returns).
     * @param {object} state
     * @param {{budgetMs?: number, target?: number}} [opts]
     * @returns {string[]|null} the moves, or null if none was found in time
     */
    solve(state, opts) {
      init();
      const found = solveCubie(faceletsToCubie(state), opts);
      if (!found) return null;

      // Replay the answer on a real cube before handing it over. The search runs
      // on coordinates, so a mistake in the tables would let it claim success on
      // a cube that is not solved.
      const names = toNames(found);
      const check = new CubeSolver();
      check._state = check._clone(state);   // applyMove is destructive; don't hand it the caller's state
      for (const m of names) check.applyMove(m);
      return check.isSolved() ? names : null;
    },
  };
})();
