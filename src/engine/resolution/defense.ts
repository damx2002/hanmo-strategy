import type { GameState, ActionResult } from "../types";
import type { Reinforcement } from "./types";
import { B } from "../balance";
import { validateExpedition, reserveExpedition } from "../expedition";
import { createBattle } from "../tactical/createBattle";
import { runTacticalPhase } from "../tactical/ai";
import { completeTactical } from "../tactical/resolve";
export function reinforcementReason(
  s: GameState,
  r: Omit<Reinforcement, "food">,
  seen: string[] = [],
): string {
  const p = s.pendingDefense,
    t = s.cities.find((c) => c.id === p?.order.targetId),
    c = s.cities.find((c) => c.id === r.cityId),
    o = s.officers.find((o) => o.id === r.officerId);
  if (
    !t ||
    !c ||
    c.ownerId !== s.playerId ||
    !t.neighbors.includes(c.id) ||
    seen.includes(c.id)
  )
    return "援軍須由不同的相鄰己城派出。";
  if (
    !o ||
    o.factionId !== s.playerId ||
    o.cityId !== c.id ||
    o.acted ||
    c.actions <= 0
  )
    return "援軍需來源城指令及待命武將。";
  if (
    !Number.isSafeInteger(r.troops) ||
    r.troops < 1 ||
    r.troops > c.troops - B.guard ||
    c.food < Math.ceil(r.troops * B.foodPerTroop)
  )
    return "援軍兵力／兵糧不足，需保留500守軍。";
  return "";
}
export function resolvePendingDefense(
  state: GameState,
  id: string,
  mode: "manual" | "auto",
  reinforcements: Omit<Reinforcement, "food">[] = [],
): ActionResult {
  const fail = (error: string): ActionResult => ({ ok: false, state, error });
  const p = state.pendingDefense;
  if (!p || p.id !== id || !state.monthResolution || state.pendingBattle)
    return fail("警報不存在、已處理或回合不符。");
  if (reinforcements.length > 2) return fail("本版最多兩座友城援軍。");
  const seen: string[] = [];
  for (const r of reinforcements) {
    const reason = reinforcementReason(state, r, seen);
    if (reason) return fail(reason);
    seen.push(r.cityId);
  }
  let s = structuredClone(state);
  s.pendingDefense = null;
  const error = validateExpedition(s, p.order, p.attackerId);
  if (error) return fail(error);
  const target = s.cities.find((c) => c.id === p.order.targetId)!;
  const garrison = target.troops;
  const ledger: Reinforcement[] = [];
  for (const r of reinforcements) {
    const c = s.cities.find((c) => c.id === r.cityId)!,
      o = s.officers.find((o) => o.id === r.officerId)!,
      food = Math.ceil(r.troops * B.foodPerTroop);
    c.troops -= r.troops;
    c.food -= food;
    c.actions--;
    o.acted = true;
    o.cityId = target.id;
    if (c.governorId === o.id) delete c.governorId;
    target.troops += r.troops;
    ledger.push({ ...r, food });
  }
  if (target.troops > B.maxResource) return fail("守軍合計超過上限。");
  const battle = createBattle(s, p.order);
  battle.playerSide = "defender";
  battle.defenseId = id;
  battle.defenderGarrison = garrison;
  battle.reinforcements = ledger;
  s = reserveExpedition(s, p.order);
  s.pendingBattle = battle;
  s.seed = battle.seed;
  if (mode === "manual") return { ok: true, state: s };
  for (
    let step = 0;
    step < 32 && s.pendingBattle!.status === "active";
    step++
  ) {
    const b = runTacticalPhase(s.pendingBattle!, s.pendingBattle!.phase);
    s = { ...s, pendingBattle: b, seed: b.seed };
  }
  return completeTactical(s, battle.id);
}
