// src/app/(site_data)/(protected)/playlists/[playlistId]/SortableClipItem.tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import { memo, useMemo, useState } from "react";
import Clip from "@/app/base/clip/clipData";
import { removePlaylistClip } from "@/lib/playlists/client";

interface ClipData {
  id: number;
  title: string;
  clipName: string;
  user: string;
  ownerId: number;
  service: string;
  startTime: number;
  endTime: number;
  url: string;
  epnumber: string;
}

interface Props {
  clipId: number;
  clip: ClipData;
  userId: string | null;
  isOwner: boolean;
  playlistId: number;
  disabled?: boolean;
}

function SortableClipItem({
  clipId,
  playlistId,
  clip,
  userId,
  isOwner,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: clipId, disabled: !isOwner || disabled || removing });

  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      touchAction: "none",
    }),
    [transform, transition],
  );

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-3">
      {/* 左: Clip本体 */}
      <div className="min-w-0 flex-1">
        <Clip
          name={clip.clipName || "切り抜き"}
          title={clip.title || "タイトルがありません"}
          epnum={clip.epnumber || ""}
          url={clip.url || "/browse"}
          username={clip.user || "名無し"}
          icon={clip.service || "unknown"}
          userId={userId}
          ownerId={clip.ownerId}
          starttime={clip.startTime}
          endtime={clip.endTime}
          Id={clip.id}
        />
      </div>
      {/* 右: ハンドル & 削除 */}
      {isOwner && (
        <div className="flex shrink-0 flex-col items-center gap-2 pt-4">
          <div
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="grid h-8 w-8 cursor-grab place-items-center rounded-lg border-2 border-ink bg-white text-[14px] text-ink-muted hover:text-ink active:cursor-grabbing"
            title="ドラッグして並べ替え"
          >
            ☰
          </div>

          <button
            type="button"
            onClick={async () => {
              if (removing || disabled) return;
              if (
                !window.confirm(
                  `「${clip.clipName || "このクリップ"}」をプレイリストから削除しますか？`,
                )
              ) {
                return;
              }
              setRemoving(true);
              setError("");
              try {
                await removePlaylistClip(playlistId, clipId);
                router.refresh();
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setRemoving(false);
              }
            }}
            disabled={removing || disabled}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border-2 border-ink bg-white text-[16px] font-extrabold text-accent hover:bg-badge-nf"
            title="プレイリストから削除"
            aria-label="プレイリストから削除"
          >
            ×
          </button>
          {error && (
            <p role="alert" className="max-w-48 text-[13px] text-accent">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(SortableClipItem);
