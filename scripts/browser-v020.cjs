const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const esbuild = require("esbuild");
const key = "hanmo-strategy-save-v2",
  oldKey = "hanmo-strategy-save-v1";
const output = esbuild.buildSync({
  stdin: {
    contents: `export {reachable,distance} from './src/engine/tactical/movement';export {canAttack,estimateDamage,fireReason} from './src/engine/tactical/damage';export {T} from './src/engine/tactical/tacticalBalance';`,
    resolveDir: path.resolve(__dirname, ".."),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const url = process.env.GAME_URL || "http://127.0.0.1:4173/hanmo-strategy/";
(async () => {
  const rules = await import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hanmo-v020-"));
  let context, page;
  const errors = [];
  async function open() {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
      viewport: { width: 1440, height: 1080 },
    });
    page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
  }
  const read = () =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  const tile = (x, y) =>
    page.locator(`.battle-cell[data-x="${x}"][data-y="${y}"]`);
  async function moveTroops(city, target, officer, troops) {
    await page.getByRole("button", { name: new RegExp(city + "，") }).click();
    await page.getByRole("button", { name: "調動", exact: true }).click();
    await page.getByLabel("指揮武將").selectOption(officer);
    await page.getByLabel("調動目的地").selectOption(target);
    await page.getByLabel("派遣兵力", { exact: true }).fill(String(troops));
    await page.getByRole("button", { name: "調動 · 執行" }).click();
  }
  try {
    await open();
    await page.getByRole("button", { name: /劉備.*起兵/ }).click();
    await moveTroops("成都", "hanzhong", "liu-0", 6000);
    await moveTroops("襄陽", "hanzhong", "liu-1", 7000);
    await page.getByRole("button", { name: /漢中，/ }).click();
    await page.getByRole("button", { name: "出征", exact: true }).click();
    await page.getByLabel("指揮武將").selectOption("liu-3");
    await page.getByLabel("攻城目標").selectOption("wan");
    await page.getByLabel("派遣兵力", { exact: true }).fill("20000");
    const before = await read();
    await page.getByRole("button", { name: "出征 · 檢視軍議" }).click();
    assert.deepEqual(await read(), before);
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.deepEqual(await read(), before, "取消軍議不可扣費");
    await page.getByRole("button", { name: "出征 · 檢視軍議" }).click();
    await page.getByRole("button", { name: "親自指揮", exact: true }).click();
    let state = await read(),
      b = state.pendingBattle;
    assert.ok(b);
    assert.equal(state.cities[5].troops, before.cities[5].troops - 20000);
    assert.equal(state.cities[5].food, before.cities[5].food - b.foodCost);
    assert.ok(await page.locator(".end-month").isDisabled());
    assert.equal(
      b.units
        .filter((u) => u.side === "attacker")
        .reduce((n, u) => n + u.troops, 0),
      20000,
    );
    await tile(0, 2).click();
    await tile(2, 2).click();
    state = await read();
    assert.equal(state.pendingBattle.units[0].x, 2);
    assert.equal(state.pendingBattle.units[0].moved, true);
    // Close Chromium, then reopen its persistent profile: genuine local storage persistence.
    await context.close();
    await open();
    await page.getByRole("button", { name: /繼續遊戲/ }).click();
    assert.deepEqual(
      await read(),
      state,
      "關閉 Chrome 後需恢復同一戰場、資源、種子與行動旗標",
    );
    for (const [width, height] of [
      [412, 915],
      [915, 412],
      [360, 800],
    ]) {
      await page.setViewportSize({ width, height });
      assert.ok(
        !(await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )),
        "戰術頁水平溢出",
      );
      for (const button of await page
        .locator(".tactical-commands button")
        .all()) {
        const box = await button.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44);
      }
      const cell = await tile(0, 0).boundingBox();
      assert.ok(cell.width >= 44 && cell.height >= 44);
      const board = page.locator(".battle-grid"),
        size = await board.evaluate((e) => e.getBoundingClientRect().width);
      await page.getByRole("button", { name: "放大戰場" }).click();
      assert.ok(
        (await board.evaluate((e) => e.getBoundingClientRect().width)) > size,
      );
      await page.getByRole("button", { name: "重設戰場縮放" }).click();
      await page.screenshot({
        path: `/tmp/hanmo-v020-${width}.png`,
        fullPage: true,
      });
    }
    console.log("觸控與續玩檢查通過，開始 UI 作戰");
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.getByLabel("略過效果").check();
    let attacks = 0,
      enemyTurns = 0;
    // Choose legal actions using read-only rules; every actual state mutation is a UI click.
    for (let round = 0; round < 16; round++) {
      console.log("UI 戰術階段", round + 1);
      // Play the actual battle in portrait, landscape, and desktop, not only resize it.
      const viewport = [
        { width: 412, height: 915 },
        { width: 915, height: 412 },
        { width: 1440, height: 1080 },
      ][round % 3];
      await page.setViewportSize(viewport);
      state = await read();
      b = state.pendingBattle;
      if (b.status !== "active") break;
      if (b.phase !== "attacker") throw Error("未恢復攻方階段");
      for (const id of b.units
        .filter((u) => u.side === "attacker")
        .map((u) => u.id)) {
        state = await read();
        b = state.pendingBattle;
        if (b.status !== "active") break;
        let u = b.units.find((u) => u.id === id);
        if (!u.troops || u.attacked) continue;
        await tile(u.x, u.y).click();
        const enemies = b.units.filter(
          (v) => v.side !== u.side && v.troops > 0,
        );
        const candidates = [
          { x: u.x, y: u.y, cost: 0 },
          ...rules.reachable(b, u),
        ];
        function score(p) {
          const candidate = { ...u, ...p },
            closest = Math.min(...enemies.map((v) => rules.distance(p, v)));
          const attack = Math.max(
            0,
            ...enemies
              .filter((v) => rules.canAttack(b, candidate, v))
              .map((v) => rules.estimateDamage(b, candidate, v) * 0.03),
          );
          return (
            attack -
            closest * 12 +
            (u.type === "archer" && closest >= 2 && closest <= 3 ? 45 : 0) +
            (b.gate.hp > 0 &&
            rules.distance(p, b.gate) === 1 &&
            u.type !== "archer"
              ? 24
              : 0) +
            (b.gate.hp === 0 ? (8 - rules.distance(p, { x: 7, y: 2 })) * 5 : 0)
          );
        }
        candidates.sort((a, c) => score(c) - score(a) || a.cost - c.cost);
        const best = candidates[0];
        if (best.x !== u.x || best.y !== u.y) {
          await page.getByRole("button", { name: "移動", exact: true }).click();
          await tile(best.x, best.y).click();
        }
        state = await read();
        b = state.pendingBattle;
        u = b.units.find((v) => v.id === id);
        const target = b.units
          .filter((v) => rules.canAttack(b, u, v))
          .sort(
            (a, c) =>
              rules.estimateDamage(b, u, c) - rules.estimateDamage(b, u, a),
          )[0];
        if (target) {
          await page.getByRole("button", { name: "攻擊", exact: true }).click();
          const old = target.troops;
          await tile(target.x, target.y).click();
          const next = await read();
          assert.ok(
            next.pendingBattle.units.find((v) => v.id === target.id).troops <
              old,
          );
          attacks++;
        } else if (
          u.type !== "archer" &&
          b.gate.hp > 0 &&
          rules.distance(u, b.gate) === 1
        )
          await page.getByRole("button", { name: "破城", exact: true }).click();
        else
          await page.getByRole("button", { name: "待機", exact: true }).click();
      }
      state = await read();
      b = state.pendingBattle;
      if (b.status !== "active") break;
      const previousTurn = b.turn;
      await page.getByRole("button", { name: "結束階段", exact: true }).click();
      await page.waitForFunction((k) => {
        const b = JSON.parse(localStorage.getItem(k)).pendingBattle;
        return b.status !== "active" || b.phase === "attacker";
      }, key);
      enemyTurns++;
      const next = (await read()).pendingBattle;
      assert.ok(next.turn === previousTurn + 1 || next.status !== "active");
    }
    state = await read();
    b = state.pendingBattle;
    assert.notEqual(b.status, "active");
    assert.ok(attacks > 0 && enemyTurns > 0, "必須實際攻擊及經過敵軍回合");
    assert.equal(b.status, "attackerWon", "合法集結優勢軍力後應可攻城得勝");
    const survivors = b.units
      .filter((u) => u.side === "attacker")
      .reduce((n, u) => n + u.troops, 0);
    await page.getByRole("button", { name: "結算戰果 · 返回戰略地圖" }).click();
    // The report animation may finish while a viewport transition settles.
    // Wait for the real final report instead of racing an optional short-lived button.
    await page.getByRole("button", { name: "收閱戰報" }).click();
    const finished = await read();
    assert.equal(finished.pendingBattle, null);
    assert.equal(finished.cities[4].ownerId, "liu");
    assert.equal(finished.cities[4].troops, survivors);
    assert.equal(finished.cities[5].troops, before.cities[5].troops - 20000);
    assert.equal(finished.cities[5].food, before.cities[5].food - b.foodCost);
    await page.reload();
    await page.getByRole("button", { name: /繼續遊戲/ }).click();
    assert.deepEqual(await read(), finished, "戰果不能因重開而重複結算");
    // Real legacy migration and explicit recovery behavior in the same browser.
    const legacy = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../src/tests/fixtures/v0.1.1-save.json"),
        "utf8",
      ),
    );
    await page.evaluate(
      ({ key, oldKey, legacy }) => {
        localStorage.removeItem(key);
        localStorage.setItem(oldKey, JSON.stringify(legacy));
      },
      { key, oldKey, legacy },
    );
    await page.reload();
    await page.getByRole("button", { name: /繼續遊戲/ }).click();
    assert.deepEqual(await read(), {
      ...legacy,
      version: 2,
      pendingBattle: null,
    });
    assert.deepEqual(
      await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), oldKey),
      legacy,
    );
    await page.evaluate((k) => localStorage.setItem(k, "{broken"), key);
    await page.reload();
    assert.ok(
      (await page.getByRole("button", { name: /繼續遊戲/ }).count()) === 0,
    );
    assert.ok(
      await page.getByRole("button", { name: "匯出現有存檔備份" }).isVisible(),
    );
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "確認復原 V1 備份" }).click();
    assert.deepEqual(await read(), {
      ...legacy,
      version: 2,
      pendingBattle: null,
    });
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("hanmo-strategy-save-v2-recovery-backup"),
      ),
      "{broken",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS V0.2.0：桌面合法集兵、軍議取消、親征、移動、${attacks} 次真實攻擊、${enemyTurns} 次敵軍階段、勝利易主與只結算一次、關閉重啟 Chrome 戰中續玩、三種手機尺寸／縮放觸控、V1 遷移保留備份與損毀 V2 明確復原。`,
    );
  } catch (e) {
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: "/tmp/hanmo-v020-failure.png", fullPage: true })
        .catch(() => {});
      console.error(
        "失敗頁面",
        await page
          .locator("body")
          .innerText()
          .then((t) => t.slice(-1200))
          .catch(() => ""),
      );
    }
    throw e;
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
