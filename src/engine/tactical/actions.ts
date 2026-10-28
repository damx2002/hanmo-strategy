import type {
  TacticalAction,
  TacticalResult,
  TacticalState,
  Side,
} from "./types";
import { reachable, distance } from "./movement";
import {
  canAttack,
  estimateDamage,
  fireReason,
  fireChance,
  matchupMultiplier,
} from "./damage";
import { T, troopNames } from "./tacticalBalance";
import { recordCombat } from "./feedback";
import { random } from "../rng";
export function log(b: TacticalState, text: string) {
  b.events.unshift(`第${b.turn}回合｜${text}`);
  b.events = b.events.slice(0, T.maxEvents);
}
export function checkBattle(b: TacticalState) {
  if (!b.units.some((u) => u.side === "attacker" && u.troops > 0)) {
    b.status = "defenderWon";
    b.reason = "elimination";
  } else if (!b.units.some((u) => u.side === "defender" && u.troops > 0)) {
    b.status = "attackerWon";
    b.reason = "elimination";
  }
}
export function tacticalDispatch(
  battle: TacticalState,
  a: TacticalAction,
  actor: Side = "attacker",
): TacticalResult {
  const fail = (error: string): TacticalResult => ({
    ok: false,
    battle,
    error,
  });
  if (battle.status !== "active") return fail("戰鬥已結束，不能重複下令。");
  if (actor !== battle.phase) return fail("現在不是你的行動階段。");
  const b = structuredClone(battle);
  if (a.type === "retreat") {
    if (actor !== "attacker") return fail("守軍不能使用攻方撤退。");
    b.status = "defenderWon";
    b.reason = "retreat";
    log(b, "攻軍下令撤退，生還部隊將返回原城。");
    return { ok: true, battle: b };
  }
  if (a.type === "endPhase") {
    if (actor === "attacker") {
      const held =
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
        );
      b.occupation = held ? b.occupation + 1 : 0;
      if (b.occupation >= T.occupationTurns) {
        b.status = "attackerWon";
        b.reason = "occupation";
        log(b, "內城已連續駐守兩階段，守軍潰退。");
        return { ok: true, battle: b };
      }
    } else {
      if (b.turn >= T.maxTurns) {
        b.status = "defenderWon";
        b.reason = "limit";
        log(b, "攻軍久攻不克，達到十六回合上限。");
        return { ok: true, battle: b };
      }
      b.turn++;
    }
    b.phase = actor === "attacker" ? "defender" : "attacker";
    b.units
      .filter((u) => u.side === b.phase)
      .forEach((u) => {
        u.moved = false;
        u.attacked = false;
        u.effects = [];
      });
    b.effect = null;
    log(b, `${b.phase === "attacker" ? "攻軍" : "守軍"}階段開始。`);
    return { ok: true, battle: b };
  }
  const u = b.units.find((u) => u.id === a.unitId);
  if (!u || u.side !== actor || u.troops <= 0) return fail("無法指揮該部隊。");
  let text = "";
  if (a.type === "move") {
    if (!reachable(b, u).some((p) => p.x === a.x && p.y === a.y))
      return fail("移動超出範圍、受阻或部隊已行動。");
    u.x = a.x;
    u.y = a.y;
    u.moved = true;
    text = `${troopNames[u.type]}移動至新陣地。`;
  } else if (a.type === "wait") {
    if (u.attacked) return fail("部隊本階段已完成行動。");
    u.moved = true;
    u.attacked = true;
    u.effects = ["guarded"];
    text = `${troopNames[u.type]}待機整備，防禦提高。`;
  } else if (a.type === "gate") {
    if (
      u.side !== "attacker" ||
      u.attacked ||
      u.type === "archer" ||
      b.gate.hp <= 0 ||
      distance(u, b.gate) !== 1
    )
      return fail("須以未攻擊的近戰部隊鄰接城門破城。");
    const loss = Math.min(
      b.gate.hp,
      Math.max(
        1,
        Math.floor(
          u.troops * T.gateDamage * (1 + b.training[u.side] * T.training),
        ),
      ),
    );
    const before = b.gate.hp;
    b.gate.hp -= loss;
    u.attacked = true;
    text = recordCombat(b, u, undefined, "gate", before, b.gate.hp);
  } else {
    const v = b.units.find((u) => u.id === a.targetId);
    if (!v) return fail("目標不存在。");
    if (a.type === "attack") {
      if (!canAttack(b, u, v))
        return fail("目標超出射程、已潰滅或本部隊已攻擊。");
      const [r, next] = random(b.seed);
      b.seed = next;
      const loss = estimateDamage(b, u, v, T.randomMin + r * T.randomRange);
      const before = v.troops;
      v.troops -= loss;
      u.attacked = true;
      text = recordCombat(
        b,
        u,
        v,
        "attack",
        before,
        v.troops,
        matchupMultiplier(u.type, v.type),
      );
    } else {
      const reason = fireReason(b, u, v);
      if (reason) return fail(reason);
      const [r, next] = random(b.seed);
      b.seed = next;
      b.fireUsed[u.side]++;
      u.attacked = true;
      const success = r < fireChance(b, u, v),
        loss = success
          ? Math.min(v.troops, Math.ceil(v.troops * T.fireLoss))
          : 0;
      const before = v.troops;
      v.troops -= loss;
      text = recordCombat(b, u, v, "fire", before, v.troops, 1, success);
    }
  }
  b.effect = { kind: a.type, text, unitId: u.id };
  log(b, text);
  checkBattle(b);
  return { ok: true, battle: b };
}
