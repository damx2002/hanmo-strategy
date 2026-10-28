import type { City, Domestic } from "./types";
import { B } from "./balance";
export const domesticFields = {
  farm: "agriculture",
  trade: "commerce",
  recruit: "troops",
  train: "training",
  patrol: "security",
  repair: "defense",
} as const;
export function domesticReason(city: City, type: Domestic): string {
  if (B.costs[type] === undefined) return "未知指令";
  if (
    city.gold < B.costs[type] ||
    (type === "recruit" && city.food < B.recruitFood)
  )
    return "金錢或兵糧不足";
  if (type !== "recruit" && city[domesticFields[type]] >= B.maxStat)
    return "此項能力已達上限";
  return "";
}
