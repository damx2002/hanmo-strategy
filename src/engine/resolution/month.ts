import type { GameState } from "../types";
import { executeDelegatedCities } from "../delegation/execute";
import { planAI } from "../aiPlan";
import { dispatch } from "../actions";
import { personnelDispatch } from "../personnel";
import { diplomacyDispatch } from "../diplomacy";
import { finishEconomy } from "../monthEconomy";
import { event } from "../game";
export function startMonthResolution(state: GameState): GameState {
  if (
    state.status !== "playing" ||
    state.pendingBattle ||
    state.pendingDefense ||
    state.monthResolution
  )
    return state;
  const s = structuredClone(state);
  s.monthResolution = {
    eventsBefore: [...s.events],
    turn: s.turn,
    stage: "delegation",
    factions: s.factions
      .filter((f) => f.active && f.id !== s.playerId)
      .map((f) => f.id),
    factionIndex: 0,
    cityIds: [],
    cityIndex: 0,
    step: 0,
    attacked: false,
    governed: false,
    operations: 0,
  };
  return s;
}
export function advanceMonthResolution(
  state: GameState,
  limit = 12,
): GameState {
  if (!state.monthResolution || state.pendingBattle || state.pendingDefense)
    return state;
  let s = structuredClone(state);
  for (let k = 0; k < Math.min(500, Math.max(1, limit)); k++) {
    const r = s.monthResolution!;
    if (s.status !== "playing") {
      s.monthResolution = null;
      return s;
    }
    if (r.stage === "delegation") {
      s = executeDelegatedCities(s);
      s.monthResolution!.stage = "ai";
      continue;
    }
    if (r.stage === "economy") {
      s = finishEconomy(s);
      s.monthResolution = null;
      s.pendingDefense = null;
      return s;
    }
    if (r.factionIndex >= r.factions.length) {
      r.stage = "economy";
      continue;
    }
    const actor = r.factions[r.factionIndex];
    if (!r.cityIds.length)
      r.cityIds = s.cities.filter((c) => c.ownerId === actor).map((c) => c.id);
    if (
      !s.factions.some((f) => f.id === actor && f.active) ||
      r.cityIndex >= r.cityIds.length
    ) {
      r.factionIndex++;
      r.cityIds = [];
      r.cityIndex = 0;
      r.step = 0;
      r.attacked = false;
      r.governed = false;
      r.diplomacyDone = false;
      continue;
    }
    const id = r.cityIds[r.cityIndex];
    if (r.step >= 3) {
      r.cityIndex++;
      r.step = 0;
      r.governed = false;
      continue;
    }
    const action = planAI(
      s,
      actor,
      id,
      r.attacked,
      r.governed,
      r.diplomacyDone,
    );
    r.step++;
    r.operations++;
    if (!action) {
      r.cityIndex++;
      r.step = 0;
      r.governed = false;
      continue;
    }
    if (action.type === "attack") {
      r.attacked = true;
      const target = s.cities.find((c) => c.id === action.targetId)!;
      if (target.ownerId === s.playerId) {
        s.pendingDefense = {
          id: `${s.turn}:${actor}:${id}:${r.step}:${s.seed}`,
          order: {
            cityId: id,
            targetId: target.id,
            officerId: action.officerId,
            troops: action.troops,
            ...(action.officerIds ? {officerIds: action.officerIds} : {}),
          },
          attackerId: actor,
          reinforcements: [],
        };
        event(
          s,
          `${s.factions.find((f) => f.id === actor)!.name}軍來襲${target.name}，等待守城軍議。`,
        );
        return s;
      }
    }
    let result;
    if (["search", "hire", "reward", "appoint"].includes(action.type)) {
      r.governed = true;
      result = personnelDispatch(
        s,
        action as import("../personnel").PersonnelAction,
        actor,
      );
    } else if (["gift", "alliance", "truce", "break"].includes(action.type)) {
      r.diplomacyDone = true;
      result = diplomacyDispatch(
        s,
        action as import("../diplomacy").DiplomaticAction,
        actor,
      );
    } else result = dispatch(s, action as import("../types").Action, actor);
    if (result.ok) s = result.state;
  }
  return s;
}
