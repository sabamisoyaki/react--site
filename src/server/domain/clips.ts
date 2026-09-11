export type ClipRange = { startMs: number; endMs: number };

/** Merge a partial clip update with the stored interval and reject an empty/inverted range. */
export function resolveClipRange(
  current: ClipRange,
  update: Partial<ClipRange>,
): ClipRange | null {
  const range = {
    startMs: update.startMs ?? current.startMs,
    endMs: update.endMs ?? current.endMs,
  };
  return range.endMs > range.startMs ? range : null;
}
