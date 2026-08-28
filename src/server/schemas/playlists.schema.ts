import { z } from "zod";

import { MAX_QUERY_LENGTH } from "@/lib/search/utils";

import {
  cursorPaginationQuerySchema,
  hardDeleteQuerySchema,
  idSchema,
  includeDeletedQuerySchema,
  nonEmptyBody,
  paginationQuerySchema,
  sortQuerySchema,
} from "@/server/schemas/common";

export const playlistListQuerySchema = paginationQuerySchema
  .extend(includeDeletedQuerySchema.shape)
  .extend(sortQuerySchema.shape)
  .extend({
    userId: idSchema.optional(),
    name: z.string().max(MAX_QUERY_LENGTH).optional(),
  });

export const playlistCursorListQuerySchema = cursorPaginationQuerySchema
  .extend({
    userId: idSchema.optional(),
    name: z.string().max(MAX_QUERY_LENGTH).optional(),
  })
  .strict();

export const playlistCreateBodySchema = z
  .object({ name: z.string().max(255) })
  .strict();

export const playlistUpdateBodySchema = nonEmptyBody(
  z
    .object({
      name: z.string().max(255).optional(),
    })
    .strict(),
);

export const playlistIdParamSchema = z.object({ playlistId: idSchema });

export const playlistClipBodySchema = z.object({ clipId: idSchema });
export const playlistVodBodySchema = z.object({ vodId: idSchema });

export const playlistClipParamSchema = playlistIdParamSchema.extend({
  clipId: idSchema,
});
export const playlistVodParamSchema = playlistIdParamSchema.extend({
  vodId: idSchema,
});

export const playlistChildrenQuerySchema = paginationQuerySchema;
export const playlistChildrenCursorQuerySchema =
  cursorPaginationQuerySchema.strict();

export const playlistDeleteQuerySchema = hardDeleteQuerySchema;

export type PlaylistListQuery = z.infer<typeof playlistListQuerySchema>;
export type PlaylistCursorListQuery = z.infer<
  typeof playlistCursorListQuerySchema
>;
export type PlaylistCreateBody = z.infer<typeof playlistCreateBodySchema>;
export type PlaylistUpdateBody = z.infer<typeof playlistUpdateBodySchema>;
export type PlaylistIdParam = z.infer<typeof playlistIdParamSchema>;
export type PlaylistClipBody = z.infer<typeof playlistClipBodySchema>;
export type PlaylistVodBody = z.infer<typeof playlistVodBodySchema>;
export type PlaylistClipParam = z.infer<typeof playlistClipParamSchema>;
export type PlaylistVodParam = z.infer<typeof playlistVodParamSchema>;
export type PlaylistChildrenQuery = z.infer<typeof playlistChildrenQuerySchema>;
export type PlaylistChildrenCursorQuery = z.infer<
  typeof playlistChildrenCursorQuerySchema
>;
export type PlaylistDeleteQuery = z.infer<typeof playlistDeleteQuerySchema>;
