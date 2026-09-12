import { createRouteHandlers } from "@/server/api/handler";
import { requireUserId } from "@/server/auth/session";
import { parseRouteParams } from "@/server/http/validation";
import { clipCommentIdParamSchema } from "@/server/schemas/comments.schema";
import { deleteClipComment } from "@/server/services/comments";

export const { DELETE } = createRouteHandlers({
  // 論理削除。投稿者本人とクリップ所有者（モデレーション）のみ。
  DELETE: async (_req, context) => {
    const userId = await requireUserId();
    const params = parseRouteParams(context.params, clipCommentIdParamSchema);
    await deleteClipComment(userId, params.clipId, params.commentId);

    return new Response(null, { status: 204 });
  },
});
