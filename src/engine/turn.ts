import type { GameState } from "./types";
import { runAI } from "./ai";
import { settleCity } from "./economy";
import { checkResult, event } from "./game";
export function endMonth(state: GameState): GameState {
  if (state.status !== "playing") return state;
  let s = structuredClone(state);
  for (const f of s.factions)
    if (f.id !== s.playerId && f.active) s = runAI(s, f.id);
  s.cities = s.cities.map((c) => {
    const r = settleCity(c);
    if (r.deserters)
      event(
        s,
        `${c.name}缺糧，${r.deserters.toLocaleString("zh-TW")}名士兵逃散。`,
      );
    return r.city;
  });
  s.officers.forEach((o) => {
    o.acted = false;
  });
  s.turn++;
  s.month++;
  if (s.month > 12) {
    s.year++;
    s.month = 1;
  }
  event(
    s,
    "月結完成：商稅入庫、糧食入倉、軍糧支出已結算。各城指令與武將行動重置。",
  );
  return checkResult(s);
}
