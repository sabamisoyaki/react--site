import "@/app/globals.css";
import { ExtensionLinkButton } from "@/components/ExtensionLinkButton";
import { requireUser } from "@/server/auth/session";
import {
  collectSubscriptionServices,
  formatDateJa,
  formatSubscriptionLabel,
} from "./accountViewModel";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const dbUser = await requireUser({
    name: true,
    email: true,
    createdAt: true,
    playlists: { select: { id: true } },
  });

  const subscriptionServices = collectSubscriptionServices([]);
  const displayName = dbUser.name ?? "未設定";

  return (
    <main className="main-content">
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
        <h3>設定</h3>
        <table>
          <tbody>
            <tr>
              <td>連携再生成</td>
              <td>連携再生成許可 or 終了</td>
            </tr>
            <tr>
              <td>プレイリスト再生成</td>
              <td>終了後繰り返し</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="settings">
        <h3>Chrome拡張機能</h3>
        <ExtensionLinkButton />
      </section>
    </main>
  );
}
