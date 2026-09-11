// src/app/(site_data)/(protected)/playlists/[playlistId]/page.tsx
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { getCurrentUser } from "@/server/auth/session";
import { isNotFoundError } from "@/server/http/errors";
import { getPlaylistWithClips } from "@/server/services/playlists";
import PlaylistView from "./PlaylistView";

type PlaylistPageProps = {
  params: Promise<{ playlistId: string }>;
};

export default async function PlaylistPage({ params }: PlaylistPageProps) {
  const { playlistId } = await params;

  const [currentUser, playlist] = await Promise.all([
    getCurrentUser({ id: true }),
    getPlaylistWithClips(Number(playlistId)).catch((err) => {
      if (isNotFoundError(err)) return null;
      throw err;
    }),
  ]);

  const userId = currentUser ? String(currentUser.id) : null;

  if (!playlist) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-ink bg-white p-10 text-center shadow-sticker">
        <strong className="text-[17px] font-black">
          プレイリストが見つかりません
        </strong>
        <p className="text-ink-muted">
          削除されたか、URL が間違っている可能性があります。
        </p>
        <a
          href="/playlists"
          className="rounded-full border-2 border-ink bg-white px-5 py-2 text-[13.5px] font-extrabold hover:bg-chip"
        >
          マイリストへ戻る
        </a>
      </div>
    );
  }

  const serialized = {
    id: Number(playlist.id),
    name: playlist.name,
    userId: String(playlist.userId),
    clips: playlist.clipsPlaylists.map((pc) => ({
      id: Number(pc.clipId),
      clip: {
        id: Number(pc.clip.id),
        title: pc.clip.title,
        clipName: pc.clip.name,
        user: pc.clip.user.name ?? "名無し",
        // クリップ所有者はコメントのモデレーションができる
        ownerId: Number(pc.clip.userId),
        service: pc.clip.vod.code,
        startTime: pc.clip.startMs / 1000,
        endTime: pc.clip.endMs / 1000,
        url: pc.clip.url,
        epnumber: pc.clip.epnum ?? "",
      },
    })),
  };

  return (
    <div>
      <h1 className="mb-6 text-[22px] font-black">
        <span className="marker">{serialized.name}</span>
      </h1>
      <PlaylistView playlist={serialized} userId={userId} />
    </div>
  );
}
