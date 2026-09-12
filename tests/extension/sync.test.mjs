import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, test } from "node:test";

let state;
const token = "isolated-fixture-token";
const itemId = "c0bbf9d4-337b-45da-b7c5-44d45e8e5447";
const body = {
  items: [
    {
      clientItemId: itemId,
      type: "clip",
      payload: {
        service: "netflix",
        title: "Example",
        StartTime: 0,
        EndTime: 1,
        URL: "https://www.netflix.com/watch/1",
      },
    },
  ],
};
const tx = {
  $queryRaw: async (parts, ...values) => {
    const sql = parts.join("");
    if (sql.includes("FROM users"))
      return [
        { id: 100n, deletedAt: state.deletedDuringRequest ? new Date() : null },
      ];
    if (sql.includes("FROM extension_link_tokens"))
      return [
        {
          id: 1n,
          userId: 100n,
          expiresAt: new Date(Date.now() + 60000),
          usedAt: null,
        },
      ];
    if (sql.includes("FROM sync_receipts"))
      return state.preexisting ? [{ clientItemId: itemId }] : [];
    if (sql.includes("INSERT INTO sync_receipts")) {
      state.inserts++;
      state.attemptedIds.push(values[1]);
      assert.match(
        sql,
        /ON CONFLICT \(linked_extension_id, client_item_id\) DO NOTHING/,
      );
      return state.lostInsertRace ? [] : [{ clientItemId: itemId }];
    }
    if (sql.includes("UPDATE linked_extensions")) {
      state.activity++;
      return [{ id: 1n }];
    }
    throw new Error(`Unexpected transaction query: ${sql}`);
  },
  $executeRaw: async () => {
    state.otherWrites++;
  },
  clip: {
    create: async () => {
      state.clips++;
    },
  },
};
const prisma = {
  $transaction: async (callback) => callback(tx),
  $queryRaw: async () => [
    {
      id: 1n,
      userId: 100n,
      extensionInstanceId: "fixture",
      extensionAuthHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60000),
      revokedAt: null,
    },
  ],
  vod: { findFirst: async () => ({ id: 100n }) },
};
globalThis.prisma = prisma;
const services = await import("../../src/server/services/extensions.ts");
beforeEach(() => {
  state = {
    preexisting: false,
    lostInsertRace: false,
    deletedDuringRequest: false,
    inserts: 0,
    activity: 0,
    otherWrites: 0,
    clips: 0,
    attemptedIds: [],
  };
});

test("sync acknowledges a receipt inserted after its initial read without creating another clip", async () => {
  state.lostInsertRace = true;
  assert.deepEqual(await services.syncExtensionItems("fixture", token, body), {
    acceptedItemIds: [itemId],
  });
  assert.equal(state.inserts, 1);
  assert.equal(state.clips, 0);
  assert.equal(state.activity, 1);
});

test("new sync items create one clip and advance activity", async () => {
  assert.deepEqual(await services.syncExtensionItems("fixture", token, body), {
    acceptedItemIds: [itemId],
  });
  assert.equal(state.clips, 1);
  assert.equal(state.activity, 1);
});

test("an already acknowledged retry does not write another receipt or clip", async () => {
  state.preexisting = true;
  await services.syncExtensionItems("fixture", token, body);
  assert.equal(state.inserts, 0);
  assert.equal(state.clips, 0);
  assert.equal(state.activity, 1);
});

test("overlapping batches acquire receipts in UUID order while acknowledgements retain input order", async () => {
  const firstId = "10bbf9d4-337b-45da-b7c5-44d45e8e5447";
  const input = {
    items: [body.items[0], { ...body.items[0], clientItemId: firstId }],
  };
  assert.deepEqual(await services.syncExtensionItems("fixture", token, input), {
    acceptedItemIds: [itemId, firstId],
  });
  assert.deepEqual(state.attemptedIds, [firstId, itemId]);
});

for (const [name, action] of [
  ["sync", () => services.syncExtensionItems("fixture", token, body)],
  ["rotation", () => services.rotateExtensionAuthToken("fixture", token)],
  ["link issuance", () => services.issueExtensionLinkToken(100)],
  [
    "link consumption",
    () =>
      services.consumeLinkTokenAndLinkExtension({
        extensionInstanceId: "fixture",
        linkToken: token,
      }),
  ],
]) {
  test(`${name} rechecks a concurrently deleted user before any write`, async () => {
    state.deletedDuringRequest = true;
    await assert.rejects(action(), (error) => error.status === 401);
    assert.equal(
      state.clips + state.inserts + state.activity + state.otherWrites,
      0,
    );
  });
}
