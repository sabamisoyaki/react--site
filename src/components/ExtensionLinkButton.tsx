"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { linkExtensionToCurrentUserFromUserAction } from "@/lib/extension/client";

type Status = "idle" | "loading" | "success" | "error";

const MESSAGE_TIMEOUT =
  // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
  "拡張機能が応答しませんでした。インストールされているか確認してください。";
// biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
const MESSAGE_AUTH = "ログイン状態を確認してから再度お試しください。";
// biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
const MESSAGE_SUCCESS = "拡張機能の連携が完了しました。";
const LABEL_LOADING = "連携中...";
// biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
const LABEL_LINKED = "連携済み";
// biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
const LABEL_LINK = "拡張機能を連携する";

function resolveErrorMessage(message: string): string {
  if (message === "Extension response timeout") {
    return MESSAGE_TIMEOUT;
  }
  if (message === "UNAUTHORIZED" || message === "Authentication required") {
    return MESSAGE_AUTH;
  }
  return `連携に失敗しました: ${message}`;
}

export function ExtensionLinkButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setStatus("loading");
    setMessage("");

    try {
      await linkExtensionToCurrentUserFromUserAction();
      setStatus("success");
      setMessage(MESSAGE_SUCCESS);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      if (errMsg === "Unauthorized" || errMsg === "Authentication required") {
        router.push("/login");
        return;
      }

      setStatus("error");
      setMessage(resolveErrorMessage(errMsg));
    }
  }

  return (
    <div>
      <button
        className="cursor-pointer rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[13px] font-extrabold hover:bg-chip disabled:cursor-not-allowed disabled:opacity-40"
        disabled={status === "loading" || status === "success"}
        onClick={handleClick}
        type="button"
      >
        {status === "loading"
          ? LABEL_LOADING
          : status === "success"
            ? LABEL_LINKED
            : LABEL_LINK}
      </button>
      {message && (
        <p
          className={
            status === "success"
              ? "mt-2 text-[13px] font-bold text-emerald-700"
              : "mt-2 text-[13px] font-bold text-accent"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
