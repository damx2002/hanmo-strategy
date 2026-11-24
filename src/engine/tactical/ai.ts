import { live } from "./control";
import type { TacticalState, Side } from "./types";
import { tacticalDispatch } from "./actions";
import {
  canAttack,
  estimateDamage,
  estimateExchange,
  fireReason,
  fireChance,
} from "./damage";
import { reachable, distance } from "./movement";
import { T } from "./tacticalBalance";
export function runTacticalPhase(
  battle: TacticalState,
  side: Side = "defender",
): TacticalState {
  if (battle.status !== "active" || battle.phase !== side) return battle;
  let b = battle;
  const value = (
    unit: TacticalState["units"][number],
    target: TacticalState["units"][number],
  ) => {
    const e = estimateExchange(b, unit, target);
    return e.damage - e.retaliation * T.aiCounterRisk;
  };
  const ids = b.units
    .filter((u) => u.side === side && live(u))
    .map((u) => u.id);
  for (const id of ids) {
    if (b.status !== "active") break;
    let u = b.units.find((u) => u.id === id)!;
    if (!live(u) || u.attacked) continue;
    const candidates = [{ x: u.x, y: u.y, cost: 0 }, ...reachable(b, u)];
    const foes = b.units.filter((v) => v.side !== side && live(v));
    function score(p: { x: number; y: number }) {
      const candidate = {
          ...u,
          ...p,
          moved: u.moved || p.x !== u.x || p.y !== u.y,
        },
        type = b.map[p.y][p.x];
      const attack = Math.max(
        0,
        ...foes
          .filter((v) => canAttack(b, candidate, v))
          .map((v) => value(candidate, v) * T.aiDamage),
      );
      const closest = Math.min(...foes.map((v) => distance(p, v)));
      const range =
        u.type === "archer" && closest >= 2 && closest <= 3 ? T.aiRange : 0;
      const terrain = (T.terrain[type] - 1) * T.aiTerrain;
      const danger = foes
        .filter((v) => canAttack(b, v, candidate))
        .reduce((n, v) => n + estimateDamage(b, v, candidate) * T.aiDanger, 0);
      const gate =
        side === "attacker" &&
        b.gate.hp > 0 &&
        distance(p, b.gate) === 1 &&
        u.type !== "archer"
          ? T.aiGate
          : 0;
      const keep =
        side === "defender"
          ? p.x >= 6
            ? T.aiKeep
            : 0
          : b.gate.hp === 0
            ? (T.width - distance(p, { x: 7, y: 2 })) * T.aiKeep
            : 0;
      const cavalry =
        u.type === "cavalry" && type === "plain" ? T.aiTerrain / 2 : 0;
      return (
        attack +
        range +
        terrain +
        gate +
        keep +
        cavalry -
        closest * T.aiDistance -
        danger
      );
    }
    candidates.sort((a, c) => score(c) - score(a) || a.cost - c.cost);
    const p = candidates[0];
    if (p.x !== u.x || p.y !== u.y) {
      const r = tacticalDispatch(
        b,
        { type: "move", unitId: id, x: p.x, y: p.y },
        side,
      );
      if (r.ok) b = r.battle;
    }
    u = b.units.find((u) => u.id === id)!;
    const targets = b.units.filter((v) => v.side !== side && live(v));
    const fire = targets
      .filter((v) => !fireReason(b, u, v))
      .sort(
        (a, c) =>
          fireChance(b, u, c) * c.troops - fireChance(b, u, a) * a.troops,
      )[0];
    const target = targets
      .filter((v) => canAttack(b, u, v))
      .sort((a, c) => value(u, c) - value(u, a))[0];
    const action =
      fire &&
      (!target ||
        fireChance(b, u, fire) * fire.troops * T.fireLoss > value(u, target))
        ? { type: "fire" as const, unitId: id, targetId: fire.id }
        : target
          ? { type: "attack" as const, unitId: id, targetId: target.id }
          : side === "attacker" &&
              b.gate.hp > 0 &&
              u.type !== "archer" &&
              distance(u, b.gate) === 1
            ? { type: "gate" as const, unitId: id }
            : { type: "wait" as const, unitId: id };
    const r = tacticalDispatch(b, action, side);
    if (r.ok) b = r.battle;
  }
  if (b.status === "active") {
    const r = tacticalDispatch(b, { type: "endPhase" }, side);
    if (r.ok) b = r.battle;
  }
  return b;
}
