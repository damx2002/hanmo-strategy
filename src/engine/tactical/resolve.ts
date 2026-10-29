import type { GameState, ActionResult } from "../types";
import type { TacticalAction } from "./types";
import { tacticalDispatch } from "./actions";
import { runTacticalPhase } from "./ai";
import { estimate, defenderFor } from "../combat";
import { playerSide } from "./control";
import { checkResult, event } from "../game";
import { B } from "../balance";
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
    s.pendingBattle.phase === playerSide(s.pendingBattle) ||
    s.pendingBattle.status !== "active"
  )
    return s;
  const battle = runTacticalPhase(s.pendingBattle, s.pendingBattle.phase);
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
  const portions = allocateSurvivors(
    [
      b.defenderGarrison ?? b.defendersInitial,
      ...(b.reinforcements ?? []).map((r) => r.troops),
    ],
    defenders,
  );
  const reinforcementSurvivors = (b.reinforcements ?? []).map((r, i) => ({
    r,
    survivors: portions[i + 1],
  }));
  const garrisonAlive = portions[0];
  const input = structuredClone(s);
  if (b.defenderGarrison !== undefined)
    input.cities.find((c) => c.id === b.targetId)!.troops = b.defenderGarrison;
  let state = settleExpedition(
    input,
    {
      cityId: b.sourceId,
      targetId: b.targetId,
      officerId: b.commanderId,
      troops: b.sent,
      officerIds: b.officerIds,
    },
    {
      won: b.status === "attackerWon",
      attackLoss: b.sent - survivors,
      defenseLoss: (b.defenderGarrison ?? b.defendersInitial) - garrisonAlive,
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
  state.battles[0].defenseLoss = b.defendersInitial - defenders;
  if (b.reinforcements?.length) {
    state.battles[0].reinforcements = reinforcementSurvivors.map(
      ({ r, survivors }) => {
        const home =
          state.cities.find(
            (c) => c.id === r.cityId && c.ownerId === b.defenderId,
          ) ?? state.cities.find((c) => c.ownerId === b.defenderId);
        const returned = home
          ? Math.min(survivors, B.maxResource - home.troops)
          : 0;
        if (home) home.troops += returned;
        const o = state.officers.find((o) => o.id === r.officerId)!;
        o.cityId = home?.id ?? b.targetId;
        o.factionId = home ? b.defenderId : null;
        o.acted = true;
        event(
          state,
          `援軍${o.name}：出兵${r.troops}，傷亡${r.troops - survivors}，生還${survivors}，返回${home?.name ?? "無處可退"} ${returned}，散去${survivors - returned}。`,
        );
        return {
          cityId: r.cityId,
          officerId: r.officerId,
          sent: r.troops,
          loss: r.troops - survivors,
          survivors,
          returnedTo: home?.id ?? null,
          dispersed: survivors - returned,
          food: r.food,
        };
      },
    );
  }
  state = checkResult(state);
  return { ok: true, state };
}

export function allocateSurvivors(
  weights: number[],
  survivors: number,
): number[] {
  const total = weights.reduce((n, x) => n + x, 0);
  if (!total) return weights.map(() => 0);
  const result = weights.map((w) => Math.floor((survivors * w) / total));
  const order = weights
    .map((w, i) => ({ i, f: (survivors * w) / total - result[i] }))
    .sort((a, b) => b.f - a.f || a.i - b.i);
  let left = survivors - result.reduce((n, x) => n + x, 0);
  for (const { i } of order)
    if (left > 0 && result[i] < weights[i]) {
      result[i]++;
      left--;
    }
  return result;
}
