// クリップの外部サービス再生まわりの共通ロジック。
// clipData（カード）とShelfRail（最近観たクリップ）の両方から使う。

import { createHandoffRequestId } from "@/lib/extension/handoffRequest";

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

// clipId cookie の属性。書き込みと失効で完全に一致させる必要がある
// （path / secure / samesite が違うと同名の別 cookie になり消せない）。
const CLIP_ID_COOKIE_ATTRS = "path=/; secure; samesite=lax";

/**
 * 単体クリップ再生のハンドオフ用 clipId cookie を失効させる。
 *
 * cookie は max-age=3600 で残るため、消さないと「単体再生 → プレイリスト再生」で
 * 直前のクリップの clipId が最大1時間生き残る。プレイリスト再生は playQueue の
 * id / order で現在クリップを解決する契約なので、開始時にここを消して
 * 古い clipId が誤って参照される余地を無くす。
 */
export function clearPlaybackClipId(): void {
  if (typeof document === "undefined") return;
  // biome-ignore lint/suspicious/noDocumentCookie: Extension integration reads this cookie.
  document.cookie = `clipId=; ${CLIP_ID_COOKIE_ATTRS}; max-age=0`;
}

/**
 * クリップを外部サービスの該当場面で開く。
 * 旧拡張機能連携のために legacy cookie 群と clipSelected イベントも発火する。
 * 開けた場合 true、未対応サービスまたは popup がブロックされた場合 false を返す。
 */
export function openClipPlayback(clip: ClipPlayback): boolean {
  const { name, title, username, service, url, starttime, endtime, id } = clip;

  // cookie 書き込みより先に URL と popup の成功を判定する。ハンドオフだけ行うと
  // 再生されないのに、再生中の別クリップのパネルへ誤ったコメントが出る。
  const playbackUrl = buildPlaybackUrl(service, url, starttime);
  if (!playbackUrl) return false;

  const playbackWindow = window.open(playbackUrl, "_blank");
  if (!playbackWindow) return false;

  const hasClipId = id !== undefined && Number.isSafeInteger(id) && id > 0;

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
  // biome-ignore lint/suspicious/noDocumentCookie: Extension integration validates the playback service.
  document.cookie = `service=${encodeURIComponent(service)}; path=/; max-age=3600; secure`;

  if (hasClipId) {
    // biome-ignore lint/suspicious/noDocumentCookie: Extension integration reads this cookie.
    document.cookie = `clipId=${encodeURIComponent(String(id))}; ${CLIP_ID_COOKIE_ATTRS}; max-age=3600`;
  } else {
    // id を持たないクリップのハンドオフで、前回の clipId を残さない
    clearPlaybackClipId();
  }

  const detail: Record<string, unknown> = {
    name,
    username,
    starttime,
    endtime,
    // 拡張は結果通知にこの id をそのまま echo する。表示側が自分の押した
    // ハンドオフの結果だけを拾えるようにするための対応づけ。
    requestId: createHandoffRequestId(),
  };
  if (hasClipId) {
    detail.clipId = id;
  }

  const event = new CustomEvent("clipSelected", { detail });
  window.dispatchEvent(event);
  return true;
}
