import { z } from "zod";

import { cursorPaginationQuerySchema, idSchema } from "@/server/schemas/common";

// v1 と拡張API が同じ clip_comments.body (VarChar(500)) に書くので、ここを唯一の出所にする。
// NUL は PostgreSQL が保存できないため、DBエラーになる前に 400 へ落とす。
const withoutNul = (value: string) => !value.includes("\u0000");
const withoutNulMessage = { message: "NUL characters are not allowed" };

export const clipCommentBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine(withoutNul, withoutNulMessage);

export const clipCommentListQuerySchema = cursorPaginationQuerySchema;

// 時刻アンカー(ms)。null は「クリップ全体へのコメント」。
// クリップ範囲に収まるかはクリップを読まないと判定できないのでサービス層で検証する。
export const clipCommentAtMsSchema = z.number().int().min(0).nullish();

export const clipCommentCreateBodySchema = z
  .object({
    body: clipCommentBodySchema,
    atMs: clipCommentAtMsSchema,
    // 再送で二重投稿しないための任意キー。ユーザー内で一意。
    clientRequestId: z.uuid().optional(),
  })
  .strict();

export const clipCommentParamSchema = z.object({ clipId: idSchema });

export const clipCommentIdParamSchema = z.object({
  clipId: idSchema,
  commentId: idSchema,
});

// DB は VarChar(32) の素の文字列なので、値の妥当性はここで担保する。
export const CLIP_COMMENT_REPORT_REASONS = [
  "spam",
  "harassment",
  "spoiler",
  "other",
] as const;

export const clipCommentReportCreateBodySchema = z
  .object({
    reason: z.enum(CLIP_COMMENT_REPORT_REASONS),
    note: z
      .string()
      .trim()
      .max(500)
      .refine(withoutNul, withoutNulMessage)
      .optional()
      .nullable(),
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
