import type { TacticalState, Unit } from "./types";
export const playerSide = (b: TacticalState) => b.playerSide ?? "attacker";
export const live = (u: Unit) => u.troops > 0 && !u.routed;
