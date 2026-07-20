import "./globals.css";
import type React from "react";
import TopNav from "@/app/base/_components/headSearch/headSearch";
import ShelfRail from "@/components/ShelfRail";
import { SessionProvider } from "@/providers/session-provider";
import { getSession } from "@/server/auth/session";

export const metadata = {
  // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
  title: "サブスク切り抜き",
  // biome-ignore lint/security/noSecrets: Japanese UI label is a false positive.
  description: "サブスク動画の切り抜きシーンを共有・再生できるサービス",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <html lang="ja">
      <body>
        {/* ここでセッションを初期値として渡す */}
        <SessionProvider session={session}>
          <TopNav />
          <div className="mx-auto flex w-full max-w-6xl items-start gap-7 px-4 pt-7 pb-16 md:px-8">
            <ShelfRail />
            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
