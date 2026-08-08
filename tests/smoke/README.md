# 統合スモーク

`npm test`（ユニット）と違い、**実 DB と起動中の Next サーバーの両方を要求する**ため
通常のテストチェーンには載せていない。手で叩くオプトイン扱い。

## 前提

1. DB トンネル: `node scripts/start-tunnel.mjs`
2. サーバー: `npm run build && npx next start`（`:3000`）
   - `next start` は `NODE_ENV=production` になるため、`auth.ts` の `isCrossSiteAuth`
     が真になり、セッション Cookie 名が `__Secure-authjs.session-token` になる。
     スクリプトはこの名前で Cookie を偽造する。`next dev` に対して回すなら
     Cookie 名を `authjs.session-token` に変える必要がある。
   - Chrome は `http://localhost` を secure origin として扱うので、
     `Secure` 属性付き Cookie でも HTTP のまま通る。

## 実行

```bash
npm run smoke:comments          # v1 API   /api/v1/clips/{clipId}/comments
npm run smoke:extension         # 拡張API  /api/extension/clips/{clipId}/comments（回帰用）
npm run smoke:extension-client  # 拡張リポの実クライアント ↔ サイト（結合／下記）
npm run smoke:ui                # CommentModal の実操作（下記の追加準備が要る）
```

### smoke:extension-client（拡張リポとの結合）

`smoke:extension` が「サイトがこう返すこと」を**生 fetch で**固定するのに対し、
こちらは**拡張リポの実クライアント（`src/background/comments.js`）を実物のまま
import して**実サーバー + 実 DB に当てる。`chrome.storage.local` だけをスタブし、
拡張のバリデーション・URL 組み立て・レスポンス解釈・401 時のトークン破棄まで
拡張のコードが走る。したがって検出対象は「サイトの契約違反」ではなく
**両リポ間のズレ**そのもの（片側だけ実装が進んだ状態で落ちる）。

```bash
EXT_REPO=H:/movieClipExtension npm run smoke:extension-client   # 既定値も同じ
```

- **接続先はポート 3000 固定**。拡張の `src/api.js` が
  `http://localhost:3000/api/` をハードコードしているため、`SMOKE_BASE` は効かない。
  そのハードコード自体もアサーションの1つ。
- `Origin` だけは実クライアントで再現できない（Node の fetch は `Origin` を
  送らず、Chrome は `chrome-extension://<id>` を付ける）。この経路のみ生 fetch で
  `CLIP_API_ALLOWED_ORIGINS` の設定を実測している。
- 拡張リポは webpack でバンドルされるが、このテストは**バンドル前のソース**を
  直接読む。tsx 経由だと拡張の `.js` が CJS として読まれるため
  （拡張の package.json に `type: module` が無い）、ローダーの差を吸収してから
  名前付き export を取り出している。

#### 既知の失敗: atMs（2 項目）

2026-08-06 に「拡張も atMs を読み書きする」で合意し**サイト側だけ解禁済み**だが、
拡張リポにはまだ実装が無い（`grep -r atMs` がヒットしない）。以下が赤になる:

- 拡張のバリデータが atMs を保持する — `validatePostClipCommentInput` が捨てる
- 拡張から送った atMs が保存される — POST ボディに載らないので `null` になる

読み側（サイトが返した `atMs` が拡張の手元まで届く）は既に通っている。
拡張側が書き側を実装したら緑になる。

`smoke:ui` だけは playwright-core を使う。インストールが重いのでリポジトリの依存には
入れていない。任意の場所に入れてパスを渡す:

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i playwright-core
PLAYWRIGHT_CORE=/tmp/pw/node_modules/playwright-core npm run smoke:ui
```

環境変数:

| 変数 | 既定 | 用途 |
|---|---|---|
| `SMOKE_BASE` | `http://127.0.0.1:3000` | 対象サーバー |
| `PLAYWRIGHT_CORE` | （必須・UI のみ） | playwright-core のパス |
| `CHROME_PATH` | Windows の既定パス | システム Chrome の実行ファイル |
| `SMOKE_SHOT_DIR` | `.` | スクリーンショット出力先 |

## 後始末

各スクリプトは作成したコメント・クリップ・`linked_extensions` 行を `finally` で
**物理削除**する。異常終了した場合は以下で残骸を確認する:

```sql
SELECT count(*) FROM clip_comments;
SELECT * FROM clips WHERE name LIKE 'smoke-%';
```

## 時刻の検証について

Prisma は timestamptz を読みで +9h・書きで -9h ずらす既知の挙動がある
（`docs/llm-research/2026-08-03-prisma-timestamptz-skew.md`）。
`last_seen_at` の検証は **Prisma が書いた値どうし**で比較すること。
node-pg と Prisma をまたいで比べると 9 時間ずれて偽の失敗になる。
