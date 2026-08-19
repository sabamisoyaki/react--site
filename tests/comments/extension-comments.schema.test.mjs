import assert from "node:assert/strict";
import { test } from "node:test";

// Using dynamic import to resolve TypeScript paths via tsx
const { extensionCommentListQuerySchema, extensionCommentCreateBodySchema } =
  await import("../../src/server/schemas/extension.schema.ts");

// biome-ignore lint/security/noSecrets: Schema name is a false positive.
test("extensionCommentListQuerySchema", async (t) => {
  const schema = extensionCommentListQuerySchema;

  await t.test("valid query parameters", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      cursor: "42",
      limit: "20",
    });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.cursor, 42);
      assert.strictEqual(result.data.limit, 20);
    }
  });

  await t.test("default limit", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.limit, 20);
      assert.strictEqual(result.data.cursor, undefined);
    }
  });

  await t.test("cursor must be positive", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      cursor: "0",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("cursor must not be negative", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      cursor: "-1",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("limit min boundary", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      limit: "1",
    });
    assert.strictEqual(result.success, true);
  });

  await t.test("limit min boundary - 0", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      limit: "0",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("limit max boundary", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      limit: "100",
    });
    assert.strictEqual(result.success, true);
  });

  await t.test("limit max boundary + 1", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      limit: "101",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("invalid uuid", () => {
    const result = schema.safeParse({
      extensionInstanceId: "not-a-uuid",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("missing extensionInstanceId", () => {
    const result = schema.safeParse({
      cursor: "42",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test(".strict() rejects unknown keys", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      unknownKey: "value",
    });
    assert.strictEqual(result.success, false);
  });
});

test("extensionCommentCreateBodySchema", async (t) => {
  const schema = extensionCommentCreateBodySchema;

  await t.test("valid body", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      body: "This is a comment",
    });
    assert.strictEqual(result.success, true);
  });

  await t.test("clientRequestId は任意の UUID", () => {
    const base = {
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      body: "comment",
    };
    assert.equal(
      schema.safeParse({
        ...base,
        clientRequestId: "550e8400-e29b-41d4-a716-446655440001",
      }).success,
      true,
    );
    assert.equal(
      schema.safeParse({ ...base, clientRequestId: "retry-1" }).success,
      false,
    );
  });

  await t.test("body min boundary", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      body: "a",
    });
    assert.strictEqual(result.success, true);
  });

  await t.test("body 500 characters", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      body: "a".repeat(500),
    });
    assert.strictEqual(result.success, true);
  });

  await t.test("body 501 characters", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      body: "a".repeat(501),
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("body with leading/trailing whitespace gets trimmed", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      body: "  hello  ",
    });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.body, "hello");
    }
  });

  await t.test("body empty after trim", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      body: "   ",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("invalid uuid", () => {
    const result = schema.safeParse({
      extensionInstanceId: "not-a-uuid",
      body: "comment",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("missing extensionInstanceId", () => {
    const result = schema.safeParse({
      body: "comment",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test("missing body", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
    });
    assert.strictEqual(result.success, false);
  });

  await t.test(".strict() rejects unknown keys", () => {
    const result = schema.safeParse({
      extensionInstanceId: "550e8400-e29b-41d4-a716-446655440000",
      body: "comment",
      unknownKey: "value",
    });
    assert.strictEqual(result.success, false);
  });
});
