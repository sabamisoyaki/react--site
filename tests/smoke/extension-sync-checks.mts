// biome-ignore-all lint/suspicious/noExplicitAny: The transaction proxy injects a missed receipt read into an isolated DB.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);

export async function runExtensionSyncChecks(prisma: PrismaClient) {
  const services =
    require("@/server/services/extensions") as typeof import("@/server/services/extensions");
  const { deleteUser } =
    require("@/server/services/users") as typeof import("@/server/services/users");
  const { extensionSyncBodySchema } =
    require("@/server/schemas/extension.schema") as typeof import("@/server/schemas/extension.schema");
  const { createExtensionClipComment } =
    require("@/server/services/comments") as typeof import("@/server/services/comments");
  await prisma.user.create({ data: { id: 200, name: "Extension fixture" } });
  const extensionInstanceId = randomUUID();
  const link = await services.issueExtensionLinkToken(200);
  const linked = await services.consumeLinkTokenAndLinkExtension({
    extensionInstanceId,
    linkToken: link.linkToken,
  });
  const input = extensionSyncBodySchema.parse({
    extensionInstanceId,
    items: [
      {
        clientItemId: randomUUID(),
        type: "clip",
        payload: {
          service: "netflix",
          title: "Sync fixture",
          StartTime: 0,
          EndTime: 1,
          URL: "https://www.netflix.com/watch/1",
        },
      },
    ],
  });
  const sync = () =>
    services.syncExtensionItems(
      extensionInstanceId,
      linked.extensionAuthToken,
      input,
    );
  assert.equal((await sync()).acceptedItemIds.length, 1);
  assert.equal((await sync()).acceptedItemIds.length, 1);
  assert.equal(await prisma.clip.count({ where: { userId: 200 } }), 1);

  // Emulate the read/insert race: the winning transaction is already committed,
  // but this request's initial receipt read saw no row. INSERT still runs against
  // the real unique constraint, and the following activity UPDATE must succeed.
  const transaction = prisma.$transaction;
  let inserts = 0;
  (prisma as any).$transaction = (callback: any) =>
    transaction.call(prisma, (tx: any) =>
      callback(
        new Proxy(tx, {
          get(target, key) {
            if (key !== "$queryRaw") return target[key];
            return (parts: TemplateStringsArray, ...values: unknown[]) => {
              const sql = parts.join("");
              if (sql.includes("FROM sync_receipts"))
                return Promise.resolve([]);
              if (sql.includes("INSERT INTO sync_receipts")) inserts++;
              return target.$queryRaw(parts, ...values);
            };
          },
        }),
      ),
    );
  try {
    assert.equal((await sync()).acceptedItemIds.length, 1);
    assert.equal(inserts, 1);
    assert.equal(await prisma.clip.count({ where: { userId: 200 } }), 1);
  } finally {
    prisma.$transaction = transaction;
  }
  console.log(
    "PASS: fresh sync, retries and a missed receipt read create exactly one clip; transaction remains usable",
  );

  const unused = await services.issueExtensionLinkToken(200);
  await prisma.user.update({
    where: { id: 200 },
    data: { deletedAt: new Date() },
  });
  const unauthorized = (error: any) => error.status === 401;
  await assert.rejects(sync(), unauthorized);
  await assert.rejects(services.issueExtensionLinkToken(200), unauthorized);
  await assert.rejects(
    services.consumeLinkTokenAndLinkExtension({
      extensionInstanceId: randomUUID(),
      linkToken: unused.linkToken,
    }),
    unauthorized,
  );
  await assert.rejects(
    services.rotateExtensionAuthToken(
      extensionInstanceId,
      linked.extensionAuthToken,
    ),
    unauthorized,
  );
  await assert.rejects(
    createExtensionClipComment(
      extensionInstanceId,
      linked.extensionAuthToken,
      101,
      "Blocked",
    ),
    unauthorized,
  );
  assert.equal(await prisma.clip.count({ where: { userId: 200 } }), 1);
  console.log(
    "PASS: soft-deleted users cannot issue/consume links, sync, rotate or post comments",
  );

  await prisma.user.create({ data: { id: 201, name: "Deletion fixture" } });
  const deletionLink = await services.issueExtensionLinkToken(201);
  await services.consumeLinkTokenAndLinkExtension({
    extensionInstanceId: randomUUID(),
    linkToken: deletionLink.linkToken,
  });
  await services.issueExtensionLinkToken(201);
  await deleteUser(201, 201);
  assert.equal(
    await prisma.linkedExtension.count({
      where: { userId: 201, revokedAt: null },
    }),
    0,
  );
  assert.equal(
    await prisma.extensionLinkToken.count({
      where: { userId: 201, usedAt: null },
    }),
    0,
  );
  console.log(
    "PASS: account soft deletion revokes linked extensions and unused link tokens",
  );
}
