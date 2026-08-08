"use client";

import { useCallback, useEffect, useId, useState } from "react";

// サーバー側の clipCommentBodySchema と同じ上限。ここでの制限は文字数カウンタと
// ボタン活性のためのUX用で、実際の強制はサーバー（超過は 400）が行う。
const MAX_BODY_LENGTH = 500;

type Comment = {
  id: number;
  clipId: number;
  userId: number;
  username: string | null;
  body: string;
  createdAt: string;
};

type ListState = "loading" | "ready" | "error";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

export default function CommentModal({
  isOpen,
  onClose,
  clipId,
  userId,
}: {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  userId: string | number | null;
}) {
  const titleId = useId();
  const [comments, setComments] = useState<Comment[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isSignedIn = userId != null && userId !== "";
  const trimmedBody = body.trim();
  const canSubmit =
    trimmedBody.length > 0 &&
    trimmedBody.length <= MAX_BODY_LENGTH &&
    !submitting;

  // 閉じている間に積もった状態を持ち越さないよう、開くたびに読み直す
  const loadFirstPage = useCallback(async () => {
    setListState("loading");
    setErrorMessage("");
    try {
      const res = await fetch(`/api/v1/clips/${clipId}/comments`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      setComments(payload.data ?? []);
      setNextCursor(payload.meta?.nextCursor ?? null);
      setListState("ready");
    } catch {
      setListState("error");
    }
  }, [clipId]);

  useEffect(() => {
    if (!isOpen) return;
    setBody("");
    loadFirstPage();
  }, [isOpen, loadFirstPage]);

  // Escape キーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setErrorMessage("");
    try {
      const res = await fetch(
        `/api/v1/clips/${clipId}/comments?cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      // 追加読みは id DESC の続きなので、常に末尾に足す
      setComments((prev) => [...prev, ...(payload.data ?? [])]);
      setNextCursor(payload.meta?.nextCursor ?? null);
    } catch {
      // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
      setErrorMessage("続きを読み込めませんでした。");
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/v1/clips/${clipId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmedBody }),
      });

      if (res.status === 401) {
        // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
        setErrorMessage("コメントするにはログインが必要です。");
        return;
      }
      if (res.status === 404) {
        // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
        setErrorMessage("このクリップは削除されています。");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const created: Comment = await res.json();
      // 並びは新しい順なので先頭に足す。既存のカーソルは末尾基準なので影響しない。
      setComments((prev) => [created, ...prev]);
      setBody("");
    } catch {
      setErrorMessage(
        // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
        "コメントを投稿できませんでした。時間をおいて再度お試しください。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: 背景クリックで閉じる補助操作。キーボードは Escape で代替している。
    // biome-ignore lint/a11y/noStaticElementInteractions: 同上。
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-2xl border-2 border-ink bg-white p-6 shadow-sticker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 className="text-[18px] font-black" id={titleId}>
          <span className="marker">コメント</span>
        </h2>

        {/* 一覧 */}
        <div className="flex flex-col gap-3">
          {listState === "loading" && (
            <p className="text-[13px] text-ink-muted">読み込み中…</p>
          )}
          {listState === "error" && (
            <p className="text-[13px] font-bold text-accent">
              コメントを読み込めませんでした。
            </p>
          )}
          {listState === "ready" && comments.length === 0 && (
            <p className="text-[13px] text-ink-muted">
              まだコメントがありません。最初のひとことをどうぞ。
            </p>
          )}
          {listState === "ready" &&
            comments.map((comment) => (
              <article
                key={comment.id}
                className="rounded-xl border-2 border-ink bg-white p-3"
              >
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-extrabold">
                    {comment.username || "ユーザー"}
                  </span>
                  <time
                    className="ml-auto shrink-0 font-data text-[11px] text-ink-muted tabular-nums"
                    dateTime={comment.createdAt}
                  >
                    {formatCreatedAt(comment.createdAt)}
                  </time>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
                  {comment.body}
                </p>
              </article>
            ))}

          {listState === "ready" && nextCursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[12.5px] font-extrabold hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40"
            >
              {/* biome-ignore lint/security/noSecrets: Japanese UI label is a false positive. */}
              {loadingMore ? "読み込み中…" : "もっと見る"}
            </button>
          )}
        </div>

        <hr className="border-ink/10" />

        {/* 投稿 */}
        {isSignedIn ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="min-h-20 w-full resize-y rounded-xl border-2 border-ink px-3.5 py-2 text-[14px] outline-none placeholder:text-ink-muted focus:border-accent"
              placeholder="この切り抜きの感想を書く"
              value={body}
              maxLength={MAX_BODY_LENGTH}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <span className="font-data text-[11.5px] text-ink-muted tabular-nums">
                {trimmedBody.length} / {MAX_BODY_LENGTH}
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="ml-auto cursor-pointer rounded-full bg-accent px-5 py-2 text-[13px] font-extrabold text-white shadow-sticker-ink hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {submitting ? "送信中…" : "コメントする"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">
            コメントするにはログインが必要です。
            <br />
            ヘッダーの「ログイン」からログインしてください。
          </p>
        )}

        {errorMessage && (
          <p className="text-[13px] font-bold text-accent">{errorMessage}</p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full border-2 border-ink bg-white px-5 py-2 text-[13px] font-extrabold hover:bg-chip"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
