import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { z } from "zod";

const { createRouteHandlers } = await import("../../src/server/api/handler.ts");
const { parseJsonBody } = await import("../../src/server/http/validation.ts");
const site = "https://app.example";
process.env.AUTH_URL = site;
// Extension allow-lists must not expand the cookie-authenticated v1 boundary.
process.env.CLIP_API_ALLOWED_ORIGINS =
  "https://foreign.example,chrome-extension://*";

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  test(`${method} rejects cross-origin requests before any side effect`, async (t) => {
    t.mock.method(console, "error", () => {});
    let writes = 0;
    const handler = createRouteHandlers({
      [method]: () => {
        writes++;
        return new Response(null, { status: 204 });
      },
    })[method];
    for (const headers of [
      { origin: "https://foreign.example" },
      { origin: "https://app.example.attacker.example" },
      { origin: "https://other.app.example", "sec-fetch-site": "same-site" },
      { origin: "null" },
      { origin: "chrome-extension://example" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "none" },
      { origin: site, "sec-fetch-site": "cross-site" },
    ]) {
      const response = await handler(
        new NextRequest(`${site}/api/v1/example`, { method, headers }),
        { params: {} },
      );
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "ORIGIN_NOT_ALLOWED");
    }
    assert.equal(writes, 0);
  });
}

test("same-origin writes, reverse-proxy URLs and non-browser callers remain usable", async () => {
  const { POST } = createRouteHandlers({
    POST: () => new Response(null, { status: 204 }),
  });
  for (const headers of [
    { origin: site, "sec-fetch-site": "same-origin" },
    { origin: site },
    { "sec-fetch-site": "same-origin" },
    {},
  ]) {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/v1/example", {
        method: "POST",
        headers,
      }),
      { params: {} },
    );
    assert.equal(response.status, 204);
  }
});

test("public reads are unaffected by cross-origin write protection", async () => {
  const { GET } = createRouteHandlers({
    GET: () => Response.json({ ok: true }),
  });
  const response = await GET(
    new NextRequest(`${site}/api/v1/example`, {
      headers: {
        origin: "https://foreign.example",
        "sec-fetch-site": "cross-site",
      },
    }),
    { params: {} },
  );
  assert.equal(response.status, 200);
});

test("JSON mutations reject simple content types before parsing or writing", async (t) => {
  t.mock.method(console, "error", () => {});
  let writes = 0;
  const { POST } = createRouteHandlers({
    POST: async (req) => {
      await parseJsonBody(
        req,
        z.object({ clipId: z.number().int().positive() }),
      );
      writes++;
      return new Response(null, { status: 201 });
    },
  });
  for (const type of [
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "",
  ]) {
    const response = await POST(
      new NextRequest(`${site}/api/v1/example`, {
        method: "POST",
        headers: { "content-type": type },
        body: '{"clipId":1}',
      }),
      { params: {} },
    );
    assert.equal(response.status, 415);
  }
  assert.equal(writes, 0);
  for (const type of ["application/json", "Application/JSON; charset=utf-8"]) {
    const response = await POST(
      new NextRequest(`${site}/api/v1/example`, {
        method: "POST",
        headers: { origin: site, "content-type": type },
        body: '{"clipId":1}',
      }),
      { params: {} },
    );
    assert.equal(response.status, 201);
  }
  assert.equal(writes, 2);
});
