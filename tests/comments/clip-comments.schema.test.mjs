// biome-ignore-all lint/security/noSecrets: Schema names and Japanese fixtures are false positives.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { sourceSection } from "../helpers/source.mjs";

// tsconfig paths を解決するため tsx 経由で読み込む（npm test は全ファイルを tsx で回す）
const {
  CLIP_COMMENT_REPORT_REASONS,
  clipCommentBodySchema,
  clipCommentCreateBodySchema,
  clipCommentIdParamSchema,
  clipCommentListQuerySchema,
  clipCommentParamSchema,
  clipCommentReportCreateBodySchema,
  clipCommentReportListQuerySchema,
  clipCommentReportsResolveBodySchema,
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

  await t.test(
    "body limit counts Unicode code points, not UTF-16 units",
    () => {
      const accepted = schema.safeParse({ body: "😀".repeat(500) });
      assert.equal(accepted.success, true);
      assert.equal(accepted.data.body, "😀".repeat(500));
      assert.equal(schema.safeParse({ body: "😀".repeat(501) }).success, false);
    },
  );

  await t.test("body limit is checked before trim", () => {
    assert.equal(
      schema.safeParse({ body: ` ${"a".repeat(499)}` }).success,
      true,
    );
    assert.equal(
      schema.safeParse({ body: ` ${"a".repeat(500)}` }).success,
      false,
    );
  });

  await t.test("body is trimmed", () => {
    const result = schema.safeParse({ body: "  hello  " });
    assert.equal(result.success, true);
    assert.equal(result.data.body, "hello");
  });

  await t.test("body empty after trim", () => {
    assert.equal(schema.safeParse({ body: "   " }).success, false);
  });

  await t.test(
    "body containing NUL is rejected before reaching PostgreSQL",
    () => {
      assert.equal(
        schema.safeParse({ body: "before\u0000after" }).success,
        false,
      );
    },
  );

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

  await t.test("atMs は省略できる（クリップ全体へのコメント）", () => {
    const result = schema.safeParse({ body: "x" });
    assert.equal(result.success, true);
    assert.equal(result.data.atMs, undefined);
  });

  await t.test("atMs は null を受ける", () => {
    const result = schema.safeParse({ body: "x", atMs: null });
    assert.equal(result.success, true);
    assert.equal(result.data.atMs, null);
  });

  await t.test("atMs は 0 以上の整数", () => {
    assert.equal(schema.safeParse({ body: "x", atMs: 0 }).success, true);
    assert.equal(schema.safeParse({ body: "x", atMs: 12_345 }).success, true);
    assert.equal(schema.safeParse({ body: "x", atMs: -1 }).success, false);
    assert.equal(schema.safeParse({ body: "x", atMs: 1.5 }).success, false);
    assert.equal(schema.safeParse({ body: "x", atMs: "10" }).success, false);
  });

  await t.test("clientRequestId は任意の UUID", () => {
    assert.equal(
      schema.safeParse({
        body: "x",
        clientRequestId: "550e8400-e29b-41d4-a716-446655440000",
      }).success,
      true,
    );
    assert.equal(
      schema.safeParse({ body: "x", clientRequestId: "retry-1" }).success,
      false,
    );
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
    // 両方が失敗すると data が両方 undefined になり、同値比較だけでは素通りする。
    // 期待値そのものを固定して、両APIから trim が消えた場合も落ちるようにする。
    assert.equal(site.success, true);
    assert.equal(extension.success, true);
    assert.equal(site.data, "hello");
    assert.equal(extension.data.body, "hello");
  });

  await t.test("both reject NUL", () => {
    const value = "comment\u0000body";
    assert.equal(clipCommentBodySchema.safeParse(value).success, false);
    assert.equal(
      extensionCommentCreateBodySchema.safeParse({
        extensionInstanceId: uuid,
        body: value,
      }).success,
      false,
    );
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
    assert.equal(
      clipCommentParamSchema.safeParse({ clipId: "9007199254740992" }).success,
      false,
    );
  });
});

test("clipCommentIdParamSchema", async (t) => {
  await t.test("both ids are coerced", () => {
    const result = clipCommentIdParamSchema.safeParse({
      clipId: "42",
      commentId: "7",
    });
    assert.equal(result.success, true);
    assert.equal(result.data.clipId, 42);
    assert.equal(result.data.commentId, 7);
  });

  await t.test("commentId must be present", () => {
    assert.equal(
      clipCommentIdParamSchema.safeParse({ clipId: "42" }).success,
      false,
    );
  });

  await t.test("commentId rejects 0, negative and non-numeric", () => {
    for (const commentId of ["0", "-1", "abc"]) {
      assert.equal(
        clipCommentIdParamSchema.safeParse({ clipId: "42", commentId }).success,
        false,
        `commentId=${commentId}`,
      );
    }
  });
});

test("clipCommentReportCreateBodySchema", async (t) => {
  const schema = clipCommentReportCreateBodySchema;

  await t.test("宣言された理由をすべて受ける", () => {
    for (const reason of CLIP_COMMENT_REPORT_REASONS) {
      assert.equal(schema.safeParse({ reason }).success, true, reason);
    }
  });

  await t.test("理由の一覧は OpenAPI の enum と一致", () => {
    // ベタ書き配列と比べるだけでは、OpenAPI 側だけが変わったときに気づけない。
    // 実際に openapi/v1.yaml から enum を読み出して突き合わせる。
    const spec = readFileSync("openapi/v1.yaml", "utf8");
    const expected = [...CLIP_COMMENT_REPORT_REASONS];

    // ClipCommentReportCreate（ブロック形式の enum）
    const createSchema = sourceSection(
      spec,
      "    ClipCommentReportCreate:",
      "\n    ClipCommentReport",
    );
    const blockEnum = [];
    for (const line of createSchema
      .slice(createSchema.indexOf("enum:"))
      .split("\n")
      .slice(1)) {
      // 連続する list item だけを取る。次のキーに入ったら打ち切る
      // （打ち切らないと note.type の [- string, - "null"] まで拾ってしまう）。
      const item = line.match(/^\s+- (\S.*)$/);
      if (!item) break;
      blockEnum.push(item[1].trim());
    }
    assert.deepEqual(blockEnum, expected, "ClipCommentReportCreate の enum");

    // recentReports 内（フロー形式の enum）
    const flowMatch = spec.match(
      /reason:\s*\n\s*type: string\s*\n\s*enum: \[([^\]]+)\]/,
    );
    assert.notEqual(flowMatch, null, "フロー形式の reason enum が見つからない");
    assert.deepEqual(
      flowMatch[1].split(",").map((value) => value.trim()),
      expected,
      "recentReports[].reason の enum",
    );
  });

  await t.test("未知の理由は拒否", () => {
    assert.equal(schema.safeParse({ reason: "because" }).success, false);
    assert.equal(schema.safeParse({ reason: "" }).success, false);
  });

  await t.test("reason は必須", () => {
    assert.equal(schema.safeParse({}).success, false);
    assert.equal(schema.safeParse({ note: "x" }).success, false);
  });

  await t.test("note は任意で trim される", () => {
    const result = schema.safeParse({ reason: "other", note: "  ひどい  " });
    assert.equal(result.success, true);
    assert.equal(result.data.note, "ひどい");
  });

  await t.test("note は null を受ける", () => {
    const result = schema.safeParse({ reason: "spam", note: null });
    assert.equal(result.success, true);
    assert.equal(result.data.note, null);
  });

  await t.test("note の上限は 500 文字", () => {
    assert.equal(
      schema.safeParse({ reason: "spam", note: "a".repeat(500) }).success,
      true,
    );
    assert.equal(
      schema.safeParse({ reason: "spam", note: "a".repeat(501) }).success,
      false,
    );
  });

  await t.test("note の上限は Unicode コードポイントで trim 前に判定", () => {
    const accepted = schema.safeParse({
      reason: "spam",
      note: "😀".repeat(500),
    });
    assert.equal(accepted.success, true);
    assert.equal(accepted.data.note, "😀".repeat(500));
    assert.equal(
      schema.safeParse({ reason: "spam", note: "😀".repeat(501) }).success,
      false,
    );
    assert.equal(
      schema.safeParse({ reason: "spam", note: ` ${"a".repeat(500)}` }).success,
      false,
    );
  });

  await t.test("note に NUL は使用できない", () => {
    assert.equal(
      schema.safeParse({ reason: "other", note: "before\u0000after" }).success,
      false,
    );
  });

  await t.test(".strict() rejects unknown keys", () => {
    assert.equal(
      schema.safeParse({ reason: "spam", commentId: 1 }).success,
      false,
    );
  });
});

test("clip comment report list and resolve schemas", () => {
  const list = clipCommentReportListQuerySchema.safeParse({ limit: "100" });
  assert.equal(list.success, true);
  assert.equal(list.data.limit, 100);
  assert.equal(
    clipCommentReportsResolveBodySchema.safeParse({ resolution: "dismissed" })
      .success,
    true,
  );
  assert.equal(
    clipCommentReportsResolveBodySchema.safeParse({ resolution: "deleted" })
      .success,
    false,
  );
  assert.equal(
    clipCommentReportsResolveBodySchema.safeParse({
      resolution: "comment_deleted",
    }).success,
    false,
  );
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
    const malformedId = Buffer.from(
      JSON.stringify({ c: new Date().toISOString(), i: "1oops", v: 1 }),
    ).toString("base64url");
    assert.throws(() => decodeCursor(malformedId), /Invalid cursor/);
  });

  await t.test("null and empty mean no cursor", () => {
    assert.equal(decodeCursor(null), null);
    assert.equal(decodeCursor(""), null);
  });
});

test("OpenAPI comment auth and extension auth match the implemented routes", () => {
  const spec = readFileSync("openapi/v1.yaml", "utf8");
  // 目印が消えた／paths が並び替えられた場合、生の indexOf だと空スライスになり
  // doesNotMatch が素通りする。sourceSection は見つからない時点で落ちる。
  const sitePost = sourceSection(
    spec,
    "operationId: clips.comments.create",
    '"/clips/{clipId}/comments/{commentId}"',
  );
  assert.match(sitePost, /nextAuthSession/);
  assert.doesNotMatch(sitePost, /bearerAuth/);

  const extensionPost = sourceSection(
    spec,
    "operationId: extension.clips.comments.create",
    "operationId: users.meGet",
  );
  assert.match(extensionPost, /extensionBearerAuth/);
  assert.doesNotMatch(
    spec,
    /ExtensionComment には含まれない（Phase 1 契約を維持するため）/,
  );
});

test("OpenAPI documents raw comment text limits and mutation conflicts", () => {
  const spec = readFileSync("openapi/v1.yaml", "utf8");
  // 出現回数を固定すると、4 つ目のフィールドを「正しく」書いたときに落ちてしまう。
  // 上限を持つスキーマそれぞれが raw-input ルールを書いていることを個別に確認する。
  const rawInputRule = /送信された未加工入力で最大 500 Unicode コードポイント/;
  const limitedSchemas = [
    ["ExtensionCommentCreateRequest", "    ClipComment:"],
    ["ClipCommentCreate", "    ClipCommentReportCreate:"],
    ["ClipCommentReportCreate", "    ClipCommentReportCreated:"],
  ];
  for (const [schemaName, nextSchema] of limitedSchemas) {
    const section = sourceSection(spec, `    ${schemaName}:`, nextSchema);
    assert.match(section, /maxLength: 500/, schemaName);
    assert.match(section, rawInputRule, schemaName);
  }

  const commentDelete = sourceSection(
    spec,
    "operationId: clips.comments.delete",
    '"/clips/{clipId}/comments/{commentId}/reports"',
  );
  assert.match(
    commentDelete,
    /"409":\s+\$ref: "#\/components\/responses\/Conflict"/,
  );

  const reportPatch = sourceSection(
    spec,
    "operationId: clips.comments.reports.resolve",
    '"/clips/{clipId}/comment-reports"',
  );
  assert.match(
    reportPatch,
    /"409":\s+\$ref: "#\/components\/responses\/Conflict"/,
  );
});
