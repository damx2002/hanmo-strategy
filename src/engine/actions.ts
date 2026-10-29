import type { Action, ActionResult, FactionId, GameState } from "./types";
import { P } from "./personnel";
import { B, actionNames, clamp } from "./balance";
import { checkResult, event } from "./game";
import { domesticReason } from "./domestic";
import { defenderFor, resolveCombat } from "./combat";
import {
  validateExpedition,
  reserveExpedition,
  settleExpedition,
} from "./expedition";
export function dispatch(
  state: GameState,
  action: Action,
  actor: FactionId = state.playerId,
): ActionResult {
  const fail = (error: string): ActionResult => ({ ok: false, state, error });
  if (state.pendingDefense || (state.monthResolution && actor === state.playerId && state.monthResolution.stage !== "delegation")) return fail("月份處理中，請先完成守城或恢復回合。");
  if (state.pendingBattle) return fail("戰鬥尚未結束，不能下達其他軍令。");
  if (action.type === "attack") {
    const error = validateExpedition(state, action, actor);
    if (error) return fail(error);
    const source = state.cities.find((c) => c.id === action.cityId)!,
      target = state.cities.find((c) => c.id === action.targetId)!,
      officer = state.officers.find((o) => o.id === action.officerId)!;
    const result = resolveCombat(
      source,
      target,
      officer,
      defenderFor(state.officers, target),
      action.troops,
      state.seed,
    );
    return {
      ok: true,
      state: settleExpedition(reserveExpedition(state, action), action, result),
    };
  }
  if (state.status !== "playing") return fail("遊戲已結束，請開始新遊戲。");
  const c = state.cities.find((c) => c.id === action.cityId),
    o = state.officers.find((o) => o.id === action.officerId);
  if (!c || c.ownerId !== actor) return fail("只能指揮己方城池。");
  if (!o || o.factionId !== actor || o.cityId !== c.id)
    return fail("請選擇本城武將。");
  if (c.actions <= 0) return fail("本城本月指令已用盡。");
  if (o.acted) return fail("這位武將本月已行動。");
  if (action.type === "transfer") {
    const t = state.cities.find((t) => t.id === action.targetId);
    if (!t || !c.neighbors.includes(t.id)) return fail("目標必須是相鄰城池。");
    if (t.ownerId !== actor) return fail("只能調動到己方城池。");
    if (
      !Number.isSafeInteger(action.troops) ||
      action.troops < 0 ||
      action.troops > c.troops - B.guard
    )
      return fail(`出兵需留下 ${B.guard} 名守軍，且兵數須為整數。`);
    const food = action.food ?? 0;
    if (!Number.isSafeInteger(food) || food < 0 || food > c.food)
      return fail("兵糧不足或調動數量不合法。");
  } else {
    const reason = domesticReason(c, action.type);
    if (reason) return fail(reason);
  }
  const s = structuredClone(state),
    city = s.cities.find((x) => x.id === c.id)!,
    officer = s.officers.find((x) => x.id === o.id)!;
  city.actions--;
  officer.acted = true;
  if (action.type === "transfer") {
    const target = s.cities.find((x) => x.id === action.targetId)!;
    {
      const food = action.food ?? 0;
      if (
        target.food + food > B.maxResource ||
        target.troops + action.troops > B.maxResource
      )
        return fail("目的城資源已達上限。");
      city.troops -= action.troops;
      target.troops += action.troops;
      city.food -= food;
      target.food += food;
      officer.cityId = target.id;
      event(
        s,
        `${s.factions.find((f) => f.id === actor)!.name}軍：${officer.name}自${city.name}調往${target.name}，兵 ${action.troops.toLocaleString("zh-TW")}、糧 ${food.toLocaleString("zh-TW")}。`,
      );
    }
  } else {
    city.gold -= B.costs[action.type];
    const governor = s.officers.find((o) => o.id === city.governorId && o.factionId === actor && o.cityId === city.id);
    const efficiency = (1 + (governor?.politics ?? 0) * P.governorScale) * (officer.traits?.includes("能吏") ? 1.05 : 1);
    const growth = Math.floor(efficiency * (
      B.developmentBase +
        officer.politics * B.politicsScale +
        officer.intelligence * B.intelligenceScale),
    );
    if (action.type === "farm")
      city.agriculture = clamp(city.agriculture + growth);
    if (action.type === "trade") city.commerce = clamp(city.commerce + growth);
    if (action.type === "train")
      city.training = clamp(
        city.training +
          B.trainingBase +
          officer.leadership * B.leadershipTraining,
      );
    if (action.type === "recruit") {
      city.food -= B.recruitFood;
      city.troops = clamp(
        city.troops + B.recruitBase + officer.charm * B.charmScale,
        B.maxResource,
      );
      city.security = clamp(city.security - B.recruitSecurity);
    }
    if (action.type === "patrol")
      city.security = clamp(
        city.security +
          B.patrolBase +
          officer.politics * B.patrolPolitics +
          officer.charm * B.patrolCharm,
      );
    if (action.type === "repair")
      city.defense = clamp(
        city.defense +
          B.repairBase +
          officer.leadership * B.repairLeadership +
          officer.politics * B.repairPolitics,
      );
    event(
      s,
      `${s.factions.find((f) => f.id === actor)!.name}軍於${city.name}執行${actionNames[action.type]}，由${officer.name}主持。`,
    );
  }
  return { ok: true, state: checkResult(s) };
}
