import { createRouteHandlers } from "@/server/api/handler";
import { requireUserId } from "@/server/auth/session";
import { json } from "@/server/http/json";
import { parseJsonBody, parseRouteParams } from "@/server/http/validation";
import {
  clipCommentIdParamSchema,
  clipCommentReportCreateBodySchema,
} from "@/server/schemas/comments.schema";
import { reportClipComment } from "@/server/services/comments";

export const { POST } = createRouteHandlers({
  // 通報の宛先はクリップ所有者（このアプリに管理者ロールは無い）。
  POST: async (req, context) => {
    const userId = await requireUserId();
    const params = parseRouteParams(context.params, clipCommentIdParamSchema);
    const body = await parseJsonBody(req, clipCommentReportCreateBodySchema);
    const report = await reportClipComment(
      userId,
      params.clipId,
      params.commentId,
      body,
    );

    return json(report, { status: 201 });
  },
});
