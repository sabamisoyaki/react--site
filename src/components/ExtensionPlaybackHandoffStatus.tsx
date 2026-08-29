// biome-ignore-all lint/security/noSecrets: Japanese UI messages are false positives.
"use client";

import { useEffect, useState } from "react";
import { consumeHandoffResult } from "@/lib/extension/handoffRequest";

const RESULT_TYPE = "EXTENSION_PLAYBACK_HANDOFF_RESULT";
const DISPLAY_MS = 6000;

const FAILURE_MESSAGES: Record<string, string> = {
  invalid_payload: "再生情報の形式が正しくありません。",
  invalid_clip_id: "クリップIDが正しくありません。",
  clip_id_mismatch: "クリップIDが一致しません。",
  invalid_service: "対応していない配信サービスです。",
  invalid_url: "再生URLが正しくありません。",
  invalid_time_range: "再生時間の範囲が正しくありません。",
  invalid_order: "プレイリストの順番が正しくありません。",
  duplicate_order: "プレイリストの順番が重複しています。",
  empty_playlist: "プレイリストが空です。",
  queue_too_large: "プレイリストの件数が上限を超えています。",
  payload_too_large: "再生情報のサイズが上限を超えています。",
  background_unavailable: "拡張機能のbackgroundに接続できません。",
  handoff_failed: "拡張機能へ再生情報を渡せませんでした。",
};

type HandoffStatus = {
  ok: boolean;
  message: string;
};

export function ExtensionPlaybackHandoffStatus() {
  const [status, setStatus] = useState<HandoffStatus | null>(null);

  useEffect(() => {
    let hideTimer: number | undefined;

    function handleMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }
      const data = event.data;
      if (!data || typeof data !== "object" || data.type !== RESULT_TYPE) {
        return;
      }
      // 別タブ・別リクエストの結果を「いま押したクリップの結果」として
      // 出さないよう、自分が発行した requestId の結果だけを受ける。
      // 受理済みとそれより古い id は回収されるので、遅れて届いた
      // 古い結果が新しい表示を上書きすることは無い。
      if (!consumeHandoffResult(data.requestId)) return;

      const ok = data.ok === true;
      const reason =
        typeof data.reason === "string" ? data.reason : "handoff_failed";
      setStatus({
        ok,
        message: ok
          ? "拡張機能に再生情報を渡しました。"
          : (FAILURE_MESSAGES[reason] ?? FAILURE_MESSAGES.handoff_failed),
      });

      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setStatus(null), DISPLAY_MS);
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, []);

  if (!status) return null;

  return (
    <div
      aria-live="polite"
      className={`fixed right-4 bottom-4 z-[2147483000] max-w-sm rounded-xl border-2 bg-white px-4 py-3 text-sm font-bold shadow-lg ${
        status.ok
          ? "border-emerald-600 text-emerald-800"
          : "border-red-600 text-red-800"
      }`}
      data-extension-handoff-status=""
      role={status.ok ? "status" : "alert"}
    >
      {status.message}
    </div>
  );
}
