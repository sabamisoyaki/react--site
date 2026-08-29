"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { unlinkExtensionFromCurrentUser } from "@/lib/extension/client";

type Status = "idle" | "loading" | "error";

// biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
const LABEL_UNLINK = "連携を解除";
const LABEL_LOADING = "解除中...";

type Props = {
  linkedExtensionId: number;
  extensionInstanceId: string;
};

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
      await unlinkExtensionFromCurrentUser(
        linkedExtensionId,
        extensionInstanceId,
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
