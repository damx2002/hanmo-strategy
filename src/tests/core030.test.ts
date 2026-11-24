import { it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { newScenarioGame } from "../data/scenarios";
import {
  upgradeToV3,
  isGameState,
  serialize,
  deserialize,
} from "../engine/save";
import { checkResult } from "../engine/game";
import { dispatch } from "../engine/actions";
import {
  startMonthResolution,
  advanceMonthResolution,
} from "../engine/resolution/month";
import { resolvePendingDefense } from "../engine/resolution/defense";
import {
  applyTactical,
  enemyPhase,
  completeTactical,
  allocateSurvivors,
} from "../engine/tactical/resolve";
import { runTacticalPhase } from "../engine/tactical/ai";
import { createBattle } from "../engine/tactical/createBattle";
import { tacticalDispatch } from "../engine/tactical/actions";
import { estimateDamage, afterDamage } from "../engine/tactical/damage";
import type { GameState } from "../engine/types";
const sum = (s: GameState) => s.cities.reduce((n, c) => n + c.troops, 0);
function threatened() {
  const s = upgradeToV3(newGame("liu", 42));
  Object.assign(
    s.cities.find((c) => c.id === "wan")!,
    { troops: 22000, food: 100000 },
  );
  s.cities.find((c) => c.id === "hanzhong")!.troops = 3000;
  Object.assign(
    s.cities.find((c) => c.id === "chengdu")!,
    { troops: 30000, food: 100000 },
  );
  let n = startMonthResolution(s);
  for (let i = 0; i < 1000 && n.monthResolution && !n.pendingDefense; i++) {
    n = advanceMonthResolution(n, 1);
    expect(isGameState(n)).toBe(true);
    n = deserialize(serialize(n));
  }
  expect(n.pendingDefense).not.toBeNull();
  return { initial: s, state: n };
}
function finish(s: GameState) {
  let n = s;
  for (let i = 0; i < 32 && n.pendingBattle!.status === "active"; i++) {
    const b = runTacticalPhase(n.pendingBattle!, n.pendingBattle!.phase);
    n = { ...n, pendingBattle: b, seed: b.seed };
    expect(isGameState(n)).toBe(true);
    n = deserialize(serialize(n));
  }
  const r = completeTactical(n, n.pendingBattle!.id);
  expect(r.ok).toBe(true);
  return r.state;
}
it("多勢力正常月結有界且每個checkpoint可恢復", () => {
  let s = startMonthResolution(newScenarioGame("three214", "liu", 42));
  let n = 0;
  while (s.monthResolution && !s.pendingDefense && n++ < 1000) {
    s = advanceMonthResolution(s, 1);
    expect(isGameState(s)).toBe(true);
    s = deserialize(serialize(s));
  }
  expect(n).toBeLessThan(1000);
  expect(s.turn === 1 || !!s.pendingDefense).toBe(true);
  expect(
    s.events.some(
      (e) => e.includes("同盟交涉") || e.includes("搜尋") || e.includes("登用"),
    ),
  ).toBe(true);
});
it("攻城警報先暫停，兵糧未扣，敵軍同一次意圖不重播", () => {
  const { state: s } = threatened();
  const p = s.pendingDefense!,
    source = s.cities.find((c) => c.id === p.order.cityId)!;
  expect(source.troops).toBe(22000);
  expect(source.food).toBe(100000);
  expect(advanceMonthResolution(s)).toBe(s);
  expect(startMonthResolution(s)).toBe(s);
  expect(s.turn).toBe(0);
  expect(deserialize(serialize(s))).toEqual(s);
  expect(
    dispatch(s, { type: "farm", cityId: "chengdu", officerId: "liu-0" }).ok,
  ).toBe(false);
});
it("玩家可真正操作守軍，攻方AI先走，重讀不重扣援軍", () => {
  const { state: s } = threatened();
  const p = s.pendingDefense!,
    start = resolvePendingDefense(s, p.id, "manual", [
      { cityId: "chengdu", officerId: "liu-0", troops: 20000 },
    ]);
  expect(start.ok).toBe(true);
  let n = start.state;
  expect(n.pendingBattle!.playerSide).toBe("defender");
  expect(n.cities.find((c) => c.id === "chengdu")!.troops).toBe(10000);
  expect(n.cities.find((c) => c.id === "chengdu")!.food).toBe(95600);
  expect(isGameState(n)).toBe(true);
  expect(deserialize(serialize(n))).toEqual(n);
  expect(resolvePendingDefense(n, p.id, "manual").ok).toBe(false);
  n = enemyPhase(n);
  expect(
    n.pendingBattle!.phase === "defender" ||
      n.pendingBattle!.status !== "active",
  ).toBe(true);
  const u = n.pendingBattle!.units.find(
    (u) => u.side === "defender" && u.troops > 0 && !u.routed,
  )!;
  if (n.pendingBattle!.status === "active") {
    const wait = applyTactical(n, { type: "wait", unitId: u.id });
    expect(wait.ok).toBe(true);
    expect(
      wait.state.pendingBattle!.units.find((x) => x.id === u.id)!.attacked,
    ).toBe(true);
    expect(applyTactical(n, { type: "wait", unitId: "attacker-0" }).ok).toBe(
      false,
    );
  }
});
it("援軍不足、非鄰城、重複來源均拒絕且不扣資源", () => {
  const { state: s } = threatened();
  for (const reinforcements of [
    [{ cityId: "chengdu", officerId: "liu-0", troops: 999999 }],
    [{ cityId: "jiangzhou", officerId: "liu-2", troops: 1000 }],
    [
      { cityId: "chengdu", officerId: "liu-0", troops: 1000 },
      { cityId: "chengdu", officerId: "liu-6", troops: 1000 },
    ],
  ]) {
    const r = resolvePendingDefense(
      s,
      s.pendingDefense!.id,
      "manual",
      reinforcements,
    );
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
  }
});
it("守城勝利、援軍返回與總兵守恆，戰果只套一次", () => {
  const { state: s } = threatened();
  const before = sum(s),
    p = s.pendingDefense!;
  const r = resolvePendingDefense(s, p.id, "manual", [
    { cityId: "chengdu", officerId: "liu-0", troops: 20000 },
  ]);
  const done = finish(r.state),
    report = done.battles[0];
  expect(report.won).toBe(false);
  expect(done.cities.find((c) => c.id === p.order.targetId)!.ownerId).toBe(
    "liu",
  );
  expect(sum(done)).toBe(before - report.attackLoss - report.defenseLoss);
  expect(report.reinforcements).toHaveLength(1);
  expect(
    report.reinforcements![0].survivors + report.reinforcements![0].loss,
  ).toBe(20000);
  expect(done.officers.find((o) => o.id === "liu-0")!.cityId).toBe("chengdu");
  expect(completeTactical(done, r.state.pendingBattle!.id).ok).toBe(false);
  expect(isGameState(done)).toBe(true);
});
it("弱軍守城失敗正確易主，之後繼續原AI而非重算整月", () => {
  const { state: s } = threatened();
  const p = s.pendingDefense!,
    r = resolvePendingDefense(s, p.id, "auto");
  expect(r.ok).toBe(true);
  expect(r.state.cities.find((c) => c.id === p.order.targetId)!.ownerId).toBe(
    "cao",
  );
  let n = r.state;
  for (let i = 0; i < 1000 && n.monthResolution; i++) {
    if (n.pendingDefense)
      n = resolvePendingDefense(n, n.pendingDefense.id, "auto").state;
    else n = advanceMonthResolution(n, 5);
    expect(isGameState(n)).toBe(true);
  }
  expect(n.turn).toBe(1);
  expect(
    n.battles.filter((b) => b.from === "宛" && b.to === "漢中"),
  ).toHaveLength(1);
  expect(advanceMonthResolution(n)).toBe(n);
});
it("有零兵守城時援軍存活比例分配仍完全守恆", () => {
  for (const weights of [
    [0, 1, 1],
    [3, 7, 9],
    [0, 20000, 1234],
  ])
    for (
      let n = 0;
      n <= weights.reduce((a, b) => a + b, 0);
      n += Math.max(1, Math.floor(weights.reduce((a, b) => a + b, 0) / 7))
    ) {
      const a = allocateSurvivors(weights, n);
      expect(a.reduce((x, y) => x + y, 0)).toBe(n);
      expect(a.every((x, i) => x >= 0 && x <= weights[i])).toBe(true);
    }
});
it("多將分隊、特質與士氣真實影響傷害，潰退士兵不刪除", () => {
  const s = newScenarioGame("three214", "liu", 42),
    c = s.cities.find(
      (c) =>
        c.ownerId === "liu" &&
        s.officers.filter((o) => o.cityId === c.id && o.factionId === "liu")
          .length >= 2,
    )!,
    t = s.cities.find(
      (t) => c.neighbors.includes(t.id) && t.ownerId !== c.ownerId,
    )!;
  const ids = s.officers
    .filter((o) => o.cityId === c.id && o.factionId === "liu")
    .slice(0, 2)
    .map((o) => o.id);
  const b = createBattle(s, {
    cityId: c.id,
    targetId: t.id,
    officerId: ids[0],
    officerIds: ids,
    troops: 3000,
  });
  expect(
    new Set(
      b.units.filter((u) => u.side === "attacker").map((u) => u.commanderId),
    ).size,
  ).toBe(2);
  const u = b.units[0],
    v = b.units.find((u) => u.side === "defender")!;
  const high = estimateDamage(b, u, v);
  expect(estimateDamage(b, { ...u, morale: 20 }, v)).toBeLessThan(high);
  const routed = afterDamage({ ...u, morale: 21 }, 1);
  expect(routed.routed).toBe(true);
  expect(routed.troops).toBe(u.troops - 1);
  expect(
    tacticalDispatch(
      { ...b, units: [routed, ...b.units.slice(1)] },
      { type: "wait", unitId: u.id },
    ).ok,
  ).toBe(false);
});
it("新世界12城不會誤判統一，完整41城才能存取勝利", () => {
  for (const count of [12, 41]) {
    const s = newScenarioGame("three214", "cao", 42);
    s.cities.forEach((c, i) => {
      c.ownerId = i < count ? "cao" : "liu";
      delete c.governorId;
    });
    s.officers.forEach((o) => {
      if (o.factionId)
        o.cityId = s.cities.find((c) => c.ownerId === o.factionId)?.id ?? null;
    });
    // Construct a coherent ownership fixture, then let the normal result checker update extinct factions.
    s.officers.forEach((o) => {
      if (o.factionId && !o.cityId) {
        o.factionId = null;
        o.cityId = s.cities[0].id;
      }
    });
    const n = checkResult(s);
    expect(n.status).toBe(count === 41 ? "won" : "playing");
    expect(isGameState(n)).toBe(true);
  }
});
it("不接受損壞的中斷摘要與援軍戰報", () => {
  const { state: s } = threatened();
  const broken = structuredClone(s);
  broken.monthResolution!.eventsBefore = [1 as unknown as string];
  expect(isGameState(broken)).toBe(false);
  const done = resolvePendingDefense(s, s.pendingDefense!.id, "auto", [
    { cityId: "chengdu", officerId: "liu-0", troops: 20000 },
  ]).state;
  expect(isGameState(done)).toBe(true);
  done.battles[0].reinforcements![0].survivors++;
  expect(isGameState(done)).toBe(false);
});

it("格式錯誤的V3可選欄位安全拒絕而非拋出例外", () => {
  const { state: s } = threatened();
  const n = resolvePendingDefense(s, s.pendingDefense!.id, "manual").state;
  for (const field of ["officerIds", "reinforcements", "commanders", "units"]) {
    const broken = JSON.parse(serialize(n));
    broken.pendingBattle[field] = "bad";
    expect(() => isGameState(broken)).not.toThrow();
    expect(isGameState(broken)).toBe(false);
  }
});
it("帶援軍守城撤退時損失與生還均有去向且只套用一次", () => {
  const { state: s } = threatened();
  const started = resolvePendingDefense(s, s.pendingDefense!.id, "manual", [
    { cityId: "chengdu", officerId: "liu-0", troops: 20000 },
  ]).state;
  const afterEnemy = enemyPhase(started),
    before = sum(s); // Compare against pre-reservation world, which includes the expedition.
  const retreat = applyTactical(afterEnemy, { type: "retreat" });
  expect(retreat.ok).toBe(true);
  const done = completeTactical(
      retreat.state,
      retreat.state.pendingBattle!.id,
    ).state,
    b = done.battles[0];
  expect(b.won).toBe(true);
  expect(done.cities.find((c) => c.id === "hanzhong")!.ownerId).toBe("cao");
  expect(sum(done)).toBe(before - b.attackLoss - b.defenseLoss);
  expect(b.reinforcements![0].returnedTo).toBe("chengdu");
  expect(b.reinforcements![0].survivors).toBe(20000);
  expect(completeTactical(done, b.id).ok).toBe(false);
  expect(isGameState(done)).toBe(true);
});
