"use client";
import React, { useState } from "react";

function Page() {
  const [email, setEmail] = useState(""); // メールアドレスの状態
  const [password, setPassword] = useState(""); // パスワードの状態
  const [showPassword, setShowPassword] = useState(false); // パスワード表示状態

  const handleLogin = () => {
    console.log("メールアドレス:", email);
    console.log("パスワード:", password);
  };

  return (
    <>
      <main>
        {/* ログインコンテナ */}
        <div className="login-container-test">
          {/* 会員登録がお済みのお客様 */}
          <div className="login-box-test">
            <h2>会員登録がお済みのお客様</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >
              <div className="input-group-test">
                <label htmlFor="email" className="input-label-test">
                  メールアドレス（ID）
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="メールアドレスを入力"
                  className="login-input-test"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="input-group-test">
                <label htmlFor="password" className="input-label-test">
                  パスワード
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  placeholder="パスワードを入力"
                  className="login-input-test"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="input-group-test">
                <label className="login-checkbox-test">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={() => setShowPassword(!showPassword)}
                  />{" "}
                  パスワードを表示する
                </label>
              </div>

              <div className="input-group-test">
                <button type="submit" className="login-button-test">
                  ログインして進む
                </button>
              </div>
            </form>
            <a href="#" className="login-link-test">
              パスワードをお忘れですか？
            </a>
          </div>

          {/* 会員登録がお済みでないお客様 */}
          <div className="login-box-test">
            <h2>会員登録がお済みでないお客様</h2>
            <p>
              会員登録がお済みでないお客様はこちらより新規会員登録へお進みください。
            </p>
            <button
              className="login-button-test"
              onClick={() => {
                window.location.href = "#";
              }}
            >
              新規会員登録
            </button>
            <a href="#" className="login-link-test">
              メンバーズについて
            </a>
          </div>
        </div>
      </main>
    </>
  );
}


export default Page;
