import { BadRequestError } from "@/server/http/errors";
import {
  type CursorPayload,
  decodeCursor,
  encodeCursor,
} from "@/server/http/pagination";

export interface PlaylistClipCursor extends CursorPayload {
  p: number;
}

export function encodePlaylistClipCursor(
  createdAt: Date,
  clipId: bigint,
  position: number,
) {
  const cursor = decodeCursor(encodeCursor(createdAt, clipId));
  return Buffer.from(JSON.stringify({ ...cursor, p: position })).toString(
    "base64url",
  );
}

export function decodePlaylistClipCursor(
  value?: string | null,
): PlaylistClipCursor | null {
  const cursor = decodeCursor(value);
  if (!cursor || !value) return null;
  const { p } = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  if (!Number.isInteger(p) || p < -2147483648 || p > 2147483647) {
    throw new BadRequestError(
      "Invalid playlist cursor; restart pagination",
      "INVALID_CURSOR",
    );
  }
  return { ...cursor, p };
}
