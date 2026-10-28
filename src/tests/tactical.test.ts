import { describe, it, expect, vi, afterEach } from "vitest";
import { newGame } from "../data/scenario";
import {
  createBattle,
  splitUnits,
  beginTactical,
} from "../engine/tactical/createBattle";
import { reachable } from "../engine/tactical/movement";
import { tacticalDispatch } from "../engine/tactical/actions";
import {
  canAttack,
  estimateDamage,
  fireChance,
} from "../engine/tactical/damage";
import { runTacticalPhase } from "../engine/tactical/ai";
import {
  applyTactical,
  enemyPhase,
  completeTactical,
} from "../engine/tactical/resolve";
import { T } from "../engine/tactical/tacticalBalance";
import { dispatch } from "../engine/actions";
import { endMonth } from "../engine/turn";
import {
  deserialize,
  serialize,
  isGameState,
  loadGame,
  saveGame,
  SAVE_KEY,
  LEGACY_SAVE_KEY,
  restoreLegacy,
} from "../engine/save";
import type { TacticalState, TacticalAction } from "../engine/tactical/types";
import v010 from "./fixtures/v0.1.0-save.json";
import v011 from "./fixtures/v0.1.1-save.json";
const order = {
  cityId: "hanzhong",
  targetId: "wan",
  officerId: "liu-3",
  troops: 6000,
};
function started() {
  const r = beginTactical(newGame("liu", 42), order);
  expect(r.ok).toBe(true);
  return r.state;
}
function board() {
  const b = structuredClone(started().pendingBattle!);
  b.map = b.map.map((row) => row.map(() => "plain"));
  return b;
}
function step(b: TacticalState, a: TacticalAction) {
  const r = tacticalDispatch(b, a);
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
  return r.battle;
}
function storage() {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  });
  return map;
}
afterEach(() => vi.unstubAllGlobals());
describe("戰場與分隊", () => {
  it.each([1, 2, 3, 7, 6000])("%i 兵分隊守恆且沒有零兵分隊", (n) => {
    const u = splitUnits(n, "attacker", "liu-3");
    expect(u.length).toBe(Math.min(3, n));
    expect(u.reduce((n, u) => n + u.troops, 0)).toBe(n);
    expect(u.every((u) => u.troops === u.maxTroops && u.troops > 0)).toBe(true);
  });
  it("固定種子地形一致，包含四種地形、城門及暢通道路", () => {
    const s = newGame("liu", 42),
      a = createBattle(s, order),
      b = createBattle(s, order);
    expect(a).toEqual(b);
    expect(a.map).toHaveLength(6);
    expect(a.map.every((r) => r.length === 8)).toBe(true);
    for (const t of ["plain", "forest", "hill", "city", "gate"])
      expect(a.map.flat()).toContain(t);
    expect(a.map[2].slice(0, 6).every((t) => t === "plain")).toBe(true);
    expect(
      a.units
        .filter((u) => u.side === "defender")
        .reduce((n, u) => n + u.troops, 0),
    ).toBe(s.cities[4].troops);
    expect(s.cities[5].troops).toBe(7700);
  });
  it("高城防有更高城門耐久", () => {
    const s = newGame("liu");
    const a = createBattle(s, order);
    s.cities[4].defense = 100;
    expect(createBattle(s, order).gate.hp).toBeGreaterThan(a.gate.hp);
  });
});
describe("合法尋路與行動", () => {
  it("拒絕邊界、超距離、重疊及第二次移動", () => {
    const b = board(),
      u = b.units[0];
    for (const [x, y] of [
      [-1, 2],
      [8, 2],
      [3, 2],
      [0, 4],
    ])
      expect(tacticalDispatch(b, { type: "move", unitId: u.id, x, y }).ok).toBe(
        false,
      );
    const n = step(b, { type: "move", unitId: u.id, x: 2, y: 2 });
    expect(
      tacticalDispatch(n, { type: "move", unitId: u.id, x: 3, y: 2 }).ok,
    ).toBe(false);
    expect(b.units[0].x).toBe(0);
  });
  it("阻擋其他單位，不能穿越敵軍或友軍", () => {
    const b = board(),
      u = b.units[0];
    b.units[3].x = 1;
    b.units[3].y = 2;
    expect(reachable(b, u).some((p) => p.x === 2 && p.y === 2)).toBe(false);
    expect(reachable(b, u).some((p) => p.x === 1 && p.y === 2)).toBe(false);
  });
  it("騎兵平原可移三格，森林及山丘額外消耗；步兵不受同等懲罰", () => {
    const b = board(),
      c = b.units[1];
    expect(reachable(b, c).some((p) => p.x === 3 && p.y === 4)).toBe(true);
    b.map[4][1] = "forest";
    b.map[4][2] = "hill";
    expect(reachable(b, c).some((p) => p.x === 3 && p.y === 4)).toBe(false);
    const infantry = { ...c, type: "infantry" as const };
    expect(
      reachable(b, infantry).find((p) => p.x === 2 && p.y === 4)?.cost,
    ).toBe(2);
  });
  it("未破城門不得進入城區；近戰可破城，弓兵不能", () => {
    const b = board(),
      u = b.units[0];
    u.x = 5;
    u.y = 2;
    expect(reachable(b, u).some((p) => p.x >= 6)).toBe(false);
    const n = step(b, { type: "gate", unitId: u.id });
    expect(n.gate.hp).toBeLessThan(b.gate.hp);
    expect(n.units[0].attacked).toBe(true);
    u.type = "archer";
    expect(tacticalDispatch(b, { type: "gate", unitId: u.id }).ok).toBe(false);
    b.gate.hp = 0;
    expect(reachable(b, u).some((p) => p.x === 6 && p.y === 2)).toBe(true);
  });
  it("近戰與弓兵射程限制，部隊不能連續攻擊或攻擊後移動", () => {
    const b = board(),
      u = b.units[0],
      v = b.units[3];
    v.x = 2;
    v.y = 2;
    expect(canAttack(b, u, v)).toBe(false);
    u.type = "archer";
    expect(canAttack(b, u, v)).toBe(true);
    v.x = 3;
    expect(canAttack(b, u, v)).toBe(false);
    b.map[2][0] = "hill";
    expect(canAttack(b, u, v)).toBe(true);
    v.x = 2;
    const n = step(b, { type: "attack", unitId: u.id, targetId: v.id });
    expect(n.units[3].troops).toBeLessThan(v.troops);
    expect(
      tacticalDispatch(n, { type: "attack", unitId: u.id, targetId: v.id }).ok,
    ).toBe(false);
    expect(reachable(n, n.units[0])).toEqual([]);
    v.x = 1;
    expect(canAttack(b, u, v)).toBe(false);
  });
  it("已潰滅部隊與非己方階段不能下令", () => {
    const b = board();
    b.units[0].troops = 0;
    expect(
      tacticalDispatch(b, { type: "wait", unitId: b.units[0].id }).ok,
    ).toBe(false);
    b.phase = "defender";
    expect(tacticalDispatch(b, { type: "endPhase" }).ok).toBe(false);
  });
});
describe("真實傷害與火計", () => {
  it("兵力、統率、武力與訓練真正影響傷害且全為有限整數", () => {
    const b = board(),
      u = { ...b.units[0], troops: 100 },
      v = b.units[3];
    const low = estimateDamage(b, u, v);
    const more = estimateDamage(b, { ...u, troops: 1000 }, v);
    expect(more).toBeGreaterThan(low);
    const trained = structuredClone(b);
    trained.training.attacker = 100;
    trained.commanders[0].leadership = 100;
    trained.commanders[0].strength = 100;
    expect(estimateDamage(trained, u, v)).toBeGreaterThan(low);
    for (let n = 1; n < 50000; n *= 2) {
      const d = estimateDamage(b, { ...u, troops: n }, v);
      expect(Number.isSafeInteger(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(v.troops);
    }
  });
  it("少量殘兵可被優勢部隊擊潰，一兵仍不能無條件殺百人", () => {
    const b = board(),
      u = b.units[0],
      v = { ...b.units[3], troops: 1 };
    expect(estimateDamage(b, u, v)).toBe(1);
    expect(
      estimateDamage(b, { ...u, troops: 1 }, { ...v, troops: 50 }),
    ).toBeLessThan(50);
    const large = { ...v, troops: 5000 };
    expect(estimateDamage(b, { ...u, troops: 999999 }, large)).toBeGreaterThan(
      4500,
    );
  });
  it("森林、山丘、城防、兵種及平原衝鋒有實效", () => {
    const b = board(),
      u = { ...b.units[0], troops: 200 },
      v = b.units[3];
    const plain = estimateDamage(b, u, v);
    b.map[v.y][v.x] = "forest";
    expect(estimateDamage(b, u, v)).toBeLessThan(plain);
    b.map[v.y][v.x] = "hill";
    expect(estimateDamage(b, u, v)).toBeLessThan(plain);
    b.map[v.y][v.x] = "city";
    b.defense = 100;
    expect(estimateDamage(b, u, v)).toBeLessThan(plain);
    b.map[v.y][v.x] = "plain";
    expect(estimateDamage(b, u, { ...v, type: "archer" })).toBeGreaterThan(
      estimateDamage(b, u, { ...v, type: "infantry" }),
    );
    const cav = { ...u, type: "cavalry" as const };
    expect(estimateDamage(b, { ...cav, moved: true }, v)).toBeGreaterThan(
      estimateDamage(b, cav, v),
    );
  });
  it("固定種子火計成功／失敗、森林加成、智力與次數限制", () => {
    const b = board(),
      u = b.units[0],
      v = b.units[3];
    u.commanderId = "liu-5";
    b.commanders.push({
      id: "liu-5",
      leadership: 70,
      strength: 30,
      intelligence: 95,
    });
    v.x = 2;
    v.y = 2;
    const chance = fireChance(b, u, v);
    b.map[2][2] = "forest";
    expect(fireChance(b, u, v)).toBeGreaterThan(chance);
    const won = step(
      { ...b, seed: 1 },
      { type: "fire", unitId: u.id, targetId: v.id },
    );
    expect(won.units[3].troops).toBeLessThan(v.troops);
    expect(won.fireUsed.attacker).toBe(1);
    const failed = step(
      { ...b, seed: 1600 },
      { type: "fire", unitId: u.id, targetId: v.id },
    );
    expect(failed.units[3].troops).toBe(v.troops);
    expect(failed.units[0].attacked).toBe(true);
    expect(failed.fireUsed.attacker).toBe(1);
    b.fireUsed.attacker = T.fireLimit;
    expect(
      tacticalDispatch(b, { type: "fire", unitId: u.id, targetId: v.id }).ok,
    ).toBe(false);
    b.fireUsed.attacker = 0;
    b.commanders.at(-1)!.intelligence = 74;
    expect(
      tacticalDispatch(b, { type: "fire", unitId: u.id, targetId: v.id }).ok,
    ).toBe(false);
  });
});
describe("AI、勝敗與結算生命週期", () => {
  it("敵軍合法移動並反擊；同一階段不會執行兩次", () => {
    let s = started();
    s = applyTactical(s, { type: "endPhase" }).state;
    const before = structuredClone(s),
      n = enemyPhase(s);
    expect(n.pendingBattle!.phase).toBe("attacker");
    expect(n.pendingBattle!.turn).toBe(2);
    expect(n.pendingBattle!.events.length).toBeGreaterThan(
      before.pendingBattle!.events.length,
    );
    expect(
      n.pendingBattle!.units.some(
        (u, i) =>
          u.x !== before.pendingBattle!.units[i].x ||
          u.y !== before.pendingBattle!.units[i].y,
      ),
    ).toBe(true);
    expect(enemyPhase(n)).toBe(n);
    expect(isGameState(n)).toBe(true);
  });
  it("戰術 AI 有限次執行，最多十六回合並且傷亡非負", () => {
    let b = started().pendingBattle!;
    for (let i = 0; i < 32 && b.status === "active"; i++)
      b = runTacticalPhase(b, b.phase);
    expect(b.status).not.toBe("active");
    expect(b.turn).toBeLessThanOrEqual(16);
    expect(
      b.units.every(
        (u) =>
          Number.isInteger(u.troops) &&
          u.troops >= 0 &&
          u.troops <= u.maxTroops,
      ),
    ).toBe(true);
    expect(b.units.some((u) => u.troops < u.maxTroops)).toBe(true);
  });
  it("守至上限判守勝，撤退失敗且生還者返回，戰果只能套一次", () => {
    const s = started(),
      c = s.cities[5],
      food = c.food;
    expect(endMonth(s)).toBe(s);
    expect(
      dispatch(s, { type: "farm", cityId: "chengdu", officerId: "liu-0" }).ok,
    ).toBe(false);
    expect(beginTactical(s, order).ok).toBe(false);
    const ret = applyTactical(s, { type: "retreat" });
    expect(ret.ok).toBe(true);
    const r = completeTactical(ret.state, s.pendingBattle!.id);
    expect(r.ok).toBe(true);
    expect(r.state.cities[5].troops).toBe(c.troops + order.troops);
    expect(r.state.cities[5].food).toBe(food);
    expect(r.state.cities[4].ownerId).toBe("cao");
    expect(r.state.officers.find((o) => o.id === "liu-3")!.cityId).toBe(
      "hanzhong",
    );
    expect(r.state.pendingBattle).toBeNull();
    expect(completeTactical(r.state, s.pendingBattle!.id).ok).toBe(false);
    let b = { ...s.pendingBattle!, turn: 16, phase: "defender" as const };
    const limited = tacticalDispatch(b, { type: "endPhase" }, "defender");
    expect(limited.ok).toBe(true);
    expect(limited.battle.reason).toBe("limit");
  });
  it("手動與委任使用相同成本，軍議建立前不扣資源", () => {
    const s = newGame("liu", 42),
      snapshot = serialize(s);
    createBattle(s, order);
    expect(serialize(s)).toBe(snapshot);
    const m = beginTactical(s, order).state,
      a = dispatch(s, { type: "attack", ...order }).state;
    expect(m.cities[5].food).toBe(a.cities[5].food);
    expect(m.cities[5].actions).toBe(a.cities[5].actions);
    expect(m.cities[5].troops).toBe(s.cities[5].troops - order.troops);
    expect(m.officers.find((o) => o.id === "liu-3")!.acted).toBe(true);
  });
  it("手動攻城勝利真正易主、主將駐城、來源扣兵且保留戰地紀事", () => {
    const initial = newGame("liu", 42);
    initial.cities[5].troops = 90000;
    initial.cities[5].food = 50000;
    const a = { ...order, troops: 80000 };
    let s = beginTactical(initial, a).state,
      b = s.pendingBattle!;
    for (let i = 0; i < 32 && b.status === "active"; i++)
      b = runTacticalPhase(b, b.phase);
    expect(b.status).toBe("attackerWon");
    s = { ...s, pendingBattle: b, seed: b.seed };
    expect(isGameState(s)).toBe(true);
    const r = completeTactical(s, b.id);
    expect(r.ok).toBe(true);
    expect(r.state.cities[4].ownerId).toBe("liu");
    expect(r.state.cities[5].troops).toBe(10000);
    expect(r.state.officers.find((o) => o.id === "liu-3")!.cityId).toBe("wan");
    expect(r.state.battles[0].tacticalEvents).toEqual(b.events);
    expect(isGameState(r.state)).toBe(true);
  });
  it("破門後須無鄰敵駐守內城兩階段，守軍生還者撤回友城且不生兵", () => {
    const s = started(),
      b = s.pendingBattle!;
    b.gate.hp = 0;
    b.units[0].x = 7;
    b.units[0].y = 2;
    b.units
      .filter((u) => u.side === "defender")
      .forEach((u, i) => {
        u.x = 3;
        u.y = i;
      });
    let first = step(b, { type: "endPhase" });
    expect(first.status).toBe("active");
    const def = tacticalDispatch(first, { type: "endPhase" }, "defender");
    expect(def.ok).toBe(true);
    const won = step(def.battle, { type: "endPhase" });
    expect(won.status).toBe("attackerWon");
    const before = s.cities.reduce((n, c) => n + c.troops, 0) + b.sent;
    const result = completeTactical({ ...s, pendingBattle: won }, won.id);
    expect(result.ok).toBe(true);
    expect(result.state.cities[4].ownerId).toBe("liu");
    expect(result.state.cities.reduce((n, c) => n + c.troops, 0)).toBe(before);
  });
});
describe("V2 存檔與安全遷移", () => {
  it.each([v010, v011])(
    "舊版本原始存檔只改 schema，完整保存世界與 RNG",
    (legacy) => {
      const n = deserialize(JSON.stringify(legacy));
      expect(n).toEqual({ ...legacy, version: 2, pendingBattle: null });
    },
  );
  it("V2 優先、V1 保留、無 V2 才遷移；損毀 V2 不靜默回退", () => {
    const m = storage();
    m.set(LEGACY_SAVE_KEY, JSON.stringify(v011));
    const old = m.get(LEGACY_SAVE_KEY);
    const legacy = loadGame();
    expect(legacy.state?.version).toBe(2);
    expect(saveGame(legacy.state!)).toBe("");
    expect(m.get(LEGACY_SAVE_KEY)).toBe(old);
    const n = newGame("sun", 999);
    saveGame(n);
    expect(loadGame().state).toEqual(n);
    m.set(SAVE_KEY, "{broken");
    expect(loadGame().state).toBeNull();
    expect(loadGame().error).toContain("沒有回退");
    const r = restoreLegacy();
    expect(r.state).toEqual({ ...v011, version: 2, pendingBattle: null });
    expect(m.get("hanmo-strategy-save-v2-recovery-backup")).toBe("{broken");
    expect(m.get(LEGACY_SAVE_KEY)).toBe(old);
  });
  it("戰中移動、敵軍階段及 RNG 原樣續玩，不再次扣資源", () => {
    let s = started();
    s = applyTactical(s, {
      type: "move",
      unitId: "attacker-0",
      x: 2,
      y: 2,
    }).state;
    s = applyTactical(s, { type: "endPhase" }).state;
    const n = deserialize(serialize(s));
    expect(n).toEqual(s);
    expect(enemyPhase(n)).toEqual(enemyPhase(s));
    const m = storage();
    expect(saveGame(n)).toBe("");
    expect(loadGame().state).toEqual(n);
    expect(m.has(LEGACY_SAVE_KEY)).toBe(false);
  });
  it("拒絕破壞兵數、地圖、phase、位置、預留、行動狀態的戰中存檔", () => {
    const s = started();
    const alterations = [
      (b: TacticalState) => (b.units[0].troops = -1),
      (b: TacticalState) => b.units[0].maxTroops++,
      (b: TacticalState) => (b.units[0].x = 9),
      (b: TacticalState) => (b.units[0].x = b.units[3].x),
      (b: TacticalState) => b.foodCost++,
      (b: TacticalState) => b.seed++,
      (b: TacticalState) => (b.fireUsed.attacker = 3),
      (b: TacticalState) => (b.map[2][1] = "city"),
      (b: TacticalState) => (b.status = "attackerWon"),
    ];
    for (const alter of alterations) {
      const n = structuredClone(s);
      alter(n.pendingBattle!);
      expect(() => deserialize(serialize(n))).toThrow();
    }
  });
});
