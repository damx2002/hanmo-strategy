import type { GameState } from "./types";
import { createCities, createOfficers } from "../data/scenario";
import { B } from "./balance";
export const SAVE_KEY = "hanmo-strategy-save-v1";
const ids = ["cao", "liu", "sun"];
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export function isGameState(v: unknown): v is GameState {
  if (
    !record(v) ||
    v.version !== 1 ||
    !ids.includes(String(v.playerId)) ||
    !int(v.year, 214, 999999) ||
    !int(v.month, 1, 12) ||
    !int(v.turn, 0, 9999999) ||
    !int(v.seed, 0, 4294967295) ||
    !["playing", "won", "lost"].includes(String(v.status))
  )
    return false;
  if (
    !Array.isArray(v.cities) ||
    v.cities.length !== 12 ||
    !Array.isArray(v.officers) ||
    v.officers.length !== 30 ||
    !Array.isArray(v.factions) ||
    v.factions.length !== 3
  )
    return false;
  const template = createCities(),
    roster = createOfficers();
  if (
    !template.every(
      (t) =>
        v.cities instanceof Array &&
        v.cities.filter((c) => record(c) && c.id === t.id).length === 1,
    )
  )
    return false;
  if (
    !v.cities.every((c) => {
      if (!record(c)) return false;
      const t = template.find((t) => t.id === c.id);
      return (
        !!t &&
        c.name === t.name &&
        c.x === t.x &&
        c.y === t.y &&
        ids.includes(String(c.ownerId)) &&
        Array.isArray(c.neighbors) &&
        JSON.stringify(c.neighbors) === JSON.stringify(t.neighbors) &&
        ["gold", "food", "troops"].every((k) => int(c[k], 0, B.maxResource)) &&
        ["agriculture", "commerce", "security", "training", "defense"].every(
          (k) => int(c[k], 0, 100),
        ) &&
        int(c.actions, 0, 3)
      );
    })
  )
    return false;
  const cities = v.cities as GameState["cities"];
  if (
    !roster.every(
      (t) =>
        v.officers instanceof Array &&
        v.officers.filter((o) => record(o) && o.id === t.id).length === 1,
    )
  )
    return false;
  if (
    !v.officers.every(
      (o) =>
        record(o) &&
        o.name === roster.find((t) => t.id === o.id)?.name &&
        typeof o.acted === "boolean" &&
        ["leadership", "strength", "intelligence", "politics", "charm"].every(
          (k) => int(o[k], 1, 100),
        ) &&
        (o.factionId === null
          ? o.cityId === null
          : ids.includes(String(o.factionId)) &&
            cities.some((c) => c.id === o.cityId && c.ownerId === o.factionId)),
    )
  )
    return false;
  if (
    !ids.every(
      (id) =>
        (v.factions as unknown[]).filter(
          (f) =>
            record(f) &&
            f.id === id &&
            typeof f.name === "string" &&
            typeof f.color === "string" &&
            typeof f.motto === "string" &&
            f.active === cities.some((c) => c.ownerId === id),
        ).length === 1,
    )
  )
    return false;
  const owned = cities.filter((c) => c.ownerId === v.playerId).length;
  if (v.status !== (owned === 0 ? "lost" : owned === 12 ? "won" : "playing"))
    return false;
  if (
    !Array.isArray(v.events) ||
    v.events.length > B.eventLimit ||
    !v.events.every((e) => typeof e === "string") ||
    !Array.isArray(v.battles) ||
    v.battles.length > B.battleLimit
  )
    return false;
  return v.battles.every(
    (b) =>
      record(b) &&
      ["from", "to", "commander"].every((k) => typeof b[k] === "string") &&
      ids.includes(String(b.attacker)) &&
      ids.includes(String(b.defender)) &&
      typeof b.won === "boolean" &&
      [
        "id",
        "sent",
        "attackPower",
        "defensePower",
        "attackLoss",
        "defenseLoss",
        "survivors",
      ].every((k) => int(b[k], 0, 1000000000)) &&
      Number(b.attackLoss) <= Number(b.sent) &&
      b.survivors === Number(b.sent) - Number(b.attackLoss),
  );
}
export function serialize(s: GameState): string {
  return JSON.stringify(s);
}
export function deserialize(raw: string): GameState {
  const s: unknown = JSON.parse(raw);
  if (!isGameState(s))
    throw new Error("存檔版本不符或資料損毀。可確認刪除後開始新遊戲。");
  return s;
}
export function loadGame(): { state: GameState | null; error: string } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return { state: raw ? deserialize(raw) : null, error: "" };
  } catch {
    return {
      state: null,
      error: "無法讀取存檔：資料損毀或瀏覽器禁止儲存。舊存檔不會自動刪除。",
    };
  }
}
export function saveGame(s: GameState): string {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s));
    return "";
  } catch {
    return "自動存檔失敗：請確認瀏覽器儲存權限或可用空間，離開前可能遺失進度。";
  }
}
