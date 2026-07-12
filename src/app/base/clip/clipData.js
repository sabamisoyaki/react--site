// src/app/base/clip/clipData.js
"use client";

import { useState } from "react";
import PlaylistCreateModal from "@/app/base/_components/PlaylistModal";

const SERVICE_META = {
  Netflix: { label: "NETFLIX", badge: "bg-badge-nf" },
  NETFLIX: { label: "NETFLIX", badge: "bg-badge-nf" },
  prime: { label: "PRIME VIDEO", badge: "bg-badge-pv" },
  PRIME_VIDEO: { label: "PRIME VIDEO", badge: "bg-badge-pv" },
};

function formatTime(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

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
  let urlLink;
  switch (icon) {
    case "Netflix":
    case "NETFLIX":
      urlLink = `https://www.netflix.com${url}`;
      break;
    case "prime":
    case "PRIME_VIDEO":
      urlLink = `https://www.amazon.co.jp/primevideo${url}`;
      break;
    default:
      urlLink = null;
  }

  const service = SERVICE_META[icon] ?? { label: icon, badge: "bg-chip" };
  const timeRange = [formatTime(starttime), formatTime(endtime)]
    .filter(Boolean)
    .join("–");

  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
    document.cookie = `name=${encodeURIComponent(name)}; path=/; max-age=3600; secure; samesite=lax`;
    // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
    document.cookie = `title=${encodeURIComponent(title)}; path=/; max-age=3600; secure; samesite=lax`;
    // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
    document.cookie = `username=${encodeURIComponent(username)}; path=/; max-age=3600; secure; samesite=lax`;
    // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
    document.cookie = `starttime=${encodeURIComponent(starttime)}; path=/; max-age=3600; secure`;
    // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
    document.cookie = `endtime=${encodeURIComponent(endtime)}; path=/; max-age=3600; secure`;
    // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
    document.cookie = `url=${encodeURIComponent(url)}; path=/; max-age=3600; secure`;

    const event = new CustomEvent("clipSelected", {
      detail: { name, username, starttime, endtime },
    });
    window.dispatchEvent(event);

    if (urlLink) {
      const separator = urlLink.includes("?") ? "&" : "?";
      window.open(`${urlLink}${separator}t=${starttime}`, "_blank");
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
        className={`absolute -top-3 right-4 rotate-3 rounded border-2 border-ink px-2.5 py-0.5 font-data text-[10px] font-bold tracking-wide ${service.badge}`}
      >
        {service.label}
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
            urlLink
              ? `${service.label} でこの場面を再生`
              : // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
                "再生リンクがありません"
          }
        >
          ▶ 観る
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
    </article>
  );
}

export default Clip;
