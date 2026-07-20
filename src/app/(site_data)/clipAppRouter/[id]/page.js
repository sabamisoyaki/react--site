import { redirect } from "next/navigation";
import { buildPlaybackUrl } from "@/lib/clips/playback";
import { isNotFoundError } from "@/server/http/errors";
import { getClipWithVod } from "@/server/services/clips";

export const dynamic = "force-dynamic";

export default async function ClipPage({ params }) {
  const { id } = await params;

  if (!id) return <h1>Missing ID</h1>;

  const clip = await getClipWithVod(Number(id)).catch((err) => {
    if (isNotFoundError(err)) return null;
    throw err;
  });

  if (!clip) return <h1>Not Found</h1>;

  const startSeconds = Math.floor(clip.startMs / 1000);
  const url = buildPlaybackUrl(clip.vod.code, clip.url, startSeconds);

  if (!url) {
    return (
      <h1>このクリップの再生リンクを開けません（未対応のサービスです）</h1>
    );
  }

  redirect(url);
}
