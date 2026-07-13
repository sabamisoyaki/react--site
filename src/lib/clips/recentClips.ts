// 「最近観たクリップ」のローカル履歴（localStorage）。
// サーバーには保存せず、このブラウザ内でだけ ShelfRail に表示する。

import type { ClipPlayback } from "./playback";

const STORAGE_KEY = "subskiri:recent-clips";
const MAX_ENTRIES = 8;

export const RECENT_CLIPS_EVENT = "recent-clips-updated";

export type RecentClip = ClipPlayback & {
  id: number;
  watchedAt: number;
};

export function readRecentClips(): RecentClip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentClip =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as RecentClip).id === "number" &&
        typeof (e as RecentClip).name === "string" &&
        typeof (e as RecentClip).service === "string" &&
        typeof (e as RecentClip).url === "string",
    );
  } catch {
    return [];
  }
}

export function recordRecentClip(clip: Omit<RecentClip, "watchedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const entry: RecentClip = { ...clip, watchedAt: Date.now() };
    const rest = readRecentClips().filter((e) => e.id !== clip.id);
    const next = [entry, ...rest].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(RECENT_CLIPS_EVENT));
  } catch {
    // localStorage が使えない環境（プライベートモード等）では履歴なしで動く
  }
}
