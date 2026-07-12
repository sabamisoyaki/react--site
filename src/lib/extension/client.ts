const TIMEOUT_MS = 3000;

function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function getExtensionInstanceIdFromExtension(): Promise<string> {
  const requestId = createRequestId();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Extension response timeout"));
    }, TIMEOUT_MS);

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type !== "EXTENSION_INSTANCE_ID_RESPONSE") return;
      if (data.requestId !== requestId) return;

      window.clearTimeout(timeout);
      window.removeEventListener("message", handler);

      if (!data.ok || !data.extensionInstanceId) {
        reject(new Error(data.message || "Failed to get extensionInstanceId"));
        return;
      }

      resolve(data.extensionInstanceId);
    };

    window.addEventListener("message", handler);
    window.postMessage(
      { type: "GET_EXTENSION_INSTANCE_ID", requestId },
      window.location.origin,
    );
  });
}

function postExtensionAuthToken(
  extensionInstanceId: string,
  extensionAuthToken: string,
  expiresAt: string,
) {
  window.postMessage(
    {
      type: "EXT_LINK_WITH_AUTH_TOKEN",
      requestId: createRequestId(),
      extensionInstanceId,
      extensionAuthToken,
      expiresAt,
      token: extensionAuthToken,
    },
    window.location.origin,
  );
}

async function requestLinkToken() {
  const res = await fetch("/api/extension/link-token", {
    method: "POST",
    credentials: "include",
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message || "Failed to issue extension link token");
  }

  return body as { linkToken: string; expiresAt: string };
}

async function linkExtension(extensionInstanceId: string, linkToken: string) {
  const res = await fetch("/api/extension/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ extensionInstanceId, linkToken }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message || "Failed to link extension");
  }

  return body as { ok: true; extensionAuthToken: string; expiresAt: string };
}

export async function linkExtensionToCurrentUser(
  knownExtensionInstanceId?: string,
) {
  const extensionInstanceId =
    knownExtensionInstanceId ?? (await getExtensionInstanceIdFromExtension());
  const { linkToken } = await requestLinkToken();
  const result = await linkExtension(extensionInstanceId, linkToken);

  postExtensionAuthToken(
    extensionInstanceId,
    result.extensionAuthToken,
    result.expiresAt,
  );

  return { ...result, extensionInstanceId };
}
