import type { GameState } from "../types";
import type { TacticalState } from "./types";
import { createBattle } from "./createBattle";
import { T } from "./tacticalBalance";
import { inside, distance } from "./movement";
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export function validTactical(
  value: unknown,
  s: GameState,
): value is TacticalState {
  if (!record(value)) return false;
  const b = value as unknown as TacticalState;
  if (
    !int(b.id, 0, 4294967295) ||
    !int(b.seed, 0, 4294967295) ||
    b.seed !== s.seed ||
    !int(b.sent, 1, 9999999) ||
    !int(b.defendersInitial, 0, 9999999) ||
    !int(b.turn, 1, T.maxTurns) ||
    !["attacker", "defender"].includes(b.phase) ||
    !["active", "attackerWon", "defenderWon"].includes(b.status)
  )
    return false;
  const c = s.cities.find((c) => c.id === b.sourceId),
    t = s.cities.find((c) => c.id === b.targetId),
    o = s.officers.find((o) => o.id === b.commanderId);
  if (
    s.status !== "playing" ||
    !c ||
    !t ||
    !o ||
    c.ownerId !== s.playerId ||
    c.ownerId !== b.attackerId ||
    t.ownerId !== b.defenderId ||
    t.ownerId === c.ownerId ||
    !c.neighbors.includes(t.id) ||
    o.cityId !== c.id ||
    o.factionId !== c.ownerId ||
    !o.acted ||
    c.actions >= 3 ||
    t.troops !== b.defendersInitial ||
    c.troops < 500 ||
    c.troops + b.sent > 9999999
  )
    return false;
  if (
    !record(b.gate) ||
    !int(b.gate.hp, 0, 10000) ||
    !record(b.fireUsed) ||
    !int(b.fireUsed.attacker, 0, T.fireLimit) ||
    !int(b.fireUsed.defender, 0, T.fireLimit) ||
    !int(b.occupation, 0, T.occupationTurns)
  )
    return false;
  const expected = createBattle(
    { ...s, seed: b.id },
    { cityId: c.id, targetId: t.id, officerId: o.id, troops: b.sent },
  );
  if (
    b.foodCost !== expected.foodCost ||
    b.defense !== expected.defense ||
    JSON.stringify(b.training) !== JSON.stringify(expected.training) ||
    JSON.stringify(b.commanders) !== JSON.stringify(expected.commanders) ||
    JSON.stringify(b.map) !== JSON.stringify(expected.map) ||
    b.gate.x !== 6 ||
    b.gate.y !== 2 ||
    b.gate.maxHp !== expected.gate.maxHp ||
    b.gate.hp > b.gate.maxHp
  )
    return false;
  if (!Array.isArray(b.units) || b.units.length !== expected.units.length)
    return false;
  const positions = new Set<string>();
  for (const base of expected.units) {
    const matches = b.units.filter((u) => record(u) && u.id === base.id);
    if (matches.length !== 1) return false;
    const u = matches[0];
    if (
      u.side !== base.side ||
      u.type !== base.type ||
      u.commanderId !== base.commanderId ||
      u.maxTroops !== base.maxTroops ||
      !int(u.troops, 0, u.maxTroops) ||
      !inside(u.x, u.y) ||
      typeof u.moved !== "boolean" ||
      typeof u.attacked !== "boolean" ||
      !Array.isArray(u.effects) ||
      u.effects.length > 1 ||
      !u.effects.every((e) => e === "guarded")
    )
      return false;
    if (u.troops > 0) {
      const key = `${u.x},${u.y}`;
      if (positions.has(key)) return false;
      positions.add(key);
      if (u.side === "attacker" && u.x >= 6 && b.gate.hp > 0) return false;
    }
  }
  if (
    !Array.isArray(b.events) ||
    b.events.length > T.maxEvents ||
    !b.events.every((e) => typeof e === "string")
  )
    return false;
  if (
    b.effect !== null &&
    (!record(b.effect) ||
      !["move", "attack", "fire", "gate", "wait"].includes(b.effect.kind) ||
      typeof b.effect.text !== "string" ||
      !b.units.some((u) => u.id === b.effect!.unitId))
  )
    return false;
  const attackers = b.units
      .filter((u) => u.side === "attacker")
      .reduce((n, u) => n + u.troops, 0),
    defenders = b.units
      .filter((u) => u.side === "defender")
      .reduce((n, u) => n + u.troops, 0);
  if (b.status === "active")
    return attackers > 0 && defenders > 0 && b.reason === null;
  if (b.status === "attackerWon")
    return (
      attackers > 0 &&
      ((b.reason === "elimination" && defenders === 0) ||
        (b.reason === "occupation" &&
          b.occupation === T.occupationTurns &&
          b.gate.hp === 0 &&
          b.units.some(
            (u) =>
              u.side === "attacker" && u.troops > 0 && u.x === 7 && u.y === 2,
          ) &&
          !b.units.some(
            (u) =>
              u.side === "defender" &&
              u.troops > 0 &&
              distance(u, { x: 7, y: 2 }) <= 1,
          )))
    );
  return (
    (b.reason === "elimination" && attackers === 0) ||
    b.reason === "retreat" ||
    (b.reason === "limit" && b.turn === T.maxTurns)
  );
}
