// クリップの外部サービス再生まわりの共通ロジック。
// clipData（カード）とShelfRail（最近観たクリップ）の両方から使う。

export const SERVICE_LABELS: Record<string, string> = {
  Netflix: "Netflix",
  NETFLIX: "NETFLIX",
  prime: "PRIME VIDEO",
  PRIME_VIDEO: "PRIME VIDEO",
  DISNEY_PLUS: "Disney+",
};

export function serviceLabel(code: string): string {
  return SERVICE_LABELS[code] ?? code;
}

// 絶対URLで保存されたクリップを開いてよいホスト（サービスコードごとに突合する）。
// クリップは vodId/service と url を別々に保存するため、ラベルと URL の
// 食い違い（Netflix 扱いのクリップが Prime のURLを指す等）は未対応として弾く。
const SERVICE_HOSTS: Record<string, ReadonlySet<string>> = {
  Netflix: new Set(["netflix.com", "www.netflix.com"]),
  prime: new Set([
    "amazon.co.jp",
    "www.amazon.co.jp",
    "primevideo.com",
    "www.primevideo.com",
  ]),
  DISNEY_PLUS: new Set(["disneyplus.com", "www.disneyplus.com"]),
};
SERVICE_HOSTS.NETFLIX = SERVICE_HOSTS.Netflix;
SERVICE_HOSTS.PRIME_VIDEO = SERVICE_HOSTS.prime;

export function buildServiceUrl(code: string, url: string): string | null {
  const trimmed = url.trim();

  // DB の url は完全URLの場合と相対パスの場合が混在している。
  // 完全URLはそのまま使う（当該サービスのホスト かつ https のみ許可）。
  // http:// の downgrade URL を保存データ由来で開く理由はないため弾く。
  if (/^https?:\/\//.test(trimmed)) {
    const hosts = SERVICE_HOSTS[code];
    if (!hosts) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:") return null;
      return hosts.has(parsed.hostname) ? parsed.href : null;
    } catch {
      return null;
    }
  }

  // 相対パスはサービスごとのベースURLを前置する
  if (!trimmed.startsWith("/")) return null;
  switch (code) {
    case "Netflix":
    case "NETFLIX":
      return `https://www.netflix.com${trimmed}`;
    case "prime":
    case "PRIME_VIDEO":
      return `https://www.amazon.co.jp/primevideo${trimmed}`;
    case "DISNEY_PLUS":
      return `https://www.disneyplus.com${trimmed}`;
    default:
      return null;
  }
}

/** 再生開始位置つきの最終URLを組み立てる（開けない場合は null） */
export function buildPlaybackUrl(
  code: string,
  url: string,
  starttime: number | undefined,
): string | null {
  const base = buildServiceUrl(code, url);
  if (!base) return null;
  if (starttime === undefined) return base;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}t=${starttime}`;
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
  id?: number;
};

/**
 * クリップを外部サービスの該当場面で開く。
 * 旧拡張機能連携のために legacy cookie 群と clipSelected イベントも発火する。
 * 開けた場合 true、未対応サービスの場合 false を返す。
 */
export function openClipPlayback(clip: ClipPlayback): boolean {
  const { name, title, username, service, url, starttime, endtime, id } = clip;

  const playbackUrl = buildPlaybackUrl(service, url, starttime);
  if (!playbackUrl) return false;

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

  if (id !== undefined && Number.isSafeInteger(id) && id > 0) {
    // biome-ignore lint/suspicious/noDocumentCookie: Extension integration reads this cookie.
    document.cookie = `clipId=${encodeURIComponent(String(id))}; path=/; max-age=3600; secure; samesite=lax`;
  }

  const detail: Record<string, unknown> = {
    name,
    username,
    starttime,
    endtime,
  };
  if (id !== undefined && Number.isSafeInteger(id) && id > 0) {
    detail.clipId = id;
  }

  const event = new CustomEvent("clipSelected", { detail });
  window.dispatchEvent(event);

  window.open(playbackUrl, "_blank");
  return true;
}
