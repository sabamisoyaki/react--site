import { parseKeywords, rankByKeywords } from "@/lib/search/utils";
import { prisma } from "@/server/db";
import { resolveClipRange } from "@/server/domain/clips";
import { isActive, lockActorAndClipOwner } from "@/server/domain/locking";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@/server/http/errors";
import * as repo from "@/server/repositories/clips";
import { resolveClipCommentReportsForClips } from "@/server/repositories/comments";

export async function listClips(opts: Parameters<typeof repo.list>[0]) {
  const result = await repo.list(opts);
  const keywords = parseKeywords(opts?.title ?? "");
  return {
    ...result,
    data: rankByKeywords(result.data, keywords, (clip) => [
      clip.title,
      clip.name,
      clip.epnum,
    ]),
  };
}

export async function listClipsCursor(
  opts: Parameters<typeof repo.listCursor>[0],
) {
  const result = await repo.listCursor(opts);
  // nextCursor はリポジトリが並べ替え前の順序から作っている。
  // ここでの並べ替えはページ内で閉じているのでカーソルには影響しない。
  const keywords = parseKeywords(opts?.title ?? "");
  return {
    ...result,
    data: rankByKeywords(result.data, keywords, (clip) => [
      clip.title,
      clip.name,
      clip.epnum,
      clip.vod?.name,
    ]),
  };
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
  const clipOwner = await repo.findActiveOwnerById(id);
  if (!clipOwner) throw new NotFoundError("Clip not found");

  return prisma.$transaction(async (tx) => {
    // 所有者のクリップを実際に書き換えるので、所有者側も排他で取る。
    const locked = await lockActorAndClipOwner(
      currentUserId,
      clipOwner.userId,
      tx,
      "update",
    );
    if (!isActive(locked.actor)) throw new UnauthorizedError();
    if (!isActive(locked.owner)) throw new NotFoundError("Clip not found");

    const clip = await repo.lockActiveById(id, tx);
    if (!clip) throw new NotFoundError("Clip not found");
    if (String(clip.userId) !== String(clipOwner.userId)) {
      throw new NotFoundError("Clip not found");
    }
    if (String(clip.userId) !== String(currentUserId)) {
      throw new ForbiddenError();
    }

    if (hard) return repo.hardDelete(id, tx);

    await resolveClipCommentReportsForClips(
      [clip.id],
      currentUserId,
      "clip_deleted",
      tx,
    );
    return repo.softDelete(id, tx);
  });
}

export function incrementClipViews(id: number, by = 1n) {
  return repo.incrementViews(id, by).then((result) => {
    if (result.count === 0) throw new NotFoundError("Clip not found");
  });
}
