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

function PlayList({ name, username, data }: PlayListProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="grid-item"
      onClick={() => router.push(`/playlists/${data}`)}
      title={`プレイリスト「${name}」を開く`}
    >
      <span className="grid-item-title">{name}</span>
      <span className="grid-item-sub">{username}</span>
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
      <output className="status-box" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p>プレイリストを読み込んでいます…</p>
      </output>
    );
  }

  if (unauthorized) {
    return (
      <div className="status-box">
        <strong>ログインが必要です</strong>
        <p>マイリストを表示するにはログインしてください。</p>
        <a href="/login" className="btn btn-primary">
          ログインする
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="status-box is-error">
        <strong>読み込みに失敗しました</strong>
        <p>{error}</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fetchChunk(cursor)}
        >
          再試行
        </button>
      </div>
    );
  }

  if (visibleItems.length === 0) {
    return (
      <div className="status-box">
        <strong>プレイリストがありません</strong>
        <p>
          {emptyMessage ??
            // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
            "クリップの「＋」ボタンからプレイリストを作成できます。"}
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="content-grid">
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
      <nav className="pager" aria-label="ページ切り替え">
        <button
          type="button"
          onClick={prevPage}
          disabled={visibleIndex === 0}
          className="btn btn-secondary btn-sm"
        >
          ← 前へ
        </button>
        <span className="pager-info">{currentPage} ページ目</span>
        <button
          type="button"
          onClick={nextPage}
          disabled={!hasNext}
          className="btn btn-secondary btn-sm"
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
