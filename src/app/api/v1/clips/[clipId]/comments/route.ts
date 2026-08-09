import { createRouteHandlers } from "@/server/api/handler";
import { requireUserId } from "@/server/auth/session";
import { json } from "@/server/http/json";
import {
  buildCursorPaginationMeta,
  parseCursorPagination,
} from "@/server/http/pagination";
import {
  parseJsonBody,
  parseRouteParams,
  parseSearchParams,
} from "@/server/http/validation";
import {
  clipCommentCreateBodySchema,
  clipCommentListQuerySchema,
  clipCommentParamSchema,
} from "@/server/schemas/comments.schema";
import {
  createClipCommentAsUser,
  listClipCommentsPage,
} from "@/server/services/comments";

export const { GET, POST } = createRouteHandlers({
  // 閲覧は公開。クリップ自体が公開リソース（/clips GET が x-permission: public）
  // なので、コメントだけ認証を要求する理由がない。
  GET: async (req, context) => {
    const params = parseRouteParams(context.params, clipCommentParamSchema);
    const query = parseSearchParams(
      req.nextUrl.searchParams,
      clipCommentListQuerySchema,
    );
    const pagination = parseCursorPagination(query);
    const { data, hasNext, nextCursor } = await listClipCommentsPage(
      params.clipId,
      { cursor: pagination.cursor, limit: pagination.limit },
    );
    const meta = buildCursorPaginationMeta(pagination, hasNext, nextCursor);

    // Response.json ではなく json() を使う。コメントの id / clipId / userId は
    // BigInt なので、素の Response.json だとシリアライズで落ちる。
    return json({ data, meta });
  },
  POST: async (req, context) => {
    const userId = await requireUserId();
    const params = parseRouteParams(context.params, clipCommentParamSchema);
    const body = await parseJsonBody(req, clipCommentCreateBodySchema);
    const comment = await createClipCommentAsUser(
      userId,
      params.clipId,
      body.body,
      body.atMs,
      body.clientRequestId,
    );

    return json(comment, { status: 201 });
  },
});
