const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    process.env.GAME_URL || "http://127.0.0.1:5173/hanmo-strategy/",
  );
  await page.screenshot({ path: "/tmp/hanmo-home.png", fullPage: true });
  await page.getByRole("button", { name: /劉備.*起兵/ }).click();
  await page.getByRole("button", { name: /成都，/ }).click();
  await page.getByRole("button", { name: "開墾 · 執行" }).click();
  let save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanmo-strategy-save-v2")),
  );
  if (save.cities.find((c) => c.id === "chengdu").actions !== 2)
    throw Error("內政未執行");
  await page.reload();
  await page.getByRole("button", { name: /繼續遊戲/ }).click();
  await page.getByRole("button", { name: "武將總覽 · 30" }).click();
  if ((await page.locator(".wide tbody tr").count()) !== 30)
    throw Error("武將不齊");
  await page.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "結束本月 →" }).click();
  await page.getByRole("button", { name: "開啟新月" }).click();
  save = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanmo-strategy-save-v2")),
  );
  if (save.month !== 2) throw Error("月結失敗");
  await page.screenshot({ path: "/tmp/hanmo-desktop.png", fullPage: true });
  for (const [width, height] of [
    [412, 915],
    [915, 412],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `/tmp/hanmo-${width}.png`, fullPage: true });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw Error(`水平溢出 ${width}`);
    await page.getByRole("button", { name: "武將總覽 · 30" }).click();
    const box = await page.locator(".modal").boundingBox();
    if (box.x < 0 || box.x + box.width > width || box.y + box.height > height)
      throw Error(`彈窗溢出 ${width}`);
    await page.getByRole("button", { name: "關閉", exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole("button", { name: /漢中，/ }).click();
  await page.getByRole("button", { name: "調動", exact: true }).click();
  await page.getByLabel("調動目的地").selectOption("xiangyang");
  await page.getByLabel("派遣兵力", { exact: true }).fill("2000");
  await page.getByLabel("隨軍兵糧").fill("1000");
  const beforeTransfer = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanmo-strategy-save-v2")),
  );
  await page.getByRole("button", { name: "調動 · 執行" }).click();
  const transferred = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanmo-strategy-save-v2")),
  );
  if (transferred.officers.find((o) => o.id === "liu-3").cityId !== "xiangyang")
    throw Error("趙雲調動失敗");
  for (const k of ["troops", "food"])
    if (
      beforeTransfer.cities.reduce((s, c) => s + c[k], 0) !==
      transferred.cities.reduce((s, c) => s + c[k], 0)
    )
      throw Error("調動不守恆");
  await page.getByRole("button", { name: "結束本月 →" }).click();
  await page.getByRole("button", { name: "開啟新月" }).click();
  await page.getByRole("button", { name: /襄陽，/ }).click();
  await page.getByRole("button", { name: "出征", exact: true }).click();
  await page.getByLabel("指揮武將").selectOption("liu-3");
  await page.getByLabel("攻城目標").selectOption("wan");
  await page.getByLabel("派遣兵力", { exact: true }).fill("6000");
  const beforeAttack = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanmo-strategy-save-v2")),
  );
  await page.getByRole("button", { name: "出征 · 檢視軍議" }).click();
  await page.getByRole("button", { name: "委任作戰" }).click();
  const afterAttack = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanmo-strategy-save-v2")),
  );
  const report = afterAttack.battles[0];
  if (!report || report.commander !== "趙雲") throw Error("趙雲戰報未建立");
  const srcBefore = beforeAttack.cities.find((c) => c.id === "xiangyang"),
    srcAfter = afterAttack.cities.find((c) => c.id === "xiangyang");
  if (
    srcBefore.troops - srcAfter.troops !==
    (report.won ? report.sent : report.attackLoss)
  )
    throw Error("戰損未正確扣除");
  const skip = page.getByRole("button", { name: "略過交戰動畫" });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole("button", { name: "收閱戰報" }).click();
  await page.reload();
  await page.getByRole("button", { name: /繼續遊戲/ }).click();
  const restored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanmo-strategy-save-v2")),
  );
  if (restored.seed !== afterAttack.seed) throw Error("戰後存檔錯誤");
  // Recovery from a corrupt save must allow a real new game after confirmation.
  await page.evaluate(() =>
    localStorage.setItem("hanmo-strategy-save-v2", "{broken"),
  );
  await page.reload();
  await page.getByRole("button", { name: /劉備.*起兵/ }).click();
  await page.getByRole("button", { name: "刪除並重新選擇" }).click();
  await page.getByRole("button", { name: /劉備.*起兵/ }).click();
  if (!(await page.getByRole("button", { name: "結束本月 →" }).isVisible()))
    throw Error("損毀復原無法開局");
  // Double-click should only process one month.
  await page.getByRole("button", { name: "結束本月 →" }).dblclick();
  await page.getByRole("button", { name: "開啟新月" }).click();
  const last = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanmo-strategy-save-v2")),
  );
  if (last.turn !== 1) throw Error("月結重複");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS：開局、內政、30 將、調動守恆、趙雲出征與戰損、戰後存檔、損毀復原、月結防雙擊、三種手機尺寸，無頁面錯誤。",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
