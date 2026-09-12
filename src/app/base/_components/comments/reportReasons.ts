import type { ReportReason } from "@/lib/comments/types";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "スパム",
  harassment: "嫌がらせ",
  spoiler: "ネタバレ",
  other: "その他",
};
