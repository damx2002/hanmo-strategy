import type { Domestic, GameState, Officer } from "../types";
import type { ManagedPolicy, StopReason } from "./types";
import { D } from "./balance";
import { B } from "../balance";
import { domesticFields, domesticReason } from "../domestic";
import { income } from "../economy";
import { isBorder } from "./policy";
export function officerFitness(o: Officer, type: Domestic) {
  if (type === "farm" || type === "trade")
    return o.politics * D.politicsWeight + o.intelligence;
  if (type === "recruit") return o.charm * D.charmWeight + o.leadership;
  if (type === "train") return o.leadership * D.leadershipWeight + o.politics;
  if (type === "repair")
    return o.leadership * D.repairLeadership + o.politics * D.repairPolitics;
  return o.politics * D.patrolPolitics + o.charm * D.patrolCharm;
}
export type Plan =
  | { action: { type: Domestic; cityId: string; officerId: string } }
  | { action: null; reason: StopReason };
export function planDelegatedAction(
  s: GameState,
  id: string,
  policy: ManagedPolicy,
): Plan {
  const c = s.cities.find((c) => c.id === id && c.ownerId === s.playerId);
  if (!c || s.pendingBattle || s.status !== "playing")
    return { action: null, reason: "指令驗證失敗" };
  if (c.actions <= 0) return { action: null, reason: "本月指令已用盡" };
  const officers = s.officers.filter(
    (o) => o.cityId === id && o.factionId === s.playerId && !o.acted,
  );
  if (!officers.length) return { action: null, reason: "待命武將不足" };
  if (!Object.hasOwn(D.policies, policy))
    return { action: null, reason: "指令驗證失敗" };
  const p = D.policies[policy];
  if (!p) return { action: null, reason: "指令驗證失敗" };
  const i = income(c),
    projected = c.food + i.food - i.upkeep;
  const foodRisk =
    projected < D.foodReserve + i.upkeep * D.foodMonths || i.food < i.upkeep;
  const foodCritical = projected < D.foodReserve;
  const goldRisk = i.gold < D.lowIncome;
  const area = isBorder(s, c) ? "border" : "rear";
  const targets = {
    farm: foodRisk ? B.maxStat : p.agriculture,
    trade: goldRisk ? B.maxStat : p.commerce,
    recruit: p.troops[area],
    train: p.training,
    patrol: p.security,
    repair: p.defense[area],
  };
  let useful = false;
  const candidates: { type: Domestic; officer: Officer; score: number }[] = [];
  for (const type of Object.keys(targets) as Domestic[]) {
    const target = targets[type],
      value = c[domesticFields[type]];
    if (!p.weights[type] || value >= target) continue;
    useful = true;
    if (domesticReason(c, type) || c.gold - B.costs[type] < D.goldReserve)
      continue;
    if (foodCritical && type !== "farm" && !(type === "trade" && goldRisk))
      continue;
    const officer = [...officers].sort(
      (a, b) =>
        officerFitness(b, type) - officerFitness(a, type) ||
        (a.id < b.id ? -1 : 1),
    )[0];
    if (type === "recruit") {
      const futureTroops = Math.min(
        B.maxResource,
        c.troops + B.recruitBase + officer.charm * B.charmScale,
      );
      const upkeep = Math.ceil(futureTroops * B.troopUpkeep);
      if (
        c.food - B.recruitFood + i.food - upkeep <
          D.foodReserve + upkeep * D.foodMonths ||
        i.food < upkeep
      )
        continue;
    }
    const urgency =
      type === "farm" && foodRisk
        ? D.emergencyFarm
        : type === "trade" && goldRisk
          ? D.emergencyTrade
          : 0;
    candidates.push({
      type,
      officer,
      score: urgency + (p.weights[type] * (target - value)) / target,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const choice = candidates[0];
  return choice
    ? {
        action: { type: choice.type, cityId: id, officerId: choice.officer.id },
      }
    : { action: null, reason: useful ? "資源保留" : "內政已達目標" };
}
