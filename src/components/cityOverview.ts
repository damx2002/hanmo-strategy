import type { City, GameState } from "../engine/types";
import { validateExpedition } from "../engine/expedition";
export function cityReadiness(state: GameState, city: City) {
  const officers = state.officers.filter(
    (o) => o.cityId === city.id && o.factionId === state.playerId,
  );
  const ready = officers.filter((o) => !o.acted);
  const reason =
    city.ownerId !== state.playerId
      ? "此城屬於敵軍"
      : !officers.length
        ? "本城沒有武將"
        : city.actions <= 0
          ? "本月指令已用盡"
          : !ready.length
            ? "全部武將已行動"
            : "可下令";
  return {
    ready: ready.length,
    reason,
    border: city.neighbors.some(
      (id) => state.cities.find((c) => c.id === id)?.ownerId !== city.ownerId,
    ),
  };
}
export function adjacentExpeditions(state: GameState, target: City) {
  return state.cities
    .filter(
      (c) => c.ownerId === state.playerId && target.neighbors.includes(c.id),
    )
    .map((city) => {
      const officer = state.officers.find(
        (o) =>
          o.cityId === city.id && o.factionId === state.playerId && !o.acted,
      );
      const check = validateExpedition(state, {
        cityId: city.id,
        targetId: target.id,
        officerId: officer?.id ?? "",
        troops: 1,
      });
      return { city, reason: check || "可出征" };
    });
}
