"use client";
import React, { useState } from "react";

function RegisterPage() {
  const [username, setUsername] = useState(""); // ユーザー名の状態
  const [email, setEmail] = useState(""); // メールアドレスの状態
  const [password, setPassword] = useState(""); // パスワードの状態
  const [confirmPassword, setConfirmPassword] = useState(""); // パスワード確認の状態

  const handleRegister = (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      alert("パスワードが一致しません。");
      return;
    }
    console.log("ユーザー名:", username);
    console.log("メールアドレス:", email);
    console.log("パスワード:", password);
    alert("会員登録が完了しました！");
  };

  return (
    <>
      <main>
        <div className="register-container-test">
          <div className="register-box-test">
            <h2>新規会員登録</h2>
            <form onSubmit={handleRegister}>
              {/* ユーザー名 */}
              <div className="input-group-test">
                <label htmlFor="username" className="input-label-test">
                  ユーザー名
                </label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  placeholder="ユーザー名を入力"
                  className="register-input-test"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              {/* メールアドレス */}
              <div className="input-group-test">
                <label htmlFor="email" className="input-label-test">
                  メールアドレス
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="メールアドレスを入力"
                  className="register-input-test"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* パスワード */}
              <div className="input-group-test">
                <label htmlFor="password" className="input-label-test">
                  パスワード
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="パスワードを入力"
                  className="register-input-test"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {/* パスワード確認 */}
              <div className="input-group-test">
                <label htmlFor="confirmPassword" className="input-label-test">
                  パスワード（確認用）
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="再度パスワードを入力"
                  className="register-input-test"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {/* 登録ボタン */}
              <div className="input-group-test">
                <button type="submit" className="register-button-test">
                  会員登録
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}

export default RegisterPage;

