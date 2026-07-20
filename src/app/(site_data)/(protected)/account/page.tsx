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

const CELL = "border-ink/10 border-b px-3 py-2.5 align-middle";
const LABEL_CELL = `${CELL} w-2/5 text-ink-muted`;

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
      <h1 className="mb-6 text-[22px] font-black">アカウント</h1>

      <section className="mb-6 rounded-2xl border-2 border-ink bg-white p-6 shadow-sticker">
        <h3 className="mb-3 text-[16px] font-black">ユーザー情報</h3>
        <table className="w-full border-collapse text-[14px]">
          <tbody>
            <tr>
              <td className={LABEL_CELL}>ニックネーム</td>
              <td className={CELL}>{displayName}</td>
            </tr>
            <tr>
              <td className={LABEL_CELL}>登録メールアドレス</td>
              <td className={CELL}>{dbUser.email ?? "未設定"}</td>
            </tr>
            <tr>
              <td className={LABEL_CELL}>登録日</td>
              <td className={CELL}>{formatDateJa(dbUser.createdAt)}</td>
            </tr>
            <tr>
              <td className={LABEL_CELL}>作成プレイリスト数</td>
              <td className={CELL}>{dbUser.playlists.length}件</td>
            </tr>
            <tr>
              <td className={`${LABEL_CELL} border-b-0`}>
                使用サブスクリプション
              </td>
              <td className={`${CELL} border-b-0`}>
                {formatSubscriptionLabel(subscriptionServices)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border-2 border-ink bg-white p-6 shadow-sticker">
        <h3 className="mb-3 text-[16px] font-black">Chrome拡張機能</h3>
        <ExtensionLinkButton />
        {linkedExtensions.length > 0 && (
          <table className="mt-4 w-full border-collapse text-[14px]">
            <thead>
              <tr>
                <td className={`${CELL} font-data text-[11px] text-ink-muted`}>
                  連携ID
                </td>
                <td className={`${CELL} font-data text-[11px] text-ink-muted`}>
                  連携日
                </td>
                <td className={`${CELL} font-data text-[11px] text-ink-muted`}>
                  最終同期
                </td>
                <td className={CELL} />
              </tr>
            </thead>
            <tbody>
              {linkedExtensions.map((linkedExtension) => {
                const row = formatLinkedExtensionRow(linkedExtension);
                return (
                  <tr key={linkedExtension.id}>
                    <td className={`${CELL} font-data text-[12.5px]`}>
                      {row.maskedInstanceId}
                    </td>
                    <td className={CELL}>{row.linkedAtLabel}</td>
                    <td className={CELL}>{row.lastSeenAtLabel}</td>
                    <td className={`${CELL} text-right`}>
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
