# rubik-solver

ルービックキューブのソルバー。**ブラウザで動く Web アプリ**と、**CLI ツール群**（PowerShell + Python）の 2 本立てです。

- **Web アプリ（GitHub Pages）**: <https://takumayellow.github.io/rubik-solver/>
- **CLI**: ランダムスクランブル生成・kociemba による解法・フェイス文字列からの復元などをターミナルで実行

> **注意**: PowerShell スクリプト（`rubik.ps1`）は **Windows 限定**です。Python スクリプトは各 OS で直接実行できます。

---

## Web アプリ

ビルド不要の静的サイト（Vanilla JS）。`web/` 配下がそのまま GitHub Pages にデプロイされています。

| 機能 | 説明 |
|------|------|
| キューブ表示 | 2D 展開図 + CSS 3D プレビュー |
| スクランブル | ランダム 20 手のスクランブルを適用 |
| 手動操作 | U/D/L/R/F/B の各回転（`'` / `2` 含む）をボタンで適用 |
| 自動解法 | LBL（Layer-by-Layer）方式で解法手順を生成し、ステップ実行アニメーション表示 |
| 解法・履歴表示 | 解法手順の一覧と操作履歴を表示 |

> **注**: Web 版のソルバーは LBL 方式のため、解法手順は最短ではありません（kociemba を使う CLI 版より長くなります）。ランダム 25 手のスクランブルに対して**平均 128 手・最大 200 手前後**です。

ローカルで動かす場合はブラウザで `web/index.html` を開くだけです。

---

## CLI の特徴

| 機能 | 説明 |
|------|------|
| ランダムスクランブル | 指定手数・シードでスクランブルを生成し自動解法まで実行 |
| 任意スクランブル解法 | 手順文字列（例: `R U R' U'`）から kociemba で解法手順を求める |
| フェイス文字列解法 | 54 文字の URFDLB 表現から現在の状態を復元して解く |
| kociemba アルゴリズム | `kociemba` ライブラリによる 2 フェーズ解法 |
| pycuber シミュレーション | `pycuber` でキューブ状態をシミュレート・検証 |

---

## セットアップ（CLI）

### 必要環境

- Python 3.8 以上
- PowerShell 5.1 以上（Windows）または pwsh（macOS / Linux）

### 初回セットアップ

```powershell
.\rubik.ps1 init
```

このコマンドが仮想環境の作成と依存パッケージのインストールを行います。
手動でセットアップする場合:

```bash
python -m venv .venv
# Windows:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

### requirements.txt

```
kociemba==1.2.1
pycuber==0.2.2
```

> **注**: `overlay_solve.py`（Web カメラオーバーレイ）だけは追加で OpenCV と NumPy が必要です:
> `pip install opencv-python numpy`

---

## 使い方（CLI）

### ランダムスクランブル → 自動解法

```powershell
.\rubik.ps1 random
.\rubik.ps1 random -len 25 -seed 123
```

### 任意スクランブルを解く

```powershell
.\rubik.ps1 solve -scramble "R U R' U' F2 L D2"
```

### 54文字フェイス（URFDLB）から解く

```powershell
.\rubik.ps1 facelets -state UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
```

### Python スクリプトを直接実行する場合

```bash
# ランダムスクランブルと解法（--len/--seed は省略可）
python random_scramble_and_solve.py --len 25 --seed 123

# スクランブル手順の逆手順（復元手順）を生成
python solve_from_moves.py --scramble "R U R' U' F2 L D2"

# フェイス文字列から解く
python solve_facelets.py --state UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB

# フェイス文字列を検証する
python validate_facelets.py --state UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB

# kociemba でスクランブルから直接解く
python solve_with_kociemba_from_scramble.py --scramble "R U R' U'"

# オーバーレイ付き解法（Web カメラ映像に手順を重ねて表示。要 opencv-python）
# ※ このスクリプトのみフラグがシングルダッシュ（-scramble / -state のどちらか必須）
python overlay_solve.py -scramble "R U R' U'"
python overlay_solve.py -state UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB
```

---

## Python スクリプト一覧

| スクリプト | 説明 |
|---|---|
| `solve_facelets.py` | 54文字フェイス文字列から解を求める（kociemba） |
| `validate_facelets.py` | 54文字フェイス文字列の妥当性を検証し、解ける場合は解を表示 |
| `solve_from_moves.py` | スクランブル手順の逆手順（復元手順）を生成 |
| `solve_with_kociemba_from_scramble.py` | スクランブル手順から解を求める（kociemba） |
| `overlay_solve.py` | Webカメラ映像にステップを重ねて表示するオーバーレイ解法 |
| `random_scramble_and_solve.py` | ランダムスクランブルを生成し自動で解く |

> **注**: kociemba は最短手順を**保証しません**。通常 20 手前後の解を返します。

---

## ファイル構成

```
rubik-solver/
├── web/                               # Web アプリ（GitHub Pages にデプロイ）
│   ├── index.html
│   ├── app.js                         # UI コントローラ
│   ├── cube-solver.js                 # キューブ状態モデル + LBL ソルバー
│   ├── cube-renderer.js               # 2D 展開図 + CSS 3D プレビュー描画
│   └── style.css
├── rubik.ps1                          # CLI エントリーポイント（PowerShell）
├── random_scramble_and_solve.py       # ランダムスクランブル + 解法
├── solve_from_moves.py                # 手順文字列から逆手順を生成
├── solve_facelets.py                  # フェイス文字列から解く
├── solve_with_kociemba_from_scramble.py  # kociemba で直接解法
├── validate_facelets.py               # フェイス文字列の検証
├── overlay_solve.py                   # オーバーレイ表示付き解法
└── requirements.txt                   # Python 依存ライブラリ
```

---

## フェイス文字列の表現形式

54 文字の文字列で、各面（U/R/F/D/L/B）の 9 マスを左上から右下へ順に並べます。

```
UUUUUUUUU  = U面（上）の 9 マス
RRRRRRRRR  = R面（右）の 9 マス
FFFFFFFFF  = F面（前）の 9 マス
DDDDDDDDD  = D面（下）の 9 マス
LLLLLLLLL  = L面（左）の 9 マス
BBBBBBBBB  = B面（後）の 9 マス
```

解いた状態（初期状態）は `UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB` です。

---

## ライセンス

個人・学習目的で公開しています。
`kociemba` および `pycuber` ライブラリのライセンスはそれぞれのパッケージに準じます。
