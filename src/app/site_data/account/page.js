"use client";
import '@/app/styles.css';
import HeadSearch from'@/app/base//base/headSearch/headSearch'; ; // ヘッダー
import Sidebar from '@/app/base/base/sidebar/sidebar';
import ClipList from '@/app/base/clip/clipCluster';
import PlayList from '@/app/base/playlist/playlist';
export default function App() {
  return (
    <>
      <Sidebar />
      <div className="main-content">
        <HeadSearch />
        <div className="user-info">
          <h3>ユーザー情報</h3>
          <button className="change-button">変更</button>
          <table>
            <tbody>
              <tr>
                <td>ユーザーid</td>
                <td>000-0000-0000</td>
              </tr>
              <tr>
                <td>ニックネーム</td>
                <td>サブスク太郎</td>
              </tr>
              <tr>
                <td>登録メールアドレス</td>
                <td>sabusu@sabusu.com</td>
              </tr>
              <tr>
                <td>使用サブスクリプション</td>
                <td>Prime video / Netflix</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="settings">
          <h3>設定</h3>
          <table>
            <tbody>
              <tr>
                <td>連続再生</td>
                <td>連続再生許可 or 終了</td>
              </tr>
              <tr>
                <td>プレイリスト再生</td>
                <td>終了後繰り返し</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
