// biome-ignore-all lint/security/noSecrets: Japanese fallback UI text is a false positive.

interface ClipLike {
  service?: string | null;
}

export function formatDateJa(value: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    // timeZone を省略すると実行ホストの TZ に従うため、
    // 表示日が閲覧者の端末（および CI ランナー）で変わってしまう。
    timeZone: "Asia/Tokyo",
  }).format(value);
}

export function collectSubscriptionServices(clips: ClipLike[]): string[] {
  return Array.from(
    new Set(
      clips
        .map((clip) => clip.service)
        .filter((service): service is string => typeof service === "string")
        .map((service) => service.trim())
        .filter(Boolean),
    ),
  );
}

export function formatSubscriptionLabel(services: string[]): string {
  return services.length > 0 ? services.join(" / ") : "未連携（仮表示）";
}

interface LinkedExtensionRowLike {
  extensionInstanceId: string;
  linkedAt: Date;
  lastSeenAt: Date;
}

export function maskInstanceId(instanceId: string): string {
  return instanceId.length > 8 ? `${instanceId.slice(0, 8)}…` : instanceId;
}

export function formatLinkedExtensionRow(row: LinkedExtensionRowLike): {
  maskedInstanceId: string;
  linkedAtLabel: string;
  lastSeenAtLabel: string;
} {
  return {
    maskedInstanceId: maskInstanceId(row.extensionInstanceId),
    linkedAtLabel: formatDateJa(row.linkedAt),
    lastSeenAtLabel: formatDateJa(row.lastSeenAt),
  };
}
