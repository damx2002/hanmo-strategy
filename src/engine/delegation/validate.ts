import type { GameState } from "../types";
import { B } from "../balance";
import { isPolicy } from "./policy";
import { domesticFields } from "../domestic";
import { D } from "./balance";
const record = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" &&
  x !== null &&
  !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const int = (x: unknown, min: number = 0, max: number = B.maxResource) =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= min && x <= max;
const reasons = [
  "待命武將不足",
  "本月指令已用盡",
  "資源保留",
  "內政已達目標",
  "指令驗證失敗",
];
export function validDelegation(value: unknown, s: GameState): boolean {
  if (value === undefined) return true;
  if (
    !record(value) ||
    !Object.keys(value).every((k) =>
      ["policies", "processedTurn", "report"].includes(k),
    ) ||
    !record(value.policies)
  )
    return false;
  if (
    !Object.entries(value.policies).every(
      ([id, policy]) =>
        isPolicy(policy) &&
        policy !== "manual" &&
        s.cities.some((c) => c.id === id && c.ownerId === s.playerId),
    )
  )
    return false;
  if (value.processedTurn === undefined && value.report === undefined)
    return true;
  const r = value.report;
  if (
    !int(value.processedTurn, 0, s.turn) ||
    !record(r) ||
    r.turn !== value.processedTurn ||
    !int(r.year, 214, s.year) ||
    !int(r.month, 1, 12) ||
    (r.year === s.year && Number(r.month) > s.month) ||
    !Array.isArray(r.cities) ||
    r.cities.length > s.cities.length ||
    !Array.isArray(r.eventLines)
  )
    return false;
  const cityIds = new Set(),
    officerIds = new Set();
  let actions = 0;
  for (const c of r.cities) {
    if (
      !record(c) ||
      !s.cities.some((x) => x.id === c.cityId && x.name === c.name) ||
      cityIds.has(c.cityId) ||
      !isPolicy(c.policy) ||
      c.policy === "manual" ||
      !Array.isArray(c.actions) ||
      c.actions.length > D.maxOrders ||
      !reasons.includes(String(c.reason))
    )
      return false;
    cityIds.add(c.cityId);
    let gold = 0,
      food = 0;
    for (const a of c.actions) {
      if (
        !record(a) ||
        typeof a.type !== "string" ||
        !Object.hasOwn(domesticFields, a.type) ||
        officerIds.has(a.officerId) ||
        !s.officers.some(
          (o) => o.id === a.officerId && o.name === a.officerName,
        )
      )
        return false;
      const type = a.type as keyof typeof domesticFields;
      const max = type === "recruit" ? B.maxResource : B.maxStat;
      if (
        !int(a.before, 0, max) ||
        !int(a.after, 1, max) ||
        Number(a.after) <= Number(a.before) ||
        a.gold !== B.costs[type] ||
        a.food !== (type === "recruit" ? B.recruitFood : 0)
      )
        return false;
      officerIds.add(a.officerId);
      gold += Number(a.gold);
      food += Number(a.food);
      actions++;
    }
    if (c.gold !== gold || c.food !== food) return false;
  }
  if (
    r.eventLines.length !== actions ||
    !r.eventLines.every((e) => typeof e === "string" && e.length <= 500)
  )
    return false;
  if (r.economy !== undefined) {
    if (!Array.isArray(r.economy) || r.economy.length > s.cities.length)
      return false;
    const seen = new Set();
    for (const e of r.economy) {
      if (
        !record(e) ||
        !s.cities.some((c) => c.id === e.cityId && c.name === e.name) ||
        seen.has(e.cityId) ||
        ![e.gold, e.food, e.upkeep, e.deserters].every((n) => int(n)) ||
        !int(e.netFood, -B.maxResource, B.maxResource)
      )
        return false;
      seen.add(e.cityId);
    }
  }
  return true;
}
