import assert from "node:assert/strict";
import test from "node:test";

const { playlistCreateBodySchema, playlistUpdateBodySchema } = await import(
  "../../src/server/schemas/playlists.schema.ts"
);
const { parseJsonBody } = await import("../../src/server/http/validation.ts");
const { toErrorPayload } = await import("../../src/server/http/errors.ts");

for (const [operation, schema] of [
  ["create", playlistCreateBodySchema],
  ["update", playlistUpdateBodySchema],
]) {
  test(`playlist ${operation} rejects empty names with HTTP 400`, async () => {
    for (const name of ["", "   ", "\t\n\u3000", "a".repeat(256)]) {
      await assert.rejects(
        parseJsonBody({ json: async () => ({ name }) }, schema),
        (error) => toErrorPayload(error).status === 400,
      );
    }
  });

  test(`playlist ${operation} trims names and accepts 1 through 255 characters`, () => {
    for (const name of ["a", "a".repeat(255)]) {
      assert.deepEqual(schema.parse({ name: ` \t${name}\u3000` }), { name });
    }
    assert.equal(schema.safeParse({}).success, false);
    assert.equal(schema.safeParse({ name: "ok", extra: true }).success, false);
  });
}
