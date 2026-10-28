import { it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { dispatch } from "../engine/actions";
import { defenderFor, estimate } from "../engine/combat";
import { endMonth } from "../engine/turn";
import { isGameState } from "../engine/save";
import { B } from "../engine/balance";
import type { Action, GameState } from "../engine/types";

// A reproducible player strategy. All changes use ordinary commands; no resource grants.
function playCampaign(initial: GameState) {
  let s = initial;
  function order(a: Action) {
    const r = dispatch(s, a);
    if (!r.ok) throw Error(r.error);
    s = r.state;
  }
  function path(from: string, to: string): string[] {
    const queue = [[from]],
      seen = new Set([from]);
    for (const p of queue) {
      if (p.at(-1) === to) return p;
      for (const id of s.cities.find((c) => c.id === p.at(-1))!.neighbors) {
        if (
          seen.has(id) ||
          s.cities.find((c) => c.id === id)!.ownerId !== s.playerId
        )
          continue;
        seen.add(id);
        queue.push([...p, id]);
      }
    }
    return [];
  }
  for (let month = 0; month < 240 && s.status === "playing"; month++) {
    const ownedIds = s.cities
      .filter((c) => c.ownerId === s.playerId)
      .map((c) => c.id);
    // Develop every city, reserving one commander for movement or attack.
    for (const id of ownedIds) {
      for (let step = 0; step < 3; step++) {
        const c = s.cities.find((c) => c.id === id)!;
        const available = s.officers
          .filter(
            (o) => o.cityId === id && o.factionId === s.playerId && !o.acted,
          )
          .sort((a, b) => b.leadership - a.leadership);
        const border = c.neighbors.some(
          (n) => s.cities.find((t) => t.id === n)!.ownerId !== s.playerId,
        );
        if (!c.actions || !available.length) break;
        const type =
          c.training < 85
            ? "train"
            : c.food < 8000 && c.agriculture < 100
              ? "farm"
              : c.troops < (border ? 26000 : 10000) && c.food > B.recruitFood
                ? "recruit"
                : c.agriculture < 90
                  ? "farm"
                  : c.commerce < 100
                    ? "trade"
                    : undefined;
        if (!type || c.gold < B.costs[type]) break;
        const commander = available[0];
        const canAttack =
          border &&
          c.troops > 18000 &&
          s.cities.some(
            (t) =>
              c.neighbors.includes(t.id) &&
              t.ownerId !== s.playerId &&
              estimate(
                c,
                t,
                commander,
                defenderFor(s.officers, t),
                c.troops - 6500,
              ).attack >
                estimate(
                  c,
                  t,
                  commander,
                  defenderFor(s.officers, t),
                  c.troops - 6500,
                ).defense *
                  1.12,
          );
        if (canAttack && available.length === 1) break;
        if (!border && available.length === 1 && c.troops > 10000) break;
        order({ type, cityId: id, officerId: available.at(-1)!.id });
      }
    }
    for (const id of ownedIds) {
      const c = s.cities.find((c) => c.id === id)!;
      const officer = s.officers
        .filter(
          (o) => o.cityId === id && !o.acted && o.factionId === s.playerId,
        )
        .sort((a, b) => b.leadership - a.leadership)[0];
      if (!officer || !c.actions) continue;
      const sent = c.troops - 6500;
      const target = s.cities
        .filter((t) => c.neighbors.includes(t.id) && t.ownerId !== s.playerId)
        .sort((a, b) => a.troops - b.troops)
        .find((t) => {
          const p = estimate(c, t, officer, defenderFor(s.officers, t), sent);
          return p.attack > p.defense * 1.12;
        });
      if (target && sent > 0 && c.food >= Math.ceil(sent * B.foodPerTroop)) {
        order({
          type: "attack",
          cityId: id,
          officerId: officer.id,
          targetId: target.id,
          troops: sent,
        });
        continue;
      }
      if (
        c.neighbors.every(
          (n) => s.cities.find((t) => t.id === n)!.ownerId === s.playerId,
        ) &&
        c.troops > 10000
      ) {
        const fronts = s.cities
          .filter(
            (t) =>
              t.ownerId === s.playerId &&
              t.neighbors.some(
                (n) => s.cities.find((c) => c.id === n)!.ownerId !== s.playerId,
              ),
          )
          .sort((a, b) => b.troops - a.troops);
        const route = fronts
          .map((t) => path(id, t.id))
          .find((p) => p.length > 1);
        if (route)
          order({
            type: "transfer",
            cityId: id,
            officerId: officer.id,
            targetId: route[1],
            troops: c.troops - 3000,
            food: Math.floor(c.food * 0.6),
          });
      }
    }
    s = endMonth(s);
    expect(isGameState(s)).toBe(true);
  }
  return s;
}
it("劉備從初始劇本以合法指令，經 AI 與月結完成統一", () => {
  const s = playCampaign(newGame("liu", 214019));
  expect(
    s.status,
    `${s.turn} 個月後有 ${s.cities.filter((c) => c.ownerId === "liu").length} 城`,
  ).toBe("won");
  expect(s.cities.every((c) => c.ownerId === "liu")).toBe(true);
  expect(s.battles.some((b) => b.won && b.attacker === "liu")).toBe(true);
});
