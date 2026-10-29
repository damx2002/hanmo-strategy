import { dispatch } from "../../engine/actions";
import { endMonth } from "../../engine/turn";
import { advanceMonthResolution } from "../../engine/resolution/month";
import { resolvePendingDefense } from "../../engine/resolution/defense";
import { estimate, defenderFor } from "../../engine/combat";
import { attackProhibition } from "../../engine/diplomacy";
import { isGameState } from "../../engine/save";
import { B } from "../../engine/balance";
import type { Action, Domestic, GameState } from "../../engine/types";

// Player policy for a real 41-city campaign: no ownership edits, grants or RNG retries.
export function playWorldCampaign(
  initial: GameState,
  maxMonths = 360,
  progress?: (s: GameState) => void,
) {
  let s = initial,
    orders = 0,
    invasions = 0,
    captures = 0;
  function command(a: Action) {
    const r = dispatch(s, a);
    if (!r.ok) throw Error(r.error);
    if (a.type === "attack" && r.state.battles[0].won) captures++;
    s = r.state;
    orders++;
  }
  const ready = (id: string) =>
    s.officers
      .filter(
        (o) =>
          o.cityId === id &&
          o.factionId === s.playerId &&
          !o.acted &&
          !o.retired,
      )
      .sort((a, b) => b.leadership - a.leadership);
  function route(from: string) {
    const q = [[from]],
      seen = new Set([from]);
    for (const p of q) {
      const c = s.cities.find((c) => c.id === p.at(-1))!;
      if (
        p.length > 1 &&
        c.neighbors.some(
          (id) => s.cities.find((t) => t.id === id)!.ownerId !== s.playerId,
        )
      )
        return p;
      for (const id of c.neighbors)
        if (
          !seen.has(id) &&
          s.cities.some((c) => c.id === id && c.ownerId === s.playerId)
        ) {
          seen.add(id);
          q.push([...p, id]);
        }
    }
    return [];
  }
  for (let month = 0; month < maxMonths && s.status === "playing"; month++) {
    const owned = s.cities
      .filter((c) => c.ownerId === s.playerId)
      .map((c) => c.id);
    // Attack before spending local commanders on development; ordinary automatic combat.
    for (const id of owned) {
      if (s.status !== "playing") break;
      const c = s.cities.find((c) => c.id === id)!,
        o = ready(id)[0];
      if (!o || !c.actions) continue;
      const sent = c.troops - 5000;
      const target = s.cities
        .filter(
          (t) =>
            c.neighbors.includes(t.id) &&
            t.ownerId !== s.playerId &&
            !attackProhibition(s, s.playerId, t.ownerId),
        )
        .sort((a, b) => a.troops - b.troops)
        .find((t) => {
          const p = estimate(c, t, o, defenderFor(s.officers, t), sent);
          return p.attack > p.defense * 1.22;
        });
      if (target && sent > 2000 && c.food >= Math.ceil(sent * B.foodPerTroop))
        command({
          type: "attack",
          cityId: id,
          targetId: target.id,
          officerId: o.id,
          troops: sent,
        });
    }
    if (s.status !== "playing") break;
    for (const id of owned) {
      for (let step = 0; step < 3; step++) {
        const c = s.cities.find((c) => c.id === id)!;
        if (c.ownerId !== s.playerId || !c.actions) break;
        const officers = ready(id);
        if (!officers.length) break;
        const enemies = s.cities.filter(
            (t) => c.neighbors.includes(t.id) && t.ownerId !== s.playerId,
          ),
          front = enemies.length > 0;
        if (
          !front &&
          officers.length === 1 &&
          (c.troops > 9000 || c.food > 20000)
        )
          break;
        const wanted = front
          ? Math.max(
              22000,
              ...enemies.map((t) => Math.min(65000, t.troops * 2.2)),
            )
          : 11000;
        const type: Domestic | undefined =
          c.agriculture < 90
            ? "farm"
            : c.training < 85
              ? "train"
              : c.security < 60
                ? "patrol"
                : c.troops < wanted && c.food > 7000
                  ? "recruit"
                  : c.commerce < 100
                    ? "trade"
                    : c.agriculture < 100
                      ? "farm"
                      : front && c.defense < 75
                        ? "repair"
                        : undefined;
        if (!type || c.gold < B.costs[type]) break;
        command({ type, cityId: id, officerId: officers.at(-1)!.id });
      }
    }
    // Supply through the actual adjacency graph, leaving a local garrison and staff.
    for (const id of owned) {
      if (s.status !== "playing") break;
      const c = s.cities.find((c) => c.id === id)!,
        officers = ready(id);
      if (
        !c.actions ||
        !officers.length ||
        c.neighbors.some(
          (n) => s.cities.find((t) => t.id === n)!.ownerId !== s.playerId,
        )
      )
        continue;
      const p = route(id);
      if (p.length < 2) continue;
      const troops = Math.max(0, c.troops - 3000),
        food = Math.floor(Math.max(0, c.food - 10000) * 0.75);
      if (!troops && !food) continue;
      command({
        type: "transfer",
        cityId: id,
        targetId: p[1],
        officerId: officers[0].id,
        troops,
        food,
      });
    }
    s = endMonth(s);
    for (let steps = 0; s.monthResolution && s.status === "playing"; steps++) {
      if (steps > 1000) throw Error("月結未能在上限內完成");
      if (s.pendingDefense) {
        invasions++;
        const r = resolvePendingDefense(s, s.pendingDefense.id, "auto");
        if (!r.ok) throw Error(r.error);
        s = r.state;
      } else s = advanceMonthResolution(s, 100);
    }
    if (!isGameState(s)) throw Error("戰役產生非法狀態");
    if (month % 12 === 0) progress?.(s);
  }
  return { state: s, orders, invasions, captures };
}
