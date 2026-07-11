import PlayList from "@/app/base/playlist/playlist";

export default function app() {
  return (
    <div className="main-content">
      <PlayList PlayList_Data_Url="/api/v1/me/playlists" />
    </div>
  );
}
