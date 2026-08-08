// biome-ignore-all lint/security/noSecrets: Japanese fixtures and test literals are false positives.
// biome-ignore-all lint/suspicious/noExplicitAny: 拡張リポの JS モジュールと任意形の JSON を扱うハーネス。

/**
 * 拡張リポ ↔ サイトの結合スモーク。
 *
 * tests/smoke/extension-comments.smoke.mts が「サイトがこう返すこと」を生 fetch で
 * 固定するのに対し、こちらは **拡張リポの実クライアントを実物のまま import して**
 * 実サーバー + 実 DB に当てる。拡張側のバリデーション・URL 組み立て・
 * レスポンス解釈・401 時のトークン破棄まで、拡張のコードが走る。
 *
 * つまり検出できるのは「サイトの契約違反」ではなく **両リポ間のズレ** そのもの。
 * 片側だけ実装が進んだ状態（例: サイトは atMs を受けるが拡張が送らない）で落ちる。
 *
 * 前提:
 *   1. DB トンネル      : node scripts/start-tunnel.mjs
 *   2. サイトを起動     : npm run build && npx next start   (localhost:3000)
 *   3. 拡張リポのパス   : EXT_REPO=H:/movieClipExtension    (既定値も同じ)
 *
 * ポート 3000 固定なのは偶然ではなく契約で、拡張の src/api.js が
 * http://localhost:3000/api/ をハードコードしている。そこも下で検証する。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EXT_REPO = (process.env.EXT_REPO ?? "H:/movieClipExtension").replace(
  /[\\/]+$/,
  "",
);

const entry = `${EXT_REPO}/src/background/comments.js`;
if (!existsSync(entry)) {
  console.error(
    `拡張リポが見つからない: ${entry}\n` +
      `EXT_REPO=/path/to/movieClipExtension を指定して再実行する。`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// chrome API のスタブ。拡張が実際に触るのは storage.local と runtime.lastError だけ
// （src/shared/storage.js 参照）。import より前に生やす必要がある。
// ---------------------------------------------------------------------------
const store = new Map<string, unknown>();

(globalThis as any).chrome = {
  runtime: { lastError: undefined },
  storage: {
    local: {
      get(
        keys: string[] | string,
        cb: (result: Record<string, unknown>) => void,
      ) {
        const list = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of list) if (store.has(k)) result[k] = store.get(k);
        cb(result);
      },
      set(items: Record<string, unknown>, cb?: () => void) {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
        cb?.();
      },
      remove(keys: string[] | string, cb?: () => void) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) store.delete(k);
        cb?.();
      },
    },
  },
};

// tsx は拡張リポの .js を CJS として読む（拡張の package.json に type: module が
// 無いため）。素の node なら ESM として名前付き export が生えるので、
// どちらでも動くように正規化する。実行されるコードは同じ。
async function loadExt(relPath: string) {
  const mod: any = await import(pathToFileURL(`${EXT_REPO}/${relPath}`).href);
  return mod?.default && !mod.__esModule && Object.keys(mod).length <= 2
    ? mod.default
    : mod;
}

const extComments = await loadExt("src/background/comments.js");
const extApi = await loadExt("src/api.js");
const extStorage = await loadExt("src/shared/storage.js");

const {
  fetchClipComments,
  postClipComment,
  validatePostClipCommentInput,
  validateFetchClipCommentsInput,
} = extComments;
const { STORAGE_KEYS } = extStorage;

// ---------------------------------------------------------------------------
const { prisma } = await import("@/server/db");

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}`, detail ?? "");
  }
}
const eq = (n: string, a: unknown, e: unknown) =>
  check(n, Object.is(a, e), { actual: a, expected: e });

const token = randomBytes(32).toString("base64url");
const instanceId = randomUUID();
const authHash = createHash("sha256").update(token).digest("hex");

let linkedId: bigint | null = null;
const createdCommentIds: bigint[] = [];

function seedAuth(t: string = token) {
  store.set(STORAGE_KEYS.extensionInstanceId, instanceId);
  store.set(STORAGE_KEYS.extensionAuthToken, t);
  store.set(STORAGE_KEYS.extensionLinked, true);
  store.set(STORAGE_KEYS.extensionTokenExpiresAt, Date.now() + 86_400_000);
}

const track = (r: any) => {
  if (r?.comment?.id) createdCommentIds.push(BigInt(r.comment.id));
  return r;
};

try {
  // -------------------------------------------------------------------------
  console.log("拡張の接続先");
  {
    eq(
      "src/api.js の API_URL がサイトの実オリジンを指す",
      extApi.API_URL,
      "http://localhost:3000/api/",
    );
    // ここが食い違うと以降が全部ネットワークエラーになるので先に潰しておく。
    const reachable = await fetch(`${extApi.SITE_ORIGIN}/api/v1/clips`, {
      method: "HEAD",
    })
      .then(() => true)
      .catch(() => false);
    check(
      "その接続先でサイトが起動している",
      reachable,
      `${extApi.SITE_ORIGIN} に到達できない。npx next start を確認する`,
    );
    if (!reachable) throw new Error("site not reachable");
  }

  // -------------------------------------------------------------------------
  console.log("\n未リンク状態（storage が空）");
  {
    // サイトを呼ぶ前に拡張が自前で止めること。ここが壊れると未リンクの拡張が
    // 無限に 401 を叩きにいく。
    const r = await fetchClipComments({ clipId: 1 });
    eq("ok: false", r.ok, false);
    eq("reason が missing_token", r.reason, "missing_token");
    check(
      "サーバーには到達していない（status を持たない）",
      !("status" in r),
      r,
    );
  }

  // -------------------------------------------------------------------------
  const clip = await prisma.clip.findFirstOrThrow({
    where: { deletedAt: null },
    select: { id: true, userId: true, startMs: true, endMs: true },
    orderBy: { id: "asc" },
  });
  const clipId = Number(clip.id);

  const linked = await prisma.linkedExtension.create({
    data: {
      userId: clip.userId,
      extensionInstanceId: instanceId,
      extensionAuthHash: authHash,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  });
  linkedId = linked.id;
  seedAuth();
  console.log(
    `\nfixtures: clip=${clipId} (${clip.startMs}–${clip.endMs}ms), linkedExtension=${linked.id}`,
  );

  // -------------------------------------------------------------------------
  console.log("\n投稿の往復（拡張の postClipComment → サイト）");
  {
    const r = track(
      await postClipComment({ clipId, body: "  拡張の実クライアントから  " }),
    );
    eq("ok: true", r.ok, true);
    check("comment を受け取れている", !!r.comment, r);
    eq(
      "body が trim されて保存される",
      r.comment?.body,
      "拡張の実クライアントから",
    );
    eq("clipId が一致", r.comment?.clipId, clipId);

    // 拡張は `{ ...data }` でレスポンスを素通しする。サイトが返す 7 キーが
    // 拡張の手元まで全部生き残っているかは、素通し実装の前提そのもの。
    check(
      "サイトの 7 フィールドが欠けずに届く",
      JSON.stringify(Object.keys(r.comment ?? {}).sort()) ===
        JSON.stringify([
          "atMs",
          "body",
          "clipId",
          "createdAt",
          "id",
          "userId",
          "username",
        ]),
      Object.keys(r.comment ?? {}),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n一覧の往復（拡張の fetchClipComments → サイト）");
  {
    track(await postClipComment({ clipId, body: "2件目" }));
    track(await postClipComment({ clipId, body: "3件目" }));

    const r = await fetchClipComments({ clipId, limit: 100 });
    eq("ok: true", r.ok, true);
    check(
      "封筒が {ok, clipId, comments, hasNext, nextCursor}",
      JSON.stringify(Object.keys(r).sort()) ===
        JSON.stringify(["clipId", "comments", "hasNext", "nextCursor", "ok"]),
      Object.keys(r),
    );
    eq("clipId が一致", r.clipId, clipId);
    check("配列が返る", Array.isArray(r.comments), r.comments);
    eq(
      "id DESC（直近の投稿が先頭）",
      r.comments[0]?.id,
      Number(createdCommentIds.at(-1)),
    );
  }

  // -------------------------------------------------------------------------
  console.log("\nカーソル追い読み（拡張の生数値カーソル）");
  {
    const page1 = await fetchClipComments({ clipId, limit: 1 });
    eq("hasNext: true", page1.hasNext, true);
    check(
      "nextCursor は生の数値",
      typeof page1.nextCursor === "number",
      page1.nextCursor,
    );

    // サイトが返した数値カーソルを、拡張のバリデータがそのまま受けられること。
    const accepted = validateFetchClipCommentsInput({
      clipId,
      cursor: page1.nextCursor,
    });
    eq("拡張のバリデータが受け付ける", accepted.ok, true);

    const page2 = await fetchClipComments({
      clipId,
      limit: 1,
      cursor: page1.nextCursor,
    });
    eq("ok: true", page2.ok, true);
    check(
      "1ページ目と重複しない",
      page2.comments[0]?.id !== page1.comments[0]?.id,
      { p1: page1.comments[0]?.id, p2: page2.comments[0]?.id },
    );

    // v1 API のカーソルは base64 の不透明文字列で、拡張のものとは別形式。
    // 取り違えたら拡張側で弾かれることを実物のカーソルで確かめる。
    const v1 = await fetch(
      `${extApi.SITE_ORIGIN}/api/v1/clips/${clipId}/comments?limit=1`,
    ).then((res) => res.json());
    check(
      "v1 のカーソルは不透明文字列",
      typeof v1?.meta?.nextCursor === "string",
      v1?.meta,
    );
    eq(
      "v1 のカーソルを渡すと拡張が弾く",
      validateFetchClipCommentsInput({
        clipId,
        cursor: v1?.meta?.nextCursor,
      }).ok,
      false,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n定数の両側一致（拡張のローカル検証 vs サイトの 400）");
  {
    // 本文長。拡張は 500 で自前に切り、サイトも 500 で切る。
    const ok500 = track(
      await postClipComment({ clipId, body: "a".repeat(500) }),
    );
    eq("500 文字ちょうどは拡張・サイトとも通る", ok500.ok, true);

    const ng501 = await postClipComment({ clipId, body: "a".repeat(501) });
    eq("501 文字は拡張がローカルで弾く", ng501.reason, "validation_error");
    eq("弾かれたのは body", ng501.field, "body");
    check("サーバーには投げていない", !("status" in ng501), ng501);
    // 拡張のガードが外れてもサイト側で守られること（二重の合意）。
    const serverSide = await fetch(
      `${extApi.SITE_ORIGIN}/api/extension/clips/${clipId}/comments`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          extensionInstanceId: instanceId,
          body: "a".repeat(501),
        }),
      },
    );
    eq("サイト側も 501 文字を 400 で拒否", serverSide.status, 400);

    // limit 上限。
    const ng101 = await fetchClipComments({ clipId, limit: 101 });
    eq("limit=101 は拡張がローカルで弾く", ng101.field, "limit");
    eq(
      "サイト側も limit=101 を 400 で拒否",
      (
        await fetch(
          `${extApi.SITE_ORIGIN}/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}&limit=101`,
          { headers: { authorization: `Bearer ${token}` } },
        )
      ).status,
      400,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n時刻アンカー atMs（2026-08-06 の合意）");
  {
    // 読み側: v1 で付いた atMs が拡張の手元まで届くか。
    const anchored = await prisma.clipComment.create({
      data: {
        clipId: BigInt(clipId),
        userId: clip.userId,
        body: "v1 由来のアンカー",
        atMs: clip.startMs,
      },
      select: { id: true },
    });
    createdCommentIds.push(anchored.id);

    const list = await fetchClipComments({ clipId, limit: 100 });
    const row = list.comments.find((c: any) => c.id === Number(anchored.id));
    check("拡張の一覧に出る", !!row, list.comments);
    eq("拡張の手元まで atMs が届く（読みは成立）", row?.atMs, clip.startMs);

    // 書き側: 合意では拡張も atMs を送ることになっている。
    const validated = validatePostClipCommentInput({
      clipId,
      body: "この場面",
      atMs: clip.startMs,
    });
    eq(
      "拡張のバリデータが atMs を保持する",
      validated?.value?.atMs,
      clip.startMs,
    );

    const posted = track(
      await postClipComment({ clipId, body: "この場面", atMs: clip.startMs }),
    );
    eq("投稿自体は通る", posted.ok, true);
    eq("拡張から送った atMs が保存される", posted.comment?.atMs, clip.startMs);
  }

  // -------------------------------------------------------------------------
  console.log("\n削除の反映（ハンドオフ B-1）");
  {
    const victim = createdCommentIds[0];
    await prisma.clipComment.update({
      where: { id: victim },
      data: { deletedAt: new Date() },
    });

    const r = await fetchClipComments({ clipId, limit: 100 });
    check(
      "論理削除されたコメントは拡張の一覧から消える",
      !r.comments.some((c: any) => c.id === Number(victim)),
      r.comments.map((c: any) => c.id),
    );
    eq("エラーではなく 200 のまま", r.ok, true);
  }

  // -------------------------------------------------------------------------
  console.log("\n存在しないクリップ");
  {
    const r = await fetchClipComments({ clipId: 999_999_999 });
    eq("ok: false", r.ok, false);
    eq("サイトの 404 を not_found に写す", r.reason, "not_found");
    eq("status も保持する", r.status, 404);
  }

  // -------------------------------------------------------------------------
  console.log("\nOrigin ゲート（実クライアントでは再現できない範囲）");
  {
    // 拡張の fetch には Chrome が Origin: chrome-extension://<id> を付ける。
    // Node の fetch は Origin を送らないため、この経路だけは生 fetch で当てる。
    const withExtOrigin = await fetch(
      `${extApi.SITE_ORIGIN}/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
        },
      },
    );
    check(
      "chrome-extension:// オリジンが許可されている",
      withExtOrigin.status !== 403,
      `${withExtOrigin.status} / CLIP_API_ALLOWED_ORIGINS を確認する`,
    );
    eq(
      "無関係なオリジンは 403",
      (
        await fetch(
          `${extApi.SITE_ORIGIN}/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}`,
          {
            headers: {
              authorization: `Bearer ${token}`,
              origin: "https://evil.example",
            },
          },
        )
      ).status,
      403,
    );
  }

  // -------------------------------------------------------------------------
  // storage を破壊するので最後に置く。
  console.log("\n401 と拡張側の副作用");
  {
    seedAuth("wrong-token");
    const r = await fetchClipComments({ clipId });
    eq("ok: false", r.ok, false);
    eq("サイトの 401 を unauthorized に写す", r.reason, "unauthorized");

    // サイトが 401 を返したら拡張はトークンを捨てる（clearExtensionAuthState）。
    // ここが効かないと、失効済みトークンで叩き続ける拡張が残る。
    check("authToken を破棄する", !store.has(STORAGE_KEYS.extensionAuthToken), [
      ...store.keys(),
    ]);
    check(
      "expiresAt を破棄する",
      !store.has(STORAGE_KEYS.extensionTokenExpiresAt),
      [...store.keys()],
    );
    eq(
      "extensionLinked を false にする",
      store.get(STORAGE_KEYS.extensionLinked),
      false,
    );

    // 破棄後は自前で止まる（サーバーを叩き直さない）。
    eq(
      "以降は missing_token で止まる",
      (await fetchClipComments({ clipId })).reason,
      "missing_token",
    );
  }
} catch (e) {
  fail++;
  failures.push(`EXCEPTION: ${(e as Error).message}`);
  console.error("\nEXCEPTION:", e);
} finally {
  console.log("\n後始末");
  if (createdCommentIds.length) {
    const r = await prisma.clipComment.deleteMany({
      where: { id: { in: createdCommentIds } },
    });
    console.log(`  コメントを物理削除: ${r.count} 件`);
  }
  if (linkedId != null) {
    await prisma.linkedExtension.delete({ where: { id: linkedId } });
    console.log(`  linked_extensions を物理削除: ${linkedId}`);
  }
  await prisma.$disconnect();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  if (failures.length) for (const f of failures) console.log("  -", f);
  process.exitCode = fail === 0 ? 0 : 1;
}
