const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const output = require("esbuild").buildSync({
  stdin: {
    contents: `export {newGame} from './src/data/scenario';export {beginTactical} from './src/engine/tactical/createBattle';export {damagePreview} from './src/engine/tactical/damage';export {upgradeToV3,isGameState} from './src/engine/save';`,
    resolveDir: path.resolve(__dirname, ".."),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const key = "hanmo-strategy-save-v3",
  url = process.env.GAME_URL || "http://127.0.0.1:4173/hanmo-strategy/";
(async () => {
  const core = await import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "hanmo-v021-"));
  let context, page;
  const errors = [];
  async function open() {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox"],
      viewport: { width: 412, height: 915 },
    });
    page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
  }
  function fixture(kind = "attack", seed = 42) {
    const s = core.newGame("liu", 42);
    s.cities[5].troops = 50000;
    s.cities[5].food = 100000;
    const n = core.beginTactical(s, {
        cityId: "hanzhong",
        targetId: "wan",
        officerId: "liu-3",
        troops: 40000,
      }).state,
      b = n.pendingBattle;
    b.turn = 3;
    const positions = [
      [2, 2],
      [2, 4],
      [2, 0],
      [4, 0],
      [3, 2],
      [3, 4],
    ];
    b.units.forEach((u, i) => {
      [u.x, u.y] = positions[i];
    });
    if (kind === "focus") {
      b.units[1].troops = 0;
      b.units[2].troops = 0;
    }
    if (kind === "kill") b.units[4].troops = 1;
    if (kind === "edge") {
      b.units[2].x = 5;
      b.units[2].y = 0;
      b.units[3].x = 7;
      b.units[3].y = 0;
    }
    if (kind === "neutral") {
      b.units[0].x = 3;
      b.units[0].y = 0;
    }
    if (kind === "disadvantage") {
      b.units[0].x = 2;
      b.units[0].y = 3;
      b.units[5].x = 3;
      b.units[5].y = 3;
    }
    b.seed = seed;
    n.seed = seed;
    assert.ok(core.isGameState(n));
    return core.upgradeToV3(n);
  }
  const read = () =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  const tile = (x, y) =>
    page.locator(`.battle-cell[data-x="${x}"][data-y="${y}"]`);
  async function enter(state) {
    state = core.upgradeToV3(state);
    await page.evaluate(
      ({ key, state }) => {
        localStorage.removeItem("hanmo-strategy-save-v1");
        localStorage.setItem(key, JSON.stringify(state));
      },
      { key, state },
    );
    await page.reload();
    await page.getByRole("button", { name: /繼續遊戲/ }).click();
    assert.deepEqual(await read(), state);
  }
  async function checkHit(f) {
    const anchor = tile(f.target.x, f.target.y),
      hit = anchor.locator(`.combat-hit[data-combat-seq="${f.sequence}"]`);
    await hit.waitFor({ state: "visible" });
    assert.equal(
      await hit.getAttribute("data-casualties"),
      String(f.casualties),
    );
    assert.ok(
      (await hit.innerText()).includes(
        "−" + f.casualties.toLocaleString("zh-TW"),
      ),
    );
    assert.equal(await hit.getAttribute("data-target-x"), String(f.target.x));
    assert.equal(await hit.getAttribute("data-target-y"), String(f.target.y));
    const clickThrough = await anchor.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        document
          .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          ?.closest("button") === el
      );
    });
    assert.ok(clickThrough, "浮字不能阻擋格子觸控");
    const band = await page.locator(".combat-live").boundingBox(),
      viewport = page.viewportSize();
    assert.ok(
      band.y >= 0 && band.y + band.height <= viewport.height,
      "不用捲到底部才能看傷亡",
    );
    assert.ok(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )),
    );
    return hit;
  }
  try {
    await open();
    for (const [width, height, index, target] of [
      [412, 915, 0, 4],
      [915, 412, 1, 5],
      [360, 800, 2, 3],
    ]) {
      await page.setViewportSize({ width, height });
      const s = fixture();
      await enter(s);
      const u = s.pendingBattle.units[index],
        v = s.pendingBattle.units[target];
      await tile(u.x, u.y).click();
      await page.getByRole("button", { name: "攻擊", exact: true }).click();
      const preview = core.damagePreview(s.pendingBattle, u, v);
      const cell = tile(v.x, v.y);
      assert.equal(
        await cell.getAttribute("data-matchup"),
        String(preview.multiplier),
      );
      assert.equal(
        await cell.getAttribute("data-preview-min"),
        String(preview.min),
      );
      assert.equal(
        await cell.getAttribute("data-preview-max"),
        String(preview.max),
      );
      assert.ok(
        (await page.locator(".combat-live").innerText()).includes("兵種優勢"),
      );
      assert.deepEqual(await read(), s, "預覽不可扣兵或消耗亂數");
      await cell.scrollIntoViewIfNeeded();
      const y = await page.evaluate(() => scrollY);
      await cell.click();
      const n = await read(),
        f = n.pendingBattle.combatFeedback.find((f) => f.kind === "attack");
      assert.equal(
        f.casualties,
        v.troops - n.pendingBattle.units[target].troops,
      );
      assert.equal(f.relation, "advantage");
      const hit = await checkHit(f);
      assert.match(await hit.innerText(), /兵種克制/);
      const counter = n.pendingBattle.combatFeedback.find(
        (f) => f.kind === "retaliation",
      );
      assert.equal(
        u.troops - n.pendingBattle.units[index].troops,
        counter?.casualties ?? 0,
      );
      if (counter) {
        assert.equal(counter.parentSequence, f.sequence);
        assert.ok(
          counter.casualties >= preview.counterMin &&
            counter.casualties <= preview.counterMax,
        );
        const counterHit = await checkHit(counter);
        assert.match(await counterHit.innerText(), /反擊傷亡/);
        const ownBubble = await counterHit
          .locator(".damage-float")
          .boundingBox();
        const enemyBubble = await hit.locator(".damage-float").boundingBox();
        assert.ok(
          ownBubble.x + ownBubble.width <= enemyBubble.x ||
            enemyBubble.x + enemyBubble.width <= ownBubble.x ||
            ownBubble.y + ownBubble.height <= enemyBubble.y ||
            enemyBubble.y + enemyBubble.height <= ownBubble.y,
          "主擊與反擊浮字不可重疊",
        );
        assert.equal(n.pendingBattle.units[target].attacked, v.attacked);
        assert.match(await page.locator(".combat-live").innerText(), /反擊/);
        if (width === 412)
          await page.screenshot({ path: "/tmp/hanmo-v022-counter.png" });
      }
      assert.equal(
        await page.evaluate(() => scrollY),
        y,
        "傷害回饋不應造成捲頁",
      );
      await page.waitForTimeout(1050);
      assert.equal(await page.locator(".combat-hit").count(), 0);
      await page.getByRole("button", { name: "移動", exact: true }).click();
      assert.equal(
        await page.locator(".combat-hit").count(),
        0,
        "重新繪製不得重播舊事件",
      );
    }
    await page.setViewportSize({ width: 412, height: 915 });
    for (const kind of ["neutral", "disadvantage"]) {
      const s = fixture(kind);
      await enter(s);
      const v = s.pendingBattle.units[kind === "neutral" ? 3 : 5];
      await page.getByRole("button", { name: "攻擊", exact: true }).click();
      assert.match(
        await page.locator(".combat-live").innerText(),
        kind === "neutral" ? /兵種中立/ : /兵種劣勢/,
      );
      await tile(v.x, v.y).click();
      const f = (await read()).pendingBattle.combatFeedback.find(
        (f) => f.kind === "attack",
      );
      assert.equal(f.relation, kind === "neutral" ? "neutral" : "disadvantage");
      await checkHit(f);
    }
    for (const seed of [1, 1600]) {
      const s = fixture("fire", seed);
      await enter(s);
      await page.getByLabel("略過效果").check();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByRole("button", { name: "火計", exact: true }).click();
      await tile(3, 2).click();
      const n = await read(),
        f = n.pendingBattle.combatFeedback.at(-1);
      assert.equal(f.success, seed === 1);
      assert.equal(f.matchup, 1);
      const hit = await checkHit(f);
      assert.match(await hit.innerText(), seed === 1 ? /火計成功/ : /火計失敗/);
      assert.equal(
        await hit
          .locator(".damage-float")
          .evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
      assert.equal(n.pendingBattle.fireUsed.attacker, 1);
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const edge = fixture("edge");
    await enter(edge);
    await tile(5, 0).click();
    await page.getByRole("button", { name: "攻擊", exact: true }).click();
    await tile(7, 0).scrollIntoViewIfNeeded();
    await tile(7, 0).click();
    const edgeHit = (await read()).pendingBattle.combatFeedback.at(-1);
    const bubble = await (
        await checkHit(edgeHit)
      )
        .locator(".damage-float")
        .boundingBox(),
      scroller = await page.locator(".tactical-scroll").boundingBox();
    assert.ok(
      bubble.x >= scroller.x - 1 &&
        bubble.x + bubble.width <= scroller.x + scroller.width + 1 &&
        bubble.y >= scroller.y - 1,
      "邊角傷害浮字不可被裁切",
    );
    const killed = fixture("kill");
    await enter(killed);
    await page.getByRole("button", { name: "攻擊", exact: true }).click();
    await tile(3, 2).click();
    let saved = await read(),
      f = saved.pendingBattle.combatFeedback.at(-1);
    assert.equal(f.after, 0);
    assert.equal(f.casualties, 1);
    assert.match(await (await checkHit(f)).innerText(), /部隊潰滅/);
    assert.ok(
      (await page.locator(".tactical-unit-panel h3").innerText()).includes(
        "騎兵",
      ),
      "完成攻擊後應自動選下一隊",
    );
    await page.getByRole("button", { name: "待機", exact: true }).click();
    await page.getByRole("button", { name: "待機", exact: true }).click();
    assert.match(
      await page.locator(".phase-ready").innerText(),
      /全軍已行動，可結束階段/,
    );
    saved = await read();
    assert.equal(saved.pendingBattle.phase, "attacker");
    assert.equal(saved.pendingBattle.turn, 3);
    await context.close();
    await open();
    await page.getByRole("button", { name: /繼續遊戲/ }).click();
    assert.deepEqual(await read(), saved);
    assert.equal(
      await page.locator(".combat-hit").count(),
      0,
      "重開不能重新播放已保存事件",
    );
    assert.ok(
      (await page.locator(".combat-live").innerText()).includes("潰滅"),
    );
    const enemy = fixture("focus");
    await enter(enemy);
    await page.getByRole("button", { name: "攻擊", exact: true }).click();
    await page.getByLabel("略過效果").check();
    await page.getByRole("button", { name: "結束階段", exact: true }).click();
    await page.waitForFunction(
      (k) =>
        JSON.parse(localStorage.getItem(k)).pendingBattle.phase === "attacker",
      key,
    );
    const n = await read(),
      events = n.pendingBattle.combatFeedback.filter(
        (f) => f.phase === "defender",
      );
    assert.ok(events.length > 0);
    assert.equal(
      await page.locator(".enemy-results li").count(),
      events.length,
    );
    for (const u of enemy.pendingBattle.units.filter(
      (u) => u.side === "attacker",
    )) {
      const total = events
        .filter((f) => f.targetId === u.id)
        .reduce((sum, f) => sum + f.casualties, 0);
      assert.equal(
        n.pendingBattle.units.find((v) => v.id === u.id).troops,
        u.troops - total,
      );
    }
    const grouped = events
      .filter((f) => f.targetId === "attacker-0")
      .reduce((sum, f) => sum + f.casualties, 0);
    const batchFloat = tile(2, 2).locator(".combat-hit");
    assert.equal(
      await batchFloat.getAttribute("data-casualties"),
      String(grouped),
    );
    assert.match(await batchFloat.innerText(), /次受擊/);
    const band = await page.locator(".combat-live").boundingBox();
    assert.ok(band.y >= 0 && band.y + band.height <= 915);
    for (const f of events) {
      const line = page.locator(
        `.enemy-results [data-feedback-seq="${f.sequence}"]`,
      );
      assert.ok(await line.isVisible());
      assert.ok(
        (await line.innerText()).includes(f.casualties.toLocaleString("zh-TW")),
      );
    }
    await page.screenshot({
      path: "/tmp/hanmo-v021-phone.png",
      fullPage: true,
    });
    const old = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../src/tests/fixtures/v0.2.0-battle-save.json"),
        "utf8",
      ),
    );
    await enter(old);
    assert.equal((await read()).pendingBattle.combatFeedback, undefined);
    const old021 = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../src/tests/fixtures/v0.2.1-battle-save.json"),
        "utf8",
      ),
    );
    await enter(old021);
    assert.equal(await page.locator(".combat-hit").count(), 0);
    const v1 = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../src/tests/fixtures/v0.1.1-save.json"),
        "utf8",
      ),
    );
    await page.evaluate(
      ({ key, v1 }) => {
        localStorage.removeItem(key);
        localStorage.setItem("hanmo-strategy-save-v1", JSON.stringify(v1));
      },
      { key, v1 },
    );
    await page.reload();
    await page.getByRole("button", { name: /繼續遊戲/ }).click();
    assert.deepEqual(
      await read(),
      core.upgradeToV3({ ...v1, version: 2, pendingBattle: null }),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS V0.2.1：三組克制／中立劣勢預覽、真實目標浮字與兵損、火計成功失敗、略過及減少動態、潰滅／自動接續、敵軍各次摘要、無捲頁／觸控阻擋、三種手機尺寸、Chrome 重開、V1 與原 V2 存檔。",
    );
  } catch (e) {
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: "/tmp/hanmo-v021-failure.png", fullPage: true })
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
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
