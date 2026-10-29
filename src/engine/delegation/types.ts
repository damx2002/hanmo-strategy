import type { Domestic } from "../types";
export type Policy = "manual" | "balanced" | "economy" | "military" | "defense";
export type ManagedPolicy = Exclude<Policy, "manual">;
export type StopReason =
  | "待命武將不足"
  | "本月指令已用盡"
  | "資源保留"
  | "內政已達目標"
  | "指令驗證失敗";
export interface DelegatedAction {
  type: Domestic;
  officerId: string;
  officerName: string;
  before: number;
  after: number;
  gold: number;
  food: number;
}
export interface DelegatedCity {
  cityId: string;
  name: string;
  policy: ManagedPolicy;
  actions: DelegatedAction[];
  gold: number;
  food: number;
  reason: StopReason;
}
export interface MonthlyIncome {
  cityId: string;
  name: string;
  gold: number;
  food: number;
  upkeep: number;
  netFood: number;
  deserters: number;
}
export interface DelegationReport {
  turn: number;
  year: number;
  month: number;
  cities: DelegatedCity[];
  eventLines: string[];
  economy?: MonthlyIncome[];
}
export interface DelegationState {
  policies: Record<string, ManagedPolicy>;
  processedTurn?: number;
  report?: DelegationReport;
}
