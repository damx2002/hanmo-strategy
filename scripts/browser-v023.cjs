const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const bundle = require("esbuild").buildSync({
  stdin: {
    contents: `export {endMonth} from './src/engine/turn';export {settleCity} from './src/engine/economy';export {fieldNames} from './src/engine/delegation/summary';`,
    resolveDir: path.resolve(__dirname, ".."),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const key = "hanmo-strategy-save-v2",
  url = process.env.GAME_URL || "http://127.0.0.1:4173/hanmo-strategy/";
(async () => {
  const core = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  const errors = [];
  let context, page, profile;
  const read = () =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  async function open(viewport) {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
      viewport,
    });
    page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
  }
  async function city(id) {
    const tab = page.getByRole("tab", { name: "城務", exact: true });
    if (await tab.isVisible()) await tab.click();
    await page.getByLabel("切換己方城池").selectOption(id);
  }
  try {
    for (const [width, height] of [
      [412, 915],
      [360, 800],
      [915, 412],
      [1440, 1000],
    ]) {
      profile = fs.mkdtempSync(path.join(os.tmpdir(), "hanmo-v023-"));
      const viewport = { width, height };
      await open(viewport);
      await page.getByRole("button", { name: /劉備.*起兵/ }).click();
      await city("chengdu");
      const selector = () => page.getByLabel("成都治理方針"),
        initial = await read();
      assert.equal(await selector().inputValue(), "manual");
      const position = (await selector().boundingBox()).y;
      await selector().selectOption("economy");
      assert.ok(
        Math.abs((await selector().boundingBox()).y - position) <= 1,
        "設定不應推動版面",
      );
      const configured = await read();
      for (const k of ["cities", "officers", "seed", "events", "battles"])
        assert.deepEqual(configured[k], initial[k], "設定本身免費");
      await city("hanzhong");
      assert.equal(
        await page.getByLabel("漢中治理方針").inputValue(),
        "manual",
      );
      await context.close();
      await open(viewport);
      await page.getByRole("button", { name: /繼續遊戲/ }).click();
      assert.deepEqual(await read(), configured, "真正關閉重啟需保留委任");
      if (width < 1000) {
        await page.getByRole("button", { name: /成都，/ }).click();
        assert.match(
          await page.locator(".city-quick-info").innerText(),
          /委任經濟/,
        );
      }
      await city("chengdu");
      assert.equal(await selector().inputValue(), "economy");
      const before = await read(),
        expected = core.endMonth(before);
      // Two real button activations in the same turn must commit one month only.
      await page.locator(".end-month").evaluate((el) => {
        el.click();
        el.click();
      });
      await page.getByRole("dialog", { name: /月度軍情/ }).waitFor();
      const after = await read();
      assert.deepEqual(after, expected);
      assert.equal(after.turn, before.turn + 1);
      assert.deepEqual(
        after.cities.find((c) => c.id === "hanzhong"),
        core.settleCity(before.cities.find((c) => c.id === "hanzhong")).city,
        "漢中只收月入、不自動施政",
      );
      const report = after.delegation.report;
      assert.ok(report.cities[0].actions.length > 0);
      const reportUI = page.getByRole("dialog").locator(".delegation-report");
      assert.ok(await reportUI.isVisible());
      assert.equal(
        await page.locator(".monthly-body").evaluate((e) => e.scrollTop),
        0,
      );
      assert.match(await reportUI.innerText(), /成都｜經濟優先/);
      await reportUI.locator(".delegation-city-result > summary").click();
      const text = await reportUI.innerText();
      for (const a of report.cities[0].actions)
        assert.ok(
          text.includes(`${a.officerName}執行`) &&
            text.includes(
              `${a.before.toLocaleString("zh-TW")} → ${a.after.toLocaleString("zh-TW")}`,
            ),
        );
      assert.ok(
        text.includes(report.cities[0].gold.toLocaleString("zh-TW") + " 金"),
      );
      await reportUI.locator(".delegation-economy > summary").click();
      assert.match(await reportUI.innerText(), /金入庫.*產糧.*軍糧.*糧庫實變/s);
      const rect = await page.getByRole("dialog").boundingBox();
      assert.ok(rect.y >= 0 && rect.y + rect.height <= height + 1);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `/tmp/hanmo-v023-report-${width}.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "開啟新月", exact: true }).click();
      await city("chengdu");
      const prior = await read();
      const c = prior.cities.find((c) => c.id === "chengdu");
      const command = c.agriculture < 100 ? "開墾" : "商業";
      await page.getByRole("button", { name: command, exact: true }).click();
      await page
        .getByRole("button", { name: `${command} · 執行`, exact: true })
        .click();
      const manual = await read();
      assert.equal(
        manual.cities.find((c) => c.id === "chengdu").actions,
        c.actions - 1,
      );
      assert.equal(manual.delegation.policies.chengdu, "economy");
      await selector().selectOption("manual");
      const cancelled = await read();
      assert.deepEqual(cancelled.cities, manual.cities);
      assert.deepEqual(cancelled.officers, manual.officers);
      assert.equal(cancelled.delegation.policies.chengdu, undefined);
      await page.getByText("委任說明與批次設定", { exact: true }).click();
      page.once("dialog", (d) => d.dismiss());
      await page.getByRole("button", { name: /批次委任後方城池/ }).click();
      assert.deepEqual(await read(), cancelled);
      page.once("dialog", (d) => d.accept());
      await page.getByRole("button", { name: /批次委任後方城池/ }).click();
      assert.equal((await read()).delegation.policies.chengdu, "balanced");
      assert.equal((await read()).delegation.policies.hanzhong, undefined);
      page.once("dialog", (d) => d.accept());
      await page
        .getByRole("button", { name: "取消後方委任", exact: true })
        .click();
      assert.equal((await read()).delegation.policies.chengdu, undefined);
      await selector().selectOption("economy");
      await page.screenshot({
        path: `/tmp/hanmo-v023-city-${width}.png`,
        fullPage: true,
      });
      const saved = await read();
      await page.reload();
      await page.getByRole("button", { name: /繼續遊戲/ }).click();
      assert.deepEqual(await read(), saved);
      await city("chengdu");
      assert.equal(await selector().inputValue(), "economy");
      // Original pre-update save: no policy is silently enabled and world data stays exact.
      const old = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, "../src/tests/fixtures/v0.2.2-save.json"),
          "utf8",
        ),
      );
      await page.evaluate(
        ({ key, old }) => localStorage.setItem(key, JSON.stringify(old)),
        { key, old },
      );
      await page.reload();
      await page.getByRole("button", { name: /繼續遊戲/ }).click();
      assert.deepEqual(await read(), old);
      await city("chengdu");
      assert.equal(await selector().inputValue(), "manual");
      await city("hanzhong");
      assert.equal(
        await page.getByLabel("漢中治理方針").inputValue(),
        "manual",
      );
      await context.close();
      context = undefined;
      fs.rmSync(profile, { recursive: true, force: true });
      console.log(
        `PASS V0.2.3 ${width}×${height}：成都經濟／漢中手動、免費設定、原子月結與真實成果／收支、手動接管、批次確認、關閉重啟、原V0.2.2存檔。`,
      );
    }
    assert.deepEqual(errors, []);
  } catch (e) {
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: "/tmp/hanmo-v023-failure.png", fullPage: true })
        .catch(() => {});
      console.error(
        (
          await page
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(-1600),
      );
    }
    throw e;
  } finally {
    if (context) await context.close();
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
