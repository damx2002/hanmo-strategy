import type { GameState, FactionId, Battle } from "./types";
import { B, clamp } from "./balance";
import { checkResult, event } from "./game";
export interface AttackOrder {
  cityId: string;
  targetId: string;
  officerId: string;
  troops: number;
}
export interface ExpeditionResult {
  won: boolean;
  attackLoss: number;
  defenseLoss: number;
  survivors: number;
  attackPower: number;
  defensePower: number;
  seed: number;
  defenseAfter?: number;
  mode?: "tactical" | "automatic";
  tacticalEvents?: string[];
  reason?: string;
}
export function validateExpedition(
  s: GameState,
  a: AttackOrder,
  actor: FactionId = s.playerId,
): string {
  if (s.pendingBattle) return "戰鬥尚未結束，不能下達其他軍令。";
  if (s.status !== "playing") return "遊戲已結束。";
  const c = s.cities.find((c) => c.id === a.cityId),
    t = s.cities.find((c) => c.id === a.targetId),
    o = s.officers.find((o) => o.id === a.officerId);
  if (!c || c.ownerId !== actor) return "只能指揮己方城池。";
  if (!o || o.factionId !== actor || o.cityId !== c.id)
    return "請選擇本城武將。";
  if (c.actions <= 0) return "本城本月指令已用盡。";
  if (o.acted) return "這位武將本月已行動。";
  if (!t || !c.neighbors.includes(t.id) || t.ownerId === actor)
    return "目標必須是相鄰敵城。";
  if (
    !Number.isSafeInteger(a.troops) ||
    a.troops < 1 ||
    a.troops > c.troops - B.guard
  )
    return `出兵需留下 ${B.guard} 名守軍。`;
  if (c.food < Math.ceil(a.troops * B.foodPerTroop)) return "出征兵糧不足。";
  return "";
}
// Both modes reserve the exact same resources once, before either combat engine runs.
export function reserveExpedition(s: GameState, a: AttackOrder): GameState {
  const n = structuredClone(s),
    c = n.cities.find((c) => c.id === a.cityId)!;
  c.actions--;
  c.troops -= a.troops;
  c.food -= Math.ceil(a.troops * B.foodPerTroop);
  n.officers.find((o) => o.id === a.officerId)!.acted = true;
  return n;
}
// Called only by a completed automatic battle or by the current pending battle ID.
export function settleExpedition(
  reserved: GameState,
  a: AttackOrder,
  r: ExpeditionResult,
): GameState {
  const s = structuredClone(reserved),
    source = s.cities.find((c) => c.id === a.cityId)!,
    target = s.cities.find((c) => c.id === a.targetId)!,
    o = s.officers.find((o) => o.id === a.officerId)!;
  const attacker = source.ownerId,
    defender = target.ownerId,
    remaining = target.troops - r.defenseLoss;
  s.seed = r.seed;
  if (r.defenseAfter !== undefined) target.defense = clamp(r.defenseAfter);
  if (r.won) {
    const retreat = s.cities
      .filter((c) => c.ownerId === defender && c.id !== target.id)
      .sort(
        (a, b) =>
          Number(target.neighbors.includes(b.id)) -
          Number(target.neighbors.includes(a.id)),
      )[0];
    if (remaining > 0) {
      const moved = retreat
        ? Math.min(remaining, B.maxResource - retreat.troops)
        : 0;
      if (retreat) retreat.troops += moved;
      event(
        s,
        `${target.name}守軍撤退 ${moved.toLocaleString("zh-TW")} 人${retreat ? `至${retreat.name}` : ""}，散去 ${(remaining - moved).toLocaleString("zh-TW")} 人。`,
      );
    }
    s.officers
      .filter((x) => x.cityId === target.id)
      .forEach((x) => {
        x.cityId = retreat?.id ?? null;
        if (!retreat) x.factionId = null;
      });
    target.ownerId = attacker;
    target.troops = r.survivors;
    target.gold = clamp(target.gold * B.captureGold, B.maxResource);
    target.food = clamp(target.food * B.captureFood, B.maxResource);
    target.security = clamp(target.security - B.captureSecurityLoss);
    target.defense = clamp(target.defense - B.captureDefenseLoss);
    target.actions = 0;
    o.cityId = target.id;
  } else {
    source.troops += r.survivors;
    target.troops = remaining;
  }
  const report: Battle = {
    defenseRouted: r.won ? remaining : 0,
    id: r.seed,
    from: source.name,
    to: target.name,
    attacker,
    defender,
    commander: o.name,
    sent: a.troops,
    ...r,
  };
  s.battles.unshift(report);
  s.battles = s.battles.slice(0, B.battleLimit);
  event(
    s,
    `${o.name}率${a.troops.toLocaleString("zh-TW")}兵自${source.name}進攻${target.name}：${r.won ? "攻占成功" : "攻城失利"}。我軍損失${r.attackLoss.toLocaleString("zh-TW")}，守軍損失${r.defenseLoss.toLocaleString("zh-TW")}。`,
  );
  s.pendingBattle = null;
  return checkResult(s);
}
