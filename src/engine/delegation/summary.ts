import type { GameState, Domestic } from "../types";
import { domesticFields } from "../domestic";
import type { DelegatedAction } from "./types";
export const fieldNames = {
  farm: "農業",
  trade: "商業",
  recruit: "兵力",
  train: "訓練",
  patrol: "治安",
  repair: "城防",
};
export function summarizeDelegation(
  before: GameState,
  after: GameState,
  action: { type: Domestic; cityId: string; officerId: string },
): DelegatedAction {
  const c = before.cities.find((c) => c.id === action.cityId)!;
  const n = after.cities.find((c) => c.id === action.cityId)!;
  const officer = before.officers.find((o) => o.id === action.officerId)!;
  const field = domesticFields[action.type];
  return {
    type: action.type,
    officerId: officer.id,
    officerName: officer.name,
    before: c[field],
    after: n[field],
    gold: c.gold - n.gold,
    food: c.food - n.food,
  };
}
