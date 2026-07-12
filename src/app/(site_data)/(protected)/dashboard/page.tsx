import { signIn, signOut } from "@/auth";
import { getCurrentUser, getSession } from "@/server/auth/session";
import { getUserAuthInfo } from "@/server/services/users";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [session, currentUser] = await Promise.all([
    getSession(),
    getCurrentUser(),
  ]);

  if (!session?.user || !currentUser) {
    return (
      <div>
        <h1 className="page-title">ダッシュボード</h1>
        <div className="status-box">
          <strong>ログインが必要です</strong>
          <p>ログインするとアカウント情報を表示できます。</p>
          <form
            action={async () => {
              "use server";
              await signIn("google");
            }}
          >
            <button className="btn btn-primary" type="submit">
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
      <h1 className="page-title">ダッシュボード</h1>
      <div className="user-info">
        <h3>ユーザー情報</h3>
        <table>
          <tbody>
            <tr>
              <td>ユーザーID</td>
              <td>{currentUser.id}</td>
            </tr>
            <tr>
              <td>ニックネーム</td>
              <td>{currentUser.name ?? "(未設定)"}</td>
            </tr>
            <tr>
              <td>メールアドレス</td>
              <td>{currentUser.email ?? "(未設定)"}</td>
            </tr>
            <tr>
              <td>地域</td>
              <td>{currentUser.region ?? "(未設定)"}</td>
            </tr>
            <tr>
              <td>接続プロバイダ数</td>
              <td>{accounts.length}</td>
            </tr>
            <tr>
              <td>有効セッション数</td>
              <td>{sessions.length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="settings">
        <h3>接続情報（概要）</h3>
        <table>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td>外部アカウント</td>
                <td>未接続</td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.provider}</td>
                  <td>{account.providerAccountId}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button className="btn btn-danger change-button" type="submit">
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
