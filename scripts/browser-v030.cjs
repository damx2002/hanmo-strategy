// Production Chromium smoke: new worlds, real orders, paused invasions and defender saves.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright-core",
);
const output = require("esbuild").buildSync({
  stdin: {
    contents: `
export {newGame} from './src/data/scenario';
export {newScenarioGame} from './src/data/scenarios';
export {upgradeToV3,isGameState} from './src/engine/save';
export {personnelDispatch} from './src/engine/personnel';
export {diplomacyDispatch} from './src/engine/diplomacy';
export {startMonthResolution,advanceMonthResolution} from './src/engine/resolution/month';
export {resolvePendingDefense} from './src/engine/resolution/defense';
export {completeTactical} from './src/engine/tactical/resolve';
export {canAttack,estimateDamage} from './src/engine/tactical/damage';`,
    resolveDir: path.resolve(__dirname, ".."),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const url = process.env.GAME_URL || "http://127.0.0.1:4173/hanmo-strategy/",
  key = "hanmo-strategy-save-v3";
(async () => {
  const core = await import(
    "data:text/javascript;base64," +
      Buffer.from(output.outputFiles[0].text).toString("base64")
  );
  const setup = core.newScenarioGame("three214", "cao", 1);
  const personnelCity = setup.cities.find(
    (c) =>
      c.ownerId === "cao" &&
      setup.officers.filter((o) => o.factionId === "cao" && o.cityId === c.id)
        .length >= 4 &&
      setup.officers.some(
        (o) => !o.factionId && !o.discovered && o.cityId === c.id,
      ),
  ).id;
  const hireId = setup.officers
    .filter((o) => !o.factionId && !o.discovered && o.cityId === personnelCity)
    .sort(
      (a, b) => b.politics + b.leadership - a.politics - a.leadership,
    )[0].id;
  const diplomacyCity = setup.cities.find(
    (c) =>
      c.ownerId === "cao" &&
      c.id !== personnelCity &&
      c.id !== "tianshui" &&
      setup.officers.filter((o) => o.factionId === "cao" && o.cityId === c.id)
        .length >= 3,
  ).id;
  let context, page, profile;
  const errors = [];
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
  const read = () =>
    page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
  async function tab(name) {
    const t = page.getByRole("tab", { name, exact: true });
    if (await t.isVisible()) await t.click();
    else
      await page
        .getByRole("button", {
          name:
            name === "武將"
              ? "人事武將"
              : name === "軍情"
                ? "軍情外交"
                : "天下城務",
          exact: true,
        })
        .click();
  }
  async function enter(s) {
    assert.ok(core.isGameState(s));
    await page.evaluate(
      ({ key, s }) => {
        localStorage.clear();
        localStorage.setItem(key, JSON.stringify(s));
      },
      { key, s },
    );
    await page.reload();
    await page.getByRole("button", { name: /繼續遊戲/ }).click();
  }
  async function fits(height) {
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "不可橫向溢出",
    );
    const d = page.getByRole("dialog");
    if (await d.count()) {
      const r = await d.boundingBox();
      assert.ok(
        r.y >= 0 && r.y + r.height <= height + 1,
        "軍議必須完整位於可視區",
      );
    }
  }
  function invasion() {
    const s = core.upgradeToV3(core.newGame("liu", 42));
    Object.assign(
      s.cities.find((c) => c.id === "wan"),
      { troops: 22000, food: 100000 },
    );
    s.cities.find((c) => c.id === "hanzhong").troops = 3000;
    Object.assign(
      s.cities.find((c) => c.id === "chengdu"),
      { troops: 30000, food: 100000 },
    );
    let n = core.startMonthResolution(s);
    for (let i = 0; i < 1000 && n.monthResolution && !n.pendingDefense; i++)
      n = core.advanceMonthResolution(n, 1);
    assert.ok(n.pendingDefense);
    return n;
  }
  const tile = (x, y) =>
    page.locator(`.battle-cell[data-x="${x}"][data-y="${y}"]`);
  try {
    const viewports = process.env.SMOKE_VIEWPORT ? [process.env.SMOKE_VIEWPORT.split("x").map(Number)] : [
      [412, 915],
      [360, 800],
      [915, 412],
      [1440, 1000],
    ];
    for (const [width, height] of viewports) {
      const viewport = { width, height };
      profile = fs.mkdtempSync(path.join(os.tmpdir(), "hanmo-v030-"));
      await open(viewport);
      assert.equal(
        await page.getByLabel("歷史劇本").inputValue(),
        "warlords194",
      );
      assert.equal(await page.locator(".faction-card").count(), 17);
      assert.match(
        await page.locator(".faction-select > .hint").first().innerText(),
        new RegExp(
          `41城.*${core.newScenarioGame("warlords194", "liu").officers.length}將`,
          "s",
        ),
      );
      await page.getByLabel("歷史劇本").selectOption("three214");
      assert.equal(await page.locator(".faction-card").count(), 7);
      await page.getByRole("button", { name: /曹操.*起兵/ }).click();
      let state = await read();
      assert.equal(state.cities.length, 41);
      assert.equal(
        state.officers.length,
        core.newScenarioGame("three214", "cao").officers.length,
      );
      assert.equal(state.scenarioId, "three214");
      await page.getByLabel("搜尋城池").fill("成都");
      assert.equal(
        await page.getByLabel("快速選城").locator("option").count(),
        1,
      );
      await page.getByLabel("快速選城").selectOption("chengdu");
      assert.match(
        await page.locator(".city-quick-info").innerText(),
        /成都.*劉璋.*敵軍城池/s,
      );
      await page.getByLabel("搜尋城池").fill("");
      await page.getByLabel("勢力篩選").selectOption("cao");
      assert.equal(
        await page.getByLabel("快速選城").locator("option").count(),
        21,
      );
      await page.getByLabel("快速選城").selectOption("changan");
      const zoomBefore = await page
        .locator(".map-scroll svg")
        .evaluate((e) => e.getBoundingClientRect().width);
      await page.getByRole("button", { name: "放大地圖", exact: true }).click();
      assert.ok(
        (await page
          .locator(".map-scroll svg")
          .evaluate((e) => e.getBoundingClientRect().width)) > zoomBefore,
      );
      await tab("城務");
      await page.getByLabel("切換己方城池").selectOption("changan");
      assert.match(await page.locator(".city-panel").innerText(), /長安/);
      await tab("武將");
      await page.getByLabel("搜尋武將", { exact: true }).fill("曹操");
      assert.match(await page.locator(".officers-pane").innerText(), /曹操/);
      await page.getByLabel("搜尋武將", { exact: true }).fill("");
      await page
        .getByText("人事 · 搜尋、登用、賞賜與太守", { exact: true })
        .click();
      // An actual historical wild officer in an existing city; all commands use the UI.
      await enter(core.newScenarioGame("three214", "cao", 1));
      await tab("武將");
      await page
        .getByText("人事 · 搜尋、登用、賞賜與太守", { exact: true })
        .click();
      await page.getByLabel("人事城池").selectOption(personnelCity);
      for (const [type, target] of [
        ["search", null],
        ["hire", hireId],
        ["appoint", hireId],
      ]) {
        await page.getByLabel("人事指令").selectOption(type);
        if (target) await page.getByLabel("人事目標武將").selectOption(target);
        const before = await read(),
          actor = await page.getByLabel("人事執行武將").inputValue(),
          a = {
            type,
            cityId: personnelCity,
            officerId: actor,
            targetOfficerId: target || "",
          },
          expected = core.personnelDispatch(before, a);
        assert.ok(expected.ok);
        await page
          .getByRole("button", { name: "執行人事", exact: true })
          .click();
        assert.deepEqual(await read(), expected.state);
      }
      state = await read();
      assert.equal(
        state.officers.find((o) => o.id === hireId).factionId,
        "cao",
      );
      assert.equal(
        state.cities.find((c) => c.id === personnelCity).governorId,
        hireId,
      );
      await page.getByLabel("人事城池").selectOption("tianshui");
      await page.getByLabel("人事指令").selectOption("reward");
      state = await read();
      const recipient = state.officers.find(
        (o) =>
          o.factionId === "cao" && o.cityId === "tianshui" && o.loyalty < 100,
      );
      await page.getByLabel("人事目標武將").selectOption(recipient.id);
      const actor = await page.getByLabel("人事執行武將").inputValue(),
        expectedReward = core.personnelDispatch(state, {
          type: "reward",
          cityId: "tianshui",
          officerId: actor,
          targetOfficerId: recipient.id,
        });
      await page.getByRole("button", { name: "執行人事", exact: true }).click();
      assert.deepEqual(await read(), expectedReward.state);
      await tab("軍情");
      await page
        .getByText("外交與勢力 · 同盟、停戰、贈禮", { exact: true })
        .click();
      await page.getByLabel("外交城池").selectOption(diplomacyCity);
      await page.getByLabel("外交目標").selectOption("zhang");
      for (const type of ["gift", "alliance"]) {
        await page.getByLabel("外交指令").selectOption(type);
        const before = await read(),
          officerId = await page.getByLabel("外交使者").inputValue(),
          expected = core.diplomacyDispatch(before, {
            type,
            cityId: diplomacyCity,
            officerId,
            targetFactionId: "zhang",
          });
        assert.ok(expected.ok);
        await page
          .getByRole("button", { name: "執行外交", exact: true })
          .click();
        assert.deepEqual(await read(), expected.state);
      }
      state = await read();
      assert.ok(
        state.diplomacy.find((d) => d.a === "cao" && d.b === "zhang")
          .allianceUntil > state.turn,
      );
      await fits(height);
      await page.screenshot({ path: `/tmp/hanmo-v030-systems-${width}.png` });
      // Persist a real unreserved invasion; refresh must not silently lose the city.
      const alert = invasion();
      await enter(alert);
      await page.getByRole("dialog", { name: /敵軍來襲/ }).waitFor();
      assert.deepEqual(await read(), alert);
      await fits(height);
      await context.close();
      await open(viewport);
      await page.getByRole("button", { name: /繼續遊戲/ }).click();
      assert.deepEqual(await read(), alert);
      await page.getByText(/請求友城援軍 · 已選/).click();
      await page.getByLabel("援軍來源").selectOption("chengdu");
      await page.getByLabel("援軍武將").selectOption("liu-0");
      await page.getByLabel("援軍兵力").fill("20000");
      await page.getByRole("button", { name: "加入援軍", exact: true }).click();
      assert.deepEqual(await read(), alert, "軍議選兵尚未扣款");
      await fits(height);
      await page.getByRole("button", { name: "親自守城", exact: true }).click();
      await page.getByLabel("略過效果").check();
      await page.waitForFunction((k) => {
        const b = JSON.parse(localStorage.getItem(k)).pendingBattle;
        return b && b.phase === "defender";
      }, key);
      state = await read();
      assert.equal(state.pendingBattle.playerSide, "defender");
      assert.equal(state.cities.find((c) => c.id === "chengdu").troops, 10000);
      assert.equal(state.cities.find((c) => c.id === "chengdu").food, 95600);
      assert.equal(await page.locator(".battle-cell.player-ally").count(), 3);
      assert.match(
        await page.locator(".tactical-unit-panel").innerText(),
        /守軍/,
      );
      await page.screenshot({ path: `/tmp/hanmo-v030-defense-${width}.png` });
      await context.close();
      await open(viewport);
      await page.getByRole("button", { name: /繼續遊戲/ }).click();
      assert.deepEqual(
        await read(),
        state,
        "守城關閉Chrome後位置、兵糧、階段不變",
      );
      assert.equal(await page.locator(".combat-hit").count(), 0);
      await page.getByLabel("略過效果").check();
      let attacks = 0;
      for (let turn = 0; turn < 18; turn++) {
        state = await read();
        let b = state.pendingBattle;
        if (b.status !== "active") break;
        if (b.phase !== "defender") {
          await page.waitForFunction((k) => {
            const b = JSON.parse(localStorage.getItem(k)).pendingBattle;
            return b.status !== "active" || b.phase === "defender";
          }, key);
          state = await read();
          b = state.pendingBattle;
          if (b.status !== "active") break;
        }
        for (const id of b.units
          .filter(
            (u) =>
              u.side === "defender" && u.troops > 0 && !u.routed && !u.attacked,
          )
          .map((u) => u.id)) {
          state = await read();
          b = state.pendingBattle;
          if (b.status !== "active") break;
          const u = b.units.find((u) => u.id === id);
          if (u.routed || !u.troops) continue;
          await tile(u.x, u.y).click();
          const targets = b.units
            .filter((v) => core.canAttack(b, u, v))
            .sort(
              (a, v) =>
                core.estimateDamage(b, u, v) - core.estimateDamage(b, u, a),
            );
          if (targets.length) {
            await page
              .getByRole("button", { name: "攻擊", exact: true })
              .click();
            await tile(targets[0].x, targets[0].y).click();
            attacks++;
          } else
            await page
              .getByRole("button", { name: "待機", exact: true })
              .click();
        }
        if ((await read()).pendingBattle.status === "active") {
          await page.waitForTimeout(420);
          await page
            .getByRole("button", { name: "結束階段", exact: true })
            .click();
        }
      }
      state = await read();
      assert.notEqual(state.pendingBattle.status, "active");
      assert.ok(attacks > 0, "玩家必須實際下令守方攻擊");
      const finalBattle = state.pendingBattle,
        expected = core.completeTactical(state, finalBattle.id);
      assert.ok(expected.ok);
      await page
        .getByRole("button", { name: "結算戰果 · 返回戰略地圖", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      assert.deepEqual(await read(), expected.state, "真實戰果及援軍一次回寫");
      assert.equal((await read()).pendingBattle, null);
      await page
        .getByRole("button", { name: "收閱戰報", exact: true })
        .waitFor();
      assert.match(
        await page.locator(".battle-report").innerText(),
        /援軍.*成都.*20,000.*傷亡.*生還/s,
      );
      await page.getByRole("button", { name: "收閱戰報", exact: true }).click();
      // Other factions resume the same cursor and income commits once.
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(80);
        state = await read();
        if (!state.monthResolution) break;
        if (state.pendingDefense) {
          await page
            .getByRole("button", { name: "委任防守", exact: true })
            .click();
          await page
            .getByRole("button", { name: "收閱戰報", exact: true })
            .click();
        }
      }
      state = await read();
      assert.equal(state.turn, 1);
      assert.equal(state.monthResolution, null);
      assert.equal(
        state.battles.filter((b) => b.from === "宛" && b.to === "漢中").length,
        1,
      );
      assert.ok(core.isGameState(state));
      await fits(height);
      await context.close();
      context = undefined;
      fs.rmSync(profile, { recursive: true, force: true });
      profile = undefined;
      console.log(
        `PASS V0.3.0 ${width}×${height}：41城／劇本勢力、城將搜尋、人事實際成本與太守、外交條約、警報重啟不失城、援軍預留、守方操作與攻擊、守城重啟、戰果回收與原月結續行。`,
      );
    }
    assert.deepEqual(errors, []);
  } catch (e) {
    if (page && !page.isClosed()) {
      await page
        .screenshot({ path: "/tmp/hanmo-v030-failure.png", fullPage: true })
        .catch(() => {});
      console.error(
        (
          await page
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(-2200),
      );
    }
    throw e;
  } finally {
    if (context) await context.close();
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
