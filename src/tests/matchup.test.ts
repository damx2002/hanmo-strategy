import { describe, it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { beginTactical } from "../engine/tactical/createBattle";
import {
  canAttack,
  estimateDamage,
  damagePreview,
  matchupMultiplier,
} from "../engine/tactical/damage";
import { tacticalDispatch } from "../engine/tactical/actions";
import { runTacticalPhase } from "../engine/tactical/ai";
import {
  applyTactical,
  enemyPhase,
  completeTactical,
} from "../engine/tactical/resolve";
import { deserialize, serialize, isGameState } from "../engine/save";
import { selectionAfterUpdate } from "../components/tactical/selection";
import type { TroopType, TacticalState } from "../engine/tactical/types";
import oldBattle from "./fixtures/v0.2.0-battle-save.json";
const order = {
  cityId: "hanzhong",
  targetId: "wan",
  officerId: "liu-3",
  troops: 6000,
};
function duel() {
  const b = beginTactical(newGame("liu", 42), order).state.pendingBattle!;
  b.map = b.map.map((row) => row.map(() => "plain"));
  b.commanders = b.commanders.map((o) => ({
    ...o,
    leadership: 80,
    strength: 80,
    intelligence: 80,
  }));
  b.training = { attacker: 60, defender: 60 };
  b.units[0].x = 2;
  b.units[0].y = 2;
  b.units[3].x = 3;
  b.units[3].y = 2;
  return b;
}
const counters: [TroopType, TroopType, number][] = [
  ["infantry", "cavalry", 1.3],
  ["cavalry", "archer", 1.35],
  ["archer", "infantry", 1.25],
];
describe("實際兵種克制與平衡", () => {
  it.each(counters)("%s 剋 %s 倍率 %s，均等兵力時優於反向傷害", (a, d, m) => {
    const b = duel(),
      u = { ...b.units[0], type: a, troops: 1000 },
      v = { ...b.units[3], type: d, troops: 1000 };
    expect(matchupMultiplier(a, d)).toBe(m);
    expect(matchupMultiplier(d, a)).toBe(a === "infantry" ? 0.85 : 0.9);
    expect(estimateDamage(b, u, v)).toBeGreaterThan(estimateDamage(b, v, u));
    const p = damagePreview(b, u, v);
    expect(p.multiplier).toBe(m);
    expect(p.relation).toBe("advantage");
  });
  it.each(["infantry", "cavalry", "archer"] as const)(
    "%s 同兵種倍率為一，反向預覽為劣勢",
    (type) => {
      const b = duel(),
        u = { ...b.units[0], type },
        v = { ...b.units[3], type };
      expect(damagePreview(b, u, v).multiplier).toBe(1);
      expect(damagePreview(b, u, v).relation).toBe("neutral");
    },
  );
  it.each([0.5, 1, 2])(
    "兵力比 %s：所有組合有克制差異且兵力優勢不被反轉",
    (ratio) => {
      const b = duel();
      for (const [a, d] of counters) {
        const u = { ...b.units[0], type: a, troops: Math.floor(1000 * ratio) },
          v = { ...b.units[3], type: d, troops: 1000 };
        const real = estimateDamage(b, u, v);
        expect(real).toBeGreaterThan(0);
        expect(real).toBeLessThanOrEqual(v.troops);
        expect(estimateDamage(b, { ...u, troops: 2000 }, v)).toBeGreaterThan(
          estimateDamage(b, { ...u, troops: 500 }, v),
        );
      }
      const weak = { ...b.units[0], type: "infantry" as const, troops: 500 },
        strong = { ...b.units[3], type: "cavalry" as const, troops: 1000 };
      expect(estimateDamage(b, weak, strong) / strong.troops).toBeLessThan(
        estimateDamage(b, strong, weak) / weak.troops,
      );
      for (const [a, d] of counters) {
        let w = { ...b.units[0], type: a, troops: 500 },
          h = { ...b.units[3], type: d, troops: 1000 };
        for (
          let round = 0;
          round < 30 && w.troops > 0 && h.troops > 0;
          round++
        ) {
          const wl = estimateDamage(b, h, w),
            hl = estimateDamage(b, w, h);
          w = { ...w, troops: w.troops - wl };
          h = { ...h, troops: h.troops - hl };
        }
        expect(h.troops, `${a} 弱軍不應穩勝兩倍 ${d}`).toBeGreaterThan(0);
        expect(w.troops).toBe(0);
      }
    },
  );
  it("連續傷害保留克制差異，懸殊兵力可重創；一兵仍不能消滅大軍", () => {
    const b = duel(),
      u = { ...b.units[0], troops: 999999, type: "infantry" as const },
      v = { ...b.units[3], troops: 1000, type: "cavalry" as const };
    const advantage = estimateDamage(b, u, v),
      neutral = estimateDamage(b, { ...u, type: "cavalry" }, v);
    expect(advantage).toBeGreaterThanOrEqual(neutral);
    expect(estimateDamage(b, { ...u, troops: 1000 }, v)).toBeGreaterThan(
      estimateDamage(b, { ...u, type: "cavalry", troops: 1000 }, v),
    );
    expect(advantage).toBeGreaterThan(950);
    expect(advantage).toBeLessThanOrEqual(v.troops);
    expect(estimateDamage(b, { ...u, troops: 1 }, v)).toBeLessThan(10);
    expect(estimateDamage(b, { ...u, troops: 1 }, v)).toBeGreaterThanOrEqual(1);
    expect(estimateDamage(b, u, { ...v, troops: 50 })).toBe(50);
  });
  it("城防、地形與將領仍影響優勢傷害，低兵力克制不能保證勝利", () => {
    const b = duel(),
      u = { ...b.units[0], type: "archer" as const, troops: 500 },
      v = { ...b.units[3], type: "infantry" as const, troops: 2000 };
    const plain = estimateDamage(b, u, v);
    b.map[v.y][v.x] = "city";
    b.defense = 100;
    expect(estimateDamage(b, u, v)).toBeLessThan(plain);
    b.map[v.y][v.x] = "forest";
    expect(estimateDamage(b, u, v)).toBeLessThan(plain);
  });
  it("預覽不扣兵、不消耗 RNG，正式結果位於預覽範圍", () => {
    const b = duel();
    b.units[3].type = "cavalry";
    const before = JSON.stringify(b),
      p = damagePreview(b, b.units[0], b.units[3]);
    for (let i = 0; i < 30; i++) damagePreview(b, b.units[0], b.units[3]);
    expect(JSON.stringify(b)).toBe(before);
    const r = tacticalDispatch(b, {
      type: "attack",
      unitId: b.units[0].id,
      targetId: b.units[3].id,
    });
    expect(r.ok).toBe(true);
    const f = r.battle.combatFeedback!.find((f) => f.kind === "attack")!;
    expect(f.casualties).toBeGreaterThanOrEqual(p.min);
    expect(f.casualties).toBeLessThanOrEqual(p.max);
    expect(r.battle.seed).not.toBe(b.seed);
  });
});
describe("戰況事件只有引擎真實結果", () => {
  it("目標座標、傷亡、前後兵力與克制一致，潰滅仍保留目標座標", () => {
    const b = duel();
    b.units[3].type = "cavalry";
    b.units[3].troops = 1;
    const r = tacticalDispatch(b, {
      type: "attack",
      unitId: b.units[0].id,
      targetId: b.units[3].id,
    });
    expect(r.ok).toBe(true);
    const f = r.battle.combatFeedback![0];
    expect(f).toMatchObject({
      sequence: 1,
      attackerId: "attacker-0",
      targetId: "defender-0",
      target: { x: 3, y: 2 },
      before: 1,
      after: 0,
      casualties: 1,
      matchup: 1.3,
      relation: "advantage",
      destroyed: true,
    });
    expect(f.text).toContain("潰滅");
    expect(r.battle.units[3].troops).toBe(f.after);
    expect(b.units[3].troops).toBe(1);
  });
  it.each([1, 1600])("火計種子 %s：成功失敗都記錄，不套兵種克制", (seed) => {
    const b = duel();
    b.seed = seed;
    b.commanders[0].intelligence = 95;
    b.map[2][3] = "forest";
    const a = tacticalDispatch(b, {
      type: "fire",
      unitId: "attacker-0",
      targetId: "defender-0",
    });
    expect(a.ok).toBe(true);
    const f = a.battle.combatFeedback![0];
    expect(f.matchup).toBe(1);
    expect(f.relation).toBe("neutral");
    expect(f.success).toBe(seed === 1);
    expect(f.casualties).toBe(f.before - f.after);
    expect(a.battle.units[0].attacked).toBe(true);
    expect(f.text).toContain(seed === 1 ? "火計成功" : "火計失敗");
  });
  it("破城回饋來自城門耐久差，座標是城門而非部隊", () => {
    const b = duel();
    b.units[0].x = 5;
    b.units[0].y = 2;
    const r = tacticalDispatch(b, { type: "gate", unitId: "attacker-0" });
    expect(r.ok).toBe(true);
    const f = r.battle.combatFeedback![0];
    expect(f).toMatchObject({
      targetId: null,
      target: { x: 6, y: 2 },
      matchup: 1,
      relation: "neutral",
    });
    expect(f.casualties).toBe(b.gate.hp - r.battle.gate.hp);
  });
  it("AI 依相同克制公式選目標，批次各次傷亡都有序號且不重複執行", () => {
    const b = duel();
    b.phase = "defender";
    b.commanders.forEach((o) => (o.intelligence = 40));
    b.units.forEach((u) => {
      u.troops = 2000;
      u.maxTroops = 2000;
    });
    b.units[0].x = 2;
    b.units[0].y = 2;
    b.units[1].x = 4;
    b.units[1].y = 2;
    b.units[2].x = 0;
    b.units[2].y = 0;
    b.units[3].x = 3;
    b.units[3].y = 2;
    b.units[4].attacked = true;
    b.units[5].attacked = true;
    const n = runTacticalPhase(b);
    const f = n.combatFeedback![0];
    expect(f.targetId).toBe("attacker-1");
    expect(f.relation).toBe("advantage");
    expect(n.phase).toBe("attacker");
    expect(runTacticalPhase(n)).toBe(n);
  });
});
describe("部隊接續與舊 V2 相容", () => {
  it("移動後不切換，攻擊或待機完成才切，尊重手選且避開潰滅", () => {
    const b = duel(),
      id = "attacker-0";
    b.units[0].moved = true;
    expect(selectionAfterUpdate(b, id, { id, attacked: false })).toBe(id);
    b.units[0].attacked = true;
    expect(selectionAfterUpdate(b, id, { id, attacked: false })).toBe(
      "attacker-1",
    );
    expect(
      selectionAfterUpdate(b, id, { id: "attacker-1", attacked: false }),
    ).toBe(id);
    b.units[0].troops = 0;
    expect(selectionAfterUpdate(b, id, { id, attacked: false })).toBe(
      "attacker-1",
    );
    b.units
      .filter((u) => u.side === "attacker")
      .forEach((u) => (u.attacked = true));
    expect(
      selectionAfterUpdate(b, "attacker-1", {
        id: "attacker-1",
        attacked: false,
      }),
    ).toBe("attacker-1");
  });
  it("原始 V0.2.0 戰中檔原樣載入；合法新事件可繼續存檔，結算一次", () => {
    let s = deserialize(JSON.stringify(oldBattle));
    expect(s).toEqual(oldBattle);
    expect(s.pendingBattle!.combatFeedback).toBeUndefined();
    for (let i = 0; i < 6 && !s.pendingBattle!.combatFeedback?.length; i++) {
      const b = runTacticalPhase(s.pendingBattle!, s.pendingBattle!.phase);
      s = { ...s, pendingBattle: b, seed: b.seed };
    }
    expect(s.pendingBattle!.combatFeedback!.length).toBeGreaterThan(0);
    expect(isGameState(s)).toBe(true);
    expect(deserialize(serialize(s))).toEqual(s);
    s = enemyPhase(s);
    expect(s.pendingBattle!.phase).toBe("attacker");
    const ret = applyTactical(s, { type: "retreat" });
    expect(ret.ok).toBe(true);
    const done = completeTactical(ret.state, s.pendingBattle!.id);
    expect(done.ok).toBe(true);
    expect(completeTactical(done.state, s.pendingBattle!.id).ok).toBe(false);
  });
  it("拒絕偽造傷亡數字、重複序號與錯誤克制結果的事件", () => {
    let s = deserialize(JSON.stringify(oldBattle));
    for (let i = 0; i < 6 && !s.pendingBattle!.combatFeedback?.length; i++) {
      const b = runTacticalPhase(s.pendingBattle!, s.pendingBattle!.phase);
      s = { ...s, pendingBattle: b, seed: b.seed };
    }
    const n = structuredClone(s);
    n.pendingBattle!.combatFeedback![0].casualties++;
    expect(() => deserialize(serialize(n))).toThrow();
    const duplicate = structuredClone(s);
    duplicate.pendingBattle!.combatFeedback!.push(
      structuredClone(duplicate.pendingBattle!.combatFeedback![0]),
    );
    expect(() => deserialize(serialize(duplicate))).toThrow();
    const bad = structuredClone(s);
    bad.pendingBattle!.combatFeedback![0].relation = "neutral";
    if (bad.pendingBattle!.combatFeedback![0].matchup === 1)
      bad.pendingBattle!.combatFeedback![0].relation = "advantage";
    expect(() => deserialize(serialize(bad))).toThrow();
  });
});
