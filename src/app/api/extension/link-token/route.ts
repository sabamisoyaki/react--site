import { requireUserId } from "@/server/auth/session";
import {
  buildExtensionCorsHeaders,
  isAllowedClipWriteOrigin,
} from "@/server/http/cors";
import { toErrorPayload } from "@/server/http/errors";
import { json } from "@/server/http/json";
import { issueExtensionLinkToken } from "@/server/services/extensions";

function forbidden(req: Request) {
  return json(
    { message: "OriginNotAllowed", code: "FORBIDDEN" },
    {
      status: 403,
      headers: buildExtensionCorsHeaders(req, { methods: ["POST", "OPTIONS"] }),
    },
  );
}

export async function POST(req: Request) {
  const headers = buildExtensionCorsHeaders(req, {
    methods: ["POST", "OPTIONS"],
  });
  if (!isAllowedClipWriteOrigin(req)) return forbidden(req);

  try {
    const userId = await requireUserId();
    const result = await issueExtensionLinkToken(userId);
    return json(result, { headers });
  } catch (error) {
    const { status, body } = toErrorPayload(error);
    return json(body, { status, headers });
  }
}

export function OPTIONS(req: Request) {
  if (!isAllowedClipWriteOrigin(req)) {
    return new Response(null, {
      status: 403,
      headers: buildExtensionCorsHeaders(req, { methods: ["POST", "OPTIONS"] }),
    });
  }

  return new Response(null, {
    status: 200,
    headers: buildExtensionCorsHeaders(req, { methods: ["POST", "OPTIONS"] }),
  });
}
