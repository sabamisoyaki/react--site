import { createRouteHandlers } from "@/server/api/handler";
import { requireUserId } from "@/server/auth/session";
import { json } from "@/server/http/json";
import { parseRouteParams } from "@/server/http/validation";
import { clipCommentParamSchema } from "@/server/schemas/comments.schema";
import { listClipCommentReports } from "@/server/services/comments";

// パスを /comments/reports にしないのは、同階層の [commentId] と
// 静的/動的セグメントの優先順位で解決が決まる形になり読み手に紛らわしいため。
export const { GET } = createRouteHandlers({
  // クリップ所有者だけが、自分のクリップに付いたコメントの通報を見られる。
  // 通報のあるコメント数で頭打ちになるためページングは持たない。
  GET: async (_req, context) => {
    const userId = await requireUserId();
    const params = parseRouteParams(context.params, clipCommentParamSchema);
    const data = await listClipCommentReports(userId, params.clipId);

    return json({ data });
  },
});
