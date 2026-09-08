// biome-ignore-all lint/suspicious/noExplicitAny: Optional browser tooling is loaded dynamically.
// biome-ignore-all lint/security/noSecrets: Japanese labels and isolated test credentials are fixtures.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { encode } from "next-auth/jwt";

// Called only by the isolated in-memory DB harness after npm run build.
export async function runPlaylistBrowserChecks(
  connectionString: string,
  modules: string,
) {
  const base = "http://127.0.0.1:3102";
  const secret = crypto.randomUUID();
  const app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3102",
    ],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        DATABASE_URL: connectionString,
        AUTH_SECRET: secret,
        AUTH_URL: base,
        NEXTAUTH_URL: base,
        AUTH_GOOGLE_ID: "isolated-test",
        AUTH_GOOGLE_SECRET: "isolated-test",
      },
    },
  );
  let browser: any;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        ready = (await fetch(`${base}/api/v1/health`)).ok;
      } catch {
        /* Starting. */
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "isolated app started");
    const { chromium } = await import(
      pathToFileURL(join(modules, "playwright-core/index.mjs")).href
    );
    browser = await chromium.launch({
      executablePath:
        process.env.CHROME_PATH ??
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1400 },
    });
    const cookieName = "__Secure-authjs.session-token";
    const token = await encode({
      secret,
      salt: cookieName,
      token: { uid: "100", sub: "100", name: "Isolated owner" },
    });
    await context.addCookies([
      {
        name: cookieName,
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
    ]);
    const page = await context.newPage();
    for (const id of ["abc", "0", "-1"]) {
      const response = await page.goto(`${base}/playlists/${id}`);
      assert.equal(response.status(), 200);
      await page
        .getByText("プレイリストが見つかりません", { exact: true })
        .waitFor();
    }
    console.log(
      "PASS: invalid playlist page IDs show the missing-playlist view",
    );
    await page.goto(`${base}/playlists/100`);
    const handles = page.getByTitle("ドラッグして並べ替え");
    await handles.first().waitFor();
    assert.equal(await handles.count(), 3);
    const dragFirstToLast = async () => {
      const first = await handles.first().boundingBox();
      const last = await handles.last().boundingBox();
      assert.ok(first && last);
      await page.mouse.move(
        first.x + first.width / 2,
        first.y + first.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, {
        steps: 15,
      });
      await page.mouse.up();
    };
    const saved = page.waitForResponse(
      (response: any) => response.request().method() === "PATCH",
    );
    await dragFirstToLast();
    assert.equal((await saved).status(), 204);
    await page.waitForTimeout(300);
    await page.reload();
    await handles.first().waitFor();
    const savedOrder = (
      await (await fetch(`${base}/api/v1/playlists/100/clips`)).json()
    ).data.map((clip: any) => clip.id);
    assert.notDeepEqual(savedOrder, [101, 102, 103]);
    const play = page.getByRole("button", {
      name: "▶ プレイリスト再生",
      exact: true,
    });
    await play.click();
    const queueIds = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("playQueue") ?? "[]").map(
          (clip: { id: number }) => clip.id,
        ),
      );
    assert.deepEqual(await queueIds(), savedOrder);
    console.log("PASS: drag order survives reload and controls playback queue");
    await page.route("**/api/v1/playlists/100/clips", async (route: any) => {
      if (route.request().method() === "PATCH")
        await route.fulfill({ status: 500 });
      else await route.continue();
    });
    await dragFirstToLast();
    await page
      .getByRole("alert")
      .filter({ hasText: "並べ替えを保存できませんでした" })
      .waitFor();
    await play.click();
    assert.deepEqual(await queueIds(), savedOrder);
    console.log(
      "PASS: failed order save restores the displayed and playback order",
    );
    await page.unroute("**/api/v1/playlists/100/clips");
    // Finish the preceding failure/recovery scenario before delaying a refresh.
    await page.reload();
    await handles.first().waitFor();
    page.on("dialog", (dialog: any) => dialog.accept());
    await page.route("**/api/v1/playlists/100/clips/*", (route: any) =>
      route.fulfill({ status: 403 }),
    );
    await page
      .getByRole("button", { name: "プレイリストから削除", exact: true })
      .first()
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "削除する権限がありません" })
      .waitFor();
    assert.equal(await handles.count(), 3);
    await page.unroute("**/api/v1/playlists/100/clips/*");
    // Hold server-component refreshes so deletion and a following drag happen
    // before new playlist props arrive. The old UI retains the removed ID here.
    let releaseRefresh = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let blockedRefreshes = 0;
    const refreshHandlers: Promise<void>[] = [];
    const playlistPage = (url: URL) => url.pathname === "/playlists/100";
    await page.route(playlistPage, (route: any) => {
      const handler = (async () => {
        if (route.request().headers().rsc === "1") {
          blockedRefreshes++;
          await refreshGate;
        }
        await route.continue();
      })();
      refreshHandlers.push(handler);
      return handler;
    });
    try {
      const removed = page.waitForResponse(
        (response: any) => response.request().method() === "DELETE",
      );
      await page
        .getByRole("button", { name: "プレイリストから削除", exact: true })
        .first()
        .click();
      assert.equal((await removed).status(), 204);
      for (
        let attempt = 0;
        attempt < 50 && (await handles.count()) !== 2;
        attempt++
      )
        await page.waitForTimeout(100);
      assert.equal(await handles.count(), 2);
      assert.ok(blockedRefreshes > 0, "server refresh is still pending");
      const remainingIds = savedOrder.slice(1);
      await play.click();
      assert.deepEqual(await queueIds(), remainingIds);
      const reordered = page.waitForResponse(
        (response: any) => response.request().method() === "PATCH",
      );
      await dragFirstToLast();
      const reorderedResponse = await reordered;
      assert.deepEqual(
        reorderedResponse.request().postDataJSON().previousClipIds,
        remainingIds,
      );
      assert.equal(reorderedResponse.status(), 204);
      assert.deepEqual(
        reorderedResponse.request().postDataJSON().clipIds,
        [...remainingIds].reverse(),
      );
      await play.click();
      assert.deepEqual(await queueIds(), [...remainingIds].reverse());
    } finally {
      releaseRefresh();
      await Promise.all(refreshHandlers);
      await page.unroute(playlistPage);
    }
    await page.reload();
    await handles.first().waitFor();
    await play.click();
    assert.deepEqual(await queueIds(), savedOrder.slice(1).reverse());
    console.log(
      "PASS: deletion updates the list and playback immediately; reorder succeeds before refresh finishes",
    );

    await page.evaluate(() => {
      document.documentElement.dataset.playlistUpdates = "0";
      window.addEventListener("playlists-updated", () => {
        document.documentElement.dataset.playlistUpdates = String(
          Number(document.documentElement.dataset.playlistUpdates) + 1,
        );
      });
    });
    await page.route("**/api/v1/playlists/*/clips", async (route: any) => {
      if (route.request().method() === "POST")
        await route.fulfill({ status: 500 });
      else await route.continue();
    });
    const openModal = page
      .getByRole("button", { name: "プレイリストに追加", exact: true })
      .first();
    await openModal.click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Order test", exact: true })
      .waitFor();
    await dialog.getByPlaceholder("プレイリスト名").fill("Partial creation");
    await dialog.getByRole("button", { name: "作成", exact: true }).click();
    await dialog
      .getByRole("alert")
      .filter({ hasText: "プレイリストは作成しましたが" })
      .waitFor();
    assert.ok(
      await dialog
        .getByRole("button", { name: "Partial creation", exact: true })
        .isEnabled(),
    );
    assert.equal(
      await dialog.getByPlaceholder("プレイリスト名").inputValue(),
      "",
    );
    assert.ok(
      Number(await page.locator("html").getAttribute("data-playlist-updates")) >
        0,
    );
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.unroute("**/api/v1/playlists/*/clips");
    await openModal.click();
    const existing = dialog.getByRole("button", {
      name: "Order test",
      exact: true,
    });
    await existing.waitFor();
    assert.ok(await existing.isEnabled());
    await existing.click();
    await dialog.waitFor({ state: "hidden" });
    await openModal.click();
    await existing.waitFor();
    assert.ok(await existing.isEnabled());
    console.log(
      "PASS: partial creation updates the shelf and reopening after success remains usable",
    );
    await context.close();
  } finally {
    await browser?.close();
    app.kill();
  }
}
