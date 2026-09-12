// biome-ignore-all lint/security/noSecrets: Japanese UI labels are false positives.
"use client";

import {
  COMMENT_BODY_MAX_CODE_POINTS,
  countUnicodeCodePoints,
  limitUnicodeCodePoints,
} from "@/lib/comments/text";

type CommentComposerProps = {
  body: string;
  submitting: boolean;
  canSubmit: boolean;
  onBodyChange: (body: string) => void;
  onSubmit: () => void;
};

export default function CommentComposer({
  body,
  submitting,
  canSubmit,
  onBodyChange,
  onSubmit,
}: CommentComposerProps) {
  const bodyCodePointCount = countUnicodeCodePoints(body);
  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="min-h-20 w-full resize-y rounded-xl border-2 border-ink px-3.5 py-2 text-[14px] outline-none placeholder:text-ink-muted focus:border-accent"
        placeholder="この切り抜きの感想を書く"
        value={body}
        onChange={(e) =>
          onBodyChange(
            limitUnicodeCodePoints(
              e.target.value,
              COMMENT_BODY_MAX_CODE_POINTS,
            ),
          )
        }
      />
      <div className="flex items-center gap-3">
        <span className="font-data text-[11.5px] text-ink-muted tabular-nums">
          {bodyCodePointCount} / {COMMENT_BODY_MAX_CODE_POINTS}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="ml-auto cursor-pointer rounded-full bg-accent px-5 py-2 text-[13px] font-extrabold text-white shadow-sticker-ink hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {submitting ? "送信中…" : "コメントする"}
        </button>
      </div>
    </div>
  );
}
