import ClipList from "@/app/base/clip/clipCluster";
import PlayList from "@/app/base/playlist/playlist";
import { getCurrentUser } from "@/server/auth/session";

export default async function SearchPage({ searchParams }) {
  const params = await searchParams;
  const q = params.q ?? "";

  const user = await getCurrentUser({ id: true });
  const userId = user?.id ?? null;

  return (
    <>
      <h1 className="page-title">{q ? `「${q}」の検索結果` : "検索"}</h1>
      {!q && (
        <div className="status-box">
          <strong>検索語を入力してください</strong>
          <p>上の検索欄からクリップやプレイリストを検索できます。</p>
        </div>
      )}
      {q && (
        <>
          <h2 className="section-title">クリップ</h2>
          <ClipList
            clipApiUrl={`/api/v1/clips?title=${encodeURIComponent(q)}`}
            userId={userId}
            emptyMessage={`「${q}」に一致するクリップは見つかりませんでした。`}
          />
          <h2 className="section-title">プレイリスト</h2>
          <PlayList
            PlayList_Data_Url={`/api/v1/playlists?name=${encodeURIComponent(q)}`}
            emptyMessage={`「${q}」に一致するプレイリストは見つかりませんでした。`}
          />
        </>
      )}
    </>
  );
}
