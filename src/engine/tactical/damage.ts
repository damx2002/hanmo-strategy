import { live } from "./control";
import type { TacticalState, Unit, TroopType } from "./types";
import { T } from "./tacticalBalance";
import { distance } from "./movement";
export const matchupMultiplier = (attacker: TroopType, target: TroopType) =>
  T.matchup[attacker][target];
export const matchupRelation = (multiplier: number) =>
  multiplier > 1
    ? ("advantage" as const)
    : multiplier < 1
      ? ("disadvantage" as const)
      : ("neutral" as const);
export const relationNames = {
  advantage: "兵種優勢",
  disadvantage: "兵種劣勢",
  neutral: "兵種中立",
};
export function inRange(b: TacticalState, u: Unit, v: Unit) {
  const d = distance(u, v);
  return u.type === "archer"
    ? d >= 2 && d <= (b.map[u.y][u.x] === "hill" ? 3 : 2)
    : d === 1;
}
export function canAttack(b: TacticalState, u: Unit, v: Unit) {
  return (
    live(u) && live(v) && u.side !== v.side && !u.attacked && inRange(b, u, v)
  );
}
export function estimateDamage(
  b: TacticalState,
  u: Unit,
  v: Unit,
  variation = 1,
  efficiency = 1,
) {
  if (!live(u) || !live(v)) return 0;
  const general = b.commanders.find((o) => o.id === u.commanderId),
    guard = b.commanders.find((o) => o.id === v.commanderId);
  const at =
    u.troops *
    T.damageScale *
    T.attack[u.type] *
    (general?.traits?.includes("猛將") ? T.traitAttack : 1) *
    (T.moraleBase + (u.morale ?? 100) * T.moraleScale) *
    (1 +
      (general?.leadership ?? T.basicAbility) * T.leadership +
      (general?.strength ?? T.basicAbility) * T.strength) *
    (1 + b.training[u.side] * T.training);
  let de =
    T.defense[v.type] *
    (guard?.traits?.includes("統御") ? T.traitDefense : 1) *
    T.terrain[b.map[v.y][v.x]] *
    (1 + (guard?.leadership ?? T.basicAbility) * T.leadership);
  if (v.side === "defender" && ["city", "gate"].includes(b.map[v.y][v.x]))
    de *= 1 + b.defense * T.cityDefense;
  if (v.effects.includes("guarded")) de *= T.guard;
  const charge =
    u.type === "cavalry" && u.moved && b.map[u.y][u.x] === "plain"
      ? T.charge
      : 1;
  const shot =
    u.type === "archer" && b.map[u.y][u.x] === "hill" ? T.hillShot : 1;
  const matchup = matchupMultiplier(u.type, v.type);
  const raw = (at * charge * shot * variation * matchup * efficiency) / de;
  // No fixed casualty ceiling: larger force ratios approach complete destruction,
  // while equal armies, fortifications and terrain retain tactical depth.
  const loss = (v.troops * raw) / (v.troops + T.saturation * raw);
  return Math.min(v.troops, Math.max(1, Math.round(loss)));
}
// Passive contact only; archers use weak close defense rather than their ranged shot.
export function canRetaliate(u: Unit, v: Unit) {
  return live(u) && live(v) && u.side !== v.side && distance(u, v) === 1;
}
export function estimateRetaliation(
  b: TacticalState,
  defender: Unit,
  attacker: Unit,
  variation = 1,
) {
  if (!canRetaliate(defender, attacker)) return 0;
  return estimateDamage(
    b,
    { ...defender, moved: false },
    attacker,
    variation,
    T.retaliation[defender.type],
  );
}
export function estimateExchange(
  b: TacticalState,
  u: Unit,
  v: Unit,
  variation = 1,
) {
  const damage = estimateDamage(b, u, v, variation);
  const retaliation = estimateRetaliation(
    b,
    afterDamage(v, damage),
    u,
    variation,
  );
  return { damage, retaliation };
}
export function fireReason(b: TacticalState, u: Unit, v?: Unit): string {
  if (!live(u) || u.attacked) return "部隊已行動或已潰滅";
  if (
    (b.commanders.find((o) => o.id === u.commanderId)?.intelligence ??
      T.basicAbility) < T.fireIntelligence
  )
    return `主將智力須達 ${T.fireIntelligence}`;
  if (b.fireUsed[u.side] >= T.fireLimit) return "本軍本戰火計次數已用盡";
  if (v && (!live(v) || v.side === u.side || distance(u, v) > T.fireRange))
    return "目標不在火計三格範圍內";
  if (
    !v &&
    !b.units.some(
      (v) => live(v) && v.side !== u.side && distance(u, v) <= T.fireRange,
    )
  )
    return "三格內沒有敵軍";
  return "";
}
export function fireChance(b: TacticalState, u: Unit, v: Unit) {
  const intelligence =
    b.commanders.find((o) => o.id === u.commanderId)?.intelligence ??
    T.basicAbility;
  return Math.min(
    T.fireMaxChance,
    T.fireBase +
      (b.commanders
        .find((o) => o.id === u.commanderId)
        ?.traits?.includes("軍師")
        ? T.traitFire
        : 0) +
      intelligence * T.fireIntelligenceScale +
      (b.map[v.y][v.x] === "forest" ? T.fireForest : 0),
  );
}

export function damagePreview(b: TacticalState, u: Unit, v: Unit) {
  const multiplier = matchupMultiplier(u.type, v.type);
  return {
    min: estimateDamage(b, u, v, T.randomMin),
    max: estimateDamage(b, u, v, T.randomMin + T.randomRange),
    counterMin: estimateRetaliation(
      b,
      afterDamage(v, estimateDamage(b, u, v, T.randomMin + T.randomRange)),
      u,
      T.randomMin,
    ),
    counterMax: estimateRetaliation(
      b,
      afterDamage(v, estimateDamage(b, u, v, T.randomMin)),
      u,
      T.randomMin + T.randomRange,
    ),
    multiplier,
    relation: matchupRelation(multiplier),
  };
}

export function afterDamage(u: Unit, loss: number): Unit {
  const n = { ...u, troops: Math.max(0, u.troops - loss) };
  if (n.morale !== undefined && loss > 0) {
    n.morale = Math.max(
      0,
      n.morale -
        T.moraleShock -
        Math.ceil((loss / n.maxTroops) * T.moraleLossScale),
    );
    n.routed = n.troops > 0 && n.morale <= T.routThreshold;
  }
  return n;
}
