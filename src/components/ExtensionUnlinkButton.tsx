"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "idle" | "loading" | "error";

// biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
const LABEL_UNLINK = "連携を解除";
const LABEL_LOADING = "解除中...";

type Props = {
  linkedExtensionId: number;
  extensionInstanceId: string;
};

function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ExtensionUnlinkButton({
  linkedExtensionId,
  extensionInstanceId,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
    if (!window.confirm("この拡張機能の連携を解除しますか？")) {
      return;
    }
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/extension/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ linkedExtensionId }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.message || "Failed to unlink extension");
      }

      // このブラウザの拡張が対象なら、ローカルのトークンも即時破棄させる。
      // 別ブラウザの連携を解除した場合は instanceId 不一致で拡張側が無視し、
      // そちらは次回同期の 401 で自己修復される。
      window.postMessage(
        {
          type: "EXTENSION_UNLINKED",
          requestId: createRequestId(),
          extensionInstanceId: body.extensionInstanceId ?? extensionInstanceId,
        },
        window.location.origin,
      );

      router.refresh();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setMessage(`解除に失敗しました: ${errMsg}`);
      return;
    }

    setStatus("idle");
  }

  return (
    <span>
      <button
        className="cursor-pointer rounded-full border-2 border-accent bg-white px-3.5 py-1 text-[12.5px] font-extrabold text-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        disabled={status === "loading"}
        onClick={handleClick}
        type="button"
      >
        {status === "loading" ? LABEL_LOADING : LABEL_UNLINK}
      </button>
      {message && (
        <p className="mt-2 text-[13px] font-bold text-accent">{message}</p>
      )}
    </span>
  );
}
