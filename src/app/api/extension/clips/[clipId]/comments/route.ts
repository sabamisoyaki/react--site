import type { NextRequest } from "next/server";

import {
  buildExtensionCorsHeaders,
  isAllowedClipWriteOrigin,
} from "@/server/http/cors";
import { toErrorPayload } from "@/server/http/errors";
import { json } from "@/server/http/json";
import {
  parseJsonBody,
  parseRouteParams,
  parseSearchParams,
} from "@/server/http/validation";
import {
  extensionClipIdParamSchema,
  extensionCommentCreateBodySchema,
  extensionCommentListQuerySchema,
} from "@/server/schemas/extension.schema";
import {
  createExtensionClipComment,
  listExtensionClipComments,
} from "@/server/services/comments";
import { parseBearerToken } from "@/server/services/extensions";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ clipId: string }> },
) {
  const headers = buildExtensionCorsHeaders(req, {
    methods: ["GET", "POST", "OPTIONS"],
  });

  if (!isAllowedClipWriteOrigin(req)) {
    return json(
      { message: "OriginNotAllowed", code: "FORBIDDEN" },
      { status: 403, headers },
    );
  }

  const extensionAuthToken = parseBearerToken(req.headers.get("authorization"));
  if (!extensionAuthToken) {
    return json(
      { message: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401, headers },
    );
  }

  try {
    const { clipId: clipIdStr } = await context.params;
    const { clipId } = parseRouteParams(
      { clipId: clipIdStr },
      extensionClipIdParamSchema,
    );

    const query = parseSearchParams(
      req.nextUrl.searchParams,
      extensionCommentListQuerySchema,
    );

    const result = await listExtensionClipComments(
      query.extensionInstanceId,
      extensionAuthToken,
      clipId,
      {
        cursor: query.cursor,
        limit: query.limit,
      },
    );

    return json(
      {
        ok: true,
        clipId: result.clipId,
        // ExtensionComment は OpenAPI で additionalProperties: false なので、
        // サービスの戻り値を素通しせずフィールドを明示列挙する。
        // v1 に足したフィールドが自動で拡張契約に漏れないようにするための境界。
        // atMs は 2026-08-06 に拡張リポと合意して追加した（常に存在し、
        // 値が無いときは null）。
        comments: result.comments.map((c) => ({
          id: c.id,
          clipId: c.clipId,
          userId: c.userId,
          username: c.username,
          body: c.body,
          atMs: c.atMs,
          createdAt: c.createdAt.toISOString(),
        })),
        hasNext: result.hasNext,
        nextCursor: result.nextCursor,
      },
      { headers },
    );
  } catch (error) {
    const { status, body } = toErrorPayload(error, {
      exposeDetails: process.env.NODE_ENV !== "production",
    });
    return json(body, { status, headers });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ clipId: string }> },
) {
  const headers = buildExtensionCorsHeaders(req, {
    methods: ["GET", "POST", "OPTIONS"],
  });

  if (!isAllowedClipWriteOrigin(req)) {
    return json(
      { message: "OriginNotAllowed", code: "FORBIDDEN" },
      { status: 403, headers },
    );
  }

  const extensionAuthToken = parseBearerToken(req.headers.get("authorization"));
  if (!extensionAuthToken) {
    return json(
      { message: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401, headers },
    );
  }

  try {
    const { clipId: clipIdStr } = await context.params;
    const { clipId } = parseRouteParams(
      { clipId: clipIdStr },
      extensionClipIdParamSchema,
    );

    const body = await parseJsonBody(
      req as never,
      extensionCommentCreateBodySchema,
    );

    const result = await createExtensionClipComment(
      body.extensionInstanceId,
      extensionAuthToken,
      clipId,
      body.body,
      body.atMs,
      body.clientRequestId,
    );

    return json(
      {
        ok: true,
        // GET と同じ理由でフィールドを明示列挙する（上のコメント参照）
        comment: {
          id: result.comment.id,
          clipId: result.comment.clipId,
          userId: result.comment.userId,
          username: result.comment.username,
          body: result.comment.body,
          atMs: result.comment.atMs,
          createdAt: result.comment.createdAt.toISOString(),
        },
      },
      { status: 201, headers },
    );
  } catch (error) {
    const { status, body } = toErrorPayload(error, {
      exposeDetails: process.env.NODE_ENV !== "production",
    });
    return json(body, { status, headers });
  }
}

export function OPTIONS(req: Request) {
  if (!isAllowedClipWriteOrigin(req)) {
    return new Response(null, {
      status: 403,
      headers: buildExtensionCorsHeaders(req, {
        methods: ["GET", "POST", "OPTIONS"],
      }),
    });
  }

  return new Response(null, {
    status: 200,
    headers: buildExtensionCorsHeaders(req, {
      methods: ["GET", "POST", "OPTIONS"],
    }),
  });
}
