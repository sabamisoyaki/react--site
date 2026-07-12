import { redirect } from "next/navigation";

// 会員登録は Google ログイン時に自動で行われる（ADR-0002: Google OAuth 一本化）。
// 旧・登録フォームは何も登録しないダミーだったため、ログイン画面へ誘導する。
export default function RegistrationPage() {
  redirect("/login");
}
