import { redirect } from "next/navigation";
import ClipList from "@/app/base/clip/clipCluster";
import { getCurrentUser } from "@/server/auth/session";

export default async function MyVideoPage() {
  const user = await getCurrentUser({ id: true });
  const userId = user?.id ?? null;

  if (!userId) redirect("/login");
  return (
    <>
      <h1 className="page-title">マイビデオ</h1>
      <ClipList
        clipApiUrl={`/api/v1/clips?userId=${userId}`}
        userId={userId}
        emptyMessage="あなたが作成したクリップはまだありません。"
      />
    </>
  );
}
