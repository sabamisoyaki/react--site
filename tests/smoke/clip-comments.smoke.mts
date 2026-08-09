// biome-ignore-all lint/security/noSecrets: Japanese fixtures and test literals are false positives.
// biome-ignore-all lint/suspicious/noExplicitAny: 任意形の JSON レスポンスを検査するテストハーネス。

/**
 * /api/v1/clips/{clipId}/comments の統合スモーク。
 * 実 DB + 実 Next サーバー (next start, :3000) に対して HTTP で叩く。
 * 作ったデータは finally で必ず物理削除する。
 */
const { encode } = await import("next-auth/jwt");
const { prisma } = await import("@/server/db");

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:3000";
// next start は NODE_ENV=production → auth.ts の isCrossSiteAuth が true
const COOKIE_NAME = "__Secure-authjs.session-token";

const authSecret = process.env.AUTH_SECRET;
if (!authSecret) {
  console.error("AUTH_SECRET is not set (run with --env-file=.env.local)");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(
      `${name}${detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`,
    );
    console.log(`  ✗ ${name}`, detail === undefined ? "" : detail);
    return;
  }
  console.log(`  ✓ ${name}`);
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(name, Object.is(actual, expected), { actual, expected });
}

async function req(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body) headers.set("content-type", "application/json");
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { __raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

// ---- fixtures -------------------------------------------------------------
const createdCommentIds: bigint[] = [];
let deletedClipId: number | null = null;
let createdUserId: bigint | null = null;
let ownerUserId: number;
let otherUserId: number;
let clipId: number;

try {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: { id: "asc" },
    take: 3, // 3人目は「投稿者でもクリップ所有者でもない第三者」の 403 確認に使う
  });
  if (users.length < 2) throw new Error("need at least 2 active users");

  const clip = await prisma.clip.findFirst({
    where: { deletedAt: null },
    select: { id: true, userId: true },
    orderBy: { id: "asc" },
  });
  if (!clip) throw new Error("need at least 1 active clip");

  clipId = Number(clip.id);
  // クリップ所有者ではないユーザーを投稿者にする（他人のクリップに投稿できる契約の確認）
  const poster =
    users.find((u) => String(u.id) !== String(clip.userId)) ?? users[0];
  ownerUserId = Number(clip.userId);
  otherUserId = Number(poster.id);

  const cookieValue = await encode({
    token: {
      uid: String(poster.id),
      sub: String(poster.id),
      name: poster.name,
      email: poster.email,
    },
    secret: authSecret,
    salt: COOKIE_NAME,
  });
  const authCookie = `${COOKIE_NAME}=${cookieValue}`;

  // 論理削除済みクリップを1件作る（後で物理削除）
  const softDeleted = await prisma.clip.create({
    data: {
      userId: BigInt(otherUserId),
      vodId: (await prisma.vod.findFirstOrThrow({ select: { id: true } })).id,
      name: "smoke-deleted-clip",
      title: "smoke",
      startMs: 0,
      endMs: 1000,
      url: "https://www.netflix.com/watch/1",
      deletedAt: new Date(),
    },
    select: { id: true },
  });
  deletedClipId = Number(softDeleted.id);

  console.log(
    `fixtures: clip=${clipId} (owner ${ownerUserId}), poster=${otherUserId}, softDeletedClip=${deletedClipId}\n`,
  );

  // ---- GET: 基本 ----------------------------------------------------------
  console.log("GET 基本");
  {
    const r = await req(`/api/v1/clips/${clipId}/comments`);
    eq("200 が返る", r.status, 200);
    check(
      "封筒が {data, meta}",
      Array.isArray(r.json.data) && !!r.json.meta,
      r.json,
    );
    check(
      "meta のキーが OpenAPI どおり",
      JSON.stringify(Object.keys(r.json.meta ?? {}).sort()) ===
        JSON.stringify(["hasNext", "limit", "nextCursor"]),
      Object.keys(r.json.meta ?? {}),
    );
    eq("既定 limit は 20", r.json.meta?.limit, 20);
    check(
      "トップレベルに余計なキーが無い",
      JSON.stringify(Object.keys(r.json).sort()) ===
        JSON.stringify(["data", "meta"]),
      Object.keys(r.json),
    );
  }

  // ---- GET: エラー --------------------------------------------------------
  console.log("\nGET エラー系");
  {
    eq(
      "存在しない clipId は 404",
      (await req("/api/v1/clips/999999999/comments")).status,
      404,
    );
    eq(
      "論理削除クリップは 404",
      (await req(`/api/v1/clips/${deletedClipId}/comments`)).status,
      404,
    );
    eq("clipId=0 は 400", (await req("/api/v1/clips/0/comments")).status, 400);
    eq(
      "clipId=abc は 400",
      (await req("/api/v1/clips/abc/comments")).status,
      400,
    );
    eq(
      "limit=0 は 400",
      (await req(`/api/v1/clips/${clipId}/comments?limit=0`)).status,
      400,
    );
    eq(
      "limit=101 は 400",
      (await req(`/api/v1/clips/${clipId}/comments?limit=101`)).status,
      400,
    );
    eq(
      "未知のクエリは 400 (.strict)",
      (await req(`/api/v1/clips/${clipId}/comments?foo=1`)).status,
      400,
    );
    eq(
      "壊れた cursor は 400",
      (await req(`/api/v1/clips/${clipId}/comments?cursor=not-a-cursor`))
        .status,
      400,
    );

    const e = await req("/api/v1/clips/999999999/comments");
    check(
      "エラー body が {message, code}",
      typeof e.json.message === "string" && typeof e.json.code === "string",
      e.json,
    );
  }

  // ---- POST: 認証 ---------------------------------------------------------
  console.log("\nPOST 認証");
  {
    eq(
      "Cookie 無しは 401",
      (
        await req(`/api/v1/clips/${clipId}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: "x" }),
        })
      ).status,
      401,
    );

    const r = await req(`/api/v1/clips/${clipId}/comments`, {
      method: "POST",
      cookie: authCookie,
      body: JSON.stringify({ body: "  最初のコメント  " }),
    });
    eq("Cookie 有りは 201", r.status, 201);
    if (r.json?.id) createdCommentIds.push(BigInt(r.json.id));
    eq("body が trim される", r.json.body, "最初のコメント");
    eq("投稿者はセッションのユーザー", r.json.userId, otherUserId);
    eq("clipId が一致", r.json.clipId, clipId);
    check(
      "他人のクリップに投稿できる",
      ownerUserId !== otherUserId && r.status === 201,
      { ownerUserId, otherUserId },
    );
    check(
      "username が string|null",
      r.json.username === null || typeof r.json.username === "string",
      r.json.username,
    );
    check(
      "createdAt が ISO 文字列",
      typeof r.json.createdAt === "string" &&
        !Number.isNaN(Date.parse(r.json.createdAt)),
      r.json.createdAt,
    );
    check(
      "id 類が number (BigInt が漏れていない)",
      [r.json.id, r.json.clipId, r.json.userId].every(
        (v) => typeof v === "number",
      ),
      { id: r.json.id, clipId: r.json.clipId, userId: r.json.userId },
    );
    check(
      "ClipComment のキーが OpenAPI どおり",
      JSON.stringify(Object.keys(r.json).sort()) ===
        JSON.stringify([
          "atMs",
          "body",
          "clipId",
          "createdAt",
          "id",
          "userId",
          "username",
        ]),
      Object.keys(r.json),
    );

    const clientRequestId = crypto.randomUUID();
    const idempotentBody = JSON.stringify({
      body: "再試行されるコメント",
      clientRequestId,
    });
    const first = await req(`/api/v1/clips/${clipId}/comments`, {
      method: "POST",
      cookie: authCookie,
      body: idempotentBody,
    });
    const retry = await req(`/api/v1/clips/${clipId}/comments`, {
      method: "POST",
      cookie: authCookie,
      body: idempotentBody,
    });
    eq("冪等な再試行は同じコメントを返す", retry.json.id, first.json.id);
    if (first.json?.id) createdCommentIds.push(BigInt(first.json.id));
  }

  // ---- POST: バリデーション -----------------------------------------------
  console.log("\nPOST バリデーション");
  {
    const post = (body: unknown) =>
      req(`/api/v1/clips/${clipId}/comments`, {
        method: "POST",
        cookie: authCookie,
        body: JSON.stringify(body),
      });

    eq("空文字は 400", (await post({ body: "" })).status, 400);
    eq("空白のみは 400", (await post({ body: "   " })).status, 400);
    eq("501 文字は 400", (await post({ body: "a".repeat(501) })).status, 400);
    eq(
      "未知キーは 400 (.strict)",
      (
        await post({
          body: "x",
          extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
        })
      ).status,
      400,
    );
    eq("body 欠落は 400", (await post({})).status, 400);

    const ok500 = await post({ body: "b".repeat(500) });
    eq("500 文字ちょうどは 201", ok500.status, 201);
    if (ok500.json?.id) createdCommentIds.push(BigInt(ok500.json.id));

    const nl = await post({ body: "一行目\n二行目" });
    eq("改行は保持される", nl.json?.body, "一行目\n二行目");
    if (nl.json?.id) createdCommentIds.push(BigInt(nl.json.id));

    eq(
      "存在しないクリップへの投稿は 404",
      (
        await req("/api/v1/clips/999999999/comments", {
          method: "POST",
          cookie: authCookie,
          body: JSON.stringify({ body: "x" }),
        })
      ).status,
      404,
    );
    eq(
      "論理削除クリップへの投稿は 404",
      (
        await req(`/api/v1/clips/${deletedClipId}/comments`, {
          method: "POST",
          cookie: authCookie,
          body: JSON.stringify({ body: "x" }),
        })
      ).status,
      404,
    );
  }

  // ---- 時刻アンカー -------------------------------------------------------
  console.log("\n時刻アンカー atMs");
  {
    const range = await prisma.clip.findUniqueOrThrow({
      where: { id: BigInt(clipId) },
      select: { startMs: true, endMs: true },
    });
    const post = (payload: unknown) =>
      req(`/api/v1/clips/${clipId}/comments`, {
        method: "POST",
        cookie: authCookie,
        body: JSON.stringify(payload),
      });

    const withAnchor = await post({
      body: "この場面いい",
      atMs: range.startMs,
    });
    eq("startMs ちょうどは 201", withAnchor.status, 201);
    eq("atMs がそのまま返る", withAnchor.json.atMs, range.startMs);
    if (withAnchor.json?.id) createdCommentIds.push(BigInt(withAnchor.json.id));

    const atEnd = await post({ body: "終わりぎわ", atMs: range.endMs });
    eq("endMs ちょうども 201", atEnd.status, 201);
    if (atEnd.json?.id) createdCommentIds.push(BigInt(atEnd.json.id));

    const noAnchor = await post({ body: "クリップ全体へ" });
    eq("atMs 省略時は null", noAnchor.json.atMs, null);
    if (noAnchor.json?.id) createdCommentIds.push(BigInt(noAnchor.json.id));

    const nullAnchor = await post({ body: "明示的な null", atMs: null });
    eq("atMs: null も 201", nullAnchor.status, 201);
    if (nullAnchor.json?.id) createdCommentIds.push(BigInt(nullAnchor.json.id));

    const tooEarly = await post({ body: "範囲外", atMs: range.startMs - 1 });
    eq("startMs 未満は 400", tooEarly.status, 400);
    eq("code が AT_MS_OUT_OF_RANGE", tooEarly.json.code, "AT_MS_OUT_OF_RANGE");

    eq(
      "endMs 超過は 400",
      (await post({ body: "範囲外", atMs: range.endMs + 1 })).status,
      400,
    );
    eq("負の atMs は 400", (await post({ body: "x", atMs: -1 })).status, 400);
    eq(
      "小数の atMs は 400",
      (await post({ body: "x", atMs: 1.5 })).status,
      400,
    );

    const listed = await req(`/api/v1/clips/${clipId}/comments?limit=100`);
    const anchored = listed.json.data.find(
      (c: any) => c.id === withAnchor.json.id,
    );
    eq("一覧でも atMs が返る", anchored?.atMs, range.startMs);
    check(
      "ClipComment のキーに atMs が入っている",
      JSON.stringify(Object.keys(anchored ?? {}).sort()) ===
        JSON.stringify([
          "atMs",
          "body",
          "clipId",
          "createdAt",
          "id",
          "userId",
          "username",
        ]),
      Object.keys(anchored ?? {}),
    );
  }

  // ---- 並び順とページング -------------------------------------------------
  console.log("\n並び順とカーソル追い読み");
  {
    // 追加で2件投げて計5件にする
    for (const n of [4, 5]) {
      const r = await req(`/api/v1/clips/${clipId}/comments`, {
        method: "POST",
        cookie: authCookie,
        body: JSON.stringify({ body: `seq-${n}` }),
      });
      if (r.json?.id) createdCommentIds.push(BigInt(r.json.id));
    }

    const all = await req(`/api/v1/clips/${clipId}/comments?limit=100`);
    const ids: number[] = all.json.data.map((c: any) => c.id);
    check(
      "id DESC (新しい順) に並ぶ",
      ids.every((v, i) => i === 0 || ids[i - 1] > v),
      ids,
    );
    check(
      "これまでに投稿した全件が見える",
      createdCommentIds.every((id) => ids.includes(Number(id))),
      { posted: createdCommentIds.map(Number), got: ids },
    );

    const p1 = await req(`/api/v1/clips/${clipId}/comments?limit=2`);
    eq("1ページ目は 2件", p1.json.data.length, 2);
    eq("hasNext が true", p1.json.meta.hasNext, true);
    check(
      "nextCursor が不透明文字列",
      typeof p1.json.meta.nextCursor === "string" &&
        p1.json.meta.nextCursor.length > 0,
      p1.json.meta.nextCursor,
    );
    check(
      "nextCursor が生の id ではない",
      !/^\d+$/.test(String(p1.json.meta.nextCursor)),
      p1.json.meta.nextCursor,
    );

    const p2 = await req(
      `/api/v1/clips/${clipId}/comments?limit=2&cursor=${encodeURIComponent(p1.json.meta.nextCursor)}`,
    );
    eq("2ページ目も 2件", p2.json.data.length, 2);
    const p1ids = p1.json.data.map((c: any) => c.id);
    const p2ids = p2.json.data.map((c: any) => c.id);
    check(
      "ページ間で重複しない",
      p2ids.every((id: number) => !p1ids.includes(id)),
      { p1ids, p2ids },
    );
    check(
      "ページをまたいでも降順が続く",
      Math.min(...p1ids) > Math.max(...p2ids),
      { p1ids, p2ids },
    );

    // 最終ページまで辿る
    let cursor = p2.json.meta.nextCursor;
    let guard = 0;
    let last = p2;
    while (cursor && guard++ < 10) {
      last = await req(
        `/api/v1/clips/${clipId}/comments?limit=2&cursor=${encodeURIComponent(cursor)}`,
      );
      cursor = last.json.meta.nextCursor;
    }
    eq("最終ページの hasNext は false", last.json.meta.hasNext, false);
    eq("最終ページの nextCursor は null", last.json.meta.nextCursor, null);
  }

  // ---- 論理削除コメントの除外 ---------------------------------------------
  console.log("\n論理削除コメントの除外");
  {
    const victim = createdCommentIds[0];
    await prisma.clipComment.update({
      where: { id: victim },
      data: { deletedAt: new Date() },
    });
    const after = await req(`/api/v1/clips/${clipId}/comments?limit=100`);
    const ids: number[] = after.json.data.map((c: any) => c.id);
    check("論理削除したコメントは一覧に出ない", !ids.includes(Number(victim)), {
      victim: Number(victim),
      ids,
    });
    await prisma.clipComment.update({
      where: { id: victim },
      data: { deletedAt: null },
    });
  }

  // ---- 拡張API との一致 ---------------------------------------------------
  console.log("\n拡張API との並び一致");
  {
    const v1 = await req(`/api/v1/clips/${clipId}/comments?limit=100`);
    const v1ids = v1.json.data.map((c: any) => c.id);
    const rows = await prisma.clipComment.findMany({
      where: { clipId: BigInt(clipId), deletedAt: null },
      orderBy: { id: "desc" },
      take: 100,
      select: { id: true },
    });
    const dbids = rows.map((r) => Number(r.id));
    check(
      "v1 の並びがリポジトリの id DESC と一致",
      JSON.stringify(v1ids) === JSON.stringify(dbids),
      { v1ids, dbids },
    );
  }
  // ---- DELETE -------------------------------------------------------------
  console.log("\nDELETE 権限");
  {
    // クリップ所有者のセッションも用意する（モデレーション確認用）
    const owner = users.find((u) => String(u.id) === String(clip.userId));
    const ownerCookie = owner
      ? `${COOKIE_NAME}=${await encode({
          token: {
            uid: String(owner.id),
            sub: String(owner.id),
            name: owner.name,
            email: owner.email,
          },
          secret: authSecret,
          salt: COOKIE_NAME,
        })}`
      : null;

    const post = async (body: string) => {
      const r = await req(`/api/v1/clips/${clipId}/comments`, {
        method: "POST",
        cookie: authCookie,
        body: JSON.stringify({ body }),
      });
      createdCommentIds.push(BigInt(r.json.id));
      return r.json.id as number;
    };
    const del = (id: number, cookie?: string) =>
      req(`/api/v1/clips/${clipId}/comments/${id}`, {
        method: "DELETE",
        cookie,
      });

    const target = await post("削除テスト");

    eq("Cookie 無しの削除は 401", (await del(target)).status, 401);
    eq(
      "存在しないコメントは 404",
      (await del(999999999, authCookie)).status,
      404,
    );
    eq(
      "commentId=abc は 400",
      (
        await req(`/api/v1/clips/${clipId}/comments/abc`, {
          method: "DELETE",
          cookie: authCookie,
        })
      ).status,
      400,
    );

    // 別クリップ配下の commentId は、そのクリップのコメントではないので 404
    eq(
      "clipId が一致しないコメントは 404",
      (
        await req(`/api/v1/clips/${deletedClipId}/comments/${target}`, {
          method: "DELETE",
          cookie: authCookie,
        })
      ).status,
      404,
    );

    eq(
      "投稿者本人は 204 で消せる",
      (await del(target, authCookie)).status,
      204,
    );
    eq("二重削除は 404", (await del(target, authCookie)).status, 404);

    const after = await req(`/api/v1/clips/${clipId}/comments?limit=100`);
    check(
      "削除したコメントは一覧から消える",
      !after.json.data.some((c: any) => c.id === target),
      after.json.data.map((c: any) => c.id),
    );

    const stillThere = await prisma.clipComment.findUnique({
      where: { id: BigInt(target) },
      select: { deletedAt: true },
    });
    check(
      "物理削除ではなく論理削除",
      stillThere !== null && stillThere.deletedAt !== null,
      stillThere,
    );

    if (ownerCookie) {
      const byOther = await post("所有者が消すコメント");
      eq(
        "クリップ所有者は他人のコメントを消せる（モデレーション）",
        (await del(byOther, ownerCookie)).status,
        204,
      );
    } else {
      console.log("  - 所有者セッションを作れずモデレーション確認はスキップ");
    }

    // 第三者（投稿者でもクリップ所有者でもない）は 403。
    // 権限境界の要なので、居なければ作ってでも検証する（finally で消す）。
    let third = users.find(
      (u) =>
        String(u.id) !== String(clip.userId) &&
        String(u.id) !== String(otherUserId),
    );
    if (!third) {
      const created = await prisma.user.create({
        data: {
          name: "smoke-third-user",
          email: `smoke-third-${Date.now()}@example.invalid`,
        },
        select: { id: true, name: true, email: true },
      });
      createdUserId = created.id;
      third = created;
      console.log(`  (第三者ユーザーを一時作成: ${created.id})`);
    }
    if (third) {
      const victim = await post("第三者が消せないコメント");
      const thirdCookie = `${COOKIE_NAME}=${await encode({
        token: {
          uid: String(third.id),
          sub: String(third.id),
          name: third.name,
          email: third.email,
        },
        secret: authSecret,
        salt: COOKIE_NAME,
      })}`;
      eq("第三者の削除は 403", (await del(victim, thirdCookie)).status, 403);
    } else {
      console.log("  - third user がいないため 403 の確認はスキップ");
    }
  }
  // ---- 通報 ---------------------------------------------------------------
  console.log("\n通報");
  {
    const ownerUser = users.find((u) => String(u.id) === String(clip.userId));
    const ownerCookie = ownerUser
      ? `${COOKIE_NAME}=${await encode({
          token: {
            uid: String(ownerUser.id),
            sub: String(ownerUser.id),
            name: ownerUser.name,
            email: ownerUser.email,
          },
          secret: authSecret,
          salt: COOKIE_NAME,
        })}`
      : null;

    // 通報対象は「自分以外」のコメントが要る。クリップ所有者名義で1件作る。
    const targetRow = await prisma.clipComment.create({
      data: {
        clipId: BigInt(clipId),
        userId: clip.userId,
        body: "通報対象",
      },
      select: { id: true },
    });
    createdCommentIds.push(targetRow.id);
    const target = Number(targetRow.id);

    const rep = (payload: unknown, cookie?: string) =>
      req(`/api/v1/clips/${clipId}/comments/${target}/reports`, {
        method: "POST",
        cookie,
        body: JSON.stringify(payload),
      });

    eq("Cookie 無しの通報は 401", (await rep({ reason: "spam" })).status, 401);
    eq(
      "未知の理由は 400",
      (await rep({ reason: "because" }, authCookie)).status,
      400,
    );
    eq("reason 欠落は 400", (await rep({ note: "x" }, authCookie)).status, 400);

    const ok = await rep(
      { reason: "spoiler", note: "  ネタバレ  " },
      authCookie,
    );
    eq("通報は 201", ok.status, 201);
    eq("commentId が返る", ok.json.commentId, target);
    check(
      "レスポンスのキーが OpenAPI どおり",
      JSON.stringify(Object.keys(ok.json).sort()) ===
        JSON.stringify(["commentId", "id"]),
      Object.keys(ok.json),
    );

    const stored = await prisma.clipCommentReport.findFirstOrThrow({
      where: { commentId: targetRow.id },
      select: { reason: true, note: true },
    });
    eq("reason が保存される", stored.reason, "spoiler");
    eq("note が trim される", stored.note, "ネタバレ");

    eq(
      "同じ人の二重通報は 409",
      (await rep({ reason: "spam" }, authCookie)).status,
      409,
    );

    if (ownerCookie) {
      eq(
        "自分のコメントは通報できない (400)",
        (await rep({ reason: "spam" }, ownerCookie)).status,
        400,
      );
    }

    eq(
      "存在しないコメントへの通報は 404",
      (
        await req(`/api/v1/clips/${clipId}/comments/999999999/reports`, {
          method: "POST",
          cookie: authCookie,
          body: JSON.stringify({ reason: "spam" }),
        })
      ).status,
      404,
    );

    // 通報一覧はクリップ所有者だけ
    eq(
      "通報一覧は Cookie 無しで 401",
      (await req(`/api/v1/clips/${clipId}/comment-reports`)).status,
      401,
    );
    eq(
      "所有者以外は 403",
      (
        await req(`/api/v1/clips/${clipId}/comment-reports`, {
          cookie: authCookie,
        })
      ).status,
      403,
    );

    if (ownerCookie) {
      const list = await req(`/api/v1/clips/${clipId}/comment-reports`, {
        cookie: ownerCookie,
      });
      eq("所有者は 200", list.status, 200);
      const row = list.json.data.find((r: any) => r.comment.id === target);
      check("通報されたコメントが載る", !!row, list.json.data);
      eq("件数が入る", row?.reportCount, 1);
      eq("通報理由が所有者へ届く", row?.recentReports?.[0]?.reason, "spoiler");
      eq("通報補足が所有者へ届く", row?.recentReports?.[0]?.note, "ネタバレ");
      check(
        "ReportedClipComment のキーが OpenAPI どおり",
        JSON.stringify(Object.keys(row ?? {}).sort()) ===
          JSON.stringify([
            "comment",
            "lastReportedAt",
            "recentReports",
            "reportCount",
          ]),
        Object.keys(row ?? {}),
      );

      const resolved = await req(
        `/api/v1/clips/${clipId}/comments/${target}/reports`,
        {
          method: "PATCH",
          cookie: ownerCookie,
          body: JSON.stringify({ resolution: "dismissed" }),
        },
      );
      eq("所有者は通報を問題なしとして解決できる", resolved.status, 204);
      const storedResolution = await prisma.clipCommentReport.findFirstOrThrow({
        where: { commentId: targetRow.id },
        select: { resolution: true, resolvedAt: true },
      });
      eq("解決理由が保存される", storedResolution.resolution, "dismissed");
      check("解決日時が保存される", storedResolution.resolvedAt != null);

      await req(`/api/v1/clips/${clipId}/comments/${target}`, {
        method: "DELETE",
        cookie: ownerCookie,
      });
      const after = await req(`/api/v1/clips/${clipId}/comment-reports`, {
        cookie: ownerCookie,
      });
      check(
        "解決済み・削除済みコメントの通報は一覧に出ない",
        !after.json.data.some((r: any) => r.comment.id === target),
        after.json.data.map((r: any) => r.comment.id),
      );
    }
  }
} catch (e) {
  fail++;
  failures.push(`EXCEPTION: ${(e as Error).message}`);
  console.error("\nEXCEPTION:", e);
} finally {
  // ---- 後始末 -------------------------------------------------------------
  console.log("\n後始末");
  if (createdCommentIds.length) {
    const r = await prisma.clipComment.deleteMany({
      where: { id: { in: createdCommentIds } },
    });
    console.log(`  投稿したコメントを物理削除: ${r.count} 件`);
  }
  if (deletedClipId != null) {
    await prisma.clipComment.deleteMany({
      where: { clipId: BigInt(deletedClipId) },
    });
    await prisma.clip.delete({ where: { id: BigInt(deletedClipId) } });
    console.log(`  スモーク用クリップを物理削除: ${deletedClipId}`);
  }
  if (createdUserId != null) {
    await prisma.clipComment.deleteMany({ where: { userId: createdUserId } });
    await prisma.user.delete({ where: { id: createdUserId } });
    console.log(`  一時作成した第三者ユーザーを物理削除: ${createdUserId}`);
  }
  await prisma.$disconnect();

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  if (failures.length) {
    console.log("失敗:");
    for (const f of failures) console.log("  -", f);
  }
  process.exitCode = fail === 0 ? 0 : 1;
}
