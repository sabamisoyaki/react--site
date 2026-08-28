"use client";

import { useEffect } from "react";
import { linkExtensionToCurrentUser } from "@/lib/extension/client";

const CHECK_TIMEOUT_MS = 1000;
const CHECK_ATTEMPTS = 3;
const CHECK_RETRY_DELAY_MS = 250;

type ExtensionAuthStatus = {
  available: boolean;
  loggedIn: boolean;
  extensionInstanceId: string | null;
};

function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function checkExtensionAuthStatus(): Promise<ExtensionAuthStatus> {
  return new Promise((resolve) => {
    const requestId = createRequestId();
    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve({ available: false, loggedIn: false, extensionInstanceId: null });
    }, CHECK_TIMEOUT_MS);

    function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "EXTENSION_AUTH_STATUS") {
        if (event.data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        resolve({
          available: true,
          loggedIn: Boolean(event.data.loggedIn),
          extensionInstanceId:
            typeof event.data.extensionInstanceId === "string"
              ? event.data.extensionInstanceId
              : null,
        });
      }
    }

    window.addEventListener("message", handler);
    window.postMessage(
      { type: "EXTENSION_CHECK_AUTH", requestId },
      window.location.origin,
    );
  });
}

export async function checkExtensionAuthStatusWithRetry(
  check: () => Promise<ExtensionAuthStatus> = checkExtensionAuthStatus,
  wait: (delayMs: number) => Promise<void> = (delayMs) =>
    new Promise((resolve) => setTimeout(resolve, delayMs)),
): Promise<ExtensionAuthStatus> {
  let status: ExtensionAuthStatus = {
    available: false,
    loggedIn: false,
    extensionInstanceId: null,
  };

  for (let attempt = 0; attempt < CHECK_ATTEMPTS; attempt += 1) {
    status = await check();
    if (status.available) return status;
    if (attempt < CHECK_ATTEMPTS - 1) await wait(CHECK_RETRY_DELAY_MS);
  }

  return status;
}

export function ExtensionLinker() {
  useEffect(() => {
    async function maybeLink() {
      try {
        const status = await checkExtensionAuthStatusWithRetry();
        if (!status.available || status.loggedIn) return;
        if (!status.extensionInstanceId) return;

        await linkExtensionToCurrentUser(status.extensionInstanceId);
      } catch (error) {
        console.warn("Failed to link browser extension", error);
      }
    }

    void maybeLink();
  }, []);

  return null;
}
