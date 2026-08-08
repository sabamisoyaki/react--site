// biome-ignore-all lint/security/noSecrets: Japanese fixtures and test literals are false positives.
// biome-ignore-all lint/suspicious/noExplicitAny: 任意形の JSON レスポンスを検査するテストハーネス。

/**
 * CommentModal の実操作スモーク。システム Chrome を playwright-core で駆動する。
 * 投稿したコメントは finally で物理削除する。
 */
// playwright-core はリポジトリの依存に入れていない（インストールが重いため）。
// 実行前に任意の場所へ `npm i playwright-core` し、そのパスを渡す:
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core npm run smoke:ui
// Chrome はシステムのものを使う（CHROME_PATH で上書き可）。
const PLAYWRIGHT_CORE = process.env.PLAYWRIGHT_CORE;
if (!PLAYWRIGHT_CORE) {
  console.error(
    "PLAYWRIGHT_CORE is not set. See the comment at the top of this file.",
  );
  process.exit(1);
}
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOT_DIR = process.env.SMOKE_SHOT_DIR ?? ".";

const { chromium } = await import(
  `file:///${PLAYWRIGHT_CORE.replace(/\\/g, "/")}/index.mjs`
);
const { encode } = await import("next-auth/jwt");
const { prisma } = await import("@/server/db");

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";
const COOKIE_NAME = "__Secure-authjs.session-token"; // next start = production

const authSecret = process.env.AUTH_SECRET;
if (!authSecret) {
  console.error("AUTH_SECRET is not set (run with --env-file=.env.local)");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}`, detail ?? "");
  }
}

const browser = await chromium.launch({
  executablePath: CHROME_PATH,
  headless: true,
});

try {
  const user = await prisma.user.findFirstOrThrow({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: { id: "asc" },
  });

  const value = await encode({
    token: {
      uid: String(user.id),
      sub: String(user.id),
      name: user.name,
      email: user.email,
    },
    secret: authSecret,
    salt: COOKIE_NAME,
  });

  // ---- 未ログイン ---------------------------------------------------------
  console.log("未ログインでモーダルを開く");
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });

    const btn = page.getByRole("button", { name: "コメントを見る" }).first();
    check("💬 ボタンがカードに出ている", (await btn.count()) > 0);
    await btn.click();

    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    check("モーダルが開く", await dialog.isVisible());
    check(
      "見出しが「コメント」",
      (await dialog.getByRole("heading").first().innerText()).includes(
        "コメント",
      ),
    );
    check(
      "未ログインではログイン導線が出る",
      (await dialog.innerText()).includes("ログインが必要です"),
    );
    check(
      "未ログインでは入力欄が出ない",
      (await dialog.locator("textarea").count()) === 0,
    );

    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 5000 });
    check("Escape で閉じる", (await page.getByRole("dialog").count()) === 0);
    await ctx.close();
  }

  // ---- ログイン済み -------------------------------------------------------
  console.log("\nログイン済みで投稿する");
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: COOKIE_NAME,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None",
    },
  ]);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "コメントを見る" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });

  // 一覧は非同期。読み込み中が消えるまで待ってから状態を断定する
  await dialog
    .getByText("読み込み中…")
    .waitFor({ state: "detached", timeout: 10000 })
    .catch(() => {});
  check(
    "空状態の文言が出る",
    (await dialog.innerText()).includes("まだコメントがありません"),
    await dialog.innerText(),
  );

  const textarea = dialog.locator("textarea");
  check("ログイン済みでは入力欄が出る", (await textarea.count()) === 1);

  const submit = dialog.getByRole("button", { name: "コメントする" });
  check("空のとき投稿ボタンは無効", await submit.isDisabled());

  const text = `UIスモーク ${Date.now()}`;
  await textarea.fill(text);
  check(
    "文字数カウンタが反映される",
    (await dialog.innerText()).includes(`${text.length} / 500`),
    await dialog.innerText(),
  );
  check("入力後は投稿ボタンが有効", await submit.isEnabled());

  await submit.click();

  // 投稿完了まで待つ。textarea の中身にも text は入っているので、
  // 一覧に出たことは「コメント項目 (article) の中にある」ことで判定する。
  const posted = dialog.locator("article", { hasText: text });
  await posted.waitFor({ state: "visible", timeout: 15000 });
  await dialog
    .getByRole("button", { name: "コメントする" })
    .waitFor({ state: "visible", timeout: 15000 });

  check("投稿したコメントが一覧に出る", (await posted.count()) === 1);
  check(
    "投稿後に入力欄が空になる",
    (await textarea.inputValue()) === "",
    await textarea.inputValue(),
  );
  check(
    "空状態の文言が消える",
    !(await dialog.innerText()).includes("まだコメントがありません"),
  );
  check(
    "投稿者名が表示される（null なら「ユーザー」）",
    (await posted.innerText()).includes(user.name ?? "ユーザー"),
    { shown: await posted.innerText(), expected: user.name ?? "ユーザー" },
  );
  check("投稿時刻が表示される", (await posted.locator("time").count()) === 1);

  await page.screenshot({ path: `${SHOT_DIR}/comment-modal.png` });
  console.log(`  (スクリーンショット: ${SHOT_DIR}/comment-modal.png)`);

  // 再オープンでサーバーから読み直せているか
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  await page.getByRole("button", { name: "コメントを見る" }).first().click();
  const dialog2 = page.getByRole("dialog");
  await dialog2.waitFor({ state: "visible", timeout: 5000 });
  const reloaded = dialog2.locator("article", { hasText: text });
  await reloaded.waitFor({ state: "visible", timeout: 10000 });
  check(
    "閉じて開き直すとサーバーから再取得される",
    (await reloaded.count()) === 1,
  );
  check(
    "開き直したとき入力欄は空",
    (await dialog2.locator("textarea").inputValue()) === "",
  );

  // ---- 削除・通報のボタン -------------------------------------------------
  console.log("\n削除・通報のボタン");
  check(
    "自分のコメントには削除ボタンが出る",
    (await reloaded.getByRole("button", { name: /削除/ }).count()) === 1,
  );
  check(
    "自分のコメントには通報ボタンが出ない（消せばよいので）",
    (await reloaded.getByRole("button", { name: /通報/ }).count()) === 0,
  );

  // window.confirm は Playwright の既定で dismiss されるため明示的に承認する
  page.on("dialog", (d) => d.accept());
  await reloaded.getByRole("button", { name: /削除/ }).click();
  await reloaded.waitFor({ state: "detached", timeout: 15000 });
  check("削除ボタンで一覧から消える", (await reloaded.count()) === 0);

  const remaining = await prisma.clipComment.findFirst({
    where: { body: text },
    select: { deletedAt: true },
  });
  check(
    "UI からの削除も論理削除",
    remaining !== null && remaining.deletedAt !== null,
    remaining,
  );

  await ctx.close();
} catch (e) {
  fail++;
  failures.push(`EXCEPTION: ${(e as Error).message}`);
  console.error("\nEXCEPTION:", e);
} finally {
  await browser.close();
  const r = await prisma.clipComment.deleteMany({
    where: { body: { startsWith: "UIスモーク " } },
  });
  console.log(`\n後始末: コメントを物理削除 ${r.count} 件`);
  await prisma.$disconnect();
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  if (failures.length) for (const f of failures) console.log("  -", f);
  process.exitCode = fail === 0 ? 0 : 1;
}
