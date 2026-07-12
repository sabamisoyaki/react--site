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
import SortableClipItem from "./SortableClipItem";

interface Clip {
  id: number;
  title: string;
  clipName: string;
  user: string;
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
      <div className="status-box">
        <strong>クリップがありません</strong>
        <p>クリップ一覧の「＋」ボタンからこのプレイリストに追加できます。</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={isOwner ? sensors : undefined}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="playlist-toolbar">
        <button
          type="button"
          onClick={() => {
            const clips = items.map((pc) => ({
              id: pc.clip.id,
              clipname: pc.clip.clipName,
              title: pc.clip.title,
              service: pc.clip.service,
              Subtitles: pc.clip.epnumber,
              url: pc.clip.url,
              startTime: pc.clip.startTime,
              endTime: pc.clip.endTime,
            }));

            localStorage.setItem("playQueue", JSON.stringify(clips));
            window.postMessage({ type: "PLAY_PLAYLIST_START" });
          }}
          className="btn btn-primary"
        >
          ▶ プレイリスト再生
        </button>
        <span className="pager-info">{items.length} 件のクリップ</span>
      </div>

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
    </DndContext>
  );
}
