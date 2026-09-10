import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "@/server/http/errors";
import { shareLockUsersByIdOrder } from "@/server/repositories/users";
import type {
  ExtensionLinkBody,
  ExtensionSyncBody,
} from "@/server/schemas/extension.schema";
import { buildLegacyClipCreateData } from "@/server/services/legacy-clips";

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;
const EXTENSION_AUTH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type LinkedExtensionRecord = {
  id: number;
  userId: number;
  extensionInstanceId: string;
  extensionAuthHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

async function requireActiveExtensionUser(
  userId: number | bigint,
  tx: Prisma.TransactionClient,
) {
  // Acquire the user lock before any extension/clip writes, matching deleteUser.
  // Authentication alone would leave a gap for a concurrent account deletion.
  const [user] = await shareLockUsersByIdOrder([userId], tx);
  if (!user || user.deletedAt !== null) throw new UnauthorizedError();
}

export async function issueExtensionLinkToken(userId: number) {
  const linkToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(linkToken);
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await requireActiveExtensionUser(userId, tx);
    await tx.$executeRaw`
      INSERT INTO extension_link_tokens (user_id, token_hash, expires_at)
      VALUES (${userId}, ${tokenHash}, ${expiresAt})
    `;
  });

  return { linkToken, expiresAt };
}

export async function consumeLinkTokenAndLinkExtension(
  input: ExtensionLinkBody,
) {
  const tokenHash = hashOpaqueToken(input.linkToken);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const records = await tx.$queryRaw<
      Array<{
        id: number;
        userId: number;
        expiresAt: Date;
        usedAt: Date | null;
      }>
    >`
      SELECT
        id,
        user_id AS "userId",
        expires_at AS "expiresAt",
        used_at AS "usedAt"
      FROM extension_link_tokens
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `;

    const tokenRecord = records[0];
    if (!tokenRecord) throw new UnauthorizedError("Invalid link token");
    await requireActiveExtensionUser(tokenRecord.userId, tx);
    if (tokenRecord.usedAt) throw new ConflictError("Link token already used");
    if (tokenRecord.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestError("Link token expired", "LINK_TOKEN_EXPIRED");
    }

    const consumed = await tx.$queryRaw<Array<{ id: number }>>`
      UPDATE extension_link_tokens
      SET used_at = ${now}
      WHERE id = ${tokenRecord.id} AND used_at IS NULL
      RETURNING id
    `;

    if (consumed.length !== 1) {
      throw new ConflictError("Link token already used");
    }

    const extensionAuthToken = generateOpaqueToken();
    const extensionAuthHash = hashOpaqueToken(extensionAuthToken);
    const expiresAt = new Date(now.getTime() + EXTENSION_AUTH_TOKEN_TTL_MS);

    await tx.$executeRaw`
      INSERT INTO linked_extensions (
        user_id,
        extension_instance_id,
        extension_auth_hash,
        linked_at,
        last_seen_at,
        expires_at,
        revoked_at
      )
      VALUES (
        ${tokenRecord.userId},
        ${input.extensionInstanceId}::uuid,
        ${extensionAuthHash},
        ${now},
        ${now},
        ${expiresAt},
        NULL
      )
      ON CONFLICT (extension_instance_id) WHERE revoked_at IS NULL
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        extension_auth_hash = EXCLUDED.extension_auth_hash,
        linked_at = EXCLUDED.linked_at,
        last_seen_at = EXCLUDED.last_seen_at,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL
    `;

    return { extensionAuthToken, expiresAt };
  });
}

export async function rotateExtensionAuthToken(
  extensionInstanceId: string,
  currentToken: string,
) {
  const linkedExtension = await authenticateLinkedExtension(
    extensionInstanceId,
    currentToken,
  );

  const extensionAuthToken = generateOpaqueToken();
  const extensionAuthHash = hashOpaqueToken(extensionAuthToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXTENSION_AUTH_TOKEN_TTL_MS);

  // 旧ハッシュ一致を条件にした CAS 更新。並行リフレッシュは片方だけ成功し、
  // 負けた側(0行更新)は 401 で拡張側の再連携導線に落とす。
  const rotated = await prisma.$transaction(async (tx) => {
    await requireActiveExtensionUser(linkedExtension.userId, tx);
    return tx.$queryRaw<Array<{ id: number }>>`
    UPDATE linked_extensions
    SET
      extension_auth_hash = ${extensionAuthHash},
      expires_at = ${expiresAt},
      last_seen_at = GREATEST(last_seen_at, ${now})
    WHERE id = ${linkedExtension.id}
      AND extension_auth_hash = ${linkedExtension.extensionAuthHash}
      AND revoked_at IS NULL
      AND expires_at > ${now}
    RETURNING id
  `;
  });

  if (rotated.length !== 1) {
    throw new UnauthorizedError("Unauthorized");
  }

  return { extensionAuthToken, expiresAt };
}

export async function syncExtensionItems(
  extensionInstanceId: string,
  extensionAuthToken: string,
  body: ExtensionSyncBody,
) {
  const linkedExtension = await authenticateLinkedExtension(
    extensionInstanceId,
    extensionAuthToken,
  );

  const clipInputs = await Promise.all(
    body.items.map(async (item) => ({
      clientItemId: item.clientItemId,
      type: item.type,
      createdAt: item.createdAt,
      data: await buildLegacyClipCreateData(item.payload),
    })),
  );
  // Overlapping batches must acquire receipt locks in the same order, even if
  // clients send the items in reverse order (otherwise ON CONFLICT can deadlock).
  clipInputs.sort((a, b) =>
    a.clientItemId.toLowerCase().localeCompare(b.clientItemId.toLowerCase()),
  );

  await prisma.$transaction(async (tx) => {
    await requireActiveExtensionUser(linkedExtension.userId, tx);
    const existingReceipts =
      clipInputs.length === 0
        ? []
        : await tx.$queryRaw<Array<{ clientItemId: string }>>`
            SELECT client_item_id AS "clientItemId"
            FROM sync_receipts
            WHERE linked_extension_id = ${linkedExtension.id}
              AND client_item_id = ANY(${clipInputs.map((item) => item.clientItemId)}::uuid[])
          `;

    const receiptIds = new Set(
      existingReceipts.map((item) => item.clientItemId),
    );

    for (const item of clipInputs) {
      if (receiptIds.has(item.clientItemId)) {
        continue;
      }

      // Another request may have inserted this receipt since the initial read.
      // A constraint exception aborts PostgreSQL's transaction even if caught.
      const inserted = await tx.$queryRaw<Array<{ clientItemId: string }>>`
        INSERT INTO sync_receipts (linked_extension_id, client_item_id, item_type)
        VALUES (${linkedExtension.id}, ${item.clientItemId}::uuid, ${item.type})
        ON CONFLICT (linked_extension_id, client_item_id) DO NOTHING
        RETURNING client_item_id AS "clientItemId"
      `;
      receiptIds.add(item.clientItemId);
      if (inserted.length === 0) {
        continue;
      }

      await tx.clip.create({
        data: {
          userId: linkedExtension.userId,
          ...item.data,
          ...(item.createdAt ? { createdAt: item.createdAt } : {}),
        },
      });
    }

    const activityAt = new Date();
    const updated = await tx.$queryRaw<Array<{ id: bigint }>>`
      UPDATE linked_extensions
      SET last_seen_at = GREATEST(last_seen_at, ${activityAt})
      WHERE id = ${linkedExtension.id}
        AND extension_auth_hash = ${linkedExtension.extensionAuthHash}
        AND revoked_at IS NULL
        AND expires_at > ${activityAt}
      RETURNING id
    `;
    if (updated.length !== 1) throw new UnauthorizedError("Unauthorized");
  });

  // Preserve the caller's order in the acknowledgement. All items are accepted
  // only once the transaction commits; any failure rolls back the whole batch.
  return { acceptedItemIds: body.items.map((item) => item.clientItemId) };
}

export type LinkedExtensionSummary = {
  id: number;
  extensionInstanceId: string;
  linkedAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export async function listLinkedExtensions(
  userId: number,
): Promise<LinkedExtensionSummary[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint;
      extensionInstanceId: string;
      linkedAt: Date;
      lastSeenAt: Date;
      expiresAt: Date;
    }>
  >`
    SELECT
      id,
      extension_instance_id AS "extensionInstanceId",
      linked_at AS "linkedAt",
      last_seen_at AS "lastSeenAt",
      expires_at AS "expiresAt"
    FROM linked_extensions
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY linked_at DESC
  `;

  // $queryRaw の BIGINT は BigInt で返り、そのままでは JSON/props に渡せない
  return rows.map((row) => ({
    id: Number(row.id),
    extensionInstanceId: row.extensionInstanceId,
    linkedAt: row.linkedAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  }));
}

export async function revokeLinkedExtension(
  userId: number,
  linkedExtensionId: number,
) {
  const revoked = await prisma.$queryRaw<
    Array<{ extensionInstanceId: string }>
  >`
    UPDATE linked_extensions
    SET revoked_at = ${new Date()}
    WHERE id = ${linkedExtensionId}
      AND user_id = ${userId}
      AND revoked_at IS NULL
    RETURNING extension_instance_id AS "extensionInstanceId"
  `;

  if (revoked.length !== 1) {
    throw new NotFoundError("Linked extension not found");
  }

  return { extensionInstanceId: revoked[0].extensionInstanceId };
}

export function parseBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) return null;

  const match = authorizationHeader.trim().match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function authenticateLinkedExtension(
  extensionInstanceId: string,
  extensionAuthToken: string,
) {
  // revoked 行を WHERE で除外する。unlink 後に再連携すると同じ instance_id の
  // revoked 行とアクティブ行が併存するため、フィルタ無し LIMIT 1 では revoked 行を
  // 拾って認証が不安定になる。
  const records = await prisma.$queryRaw<Array<LinkedExtensionRecord>>`
    SELECT
      le.id,
      le.user_id AS "userId",
      le.extension_instance_id AS "extensionInstanceId",
      le.extension_auth_hash AS "extensionAuthHash",
      le.expires_at AS "expiresAt",
      le.revoked_at AS "revokedAt"
    FROM linked_extensions le
    JOIN users u ON u.id = le.user_id AND u.deleted_at IS NULL
    WHERE le.extension_instance_id = ${extensionInstanceId}::uuid
      AND le.revoked_at IS NULL
    LIMIT 1
  `;

  const linkedExtension = records[0];
  if (!linkedExtension || linkedExtension.revokedAt) {
    throw new UnauthorizedError("Unauthorized");
  }

  if (
    !tokenHashMatches(extensionAuthToken, linkedExtension.extensionAuthHash)
  ) {
    throw new UnauthorizedError("Unauthorized");
  }

  if (linkedExtension.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError("Unauthorized");
  }

  return linkedExtension;
}

function generateOpaqueToken(size = 32) {
  return randomBytes(size).toString("base64url");
}

function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenHashMatches(token: string, expectedHash: string) {
  const actualHash = hashOpaqueToken(token);
  if (actualHash.length !== expectedHash.length) return false;

  return timingSafeEqual(
    Buffer.from(actualHash, "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}
