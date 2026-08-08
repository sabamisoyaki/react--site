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
npm run smoke:comments    # v1 API      /api/v1/clips/{clipId}/comments
npm run smoke:extension   # 拡張API     /api/extension/clips/{clipId}/comments（回帰用）
npm run smoke:ui          # CommentModal の実操作（下記の追加準備が要る）
```

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
