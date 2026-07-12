import PlayList from "@/app/base/playlist/playlist";

export default function MyPlaylistsPage() {
  return (
    <>
      <h1 className="mb-6 text-[22px] font-black">マイリスト</h1>
      <PlayList
        PlayList_Data_Url="/api/v1/me/playlists"
        emptyMessage="プレイリストはまだありません。クリップの「＋」ボタンから作成できます。"
      />
    </>
  );
}
