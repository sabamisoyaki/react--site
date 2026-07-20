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
      <h1 className="mb-6 text-[22px] font-black">
        {q ? (
          <>
            <span className="marker">「{q}」</span>の検索結果
          </>
        ) : (
          "検索"
        )}
      </h1>
      {!q && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-ink bg-white p-10 text-center shadow-sticker">
          <strong className="text-[17px] font-black">
            検索語を入力してください
          </strong>
          <p className="text-ink-muted">
            上の検索欄からクリップやプレイリストを検索できます。
          </p>
        </div>
      )}
      {q && (
        <>
          <h2 className="mb-3 text-[17px] font-black">クリップ</h2>
          <ClipList
            clipApiUrl={`/api/v1/clips?title=${encodeURIComponent(q)}`}
            userId={userId}
            emptyMessage={`「${q}」に一致するクリップは見つかりませんでした。`}
          />
          <h2 className="mt-10 mb-4 text-[17px] font-black">プレイリスト</h2>
          <PlayList
            PlayList_Data_Url={`/api/v1/playlists?name=${encodeURIComponent(q)}`}
            emptyMessage={`「${q}」に一致するプレイリストは見つかりませんでした。`}
          />
        </>
      )}
    </>
  );
}
