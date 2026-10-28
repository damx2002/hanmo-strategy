import type { Action, ActionResult, FactionId, GameState } from "./types";
import { B, actionNames, clamp } from "./balance";
import { checkResult, event } from "./game";
import { defenderFor, resolveCombat } from "./combat";
export function dispatch(
  state: GameState,
  action: Action,
  actor: FactionId = state.playerId,
): ActionResult {
  const fail = (error: string): ActionResult => ({ ok: false, state, error });
  if (state.status !== "playing") return fail("遊戲已結束，請開始新遊戲。");
  const c = state.cities.find((c) => c.id === action.cityId),
    o = state.officers.find((o) => o.id === action.officerId);
  if (!c || c.ownerId !== actor) return fail("只能指揮己方城池。");
  if (!o || o.factionId !== actor || o.cityId !== c.id)
    return fail("請選擇本城武將。");
  if (c.actions <= 0) return fail("本城本月指令已用盡。");
  if (o.acted) return fail("這位武將本月已行動。");
  if (action.type === "attack" || action.type === "transfer") {
    const t = state.cities.find((t) => t.id === action.targetId);
    if (!t || !c.neighbors.includes(t.id)) return fail("目標必須是相鄰城池。");
    if ((action.type === "attack") === (t.ownerId === actor))
      return fail(
        action.type === "attack"
          ? "不能進攻己方城池。"
          : "只能調動到己方城池。",
      );
    if (
      !Number.isSafeInteger(action.troops) ||
      action.troops < 0 ||
      action.troops > c.troops - B.guard
    )
      return fail(`出兵需留下 ${B.guard} 名守軍，且兵數須為整數。`);
    if (action.type === "attack" && action.troops === 0)
      return fail("出征至少需要一名士兵。");
    const food =
      action.type === "attack"
        ? Math.ceil(action.troops * B.foodPerTroop)
        : (action.food ?? 0);
    if (!Number.isSafeInteger(food) || food < 0 || food > c.food)
      return fail("兵糧不足或調動數量不合法。");
  } else {
    const cost = B.costs[action.type];
    if (cost === undefined) return fail("未知指令。");
    if (c.gold < cost || (action.type === "recruit" && c.food < B.recruitFood))
      return fail("金錢或兵糧不足。");
    const stat =
      action.type === "farm"
        ? c.agriculture
        : action.type === "trade"
          ? c.commerce
          : action.type === "train"
            ? c.training
            : 0;
    if (stat >= B.maxStat) return fail("此項能力已達上限。");
  }
  const s = structuredClone(state),
    city = s.cities.find((x) => x.id === c.id)!,
    officer = s.officers.find((x) => x.id === o.id)!;
  city.actions--;
  officer.acted = true;
  if (action.type === "attack" || action.type === "transfer") {
    const target = s.cities.find((x) => x.id === action.targetId)!;
    if (action.type === "transfer") {
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
    } else {
      const previousOwner = target.ownerId;
      const battle = resolveCombat(
        city,
        target,
        officer,
        defenderFor(s.officers, target),
        action.troops,
        s.seed,
      );
      s.seed = battle.seed;
      city.food -= Math.ceil(action.troops * B.foodPerTroop);
      city.troops -= battle.won ? action.troops : battle.attackLoss;
      target.troops -= battle.defenseLoss;
      if (battle.won) {
        target.ownerId = actor;
        target.troops = battle.survivors;
        target.gold = clamp(target.gold * B.captureGold, B.maxResource);
        target.food = clamp(target.food * B.captureFood, B.maxResource);
        target.security = clamp(target.security - B.captureSecurityLoss);
        target.defense = clamp(target.defense - B.captureDefenseLoss);
        target.actions = 0;
        const retreat = s.cities
          .filter((x) => x.ownerId === previousOwner)
          .sort(
            (a, b) =>
              Number(target.neighbors.includes(b.id)) -
              Number(target.neighbors.includes(a.id)),
          )[0];
        s.officers
          .filter((x) => x.cityId === target.id)
          .forEach((x) => {
            x.cityId = retreat?.id ?? null;
            if (!retreat) x.factionId = null;
          });
        officer.cityId = target.id;
      }
      s.battles.unshift({
        id: s.turn * 1000 + s.events.length,
        from: city.name,
        to: target.name,
        attacker: actor,
        defender: previousOwner,
        commander: officer.name,
        sent: action.troops,
        ...battle,
      });
      s.battles = s.battles.slice(0, B.battleLimit);
      event(
        s,
        `${officer.name}率${action.troops.toLocaleString("zh-TW")}兵自${city.name}進攻${target.name}：${battle.won ? "攻占成功" : "攻城失利"}。我軍損失${battle.attackLoss.toLocaleString("zh-TW")}，守軍損失${battle.defenseLoss.toLocaleString("zh-TW")}。`,
      );
    }
  } else {
    city.gold -= B.costs[action.type];
    const growth = Math.floor(
      B.developmentBase +
        officer.politics * B.politicsScale +
        officer.intelligence * B.intelligenceScale,
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
    event(
      s,
      `${s.factions.find((f) => f.id === actor)!.name}軍於${city.name}執行${actionNames[action.type]}，由${officer.name}主持。`,
    );
  }
  return { ok: true, state: checkResult(s) };
}
