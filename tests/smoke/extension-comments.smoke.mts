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
const createdCommentIds: bigint[] = [];

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
  const clip = await prisma.clip.findFirstOrThrow({
    where: { deletedAt: null },
    select: { id: true, userId: true },
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
          "body",
          "clipId",
          "createdAt",
          "id",
          "userId",
          "username",
        ]),
      Object.keys(r.json.comment ?? {}),
    );
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

  console.log("\nv1 で足したフィールドが拡張契約に漏れないこと");
  {
    // v1 経由で時刻アンカー付きのコメントを作り、拡張レスポンスに atMs が
    // 出てこないことを確認する。ExtensionComment は OpenAPI で
    // additionalProperties: false なので、漏れると拡張側の検証が壊れる。
    const range = await prisma.clip.findUniqueOrThrow({
      where: { id: BigInt(clipId) },
      select: { startMs: true },
    });
    const anchored = await prisma.clipComment.create({
      data: {
        clipId: BigInt(clipId),
        userId: clip.userId,
        body: "拡張契約チェック用",
        atMs: range.startMs,
      },
      select: { id: true },
    });
    createdCommentIds.push(anchored.id);

    const r = await req(
      `/api/extension/clips/${clipId}/comments?extensionInstanceId=${instanceId}&limit=100`,
    );
    const row = r.json.comments.find((c: any) => c.id === Number(anchored.id));
    check("対象コメントが拡張API にも出る", !!row, r.json.comments);
    check(
      "拡張レスポンスに atMs が含まれない",
      row != null && !("atMs" in row),
      row,
    );
    check(
      "拡張の ClipComment キーは Phase 1 のまま",
      JSON.stringify(Object.keys(row ?? {}).sort()) ===
        JSON.stringify([
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
