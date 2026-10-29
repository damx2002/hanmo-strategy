import type { GameState } from "../types";
import type { DelegatedCity, DelegationReport } from "./types";
import { dispatch } from "../actions";
import { planDelegatedAction } from "./planner";
import { summarizeDelegation } from "./summary";
import { getPolicy } from "./policy";
import { D } from "./balance";
export function executeDelegatedCities(state: GameState): GameState {
  if (
    state.pendingBattle ||
    state.pendingDefense ||
    (state.monthResolution != null &&
      state.monthResolution.stage !== "delegation") ||
    state.status !== "playing" ||
    !state.factions.some((f) => f.id === state.playerId && f.active) ||
    state.delegation?.processedTurn === state.turn
  )
    return state;
  const ids = state.cities
    .filter(
      (c) =>
        c.ownerId === state.playerId && getPolicy(state, c.id) !== "manual",
    )
    .map((c) => c.id);
  if (!ids.length) return state;
  let s = structuredClone(state);
  const report: DelegationReport = {
    turn: s.turn,
    year: s.year,
    month: s.month,
    cities: [],
    eventLines: [],
  };
  for (const id of ids) {
    const policy = getPolicy(s, id);
    if (policy === "manual") continue;
    const result: DelegatedCity = {
      cityId: id,
      name: s.cities.find((c) => c.id === id)!.name,
      policy,
      actions: [],
      gold: 0,
      food: 0,
      reason: "本月指令已用盡",
    };
    for (let step = 0; step < D.maxOrders; step++) {
      const plan = planDelegatedAction(s, id, policy);
      if (!plan.action) {
        result.reason = plan.reason;
        break;
      }
      const next = dispatch(s, plan.action);
      if (!next.ok) {
        result.reason = "指令驗證失敗";
        break;
      }
      const line = summarizeDelegation(s, next.state, plan.action);
      result.actions.push(line);
      result.gold += line.gold;
      result.food += line.food;
      report.eventLines.push(next.state.events[0]);
      s = next.state;
    }
    report.cities.push(result);
  }
  s.delegation = {
    policies: { ...s.delegation?.policies },
    processedTurn: state.turn,
    report,
  };
  return s;
}
