import type { CombatFeedback, TacticalState, Unit } from "./types";
import { T, troopNames } from "./tacticalBalance";
import { matchupRelation } from "./damage";
export function recordCombat(
  b: TacticalState,
  u: Unit,
  target: Unit | undefined,
  kind: CombatFeedback["kind"],
  before: number,
  after: number,
  multiplier = 1,
  success = true,
  parentSequence?: number,
) {
  const sequence = (b.feedbackSequence ?? 0) + 1;
  const casualties = before - after,
    relation = matchupRelation(multiplier);
  const source = `${u.side === "attacker" ? "我軍" : "敵軍"}${troopNames[u.type]}`;
  const recipient = target
    ? `${target.side === "attacker" ? "我軍" : "敵軍"}${troopNames[target.type]}`
    : "城門";
  const text =
    kind === "fire"
      ? `${source}對${recipient}火計${success ? "成功" : "失敗"}，造成 ${casualties.toLocaleString("zh-TW")} 傷亡${after === 0 ? "，部隊潰滅" : ""}。`
      : kind === "gate"
        ? `${source}攻擊城門，耐久 −${casualties.toLocaleString("zh-TW")}${after === 0 ? "，城門已破" : ""}。`
        : `${source}${kind === "retaliation" ? "反擊，" : ""}${relation === "advantage" ? "克制" : relation === "disadvantage" ? "逆勢攻擊" : "攻擊"}${recipient}，造成 ${casualties.toLocaleString("zh-TW")} 傷亡${after === 0 ? "，部隊潰滅" : ""}。`;
  const event: CombatFeedback = {
    sequence,
    kind,
    phase: b.phase,
    ...(parentSequence === undefined ? {} : { parentSequence }),
    attackerId: u.id,
    targetId: target?.id ?? null,
    target: target
      ? { x: target.x, y: target.y }
      : { x: b.gate.x, y: b.gate.y },
    casualties,
    before,
    after,
    matchup: multiplier,
    relation,
    success,
    destroyed: after === 0,
    side: u.side,
    turn: b.turn,
    text,
  };
  b.feedbackSequence = sequence;
  b.combatFeedback = [...(b.combatFeedback ?? []), event].slice(
    -T.feedbackLimit,
  );
  return text;
}
// Selection changes only after the current unit is dead or has completed its action.
export function nextTacticalUnit(b: TacticalState, preferred: string): string {
  const current = b.units.find(
    (u) => u.id === preferred && u.side === "attacker" && u.troops > 0,
  );
  if (current && !current.attacked) return current.id;
  return (
    b.units.find((u) => u.side === "attacker" && u.troops > 0 && !u.attacked)
      ?.id ??
    current?.id ??
    ""
  );
}

export function validCombatFeedback(b: TacticalState): boolean {
  if (b.feedbackSequence === undefined && b.combatFeedback === undefined)
    return true;
  if (
    !Number.isSafeInteger(b.feedbackSequence) ||
    b.feedbackSequence! < 0 ||
    b.feedbackSequence! > T.maxTurns * 12 ||
    !Array.isArray(b.combatFeedback) ||
    b.combatFeedback.length > T.feedbackLimit
  )
    return false;
  let sequence = 0;
  for (const f of b.combatFeedback) {
    if (
      !f ||
      typeof f !== "object" ||
      !Number.isSafeInteger(f.sequence) ||
      f.sequence <= sequence ||
      f.sequence > b.feedbackSequence! ||
      !["attack", "fire", "gate", "retaliation"].includes(f.kind)
    )
      return false;
    const source = b.units.find((u) => u.id === f.attackerId),
      target = b.units.find((u) => u.id === f.targetId);
    if (
      !source ||
      source.side !== f.side ||
      !Number.isSafeInteger(f.turn) ||
      f.turn < 1 ||
      f.turn > b.turn ||
      !f.target ||
      !Number.isInteger(f.target.x) ||
      !Number.isInteger(f.target.y) ||
      f.target.x < 0 ||
      f.target.x >= T.width ||
      f.target.y < 0 ||
      f.target.y >= T.height
    )
      return false;
    const limit = f.kind === "gate" ? b.gate.maxHp : target?.maxTroops;
    if (
      limit === undefined ||
      !Number.isSafeInteger(f.before) ||
      f.before < 1 ||
      f.before > limit ||
      !Number.isSafeInteger(f.after) ||
      f.after < 0 ||
      f.after > f.before ||
      f.casualties !== f.before - f.after ||
      f.destroyed !== (f.after === 0) ||
      typeof f.success !== "boolean" ||
      typeof f.text !== "string" ||
      f.text.length > 500 ||
      !Number.isFinite(f.matchup) ||
      f.matchup < 0.5 ||
      f.matchup > 2 ||
      f.relation !== matchupRelation(f.matchup)
    )
      return false;
    if (f.kind === "gate") {
      if (
        f.targetId !== null ||
        f.target.x !== b.gate.x ||
        f.target.y !== b.gate.y ||
        f.matchup !== 1 ||
        !f.success
      )
        return false;
    } else if (
      !target ||
      target.side === source.side ||
      f.after < target.troops
    )
      return false;
    if (f.phase !== undefined && !["attacker", "defender"].includes(f.phase))
      return false;
    if ((f.kind === "attack" || f.kind === "retaliation") && !f.success)
      return false;
    if (f.kind === "retaliation") {
      if (
        f.phase === undefined ||
        f.phase === f.side ||
        f.parentSequence !== f.sequence - 1
      )
        return false;
      const parent = b.combatFeedback.find(
        (p) => p.sequence === f.parentSequence,
      );
      // A truncated feedback window may start with a retaliation.
      if (
        parent &&
        (parent.kind !== "attack" ||
          parent.attackerId !== f.targetId ||
          parent.targetId !== f.attackerId ||
          parent.turn !== f.turn ||
          parent.phase !== f.phase)
      )
        return false;
    } else if (
      f.parentSequence !== undefined ||
      (f.phase !== undefined && f.phase !== f.side)
    )
      return false;
    if (
      f.kind === "fire" &&
      (f.matchup !== 1 || (!f.success && f.casualties !== 0))
    )
      return false;
    sequence = f.sequence;
  }
  return sequence === (b.feedbackSequence ?? 0);
}
