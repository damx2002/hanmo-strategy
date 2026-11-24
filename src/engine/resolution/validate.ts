import { B } from "../balance";
import type { GameState } from "../types";
import { validateExpedition } from "../expedition";
const integer = (x: unknown, min: number, max: number) =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= min && x <= max;
export function validResolution(s: GameState): boolean {
  const r = s.monthResolution,
    p = s.pendingDefense;
  if (r == null) return p == null && !s.pendingBattle?.defenseId;
  if (
    !r ||
    typeof r !== "object" ||
    r.turn !== s.turn ||
    !["delegation", "ai", "economy"].includes(r.stage) ||
    !Array.isArray(r.factions) ||
    r.factions.length > s.factions.length ||
    new Set(r.factions).size !== r.factions.length ||
    !r.factions.every(
      (id) => id !== s.playerId && s.factions.some((f) => f.id === id),
    ) ||
    !integer(r.factionIndex, 0, r.factions.length) ||
    !Array.isArray(r.cityIds) ||
    new Set(r.cityIds).size !== r.cityIds.length ||
    !r.cityIds.every((id) => s.cities.some((c) => c.id === id)) ||
    !integer(r.cityIndex, 0, r.cityIds.length) ||
    !integer(r.step, 0, 3) ||
    !integer(r.operations, 0, s.cities.length * s.factions.length * 3) ||
    typeof r.attacked !== "boolean" ||
    typeof r.governed !== "boolean" ||
    (r.diplomacyDone !== undefined && typeof r.diplomacyDone !== "boolean")
  )
    return false;
  if (
    r.eventsBefore !== undefined &&
    (!Array.isArray(r.eventsBefore) ||
      r.eventsBefore.length > B.eventLimit ||
      !r.eventsBefore.every((e) => typeof e === "string"))
  )
    return false;
  if (p != null) {
    if (
      r.stage !== "ai" ||
      !r.attacked ||
      s.pendingBattle ||
      p.attackerId !== r.factions[r.factionIndex] ||
      !p.order ||
      p.order.cityId !== r.cityIds[r.cityIndex] ||
      p.id !==
        `${s.turn}:${p.attackerId}:${p.order.cityId}:${r.step}:${s.seed}` ||
      !Array.isArray(p.reinforcements) ||
      p.reinforcements.length !== 0 ||
      s.cities.find((c) => c.id === p.order.targetId)?.ownerId !== s.playerId
    )
      return false;
    if (
      validateExpedition({ ...s, pendingDefense: null }, p.order, p.attackerId)
    )
      return false;
  }
  if (s.pendingBattle) {
    const b = s.pendingBattle;
    if (
      b.playerSide !== "defender" ||
      r.stage !== "ai" ||
      !r.attacked ||
      b.attackerId !== r.factions[r.factionIndex] ||
      b.sourceId !== r.cityIds[r.cityIndex] ||
      b.defenseId !==
        `${s.turn}:${b.attackerId}:${b.sourceId}:${r.step}:${b.id}`
    )
      return false;
  }
  return true;
}
