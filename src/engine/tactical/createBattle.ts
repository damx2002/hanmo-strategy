import type { GameState, ActionResult } from "../types";
import type { TacticalState, Unit, Side, TroopType } from "./types";
import { T } from "./tacticalBalance";
import { B } from "../balance";
import { random } from "../rng";
import { defenderFor } from "../combat";
import { reserveExpedition, validateExpedition } from "../expedition";
import type { AttackOrder } from "../expedition";
export function splitUnits(
  troops: number,
  side: Side,
  commanderId: string | null,
): Unit[] {
  const count = Math.min(3, troops),
    kinds: TroopType[] = ["infantry", "cavalry", "archer"];
  return Array.from({ length: count }, (_, i) => ({
    id: `${side}-${i}`,
    side,
    type: kinds[i],
    commanderId,
    troops: Math.floor(troops / count) + (i < troops % count ? 1 : 0),
    maxTroops: Math.floor(troops / count) + (i < troops % count ? 1 : 0),
    x: side === "attacker" ? 0 : 7,
    y: [2, 4, 1][i],
    moved: false,
    attacked: false,
    effects: [],
  }));
}
export function createBattle(s: GameState, a: AttackOrder): TacticalState {
  const source = s.cities.find((c) => c.id === a.cityId)!,
    target = s.cities.find((c) => c.id === a.targetId)!,
    officer = s.officers.find((o) => o.id === a.officerId)!,
    defender = defenderFor(s.officers, target);
  let seed = s.seed;
  const map: TacticalState["map"] = Array.from({ length: T.height }, (_, y) =>
    Array.from({ length: T.width }, (_, x) => {
      if (x === 6 && y === 2) return "gate";
      if (x >= 6) return "city";
      if (x === 0 || y === 2) return "plain";
      const [r, next] = random(seed);
      seed = next;
      return r < 0.2 ? "forest" : r < 0.35 ? "hill" : "plain";
    }),
  );
  const hp = T.gateBase + target.defense * T.gateDefense;
  return {
    id: s.seed,
    sourceId: source.id,
    targetId: target.id,
    commanderId: officer.id,
    attackerId: source.ownerId,
    defenderId: target.ownerId,
    sent: a.troops,
    defendersInitial: target.troops,
    foodCost: Math.ceil(a.troops * B.foodPerTroop),
    training: { attacker: source.training, defender: target.training },
    defense: target.defense,
    commanders: [officer, ...(defender ? [defender] : [])].map((o) => ({
      id: o.id,
      leadership: o.leadership,
      strength: o.strength,
      intelligence: o.intelligence,
    })),
    map,
    units: [
      ...splitUnits(a.troops, "attacker", officer.id),
      ...splitUnits(target.troops, "defender", defender?.id ?? null),
    ],
    seed,
    turn: 1,
    phase: "attacker",
    gate: { x: 6, y: 2, hp, maxHp: hp },
    fireUsed: { attacker: 0, defender: 0 },
    occupation: 0,
    status: target.troops === 0 ? "attackerWon" : "active",
    reason: target.troops === 0 ? "elimination" : null,
    events: [
      "戰場布陣完畢。攻破城門後，須在內城無鄰敵駐守兩個攻方階段；或全滅守軍。",
    ],
    effect: null,
  };
}
export function beginTactical(s: GameState, a: AttackOrder): ActionResult {
  const error = validateExpedition(s, a);
  if (error) return { ok: false, state: s, error };
  const battle = createBattle(s, a),
    next = reserveExpedition(s, a);
  next.version = s.version === 3 ? 3 : 2;
  next.pendingBattle = battle;
  next.seed = battle.seed;
  return { ok: true, state: next };
}
