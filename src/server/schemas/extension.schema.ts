import { z } from "zod";

import { idSchema } from "@/server/schemas/common";
import { legacyClipCreateBodySchema } from "@/server/schemas/legacy-clips.schema";

const uuidSchema = z.uuid();

const syncItemSchema = z
  .object({
    clientItemId: uuidSchema,
    type: z.literal("clip"),
    createdAt: z
      .string()
      .datetime({ offset: true })
      .optional()
      .nullable()
      .transform((value) => (value ? new Date(value) : null)),
    payload: legacyClipCreateBodySchema,
  })
  .strict();

export const extensionLinkBodySchema = z
  .object({
    extensionInstanceId: uuidSchema,
    linkToken: z.string().trim().min(1),
  })
  .strict();

export const extensionTokenRefreshBodySchema = z
  .object({
    extensionInstanceId: uuidSchema,
  })
  .strict();

export const extensionUnlinkBodySchema = z
  .object({
    linkedExtensionId: z.number().int().positive(),
  })
  .strict();

export const extensionSyncBodySchema = z
  .object({
    extensionInstanceId: uuidSchema,
    items: z.array(syncItemSchema),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    data.items.forEach((item, index) => {
      if (seen.has(item.clientItemId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "clientItemId"],
          message: "clientItemId must be unique within the request",
        });
        return;
      }

      seen.add(item.clientItemId);
    });
  });

export const extensionCommentListQuerySchema = z
  .object({
    extensionInstanceId: uuidSchema,
    cursor: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  })
  .strict();

export const extensionCommentCreateBodySchema = z
  .object({
    extensionInstanceId: uuidSchema,
    body: z.string().trim().min(1).max(500),
  })
  .strict();

export const extensionClipIdParamSchema = z.object({
  clipId: idSchema,
});

export type ExtensionLinkBody = z.infer<typeof extensionLinkBodySchema>;
export type ExtensionSyncBody = z.infer<typeof extensionSyncBodySchema>;
export type ExtensionCommentListQuery = z.infer<
  typeof extensionCommentListQuerySchema
>;
export type ExtensionCommentCreateBody = z.infer<
  typeof extensionCommentCreateBodySchema
>;
