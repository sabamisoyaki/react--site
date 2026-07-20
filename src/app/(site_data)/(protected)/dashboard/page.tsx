import { signIn, signOut } from "@/auth";
import { getCurrentUser, getSession } from "@/server/auth/session";
import { getUserAuthInfo } from "@/server/services/users";

export const dynamic = "force-dynamic";

const CELL = "border-ink/10 border-b px-3 py-2.5 align-middle";
const LABEL_CELL = `${CELL} w-2/5 text-ink-muted`;

export default async function DashboardPage() {
  const [session, currentUser] = await Promise.all([
    getSession(),
    getCurrentUser(),
  ]);

  if (!session?.user || !currentUser) {
    return (
      <div>
        <h1 className="mb-6 text-[22px] font-black">ダッシュボード</h1>
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-ink bg-white p-10 text-center shadow-sticker">
          <strong className="text-[17px] font-black">ログインが必要です</strong>
          <p className="text-ink-muted">
            ログインするとアカウント情報を表示できます。
          </p>
          <form
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button
              className="cursor-pointer rounded-full bg-accent px-5 py-2 text-[13.5px] font-extrabold text-white shadow-sticker-ink hover:bg-accent-strong"
              type="submit"
            >
              Google でログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { accounts, sessions } = await getUserAuthInfo(Number(currentUser.id));

  return (
    <div>
      <h1 className="mb-6 text-[22px] font-black">ダッシュボード</h1>
      <div className="mb-6 rounded-2xl border-2 border-ink bg-white p-6 shadow-sticker">
        <h3 className="mb-3 text-[16px] font-black">ユーザー情報</h3>
        <table className="w-full border-collapse text-[14px]">
          <tbody>
            <tr>
              <td className={LABEL_CELL}>ユーザーID</td>
              <td className={CELL}>{currentUser.id}</td>
            </tr>
            <tr>
              <td className={LABEL_CELL}>ニックネーム</td>
              <td className={CELL}>{currentUser.name ?? "(未設定)"}</td>
            </tr>
            <tr>
              <td className={LABEL_CELL}>メールアドレス</td>
              <td className={CELL}>{currentUser.email ?? "(未設定)"}</td>
            </tr>
            <tr>
              <td className={LABEL_CELL}>地域</td>
              <td className={CELL}>{currentUser.region ?? "(未設定)"}</td>
            </tr>
            <tr>
              <td className={LABEL_CELL}>接続プロバイダ数</td>
              <td className={CELL}>{accounts.length}</td>
            </tr>
            <tr>
              <td className={`${LABEL_CELL} border-b-0`}>有効セッション数</td>
              <td className={`${CELL} border-b-0`}>{sessions.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border-2 border-ink bg-white p-6 shadow-sticker">
        <h3 className="mb-3 text-[16px] font-black">接続情報（概要）</h3>
        <table className="w-full border-collapse text-[14px]">
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td className={`${LABEL_CELL} border-b-0`}>外部アカウント</td>
                <td className={`${CELL} border-b-0`}>未接続</td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id}>
                  <td className={LABEL_CELL}>{account.provider}</td>
                  <td className={`${CELL} font-data text-[12.5px]`}>
                    {account.providerAccountId}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form
          className="mt-4"
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button
            className="cursor-pointer rounded-full border-2 border-accent bg-white px-5 py-2 text-[13px] font-extrabold text-accent hover:bg-accent hover:text-white"
            type="submit"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
