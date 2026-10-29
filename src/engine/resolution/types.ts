import type { AttackOrder } from "../expedition";
export interface MonthResolution {
  eventsBefore?: string[];
  turn: number;
  stage: "delegation" | "ai" | "economy";
  factions: string[];
  factionIndex: number;
  cityIds: string[];
  cityIndex: number;
  step: number;
  attacked: boolean;
  governed: boolean;
  diplomacyDone?: boolean;
  operations: number;
}
export interface Reinforcement {
  cityId: string;
  officerId: string;
  troops: number;
  food: number;
}
export interface PendingDefense {
  id: string;
  order: AttackOrder;
  attackerId: string;
  reinforcements: Reinforcement[];
}
