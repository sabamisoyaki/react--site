// biome-ignore-all lint/security/noSecrets: Static API URLs and cursor fixtures are not credentials.
import assert from "node:assert/strict";
import { test } from "node:test";

const {
  CommentApiError,
  createClipComment,
  deleteClipComment,
  dismissClipCommentReports,
  listClipCommentReports,
  listClipComments,
  reportClipComment,
} = await import("../../src/lib/comments/client.ts");

test("comment pages preserve cursors, cancellation and report page size", async (t) => {
  const controller = new AbortController();
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    return Response.json({ data: [{ id: 3 }], meta: { nextCursor: "next" } });
  });

  assert.deepEqual(
    await listClipComments("12", { signal: controller.signal }),
    {
      data: [{ id: 3 }],
      nextCursor: "next",
    },
  );
  await listClipComments("12", { cursor: "a+/=" });
  await listClipCommentReports("12", { signal: controller.signal });
  await listClipCommentReports("12", { cursor: "a+/=" });

  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      "/api/v1/clips/12/comments",
      "/api/v1/clips/12/comments?cursor=a%2B%2F%3D",
      "/api/v1/clips/12/comment-reports?limit=100",
      "/api/v1/clips/12/comment-reports?cursor=a%2B%2F%3D&limit=100",
    ],
  );
  assert.equal(requests[0].options.signal, controller.signal);
  assert.equal(requests[2].options.signal, controller.signal);
});

test("missing page data becomes an empty final page", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: null }));
  for (const list of [listClipComments, listClipCommentReports]) {
    assert.deepEqual(await list("12"), { data: [], nextCursor: null });
  }
});

test("comment creation preserves the caller's retry key and returns the comment", async (t) => {
  const input = { body: "hello", clientRequestId: "retry-key" };
  const created = { id: 4, body: input.body };
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    return Response.json(created, { status: 201 });
  });
  assert.deepEqual(await createClipComment("12", input), created);
  await createClipComment("12", input);
  for (const { url, options } of requests) {
    assert.equal(url, "/api/v1/clips/12/comments");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), input);
  }
});

test("only ALREADY_REPORTED conflicts count as completed reports", async (t) => {
  const responses = [
    Response.json({}, { status: 201 }),
    Response.json({ code: "ALREADY_REPORTED" }, { status: 409 }),
    Response.json({ code: "TRANSACTION_CONFLICT" }, { status: 409 }),
    new Response("not json", { status: 409 }),
  ];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/v1/clips/12/comments/4/reports");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { reason: "spam", note: null });
    return responses.shift();
  });
  const report = () =>
    reportClipComment("12", 4, { reason: "spam", note: null });
  assert.equal(await report(), "created");
  assert.equal(await report(), "already-reported");
  await assert.rejects(
    report,
    (error) =>
      error instanceof CommentApiError &&
      error.status === 409 &&
      error.code === "TRANSACTION_CONFLICT",
  );
  await assert.rejects(
    report,
    (error) => error instanceof CommentApiError && error.status === 409,
  );
});

test("deletion accepts an already deleted comment and an empty success body", async (t) => {
  const responses = [
    new Response(null, { status: 204 }),
    new Response(null, { status: 404 }),
  ];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/v1/clips/12/comments/4");
    assert.equal(options.method, "DELETE");
    return responses.shift();
  });
  await deleteClipComment("12", 4);
  await deleteClipComment("12", 4);
});

test("report dismissal sends its resolution and accepts an empty success body", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/v1/clips/12/comments/4/reports");
    assert.equal(options.method, "PATCH");
    assert.deepEqual(JSON.parse(options.body), { resolution: "dismissed" });
    return new Response(null, { status: 204 });
  });
  await dismissClipCommentReports("12", 4);
});

test("API errors retain HTTP status for the modal's operation-specific messages", async (t) => {
  for (const status of [401, 403, 404, 429, 500]) {
    await t.test(String(status), async (t) => {
      t.mock.method(
        globalThis,
        "fetch",
        async () => new Response(null, { status }),
      );
      const operations = [
        () => listClipComments("12"),
        () => listClipCommentReports("12"),
        () =>
          createClipComment("12", {
            body: "hello",
            clientRequestId: "retry-key",
          }),
        () => reportClipComment("12", 4, { reason: "other", note: "context" }),
        () => dismissClipCommentReports("12", 4),
        ...(status === 404 ? [] : [() => deleteClipComment("12", 4)]),
      ];
      for (const operation of operations) {
        await assert.rejects(
          operation,
          (error) =>
            error instanceof CommentApiError && error.status === status,
        );
      }
    });
  }
});

test("abort and transport errors reach the caller unchanged", async (t) => {
  for (const error of [
    new DOMException("Aborted", "AbortError"),
    new TypeError("Offline"),
  ]) {
    await t.test(error.name, async (t) => {
      t.mock.method(globalThis, "fetch", async () => {
        throw error;
      });
      await assert.rejects(
        () => listClipComments("12"),
        (actual) => actual === error,
      );
      await assert.rejects(
        () => listClipCommentReports("12"),
        (actual) => actual === error,
      );
      await assert.rejects(
        () =>
          createClipComment("12", {
            body: "hello",
            clientRequestId: "retry-key",
          }),
        (actual) => actual === error,
      );
    });
  }
});
