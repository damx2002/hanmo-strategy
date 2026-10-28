import { describe, it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { beginTactical } from "../engine/tactical/createBattle";
import { tacticalDispatch } from "../engine/tactical/actions";
import {
  estimateDamage,
  estimateRetaliation,
  estimateExchange,
  damagePreview,
} from "../engine/tactical/damage";
import { runTacticalPhase } from "../engine/tactical/ai";
import { applyTactical, completeTactical } from "../engine/tactical/resolve";
import { deserialize, serialize } from "../engine/save";
import { random } from "../engine/rng";
import { T } from "../engine/tactical/tacticalBalance";
import { cityReadiness, adjacentExpeditions } from "../components/cityOverview";
import type { TroopType, TacticalState } from "../engine/tactical/types";
import v021 from "./fixtures/v0.2.1-battle-save.json";
import v020 from "./fixtures/v0.2.0-battle-save.json";
import v010 from "./fixtures/v0.1.0-save.json";
import v011 from "./fixtures/v0.1.1-save.json";
function duel(a = 3000, d = 3000) {
  const b = beginTactical(newGame("liu", 42), {
    cityId: "hanzhong",
    targetId: "wan",
    officerId: "liu-3",
    troops: 6000,
  }).state.pendingBattle!;
  b.map = b.map.map((r) => r.map(() => "plain"));
  b.commanders.forEach((o) => {
    o.leadership = 80;
    o.strength = 80;
    o.intelligence = 80;
  });
  b.training = { attacker: 60, defender: 60 };
  Object.assign(b.units[0], { troops: a, maxTroops: a, x: 2, y: 2 });
  Object.assign(b.units[3], { troops: d, maxTroops: d, x: 3, y: 2 });
  return b;
}
function attack(b: TacticalState) {
  const r = tacticalDispatch(b, {
    type: "attack",
    unitId: b.units[0].id,
    targetId: b.units[3].id,
  });
  expect(r.ok).toBe(true);
  return r.battle;
}
describe("連續兵力比例傷害", () => {
  it.each([
    [6000, 200, 0.85, 1],
    [6000, 1000, 0.65, 0.85],
    [3000, 3000, 0.25, 0.4],
    [1000, 6000, 0.04, 0.09],
  ])("%i 對 %i 的損失比例在 %f–%f 且無固定百人上限", (a, d, min, max) => {
    const b = duel(a, d),
      loss = estimateDamage(b, b.units[0], b.units[3]);
    expect(loss / d).toBeGreaterThan(min);
    expect(loss / d).toBeLessThanOrEqual(max);
    expect(Number.isSafeInteger(loss)).toBe(true);
    if (a / d >= 6) expect(loss).toBeGreaterThan(100);
  });
  it("10:1 以上仍受高城防、森林、守將能力保護", () => {
    const b = duel(6000, 200),
      u = b.units[0],
      v = b.units[3];
    const plain = estimateDamage(b, u, v);
    b.map[v.y][v.x] = "city";
    b.defense = 10;
    const low = estimateDamage(b, u, v);
    b.defense = 100;
    const high = estimateDamage(b, u, v);
    expect(plain).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(high);
    b.map[v.y][v.x] = "forest";
    expect(estimateDamage(b, u, v)).toBeLessThan(plain);
    const leader = b.commanders.find((o) => o.id === v.commanderId)!;
    leader.leadership = 100;
    expect(estimateDamage(b, u, v)).toBeLessThan(plain);
  });
  it("四個兵力情境各自仍有實際克制優勢與有限傷亡", () => {
    for (const [a, d] of [
      [6000, 200],
      [6000, 1000],
      [3000, 3000],
      [1000, 6000],
    ]) {
      const b = duel(a, d),
        u = b.units[0],
        v = { ...b.units[3], type: "cavalry" as const };
      expect(estimateDamage(b, u, v)).toBeGreaterThan(
        estimateDamage(b, { ...u, type: "cavalry" }, v),
      );
      expect(estimateDamage(b, u, v)).toBeLessThanOrEqual(d);
    }
  });
});
describe("單次原子接戰與被動反擊", () => {
  it.each(["infantry", "cavalry"] as const)(
    "%s 生還者反擊，不耗主動行動且沒有遞迴",
    (type) => {
      const b = duel();
      b.units[3].type = type;
      const n = attack(b),
        [primary, counter] = n.combatFeedback!;
      expect(n.combatFeedback).toHaveLength(2);
      expect(counter.kind).toBe("retaliation");
      expect(counter.parentSequence).toBe(primary.sequence);
      expect(counter.target).toEqual({ x: 2, y: 2 });
      expect(n.units[0].troops).toBe(b.units[0].troops - counter.casualties);
      expect(n.units[3].troops).toBe(b.units[3].troops - primary.casualties);
      expect(counter.casualties).toBeGreaterThan(0);
      expect(n.units[3].attacked).toBe(false);
      expect(n.units[3].moved).toBe(false);
      expect(n.units[0].attacked).toBe(true);
      expect(attack(b)).toEqual(n);
      const repeat = tacticalDispatch(n, {
        type: "attack",
        unitId: "attacker-0",
        targetId: "defender-0",
      });
      expect(repeat.ok).toBe(false);
      expect(repeat.battle).toBe(n);
    },
  );
  it("弓兵接戰反擊較弱，反擊效率低於主動攻擊", () => {
    const b = duel(),
      u = b.units[0],
      v = b.units[3];
    expect(estimateRetaliation(b, { ...v, type: "archer" }, u)).toBeLessThan(
      estimateRetaliation(b, v, u),
    );
    expect(estimateRetaliation(b, v, u)).toBeLessThan(estimateDamage(b, v, u));
  });
  it("反擊依主擊後生還兵力與訓練、地形、武將計算", () => {
    const b = duel(),
      u = b.units[0],
      v = b.units[3];
    const e = estimateExchange(b, u, v);
    expect(e.retaliation).toBe(
      estimateRetaliation(b, { ...v, troops: v.troops - e.damage }, u),
    );
    expect(e.retaliation).toBeLessThan(estimateRetaliation(b, v, u));
    b.training.defender = 100;
    expect(estimateExchange(b, u, v).retaliation).toBeGreaterThan(
      e.retaliation,
    );
    b.map[u.y][u.x] = "forest";
    expect(estimateExchange(b, u, v).retaliation).toBeLessThan(
      estimateRetaliation(
        { ...b, map: b.map.map((r) => r.map(() => "plain")) },
        { ...v, troops: v.troops - e.damage },
        u,
      ),
    );
  });
  it("遠射不會觸發射程不足的反擊，火計也不觸發", () => {
    const b = duel();
    b.units[0].type = "archer";
    b.units[3].x = 4;
    expect(attack(b).combatFeedback).toHaveLength(1);
    const fire = tacticalDispatch(b, {
      type: "fire",
      unitId: "attacker-0",
      targetId: "defender-0",
    });
    expect(fire.ok).toBe(true);
    expect(fire.battle.combatFeedback).toHaveLength(1);
  });
  it("已行動守軍仍可被動反擊；被擊滅者不能反擊", () => {
    const b = duel();
    b.units[3].attacked = true;
    expect(attack(b).combatFeedback!.at(-1)!.kind).toBe("retaliation");
    b.units[3].troops = 1;
    const n = attack(b);
    expect(n.combatFeedback).toHaveLength(1);
    expect(n.units[3].troops).toBe(0);
  });
  it("預覽不變更 RNG 或兵力，正式雙方損失完全符合共用公式", () => {
    for (const seed of [1, 42, 1600, 999999]) {
      const b = duel();
      b.seed = seed;
      const before = JSON.stringify(b),
        u = b.units[0],
        v = b.units[3],
        p = damagePreview(b, u, v);
      expect(JSON.stringify(b)).toBe(before);
      const [r, next] = random(seed),
        e = estimateExchange(b, u, v, T.randomMin + r * T.randomRange),
        n = attack(b);
      expect(n.seed).toBe(next);
      expect(n.combatFeedback![0].casualties).toBe(e.damage);
      expect(n.combatFeedback![1].casualties).toBe(e.retaliation);
      expect(e.damage).toBeGreaterThanOrEqual(p.min);
      expect(e.damage).toBeLessThanOrEqual(p.max);
      expect(e.retaliation).toBeGreaterThanOrEqual(p.counterMin);
      expect(e.retaliation).toBeLessThanOrEqual(p.counterMax);
    }
  });
  it("各種兵種、極端兵力雙方扣兵不超界、不出現負數或 NaN", () => {
    for (const a of [1, 200, 6000, 999999])
      for (const d of [1, 200, 6000])
        for (const type of ["infantry", "cavalry", "archer"] as TroopType[]) {
          const b = duel(a, d);
          b.units[3].type = type;
          const n = attack(b);
          expect(
            n.units.every(
              (u) =>
                Number.isSafeInteger(u.troops) &&
                u.troops >= 0 &&
                u.troops <= u.maxTroops,
            ),
          ).toBe(true);
        }
  });
  it("敵軍 AI 每次主擊最多一次合法反擊，遵守行動上限", () => {
    const b = duel();
    b.phase = "defender";
    const n = runTacticalPhase(b);
    expect(n.phase).toBe("attacker");
    expect(
      n.combatFeedback!.filter((f) => f.kind !== "retaliation").length,
    ).toBeLessThanOrEqual(3);
    for (const f of n.combatFeedback!.filter((f) => f.kind === "retaliation")) {
      const parent = n.combatFeedback!.find(
        (p) => p.sequence === f.parentSequence,
      )!;
      expect(parent.kind).toBe("attack");
      expect(parent.targetId).toBe(f.attackerId);
      expect(f.phase).toBe("defender");
    }
    expect(runTacticalPhase(n)).toBe(n);
  });
});
describe("四代存檔與戰果守恆", () => {
  it.each([v010, v011, v020, v021])(
    "舊存檔完整保留年月、世界數值、種子與既有事件 %#",
    (fixture) => {
      const s = deserialize(JSON.stringify(fixture));
      expect(s).toEqual({
        ...fixture,
        version: 2,
        pendingBattle:
          "pendingBattle" in fixture ? fixture.pendingBattle : null,
      });
      expect(deserialize(serialize(s))).toEqual(s);
    },
  );
  it("V0.2.1 戰中檔繼續後可保存反擊，撤退精確回收且只結算一次", () => {
    let s = deserialize(JSON.stringify(v021));
    const b = s.pendingBattle!;
    b.units[0].attacked = false; // A completed previous action remains in history.
    const n = applyTactical(s, {
      type: "attack",
      unitId: b.units[0].id,
      targetId: b.units[4].id,
    });
    expect(n.ok).toBe(true);
    s = deserialize(serialize(n.state));
    expect(s.pendingBattle!.combatFeedback!.at(-1)!.kind).toBe("retaliation");
    const source = s.cities.find((c) => c.id === b.sourceId)!,
      target = s.cities.find((c) => c.id === b.targetId)!;
    const survivors = s
      .pendingBattle!.units.filter((u) => u.side === "attacker")
      .reduce((n, u) => n + u.troops, 0);
    const defenders = s
      .pendingBattle!.units.filter((u) => u.side === "defender")
      .reduce((n, u) => n + u.troops, 0);
    const retreat = applyTactical(s, { type: "retreat" });
    const done = completeTactical(retreat.state, b.id);
    expect(done.ok).toBe(true);
    expect(done.state.cities.find((c) => c.id === source.id)!.troops).toBe(
      source.troops + survivors,
    );
    expect(done.state.cities.find((c) => c.id === target.id)!.troops).toBe(
      defenders,
    );
    expect(done.state.cities.find((c) => c.id === target.id)!.ownerId).toBe(
      target.ownerId,
    );
    expect(done.state.cities.find((c) => c.id === source.id)!.food).toBe(
      source.food,
    );
    expect(completeTactical(done.state, b.id).ok).toBe(false);
  });
});
describe("城池操作狀態與鄰城出征", () => {
  it("四種不可操作原因及邊境、待命人數明確區分", () => {
    const s = newGame("liu"),
      c = s.cities.find((c) => c.id === "hanzhong")!;
    expect(cityReadiness(s, c)).toMatchObject({
      ready: 3,
      reason: "可下令",
      border: true,
    });
    c.actions = 0;
    expect(cityReadiness(s, c).reason).toBe("本月指令已用盡");
    c.actions = 3;
    s.officers
      .filter((o) => o.cityId === c.id)
      .forEach((o) => (o.acted = true));
    expect(cityReadiness(s, c).reason).toBe("全部武將已行動");
    s.officers = s.officers.filter((o) => o.cityId !== c.id);
    expect(cityReadiness(s, c).reason).toBe("本城沒有武將");
    expect(cityReadiness(s, s.cities.find((c) => c.id === "wan")!).reason).toBe(
      "此城屬於敵軍",
    );
  });
  it("敵城列出相鄰己城與真實出征資格，無相鄰城則為空", () => {
    const s = newGame("liu");
    const sources = adjacentExpeditions(
      s,
      s.cities.find((c) => c.id === "wan")!,
    );
    expect(
      sources.some((x) => x.city.id === "hanzhong" && x.reason === "可出征"),
    ).toBe(true);
    s.cities.find((c) => c.id === "hanzhong")!.actions = 0;
    expect(
      adjacentExpeditions(s, s.cities.find((c) => c.id === "wan")!).find(
        (x) => x.city.id === "hanzhong",
      )!.reason,
    ).toContain("用盡");
    expect(
      adjacentExpeditions(s, s.cities.find((c) => c.id === "ye")!),
    ).toEqual([]);
  });
});
