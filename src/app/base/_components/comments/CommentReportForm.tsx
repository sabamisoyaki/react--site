// biome-ignore-all lint/security/noSecrets: Japanese UI labels are false positives.
"use client";

import {
  countUnicodeCodePoints,
  limitUnicodeCodePoints,
  REPORT_NOTE_MAX_CODE_POINTS,
} from "@/lib/comments/text";
import type { ReportReason } from "@/lib/comments/types";
import { REPORT_REASON_LABELS } from "./reportReasons";

type CommentReportFormProps = {
  reportReason: ReportReason;
  reportNote: string;
  submitting: boolean;
  canSubmitReport: boolean;
  onReasonChange: (reason: ReportReason) => void;
  onNoteChange: (note: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function CommentReportForm({
  reportReason,
  reportNote,
  submitting,
  canSubmitReport,
  onReasonChange,
  onNoteChange,
  onCancel,
  onSubmit,
}: CommentReportFormProps) {
  const reportNoteCodePointCount = countUnicodeCodePoints(reportNote);
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg bg-chip p-2.5">
      <label className="flex flex-col gap-1 text-[12px] font-extrabold">
        理由
        <select
          value={reportReason}
          onChange={(event) =>
            onReasonChange(event.target.value as ReportReason)
          }
          className="rounded-lg border-2 border-ink bg-white px-2 py-1.5"
        >
          {Object.entries(REPORT_REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[12px] font-extrabold">
        補足（任意）
        <textarea
          value={reportNote}
          onChange={(event) =>
            onNoteChange(
              limitUnicodeCodePoints(
                event.target.value,
                REPORT_NOTE_MAX_CODE_POINTS,
              ),
            )
          }
          className="min-h-16 rounded-lg border-2 border-ink bg-white px-2 py-1.5"
        />
      </label>
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto font-data text-[11px] text-ink-muted tabular-nums">
          {reportNoteCodePointCount} / {REPORT_NOTE_MAX_CODE_POINTS}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-full border-2 border-ink bg-white px-3 py-1 text-[12px] font-extrabold"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmitReport}
          className="cursor-pointer rounded-full bg-accent px-3 py-1 text-[12px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "送信中…" : "送信"}
        </button>
      </div>
    </div>
  );
}
