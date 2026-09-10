import type { z } from "zod";

import { BadRequestError, HttpError } from "@/server/http/errors";

export function parseSearchParams<T>(
  params: URLSearchParams,
  schema: z.ZodSchema<T>,
): T {
  const result = schema.safeParse(Object.fromEntries(params.entries()));
  if (!result.success)
    throw new BadRequestError(
      "Invalid query parameters",
      "INVALID_QUERY",
      result.error.flatten((issue) => issue.message),
    );
  return result.data;
}

export function parseRouteParams<T>(
  params: Record<string, unknown>,
  schema: z.ZodSchema<T>,
): T {
  const result = schema.safeParse(params);
  if (!result.success)
    throw new BadRequestError(
      "Invalid route params",
      "INVALID_PARAMS",
      result.error.flatten((issue) => issue.message),
    );
  return result.data;
}

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const mediaType = req.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new HttpError(
      415,
      "Content-Type must be application/json",
      "UNSUPPORTED_MEDIA_TYPE",
    );
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch (error) {
    throw new BadRequestError(
      "Invalid JSON body",
      "INVALID_JSON",
      error instanceof Error ? error.message : error,
    );
  }
  const result = schema.safeParse(payload);
  if (!result.success)
    throw new BadRequestError(
      "Invalid request body",
      "INVALID_BODY",
      result.error.flatten((issue) => issue.message),
    );
  return result.data;
}
