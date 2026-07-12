// @ts-nocheck
// biome-ignore-all lint: legacy compatibility component pending v1 migration

"use client";

import React, { useEffect, useRef, useState } from "react";
import Clip from "@/app/base/clip/clipData";

const DISPLAY_SIZE = 10;

export default function ClipList({ clipApiUrl, userId, emptyMessage }) {
  const [cache, setCache] = useState([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  // StrictMode 対策：同じ clipApiUrl での二重フェッチを防ぐフラグ
  const didFetchRef = useRef<string | null>(null);

  // =========================
  // Chunk Fetch
  // =========================
  const fetchChunk = async (cursorValue: string | null = null) => {
    try {
      setLoading(true);
      setError(null);

      const hasQuery = clipApiUrl.includes("?");

      const url =
        cursorValue !== null
          ? `${clipApiUrl}${hasQuery ? "&" : "?"}cursor=${cursorValue}`
          : clipApiUrl;

      const res = await fetch(url);
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTPエラー: ${res.status}`);

      const text = await res.text();
      if (!text) throw new Error("レスポンスが空です");

      const json = JSON.parse(text);
      const items = normalizeClipItems(json);

      setCache((prev) => [...prev, ...items]);
      setCursor(json.meta?.nextCursor ?? json.nextCursor ?? null);
    } catch (err: any) {
      console.error("データ取得エラー:", err);
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // 初回ロード & クエリ変更時のリセット
  // =========================
  useEffect(() => {
    // clipApiUrl が変わったら state をリセット
    setCache([]);
    setCursor(null);
    setVisibleIndex(0);
    setError(null);
    setUnauthorized(false);
    setLoading(true);

    // StrictMode 対策：同じ URL で2回呼ばない
    if (didFetchRef.current === clipApiUrl) {
      return;
    }
    didFetchRef.current = clipApiUrl;

    fetchChunk(null);
  }, [clipApiUrl]);

  // =========================
  // Navigation
  // =========================
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
    if (prevIdx >= 0) {
      setVisibleIndex(prevIdx);
    }
  };

  const visibleItems = cache.slice(visibleIndex, visibleIndex + DISPLAY_SIZE);
  const currentPage = Math.floor(visibleIndex / DISPLAY_SIZE) + 1;
  const hasNext = cursor !== null || visibleIndex + DISPLAY_SIZE < cache.length;

  // カスタムイベント
  useEffect(() => {
    if (!loading && visibleItems.length > 0) {
      const event = new CustomEvent("clipListElementsRendered", {
        detail: { itemCount: visibleItems.length },
      });
      window.dispatchEvent(event);
    }
  }, [loading, visibleItems]);

  if (loading && cache.length === 0) {
    return (
      <div className="status-box" role="status" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p>クリップを読み込んでいます…</p>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="status-box">
        <strong>ログインが必要です</strong>
        <p>この一覧を表示するにはログインしてください。</p>
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
        <strong>クリップがありません</strong>
        <p>{emptyMessage ?? "表示できるクリップがまだありません。"}</p>
      </div>
    );
  }

  return (
    <>
      <section className="content-list">
        {visibleItems.map((item, index) => (
          <div className="list-item" key={item.id ?? index}>
            <Clip
              name={item.clipName || "切り抜き"}
              title={item.title || "タイトルなし"}
              epnum={item.epnumber || ""}
              url={item.url || "/browse"}
              username={item.user || "ユーザー不明"}
              icon={item.service || "unknown"}
              starttime={item.startTime}
              endtime={item.endTime}
              userId={userId}
              Id={item.id}
            />
          </div>
        ))}
      </section>

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

function normalizeClipItems(json) {
  const source = Array.isArray(json.data) ? json.data : json.items;
  if (!Array.isArray(source)) throw new Error("items がありません");

  return source.map((item) => ({
    id: Number(item.id),
    clipName: item.clipName ?? item.name,
    title: item.title,
    epnumber: item.epnumber ?? item.epnum,
    url: item.url,
    user: item.user?.name ?? item.userName ?? "ユーザー不明",
    service: item.service ?? item.vod?.code ?? "unknown",
    startTime:
      item.startTime ??
      (typeof item.startMs === "number" ? item.startMs / 1000 : undefined),
    endTime:
      item.endTime ??
      (typeof item.endMs === "number" ? item.endMs / 1000 : undefined),
  }));
}
