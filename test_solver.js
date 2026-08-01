// Web 版ソルバー (web/cube-solver.js) の回帰テスト。
//
//   node test_solver.js [試行回数]        既定 1000
//
// 検証内容:
//   1. 手順表が本物の面回転か（20 個の駒が壊れずに保たれるか）
//   2. ランダムスクランブルを solve() が実際に解けるか
//      — 返ってきた手順をスクランブル状態に当て直して完成を確認する
//        （ソルバー内部の判定を信用しない）
//   3. 完成状態・短いスクランブル・戻り値の手順文字列が妥当か

'use strict';
const fs = require('fs');
const path = require('path');

global.window = {};
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, 'web', 'cube-solver.js'), 'utf8'));
const CubeSolver = window.window ? window.window.CubeSolver : window.CubeSolver;

const MOVES = Object.keys(CubeSolver._MOVES);
const solved = () => new CubeSolver().getState();
const applyTo = (state, moves) => {
  const c = new CubeSolver();
  c._state = state;
  for (const m of moves) c.applyMove(m);
  return c;
};

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) { failures++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`ok    ${name}`);
};

// ── 1. 駒の整合性: どの手順を当てても 12 本の辺と 8 個の角は元の色の組のまま ──
const EDGES = [['U',7,'F',1],['U',5,'R',1],['U',1,'B',1],['U',3,'L',1],
               ['F',5,'R',3],['R',5,'B',3],['B',5,'L',3],['L',5,'F',3],
               ['D',1,'F',7],['D',5,'R',7],['D',7,'B',7],['D',3,'L',7]];
const CORNERS = [['U',8,'F',2,'R',0],['U',2,'R',2,'B',0],['U',0,'B',2,'L',0],['U',6,'L',2,'F',0],
                 ['D',2,'F',8,'R',6],['D',8,'R',8,'B',6],['D',6,'B',8,'L',6],['D',0,'L',8,'F',6]];
const key = a => a.slice().sort().join('');
const refEdges   = new Set(EDGES.map(([a,i,b,j]) => key([solved()[a][i], solved()[b][j]])));
const refCorners = new Set(CORNERS.map(([a,i,b,j,c,k]) => key([solved()[a][i], solved()[b][j], solved()[c][k]])));

function piecesIntact(s) {
  const e = EDGES.map(([a,i,b,j]) => key([s[a][i], s[b][j]]));
  const c = CORNERS.map(([a,i,b,j,cc,k]) => key([s[a][i], s[b][j], s[cc][k]]));
  return new Set(e).size === 12 && e.every(x => refEdges.has(x)) &&
         new Set(c).size === 8  && c.every(x => refCorners.has(x));
}

let brokenTriples = 0;
for (const a of MOVES) for (const b of MOVES) for (const c of MOVES) {
  if (!piecesIntact(applyTo(solved(), [a, b, c]).getState())) brokenTriples++;
}
check(`駒の整合性 (${MOVES.length ** 3} 通りの 3 手)`, brokenTriples === 0, `${brokenTriples} 通りで駒が壊れた`);

// 面回転の位数（本物のキューブ群かどうかの指紋）
const order = (seq) => {
  const c = new CubeSolver();
  let n = 0;
  do { for (const m of seq) c.applyMove(m); n++; } while (!c.isSolved() && n < 500);
  return n;
};
check('位数 (R U) = 105',  order(['R', 'U']) === 105);
check('位数 (R U2) = 30',  order(['R', 'U2']) === 30);
check("位数 (R U R' U') = 6", order(['R', 'U', "R'", "U'"]) === 6);

// ── 2. ランダムスクランブルを解けるか ──────────────────────────────────────
const trials = Number(process.argv[2] || 1000);
let unsolved = 0, badToken = 0, totalLen = 0, maxLen = 0;
const started = Date.now();
for (let i = 0; i < trials; i++) {
  const cube = new CubeSolver();
  cube.scramble(25);
  const scrambled = cube.getState();

  const solution = cube.solve();
  for (const m of solution) if (!MOVES.includes(m)) badToken++;

  // 返ってきた手順をスクランブル状態に当て直す
  if (!applyTo(scrambled, solution).isSolved()) unsolved++;
  totalLen += solution.length;
  maxLen = Math.max(maxLen, solution.length);
}
check(`ランダム 25 手スクランブル × ${trials} を解く`, unsolved === 0, `${unsolved} 件が未完成`);
check('手順に未知の記号が混ざらない', badToken === 0, `${badToken} 個`);

// ── 3. 端のケース ───────────────────────────────────────────────────────────
const done = new CubeSolver();
check('完成状態では手順が空', done.solve().length === 0);

let shortFail = 0;
for (let n = 1; n <= 10; n++) {
  for (let t = 0; t < 20; t++) {
    const c = new CubeSolver();
    c.scramble(n);
    const before = c.getState();
    if (!applyTo(before, c.solve()).isSolved()) shortFail++;
  }
}
check('1〜10 手のスクランブル × 20', shortFail === 0, `${shortFail} 件が未完成`);

const untouched = new CubeSolver();
untouched.scramble(20);
const snapshot = JSON.stringify(untouched.getState());
untouched.solve();
check('solve() は呼び出し元の状態を書き換えない', JSON.stringify(untouched.getState()) === snapshot);

console.log(`\nLBL: 平均 ${(totalLen / trials).toFixed(1)} 手 / 最大 ${maxLen} 手 / ` +
            `${((Date.now() - started) / trials).toFixed(1)} ms per solve`);

// ── 4. 2 フェーズ法（web/two-phase.js）──────────────────────────────────────
global.CubeSolver = CubeSolver;   // two-phase.js は cube-solver.js から手順表を取り込む
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, 'web', 'two-phase.js'), 'utf8'));
const TwoPhase = window.TwoPhaseSolver;

const initStart = Date.now();
TwoPhase.init();
console.log(`\n2 フェーズ法の表の生成: ${Date.now() - initStart} ms`);

let tpFail = 0, tpToken = 0, tpLen = 0, tpMax = 0, tpLong = 0;
const tpStart = Date.now();
for (let i = 0; i < trials; i++) {
  const cube = new CubeSolver();
  cube.scramble(25);
  const scrambled = cube.getState();

  const solution = TwoPhase.solve(scrambled);
  if (!solution) { tpFail++; continue; }
  for (const m of solution) if (!MOVES.includes(m)) tpToken++;
  if (!applyTo(scrambled, solution).isSolved()) tpFail++;
  if (solution.length > 30) tpLong++;
  tpLen += solution.length;
  tpMax = Math.max(tpMax, solution.length);
}
check(`2 フェーズ法: ランダム 25 手 × ${trials} を解く`, tpFail === 0, `${tpFail} 件が未完成`);
check('2 フェーズ法: 手順に未知の記号が混ざらない', tpToken === 0, `${tpToken} 個`);
check('2 フェーズ法: 30 手を超える解を返さない', tpLong === 0, `${tpLong} 件`);
check('2 フェーズ法: 完成状態では手順が空', TwoPhase.solve(solved()).length === 0);

const tpUntouched = new CubeSolver();
tpUntouched.scramble(20);
const tpSnapshot = JSON.stringify(tpUntouched.getState());
TwoPhase.solve(tpUntouched.getState());
check('2 フェーズ法: 渡した状態を書き換えない', JSON.stringify(tpUntouched.getState()) === tpSnapshot);

let tpShort = 0;
for (let n = 1; n <= 10; n++) {
  for (let t = 0; t < 20; t++) {
    const c = new CubeSolver();
    c.scramble(n);
    const before = c.getState();
    const sol = TwoPhase.solve(before);
    if (!sol || !applyTo(before, sol).isSolved()) tpShort++;
  }
}
check('2 フェーズ法: 1〜10 手のスクランブル × 20', tpShort === 0, `${tpShort} 件が未完成`);

console.log(`2 フェーズ法: 平均 ${(tpLen / (trials - tpFail)).toFixed(1)} 手 / 最大 ${tpMax} 手 / ` +
            `${((Date.now() - tpStart) / trials).toFixed(1)} ms per solve`);
process.exit(failures === 0 ? 0 : 1);
