import { describe, it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { dispatch } from "../engine/actions";
import { endMonth } from "../engine/turn";
import { runAI } from "../engine/ai";
import { settleCity, income } from "../engine/economy";
import { resolveCombat, defenderFor } from "../engine/combat";
import { checkResult } from "../engine/game";
import { random } from "../engine/rng";
import { deserialize, serialize, isGameState } from "../engine/save";
import { B } from "../engine/balance";
import type { Action, GameState } from "../engine/types";
function apply(s: GameState, a: Action) {
  const r = dispatch(s, a);
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
  return r.state;
}
const farm: Action = { type: "farm", cityId: "chengdu", officerId: "liu-0" };
function battleState(win: boolean) {
  const s = newGame("liu", 42);
  const a = s.cities.find((c) => c.id === "xiangyang")!,
    t = s.cities.find((c) => c.id === "wan")!;
  a.troops = win ? 50000 : 2000;
  t.troops = win ? 1000 : 50000;
  return s;
}
const attack: Action = {
  type: "attack",
  cityId: "xiangyang",
  officerId: "liu-1",
  targetId: "wan",
  troops: 1500,
};
describe("劇本與資料", () => {
  it("三勢力、十二城、三十將且每城有將", () => {
    const s = newGame("liu");
    expect(s.factions).toHaveLength(3);
    expect(s.cities).toHaveLength(12);
    expect(s.officers).toHaveLength(30);
    for (const f of s.factions)
      expect(s.officers.filter((o) => o.factionId === f.id)).toHaveLength(10);
    for (const c of s.cities)
      expect(s.officers.some((o) => o.cityId === c.id)).toBe(true);
    expect(new Set(s.officers.map((o) => o.id)).size).toBe(30);
    expect(isGameState(s)).toBe(true);
  });
  it("道路雙向、全圖連通、各國有邊境", () => {
    const s = newGame("cao"),
      seen = new Set<string>();
    function walk(id: string) {
      if (seen.has(id)) return;
      seen.add(id);
      s.cities.find((c) => c.id === id)!.neighbors.forEach(walk);
    }
    walk(s.cities[0].id);
    expect(seen.size).toBe(12);
    for (const c of s.cities)
      for (const n of c.neighbors)
        expect(s.cities.find((t) => t.id === n)!.neighbors).toContain(c.id);
    for (const f of s.factions)
      expect(
        s.cities.some(
          (c) =>
            c.ownerId === f.id &&
            c.neighbors.some(
              (n) => s.cities.find((t) => t.id === n)!.ownerId !== f.id,
            ),
        ),
      ).toBe(true);
  });
});
describe("統一指令入口與內政", () => {
  it.each(["farm", "trade", "recruit", "train"] as const)(
    "%s 扣正確成本並影響對應數值",
    (type) => {
      const s = newGame("liu"),
        c = s.cities.find((c) => c.id === "chengdu")!;
      const next = apply(s, { ...farm, type }),
        n = next.cities.find((x) => x.id === c.id)!;
      expect(n.gold).toBe(c.gold - B.costs[type]);
      expect(n.actions).toBe(2);
      expect(next.officers.find((o) => o.id === "liu-0")!.acted).toBe(true);
      const field = {
        farm: "agriculture",
        trade: "commerce",
        recruit: "troops",
        train: "training",
      } as const;
      expect(n[field[type]]).toBeGreaterThan(c[field[type]]);
      if (type === "recruit") {
        expect(n.food).toBe(c.food - B.recruitFood);
        expect(n.security).toBe(c.security - B.recruitSecurity);
      }
      expect(s.officers.find((o) => o.id === "liu-0")!.acted).toBe(false);
    },
  );
  it("失敗時保留原物件與數值", () => {
    const s = newGame("liu");
    s.cities.find((c) => c.id === "chengdu")!.gold = 0;
    const before = serialize(s),
      r = dispatch(s, farm);
    expect(r.ok).toBe(false);
    expect(r.state).toBe(s);
    expect(serialize(s)).toBe(before);
  });
  it("武將不能重複行動；城池不能超過三令", () => {
    const s = apply(newGame("liu"), farm);
    expect(dispatch(s, farm).ok).toBe(false);
    s.cities.find((c) => c.id === "chengdu")!.actions = 0;
    expect(dispatch(s, { ...farm, officerId: "liu-4" }).ok).toBe(false);
  });
  it("政治與智力實際提升發展；魅力提升徵兵", () => {
    const low = newGame("liu");
    const high = structuredClone(low);
    for (const k of ["politics", "intelligence", "charm"] as const) {
      low.officers[10][k] = 1;
      high.officers[10][k] = 100;
    }
    for (const type of ["farm", "recruit"] as const) {
      const a = apply(low, { ...farm, type }),
        b = apply(high, { ...farm, type });
      expect(
        b.cities[6][type === "farm" ? "agriculture" : "troops"],
      ).toBeGreaterThan(
        a.cities[6][type === "farm" ? "agriculture" : "troops"],
      );
    }
  });
  it("不能指揮敵將或敵城", () => {
    const s = newGame("liu");
    expect(
      dispatch(s, { type: "farm", cityId: "wan", officerId: "cao-3" }).ok,
    ).toBe(false);
    expect(dispatch(s, { ...farm, officerId: "cao-0" }).ok).toBe(false);
  });
  it("達上限不扣款", () => {
    const s = newGame("liu");
    s.cities[6].agriculture = 100;
    expect(dispatch(s, farm).state).toBe(s);
  });
});
describe("調動與軍事限制", () => {
  it("武將兵力兵糧守恆，抵達後不能重複行動", () => {
    const s = newGame("liu");
    const a: Action = {
      type: "transfer",
      cityId: "hanzhong",
      officerId: "liu-3",
      targetId: "xiangyang",
      troops: 2000,
      food: 1000,
    };
    const sum = (s: GameState, k: "food" | "troops") =>
      s.cities.reduce((v, c) => v + c[k], 0);
    const n = apply(s, a);
    expect(sum(n, "food")).toBe(sum(s, "food"));
    expect(sum(n, "troops")).toBe(sum(s, "troops"));
    expect(n.officers.find((o) => o.id === "liu-3")).toMatchObject({
      cityId: "xiangyang",
      acted: true,
    });
    expect(n.cities[5].troops).toBe(s.cities[5].troops - 2000);
    expect(n.cities[8].troops).toBe(s.cities[8].troops + 2000);
    expect(
      dispatch(n, { type: "farm", cityId: "xiangyang", officerId: "liu-3" }).ok,
    ).toBe(false);
  });
  it("拒絕不相鄰、友城攻擊、敵城調動、超額與負數", () => {
    const s = newGame("liu");
    for (const a of [
      { ...attack, targetId: "ye" },
      { ...attack, targetId: "hanzhong" },
      { ...attack, troops: s.cities[8].troops },
      { ...attack, troops: -1 },
      { ...attack, troops: NaN },
      { ...attack, troops: 1.5 },
      { ...attack, type: "transfer", food: 0 },
    ] as Action[])
      expect(dispatch(s, a).ok).toBe(false);
  });
  it("出征兵糧不足不改狀態", () => {
    const s = newGame("liu");
    s.cities[8].food = 0;
    expect(dispatch(s, attack).state).toBe(s);
  });
});
describe("固定種子戰鬥", () => {
  it("失敗不易主，損失只扣一次，生還者回城", () => {
    const s = battleState(false),
      n = apply(s, attack),
      b = n.battles[0];
    expect(b.won).toBe(false);
    expect(n.cities[4].ownerId).toBe("cao");
    expect(n.cities[8].troops).toBe(s.cities[8].troops - b.attackLoss);
    expect(n.cities[4].troops).toBe(s.cities[4].troops - b.defenseLoss);
    expect(n.officers.find((o) => o.id === "liu-1")!.cityId).toBe("xiangyang");
    expect(dispatch(n, attack).state).toBe(n);
  });
  it("勝利易主，生還部隊與將領入駐、敵將撤退", () => {
    const s = battleState(true),
      n = apply(s, { ...attack, troops: 40000 }),
      b = n.battles[0];
    expect(b.won).toBe(true);
    expect(n.cities[4].ownerId).toBe("liu");
    expect(n.cities[4].troops).toBe(40000 - b.attackLoss);
    expect(n.cities[8].troops).toBe(10000);
    expect(n.officers.find((o) => o.id === "liu-1")!.cityId).toBe("wan");
    expect(
      n.officers
        .filter((o) => o.factionId === "cao")
        .every((o) => o.cityId !== "wan"),
    ).toBe(true);
    expect(n.cities[4].actions).toBe(0);
    expect(n.cities[4].gold).toBe(Math.floor(s.cities[4].gold * B.captureGold));
    expect(n.cities[8].food).toBe(
      s.cities[8].food - Math.ceil(40000 * B.foodPerTroop),
    );
  });
  it("一兵不能破萬人城；多種種子無負兵力，結果可重現", () => {
    const s = battleState(false),
      c = s.cities[8],
      t = s.cities[4],
      o = s.officers.find((o) => o.id === "liu-1")!;
    for (let seed = 0; seed < 100; seed++) {
      const r = resolveCombat(c, t, o, defenderFor(s.officers, t), 1, seed);
      expect(r.won).toBe(false);
      expect(r.attackLoss).toBeLessThanOrEqual(1);
      expect(r.defenseLoss).toBeLessThanOrEqual(t.troops);
      expect(r.survivors).toBeGreaterThanOrEqual(0);
    }
    expect(resolveCombat(c, t, o, undefined, 1500, 9)).toEqual(
      resolveCombat(c, t, o, undefined, 1500, 9),
    );
    expect(random(1)).toEqual(random(1));
  });
  it("統率、武力、訓練和城防改變戰力", () => {
    const s = battleState(true),
      c = s.cities[8],
      t = s.cities[4],
      o = s.officers[11];
    const low = resolveCombat(
      c,
      t,
      { ...o, leadership: 1, strength: 1 },
      undefined,
      2000,
      42,
    );
    const high = resolveCombat(
      { ...c, training: 100 },
      { ...t, defense: 100 },
      o,
      undefined,
      2000,
      42,
    );
    expect(high.attackPower).toBeGreaterThan(low.attackPower);
    expect(high.defensePower).toBeGreaterThan(low.defensePower);
  });
});
describe("AI、經濟與終局", () => {
  it("AI 透過指令行動，遵守武將／城池額度，每國最多一戰且不影響玩家", () => {
    const s = newGame("liu");
    s.cities
      .filter((c) => c.ownerId === "cao")
      .forEach((c) => {
        c.troops = 50000;
      });
    const n = runAI(s, "cao");
    expect(n.events.length).toBeGreaterThan(s.events.length);
    expect(
      n.battles.filter((b) => b.attacker === "cao").length,
    ).toBeLessThanOrEqual(1);
    expect(n.officers.some((o) => o.factionId === "cao" && o.acted)).toBe(true);
    expect(
      n.cities.every(
        (c) =>
          c.actions >= 0 &&
          c.actions <= 3 &&
          c.troops >= 0 &&
          c.food >= 0 &&
          c.gold >= 0,
      ),
    ).toBe(true);
    expect(s.officers.every((o) => !o.acted)).toBe(true);
    expect(serialize(runAI(s, "cao"))).toBe(serialize(n));
  });
  it("AI 從內地調兵至邊境", () => {
    const s = newGame("liu"),
      n = runAI(s, "sun");
    expect(n.events.some((e) => e.includes("調往"))).toBe(true);
  });
  it("月份跨年，月收支、武將及指令重置", () => {
    const s = apply(newGame("liu"), farm);
    s.month = 12;
    const c = s.cities[6],
      i = income(c);
    const n = endMonth(s);
    expect(n.year).toBe(215);
    expect(n.month).toBe(1);
    expect(n.turn).toBe(1);
    expect(n.cities[6].gold).toBe(c.gold + i.gold);
    expect(n.cities[6].food).toBe(c.food + i.food - i.upkeep);
    expect(n.officers.every((o) => !o.acted)).toBe(true);
    expect(n.cities.every((c) => c.actions === 3)).toBe(true);
  });
  it("缺糧逃兵並限制資源上下限", () => {
    const c = newGame("liu").cities[0];
    c.food = 0;
    c.troops = 100000;
    c.gold = B.maxResource;
    const r = settleCity(c);
    expect(r.deserters).toBe(15000);
    expect(r.city.food).toBe(0);
    expect(r.city.troops).toBe(85000);
    expect(r.city.gold).toBe(B.maxResource);
  });
  it("初始經濟可持續，不在三個月內自動破產", () => {
    let s = newGame("liu");
    for (let i = 0; i < 3; i++) s = endMonth(s);
    expect(s.cities.every((c) => c.gold > 0 && c.food > 0)).toBe(true);
  });
  it("勝敗與勢力滅亡清理，不破壞其他勢力", () => {
    const s = newGame("liu");
    s.cities.forEach((c) => (c.ownerId = "liu"));
    const n = checkResult(s);
    expect(n.status).toBe("won");
    expect(
      n.officers
        .filter((o) => o.id.startsWith("cao"))
        .every((o) => o.factionId === null && o.cityId === null),
    ).toBe(true);
    expect(
      n.officers
        .filter((o) => o.id.startsWith("liu"))
        .every((o) => o.factionId === "liu"),
    ).toBe(true);
    expect(endMonth(n)).toBe(n);
    s.cities.forEach((c) => (c.ownerId = "sun"));
    expect(checkResult(s).status).toBe("lost");
  });
  it.each(["cao", "liu", "sun"] as const)(
    "%s 長期模擬保持資源、歸屬與存檔有效",
    (player) => {
      let s = newGame(player);
      for (let i = 0; i < 100 && s.status === "playing"; i++) {
        s = runAI(s, player);
        s = endMonth(s);
        expect(isGameState(s)).toBe(true);
      }
    },
  );
});
describe("完整存檔", () => {
  it("內政、戰鬥、AI 與亂數種子往返一致", () => {
    const n = endMonth(apply(battleState(true), { ...attack, troops: 40000 }));
    expect(deserialize(serialize(n))).toEqual(n);
  });
  it("拒絕壞 JSON、錯版本、缺城、負兵力、重複將與敵境駐將", () => {
    expect(() => deserialize("{")).toThrow();
    const s = newGame("liu");
    const bads: unknown[] = [
      { ...s, version: 2 },
      { ...s, cities: [] },
      { ...s, seed: NaN },
      null,
    ];
    const negative = structuredClone(s);
    negative.cities[0].troops = -1;
    bads.push(negative);
    const duplicate = structuredClone(s);
    duplicate.officers[1] = duplicate.officers[0];
    bads.push(duplicate);
    const wrong = structuredClone(s);
    wrong.officers[0].cityId = "chengdu";
    bads.push(wrong);
    for (const b of bads)
      expect(() => deserialize(JSON.stringify(b))).toThrow();
  });
});
