const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const legacy = JSON.parse(
  fs.readFileSync(
    require("node:path").join(
      __dirname,
      "../src/tests/fixtures/v0.1.0-save.json",
    ),
    "utf8",
  ),
);
const key = "hanmo-strategy-save-v2";
const legacyKey = "hanmo-strategy-save-v1";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1080 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const url = process.env.GAME_URL || "http://127.0.0.1:4173/hanmo-strategy/";
    await page.goto(url);
    const read = () =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    const enter = async (state) => {
      await page.evaluate(
        ({ key, state }) =>
          localStorage.removeItem(key) ||
          localStorage.setItem("hanmo-strategy-save-v1", JSON.stringify(state)),
        { key, state },
      );
      await page.reload();
      await page.getByRole("button", { name: /繼續遊戲/ }).click();
    };
    await enter(legacy);
    assert.deepEqual(
      await read(),
      { ...legacy, version: 2, pendingBattle: null },
      "舊檔進入遊戲後必須完整保留，不能重置",
    );
    await page.getByRole("button", { name: /成都，/ }).click();
    assert.equal(await page.locator(".command-grid button").count(), 8);
    await page.getByLabel("指揮武將").selectOption("liu-4");
    await page.getByRole("button", { name: "巡察", exact: true }).click();
    assert.equal(
      await page.getByLabel("指揮武將").inputValue(),
      "liu-4",
      "有效手選不可被切換",
    );
    const before = await read();
    await page.getByRole("button", { name: "巡察 · 執行" }).click();
    const after = await read();
    assert.equal(after.cities[6].gold, before.cities[6].gold - 200);
    assert.ok(after.cities[6].security > before.cities[6].security);
    assert.equal(
      await page.getByLabel("指揮武將").inputValue(),
      "liu-0",
      "執行後選下一位可用武將",
    );
    assert.match(
      await page.locator(".action-feedback").innerText(),
      /諸葛亮完成巡察，治安 \d+ → \d+/,
    );
    await page.getByRole("button", { name: "修築", exact: true }).click();
    await page.getByRole("button", { name: "修築 · 執行" }).click();
    const repaired = await read();
    assert.ok(repaired.cities[6].defense > after.cities[6].defense);
    assert.equal(repaired.cities[6].gold, after.cities[6].gold - 320);
    assert.equal(await page.getByLabel("指揮武將").inputValue(), "liu-9");
    await page.getByRole("button", { name: "開墾", exact: true }).click();
    await page.getByRole("button", { name: "開墾 · 執行" }).click();
    assert.equal(await page.getByLabel("指揮武將").inputValue(), "");
    assert.match(
      await page.locator(".commands").innerText(),
      /本城武將已全部行動/,
    );
    assert.match(
      await page.locator(".commands").innerText(),
      /本城本月指令已用盡/,
    );
    assert.ok(
      await page.getByRole("button", { name: "開墾 · 執行" }).isDisabled(),
    );
    await page.getByRole("button", { name: /漢中，/ }).click();
    assert.equal(await page.getByLabel("指揮武將").inputValue(), "liu-1");
    await page.getByLabel("指揮武將").selectOption("liu-3");
    await page.getByRole("button", { name: "調動", exact: true }).click();
    await page.getByLabel("調動目的地").selectOption("chengdu");
    await page.getByLabel("派遣兵力", { exact: true }).fill("1000");
    await page.getByRole("button", { name: "調動 · 執行" }).click();
    assert.equal(
      await page.getByLabel("指揮武將").inputValue(),
      "liu-1",
      "離城武將不得殘留選取",
    );
    const moved = await read();
    await page.reload();
    await page.getByRole("button", { name: /繼續遊戲/ }).click();
    assert.deepEqual(await read(), moved);
    for (const [width, height] of [
      [412, 915],
      [915, 412],
      [360, 800],
    ]) {
      await page.setViewportSize({ width, height });
      await page.getByRole("button", { name: /成都，/ }).click();
      assert.ok(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
        `頁面溢出 ${width}`,
      );
      const buttons = await page.locator(".command-grid button").all();
      for (const button of buttons) {
        const box = await button.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, "指令觸控區太小");
      }
      const map = page.locator(".map-scroll");
      const beforeWidth = await map
        .locator("svg")
        .evaluate((el) => el.getBoundingClientRect().width);
      await page.getByRole("button", { name: "放大地圖" }).click();
      const zoomWidth = await map
        .locator("svg")
        .evaluate((el) => el.getBoundingClientRect().width);
      assert.ok(zoomWidth > beforeWidth, "放大必須實際增加地圖尺寸");
      await map.evaluate((el) => {
        el.scrollLeft = 300;
      });
      assert.ok(
        (await map.evaluate((el) => el.scrollLeft)) > 0,
        "地圖不可橫向捲動",
      );
      await page.getByRole("button", { name: "重設地圖縮放與位置" }).click();
      assert.equal(await map.evaluate((el) => el.scrollLeft), 0);
      await page.screenshot({
        path: `/tmp/hanmo-v011-${width}.png`,
        fullPage: true,
      });
    }
    const capped = structuredClone(legacy);
    capped.cities[6].security = 100;
    capped.cities[6].defense = 100;
    await enter(capped);
    await page.getByRole("button", { name: /成都，/ }).click();
    assert.ok(
      await page
        .getByRole("button", { name: "巡察", exact: true })
        .isDisabled(),
    );
    assert.ok(
      await page
        .getByRole("button", { name: "修築", exact: true })
        .isDisabled(),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS V0.1.1：原版存檔完整延續、巡察修築實效、保留手選／自動接續／耗盡提示／離城切換、8 指令觸控區、直橫向無溢出、有效縮放捲動復位、上限禁用。",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
