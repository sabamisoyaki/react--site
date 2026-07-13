// クリップの外部サービス再生まわりの共通ロジック。
// clipData（カード）とShelfRail（最近観たクリップ）の両方から使う。

export const SERVICE_LABELS: Record<string, string> = {
  Netflix: "Netflix",
  NETFLIX: "NETFLIX",
  prime: "PRIME VIDEO",
  PRIME_VIDEO: "PRIME VIDEO",
};

export function serviceLabel(code: string): string {
  return SERVICE_LABELS[code] ?? code;
}

export function buildServiceUrl(code: string, url: string): string | null {
  switch (code) {
    case "Netflix":
    case "NETFLIX":
      return `https://www.netflix.com${url}`;
    case "prime":
    case "PRIME_VIDEO":
      return `https://www.amazon.co.jp/primevideo${url}`;
    default:
      return null;
  }
}

export function formatTime(seconds: unknown): string | null {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatTimeRange(start: unknown, end: unknown): string {
  return [formatTime(start), formatTime(end)].filter(Boolean).join("–");
}

export type ClipPlayback = {
  name: string;
  title: string;
  username: string;
  service: string;
  url: string;
  starttime: number | undefined;
  endtime: number | undefined;
};

/**
 * クリップを外部サービスの該当場面で開く。
 * 旧拡張機能連携のために legacy cookie 群と clipSelected イベントも発火する。
 * 開けた場合 true、未対応サービスの場合 false を返す。
 */
export function openClipPlayback(clip: ClipPlayback): boolean {
  const { name, title, username, service, url, starttime, endtime } = clip;

  // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
  document.cookie = `name=${encodeURIComponent(name)}; path=/; max-age=3600; secure; samesite=lax`;
  // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
  document.cookie = `title=${encodeURIComponent(title)}; path=/; max-age=3600; secure; samesite=lax`;
  // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
  document.cookie = `username=${encodeURIComponent(username)}; path=/; max-age=3600; secure; samesite=lax`;
  // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
  document.cookie = `starttime=${encodeURIComponent(String(starttime))}; path=/; max-age=3600; secure`;
  // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
  document.cookie = `endtime=${encodeURIComponent(String(endtime))}; path=/; max-age=3600; secure`;
  // biome-ignore lint/suspicious/noDocumentCookie: The player integration currently reads these legacy cookies.
  document.cookie = `url=${encodeURIComponent(url)}; path=/; max-age=3600; secure`;

  const event = new CustomEvent("clipSelected", {
    detail: { name, username, starttime, endtime },
  });
  window.dispatchEvent(event);

  const urlLink = buildServiceUrl(service, url);
  if (!urlLink) return false;

  const separator = urlLink.includes("?") ? "&" : "?";
  window.open(`${urlLink}${separator}t=${starttime}`, "_blank");
  return true;
}
