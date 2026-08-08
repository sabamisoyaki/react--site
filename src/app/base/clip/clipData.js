// src/app/base/clip/clipData.js
"use client";

import { useState } from "react";
import CommentModal from "@/app/base/_components/CommentModal";
import PlaylistCreateModal from "@/app/base/_components/PlaylistModal";
import {
  buildServiceUrl,
  formatTimeRange,
  openClipPlayback,
  serviceLabel,
} from "@/lib/clips/playback";
import { recordRecentClip } from "@/lib/clips/recentClips";

const SERVICE_BADGES = {
  Netflix: "bg-badge-nf",
  NETFLIX: "bg-badge-nf",
  prime: "bg-badge-pv",
  PRIME_VIDEO: "bg-badge-pv",
};

function Clip({
  name,
  title,
  epnum,
  username,
  icon,
  url,
  starttime,
  endtime,
  userId,
  Id,
}) {
  const playable = buildServiceUrl(icon, url) !== null;
  const badge = SERVICE_BADGES[icon] ?? "bg-chip";
  const timeRange = formatTimeRange(starttime, endtime);

  const [isOpen, setIsOpen] = useState(false);
  const [isCommentOpen, setIsCommentOpen] = useState(false);

  const handleClick = () => {
    const clip = {
      name,
      title,
      username,
      service: icon,
      url,
      starttime,
      endtime,
      id: Number(Id),
    };
    if (openClipPlayback(clip)) {
      recordRecentClip(clip);
    } else {
      alert(
        // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
        "このクリップの再生リンクを開けませんでした（未対応のサービスです）",
      );
    }
  };

  return (
    <article
      className="relative flex h-full flex-col rounded-2xl border-2 border-ink bg-white p-4 pt-5 shadow-sticker"
      data-starttime={starttime}
      data-endtime={endtime}
    >
      <span
        className={`absolute -top-3 right-4 rotate-3 rounded border-2 border-ink px-2.5 py-0.5 font-data text-[10px] font-bold tracking-wide ${badge}`}
      >
        {serviceLabel(icon)}
      </span>

      <h3 className="text-[16px] font-black leading-relaxed">
        <span className="marker">{name}</span>
      </h3>
      <p className="mt-1 truncate text-[12.5px] text-ink-muted">
        {title}
        {epnum ? ` ${epnum}` : ""}
      </p>

      <div className="mt-auto flex items-center gap-2.5 pt-3.5">
        {timeRange && (
          <span className="rounded-md bg-chip px-2 py-0.5 font-data text-[11.5px] tabular-nums">
            {timeRange}
          </span>
        )}
        <span className="truncate text-[12px] text-ink-muted">{username}</span>
        <button
          type="button"
          className="ml-auto shrink-0 cursor-pointer rounded-full border-2 border-ink bg-marker px-3.5 py-1 text-[12.5px] font-extrabold hover:bg-marker-strong"
          onClick={handleClick}
          title={
            playable
              ? `${serviceLabel(icon)} でこの場面を再生`
              : // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
                "再生リンクがありません"
          }
        >
          ▶ 観る
        </button>
        <button
          type="button"
          onClick={() => setIsCommentOpen(true)}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-[13px] font-extrabold hover:bg-chip"
          title="コメントを見る"
          aria-label="コメントを見る"
        >
          💬
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-ink bg-white text-[15px] font-extrabold hover:bg-chip"
          title="プレイリストに追加"
          aria-label="プレイリストに追加"
        >
          ＋
        </button>
      </div>

      <PlaylistCreateModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        userId={userId}
        clipId={Id}
      />

      <CommentModal
        isOpen={isCommentOpen}
        onClose={() => setIsCommentOpen(false)}
        clipId={Id}
        userId={userId}
      />
    </article>
  );
}

export default Clip;
