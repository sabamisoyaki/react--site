// biome-ignore-all lint/security/noSecrets: Japanese fixtures and test literals are false positives.
// biome-ignore-all lint/suspicious/noExplicitAny: 任意形の JSON レスポンスを検査するテストハーネス。

/**
 * Phase 2 のリファクタ (assertClipIsActive / toCommentView / 本文スキーマ共通化) が
 * Phase 1 の拡張API 契約を壊していないかの回帰スモーク。
 * 作ったデータは finally で物理削除する。
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

const { prisma } = await import("@/server/db");

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:3000";

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
let fixtureClipId: bigint | null = null;
let fixtureUserId: bigint | null = null;
const createdCommentIds: bigint[] = [];

async function cleanupStep(label: string, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    fail++;
    const message = `${label}: ${(error as Error).message}`;
    failures.push(message);
    console.error(`  後始末失敗 ${message}`);
  }
}

async function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
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

try {
  const vod = await prisma.vod.findFirstOrThrow({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const fixtureUser = await prisma.user.create({
    data: {
      name: "extension-comment-smoke-user",
      email: `extension-comment-smoke-${Date.now()}-${randomUUID()}@example.invalid`,
    },
    select: { id: true },
  });
  fixtureUserId = fixtureUser.id;
  const clip = await prisma.clip.create({
    data: {
      userId: fixtureUser.id,
      vodId: vod.id,
      name: `拡張コメントスモーク ${randomUUID()}`,
      title: "Extension comment smoke fixture",
      startMs: 0,
      endMs: 60_000,
      url: "https://www.netflix.com/watch/1",
    },
    select: { id: true, userId: true },
  });
  fixtureClipId = clip.id;
  const clipId = Number(clip.id);

  const linked = await prisma.linkedExtension.create({
    data: {
      userId: clip.userId,
      extensionInstanceId: instanceId,
      extensionAuthHash: authHash,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true, lastSeenAt: true },
  });
  linkedId = linked.id;
  console.log(`fixtures: clip=${clipId}, linkedExtension=${linked.id}\n`);

  console.log("拡張 GET");
  {
    const r = await req(
      `/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}`,
    );
    eq("200 が返る", r.status, 200);
    eq("ok: true", r.json.ok, true);
    check(
      "封筒が {ok, clipId, comments, hasNext, nextCursor}",
      JSON.stringify(Object.keys(r.json).sort()) ===
        JSON.stringify(["clipId", "comments", "hasNext", "nextCursor", "ok"]),
      Object.keys(r.json),
    );
    eq("clipId が一致", r.json.clipId, clipId);

    eq(
      "Bearer 不正は 401",
      (
        await fetch(
          `${BASE}/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}`,
          { headers: { authorization: "Bearer wrong" } },
        )
      ).status,
      401,
    );
    eq(
      "Authorization 無しは 401",
      (
        await fetch(
          `${BASE}/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}`,
        )
      ).status,
      401,
    );
    eq(
      "extensionInstanceId 欠落は 400",
      (await req(`/api/extension/clips/${clipId}/comments`)).status,
      400,
    );
    eq(
      "存在しないクリップは 404",
      (
        await req(
          `/api/extension/clips/999999999/comments?extensionInstanceId=${instanceId}`,
        )
      ).status,
      404,
    );
  }

  console.log("\n拡張 POST");
  {
    const before = await prisma.linkedExtension.findUniqueOrThrow({
      where: { id: linked.id },
      select: { lastSeenAt: true },
    });

    const r = await req(`/api/extension/clips/${clipId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        extensionInstanceId: instanceId,
        body: "  拡張からの投稿  ",
      }),
    });
    eq("201 が返る", r.status, 201);
    eq("ok: true", r.json.ok, true);
    check("comment を包んで返す", !!r.json.comment, r.json);
    eq("body が trim される", r.json.comment?.body, "拡張からの投稿");
    check(
      "comment のキーが契約どおり",
      JSON.stringify(Object.keys(r.json.comment ?? {}).sort()) ===
        JSON.stringify([
          "atMs",
          "body",
          "clipId",
          "createdAt",
          "id",
          "userId",
          "username",
        ]),
      Object.keys(r.json.comment ?? {}),
    );
    eq("atMs 省略時は null", r.json.comment?.atMs, null);
    if (r.json.comment?.id) createdCommentIds.push(BigInt(r.json.comment.id));

    eq(
      "501 文字は 400 (共通スキーマ経由)",
      (
        await req(`/api/extension/clips/${clipId}/comments`, {
          method: "POST",
          body: JSON.stringify({
            extensionInstanceId: instanceId,
            body: "a".repeat(501),
          }),
        })
      ).status,
      400,
    );

    const ok500 = await req(`/api/extension/clips/${clipId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        extensionInstanceId: instanceId,
        body: "a".repeat(500),
      }),
    });
    eq("500 文字ちょうどは 201 (共通スキーマ経由)", ok500.status, 201);
    if (ok500.json.comment?.id)
      createdCommentIds.push(BigInt(ok500.json.comment.id));

    // 時刻比較は Prisma が書いて Prisma が読む値どうしで行う（ドライバをまたがない）
    const after = await prisma.linkedExtension.findUniqueOrThrow({
      where: { id: linked.id },
      select: { lastSeenAt: true },
    });
    check(
      "POST で last_seen_at が進む",
      after.lastSeenAt.getTime() > before.lastSeenAt.getTime(),
      { before: before.lastSeenAt, after: after.lastSeenAt },
    );

    const beforeGet = after.lastSeenAt;
    await req(
      `/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}`,
    );
    const afterGet = await prisma.linkedExtension.findUniqueOrThrow({
      where: { id: linked.id },
      select: { lastSeenAt: true },
    });
    eq(
      "GET では last_seen_at を更新しない",
      afterGet.lastSeenAt.getTime(),
      beforeGet.getTime(),
    );
  }

  console.log("\n時刻アンカー atMs（2026-08-06 解禁）");
  {
    const range = await prisma.clip.findUniqueOrThrow({
      where: { id: BigInt(clipId) },
      select: { startMs: true, endMs: true },
    });

    // 拡張から atMs 付きで投稿できる
    const posted = await req(`/api/extension/clips/${clipId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        extensionInstanceId: instanceId,
        body: "この場面",
        atMs: range.startMs,
      }),
    });
    eq("atMs 付きの投稿は 201", posted.status, 201);
    eq("atMs がそのまま返る", posted.json.comment?.atMs, range.startMs);
    if (posted.json.comment?.id)
      createdCommentIds.push(BigInt(posted.json.comment.id));

    const atEnd = await req(`/api/extension/clips/${clipId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        extensionInstanceId: instanceId,
        body: "終端",
        atMs: range.endMs,
      }),
    });
    eq("endMs ちょうども 201（両端を含む）", atEnd.status, 201);
    if (atEnd.json.comment?.id)
      createdCommentIds.push(BigInt(atEnd.json.comment.id));

    const oob = await req(`/api/extension/clips/${clipId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        extensionInstanceId: instanceId,
        body: "範囲外",
        atMs: range.endMs + 1,
      }),
    });
    eq("範囲外は 400", oob.status, 400);
    eq("code が AT_MS_OUT_OF_RANGE", oob.json.code, "AT_MS_OUT_OF_RANGE");

    const nullAnchor = await req(`/api/extension/clips/${clipId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        extensionInstanceId: instanceId,
        body: "全体宛て",
        atMs: null,
      }),
    });
    eq("atMs: null も 201", nullAnchor.status, 201);
    if (nullAnchor.json.comment?.id)
      createdCommentIds.push(BigInt(nullAnchor.json.comment.id));

    // v1 で付けた atMs も拡張API から見える（両API が同じ列を見ている）
    const viaV1 = await prisma.clipComment.create({
      data: {
        clipId: BigInt(clipId),
        userId: clip.userId,
        body: "v1 由来のアンカー",
        atMs: range.startMs,
      },
      select: { id: true },
    });
    createdCommentIds.push(viaV1.id);

    const r = await req(
      `/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}&limit=100`,
    );
    const row = r.json.comments.find((c: any) => c.id === Number(viaV1.id));
    check("v1 由来のコメントも拡張API に出る", !!row, r.json.comments);
    eq("一覧でも atMs が返る", row?.atMs, range.startMs);
    check(
      "atMs はキーとして常に存在する（値が無ければ null）",
      r.json.comments.every((c: any) => "atMs" in c),
      r.json.comments.map((c: any) => Object.keys(c)),
    );
    check(
      "ExtensionComment のキーが OpenAPI どおり",
      JSON.stringify(Object.keys(row ?? {}).sort()) ===
        JSON.stringify([
          "atMs",
          "body",
          "clipId",
          "createdAt",
          "id",
          "userId",
          "username",
        ]),
      Object.keys(row ?? {}),
    );
  }

  console.log("\n両API の一致");
  {
    const ext = await req(
      `/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}&limit=100`,
    );
    const v1 = await fetch(
      `${BASE}/api/v1/clips/${clipId}/comments?limit=100`,
    ).then((r) => r.json());

    const extIds = ext.json.comments.map((c: any) => c.id);
    const v1Ids = v1.data.map((c: any) => c.id);
    check(
      "同じコメントを同じ順で返す",
      JSON.stringify(extIds) === JSON.stringify(v1Ids),
      {
        extIds,
        v1Ids,
      },
    );
    check(
      "拡張の nextCursor は生の数値 or null（v1 の不透明文字列とは別形式）",
      ext.json.nextCursor === null || typeof ext.json.nextCursor === "number",
      ext.json.nextCursor,
    );
  }
} catch (e) {
  fail++;
  failures.push(`EXCEPTION: ${(e as Error).message}`);
  console.error("\nEXCEPTION:", e);
} finally {
  console.log("\n後始末");
  if (createdCommentIds.length) {
    await cleanupStep("コメントの物理削除", async () => {
      const r = await prisma.clipComment.deleteMany({
        where: { id: { in: createdCommentIds } },
      });
      console.log(`  コメントを物理削除: ${r.count} 件`);
    });
  }
  if (linkedId != null) {
    const id = linkedId;
    await cleanupStep("linked_extensionsの物理削除", async () => {
      await prisma.linkedExtension.delete({ where: { id } });
      console.log(`  linked_extensions を物理削除: ${id}`);
    });
  }
  if (fixtureClipId != null) {
    const id = fixtureClipId;
    await cleanupStep("専用クリップの物理削除", async () => {
      await prisma.clipComment.deleteMany({ where: { clipId: id } });
      await prisma.clip.delete({ where: { id } });
      console.log(`  専用クリップを物理削除: ${id}`);
    });
  }
  if (fixtureUserId != null) {
    const id = fixtureUserId;
    await cleanupStep("専用ユーザーの物理削除", async () => {
      await prisma.user.delete({ where: { id } });
      console.log(`  専用ユーザーを物理削除: ${id}`);
    });
  }
  await cleanupStep("Prisma切断", () => prisma.$disconnect());
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  if (failures.length) for (const f of failures) console.log("  -", f);
  process.exitCode = fail === 0 ? 0 : 1;
}
