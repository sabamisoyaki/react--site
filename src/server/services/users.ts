import { prisma } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/server/http/errors";
import { resolveClipCommentReportsForClips } from "@/server/repositories/comments";
import * as repo from "@/server/repositories/users";

export function listUsers(opts: Parameters<typeof repo.list>[0]) {
  return repo.list(opts);
}

export function getUserAuthInfo(userId: number) {
  return repo.getUserAuthInfo(userId);
}

export async function getUser(id: number) {
  const user = await repo.findById(id);
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export function createUser(data: Parameters<typeof repo.create>[0]) {
  return repo.create(data);
}

export function updateUser(
  currentUserId: number,
  id: number,
  data: Parameters<typeof repo.update>[1],
) {
  if (currentUserId !== id) throw new ForbiddenError();
  return repo.update(id, data);
}

export async function deleteUser(
  currentUserId: number,
  id: number,
  hard = false,
) {
  if (currentUserId !== id) throw new ForbiddenError();

  return prisma.$transaction(async (tx) => {
    const [user] = await repo.lockUsersByIdOrder([id], tx);
    if (!user || (!hard && user.deletedAt !== null)) {
      throw new NotFoundError("User not found");
    }

    const ownedClips = await repo.lockOwnedClipsByIdOrder(id, tx);
    if (hard) return repo.hardDelete(id, tx);

    await resolveClipCommentReportsForClips(
      ownedClips.map((clip) => clip.id),
      currentUserId,
      "owner_deleted",
      tx,
    );
    await repo.revokeUserExtensions(id, tx);
    return repo.softDelete(id, tx);
  });
}

export function listUserVods(
  userId: number,
  opts: Parameters<typeof repo.listUserVods>[1],
) {
  return repo.listUserVods(userId, opts);
}

export function listUserVodsCursor(
  userId: number,
  opts?: Parameters<typeof repo.listUserVodsCursor>[1],
) {
  return repo.listUserVodsCursor(userId, opts);
}

export function addUserVod(currentUserId: number, id: number, vodId: number) {
  if (currentUserId !== id) throw new ForbiddenError();
  return repo.addUserVodIfVodActive(id, vodId).then((result) => {
    if (!result.active_exists) throw new NotFoundError("VOD not found");
    if (!result.inserted) throw new ConflictError("VOD already added");
  });
}

export function removeUserVod(
  currentUserId: number,
  id: number,
  vodId: number,
) {
  if (currentUserId !== id) throw new ForbiddenError();
  return repo.removeUserVod(id, vodId).then(() => undefined);
}
