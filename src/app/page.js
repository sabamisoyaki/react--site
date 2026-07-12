import ClipList from "@/app/base/clip/clipCluster";
import PlayList from "@/app/base/playlist/playlist";
import { getCurrentUser } from "@/server/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser({ id: true });
  const userId = user?.id ?? null;

  return (
    <>
      <div className="mb-6">
        <h2 className="text-[23px] font-black">
          今日の<span className="marker-pink">「ここ見て！」</span>
        </h2>
        <p className="mt-0.5 text-[13.5px] text-ink-muted">
          みんなが貼った切り抜きから、次に観る場面をみつけよう。
        </p>
      </div>

      <h2 className="mb-3 text-[17px] font-black">クリップ</h2>
      <ClipList clipApiUrl="/api/v1/clips" userId={userId} />

      <div className="mt-10 mb-4 flex items-baseline gap-3">
        <h2 className="text-[17px] font-black">みんなのプレイリスト</h2>
      </div>
      <PlayList PlayList_Data_Url="/api/v1/playlists" />
    </>
  );
}
