import ClipList from "@/app/base/clip/clipCluster";
import PlayList from "@/app/base/playlist/playlist";
import { getCurrentUser } from "@/server/auth/session";

export default async function app() {
  const user = await getCurrentUser({ id: true });
  const userId = user?.id ?? null;

  return (
    <>
      <ClipList clipApiUrl="/api/v1/clips" userId={userId} />
      <PlayList PlayList_Data_Url="/api/v1/playlists" />
    </>
  );
}
