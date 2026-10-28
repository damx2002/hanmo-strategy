import type { GameState, ActionResult } from "../types";
import type { TacticalAction } from "./types";
import { tacticalDispatch } from "./actions";
import { runTacticalPhase } from "./ai";
import { estimate, defenderFor } from "../combat";
import { settleExpedition } from "../expedition";
export function applyTactical(s: GameState, a: TacticalAction): ActionResult {
  if (!s.pendingBattle)
    return { ok: false, state: s, error: "沒有進行中的戰鬥。" };
  const r = tacticalDispatch(s.pendingBattle, a);
  if (!r.ok) return { ok: false, state: s, error: r.error };
  return {
    ok: true,
    state: { ...s, pendingBattle: r.battle, seed: r.battle.seed },
  };
}
export function enemyPhase(s: GameState): GameState {
  if (
    !s.pendingBattle ||
    s.pendingBattle.phase !== "defender" ||
    s.pendingBattle.status !== "active"
  )
    return s;
  const battle = runTacticalPhase(s.pendingBattle);
  return { ...s, pendingBattle: battle, seed: battle.seed };
}
export function completeTactical(s: GameState, id: number): ActionResult {
  const b = s.pendingBattle;
  if (!b || b.id !== id || b.status === "active")
    return { ok: false, state: s, error: "此戰果尚未完成或已結算。" };
  const survivors = b.units
      .filter((u) => u.side === "attacker")
      .reduce((n, u) => n + u.troops, 0),
    defenders = b.units
      .filter((u) => u.side === "defender")
      .reduce((n, u) => n + u.troops, 0);
  const source = s.cities.find((c) => c.id === b.sourceId)!,
    target = s.cities.find((c) => c.id === b.targetId)!,
    officer = s.officers.find((o) => o.id === b.commanderId)!;
  const p = estimate(
    source,
    target,
    officer,
    defenderFor(s.officers, target),
    b.sent,
  );
  const state = settleExpedition(
    s,
    {
      cityId: b.sourceId,
      targetId: b.targetId,
      officerId: b.commanderId,
      troops: b.sent,
    },
    {
      won: b.status === "attackerWon",
      attackLoss: b.sent - survivors,
      defenseLoss: b.defendersInitial - defenders,
      survivors,
      attackPower: Math.round(p.attack),
      defensePower: Math.round(p.defense),
      seed: b.seed,
      mode: "tactical",
      tacticalEvents: b.events,
      reason: b.reason ?? undefined,
      defenseAfter: Math.floor((b.defense * b.gate.hp) / b.gate.maxHp),
    },
  );
  return { ok: true, state };
}
