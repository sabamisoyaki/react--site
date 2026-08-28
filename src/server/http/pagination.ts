import { BadRequestError } from "@/server/http/errors";

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGE_SIZE = 100;
const CURSOR_VERSION = 1;

export interface PaginationInit {
  page?: number | string | null;
  pageSize?: number | string | null;
  defaultPage?: number;
  defaultPageSize?: number;
  maxPageSize?: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  outOfRange: boolean;
}

export interface CursorPaginationInit {
  cursor?: string | null;
  limit?: number | string | null;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface CursorPaginationParams {
  cursor: CursorPayload | null;
  limit: number;
}

export interface CursorPaginationMeta {
  limit: number;
  hasNext: boolean;
  nextCursor: string | null;
}

export interface CursorPayload {
  c: string;
  i: string;
  v: number;
}

export function parsePagination(init: PaginationInit = {}): PaginationParams {
  const defaultPage = clampInt(toNumber(init.defaultPage, 1), 1);
  const defaultPageSize = clampInt(
    toNumber(init.defaultPageSize, DEFAULT_PAGE_SIZE),
    1,
  );
  const maxPageSize = clampInt(
    toNumber(init.maxPageSize, DEFAULT_MAX_PAGE_SIZE),
    1,
  );

  const page = clampInt(toNumber(init.page, defaultPage), 1);
  const rawPageSize = clampInt(toNumber(init.pageSize, defaultPageSize), 1);
  const pageSize = Math.min(rawPageSize, maxPageSize);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function parseCursorPagination(
  init: CursorPaginationInit = {},
): CursorPaginationParams {
  const defaultLimit = clampInt(
    toNumber(init.defaultLimit, DEFAULT_PAGE_SIZE),
    1,
  );
  const maxLimit = clampInt(toNumber(init.maxLimit, DEFAULT_MAX_PAGE_SIZE), 1);
  const rawLimit = clampInt(toNumber(init.limit, defaultLimit), 1);

  return {
    cursor: decodeCursor(init.cursor),
    limit: Math.min(rawLimit, maxLimit),
  };
}

export function buildCursorPaginationMeta(
  params: CursorPaginationParams,
  hasNext: boolean,
  nextCursor: string | null,
): CursorPaginationMeta {
  return {
    limit: params.limit,
    hasNext,
    nextCursor: hasNext ? nextCursor : null,
  };
}

export function encodeCursor(
  createdAt: Date,
  id: number | bigint | string,
): string {
  const payload: CursorPayload = {
    c: createdAt.toISOString(),
    i: String(id),
    v: CURSOR_VERSION,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor(value?: string | null): CursorPayload | null {
  if (value == null || value === "") return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CursorPayload>;

    if (
      decoded.v !== CURSOR_VERSION ||
      typeof decoded.c !== "string" ||
      typeof decoded.i !== "string" ||
      !/^\d+$/.test(decoded.i) ||
      BigInt(decoded.i) > BigInt(Number.MAX_SAFE_INTEGER) ||
      BigInt(decoded.i) <= 0n
    ) {
      throw new Error("Invalid cursor payload");
    }

    const createdAt = new Date(decoded.c);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("Invalid cursor timestamp");
    }

    return {
      c: createdAt.toISOString(),
      i: decoded.i,
      v: decoded.v,
    };
  } catch {
    throw new BadRequestError("Invalid cursor", "INVALID_CURSOR");
  }
}

export function buildPaginationMeta(
  { page, pageSize }: PaginationParams,
  total: number,
): PaginationMeta {
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages = pageSize > 0 ? Math.ceil(safeTotal / pageSize) : 0;
  const outOfRange = totalPages > 0 && page > totalPages;

  return {
    page,
    pageSize,
    total: safeTotal,
    totalPages,
    hasPrev: totalPages > 0 && page > 1,
    hasNext: totalPages > 0 && page < totalPages,
    outOfRange,
  };
}

function toNumber(
  value: number | string | null | undefined,
  fallback: number,
): number {
  if (typeof value === "number" && Number.isFinite(value))
    return Number.isInteger(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const normalized = value.trim();
    if (!/^-?\d+$/.test(normalized)) return fallback;
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampInt(value: number, min: number): number {
  const normalized = Math.floor(value);
  return normalized < min ? min : normalized;
}
