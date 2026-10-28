import type { TacticalState } from "./tactical/types";
export type FactionId = "cao" | "liu" | "sun";
export interface Faction {
  id: FactionId;
  name: string;
  color: string;
  motto: string;
  active: boolean;
}
export interface Officer {
  id: string;
  name: string;
  factionId: FactionId | null;
  cityId: string | null;
  leadership: number;
  strength: number;
  intelligence: number;
  politics: number;
  charm: number;
  acted: boolean;
}
export interface City {
  id: string;
  name: string;
  ownerId: FactionId;
  x: number;
  y: number;
  neighbors: string[];
  gold: number;
  food: number;
  troops: number;
  agriculture: number;
  commerce: number;
  security: number;
  training: number;
  defense: number;
  actions: number;
}
export interface Battle {
  defenseRouted?: number;
  mode?: "tactical" | "automatic";
  tacticalEvents?: string[];
  reason?: string;
  id: number;
  from: string;
  to: string;
  attacker: FactionId;
  defender: FactionId;
  commander: string;
  sent: number;
  attackPower: number;
  defensePower: number;
  attackLoss: number;
  defenseLoss: number;
  survivors: number;
  won: boolean;
}
export interface GameState {
  version: 1 | 2;
  pendingBattle?: TacticalState | null;
  year: number;
  month: number;
  turn: number;
  playerId: FactionId;
  cities: City[];
  officers: Officer[];
  factions: Faction[];
  seed: number;
  events: string[];
  battles: Battle[];
  status: "playing" | "won" | "lost";
}
export type Domestic =
  "farm" | "trade" | "recruit" | "train" | "patrol" | "repair";
export type Action =
  | { type: Domestic; cityId: string; officerId: string }
  | {
      type: "attack" | "transfer";
      cityId: string;
      officerId: string;
      targetId: string;
      troops: number;
      food?: number;
    };
export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; error: string };
