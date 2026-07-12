// src/app/base/clip/clipData.js
"use client";

import { useState } from "react";
import PlaylistCreateModal from "@/app/base/_components/PlaylistModal";

const SERVICE_LABELS = {
  Netflix: "Netflix",
  NETFLIX: "Netflix",
  prime: "Prime Video",
  PRIME_VIDEO: "Prime Video",
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

  const serviceLabel = SERVICE_LABELS[icon] ?? icon;

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
    <div className="clip-row" data-starttime={starttime} data-endtime={endtime}>
      <div className="clip-row-main">
        <p className="clip-row-title">{name}</p>
        <p className="clip-row-sub">
          {title}
          {epnum ? ` ${epnum}` : ""} ・ {username}
        </p>
      </div>
      <div className="clip-row-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleClick}
          title={
            urlLink
              ? `${serviceLabel} でこの場面を再生`
              : // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
                "再生リンクがありません"
          }
        >
          ▶ {serviceLabel}
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="btn btn-secondary btn-sm"
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
    </div>
  );
}

export default Clip;
