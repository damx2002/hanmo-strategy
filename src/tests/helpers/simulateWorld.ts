import type { GameState, Action } from "../../engine/types";
import type { PersonnelAction } from "../../engine/personnel";
import type { DiplomaticAction } from "../../engine/diplomacy";
import { planAI } from "../../engine/aiPlan";
import { dispatch } from "../../engine/actions";
import { personnelDispatch } from "../../engine/personnel";
import { diplomacyDispatch } from "../../engine/diplomacy";
import { endMonth } from "../../engine/turn";
import { advanceMonthResolution } from "../../engine/resolution/month";
import { resolvePendingDefense } from "../../engine/resolution/defense";
import { deserialize, serialize, isGameState } from "../../engine/save";
export function simulateWorld(initial: GameState, months = 120) {
  let s = initial,
    attacks = 0,
    captures = 0,
    invaders = 0,
    emptyFood = 0,
    hires = 0;
  const attackingFactions = new Set<string>();
  for (let m = 0; m < months && s.status === "playing"; m++) {
    const previous = s,
      actor = s.playerId;
    let attacked = false,
      diplomacy = false;
    for (const id of s.cities
      .filter((c) => c.ownerId === actor)
      .map((c) => c.id)) {
      let governed = false;
      for (let step = 0; step < 3; step++) {
        const a = planAI(s, actor, id, attacked, governed, diplomacy);
        if (!a) break;
        let r;
        if (["search", "hire", "reward", "appoint"].includes(a.type)) {
          governed = true;
          r = personnelDispatch(s, a as PersonnelAction);
        } else if (["gift", "alliance", "truce", "break"].includes(a.type)) {
          diplomacy = true;
          r = diplomacyDispatch(s, a as DiplomaticAction);
        } else {
          if (a.type === "attack") attacked = true;
          r = dispatch(s, a as Action);
        }
        if (!r.ok) throw Error(r.error);
        s = r.state;
        if (s.status !== "playing") break;
      }
      if (s.status !== "playing") break;
    }
    s = endMonth(s);
    for (let steps = 0; s.monthResolution && s.status === "playing"; steps++) {
      if (steps > 1000) throw Error("AI回合超時");
      if (s.pendingDefense) {
        invaders++;
        const r = resolvePendingDefense(s, s.pendingDefense.id, "auto");
        if (!r.ok) throw Error(r.error);
        s = r.state;
      } else s = advanceMonthResolution(s, 100);
    }
    const reports = s.battles.filter(
      (b) =>
        !previous.battles.some(
          (old) => old.id === b.id && old.from === b.from && old.to === b.to,
        ),
    );
    attacks += reports.length;
    for (const b of reports) attackingFactions.add(b.attacker);
    captures += s.cities.filter(
      (c, i) => c.ownerId !== previous.cities[i].ownerId,
    ).length;
    hires += s.officers.filter(
      (o, i) => !previous.officers[i].factionId && !!o.factionId,
    ).length;
    emptyFood += s.cities.filter((c) => c.food === 0).length;
    if (!isGameState(s)) throw Error("非法AI狀態");
    // Exercise real save validation repeatedly, including changing allegiances.
    if (m % 12 === 0) s = deserialize(serialize(s));
  }
  return {
    state: s,
    attacks,
    captures,
    invaders,
    emptyFood,
    hires,
    attackingFactions: [...attackingFactions].sort(),
  };
}
