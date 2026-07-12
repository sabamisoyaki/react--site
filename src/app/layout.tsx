import "./globals.css";
import type React from "react";
import HeadSearch from "@/app/base/_components/headSearch/headSearch";
import Sidebar from "@/app/base/_components/sidebar/sidebar";
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
          <div className="app-shell">
            <aside className="sidebar">
              <Sidebar />
            </aside>
            <div className="main-column">
              <HeadSearch />
              <main className="main-content">{children}</main>
            </div>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
