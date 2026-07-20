export default function Done() {
  return (
    <div className="flex flex-col items-center gap-3 pt-[10vh] text-center">
      <h1 className="text-[22px] font-black">
        <span className="marker">ログインが完了しました</span>
      </h1>
      <p className="text-ink-muted">このタブは閉じて構いません。</p>
    </div>
  );
}
