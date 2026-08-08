// biome-ignore-all lint/security/noSecrets: Schema names and Japanese fixtures are false positives.

import assert from "node:assert/strict";
import { test } from "node:test";

// tsconfig paths を解決するため tsx 経由で読み込む（test:comments を参照）
const {
  clipCommentBodySchema,
  clipCommentCreateBodySchema,
  clipCommentListQuerySchema,
  clipCommentParamSchema,
} = await import("../../src/server/schemas/comments.schema.ts");
const { extensionCommentCreateBodySchema } = await import(
  "../../src/server/schemas/extension.schema.ts"
);
const { encodeCursor, decodeCursor } = await import(
  "../../src/server/http/pagination.ts"
);

test("clipCommentCreateBodySchema", async (t) => {
  const schema = clipCommentCreateBodySchema;

  await t.test("valid body", () => {
    assert.equal(schema.safeParse({ body: "いい場面" }).success, true);
  });

  await t.test("body 500 characters", () => {
    assert.equal(schema.safeParse({ body: "a".repeat(500) }).success, true);
  });

  await t.test("body 501 characters", () => {
    assert.equal(schema.safeParse({ body: "a".repeat(501) }).success, false);
  });

  await t.test("body is trimmed", () => {
    const result = schema.safeParse({ body: "  hello  " });
    assert.equal(result.success, true);
    assert.equal(result.data.body, "hello");
  });

  await t.test("body empty after trim", () => {
    assert.equal(schema.safeParse({ body: "   " }).success, false);
  });

  await t.test("newlines are preserved", () => {
    const result = schema.safeParse({ body: "一行目\n二行目" });
    assert.equal(result.success, true);
    assert.equal(result.data.body, "一行目\n二行目");
  });

  await t.test("missing body", () => {
    assert.equal(schema.safeParse({}).success, false);
  });

  await t.test(".strict() rejects unknown keys", () => {
    const result = schema.safeParse({ body: "x", clipId: 1 });
    assert.equal(result.success, false);
  });

  await t.test("extensionInstanceId is not accepted here", () => {
    // v1 は拡張の契約とは別物。拡張用のキーが混ざったら弾く。
    const result = schema.safeParse({
      body: "x",
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.equal(result.success, false);
  });
});

test("clip comment body rules are shared with the extension API", async (t) => {
  // 同じ clip_comments.body 列に書くので、長さ・trim の扱いが割れてはいけない。
  const uuid = "550e8400-e29b-41d4-a716-446655440000";

  await t.test("both accept 500 characters", () => {
    const value = "a".repeat(500);
    assert.equal(clipCommentBodySchema.safeParse(value).success, true);
    assert.equal(
      extensionCommentCreateBodySchema.safeParse({
        extensionInstanceId: uuid,
        body: value,
      }).success,
      true,
    );
  });

  await t.test("both reject 501 characters", () => {
    const value = "a".repeat(501);
    assert.equal(clipCommentBodySchema.safeParse(value).success, false);
    assert.equal(
      extensionCommentCreateBodySchema.safeParse({
        extensionInstanceId: uuid,
        body: value,
      }).success,
      false,
    );
  });

  await t.test("both trim to the same value", () => {
    const raw = "  hello  ";
    const site = clipCommentBodySchema.safeParse(raw);
    const extension = extensionCommentCreateBodySchema.safeParse({
      extensionInstanceId: uuid,
      body: raw,
    });
    assert.equal(site.data, extension.data.body);
  });
});

test("clipCommentListQuerySchema", async (t) => {
  const schema = clipCommentListQuerySchema;

  await t.test("default limit", () => {
    const result = schema.safeParse({});
    assert.equal(result.success, true);
    assert.equal(result.data.limit, 20);
    assert.equal(result.data.cursor, undefined);
  });

  await t.test("cursor is an opaque string", () => {
    const result = schema.safeParse({ cursor: "eyJjIjoiIn0", limit: "5" });
    assert.equal(result.success, true);
    assert.equal(result.data.cursor, "eyJjIjoiIn0");
    assert.equal(result.data.limit, 5);
  });

  await t.test("empty cursor is rejected", () => {
    assert.equal(schema.safeParse({ cursor: "" }).success, false);
  });

  await t.test("limit boundaries", () => {
    assert.equal(schema.safeParse({ limit: "1" }).success, true);
    assert.equal(schema.safeParse({ limit: "100" }).success, true);
    assert.equal(schema.safeParse({ limit: "0" }).success, false);
    assert.equal(schema.safeParse({ limit: "101" }).success, false);
  });

  await t.test(".strict() rejects unknown keys", () => {
    assert.equal(schema.safeParse({ unknownKey: "value" }).success, false);
  });
});

test("clipCommentParamSchema coerces the path segment", async (t) => {
  await t.test("numeric string", () => {
    const result = clipCommentParamSchema.safeParse({ clipId: "42" });
    assert.equal(result.success, true);
    assert.equal(result.data.clipId, 42);
  });

  await t.test("rejects 0, negative and non-numeric", () => {
    assert.equal(
      clipCommentParamSchema.safeParse({ clipId: "0" }).success,
      false,
    );
    assert.equal(
      clipCommentParamSchema.safeParse({ clipId: "-1" }).success,
      false,
    );
    assert.equal(
      clipCommentParamSchema.safeParse({ clipId: "abc" }).success,
      false,
    );
  });
});

test("comment cursor round-trip keeps the id the service filters on", async (t) => {
  await t.test("id survives encode/decode", () => {
    const createdAt = new Date("2026-08-06T01:23:45.000Z");
    const decoded = decodeCursor(encodeCursor(createdAt, 12345n));
    assert.equal(decoded.i, "12345");
    assert.equal(decoded.c, createdAt.toISOString());
  });

  await t.test("malformed cursor is rejected", () => {
    assert.throws(() => decodeCursor("not-a-cursor"), /Invalid cursor/);
  });

  await t.test("null and empty mean no cursor", () => {
    assert.equal(decodeCursor(null), null);
    assert.equal(decodeCursor(""), null);
  });
});
