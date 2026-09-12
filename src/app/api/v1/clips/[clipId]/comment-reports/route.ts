import { createRouteHandlers } from "@/server/api/handler";
import { requireUserId } from "@/server/auth/session";
import { json } from "@/server/http/json";
import {
  buildCursorPaginationMeta,
  parseCursorPagination,
} from "@/server/http/pagination";
import { parseRouteParams, parseSearchParams } from "@/server/http/validation";
import {
  clipCommentParamSchema,
  clipCommentReportListQuerySchema,
} from "@/server/schemas/comments.schema";
import { listClipCommentReports } from "@/server/services/comments";

// パスを /comments/reports にしないのは、同階層の [commentId] と
// 静的/動的セグメントの優先順位で解決が決まる形になり読み手に紛らわしいため。
export const { GET } = createRouteHandlers({
  // クリップ所有者だけが、自分のクリップに付いたコメントの通報を見られる。
  GET: async (req, context) => {
    const userId = await requireUserId();
    const params = parseRouteParams(context.params, clipCommentParamSchema);
    const query = parseSearchParams(
      req.nextUrl.searchParams,
      clipCommentReportListQuerySchema,
    );
    const pagination = parseCursorPagination(query);
    const { data, hasNext, nextCursor } = await listClipCommentReports(
      userId,
      params.clipId,
      pagination,
    );
    const meta = buildCursorPaginationMeta(pagination, hasNext, nextCursor);

    return json({ data, meta });
  },
});
