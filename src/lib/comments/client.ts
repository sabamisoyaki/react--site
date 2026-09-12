import type { ClipComment, ReportReason, ReportSummaryRow } from "./types";

export class CommentApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(`HTTP ${status}${code ? `: ${code}` : ""}`);
    this.name = "CommentApiError";
  }
}

type CommentPage<T> = { data: T[]; nextCursor: string | null };
type PageOptions = { cursor?: string | null; signal?: AbortSignal };

async function readPage<T>(response: Response): Promise<CommentPage<T>> {
  if (!response.ok) throw new CommentApiError(response.status);
  const payload = await response.json();
  return {
    data: Array.isArray(payload.data) ? payload.data : [],
    nextCursor: payload.meta?.nextCursor ?? null,
  };
}

export async function listClipComments(
  clipId: string,
  { cursor, signal }: PageOptions = {},
) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await fetch(`/api/v1/clips/${clipId}/comments${query}`, {
    signal,
  });
  return readPage<ClipComment>(response);
}

export async function listClipCommentReports(
  clipId: string,
  { cursor, signal }: PageOptions = {},
) {
  const query = cursor
    ? `?cursor=${encodeURIComponent(cursor)}&limit=100`
    : "?limit=100";
  const response = await fetch(
    `/api/v1/clips/${clipId}/comment-reports${query}`,
    {
      signal,
    },
  );
  return readPage<ReportSummaryRow>(response);
}

export async function createClipComment(
  clipId: string,
  input: { body: string; clientRequestId: string },
): Promise<ClipComment> {
  const response = await fetch(`/api/v1/clips/${clipId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new CommentApiError(response.status);
  return response.json();
}

export async function deleteClipComment(clipId: string, commentId: number) {
  const response = await fetch(
    `/api/v1/clips/${clipId}/comments/${commentId}`,
    { method: "DELETE" },
  );
  // 他の操作で削除済みの場合も、画面から取り除ける。
  if (!response.ok && response.status !== 404) {
    throw new CommentApiError(response.status);
  }
}

export async function reportClipComment(
  clipId: string,
  commentId: number,
  input: { reason: ReportReason; note: string | null },
): Promise<"created" | "already-reported"> {
  const response = await fetch(
    `/api/v1/clips/${clipId}/comments/${commentId}/reports`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (response.status === 409) {
    const payload = (await response.json().catch(() => null)) as {
      code?: string;
    } | null;
    // 重複通報だけを成功と同等に扱い、トランザクション競合は再試行させる。
    if (payload?.code === "ALREADY_REPORTED") return "already-reported";
    throw new CommentApiError(response.status, payload?.code);
  }
  if (!response.ok) throw new CommentApiError(response.status);
  return "created";
}

export async function dismissClipCommentReports(
  clipId: string,
  commentId: number,
) {
  const response = await fetch(
    `/api/v1/clips/${clipId}/comments/${commentId}/reports`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution: "dismissed" }),
    },
  );
  if (!response.ok) throw new CommentApiError(response.status);
}
