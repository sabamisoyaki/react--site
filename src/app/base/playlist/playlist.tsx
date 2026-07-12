"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

//
// --- 型定義 ------------------------------
//

export interface PlaylistItem {
  id: number;
  name: string;
  user_name: string;
  data: string;
}

export interface PlaylistApiResponse {
  items?: PlaylistItem[];
  data?: Array<Record<string, unknown>>;
  meta?: { nextCursor?: string | null };
  nextCursor?: string | null;
}

interface PlayListProps {
  name: string;
  username: string;
  data: string;
}

interface PlayListClusterProps {
  PlayList_Data_Url: string;
  emptyMessage?: string;
}

//
// --- 単一アイテム表示コンポーネント --------
//

// プレイリスト名から安定して同じカバー配色を選ぶ
const COVER_GRADIENTS = [
  "linear-gradient(120deg, #ff3d71, #ff9d5c)",
  "linear-gradient(120deg, #4353ff, #29c8d8)",
  "linear-gradient(120deg, #23202b, #5b5470)",
  "linear-gradient(120deg, #0e9f6e, #84e1bc)",
];

function coverFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash + (ch.codePointAt(0) ?? 0)) % 997;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
}

function PlayList({ name, username, data }: PlayListProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="cursor-pointer overflow-hidden rounded-2xl border-2 border-ink bg-white text-left shadow-sticker transition-transform hover:-translate-y-0.5"
      onClick={() => router.push(`/playlists/${data}`)}
      title={`プレイリスト「${name}」を開く`}
    >
      <div
        className="flex h-16 items-end px-3.5 pb-1.5 text-2xl font-black text-white/90"
        style={{ background: coverFor(name) }}
        aria-hidden="true"
      >
        {name.slice(0, 1)}
      </div>
      <div className="px-3.5 py-3">
        <div className="truncate text-[14px] font-black">{name}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-ink-muted">
          {username}
        </div>
      </div>
    </button>
  );
}

//
// --- メインコンポーネント（ページネーション対応） --------
//

const DISPLAY_SIZE = 10;

export default function PlayListCluster({
  PlayList_Data_Url,
  emptyMessage,
}: PlayListClusterProps) {
  const [cache, setCache] = useState<PlaylistItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const didFetchRef = useRef<string | null>(null);

  //
  // --- Fetch 処理 ------------------------
  //

  const fetchChunk = async (cursorValue: string | null = null) => {
    try {
      setLoading(true);
      setError(null);

      const hasQuery = PlayList_Data_Url.includes("?");
      const url =
        cursorValue !== null
          ? `${PlayList_Data_Url}${hasQuery ? "&" : "?"}cursor=${cursorValue}`
          : PlayList_Data_Url;

      const res = await fetch(url);
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

      const json: PlaylistApiResponse = await res.json();
      const items = normalizePlaylistItems(json);

      setCache((prev) => [...prev, ...items]);
      setCursor(json.meta?.nextCursor ?? json.nextCursor ?? null);
    } catch (err: unknown) {
      console.error("Playlist fetch error:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  //
  // --- 初回ロード & URL変更時のリセット ----
  //

  // biome-ignore lint/correctness/useExhaustiveDependencies: legacy fetch callback is intentionally local to URL changes.
  useEffect(() => {
    setCache([]);
    setCursor(null);
    setVisibleIndex(0);
    setError(null);
    setUnauthorized(false);
    setLoading(true);

    if (didFetchRef.current === PlayList_Data_Url) return;
    didFetchRef.current = PlayList_Data_Url;

    fetchChunk(null);
  }, [PlayList_Data_Url]);

  //
  // --- Navigation ------------------------
  //

  const nextPage = () => {
    const nextIdx = visibleIndex + DISPLAY_SIZE;

    const shouldFetch =
      cursor !== null &&
      (nextIdx >= cache.length - DISPLAY_SIZE || cache.length - nextIdx < 30);

    if (shouldFetch) {
      fetchChunk(cursor);
    }

    setVisibleIndex(nextIdx);
  };

  const prevPage = () => {
    const prevIdx = visibleIndex - DISPLAY_SIZE;
    if (prevIdx >= 0) setVisibleIndex(prevIdx);
  };

  const visibleItems = cache.slice(visibleIndex, visibleIndex + DISPLAY_SIZE);
  const currentPage = Math.floor(visibleIndex / DISPLAY_SIZE) + 1;
  const hasNext = cursor !== null || visibleIndex + DISPLAY_SIZE < cache.length;

  //
  // --- Rendering -------------------------
  //

  if (loading && cache.length === 0) {
    return (
      <output
        className="flex flex-col items-center gap-3 rounded-2xl border-2 border-ink bg-white p-10 text-center text-ink-muted shadow-sticker"
        aria-live="polite"
      >
        <div
          className="h-7 w-7 animate-spin rounded-full border-4 border-ink/15 border-t-accent"
          aria-hidden="true"
        />
        <p>プレイリストを読み込んでいます…</p>
      </output>
    );
  }

  if (unauthorized) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-ink bg-white p-10 text-center shadow-sticker">
        <strong className="text-[17px] font-black">ログインが必要です</strong>
        <p className="text-ink-muted">
          マイリストを表示するにはログインしてください。
        </p>
        <a
          href="/login"
          className="rounded-full bg-accent px-5 py-2 text-[13.5px] font-extrabold text-white shadow-sticker-ink hover:bg-accent-strong"
        >
          ログインする
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-accent bg-white p-10 text-center shadow-sticker">
        <strong className="text-[17px] font-black text-accent">
          読み込みに失敗しました
        </strong>
        <p className="text-ink-muted">{error}</p>
        <button
          type="button"
          className="cursor-pointer rounded-full border-2 border-ink bg-white px-5 py-2 text-[13.5px] font-extrabold hover:bg-chip"
          onClick={() => fetchChunk(cursor)}
        >
          再試行
        </button>
      </div>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-ink bg-white p-10 text-center shadow-sticker">
        <strong className="text-[17px] font-black">
          プレイリストがありません
        </strong>
        <p className="text-ink-muted">
          {emptyMessage ??
            // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
            "クリップの「＋」ボタンからプレイリストを作成できます。"}
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visibleItems.map((item) => (
          <PlayList
            key={item.id}
            name={item.name}
            username={item.user_name}
            data={item.data}
          />
        ))}
      </section>

      {/* Navigation */}
      <nav className="mt-6 flex items-center gap-3" aria-label="ページ切り替え">
        <button
          type="button"
          onClick={prevPage}
          disabled={visibleIndex === 0}
          className="cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[12.5px] font-extrabold hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← 前へ
        </button>
        <span className="font-data text-[12px] text-ink-muted tabular-nums">
          {currentPage} ページ目
        </span>
        <button
          type="button"
          onClick={nextPage}
          disabled={!hasNext}
          className="cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[12.5px] font-extrabold hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40"
        >
          次へ →
        </button>
      </nav>
    </>
  );
}

function normalizePlaylistItems(json: PlaylistApiResponse): PlaylistItem[] {
  const source: unknown[] | undefined = Array.isArray(json.data)
    ? json.data
    : json.items;
  if (!Array.isArray(source)) {
    throw new Error("Invalid API result: items missing");
  }

  return source.map((rawItem) => {
    const item =
      typeof rawItem === "object" && rawItem !== null
        ? (rawItem as Record<string, unknown>)
        : {};

    return {
      id: Number(item.id),
      name: String(item.name ?? "Untitled"),
      user_name: String(
        (item.user as Record<string, unknown>)?.name ??
          item.user_name ??
          item.userName ??
          "unknown",
      ),
      data: String(item.data ?? item.id),
    };
  });
}
