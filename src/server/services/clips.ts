import { prisma } from "@/server/db";
import { resolveClipRange } from "@/server/domain/clips";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/server/http/errors";
import * as repo from "@/server/repositories/clips";

export function listClips(opts: Parameters<typeof repo.list>[0]) {
  return repo.list(opts);
}

export function listClipsCursor(opts: Parameters<typeof repo.listCursor>[0]) {
  return repo.listCursor(opts);
}

export async function getClip(id: number) {
  const clip = await repo.findById(id);
  if (!clip) throw new NotFoundError("Clip not found");
  return clip;
}

export async function getClipWithVod(id: number) {
  const clip = await repo.findByIdWithVod(id);
  if (!clip) throw new NotFoundError("Clip not found");
  return clip;
}

export function createClip(
  currentUserId: number,
  data: Omit<Parameters<typeof repo.create>[0], "userId">,
) {
  return repo.create({ ...data, userId: currentUserId });
}

export async function updateClip(
  currentUserId: number,
  id: number,
  data: Parameters<typeof repo.update>[1],
) {
  return prisma.$transaction(async (tx) => {
    // コメント作成と同じ行ロックを取り、区間確認後にアンカーが追加される競合を防ぐ。
    const clip = await repo.lockActiveById(id, tx);
    if (!clip) throw new NotFoundError("Clip not found");
    if (String(clip.userId) !== String(currentUserId))
      throw new ForbiddenError();

    const range = resolveClipRange(clip, data);
    if (!range) {
      throw new BadRequestError(
        "endMs must be greater than startMs",
        "INVALID_CLIP_RANGE",
      );
    }

    if (data.startMs !== undefined || data.endMs !== undefined) {
      const outsideCount = await repo.countActiveAnchorsOutsideRange(
        id,
        range.startMs,
        range.endMs,
        tx,
      );
      if (outsideCount > 0) {
        throw new ConflictError(
          "Clip range would exclude existing comment anchors",
          "COMMENT_ANCHOR_CONFLICT",
          { outsideCount },
        );
      }
    }

    return repo.update(id, data, tx);
  });
}

export async function deleteClip(
  currentUserId: number,
  id: number,
  hard = false,
) {
  const clip = await getClip(id);
  if (String(clip.userId) !== String(currentUserId)) throw new ForbiddenError();
  return hard ? repo.hardDelete(id) : repo.softDelete(id);
}

export function incrementClipViews(id: number, by = 1n) {
  return repo.incrementViews(id, by).then((result) => {
    if (result.count === 0) throw new NotFoundError("Clip not found");
  });
}
