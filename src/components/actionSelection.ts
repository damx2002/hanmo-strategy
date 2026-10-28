import type { Action, GameState, Officer } from "../engine/types";
import { actionNames } from "../engine/balance";
import { domesticFields } from "../engine/domestic";
export function nextAvailableOfficer(
  officers: Officer[],
  preferredId: string,
): string {
  return (
    officers.find((o) => o.id === preferredId && !o.acted)?.id ??
    officers.find((o) => !o.acted)?.id ??
    ""
  );
}
const labels = {
  agriculture: "農業",
  commerce: "商業",
  troops: "兵力",
  training: "訓練",
  security: "治安",
  defense: "城防",
};
export function actionFeedback(
  before: GameState,
  after: GameState,
  action: Action,
): string {
  const name = before.officers.find((o) => o.id === action.officerId)!.name;
  if (action.type === "attack" || action.type === "transfer")
    return `${name}完成${actionNames[action.type]}，兵力與位置已更新。`;
  const c = before.cities.find((c) => c.id === action.cityId)!,
    n = after.cities.find((c) => c.id === action.cityId)!;
  const field = domesticFields[action.type];
  return `${name}完成${actionNames[action.type]}，${labels[field]} ${c[field].toLocaleString("zh-TW")} → ${n[field].toLocaleString("zh-TW")}。`;
}
