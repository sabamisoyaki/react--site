import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 pt-[10vh] text-center">
      <h1 className="text-[22px] font-black">
        <span className="marker">ページが見つかりません</span>
      </h1>
      <p className="text-ink-muted">
        URL が間違っているか、ページが削除された可能性があります。
      </p>
      <Link
        href="/"
        className="rounded-full bg-accent px-5 py-2 text-[13.5px] font-extrabold text-white shadow-sticker-ink hover:bg-accent-strong"
      >
        ホームへ戻る
      </Link>
    </div>
  );
}
