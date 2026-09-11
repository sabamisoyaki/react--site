// src/app/(site_data)/(protected)/playlists/[playlistId]/PlaylistView.tsx
"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { clearPlaybackClipId } from "@/lib/clips/playback";
import { createHandoffRequestId } from "@/lib/extension/handoffRequest";
import SortableClipItem from "./SortableClipItem";

interface Clip {
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
  rating?: number;
}

interface PlaylistClip {
  id: number;
  clip: Clip;
}

interface PlaylistData {
  id: number;
  name: string;
  clips: PlaylistClip[];
  userId: string;
}

interface PlaylistViewProps {
  playlist: PlaylistData;
  userId: string | null;
}
export default function PlaylistView({ playlist, userId }: PlaylistViewProps) {
  const isOwner = userId === playlist.userId;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [items, setItems] = useState(() => playlist.clips);

  const sensors = useSensors(useSensor(PointerSensor));

  async function handleDragEnd(event: DragEndEvent) {
    if (!isOwner) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);

    const newOrder = arrayMove(items, oldIndex, newIndex);
    setItems(newOrder);
  }

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);

  if (!mounted) return <div />;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-ink bg-white p-10 text-center shadow-sticker">
        <strong className="text-[17px] font-black">クリップがありません</strong>
        <p className="text-ink-muted">
          クリップ一覧の「＋」ボタンからこのプレイリストに追加できます。
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={isOwner ? sensors : undefined}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="mb-5 flex items-center gap-3.5">
        <button
          type="button"
          onClick={() => {
            // id / order / 配列順が拡張との契約。order は 0 始まりの配列
            // インデックスで、拡張はこれで再生中クリップを解決する。
            const clips = items.map((pc, index) => ({
              id: pc.clip.id,
              order: index,
              clipname: pc.clip.clipName,
              title: pc.clip.title,
              service: pc.clip.service,
              Subtitles: pc.clip.epnumber,
              url: pc.clip.url,
              startTime: pc.clip.startTime,
              endTime: pc.clip.endTime,
            }));

            // 直前の単体再生で残った clipId cookie を消してから開始する。
            // 残すと拡張がプレイリストと無関係なクリップを現在クリップと
            // 解決しうる（cookie の寿命は 1 時間）。
            clearPlaybackClipId();
            localStorage.setItem("playQueue", JSON.stringify(clips));
            window.postMessage(
              {
                type: "PLAY_PLAYLIST_START",
                requestId: createHandoffRequestId(),
              },
              window.location.origin,
            );
          }}
          className="cursor-pointer rounded-full bg-accent px-5 py-2 text-[13.5px] font-extrabold text-white shadow-sticker-ink hover:bg-accent-strong"
        >
          ▶ プレイリスト再生
        </button>
        <span className="font-data text-[12px] text-ink-muted tabular-nums">
          {items.length} 件のクリップ
        </span>
      </div>

      <div className="flex flex-col gap-5">
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {items.map((pc) => (
            <SortableClipItem
              key={pc.id}
              playlistId={playlist.id}
              clipId={pc.id}
              clip={pc.clip}
              userId={userId}
              isOwner={isOwner}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}
