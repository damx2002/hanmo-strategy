import { attackProhibition } from "./diplomacy";
import type { Action, FactionId, GameState } from "./types";
import { B } from "./balance";
import { dispatch } from "./actions";
import { defenderFor, estimate } from "./combat";
export function runAI(state: GameState, actor: FactionId): GameState {
  let s = state,
    attacked = false;
  // Snapshot IDs and a fixed iteration cap prevent captured cities and transfers causing loops.
  for (const id of state.cities
    .filter((c) => c.ownerId === actor)
    .map((c) => c.id)) {
    let governed = false;
    for (let step = 0; step < B.actions; step++) {
      const c = s.cities.find((c) => c.id === id)!;
      if (c.ownerId !== actor || c.actions <= 0 || s.status !== "playing")
        break;
      const o = s.officers
        .filter((o) => o.cityId === id && o.factionId === actor && !o.acted)
        .sort((a, b) => b.leadership - a.leadership)[0];
      if (!o) break;
      const neighbors = s.cities.filter((t) => c.neighbors.includes(t.id));
      const enemies = neighbors.filter(
        (t) => t.ownerId !== actor && !attackProhibition(s, actor, t.ownerId),
      );
      let action: Action | undefined;
      const sent = Math.min(
        c.troops - B.guard,
        Math.floor(c.troops * B.aiSendRatio),
      );
      const enemy = enemies
        .sort((a, b) => a.troops - b.troops)
        .find((t) => {
          const p = estimate(c, t, o, defenderFor(s.officers, t), sent);
          return p.attack > p.defense * B.aiMargin;
        });
      if (
        !attacked &&
        enemy &&
        sent > B.guard &&
        c.food > sent * B.foodPerTroop + B.aiReserveFood
      )
        action = {
          type: "attack",
          cityId: id,
          officerId: o.id,
          targetId: enemy.id,
          troops: sent,
        };
      else if (!enemies.length) {
        const front = neighbors
          .filter(
            (t) =>
              t.ownerId === actor &&
              t.neighbors.some(
                (n) => s.cities.find((x) => x.id === n)!.ownerId !== actor,
              ),
          )
          .sort((a, b) => a.troops - b.troops)[0];
        const stationed = s.officers.filter(
          (x) => x.cityId === id && x.factionId === actor,
        ).length;
        if (front && (stationed > 1 || c.troops > B.aiTroops * 2))
          action = {
            type: "transfer",
            cityId: id,
            officerId: o.id,
            targetId: front.id,
            troops: Math.max(0, Math.floor((c.troops - B.guard) / 2)),
            food: Math.floor(c.food / 3),
          };
      }
      if (!action) {
        const type =
          c.food < B.aiReserveFood && c.agriculture < 100
            ? "farm"
            : c.gold < B.aiGold && c.commerce < 100
              ? "trade"
              : c.troops < B.aiTroops
                ? "recruit"
                : c.training < B.aiTraining
                  ? "train"
                  : !governed && c.security < B.aiSecurity
                    ? "patrol"
                    : !governed && enemies.length > 0 && c.defense < B.aiDefense
                      ? "repair"
                      : c.agriculture < 85
                        ? "farm"
                        : c.commerce < 100
                          ? "trade"
                          : c.troops < B.aiTroops * 2
                            ? "recruit"
                            : undefined;
        if (!type) break;
        action = { type, cityId: id, officerId: o.id };
      }
      // Governance must leave a reserve and never block a cheaper useful action.
      if (
        (action.type === "patrol" || action.type === "repair") &&
        c.gold < B.aiGold + B.costs[action.type]
      ) {
        const fallback =
          c.commerce < B.maxStat
            ? "trade"
            : c.agriculture < B.maxStat
              ? "farm"
              : undefined;
        if (!fallback) break;
        action = { type: fallback, cityId: id, officerId: o.id };
      }
      const result = dispatch(s, action, actor);
      if (!result.ok) break;
      s = result.state;
      if (action.type === "attack") attacked = true;
      if (action.type === "patrol" || action.type === "repair") governed = true;
    }
  }
  return s;
}
