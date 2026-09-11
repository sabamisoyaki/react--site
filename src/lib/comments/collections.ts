type Identified = { id: number };

export function upsertCommentsById<T extends Identified>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map<number, T>();
  for (const comment of current) byId.set(comment.id, comment);
  for (const comment of incoming) byId.set(comment.id, comment);
  return [...byId.values()].sort((left, right) => {
    if (left.id === right.id) return 0;
    return left.id > right.id ? -1 : 1;
  });
}

export function upsertReportedCommentsById<T extends Identified>(
  current: readonly T[],
  reportRows: ReadonlyArray<{ comment: T }>,
): T[] {
  return upsertCommentsById(
    current,
    reportRows.map((row) => row.comment),
  );
}
