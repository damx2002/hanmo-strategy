import type { GameState } from "./types";
import { B } from "./balance";
export function event(s: GameState, text: string) {
  s.events.unshift(`${s.year}年${s.month}月｜${text}`);
  s.events = s.events.slice(0, B.eventLimit);
}
export function checkResult(s: GameState): GameState {
  const next = structuredClone(s);
  next.factions.forEach((f) => {
    f.active = next.cities.some((c) => c.ownerId === f.id);
    if (!f.active)
      next.officers
        .filter((o) => o.factionId === f.id)
        .forEach((o) => {
          o.factionId = null;
          o.cityId = null;
        });
  });
  const n = next.cities.filter((c) => c.ownerId === next.playerId).length;
  next.status = n === 0 ? "lost" : n === next.cities.length ? "won" : "playing";
  return next;
}
