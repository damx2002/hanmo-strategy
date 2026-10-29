// Strategy navigation and stable city commands, using the real production UI.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const url = process.env.GAME_URL || "http://127.0.0.1:4173/hanmo-strategy/";
const key = "hanmo-strategy-save-v3";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  let page;
  const errors = [];
  const read = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
  const tab = async (name) => {
    await page.getByRole("tab", { name, exact: true }).click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(
      await page
        .getByRole("tab", { name, exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
  };
  async function fits() {
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "不可水平溢出",
    );
    assert.equal(
      await page.evaluate(() => scrollY),
      0,
      "戰略手機由分頁內捲動，不需捲整個頁面",
    );
    const nav = await page.locator(".mobile-tabs").boundingBox();
    assert.ok(nav.y + nav.height <= page.viewportSize().height + 1);
    for (const button of await page.getByRole("tab").all()) {
      const r = await button.boundingBox();
      assert.ok(r.width >= 44 && r.height >= 44);
    }
  }
  try {
    for (const [width, height] of [
      [412, 915],
      [360, 800],
      [915, 412],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
      });
      page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url);
      await page.getByLabel("歷史劇本").selectOption("legacy");
      await page.getByRole("button", { name: /劉備.*起兵/ }).click();
      await fits();
      assert.equal(
        await page
          .getByRole("tab", { name: "天下", exact: true })
          .getAttribute("aria-selected"),
        "true",
      );
      await page.getByRole("button", { name: /成都，/ }).click();
      assert.match(
        await page.locator(".city-quick-info").innerText(),
        /成都.*劉備軍/s,
      );
      await page.getByRole("button", { name: "開啟城務", exact: true }).click();
      assert.equal(
        await page.getByLabel("切換己方城池").inputValue(),
        "chengdu",
      );
      await page.getByRole("button", { name: "開墾", exact: true }).click();
      const before = await read(),
        city = before.cities.find((c) => c.id === "chengdu");
      const officer = await page.getByLabel("指揮武將").inputValue();
      const command = page.getByRole("button", {
        name: "開墾 · 執行",
        exact: true,
      });
      await command.scrollIntoViewIfNeeded();
      const position = await page
        .locator(".city-pane")
        .evaluate((el) => el.scrollTop);
      const top = (await command.boundingBox()).y;
      await command.click();
      const after = await read(),
        changed = after.cities.find((c) => c.id === "chengdu");
      assert.equal(changed.actions, city.actions - 1);
      assert.ok(changed.agriculture > city.agriculture);
      assert.ok(changed.gold < city.gold);
      assert.ok(after.officers.find((o) => o.id === officer).acted);
      assert.notEqual(await page.getByLabel("指揮武將").inputValue(), officer);
      assert.match(
        await page.locator(".action-feedback").innerText(),
        /農業.*→/,
      );
      assert.ok(
        Math.abs((await command.boundingBox()).y - top) <= 1,
        "成功訊息不可推動操作位置",
      );
      assert.ok(
        Math.abs(
          (await page.locator(".city-pane").evaluate((el) => el.scrollTop)) -
            position,
        ) <= 1,
      );
      await page.screenshot({ path: `/tmp/hanmo-v022-city-${width}.png` });
      await tab("武將");
      assert.ok(
        await page
          .getByRole("heading", { name: "己方武將 · 待命與駐地" })
          .isVisible(),
      );
      assert.match(
        await page.locator(".officers-pane").innerText(),
        /待命|已行動/,
      );
      await tab("軍情");
      assert.ok(
        await page.getByRole("heading", { name: /軍國紀事/ }).isVisible(),
      );
      assert.match(await page.locator(".event-list").innerText(), /開墾/);
      await tab("城務");
      assert.equal(
        await page.getByLabel("切換己方城池").inputValue(),
        "chengdu",
      );
      assert.equal(
        await page.locator(".city-pane").evaluate((el) => el.scrollTop),
        position,
      );
      await fits();
      await page.getByLabel("切換己方城池").selectOption("hanzhong");
      await page.getByRole("button", { name: "出征", exact: true }).click();
      await page.getByLabel("攻城目標").selectOption("wan");
      const beforeCouncil = await read();
      await page.getByRole("button", { name: "出征 · 檢視軍議" }).click();
      const modal = await page.getByRole("dialog").boundingBox();
      assert.ok(
        modal.y >= 0 && modal.y + modal.height <= height + 1,
        "頂底欄不能遮住軍議",
      );
      assert.deepEqual(await read(), beforeCouncil);
      await page.getByRole("button", { name: "取消", exact: true }).click();
      assert.deepEqual(await read(), beforeCouncil);
      await tab("天下");
      await page.getByRole("button", { name: /宛，/ }).click();
      assert.match(
        await page.locator(".city-quick-info").innerText(),
        /宛.*曹操軍.*敵軍城池/s,
      );
      await page.getByRole("button", { name: "查看敵情", exact: true }).click();
      assert.equal(await page.locator(".commands").count(), 0, "敵城不能內政");
      assert.match(
        await page.locator(".enemy-approaches").innerText(),
        /敵軍城池.*曹操軍.*漢中.*可出征/s,
      );
      await page
        .locator(".enemy-approaches")
        .getByRole("button", { name: /漢中 → 城務/ })
        .click();
      assert.equal(
        await page.getByLabel("切換己方城池").inputValue(),
        "hanzhong",
      );
      assert.ok(await page.locator(".commands").isVisible());
      await tab("天下");
      await page.locator(".city-overview summary").click();
      const overview = page.locator(".city-overview");
      assert.match(await overview.innerText(), /兵.*金.*糧.*剩餘.*待命.*邊境/s);
      await overview.getByRole("button", { name: /^江州/ }).click();
      assert.equal(
        await page.getByLabel("切換己方城池").inputValue(),
        "jiangzhou",
      );
      await tab("天下");
      const zoomBefore = await page
        .locator(".map-scroll svg")
        .evaluate((el) => el.getBoundingClientRect().width);
      await page.getByRole("button", { name: "放大地圖", exact: true }).click();
      const zoomAfter = await page
        .locator(".map-scroll svg")
        .evaluate((el) => el.getBoundingClientRect().width);
      assert.ok(zoomAfter > zoomBefore);
      await fits();
      await page.screenshot({
        path: `/tmp/hanmo-v022-strategy-${width}.png`,
        fullPage: true,
      });
      await context.close();
    }
    // Explicit readiness conditions through the same load/save path, without erasing progress.
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    });
    page = await context.newPage();
    await page.goto(url);
    await page.getByLabel("歷史劇本").selectOption("legacy");
    await page.getByRole("button", { name: /劉備.*起兵/ }).click();
    const base = await read();
    for (const [kind, text] of [
      ["orders", "本月指令已用盡"],
      ["acted", "全部武將已行動"],
      ["empty", "本城沒有武將"],
    ]) {
      const s = structuredClone(base);
      if (kind === "orders")
        s.cities.find((c) => c.id === "hanzhong").actions = 0;
      for (const o of s.officers.filter((o) => o.cityId === "hanzhong")) {
        if (kind === "acted") o.acted = true;
        if (kind === "empty") o.cityId = "chengdu";
      }
      await page.evaluate(
        ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
        { key, s },
      );
      await page.reload();
      await page.getByRole("button", { name: /繼續遊戲/ }).click();
      await tab("城務");
      assert.match(
        await page.locator(".city-readiness").innerText(),
        new RegExp(text),
      );
      assert.deepEqual(await read(), s);
    }
    await context.close();
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await desktop.newPage();
    await page.goto(url);
    await page.getByLabel("歷史劇本").selectOption("legacy");
    await page.getByRole("button", { name: /劉備.*起兵/ }).click();
    assert.ok(await page.locator(".map-frame").isVisible());
    assert.ok(await page.locator(".city-panel").isVisible());
    assert.ok(!(await page.locator(".mobile-tabs").isVisible()));
    const map = await page.locator(".map-frame").boundingBox(),
      city = await page.locator(".city-panel").boundingBox();
    assert.ok(map.x + map.width <= city.x, "桌面保留雙欄");
    await page.screenshot({
      path: "/tmp/hanmo-v022-desktop.png",
      fullPage: true,
    });
    await desktop.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS V0.2.2：412×915／360×800／915×412 四分頁、真實城務不跳動與選城保留、敵城與鄰城出征、軍議遮擋／取消、城池總覽、三種待命原因、縮放／捲動／觸控與桌面雙欄。",
    );
  } catch (e) {
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: "/tmp/hanmo-v022-failure.png", fullPage: true })
        .catch(() => {});
      console.error(
        (
          await page
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(-1400),
      );
    }
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
