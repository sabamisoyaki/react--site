import Link from "next/link";

export default function NotFound() {
  return (
    <div className="center-page">
      <h1 className="page-title">ページが見つかりません</h1>
      <p>URL が間違っているか、ページが削除された可能性があります。</p>
      <Link href="/" className="btn btn-primary">
        ホームへ戻る
      </Link>
    </div>
  );
}
