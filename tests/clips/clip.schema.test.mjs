import assert from "node:assert/strict";
import { test } from "node:test";

const { clipCreateBodySchema, clipUpdateBodySchema } = await import(
  "../../src/server/schemas/clips.schema.ts"
);
const { resolveClipRange } = await import("../../src/server/domain/clips.ts");

test("clipCreateBodySchema keeps a valid time range", () => {
  const base = {
    vodId: 1,
    name: "clip",
    title: "title",
    startMs: 1000,
    endMs: 2000,
    url: "https://www.netflix.com/watch/1",
  };
  assert.equal(clipCreateBodySchema.safeParse(base).success, true);
  assert.equal(
    clipCreateBodySchema.safeParse({ ...base, endMs: 1000 }).success,
    false,
  );
});

test("clipUpdateBodySchema rejects an invalid complete range", () => {
  assert.equal(
    clipUpdateBodySchema.safeParse({ startMs: 2000, endMs: 1000 }).success,
    false,
  );
  // A partial range is validated against the stored counterpart in the service.
  assert.equal(clipUpdateBodySchema.safeParse({ startMs: 2000 }).success, true);
});

test("partial clip updates are validated against the stored range", () => {
  const current = { startMs: 1000, endMs: 2000 };
  assert.deepEqual(resolveClipRange(current, { startMs: 1500 }), {
    startMs: 1500,
    endMs: 2000,
  });
  assert.equal(resolveClipRange(current, { startMs: 2500 }), null);
  assert.equal(resolveClipRange(current, { endMs: 500 }), null);
});
