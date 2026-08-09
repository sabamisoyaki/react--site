// biome-ignore-all lint/security/noSecrets: Japanese UI labels are false positives.
"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

// サーバー側の clipCommentBodySchema と同じ上限。ここでの制限は文字数カウンタと
// ボタン活性のためのUX用で、実際の強制はサーバー（超過は 400）が行う。
const MAX_BODY_LENGTH = 500;
const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "スパム",
  harassment: "嫌がらせ",
  spoiler: "ネタバレ",
  other: "その他",
};

type Comment = {
  id: number;
  clipId: number;
  userId: number | null;
  username: string | null;
  body: string;
  /** 動画内の位置(ms)。null は「クリップ全体へのコメント」。 */
  atMs: number | null;
  createdAt: string;
};

type ListState = "loading" | "ready" | "error";
type ReportReason = "spam" | "harassment" | "spoiler" | "other";
type ReportSummary = {
  reportCount: number;
  recentReports: Array<{
    reason: ReportReason;
    note: string | null;
    createdAt: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

/** 時刻アンカーを mm:ss で表示する。1時間を超えるものは h:mm:ss。 */
function formatAtMs(atMs: number): string {
  const total = Math.floor(atMs / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function CommentModal({
  isOpen,
  onClose,
  clipId,
  userId,
  clipOwnerId,
}: {
  isOpen: boolean;
  onClose: () => void;
  clipId: string;
  userId: string | number | null;
  /** クリップ所有者。自分のクリップに付いたコメントはモデレーションで消せる。 */
  clipOwnerId?: string | number | null;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const submitRequestIdRef = useRef<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [reportedIds, setReportedIds] = useState<number[]>([]);
  const [reportTarget, setReportTarget] = useState<Comment | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("other");
  const [reportNote, setReportNote] = useState("");
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  /** クリップ所有者にだけ見せる通報の判断材料。 */
  const [reportSummaries, setReportSummaries] = useState<
    Record<number, ReportSummary>
  >({});
  const [reportNextCursor, setReportNextCursor] = useState<string | null>(null);

  const isSignedIn = userId != null && userId !== "";
  // id は BigInt 由来で number / string が混ざるため String に寄せて比較する
  const viewerId = userId == null ? null : String(userId);
  const isClipOwner =
    viewerId != null && clipOwnerId != null && String(clipOwnerId) === viewerId;
  const canDelete = (comment: Comment) =>
    viewerId != null && (String(comment.userId) === viewerId || isClipOwner);
  // 自分のコメントは通報できない（消せばよい）
  const canReport = (comment: Comment) =>
    viewerId != null && String(comment.userId) !== viewerId;

  const trimmedBody = body.trim();
  const canSubmit =
    trimmedBody.length > 0 &&
    trimmedBody.length <= MAX_BODY_LENGTH &&
    !submitting;

  // 閉じている間に積もった状態を持ち越さないよう、開くたびに読み直す
  const loadFirstPage = useCallback(
    async (signal?: AbortSignal) => {
      setListState("loading");
      setErrorMessage("");
      try {
        const res = await fetch(`/api/v1/clips/${clipId}/comments`, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        setComments(payload.data ?? []);
        setNextCursor(payload.meta?.nextCursor ?? null);
        setListState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setListState("error");
      }
    },
    [clipId],
  );

  // 通報の宛先はクリップ所有者なので、所有者のときだけ件数を読む
  const loadReportSummaries = useCallback(
    async (signal?: AbortSignal, cursor?: string | null) => {
      if (!isClipOwner) return;
      try {
        const query = cursor
          ? `?cursor=${encodeURIComponent(cursor)}&limit=100`
          : "?limit=100";
        const res = await fetch(
          `/api/v1/clips/${clipId}/comment-reports${query}`,
          { signal },
        );
        if (!res.ok) return;
        const payload = await res.json();
        const summaries: Record<number, ReportSummary> = {};
        for (const row of payload.data ?? []) {
          summaries[row.comment.id] = {
            reportCount: row.reportCount,
            recentReports: row.recentReports ?? [],
          };
        }
        setReportSummaries((previous) =>
          cursor ? { ...previous, ...summaries } : summaries,
        );
        setReportNextCursor(payload.meta?.nextCursor ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        // 件数は補助情報。取れなくても一覧の表示は妨げない。
      }
    },
    [clipId, isClipOwner],
  );

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setBody("");
    setReportedIds([]);
    setReportTarget(null);
    setReportSummaries({});
    setReportNextCursor(null);
    loadFirstPage(controller.signal);
    loadReportSummaries(controller.signal);
    return () => controller.abort();
  }, [isOpen, loadFirstPage, loadReportSummaries]);

  // モーダルへフォーカスを移し、Tab を内部に閉じ込め、閉じたら元へ戻す。
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;
      if (
        e.shiftKey &&
        (active === first ||
          active === dialogRef.current ||
          !dialogRef.current.contains(active))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (active === last || !dialogRef.current.contains(active))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
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
      setErrorMessage("続きを読み込めませんでした。");
    } finally {
      setLoadingMore(false);
    }
  };

  const beginReport = (comment: Comment) => {
    setReportTarget(comment);
    setReportReason("other");
    setReportNote("");
    setErrorMessage("");
  };

  const report = async (comment: Comment) => {
    if (reportingId !== null) return;

    setReportingId(comment.id);
    setErrorMessage("");
    try {
      const res = await fetch(
        `/api/v1/clips/${clipId}/comments/${comment.id}/reports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reportReason,
            note: reportNote.trim() || null,
          }),
        },
      );

      if (res.status === 401) {
        setErrorMessage("通報するにはログインが必要です。");
        return;
      }
      if (res.status === 409) {
        // 既に通報済みでも利用者から見た結果は同じ
        setReportedIds((prev) => [...prev, comment.id]);
        setReportTarget(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setReportedIds((prev) => [...prev, comment.id]);
      setReportTarget(null);
      loadReportSummaries();
    } catch {
      setErrorMessage("通報できませんでした。");
    } finally {
      setReportingId(null);
    }
  };

  const dismissReports = async (comment: Comment) => {
    if (resolvingId !== null) return;
    setResolvingId(comment.id);
    setErrorMessage("");
    try {
      const res = await fetch(
        `/api/v1/clips/${clipId}/comments/${comment.id}/reports`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolution: "dismissed" }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReportSummaries((previous) => {
        const next = { ...previous };
        delete next[comment.id];
        return next;
      });
    } catch {
      setErrorMessage("通報を確認済みにできませんでした。");
    } finally {
      setResolvingId(null);
    }
  };

  const remove = async (comment: Comment) => {
    if (deletingId !== null) return;
    if (!window.confirm("このコメントを削除しますか？")) return;

    setDeletingId(comment.id);
    setErrorMessage("");
    try {
      const res = await fetch(
        `/api/v1/clips/${clipId}/comments/${comment.id}`,
        { method: "DELETE" },
      );

      if (res.status === 401) {
        setErrorMessage("削除するにはログインが必要です。");
        return;
      }
      if (res.status === 403) {
        setErrorMessage("このコメントを削除する権限がありません。");
        return;
      }
      // 既に他方が消していた場合も、画面上は消えていればよい
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);

      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch {
      setErrorMessage("コメントを削除できませんでした。");
    } finally {
      setDeletingId(null);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    const clientRequestId = submitRequestIdRef.current ?? crypto.randomUUID();
    submitRequestIdRef.current = clientRequestId;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const res = await fetch(`/api/v1/clips/${clipId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmedBody, clientRequestId }),
      });

      if (res.status === 401) {
        setErrorMessage("コメントするにはログインが必要です。");
        return;
      }
      if (res.status === 404) {
        setErrorMessage("このクリップは削除されています。");
        return;
      }
      if (res.status === 429) {
        setErrorMessage(
          "投稿が続いています。1分ほど待ってからお試しください。",
        );
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const created: Comment = await res.json();
      // 並びは新しい順なので先頭に足す。既存のカーソルは末尾基準なので影響しない。
      setComments((prev) => [created, ...prev]);
      setBody("");
      submitRequestIdRef.current = null;
    } catch {
      setErrorMessage(
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
        ref={dialogRef}
        tabIndex={-1}
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
                  {comment.atMs != null && (
                    <span
                      className="shrink-0 rounded-md bg-chip px-1.5 py-0.5 font-data text-[11px] tabular-nums"
                      title="この場面へのコメント"
                    >
                      {formatAtMs(comment.atMs)}
                    </span>
                  )}
                  {/* 通報件数はクリップ所有者にだけ見せる（通報の宛先が所有者のため） */}
                  {reportSummaries[comment.id] != null && (
                    <span
                      className="shrink-0 rounded-md border-2 border-accent px-1.5 py-0.5 font-data text-[10.5px] font-extrabold text-accent tabular-nums"
                      title="このコメントへの通報件数"
                    >
                      通報 {reportSummaries[comment.id].reportCount}
                    </span>
                  )}
                  <time
                    className="ml-auto shrink-0 font-data text-[11px] text-ink-muted tabular-nums"
                    dateTime={comment.createdAt}
                  >
                    {formatCreatedAt(comment.createdAt)}
                  </time>
                  {canDelete(comment) && (
                    <button
                      type="button"
                      onClick={() => remove(comment)}
                      disabled={deletingId !== null}
                      className="shrink-0 cursor-pointer rounded-full border-2 border-ink bg-white px-2 py-0.5 text-[11px] font-extrabold hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={
                        String(comment.userId) === viewerId
                          ? "自分のコメントを削除"
                          : "このコメントを削除（クリップ所有者）"
                      }
                    >
                      {deletingId === comment.id ? "削除中…" : "削除"}
                    </button>
                  )}
                  {canReport(comment) && (
                    <button
                      type="button"
                      onClick={() => beginReport(comment)}
                      disabled={
                        reportingId !== null || reportedIds.includes(comment.id)
                      }
                      className="shrink-0 cursor-pointer rounded-full border-2 border-ink bg-white px-2 py-0.5 text-[11px] font-extrabold hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="このコメントを通報"
                    >
                      {reportedIds.includes(comment.id) ? "通報済み" : "通報"}
                    </button>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">
                  {comment.body}
                </p>
                {reportSummaries[comment.id] && (
                  <div className="mt-3 rounded-lg bg-chip p-2.5 text-[12px]">
                    <p className="font-extrabold">最近の通報理由</p>
                    <ul className="mt-1 space-y-1">
                      {reportSummaries[comment.id].recentReports.map(
                        (report, index) => (
                          <li key={`${report.createdAt}-${index}`}>
                            {REPORT_REASON_LABELS[report.reason]}
                            {report.note ? `：${report.note}` : ""}
                          </li>
                        ),
                      )}
                    </ul>
                    <button
                      type="button"
                      onClick={() => dismissReports(comment)}
                      disabled={resolvingId !== null}
                      className="mt-2 cursor-pointer rounded-full border-2 border-ink bg-white px-3 py-1 font-extrabold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {resolvingId === comment.id
                        ? "処理中…"
                        : "問題なしとして確認済みにする"}
                    </button>
                  </div>
                )}
                {reportTarget?.id === comment.id && (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg bg-chip p-2.5">
                    <label className="flex flex-col gap-1 text-[12px] font-extrabold">
                      理由
                      <select
                        value={reportReason}
                        onChange={(event) =>
                          setReportReason(event.target.value as ReportReason)
                        }
                        className="rounded-lg border-2 border-ink bg-white px-2 py-1.5"
                      >
                        {Object.entries(REPORT_REASON_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] font-extrabold">
                      補足（任意）
                      <textarea
                        value={reportNote}
                        maxLength={500}
                        onChange={(event) => setReportNote(event.target.value)}
                        className="min-h-16 rounded-lg border-2 border-ink bg-white px-2 py-1.5"
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReportTarget(null)}
                        className="cursor-pointer rounded-full border-2 border-ink bg-white px-3 py-1 text-[12px] font-extrabold"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => report(comment)}
                        disabled={reportingId !== null}
                        className="cursor-pointer rounded-full bg-accent px-3 py-1 text-[12px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {reportingId === comment.id ? "送信中…" : "送信"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}

          {listState === "ready" && nextCursor && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[12.5px] font-extrabold hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loadingMore ? "読み込み中…" : "もっと見る"}
            </button>
          )}
          {isClipOwner && reportNextCursor && (
            <button
              type="button"
              onClick={() => loadReportSummaries(undefined, reportNextCursor)}
              className="cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[12.5px] font-extrabold hover:bg-chip"
            >
              古い通報情報も読み込む
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
              onChange={(e) => {
                setBody(e.target.value);
                submitRequestIdRef.current = null;
              }}
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
          <p className="text-[13px] font-bold text-accent" role="alert">
            {errorMessage}
          </p>
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
