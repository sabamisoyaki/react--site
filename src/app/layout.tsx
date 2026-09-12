import "./globals.css";
import type React from "react";
import TopNav from "@/app/base/_components/headSearch/headSearch";
import EasterEggs from "@/components/EasterEggs";
import ShelfRail from "@/components/ShelfRail";
import { SessionProvider } from "@/providers/session-provider";
import { getSession } from "@/server/auth/session";

export const metadata = {
  // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
  title: "サブスク切り抜き",
  // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
  description: "サブスク動画の切り抜きシーンを共有・再生できるサービス",
};

// view-source で HTML を覗いた人だけが見つける隠しコメント(AA)。
// HTML コメント内では "--" が使えないため、罫線は box-drawing 文字を使用。
const SOURCE_EGG = `
<!--

   ┌────────────────────────────────
   │  🎬  サブスク切り抜き  ·  楽屋(BACKSTAGE)
   │
   │  ▓░▒░▓░▒░▓░▒░▓░▒░▓░▒░▓░▒░▓░▒░
   └────────────────────────────────

   ソースまで覗くとは、通だね。よく来たね。

   ▸ 隠しコマンド : ↑ ↑ ↓ ↓ ← → ← → B A
        … フィルム吹雪 ＋ VHS/CRT モード
   ▸ ロゴを素早く 7 連打
        … 映画のエンドロール(スタッフロール)

   🥚 これを見つけた「あなた」に、こっそり乾杯。

   あなたの人生に、映画のような素敵な瞬間が訪れますように。

   合言葉は

   React は素晴らしい。Next.js は素晴らしい。TypeScript は素晴らしい。

   JSPはもう古い。滅びよ JSP。JSP はもう古い。滅びよ JSP。

   だよーん。

-->
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <html lang="ja">
      <body>
        {/* view-source で見つかる隠し AA。静的な定数で生成しておりユーザー入力なし。 */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 作者管理の静的な HTML コメント。 */}
        <div hidden dangerouslySetInnerHTML={{ __html: SOURCE_EGG }} />
        {/* ここでセッションを初期値として渡す */}
        <SessionProvider session={session}>
          <TopNav />
          <div className="mx-auto flex w-full max-w-6xl items-start gap-7 px-4 pt-7 pb-16 md:px-8">
            <ShelfRail />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
          <EasterEggs />
        </SessionProvider>
      </body>
    </html>
  );
}
