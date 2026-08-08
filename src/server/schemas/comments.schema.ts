import { z } from "zod";

import { cursorPaginationQuerySchema, idSchema } from "@/server/schemas/common";

// clip_comments.body は VarChar(500)。拡張API（extension.schema.ts）と
// サイトAPI で同じ列に書くので、長さと trim のルールはここを唯一の出所にする。
export const clipCommentBodySchema = z.string().trim().min(1).max(500);

export const clipCommentListQuerySchema = cursorPaginationQuerySchema;

export const clipCommentCreateBodySchema = z
  .object({
    body: clipCommentBodySchema,
  })
  .strict();

export const clipCommentParamSchema = z.object({ clipId: idSchema });

export type ClipCommentListQuery = z.infer<typeof clipCommentListQuerySchema>;
export type ClipCommentCreateBody = z.infer<typeof clipCommentCreateBodySchema>;
export type ClipCommentParam = z.infer<typeof clipCommentParamSchema>;
