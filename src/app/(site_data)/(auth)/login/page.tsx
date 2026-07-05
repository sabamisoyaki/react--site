"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main>
      <div className="login-container-test">
        <div className="login-box-test">
          <h2>ログイン</h2>
          <button
            type="button"
            className="login-button-test"
            onClick={() => signIn("google", { callbackUrl: "/account" })}
          >
            Googleでログイン
          </button>
        </div>
      </div>
    </main>
  );
}
