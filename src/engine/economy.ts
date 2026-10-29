import type { City } from "./types";
import { B, clamp } from "./balance";
export function income(c: City) {
  const scale = 1 + ((c.scale ?? 1) - 1) * 0.15;
  return {
    gold: Math.floor(
      (B.goldBase + c.commerce * B.commerceIncome) *
        (B.securityIncomeBase + c.security * B.securityIncomeScale) * scale,
    ),
    food: Math.floor((B.foodBase + c.agriculture * B.agricultureIncome) * scale),
    upkeep: Math.ceil(c.troops * B.troopUpkeep),
  };
}
export function settleCity(city: City): { city: City; deserters: number } {
  const c = structuredClone(city),
    i = income(c);
  c.gold = clamp(c.gold + i.gold, B.maxResource);
  const available = c.food + i.food;
  const deserters =
    available < i.upkeep ? Math.ceil(c.troops * B.desertion) : 0;
  c.food = clamp(available - i.upkeep, B.maxResource);
  c.troops = clamp(c.troops - deserters, B.maxResource);
  c.actions = B.actions;
  return { city: c, deserters };
}
