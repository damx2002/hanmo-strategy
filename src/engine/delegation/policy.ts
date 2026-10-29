import type { ActionResult, GameState, City } from "../types";
import type { Policy, ManagedPolicy } from "./types";
export const policyNames = {
  manual: "手動管理",
  balanced: "均衡發展",
  economy: "經濟優先",
  military: "軍備優先",
  defense: "防禦優先",
} as const;
export const policyShort = {
  manual: "手動",
  balanced: "委任均衡",
  economy: "委任經濟",
  military: "委任軍備",
  defense: "委任防禦",
} as const;
export const isPolicy = (v: unknown): v is Policy =>
  typeof v === "string" && Object.hasOwn(policyNames, v);
export const getPolicy = (s: GameState, id: string): Policy =>
  s.cities.some((c) => c.id === id && c.ownerId === s.playerId)
    ? (s.delegation?.policies[id] ?? "manual")
    : "manual";
export const isBorder = (s: GameState, c: City) =>
  c.neighbors.some(
    (id) => s.cities.find((t) => t.id === id)?.ownerId !== c.ownerId,
  );
export function setDelegationPolicy(
  s: GameState,
  id: string,
  policy: unknown,
): ActionResult {
  const fail = (error: string): ActionResult => ({
    ok: false,
    state: s,
    error,
  });
  if (
    s.status !== "playing" ||
    !s.factions.some((f) => f.id === s.playerId && f.active)
  )
    return fail("遊戲已結束，不能修改委任。");
  if (s.pendingBattle || s.pendingDefense || s.monthResolution)
    return fail("戰鬥中不能修改委任。");
  if (!s.cities.some((c) => c.id === id && c.ownerId === s.playerId))
    return fail("只能設定目前己方城池。");
  if (!isPolicy(policy)) return fail("治理方針不合法。");
  if (getPolicy(s, id) === policy) return { ok: true, state: s };
  const n = structuredClone(s);
  n.delegation ??= { policies: {} };
  if (policy === "manual") delete n.delegation.policies[id];
  else n.delegation.policies[id] = policy as ManagedPolicy;
  return { ok: true, state: n };
}
export function setRearDelegation(
  s: GameState,
  policy: "balanced" | "manual",
): ActionResult {
  // Shared setter enforces phase, ownership and policy even on direct callers.
  if (
    s.status !== "playing" ||
    s.pendingBattle ||
    s.pendingDefense ||
    s.monthResolution
  )
    return { ok: false, state: s, error: "目前不能修改委任。" };
  let n = s;
  for (const c of s.cities.filter(
    (c) => c.ownerId === s.playerId && !isBorder(s, c),
  )) {
    const r = setDelegationPolicy(n, c.id, policy);
    if (!r.ok) return r;
    n = r.state;
  }
  return { ok: true, state: n };
}
