"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { formatTimeRange, openClipPlayback } from "@/lib/clips/playback";
import {
  RECENT_CLIPS_EVENT,
  type RecentClip,
  readRecentClips,
  recordRecentClip,
} from "@/lib/clips/recentClips";
import { coverFor } from "@/lib/playlists/cover";
import {
  notifyPlaylistsUpdated,
  PLAYLISTS_UPDATED_EVENT,
} from "@/lib/playlists/events";

type ShelfPlaylist = { id: number; name: string };
type LoadState = "loading" | "ready" | "error";

// 棚を出すのは発見・ライブラリ系の画面だけ（ログイン・設定系には出さない）
const SHOW_PREFIXES = ["/search", "/my_video", "/playlists"];

function showsRail(pathname: string): boolean {
  if (pathname === "/") return true;
  return SHOW_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

const SHELF_LIMIT = 5;

function ShelfBox({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border-2 border-ink/35 border-dashed bg-white/65 px-2 py-3">
      <h2 className="px-2.5 pb-2 font-data text-[10.5px] text-ink-muted uppercase tracking-[0.14em]">
        {label}
      </h2>
      {children}
    </section>
  );
}

function PlaylistShelf() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<ShelfPlaylist[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/me/playlists");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setPlaylists(json.data ?? []);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    load();
    const onUpdated = () => load();
    window.addEventListener(PLAYLISTS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(PLAYLISTS_UPDATED_EVENT, onUpdated);
  }, [load]);

  const createPlaylist = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    setCreateError(false);
    try {
      const res = await fetch("/api/v1/me/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const playlist = await res.json();
      setNewName("");
      setCreating(false);
      notifyPlaylistsUpdated();
      router.push(`/playlists/${playlist.id}`);
    } catch {
      setCreateError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ShelfBox label="じぶんの棚">
      {loadState === "loading" && (
        <div className="flex flex-col gap-2 px-2.5 py-1" aria-hidden="true">
          <div className="h-6 animate-pulse rounded-lg bg-chip" />
          <div className="h-6 animate-pulse rounded-lg bg-chip" />
        </div>
      )}
      {loadState === "error" && (
        <p className="px-2.5 text-[12px] text-ink-muted">
          棚を読み込めませんでした
        </p>
      )}
      {loadState === "ready" && (
        <>
          {playlists.length === 0 && (
            <p className="px-2.5 pb-1 text-[12px] text-ink-muted">
              まだ何も貼っていません。クリップの「＋」から棚が育ちます。
            </p>
          )}
          {playlists.slice(0, SHELF_LIMIT).map((p) => (
            <Link
              key={p.id}
              href={`/playlists/${p.id}`}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-chip"
            >
              <span
                className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] border-2 border-ink text-[12px] font-black text-white/90"
                style={{ background: coverFor(p.name) }}
                aria-hidden="true"
              >
                {p.name.slice(0, 1)}
              </span>
              <span className="truncate text-[13px] font-bold">{p.name}</span>
            </Link>
          ))}
          {playlists.length > SHELF_LIMIT && (
            <Link
              href="/playlists"
              className="block px-2.5 py-1.5 text-[12px] font-extrabold text-accent"
            >
              すべて見る →
            </Link>
          )}
        </>
      )}

      {creating ? (
        <div className="px-2.5 pt-2">
          <input
            type="text"
            // biome-ignore lint/a11y/noAutofocus: 「＋新しいプレイリスト」クリック直後の入力欄なのでフォーカス移動が自然。
            autoFocus
            placeholder="プレイリスト名"
            className="w-full rounded-xl border-2 border-ink px-3 py-1.5 text-[13px] outline-none placeholder:text-ink-muted focus:border-accent"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createPlaylist();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
          />
          {createError && (
            <p className="pt-1 text-[11.5px] font-bold text-accent">
              作成できませんでした
            </p>
          )}
          <div className="flex gap-1.5 pt-1.5">
            <button
              type="button"
              className="cursor-pointer rounded-full bg-accent px-3 py-1 text-[11.5px] font-extrabold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
              onClick={createPlaylist}
              disabled={!newName.trim() || busy}
            >
              {/* biome-ignore lint/security/noSecrets: Japanese UI label is a false positive. */}
              {busy ? "作成中…" : "作成"}
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-full px-3 py-1 text-[11.5px] font-bold text-ink-muted hover:text-ink"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="mt-0.5 flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] font-extrabold text-accent hover:bg-badge-nf/60"
          onClick={() => setCreating(true)}
        >
          ＋ 新しいプレイリスト
        </button>
      )}
    </ShelfBox>
  );
}

function RecentClipsShelf() {
  const [recent, setRecent] = useState<RecentClip[]>([]);

  useEffect(() => {
    setRecent(readRecentClips());
    const onUpdated = () => setRecent(readRecentClips());
    window.addEventListener(RECENT_CLIPS_EVENT, onUpdated);
    return () => window.removeEventListener(RECENT_CLIPS_EVENT, onUpdated);
  }, []);

  const openRecent = (clip: RecentClip) => {
    if (openClipPlayback(clip)) {
      recordRecentClip(clip); // 先頭に繰り上げ
    }
  };

  return (
    <ShelfBox label="最近観たクリップ">
      {recent.length === 0 && (
        <p className="px-2.5 text-[12px] text-ink-muted">
          「▶ 観る」を押すと、ここに履歴が残ります。
        </p>
      )}
      {recent.slice(0, 4).map((clip) => (
        <button
          key={clip.id}
          type="button"
          className="block w-full cursor-pointer rounded-xl px-2.5 py-1.5 text-left hover:bg-chip"
          onClick={() => openRecent(clip)}
          title={`${clip.title} をもう一度この場面から観る`}
        >
          <span className="block truncate text-[12.5px] font-extrabold">
            {clip.name}
          </span>
          <span className="block font-data text-[10.5px] text-ink-muted tabular-nums">
            {formatTimeRange(clip.starttime, clip.endtime) || clip.title}
          </span>
        </button>
      ))}
    </ShelfBox>
  );
}

export default function ShelfRail() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  if (!showsRail(pathname)) return null;
  if (status !== "authenticated" || !session?.user) return null;

  return (
    <aside
      className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] w-56 shrink-0 flex-col gap-4 overflow-y-auto lg:flex"
      aria-label="じぶんの棚"
    >
      <PlaylistShelf />
      <RecentClipsShelf />
    </aside>
  );
}
