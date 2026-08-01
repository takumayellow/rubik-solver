// cube-solver.js — Rubik's Cube state model + LBL solver
'use strict';

class CubeSolver {
  constructor() {
    this._state = this._solvedState();
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  _solvedState() {
    return {
      U: Array(9).fill('W'),
      D: Array(9).fill('Y'),
      F: Array(9).fill('G'),
      B: Array(9).fill('B'),
      L: Array(9).fill('O'),
      R: Array(9).fill('R'),
    };
  }

  _clone(state) {
    return {
      U: state.U.slice(),
      D: state.D.slice(),
      F: state.F.slice(),
      B: state.B.slice(),
      L: state.L.slice(),
      R: state.R.slice(),
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  getState() {
    return this._clone(this._state);
  }

  reset() {
    this._state = this._solvedState();
  }

  isSolved() {
    const s = this._state;
    for (const face of ['U', 'D', 'F', 'B', 'L', 'R']) {
      const f = s[face];
      for (let i = 1; i < 9; i++) {
        if (f[i] !== f[0]) return false;
      }
    }
    return true;
  }

  applyMove(move) {
    const fn = CubeSolver._MOVES[move];
    if (!fn) throw new Error('Unknown move: ' + move);
    fn(this._state);
    return this;
  }

  applySequence(moves) {
    for (const m of moves) this.applyMove(m);
    return this;
  }

  scramble(numMoves = 20) {
    const base = ['R', 'L', 'U', 'D', 'F', 'B'];
    const suffixes = ['', "'", '2'];
    const applied = [];
    let lastBase = null;
    for (let i = 0; i < numMoves; i++) {
      let b;
      do {
        b = base[Math.floor(Math.random() * base.length)];
      } while (b === lastBase);
      lastBase = b;
      const s = suffixes[Math.floor(Math.random() * suffixes.length)];
      const m = b + s;
      applied.push(m);
      this.applyMove(m);
    }
    return applied;
  }

  solve() {
    // Work on a copy
    const solver = new _LBLSolver(this._clone(this._state));
    return solver.solve();
  }

  // ─── Move table ──────────────────────────────────────────────────────────────
  // Face indices (reading order, row-major):
  //  0 1 2
  //  3 4 5
  //  6 7 8
  //
  // Face orientations when looking at each face from outside:
  //   U face: looking down from above
  //   D face: looking up from below
  //   F face: looking toward you (front)
  //   B face: looking toward you from behind
  //   L face: looking toward you from the left
  //   R face: looking toward you from the right

  static _rotateFaceCW(f) {
    // Rotate a face 90° clockwise (looking at it from outside)
    return [
      f[6], f[3], f[0],
      f[7], f[4], f[1],
      f[8], f[5], f[2],
    ];
  }

  static _rotateFaceCCW(f) {
    return [
      f[2], f[5], f[8],
      f[1], f[4], f[7],
      f[0], f[3], f[6],
    ];
  }

  static _rotateFace180(f) {
    return [f[8], f[7], f[6], f[5], f[4], f[3], f[2], f[1], f[0]];
  }
}

// ─── Move implementations ────────────────────────────────────────────────────
// Each move mutates the state in-place.

CubeSolver._MOVES = {};

(function buildMoves() {
  const M = CubeSolver._MOVES;
  const CW = CubeSolver._rotateFaceCW;
  const CCW = CubeSolver._rotateFaceCCW;
  const F180 = CubeSolver._rotateFace180;

  // Helper: apply a cyclic 4-group permutation on sticker indices across faces.
  // cycle = [[face, idx], [face, idx], [face, idx], [face, idx]]
  // direction: 1 = forward (a→b→c→d→a reversed for CW), -1 = backward
  function cycle4(s, quads) {
    // quads is array of 4 [face, idx] pairs — values shift: [0]→[1]→[2]→[3]→[0]
    const tmp = s[quads[3][0]][quads[3][1]];
    s[quads[3][0]][quads[3][1]] = s[quads[2][0]][quads[2][1]];
    s[quads[2][0]][quads[2][1]] = s[quads[1][0]][quads[1][1]];
    s[quads[1][0]][quads[1][1]] = s[quads[0][0]][quads[0][1]];
    s[quads[0][0]][quads[0][1]] = tmp;
  }

  function cycleRow(s, quads) {
    // quads = [[f,i0,i1,i2], ...] — 3 stickers per group, shift group forward
    const t0 = s[quads[3][0]][quads[3][1]];
    const t1 = s[quads[3][0]][quads[3][2]];
    const t2 = s[quads[3][0]][quads[3][3]];
    s[quads[3][0]][quads[3][1]] = s[quads[2][0]][quads[2][1]];
    s[quads[3][0]][quads[3][2]] = s[quads[2][0]][quads[2][2]];
    s[quads[3][0]][quads[3][3]] = s[quads[2][0]][quads[2][3]];
    s[quads[2][0]][quads[2][1]] = s[quads[1][0]][quads[1][1]];
    s[quads[2][0]][quads[2][2]] = s[quads[1][0]][quads[1][2]];
    s[quads[2][0]][quads[2][3]] = s[quads[1][0]][quads[1][3]];
    s[quads[1][0]][quads[1][1]] = s[quads[0][0]][quads[0][1]];
    s[quads[1][0]][quads[1][2]] = s[quads[0][0]][quads[0][2]];
    s[quads[1][0]][quads[1][3]] = s[quads[0][0]][quads[0][3]];
    s[quads[0][0]][quads[0][1]] = t0;
    s[quads[0][0]][quads[0][2]] = t1;
    s[quads[0][0]][quads[0][3]] = t2;
  }

  // ── U move (CW looking from top) ──────────────────────────────────────────
  // U face rotates CW. Top rows of F, L, B, R cycle.
  // Looking down at the U face, the front is at the bottom of the view, so a
  // clockwise quarter turn carries the front edge to the left:
  //   F[0,1,2] → L[0,1,2] → B[0,1,2] → R[0,1,2] → F[0,1,2]
  // (No reversal for U — the top rows all read left-to-right in their own face reference.)
  // This must match the direction of the U-face rotation itself (CW sends U[7]→U[3],
  // i.e. the F-side sticker to the L side); mixing the two directions produces a
  // permutation that is not a real face turn and silently corrupts the cube.

  M['U'] = function(s) {
    s.U = CW(s.U);
    // F[0,1,2] → L[0,1,2] → B[0,1,2] → R[0,1,2] → F[0,1,2]
    cycleRow(s, [['F',0,1,2], ['L',0,1,2], ['B',0,1,2], ['R',0,1,2]]);
  };

  M["U'"] = function(s) {
    s.U = CCW(s.U);
    cycleRow(s, [['R',0,1,2], ['B',0,1,2], ['L',0,1,2], ['F',0,1,2]]);
  };

  M['U2'] = function(s) { M['U'](s); M['U'](s); };

  // ── D move (CW looking from bottom) ───────────────────────────────────────
  // D face rotates CW (from below). Bottom rows of F, L, B, R cycle.
  // Seen from below the front edge travels to the right (mirror of U):
  //   F[6,7,8] → R[6,7,8] → B[6,7,8] → L[6,7,8] → F[6,7,8]
  // Matches the D-face rotation (CW sends D[1]→D[5], the F-side sticker to the R side).

  M['D'] = function(s) {
    s.D = CW(s.D);
    // D CW (from below): F bottom goes to R bottom, R→B, B→L, L→F
    cycleRow(s, [['F',6,7,8], ['R',6,7,8], ['B',6,7,8], ['L',6,7,8]]);
  };

  M["D'"] = function(s) {
    s.D = CCW(s.D);
    cycleRow(s, [['L',6,7,8], ['B',6,7,8], ['R',6,7,8], ['F',6,7,8]]);
  };

  M['D2'] = function(s) { M['D'](s); M['D'](s); };

  // ── F move (CW looking at front) ──────────────────────────────────────────
  // F face CW. Adjacent: U bottom row, R left col, D top row, L right col
  // CW: U[6,7,8] → R[0,3,6] → D[2,1,0] → L[8,5,2]
  //     (with reversals due to orientation changes)
  //
  // Let's verify: F CW = front face turns clockwise.
  //   U bottom row [6,7,8]: left-to-right → goes to R left col [0,3,6]: top-to-bottom ✓
  //   R left col [0,3,6]: top-to-bottom → goes to D top row [2,1,0]: right-to-left ✓
  //   D top row [2,1,0]: right-to-left → goes to L right col [8,5,2]: bottom-to-top ✓
  //   L right col [8,5,2]: bottom-to-top → goes to U bottom row [6,7,8]: left-to-right ✓

  M['F'] = function(s) {
    s.F = CW(s.F);
    const [u6, u7, u8] = [s.U[6], s.U[7], s.U[8]];
    const [r0, r3, r6] = [s.R[0], s.R[3], s.R[6]];
    const [d2, d1, d0] = [s.D[2], s.D[1], s.D[0]];
    const [l8, l5, l2] = [s.L[8], s.L[5], s.L[2]];
    // U bottom → R left col
    s.R[0] = u6; s.R[3] = u7; s.R[6] = u8;
    // R left col → D top row (reversed)
    s.D[2] = r0; s.D[1] = r3; s.D[0] = r6;
    // D top row (reversed) → L right col
    s.L[8] = d2; s.L[5] = d1; s.L[2] = d0;
    // L right col → U bottom row
    s.U[6] = l8; s.U[7] = l5; s.U[8] = l2;
  };

  M["F'"] = function(s) {
    s.F = CCW(s.F);
    const [u6, u7, u8] = [s.U[6], s.U[7], s.U[8]];
    const [r0, r3, r6] = [s.R[0], s.R[3], s.R[6]];
    const [d0, d1, d2] = [s.D[0], s.D[1], s.D[2]];
    const [l2, l5, l8] = [s.L[2], s.L[5], s.L[8]];
    // Reverse of F: U←R, R←D, D←L, L←U
    s.U[6] = r0; s.U[7] = r3; s.U[8] = r6;
    s.R[0] = d2; s.R[3] = d1; s.R[6] = d0;
    s.D[2] = l8; s.D[1] = l5; s.D[0] = l2;
    s.L[2] = u8; s.L[5] = u7; s.L[8] = u6;
  };

  M['F2'] = function(s) { M['F'](s); M['F'](s); };

  // ── B move (CW looking at back face from outside) ─────────────────────────
  // B face CW (from outside back). Adjacent: U top row, L left col, D bottom row, R right col
  // B CW: U[2,1,0] → L[0,3,6] → D[6,7,8] → R[8,5,2]
  //   U top row right-to-left → L left col top-to-bottom
  //   L left col top-to-bottom → D bottom row left-to-right
  //   D bottom row left-to-right → R right col bottom-to-top
  //   R right col bottom-to-top → U top row right-to-left

  M['B'] = function(s) {
    s.B = CW(s.B);
    const [u2, u1, u0] = [s.U[2], s.U[1], s.U[0]];
    const [l0, l3, l6] = [s.L[0], s.L[3], s.L[6]];
    const [d6, d7, d8] = [s.D[6], s.D[7], s.D[8]];
    const [r8, r5, r2] = [s.R[8], s.R[5], s.R[2]];
    // U top (right-to-left) → L left col (top-to-bottom)
    s.L[0] = u2; s.L[3] = u1; s.L[6] = u0;
    // L left col → D bottom row
    s.D[6] = l0; s.D[7] = l3; s.D[8] = l6;
    // D bottom row → R right col (bottom-to-top)
    s.R[8] = d6; s.R[5] = d7; s.R[2] = d8;
    // R right col (bottom-to-top) → U top (right-to-left)
    s.U[2] = r8; s.U[1] = r5; s.U[0] = r2;
  };

  M["B'"] = function(s) {
    s.B = CCW(s.B);
    const [u0, u1, u2] = [s.U[0], s.U[1], s.U[2]];
    const [l0, l3, l6] = [s.L[0], s.L[3], s.L[6]];
    const [d6, d7, d8] = [s.D[6], s.D[7], s.D[8]];
    const [r2, r5, r8] = [s.R[2], s.R[5], s.R[8]];
    // Reverse: U←R, R←D, D←L, L←U
    s.U[0] = l6; s.U[1] = l3; s.U[2] = l0;
    s.L[0] = d6; s.L[3] = d7; s.L[6] = d8;
    s.D[6] = r8; s.D[7] = r5; s.D[8] = r2;
    s.R[2] = u0; s.R[5] = u1; s.R[8] = u2;
  };

  M['B2'] = function(s) { M['B'](s); M['B'](s); };

  // ── R move (CW looking at right face from outside) ────────────────────────
  // R face CW. Adjacent: U right col, B left col, D right col, F right col
  // R CW: U right col [2,5,8] → B left col [6,3,0] → D right col [2,5,8] → F right col [2,5,8]
  //   (B is "upside down" relative to U/D/F, so its left col reverses)
  //
  // Let's verify:
  //   U[2,5,8] top-to-bottom → F[2,5,8] top-to-bottom ✓ (F right col = what was U right col)
  //   Wait — standard R CW:
  //     F right col → U right col → B left col (reversed) → D right col → F right col
  //   Specifically:
  //     F[2,5,8] → U[2,5,8] → B[6,3,0] (B's "left" when viewed from behind = index 2,5,8 but reversed orientation)
  //                                       Actually B[0,3,6] is left col when facing B from outside.
  //                                       But since B is "behind", when F right goes up through U and around to B,
  //                                       it enters B's right col from B's perspective.
  //   Standard verified R CW permutation:
  //     U[2]←F[2], U[5]←F[5], U[8]←F[8]  (F right → U right)
  //     B[0]←U[8], B[3]←U[5], B[6]←U[2]  (U right → B left reversed)
  //     D[2]←B[6], D[5]←B[3], D[8]←B[0]  (B left reversed → D right)
  //     F[2]←D[2], F[5]←D[5], F[8]←D[8]  (D right → F right)

  M['R'] = function(s) {
    s.R = CW(s.R);
    const [f2, f5, f8] = [s.F[2], s.F[5], s.F[8]];
    const [u2, u5, u8] = [s.U[2], s.U[5], s.U[8]];
    const [b0, b3, b6] = [s.B[0], s.B[3], s.B[6]];
    const [d2, d5, d8] = [s.D[2], s.D[5], s.D[8]];
    // F right → U right
    s.U[2] = f2; s.U[5] = f5; s.U[8] = f8;
    // U right → B left (reversed: U[2]→B[6], U[5]→B[3], U[8]→B[0])
    s.B[0] = u8; s.B[3] = u5; s.B[6] = u2;
    // B left reversed → D right (B[0]→D[8], B[3]→D[5], B[6]→D[2])
    s.D[2] = b6; s.D[5] = b3; s.D[8] = b0;
    // D right → F right
    s.F[2] = d2; s.F[5] = d5; s.F[8] = d8;
  };

  M["R'"] = function(s) {
    s.R = CCW(s.R);
    const [f2, f5, f8] = [s.F[2], s.F[5], s.F[8]];
    const [u2, u5, u8] = [s.U[2], s.U[5], s.U[8]];
    const [b0, b3, b6] = [s.B[0], s.B[3], s.B[6]];
    const [d2, d5, d8] = [s.D[2], s.D[5], s.D[8]];
    // Reverse: F←U, U←B(rev), B←D, D←F
    s.F[2] = u2; s.F[5] = u5; s.F[8] = u8;
    s.U[2] = b6; s.U[5] = b3; s.U[8] = b0;
    s.B[0] = d8; s.B[3] = d5; s.B[6] = d2;
    s.D[2] = f2; s.D[5] = f5; s.D[8] = f8;
  };

  M['R2'] = function(s) { M['R'](s); M['R'](s); };

  // ── L move (CW looking at left face from outside) ─────────────────────────
  // L face CW. Adjacent: U left col, F left col, D left col, B right col
  // L CW: U[0,3,6] → B[8,5,2] → D[0,3,6] → F[0,3,6]
  //   F left → D left: F[0,3,6]→D[0,3,6]
  //   U left → F left: U[0,3,6]→F[0,3,6]
  //   B right (reversed) → U left: B[8,5,2]→U[0,3,6]
  //   D left → B right (reversed): D[0,3,6]→B[8,5,2]
  //
  // Standard L CW:
  //   F[0,3,6] → U[0,3,6]  (F left → U left)
  //   U[0,3,6] → B[8,5,2]  (U left → B right reversed)
  //   B[8,5,2] → D[0,3,6]  (B right reversed → D left? wait...)
  //   Actually standard: B right col when viewed from outside back is [2,5,8].
  //   But for L, U left going around to back enters B's right side.
  //   Verified L CW:
  //     U[0]←B[8], U[3]←B[5], U[6]←B[2]  (B right reversed → U left)
  //     F[0]←U[0], F[3]←U[3], F[6]←U[6]  (U left → F left)
  //     D[0]←F[0], D[3]←F[3], D[6]←F[6]  (F left → D left)
  //     B[2]←D[6], B[5]←D[3], B[8]←D[0]  (D left → B right reversed)

  M['L'] = function(s) {
    s.L = CW(s.L);
    const [u0, u3, u6] = [s.U[0], s.U[3], s.U[6]];
    const [f0, f3, f6] = [s.F[0], s.F[3], s.F[6]];
    const [d0, d3, d6] = [s.D[0], s.D[3], s.D[6]];
    const [b2, b5, b8] = [s.B[2], s.B[5], s.B[8]];
    // B right reversed → U left
    s.U[0] = b8; s.U[3] = b5; s.U[6] = b2;
    // U left → F left
    s.F[0] = u0; s.F[3] = u3; s.F[6] = u6;
    // F left → D left
    s.D[0] = f0; s.D[3] = f3; s.D[6] = f6;
    // D left → B right reversed
    s.B[2] = d6; s.B[5] = d3; s.B[8] = d0;
  };

  M["L'"] = function(s) {
    s.L = CCW(s.L);
    const [u0, u3, u6] = [s.U[0], s.U[3], s.U[6]];
    const [f0, f3, f6] = [s.F[0], s.F[3], s.F[6]];
    const [d0, d3, d6] = [s.D[0], s.D[3], s.D[6]];
    const [b2, b5, b8] = [s.B[2], s.B[5], s.B[8]];
    // Reverse: U←F, F←D, D←B(rev), B(rev)←U
    s.U[0] = f0; s.U[3] = f3; s.U[6] = f6;
    s.F[0] = d0; s.F[3] = d3; s.F[6] = d6;
    s.D[0] = b8; s.D[3] = b5; s.D[6] = b2;
    s.B[2] = u6; s.B[5] = u3; s.B[8] = u0;
  };

  M['L2'] = function(s) { M['L'](s); M['L'](s); };

})();

// ─── LBL Solver ──────────────────────────────────────────────────────────────
// Beginner layer-by-layer method, solved from the D face upward:
//   1. D cross          2. D corners        3. middle layer
//   4. U cross (EO)     5. U face (CO)      6. corner permutation   7. edge permutation
//
// Colors are never hard-coded: every target color is read from the center of the
// face it belongs to, so the solver works whatever color happens to be on D.
//
// Each case is written once for the F/R pair and re-used on all four sides by
// rewriting the algorithm with rot() (a whole-cube y rotation).

const FACES    = ['F', 'R', 'B', 'L'];  // clockwise seen from above
const U_EDGE   = [7, 5, 1, 3];          // U index adjacent to FACES[k]
const D_EDGE   = [1, 5, 7, 3];          // D index adjacent to FACES[k]
const U_CORNER = [8, 2, 0, 6];          // U index of the corner FACES[k]/FACES[k+1]
const D_CORNER = [2, 8, 6, 0];          // D index of the corner FACES[k]/FACES[k+1]

const next = k => FACES[(k + 1) % 4];

function _cloneState(s) {
  return { U: s.U.slice(), D: s.D.slice(), F: s.F.slice(),
           B: s.B.slice(), L: s.L.slice(), R: s.R.slice() };
}

function _applyMoveToState(s, m) {
  CubeSolver._MOVES[m](s);
}

function _applySeqToState(s, seq) {
  for (const m of seq) _applyMoveToState(s, m);
}

function _stateKey(s) {
  return s.U.join('') + s.D.join('') + s.F.join('') +
         s.B.join('') + s.L.join('') + s.R.join('');
}

// Rewrite an algorithm so that FACES[k] takes the role of F (whole-cube y rotation).
function _rot(alg, k) {
  if (k === 0) return alg;
  const map = { F: FACES[k], R: FACES[(k + 1) % 4], B: FACES[(k + 2) % 4], L: FACES[(k + 3) % 4] };
  return alg.replace(/[FRBL]/g, c => map[c]);
}

// ── Algorithms ───────────────────────────────────────────────────────────────
// Written for the F/R pair, with the finished layer on D.

const ALG = {
  // cross: insert an edge sitting at UF with the D color facing F (flipped)
  crossFlip:   "U' R' F R",
  // extract the piece occupying the FR slot / the DFR corner into the U layer
  extract:     "R U R'",
  // insert the corner from UFR into DFR (repeat until it lands correctly)
  sexy:        "R U R' U'",
  // middle layer: send the UF edge into the FR slot (right) / the FL slot (left)
  insertRight: "U R U' R' U' F' U F",
  insertLeft:  "U' F' U F U R U' R'",
  // last layer
  eo:          "F R U R' U' F'",           // edge orientation (U cross)
  sune:        "R U R' U R U2 R'",         // corner orientation
  antisune:    "R U2 R' U' R U' R'",
  tPerm:       "R U R' U' R' F R2 U' R' U' R U R' F'",   // swaps 2 corners + 2 edges
  uPermA:      "R U' R U R U R U' R' U' R2",             // 3-cycle of U edges
  uPermB:      "R2 U R U R' U' R' U' R' U R'",
};

const _seq = alg => alg.trim().split(/\s+/);

class _LBLSolver {
  constructor(state) {
    this._state = _cloneState(state);
    this._moves = [];
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  _apply(alg) {
    if (!alg || !alg.trim()) return;
    for (const m of _seq(alg)) {
      _applyMoveToState(this._state, m);
      this._moves.push(m);
    }
  }

  _color(k)     { return this._state[FACES[k]][4]; }   // center color of side face k
  get _bottom()  { return this._state.D[4]; }
  get _top()     { return this._state.U[4]; }

  // ── piece lookup ───────────────────────────────────────────────────────────

  // Every edge slot: kind 'U' / 'D' / 'M' plus its index k.
  static _edgeSlots() {
    const out = [];
    for (let k = 0; k < 4; k++) {
      out.push({ kind: 'U', k, a: ['U', U_EDGE[k]], b: [FACES[k], 1] });
      out.push({ kind: 'D', k, a: ['D', D_EDGE[k]], b: [FACES[k], 7] });
      out.push({ kind: 'M', k, a: [FACES[k], 5],    b: [next(k), 3] });
    }
    return out;
  }

  static _cornerSlots() {
    const out = [];
    for (let k = 0; k < 4; k++) {
      out.push({ kind: 'U', k, a: ['U', U_CORNER[k]], b: [FACES[k], 2], c: [next(k), 0] });
      out.push({ kind: 'D', k, a: ['D', D_CORNER[k]], b: [FACES[k], 8], c: [next(k), 6] });
    }
    return out;
  }

  // Locate the edge carrying colors c1/c2. Every legal cube has each piece exactly
  // once, so not finding it means the state is not a real cube — say so loudly
  // instead of failing later with a TypeError on an undefined slot.
  _findEdge(c1, c2) {
    for (const slot of _LBLSolver._edgeSlots()) {
      const a = this._state[slot.a[0]][slot.a[1]];
      const b = this._state[slot.b[0]][slot.b[1]];
      if ((a === c1 && b === c2) || (a === c2 && b === c1)) return { ...slot, aColor: a, bColor: b };
    }
    throw new Error(`Invalid cube state: no ${c1}/${c2} edge`);
  }

  _findCorner(c1, c2, c3) {
    for (const slot of _LBLSolver._cornerSlots()) {
      const cs = [this._state[slot.a[0]][slot.a[1]],
                  this._state[slot.b[0]][slot.b[1]],
                  this._state[slot.c[0]][slot.c[1]]];
      if (cs.includes(c1) && cs.includes(c2) && cs.includes(c3)) return { ...slot, colors: cs };
    }
    throw new Error(`Invalid cube state: no ${c1}/${c2}/${c3} corner`);
  }

  // ── Step 1: cross on D ─────────────────────────────────────────────────────

  _crossEdgeSolved(k, s = this._state) {
    return s.D[D_EDGE[k]] === s.D[4] && s[FACES[k]][7] === s[FACES[k]][4];
  }

  _solveCross() {
    for (let k = 0; k < 4; k++) {
      // Each pass either inserts the edge or moves it strictly closer (out of the
      // middle layer / out of a wrong D slot / above its own slot), so a handful
      // of passes always suffices. The cap only stops a runaway loop; solve()
      // checks the real cube at the end, so an exhausted cap cannot pass silently.
      for (let guard = 0; guard < 8 && !this._crossEdgeSolved(k); guard++) {
        const loc = this._findEdge(this._bottom, this._color(k));

        if (loc.kind === 'M') {
          // middle layer: lift it out, leaving the D layer untouched
          this._apply(_rot(ALG.extract, loc.k));
        } else if (loc.kind === 'D') {
          // wrong slot (or flipped in its own slot): send it up to the U layer
          this._apply(FACES[loc.k] + '2');
        } else {
          // in the U layer: park it above its slot, then drop it in.
          // A U turn carries a U-layer slot from FACES[j] to FACES[j-1].
          const turns = (loc.k - k + 4) % 4;
          for (let i = 0; i < turns; i++) this._apply('U');
          if (this._state.U[U_EDGE[k]] === this._bottom) this._apply(FACES[k] + '2');
          else this._apply(_rot(ALG.crossFlip, k));
        }
      }
    }
  }

  // ── Step 2: corners of the D layer ─────────────────────────────────────────

  _cornerSolved(k, s = this._state) {
    return s.D[D_CORNER[k]] === s.D[4] &&
           s[FACES[k]][8] === s[FACES[k]][4] &&
           s[next(k)][6] === s[next(k)][4];
  }

  _solveDCorners() {
    for (let k = 0; k < 4; k++) {
      // The corner may need extracting from the D layer, repositioning over its
      // slot and inserting in the right orientation. Searching over the four
      // insert/extract algorithms finds the shortest combination for each case
      // instead of hammering one algorithm until it happens to land.
      const macros = ["U", "U'", "U2",
        _rot("R U R'", k), _rot("R U' R'", k),
        _rot("F' U' F", k), _rot("F' U F", k)];

      const placed = s => {
        for (let j = 0; j < 4; j++) if (!this._crossEdgeSolved(j, s)) return false;
        for (let j = 0; j <= k; j++) if (!this._cornerSolved(j, s)) return false;
        return true;
      };

      if (this._macroSearch(macros, placed, 5)) continue;

      // Fallback: extract, line up, then repeat the insert until it seats.
      // At most 3 U turns + 6 inserts per attempt; the cap is generous slack.
      for (let guard = 0; guard < 24 && !this._cornerSolved(k); guard++) {
        const loc = this._findCorner(this._bottom, this._color(k), this._color((k + 1) % 4));
        if (loc.kind === 'D')      this._apply(_rot(ALG.extract, loc.k));
        else if (loc.k !== k)      this._apply('U');
        else                       this._apply(_rot(ALG.sexy, k));
      }
    }
  }

  // ── Step 3: middle layer ───────────────────────────────────────────────────

  _middleSolved(k, s = this._state) {
    return s[FACES[k]][5] === s[FACES[k]][4] &&
           s[next(k)][3] === s[next(k)][4];
  }

  _solveMiddleLayer() {
    for (let k = 0; k < 4; k++) {
      // One pass either seats the edge or ejects the piece squatting in the slot,
      // so two passes are the normal worst case; the cap is generous slack.
      for (let guard = 0; guard < 12 && !this._middleSolved(k); guard++) {
        const loc = this._findEdge(this._color(k), this._color((k + 1) % 4));

        if (loc.kind === 'M') {
          // stuck in a slot (wrong one, or flipped): eject it into the U layer
          this._apply(_rot(ALG.insertRight, loc.k));
          continue;
        }
        // in the U layer: find the U turn + insertion that seats it correctly
        let done = false;
        for (let turns = 0; turns < 4 && !done; turns++) {
          for (const alg of [ALG.insertRight, ALG.insertLeft]) {
            const probe = _cloneState(this._state);
            for (let i = 0; i < turns; i++) _applyMoveToState(probe, 'U');
            _applySeqToState(probe, _seq(_rot(alg, k)));
            if (probe[FACES[k]][5] === this._color(k) &&
                probe[next(k)][3] === this._color((k + 1) % 4)) {
              for (let i = 0; i < turns; i++) this._apply('U');
              this._apply(_rot(alg, k));
              done = true;
              break;
            }
          }
        }
        if (!done) this._apply(_rot(ALG.insertRight, k));   // shouldn't happen; keep moving
      }
    }
  }

  // ── Last layer ─────────────────────────────────────────────────────────────
  // Each stage is a breadth-first search over whole algorithms ("macro moves").
  // Searching over algorithms instead of face turns keeps everything already
  // solved intact, and the predicate is checked against the real state, so a
  // stage can never report success on a cube it did not actually fix.

  _macroSearch(macros, predicate, maxDepth) {
    if (predicate(this._state)) return true;

    const seen = new Set([_stateKey(this._state)]);
    let frontier = [{ state: this._state, path: [] }];

    for (let depth = 0; depth < maxDepth; depth++) {
      const nextFrontier = [];
      for (const node of frontier) {
        for (const macro of macros) {
          const candidate = _cloneState(node.state);
          _applySeqToState(candidate, _seq(macro));
          const key = _stateKey(candidate);
          if (seen.has(key)) continue;
          seen.add(key);
          const path = node.path.concat(macro);
          if (predicate(candidate)) {
            for (const alg of path) this._apply(alg);
            return true;
          }
          nextFrontier.push({ state: candidate, path });
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
    return false;
  }

  // Step 4: orient the U edges (the cross on top).
  _solveUCross() {
    const top = this._top;
    return this._macroSearch(
      ["U", "U'", "U2", ALG.eo],
      s => U_EDGE.every(i => s.U[i] === top),
      5
    );
  }

  // Step 5: orient the U corners (whole U face).
  _solveUFace() {
    const top = this._top;
    return this._macroSearch(
      ["U", "U'", "U2", ALG.sune, ALG.antisune],
      s => s.U.every(v => v === top),
      6
    );
  }

  // Step 6: put the U corners in their slots (orientation is preserved).
  _permuteUCorners() {
    const top = this._top;
    const cornersHome = s => {
      if (!s.U.every(v => v === top)) return false;
      for (let k = 0; k < 4; k++) {
        if (s[FACES[k]][2] !== s[FACES[k]][4]) return false;
        if (s[next(k)][0] !== s[next(k)][4]) return false;
      }
      return true;
    };
    return this._macroSearch(["U", "U'", "U2", ALG.tPerm], cornersHome, 7);
  }

  // Step 7: put the U edges in their slots — the cube is then solved.
  _permuteUEdges() {
    return this._macroSearch(
      ["U", "U'", "U2", ALG.uPermA, ALG.uPermB],
      s => _LBLSolver._isSolvedState(s),
      6
    );
  }

  static _isSolvedState(s) {
    for (const f of ['U', 'D', 'F', 'B', 'L', 'R']) {
      for (let i = 1; i < 9; i++) if (s[f][i] !== s[f][0]) return false;
    }
    return true;
  }

  // ── Main entry ─────────────────────────────────────────────────────────────

  solve() {
    this._solveCross();
    this._solveDCorners();
    this._solveMiddleLayer();
    this._solveUCross();
    this._solveUFace();
    this._permuteUCorners();
    this._permuteUEdges();

    // Every stage above can give up (a search depth or a loop cap runs out), and
    // a half-finished sequence still looks like a valid list of moves. Check the
    // cube itself before handing the sequence back, so a failure is never served
    // as an answer.
    if (!_LBLSolver._isSolvedState(this._state)) {
      throw new Error('Solver failed to solve this cube');
    }
    return _cancelMoves(this._moves);
  }
}

// Collapse turns of the same face: R R → R2, R R' → nothing, R2 R → R'.
// Opposite faces commute, so R L R' also collapses to L.
const _AMOUNT   = { "": 1, "'": 3, "2": 2 };
const _SUFFIX   = { 1: '', 2: '2', 3: "'" };
const _OPPOSITE = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' };

function _cancelMoves(moves) {
  const out = [];
  for (const move of moves) {
    const face = move[0];
    let amount = _AMOUNT[move.slice(1)];

    // index of the move this one merges with, if any
    let at = -1;
    if (out.length >= 1 && out[out.length - 1][0] === face) {
      at = out.length - 1;
    } else if (out.length >= 2 && out[out.length - 2][0] === face &&
               out[out.length - 1][0] === _OPPOSITE[face]) {
      at = out.length - 2;
    }

    if (at === -1) {
      out.push(face + _SUFFIX[amount]);
      continue;
    }
    const merged = (_AMOUNT[out[at].slice(1)] + amount) % 4;
    if (merged === 0) out.splice(at, 1);
    else out[at] = face + _SUFFIX[merged];
  }
  return out;
}

window.CubeSolver = CubeSolver;
