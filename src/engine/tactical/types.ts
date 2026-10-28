import type { FactionId } from "../types";
export type Side = "attacker" | "defender";
export type Terrain = "plain" | "forest" | "hill" | "city" | "gate";
export type TroopType = "infantry" | "cavalry" | "archer";
export interface Unit {
  id: string;
  side: Side;
  type: TroopType;
  commanderId: string | null;
  troops: number;
  maxTroops: number;
  x: number;
  y: number;
  moved: boolean;
  attacked: boolean;
  effects: "guarded"[];
}
export interface Commander {
  id: string;
  leadership: number;
  strength: number;
  intelligence: number;
}
export interface CombatFeedback {
  sequence: number;
  kind: "attack" | "fire" | "gate";
  attackerId: string;
  targetId: string | null;
  target: { x: number; y: number };
  casualties: number;
  before: number;
  after: number;
  matchup: number;
  relation: "advantage" | "disadvantage" | "neutral";
  success: boolean;
  destroyed: boolean;
  side: Side;
  turn: number;
  text: string;
}
export interface TacticalState {
  feedbackSequence?: number;
  combatFeedback?: CombatFeedback[];
  id: number;
  sourceId: string;
  targetId: string;
  commanderId: string;
  attackerId: FactionId;
  defenderId: FactionId;
  sent: number;
  defendersInitial: number;
  foodCost: number;
  training: Record<Side, number>;
  defense: number;
  commanders: Commander[];
  map: Terrain[][];
  units: Unit[];
  seed: number;
  turn: number;
  phase: Side;
  gate: { x: number; y: number; hp: number; maxHp: number };
  fireUsed: Record<Side, number>;
  occupation: number;
  status: "active" | "attackerWon" | "defenderWon";
  reason: "elimination" | "occupation" | "retreat" | "limit" | null;
  events: string[];
  effect: {
    kind: "move" | "attack" | "fire" | "gate" | "wait";
    text: string;
    unitId: string;
  } | null;
}
export type TacticalAction =
  | { type: "move"; unitId: string; x: number; y: number }
  | { type: "attack" | "fire"; unitId: string; targetId: string }
  | { type: "gate"; unitId: string }
  | { type: "wait"; unitId: string }
  | { type: "endPhase" }
  | { type: "retreat" };
export type TacticalResult =
  | { ok: true; battle: TacticalState }
  | { ok: false; battle: TacticalState; error: string };
