"use client"; 
import React , { useState }from 'react';

function Page() {
  const [email, setEmail] = useState(""); // メールアドレスの状態
  const [password, setPassword] = useState(""); // パスワードの状態

  const handleLogin = () => {
    console.log("メールアドレス:", email);
    console.log("パスワード:", password);
  };
  return (
    <>
      <main>
        {/* ログインコンテナ */}
        <div className="login-container">
          
          {/* メールアドレス入力 */}
          <div className="input-group">
            <label htmlFor="email" className="input-label">
              メールアドレス:
            </label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="メールアドレスを入力"
              value={email} // 状態をinputに反映
              onChange={(e) => setEmail(e.target.value)} // 入力値を状態に反映
            />
          </div>
          
          {/* パスワード入力 */}
          <div className="input-group">
            <label htmlFor="password" className="input-label">
              パスワード:
            </label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="パスワードを入力"
              value={password} // 状態をinputに反映
              onChange={(e) => setPassword(e.target.value)} // 入力値を状態に反映
            />
          </div>
          
          <div className="input-group">
          <button className="login-button" onClick={handleLogin}>
            ログイン
          </button>
        </div>
        </div>
      </main>
    </>
  );
}


export default Page;
