import { describe, it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { dispatch } from "../engine/actions";
import { B } from "../engine/balance";
import { income, settleCity } from "../engine/economy";
import { endMonth } from "../engine/turn";
import { deserialize, serialize, isGameState } from "../engine/save";
import { executeDelegatedCities } from "../engine/delegation/execute";
import {
  getPolicy,
  setDelegationPolicy,
  setRearDelegation,
} from "../engine/delegation/policy";
import { planDelegatedAction } from "../engine/delegation/planner";
import { D } from "../engine/delegation/balance";
import { runTacticalPhase } from "../engine/tactical/ai";
import { beginTactical } from "../engine/tactical/createBattle";
import { applyTactical, completeTactical } from "../engine/tactical/resolve";
import { playCampaign } from "./helpers/playCampaign";
import type { GameState } from "../engine/types";
import type { ManagedPolicy } from "../engine/delegation/types";
import v010 from "./fixtures/v0.1.0-save.json";
import v011 from "./fixtures/v0.1.1-save.json";
import v020 from "./fixtures/v0.2.0-battle-save.json";
import v021 from "./fixtures/v0.2.1-battle-save.json";
import v022 from "./fixtures/v0.2.2-save.json";
const city = (s: GameState, id = "chengdu") =>
  s.cities.find((c) => c.id === id)!;
function configure(
  s = newGame("liu", 42),
  id = "chengdu",
  policy: ManagedPolicy = "economy",
) {
  const r = setDelegationPolicy(s, id, policy);
  expect(r.ok).toBe(true);
  return r.state;
}
const actions = (s: GameState) =>
  s.delegation!.report!.cities.flatMap((c) => c.actions);
const total = (s: GameState, key: "gold" | "food") =>
  s.cities.reduce((n, c) => n + c[key], 0);
describe("委任設定與舊存檔", () => {
  it("新遊戲所有城市預設手動，沒有額外資源消耗", () => {
    const s = newGame("liu");
    expect(s.cities.every((c) => getPolicy(s, c.id) === "manual")).toBe(true);
    expect(executeDelegatedCities(s)).toBe(s);
  });
  it.each([v010, v011, v020, v021, v022])(
    "五代舊檔逐欄保留、全部手動、往返不變 %#",
    (fixture) => {
      const n = deserialize(JSON.stringify(fixture));
      expect(n).toEqual({
        ...fixture,
        version: 2,
        pendingBattle:
          "pendingBattle" in fixture ? fixture.pendingBattle : null,
      });
      expect(n.cities.every((c) => getPolicy(n, c.id) === "manual")).toBe(true);
      expect(deserialize(serialize(n))).toEqual(n);
    },
  );
  it("單城設定、更換及取消完全不耗資源、指令、武將或亂數", () => {
    const s = newGame("liu"),
      n = configure(s),
      x = setDelegationPolicy(n, "chengdu", "manual").state;
    expect(getPolicy(n, "chengdu")).toBe("economy");
    expect(getPolicy(n, "hanzhong")).toBe("manual");
    for (const key of [
      "cities",
      "officers",
      "seed",
      "events",
      "battles",
    ] as const) {
      expect(n[key]).toEqual(s[key]);
      expect(x[key]).toEqual(s[key]);
    }
    expect(getPolicy(x, "chengdu")).toBe("manual");
    expect(deserialize(serialize(n))).toEqual(n);
  });
  it("拒絕敵城、未知方針與已結束遊戲", () => {
    const s = newGame("liu");
    for (const [id, policy] of [
      ["wan", "economy"],
      ["missing", "military"],
      ["chengdu", "constructor"],
      ["chengdu", {}],
    ]) {
      const r = setDelegationPolicy(s, String(id), policy);
      expect(r.ok).toBe(false);
      expect(r.state).toBe(s);
    }
    const lost = { ...s, status: "lost" as const };
    expect(setDelegationPolicy(lost, "chengdu", "economy").ok).toBe(false);
    expect(executeDelegatedCities(lost)).toBe(lost);
  });
  it("批次設定及取消僅改己方後方，保持前線既有方針", () => {
    const s = configure(newGame("liu"), "hanzhong", "military"),
      n = setRearDelegation(s, "balanced").state;
    expect(getPolicy(n, "chengdu")).toBe("balanced");
    expect(getPolicy(n, "hanzhong")).toBe("military");
    expect(getPolicy(n, "xiangyang")).toBe("manual");
    const x = setRearDelegation(n, "manual").state;
    expect(getPolicy(x, "chengdu")).toBe("manual");
    expect(getPolicy(x, "hanzhong")).toBe("military");
    expect(x.cities).toEqual(s.cities);
  });
  it.each([
    null,
    [],
    { policies: [] },
    { policies: { wan: "economy" } },
    { policies: { missing: "balanced" } },
    { policies: { chengdu: "constructor" } },
    { policies: { chengdu: "manual" } },
    { policies: {}, extra: true },
  ])("拒絕非法委任資料形狀或擁有權 %#", (delegation) => {
    const s = { ...newGame("liu"), delegation };
    expect(isGameState(s)).toBe(false);
  });
});
describe("可解釋內政與資源安全", () => {
  it.each(["balanced", "economy", "military", "defense"] as ManagedPolicy[])(
    "%s 透過正常指令改變真實城池數值",
    (p) => {
      const s = configure(newGame("liu", 42), "chengdu", p),
        n = executeDelegatedCities(s);
      expect(actions(n).length).toBeGreaterThan(0);
      expect(actions(n).length).toBeLessThanOrEqual(3);
      expect(new Set(actions(n).map((a) => a.officerId)).size).toBe(
        actions(n).length,
      );
      expect(n.seed).toBe(s.seed);
      expect(n.battles).toEqual(s.battles);
      expect(n.pendingBattle).toEqual(s.pendingBattle);
      expect(n.officers.map((o) => [o.id, o.cityId, o.factionId])).toEqual(
        s.officers.map((o) => [o.id, o.cityId, o.factionId]),
      );
      expect(city(n, "hanzhong")).toEqual(city(s, "hanzhong"));
      expect(
        actions(n).every((a) =>
          ["farm", "trade", "recruit", "train", "patrol", "repair"].includes(
            a.type,
          ),
        ),
      ).toBe(true);
      let replay = s;
      for (const a of actions(n)) {
        const r = dispatch(replay, {
          type: a.type,
          cityId: "chengdu",
          officerId: a.officerId,
        });
        expect(r.ok).toBe(true);
        replay = r.state;
      }
      expect(n.cities).toEqual(replay.cities);
      expect(n.officers).toEqual(replay.officers);
      expect(executeDelegatedCities(s)).toEqual(n);
      expect(isGameState(n)).toBe(true);
    },
  );
  it("手動使用兩令後只補一令，手動武將不再使用", () => {
    let s = configure();
    const officers = s.officers.filter((o) => o.cityId === "chengdu");
    for (const o of officers.slice(0, 2))
      s = dispatch(s, {
        type: "farm",
        cityId: "chengdu",
        officerId: o.id,
      }).state;
    const n = executeDelegatedCities(s);
    expect(actions(n)).toHaveLength(1);
    expect(city(n).actions).toBe(0);
    expect(officers.slice(0, 2).map((o) => o.id)).not.toContain(
      actions(n)[0].officerId,
    );
  });
  it.each(["officers", "orders"])(
    "%s 不足可不執行，摘要保留真實原因",
    (kind) => {
      const s = configure();
      if (kind === "officers")
        s.officers
          .filter((o) => o.cityId === "chengdu")
          .forEach((o) => (o.acted = true));
      else city(s).actions = 0;
      const n = executeDelegatedCities(s);
      expect(actions(n)).toHaveLength(0);
      expect(n.cities).toEqual(s.cities);
      expect(n.delegation!.report!.cities[0].reason).toBe(
        kind === "officers" ? "待命武將不足" : "本月指令已用盡",
      );
    },
  );
  it("經濟優先農商滿值後改做有用治理，不會徵兵", () => {
    const s = configure();
    Object.assign(city(s), { agriculture: 100, commerce: 100, security: 40 });
    const n = executeDelegatedCities(s);
    expect(actions(n)[0].type).toBe("patrol");
    expect(actions(n).some((a) => a.type === "recruit")).toBe(false);
  });
  it("全能力達標時不強迫用完指令", () => {
    const s = configure();
    Object.assign(city(s), {
      agriculture: 100,
      commerce: 100,
      security: 100,
      training: 100,
      defense: 100,
    });
    const n = executeDelegatedCities(s);
    expect(actions(n)).toHaveLength(0);
    expect(city(n).actions).toBe(3);
    expect(n.delegation!.report!.cities[0].reason).toBe("內政已達目標");
  });
  it("低金保留緩衝，不會強迫消費或負數", () => {
    const s = configure();
    city(s).gold = D.goldReserve;
    const n = executeDelegatedCities(s);
    expect(actions(n)).toHaveLength(0);
    expect(city(n).gold).toBe(D.goldReserve);
    expect(n.delegation!.report!.cities[0].reason).toBe("資源保留");
  });
  it("8000兵缺糧的軍備城優先開墾而非徵兵", () => {
    const s = configure(newGame("liu"), "chengdu", "military");
    Object.assign(city(s), { troops: 8000, food: 100, agriculture: 10 });
    const n = executeDelegatedCities(s);
    expect(actions(n)[0].type).toBe("farm");
    expect(actions(n).some((a) => a.type === "recruit")).toBe(false);
    expect(city(n).troops).toBe(8000);
    expect(city(n).food).toBe(100);
  });
  it("軍備徵兵須能負擔新增兵力後兩月軍糧及緩衝", () => {
    const s = configure(newGame("liu"), "chengdu", "military");
    Object.assign(city(s), {
      food: 15000,
      agriculture: 100,
      commerce: 100,
      training: 100,
      security: 100,
      troops: 1000,
    });
    const n = executeDelegatedCities(s);
    expect(actions(n).some((a) => a.type === "recruit")).toBe(true);
    const i = income(city(n));
    expect(city(n).food + i.food - i.upkeep).toBeGreaterThanOrEqual(
      D.foodReserve + i.upkeep * D.foodMonths,
    );
    expect(i.food).toBeGreaterThanOrEqual(i.upkeep);
  });
  it("選適合武將：農商政治、徵兵魅力、訓練及修築統率", () => {
    const s = configure();
    const os = s.officers.filter((o) => o.cityId === "chengdu");
    Object.assign(city(s), {
      agriculture: 1,
      commerce: 100,
      security: 100,
      defense: 100,
      training: 100,
    });
    const farm = planDelegatedAction(s, "chengdu", "economy");
    expect(farm.action?.officerId).toBe(
      [...os].sort((a, b) => b.politics - a.politics)[0].id,
    );
    Object.assign(city(s), { agriculture: 100, troops: 1, food: 50000 });
    expect(
      planDelegatedAction(s, "chengdu", "military").action?.officerId,
    ).toBe([...os].sort((a, b) => b.charm - a.charm)[0].id);
    Object.assign(city(s), { troops: 20000, training: 1 });
    expect(
      planDelegatedAction(s, "chengdu", "military").action?.officerId,
    ).toBe([...os].sort((a, b) => b.leadership - a.leadership)[0].id);
    Object.assign(city(s), { training: 100, defense: 1 });
    expect(planDelegatedAction(s, "chengdu", "defense").action?.type).toBe(
      "repair",
    );
  });
  it("每筆指令重新讀最新狀態，不超支、不操作敵方武將", () => {
    const s = configure();
    city(s).gold = D.goldReserve + B.costs.farm;
    const n = executeDelegatedCities(s);
    expect(actions(n)).toHaveLength(1);
    expect(city(n).gold).toBe(D.goldReserve);
    expect(
      actions(n).every((a) =>
        s.officers.some(
          (o) =>
            o.id === a.officerId &&
            o.factionId === s.playerId &&
            o.cityId === "chengdu",
        ),
      ),
    ).toBe(true);
    expect(n.cities.every((c) => c.gold >= 0 && c.food >= 0)).toBe(true);
  });
});
describe("月結順序、恢復與戰爭整合", () => {
  it("委任先用本月剩餘令，再月結經濟／重置，且不重複委任", () => {
    const s = configure(),
      delegated = executeDelegatedCities(s),
      n = endMonth(s);
    expect(executeDelegatedCities(delegated)).toBe(delegated);
    expect(executeDelegatedCities(deserialize(serialize(delegated)))).toEqual(
      delegated,
    );
    expect(endMonth(delegated)).toEqual(n);
    expect(endMonth(s)).toEqual(n);
    expect(n.turn).toBe(s.turn + 1);
    expect(city(n).actions).toBe(3);
    expect(
      n.officers
        .filter((o) => o.factionId === s.playerId)
        .every((o) => !o.acted),
    ).toBe(true);
    expect(city(n)).toEqual(settleCity(city(delegated)).city);
    expect(n.delegation!.processedTurn).toBe(s.turn);
    expect(n.delegation!.report!.cities).toEqual(
      delegated.delegation!.report!.cities,
    );
    expect(isGameState(n)).toBe(true);
  });
  it("委任支出與實際金糧／能力變化相符，月收另外列示", () => {
    const s = configure(),
      n = executeDelegatedCities(s),
      report = n.delegation!.report!;
    expect(total(s, "gold") - total(n, "gold")).toBe(
      report.cities.reduce((n, c) => n + c.gold, 0),
    );
    expect(total(s, "food") - total(n, "food")).toBe(
      report.cities.reduce((n, c) => n + c.food, 0),
    );
    for (const a of actions(n)) expect(a.after).toBeGreaterThan(a.before);
    const done = endMonth(s),
      entry = done.delegation!.report!.economy!.find(
        (c) => c.cityId === "chengdu",
      )!;
    expect(entry.gold).toBe(city(done).gold - city(n).gold);
    expect(entry.netFood).toBe(city(done).food - city(n).food);
    expect(entry.food).toBe(income(city(n)).food);
    expect(entry.upkeep).toBe(income(city(n)).upkeep);
    const bad = structuredClone(done);
    bad.delegation!.report!.cities[0].gold++;
    expect(isGameState(bad)).toBe(false);
  });
  it("正在戰術戰鬥不能設定、委任、月結，撤退結算不改委任設定", () => {
    const s = configure(),
      begin = beginTactical(s, {
        cityId: "hanzhong",
        targetId: "wan",
        officerId: "liu-3",
        troops: 6000,
      });
    expect(begin.ok).toBe(true);
    const b = begin.state;
    expect(setDelegationPolicy(b, "chengdu", "manual").ok).toBe(false);
    expect(executeDelegatedCities(b)).toBe(b);
    expect(endMonth(b)).toBe(b);
    expect(deserialize(serialize(b))).toEqual(b);
    const retreat = applyTactical(b, { type: "retreat" }),
      done = completeTactical(retreat.state, b.pendingBattle!.id);
    expect(done.ok).toBe(true);
    expect(done.state.delegation).toEqual(s.delegation);
    expect(completeTactical(done.state, b.pendingBattle!.id).ok).toBe(false);
  });
  it("帶委任設定的完整手動戰術結算與無委任完全相同", () => {
    const finish = (s: GameState) => {
      let n = beginTactical(s, {
        cityId: "hanzhong",
        targetId: "wan",
        officerId: "liu-3",
        troops: 6000,
      }).state;
      for (
        let step = 0;
        step < 32 && n.pendingBattle!.status === "active";
        step++
      ) {
        const b = runTacticalPhase(n.pendingBattle!, n.pendingBattle!.phase);
        n = deserialize(serialize({ ...n, pendingBattle: b, seed: b.seed }));
      }
      const r = completeTactical(n, n.pendingBattle!.id);
      expect(r.ok).toBe(true);
      return r.state;
    };
    const base = newGame("liu", 42),
      expected = finish(base),
      configured = finish(configure(base));
    expect(configured.cities).toEqual(expected.cities);
    expect(configured.officers).toEqual(expected.officers);
    expect(configured.battles).toEqual(expected.battles);
    expect(configured.seed).toBe(expected.seed);
    expect(getPolicy(configured, "chengdu")).toBe("economy");
    expect(configured.delegation!.report).toBeUndefined();
  });
  it("失城清除委任，重新奪回預設手動", () => {
    let s = configure(newGame("liu"), "hanzhong", "defense");
    city(s, "wan").troops = 100000;
    city(s, "wan").food = 100000;
    city(s, "hanzhong").troops = 500;
    const lost = dispatch(
      s,
      {
        type: "attack",
        cityId: "wan",
        targetId: "hanzhong",
        officerId: "cao-3",
        troops: 90000,
      },
      "cao",
    );
    expect(lost.ok).toBe(true);
    s = lost.state;
    expect(city(s, "hanzhong").ownerId).toBe("cao");
    expect(s.delegation!.policies.hanzhong).toBeUndefined();
    city(s, "xiangyang").troops = 100000;
    city(s, "xiangyang").food = 100000;
    city(s, "hanzhong").troops = 1;
    const o = s.officers.find((o) => o.cityId === "xiangyang" && !o.acted)!;
    const won = dispatch(s, {
      type: "attack",
      cityId: "xiangyang",
      targetId: "hanzhong",
      officerId: o.id,
      troops: 50000,
    });
    expect(won.ok).toBe(true);
    expect(city(won.state, "hanzhong").ownerId).toBe("liu");
    expect(getPolicy(won.state, "hanzhong")).toBe("manual");
  });
  it("連續24月各方針合法運作，敵國仍發展及出征", () => {
    let s = newGame("liu", 214019);
    for (const [id, p] of [
      ["chengdu", "economy"],
      ["hanzhong", "defense"],
      ["xiangyang", "military"],
      ["jiangzhou", "balanced"],
    ] as [string, ManagedPolicy][])
      s = configure(s, id, p);
    let orders = 0;
    for (let month = 0; month < 24; month++) {
      expect(s.status).toBe("playing");
      const oldTurn = s.turn;
      s = endMonth(s);
      expect(s.turn).toBe(oldTurn + 1);
      orders += actions(s).length;
      expect(isGameState(s)).toBe(true);
      s = deserialize(serialize(s));
      expect(
        s.cities.every((c) => c.gold >= 0 && c.food >= 0 && c.troops >= 0),
      ).toBe(true);
    }
    expect(orders).toBeGreaterThan(24);
    const opportunity = configure(newGame("liu", 214019));
    city(opportunity, "hanzhong").troops = 500;
    city(opportunity, "wan").troops = 14000;
    city(opportunity, "wan").food = 20000;
    expect(endMonth(opportunity).battles.length).toBeGreaterThan(0);
    expect(
      s.cities.some(
        (c) => c.ownerId !== "liu" && (c.commerce > 80 || c.agriculture > 80),
      ),
    ).toBe(true);
  });
  it("加入委任後，原始劉備策略仍可合法統一十二城", () => {
    let s = newGame("liu", 214019);
    for (const c of s.cities.filter((c) => c.ownerId === s.playerId))
      s = configure(s, c.id, "balanced");
    const n = playCampaign(s);
    expect(n.status).toBe("won");
    expect(n.cities.every((c) => c.ownerId === "liu")).toBe(true);
    expect(isGameState(n)).toBe(true);
  });
});
