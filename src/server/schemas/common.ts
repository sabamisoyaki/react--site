import { z } from "zod";

// DB の識別子は BIGINT だが、現行の HTTP 契約は JSON number を使う。
// JavaScript が正確に扱えない値を丸めて別リソースへ解決しないよう、API 境界では
// safe integer に制限する。将来この上限へ近づく前に ID を文字列契約へ移行する。
export const idSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const cursorPaginationQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export const includeDeletedQuerySchema = z.object({
  includeDeleted: z.coerce.boolean().optional().default(false),
});

export const sortQuerySchema = z.object({
  sort: z
    .string()
    .max(200)
    .regex(/^[^\n\r]*$/)
    .optional(),
});

export const hardDeleteQuerySchema = z.object({
  hard: z.coerce.boolean().optional().default(false),
});

export const paginatedQuerySchema = paginationQuerySchema.extend(
  sortQuerySchema.shape,
);

export const nullableString = (max?: number) =>
  (max ? z.string().max(max) : z.string()).optional().nullable();

export const optionalString = (max?: number) =>
  (max ? z.string().max(max) : z.string()).optional();

export const urlString = (max?: number) => (max ? z.url().max(max) : z.url());

export const pageParamSchema = z.object({
  page: paginationQuerySchema.shape.page,
  pageSize: paginationQuerySchema.shape.pageSize,
});

export const favoriteQuerySchema = z.object({
  page: paginationQuerySchema.shape.page,
  pageSize: paginationQuerySchema.shape.pageSize,
});

export function nonEmptyBody<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.superRefine((data, ctx) => {
    if (Object.values(data).every((value) => typeof value === "undefined")) {
      ctx.addIssue({
        code: "custom",
        message: "At least one field must be provided.",
      });
    }
  });
}

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;
export type SortQuery = z.infer<typeof sortQuerySchema>;
export type HardDeleteQuery = z.infer<typeof hardDeleteQuerySchema>;
