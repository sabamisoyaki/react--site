import "@/app/globals.css";
import { redirect } from "next/navigation";
import { ExtensionLinkButton } from "@/components/ExtensionLinkButton";
import { ExtensionUnlinkButton } from "@/components/ExtensionUnlinkButton";
import { getCurrentUser } from "@/server/auth/session";
import { listLinkedExtensions } from "@/server/services/extensions";
import {
  collectSubscriptionServices,
  formatDateJa,
  formatLinkedExtensionRow,
  formatSubscriptionLabel,
} from "./accountViewModel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const dbUser = await getCurrentUser({
    id: true,
    name: true,
    email: true,
    createdAt: true,
    playlists: { select: { id: true } },
  });

  if (!dbUser) {
    redirect("/login");
  }

  const linkedExtensions = await listLinkedExtensions(Number(dbUser.id));
  const subscriptionServices = collectSubscriptionServices([]);
  const displayName = dbUser.name ?? "未設定";

  return (
    <div>
      <h1 className="page-title">アカウント</h1>
      <section className="user-info">
        <h3>ユーザー情報</h3>
        <table>
          <tbody>
            <tr>
              <td>ニックネーム</td>
              <td>{displayName}</td>
            </tr>
            <tr>
              <td>登録メールアドレス</td>
              <td>{dbUser.email ?? "未設定"}</td>
            </tr>
            <tr>
              <td>登録日</td>
              <td>{formatDateJa(dbUser.createdAt)}</td>
            </tr>
            <tr>
              <td>作成プレイリスト数</td>
              <td>{dbUser.playlists.length}件</td>
            </tr>
            <tr>
              <td>使用サブスクリプション</td>
              <td>{formatSubscriptionLabel(subscriptionServices)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="settings">
        <h3>Chrome拡張機能</h3>
        <ExtensionLinkButton />
        {linkedExtensions.length > 0 && (
          <table>
            <thead>
              <tr>
                <td>連携ID</td>
                <td>連携日</td>
                <td>最終同期</td>
                <td />
              </tr>
            </thead>
            <tbody>
              {linkedExtensions.map((linkedExtension) => {
                const row = formatLinkedExtensionRow(linkedExtension);
                return (
                  <tr key={linkedExtension.id}>
                    <td>{row.maskedInstanceId}</td>
                    <td>{row.linkedAtLabel}</td>
                    <td>{row.lastSeenAtLabel}</td>
                    <td>
                      <ExtensionUnlinkButton
                        extensionInstanceId={
                          linkedExtension.extensionInstanceId
                        }
                        linkedExtensionId={linkedExtension.id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
