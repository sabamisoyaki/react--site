import { z } from "zod";

import { cursorPaginationQuerySchema, idSchema } from "@/server/schemas/common";

// clip_comments.body は VarChar(500)。拡張API（extension.schema.ts）と
// サイトAPI で同じ列に書くので、長さと trim のルールはここを唯一の出所にする。
export const clipCommentBodySchema = z.string().trim().min(1).max(500);

export const clipCommentListQuerySchema = cursorPaginationQuerySchema;

// 時刻アンカー。clips.start_ms / end_ms と同じ「動画内の位置」座標系のミリ秒。
// 省略・null は「クリップ全体へのコメント」。範囲がクリップ内に収まるかは
// クリップを読まないと判定できないのでサービス層で検証する。
export const clipCommentAtMsSchema = z.number().int().min(0).nullish();

export const clipCommentCreateBodySchema = z
  .object({
    body: clipCommentBodySchema,
    atMs: clipCommentAtMsSchema,
    // 通信再試行で同じコメントを二重作成しないための任意キー。
    // 同じユーザー内で一意に扱う。
    clientRequestId: z.uuid().optional(),
  })
  .strict();

export const clipCommentParamSchema = z.object({ clipId: idSchema });

export const clipCommentIdParamSchema = z.object({
  clipId: idSchema,
  commentId: idSchema,
});

// 通報理由。DB は VarChar(32) の素の文字列で、値の妥当性はここで担保する。
// 「その他」を選んだときだけ note が意味を持つが、必須にはしない。
export const CLIP_COMMENT_REPORT_REASONS = [
  "spam",
  "harassment",
  "spoiler",
  "other",
] as const;

export const clipCommentReportCreateBodySchema = z
  .object({
    reason: z.enum(CLIP_COMMENT_REPORT_REASONS),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const clipCommentReportListQuerySchema = cursorPaginationQuerySchema;

export const clipCommentReportsResolveBodySchema = z
  .object({
    resolution: z.literal("dismissed"),
  })
  .strict();

export type ClipCommentListQuery = z.infer<typeof clipCommentListQuerySchema>;
export type ClipCommentCreateBody = z.infer<typeof clipCommentCreateBodySchema>;
export type ClipCommentParam = z.infer<typeof clipCommentParamSchema>;
export type ClipCommentIdParam = z.infer<typeof clipCommentIdParamSchema>;
export type ClipCommentReportCreateBody = z.infer<
  typeof clipCommentReportCreateBodySchema
>;
export type ClipCommentReportListQuery = z.infer<
  typeof clipCommentReportListQuerySchema
>;
export type ClipCommentReportsResolveBody = z.infer<
  typeof clipCommentReportsResolveBodySchema
>;
