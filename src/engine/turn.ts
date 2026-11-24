import {
  startMonthResolution,
  advanceMonthResolution,
} from "./resolution/month";
import type { GameState } from "./types";
import { runAI } from "./ai";
import { executeDelegatedCities } from "./delegation/execute";
import { finishEconomy } from "./monthEconomy";
export function endMonth(state: GameState): GameState {
  if (state.version === 3)
    return advanceMonthResolution(startMonthResolution(state), 500);
  if (state.status !== "playing" || state.pendingBattle) return state;
  let s = executeDelegatedCities(structuredClone(state));
  for (const f of s.factions)
    if (f.id !== s.playerId && f.active) s = runAI(s, f.id);
  return finishEconomy(s);
}
