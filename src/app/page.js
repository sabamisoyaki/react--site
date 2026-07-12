import ClipList from "@/app/base/clip/clipCluster";
import PlayList from "@/app/base/playlist/playlist";
import { getCurrentUser } from "@/server/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser({ id: true });
  const userId = user?.id ?? null;

  return (
    <>
      <h2 className="section-title">クリップ</h2>
      <ClipList clipApiUrl="/api/v1/clips" userId={userId} />
      <h2 className="section-title">プレイリスト</h2>
      <PlayList PlayList_Data_Url="/api/v1/playlists" />
    </>
  );
}
