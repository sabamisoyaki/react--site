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

const UNAVAILABLE: ExtensionAuthStatus = {
  available: false,
  loggedIn: false,
  extensionInstanceId: null,
};

declare global {
  interface Window {
    __CLIP_EXTENSION_PRESENT__?: boolean;
  }
}

/**
 * 拡張が入っているかを同期的に判定する。
 *
 * 拡張は extension_present.js を MAIN world / document_start で流し込み、この
 * フラグを立てる。React の useEffect は必ずその後に走るので、ここでは待たずに読める。
 * manifest が対象にしないオリジン（本番など）ではフラグが立たないため、
 * 応答しない相手に対して postMessage のタイムアウトを積む必要が無くなる。
 */
function isExtensionPresent(): boolean {
  return (
    typeof window !== "undefined" && window.__CLIP_EXTENSION_PRESENT__ === true
  );
}

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

type RetryDeps = {
  check?: () => Promise<ExtensionAuthStatus>;
  wait?: (delayMs: number) => Promise<void>;
  isPresent?: () => boolean;
};

/**
 * content script の注入が hydration に間に合わない場合に備えてリトライする。
 * ただし拡張自体が入っていないなら 1 回も問い合わせない（タイマーを積まない）。
 */
export async function checkExtensionAuthStatusWithRetry({
  check = checkExtensionAuthStatus,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  isPresent = isExtensionPresent,
}: RetryDeps = {}): Promise<ExtensionAuthStatus> {
  if (!isPresent()) return UNAVAILABLE;

  let status: ExtensionAuthStatus = UNAVAILABLE;

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
