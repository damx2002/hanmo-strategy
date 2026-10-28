import { describe, it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { B } from "../engine/balance";
import { dispatch } from "../engine/actions";
import { runAI } from "../engine/ai";
import { endMonth } from "../engine/turn";
import { power, defenderFor } from "../engine/combat";
import { deserialize, serialize, isGameState, SAVE_KEY } from "../engine/save";
import {
  nextAvailableOfficer,
  actionFeedback,
} from "../components/actionSelection";
import legacy from "./fixtures/v0.1.0-save.json";
import type { Action, Domestic } from "../engine/types";

const commands = ["patrol", "repair"] as const;
const field = { patrol: "security", repair: "defense" } as const;
const order = (type: Domestic): Action => ({
  type,
  cityId: "chengdu",
  officerId: "liu-0",
});
describe("巡察與修築", () => {
  it.each(commands)("%s 真正改變能力、扣款與行動，原狀態不變", (type) => {
    const s = newGame("liu"),
      c = s.cities.find((c) => c.id === "chengdu")!,
      o = s.officers.find((o) => o.id === "liu-0")!;
    c[field[type]] = 20;
    const before = serialize(s),
      r = dispatch(s, order(type));
    expect(r.ok).toBe(true);
    const next = r.state.cities.find((c) => c.id === "chengdu")!;
    const growth =
      type === "patrol"
        ? Math.floor(
            B.patrolBase +
              o.politics * B.patrolPolitics +
              o.charm * B.patrolCharm,
          )
        : Math.floor(
            B.repairBase +
              o.leadership * B.repairLeadership +
              o.politics * B.repairPolitics,
          );
    expect(next[field[type]]).toBe(20 + growth);
    expect(next.gold).toBe(c.gold - B.costs[type]);
    expect(next.food).toBe(c.food);
    expect(next.troops).toBe(c.troops);
    expect(next.actions).toBe(c.actions - 1);
    expect(r.state.officers.find((o) => o.id === "liu-0")!.acted).toBe(true);
    expect(serialize(s)).toBe(before);
    expect(r.state.events[0]).toContain(type === "patrol" ? "巡察" : "修築");
    expect(dispatch(r.state, { ...order(type), type: "farm" }).state).toBe(
      r.state,
    );
  });
  it.each(commands)("%s 上限封頂，已滿不能執行", (type) => {
    const s = newGame("liu");
    s.cities[6][field[type]] = 99;
    const r = dispatch(s, order(type));
    expect(r.ok).toBe(true);
    expect(r.state.cities[6][field[type]]).toBe(100);
    const max = newGame("liu");
    max.cities[6][field[type]] = 100;
    const result = dispatch(max, order(type));
    expect(result.ok).toBe(false);
    expect(result.state).toBe(max);
  });
  it.each(commands)("%s 金錢不足、已行動及無城池指令均拒絕且不扣款", (type) => {
    for (const mode of ["gold", "officer", "city"]) {
      const s = newGame("liu");
      if (mode === "gold") s.cities[6].gold = B.costs[type] - 1;
      if (mode === "officer") s.officers[10].acted = true;
      if (mode === "city") s.cities[6].actions = 0;
      const before = serialize(s),
        r = dispatch(s, order(type));
      expect(r.ok).toBe(false);
      expect(r.state).toBe(s);
      expect(serialize(s)).toBe(before);
    }
  });
  it.each(commands)("%s 相應武將能力提高效果", (type) => {
    const low = newGame("liu"),
      high = newGame("liu");
    low.cities[6][field[type]] = 0;
    high.cities[6][field[type]] = 0;
    for (const k of type === "patrol"
      ? (["politics", "charm"] as const)
      : (["leadership", "politics"] as const)) {
      low.officers[10][k] = 1;
      high.officers[10][k] = 100;
    }
    expect(
      dispatch(high, order(type)).state.cities[6][field[type]],
    ).toBeGreaterThan(dispatch(low, order(type)).state.cities[6][field[type]]);
  });
  it("修築確實提高原有防守戰力", () => {
    const s = newGame("liu"),
      c = s.cities[6],
      officer = defenderFor(s.officers, c);
    const r = dispatch(s, order("repair"));
    const n = r.state.cities[6];
    expect(power(n.troops, officer, n.training, n.defense)).toBeGreaterThan(
      power(c.troops, officer, c.training, c.defense),
    );
  });
});
function aiState() {
  const s = newGame("liu");
  const c = s.cities.find((c) => c.id === "wan")!;
  c.troops = 10000;
  c.training = 80;
  c.agriculture = 90;
  c.commerce = 90;
  c.gold = 5000;
  c.security = 80;
  c.defense = 80;
  return s;
}
describe("治理 AI", () => {
  it.each(commands)(
    "AI 能執行 %s，與玩家相同成本且每城每月至多治理一次",
    (type) => {
      const s = aiState(),
        c = s.cities[4];
      c[field[type]] = type === "patrol" ? 10 : 5;
      // Isolate the city; unrelated AI cities retain their data, but have no orders this month.
      s.cities
        .filter((c) => c.ownerId === "cao" && c.id !== "wan")
        .forEach((c) => (c.actions = 0));
      const n = runAI(s, "cao");
      const logs = n.events.filter((e) =>
        e.includes(type === "patrol" ? "巡察" : "修築"),
      );
      expect(logs).toHaveLength(1);
      expect(n.cities[4][field[type]]).toBeGreaterThan(c[field[type]]);
      const domesticLog = n.events.filter((e) => e.includes("於宛執行"));
      const spent = domesticLog.reduce(
        (total, e) =>
          total +
          (e.includes("巡察")
            ? B.costs.patrol
            : e.includes("修築")
              ? B.costs.repair
              : e.includes("徵兵")
                ? B.costs.recruit
                : e.includes("商業")
                  ? B.costs.trade
                  : e.includes("開墾")
                    ? B.costs.farm
                    : B.costs.train),
        0,
      );
      expect(c.gold - n.cities[4].gold).toBe(spent);
      expect(
        n.battles.filter((b) => b.attacker === "cao").length,
      ).toBeLessThanOrEqual(1);
    },
  );
  it("內地不為低城防修築，資源緊張先顧經濟兵糧", () => {
    const s = aiState();
    s.cities
      .filter((c) => c.ownerId === "cao")
      .forEach((c) => {
        c.gold = 300;
        c.food = 0;
        c.security = 10;
        c.defense = 0;
      });
    const n = runAI(s, "cao");
    expect(n.events.some((e) => e.includes("巡察") || e.includes("修築"))).toBe(
      false,
    );
    expect(n.events.some((e) => e.includes("開墾") || e.includes("商業"))).toBe(
      true,
    );
    const inland = aiState();
    inland.cities.forEach((c) => (c.actions = c.id === "ye" ? 3 : 0));
    inland.cities[0].defense = 0;
    expect(runAI(inland, "cao").events.some((e) => e.includes("修築"))).toBe(
      false,
    );
  });
  it("有明顯攻勢仍出征，不被治理取代", () => {
    const s = aiState();
    s.cities[4].troops = 50000;
    s.cities[4].security = 10;
    s.cities[4].defense = 0;
    const n = runAI(s, "cao");
    expect(n.battles.filter((b) => b.attacker === "cao")).toHaveLength(1);
  });
  it("長期三國使用真實規則，治理、經濟與攻城皆可發生且資源有效", () => {
    let s = newGame("liu");
    /* Expose all policies in a valid contested scenario. */ s.cities[8].troops = 40000;
    s.cities[4].security = 50;
    s.cities[9].defense = 20;
    let governance = 0,
      economy = 0,
      wars = 0;
    for (let i = 0; i < 100 && s.status === "playing"; i++) {
      const before = s.events;
      s = runAI(s, "liu");
      s = endMonth(s);
      const logs = s.events.filter((e) => !before.includes(e));
      governance += logs.filter(
        (e) => e.includes("巡察") || e.includes("修築"),
      ).length;
      economy += logs.filter(
        (e) => e.includes("開墾") || e.includes("商業"),
      ).length;
      wars += logs.filter((e) => e.includes("進攻")).length;
      expect(isGameState(s)).toBe(true);
      expect(
        s.cities.every((c) => c.gold >= 0 && c.food >= 0 && c.troops >= 0),
      ).toBe(true);
    }
    expect(governance, "治理未執行").toBeGreaterThan(0);
    expect(economy, "經濟未發展").toBeGreaterThan(0);
    expect(wars, "有優勢仍未進攻").toBeGreaterThan(0);
  });
});
describe("武將連續操作", () => {
  it("成功後選下一將，仍可行動的手選武將保持不變", () => {
    const s = newGame("liu");
    const roster = s.officers.filter((o) => o.cityId === "chengdu");
    expect(nextAvailableOfficer(roster, "liu-4")).toBe("liu-4");
    const r = dispatch(s, order("patrol"));
    const available = r.state.officers.filter((o) => o.cityId === "chengdu");
    expect(nextAvailableOfficer(available, "liu-0")).toBe("liu-4");
    expect(nextAvailableOfficer(available, "liu-4")).toBe("liu-4");
    expect(actionFeedback(s, r.state, order("patrol"))).toContain("治安");
  });
  it("全部已行動、換城、調動離城不留下失效 ID", () => {
    const s = newGame("liu"),
      roster = s.officers.filter((o) => o.cityId === "chengdu");
    expect(
      nextAvailableOfficer(
        roster.map((o) => ({ ...o, acted: true })),
        "liu-0",
      ),
    ).toBe("");
    expect(nextAvailableOfficer([], "liu-0")).toBe("");
    expect(
      nextAvailableOfficer(
        s.officers.filter((o) => o.cityId === "xiangyang"),
        "liu-0",
      ),
    ).toBe("liu-1");
    const r = dispatch(s, {
      type: "transfer",
      cityId: "hanzhong",
      officerId: "liu-3",
      targetId: "xiangyang",
      troops: 1000,
    });
    expect(r.ok).toBe(true);
    expect(
      nextAvailableOfficer(
        r.state.officers.filter((o) => o.cityId === "hanzhong"),
        "liu-3",
      ),
    ).toBe("liu-5");
  });
});
describe("V0.1.0 原始存檔相容", () => {
  it("不遷移、不重置，完整保持日期、世界、事件、戰報與 seed", () => {
    const s = deserialize(JSON.stringify(legacy));
    expect(SAVE_KEY).toBe("hanmo-strategy-save-v1");
    expect(s.version).toBe(1);
    expect(s).toEqual(legacy);
    expect(s.battles.length).toBeGreaterThan(0);
    expect(s.turn).toBeGreaterThan(0);
    expect(deserialize(serialize(s))).toEqual(legacy);
  });
  it("舊檔可以直接巡察修築並再次存檔", () => {
    for (const type of commands) {
      const s = deserialize(JSON.stringify(legacy)),
        r = dispatch(s, order(type));
      expect(r.ok).toBe(true);
      expect(deserialize(serialize(r.state))).toEqual(r.state);
      expect(r.state.year).toBe(s.year);
      expect(r.state.seed).toBe(s.seed);
      expect(r.state.battles).toEqual(s.battles);
    }
  });
});
