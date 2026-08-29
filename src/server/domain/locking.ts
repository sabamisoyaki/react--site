import type { Prisma } from "@prisma/client";
import {
  lockUsersByIdOrder,
  shareLockUsersByIdOrder,
  type UserLockRow,
} from "@/server/repositories/users";

export type ActorAndOwnerLock = {
  actor: UserLockRow | null;
  owner: UserLockRow | null;
};

/**
 * 操作者とクリップ所有者を、デッドロックしない順序でロックする。
 *
 * この 2 行のロック手順は投稿・通報・クリップ削除の 3 経路で共通なので、
 * 順序とモードの決定はここだけが持つ。呼び出し側は結果の deletedAt を見て、
 * 経路ごとのエラーへ写すだけにする。
 *
 * 操作者は常に FOR UPDATE。同一ユーザーの同時実行を直列化しないと、
 * レート上限を並行リクエストで抜けられる。
 *
 * 所有者は既定で FOR SHARE。ここで読むのは deletedAt だけで排他は要らず、
 * FOR UPDATE にすると「同じ作者のクリップへのコメント」が作者ごとに直列化して
 * 人気作者が書き込みのボトルネックになる。退会との競合は FOR SHARE でも防げる。
 * 所有者自身を書き換える経路だけ ownerLock: "update" を指定する。
 *
 * モードが違うと 1 文でまとめられないため文を分ける。発行順は必ず id 昇順に
 * 揃える。逆順に取る経路が 1 つでもあるとデッドロックする。
 */
export async function lockActorAndClipOwner(
  actorId: number | bigint,
  ownerId: number | bigint,
  db: Prisma.TransactionClient,
  ownerLock: "share" | "update" = "share",
): Promise<ActorAndOwnerLock> {
  const actor = BigInt(actorId);
  const owner = BigInt(ownerId);

  // 自分のクリップへの操作。1 行しかないので分ける意味がない。
  if (actor === owner) {
    const [row] = await lockUsersByIdOrder([actor], db);
    return { actor: row ?? null, owner: row ?? null };
  }

  if (ownerLock === "update") {
    const rows = await lockUsersByIdOrder([actor, owner], db);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return { actor: byId.get(actor) ?? null, owner: byId.get(owner) ?? null };
  }

  const lockActor = async () => (await lockUsersByIdOrder([actor], db))[0];
  const lockOwner = async () => (await shareLockUsersByIdOrder([owner], db))[0];

  if (actor < owner) {
    const actorRow = await lockActor();
    const ownerRow = await lockOwner();
    return { actor: actorRow ?? null, owner: ownerRow ?? null };
  }

  const ownerRow = await lockOwner();
  const actorRow = await lockActor();
  return { actor: actorRow ?? null, owner: ownerRow ?? null };
}

/** ロック結果のユーザーが操作を続けてよい状態か。 */
export function isActive(row: UserLockRow | null): boolean {
  return row !== null && row.deletedAt === null;
}
