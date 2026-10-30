import type { GameState } from "./types";
import { scenarioTemplate, scenarioIds } from "../data/scenarios";
import { B } from "./balance";
import { T } from "./tactical/tacticalBalance";
import { validResolution } from "./resolution/validate";
import { validDelegation } from "./delegation/validate";
import { validTactical } from "./tactical/validate";
// Preview and production can share the same github.io origin.
const ns = typeof import.meta.env !== "undefined" && import.meta.env.VITE_HANMO_CHANNEL === "preview" ? "hanmo-strategy-preview" : "hanmo-strategy";
export const LEGACY_SAVE_KEY = `${ns}-save-v1`;
export const V2_SAVE_KEY = `${ns}-save-v2`;
export const SAVE_KEY = `${ns}-save-v3`;

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const int = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
function validState(v: unknown): v is GameState {
  if (
    !record(v) ||
    (v.version !== 1 && v.version !== 2 && v.version !== 3) ||
    !int(
      v.year,
      v.version === 3 && v.scenarioId === "warlords194" ? 194 : 214,
      999999,
    ) ||
    !int(v.month, 1, 12) ||
    !int(v.turn, 0, 9999999) ||
    !int(v.seed, 0, 4294967295) ||
    !["playing", "won", "lost"].includes(String(v.status))
  )
    return false;
  if (
    v.version === 3 &&
    (typeof v.scenarioId !== "string" || !scenarioIds.includes(v.scenarioId))
  )
    return false;
  const world = scenarioTemplate(
    v.version === 3 ? String(v.scenarioId) : "legacy",
  );
  const ids = world.factions.map((f) => f.id);
  if (!ids.includes(String(v.playerId))) return false;
  if (
    !Array.isArray(v.cities) ||
    v.cities.length !== world.cities.length ||
    !Array.isArray(v.officers) ||
    v.officers.length !== world.officers.length ||
    !Array.isArray(v.factions) ||
    v.factions.length !== world.factions.length
  )
    return false;
  const template = world.cities,
    roster = world.officers;
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
          ? o.cityId === null ||
            (v.version === 3 && cities.some((c) => c.id === o.cityId))
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
  if (
    v.status !==
    (owned === 0 ? "lost" : owned === cities.length ? "won" : "playing")
  )
    return false;
  if (
    !Array.isArray(v.events) ||
    v.events.length > B.eventLimit ||
    !v.events.every((e) => typeof e === "string") ||
    !Array.isArray(v.battles) ||
    v.battles.length > B.battleLimit
  )
    return false;
  if (v.version === 1 && v.pendingBattle != null) return false;
  if (
    (v.version === 2 || v.version === 3) &&
    !(
      v.pendingBattle === null ||
      validTactical(v.pendingBattle, v as unknown as GameState)
    )
  )
    return false;
  const state = v as unknown as GameState;
  if (!validDelegation(v.delegation, state)) return false;
  if (
    !state.officers.every(
      (o) =>
        (o.loyalty === undefined || int(o.loyalty, 0, 100)) &&
        (o.discovered === undefined || typeof o.discovered === "boolean") &&
        (o.retired === undefined || typeof o.retired === "boolean") &&
        (o.traits === undefined ||
          (Array.isArray(o.traits) &&
            o.traits.length <= 4 &&
            o.traits.every((t) =>
              ["猛將", "軍師", "能吏", "統御"].includes(t),
            ))),
    )
  )
    return false;
  if (
    !state.cities.every(
      (c) =>
        (c.scale === undefined || int(c.scale, 1, 3)) &&
        (c.governorId === undefined ||
          state.officers.some(
            (o) =>
              o.id === c.governorId &&
              o.cityId === c.id &&
              o.factionId === c.ownerId &&
              !o.retired,
          )),
    )
  )
    return false;
  if (v.version === 3) {
    if (
      !Array.isArray(state.diplomacy) ||
      state.diplomacy.length > ids.length * ids.length ||
      !state.diplomacy.every(
        (d) =>
          d &&
          ids.includes(d.a) &&
          ids.includes(d.b) &&
          d.a < d.b &&
          int(d.relation, -100, 100) &&
          int(d.allianceUntil, 0, 99999999) &&
          int(d.truceUntil, 0, 99999999) &&
          (d.contactUntil === undefined || int(d.contactUntil, 0, 99999999)),
      )
    )
      return false;
    if (
      new Set(state.diplomacy.map((d) => d.a + ":" + d.b)).size !==
      state.diplomacy.length
    )
      return false;
    if (!validResolution(state)) return false;
  }
  return v.battles.every(
    (b) =>
      record(b) &&
      ["from", "to", "commander"].every((k) => typeof b[k] === "string") &&
      ids.includes(String(b.attacker)) &&
      ids.includes(String(b.defender)) &&
      typeof b.won === "boolean" &&
      (b.defenseRouted === undefined ||
        int(b.defenseRouted, 0, B.maxResource)) &&
      (b.mode === undefined ||
        ["automatic", "tactical"].includes(String(b.mode))) &&
      (b.reason === undefined || typeof b.reason === "string") &&
      (b.tacticalEvents === undefined ||
        (Array.isArray(b.tacticalEvents) &&
          b.tacticalEvents.length <= T.maxEvents &&
          b.tacticalEvents.every((e) => typeof e === "string"))) &&
      (b.reinforcements === undefined ||
        (Array.isArray(b.reinforcements) &&
          b.reinforcements.length <= 2 &&
          new Set(b.reinforcements.map((r) => (record(r) ? r.cityId : null)))
            .size === b.reinforcements.length &&
          b.reinforcements.every(
            (r) =>
              record(r) &&
              cities.some((c) => c.id === r.cityId) &&
              roster.some((o) => o.id === r.officerId) &&
              ["sent", "loss", "survivors", "dispersed", "food"].every((k) =>
                int(r[k], 0, B.maxResource),
              ) &&
              Number(r.sent) > 0 &&
              Number(r.loss) + Number(r.survivors) === r.sent &&
              Number(r.dispersed) <= Number(r.survivors) &&
              r.food === Math.ceil(Number(r.sent) * B.foodPerTroop) &&
              (r.returnedTo === null
                ? r.dispersed === r.survivors
                : cities.some((c) => c.id === r.returnedTo)),
          ))) &&
      int(b.id, 0, 4294967295) &&
      [
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
// A malformed optional V3 structure must produce a recoverable load error,
// including values that cannot be accessed as the TypeScript model suggests.
export function isGameState(v: unknown): v is GameState {
  try {
    return validState(v);
  } catch {
    return false;
  }
}
export function serialize(s: GameState): string {
  return JSON.stringify(s);
}
export function deserialize(raw: string): GameState {
  const s: unknown = JSON.parse(raw);
  if (!isGameState(s))
    throw new Error("存檔版本不符或資料損毀。可確認刪除後開始新遊戲。");
  return migrate(s);
}
export function migrate(s: GameState): GameState {
  return s.version === 1
    ? { ...structuredClone(s), version: 2, pendingBattle: null }
    : s;
}
export function upgradeToV3(s: GameState): GameState {
  if (s.version === 3) return s;
  return {
    ...structuredClone(migrate(s)),
    version: 3,
    scenarioId: "legacy",
    diplomacy: [],
    monthResolution: null,
    pendingDefense: null,
  };
}
export function loadGame(): { state: GameState | null; error: string } {
  try {
    for (const [key, version] of [
      [SAVE_KEY, 3],
      [V2_SAVE_KEY, 2],
      [LEGACY_SAVE_KEY, 1],
    ] as const) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      if (JSON.parse(raw).version !== version)
        throw Error("版本與儲存位置不符");
      return { state: upgradeToV3(deserialize(raw)), error: "" };
    }
    return { state: null, error: "" };
  } catch {
    return {
      state: null,
      error:
        "無法讀取存檔：新版資料損毀或瀏覽器禁止儲存。沒有回退或覆寫舊進度；請先匯出備份，再明確復原V2／V1。",
    };
  }
}
export function saveGame(s: GameState): string {
  try {
    localStorage.setItem(SAVE_KEY, serialize(upgradeToV3(s)));
    return "";
  } catch {
    return "自動存檔失敗：請確認瀏覽器儲存權限或可用空間，離開前可能遺失進度。";
  }
}

export function restoreLegacy(): { state: GameState | null; error: string } {
  try {
    const raw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (raw === null) throw Error("沒有 V1 備份");
    if (JSON.parse(raw).version !== 1) throw Error("V1 格式錯誤");
    const s = upgradeToV3(deserialize(raw));
    const current = localStorage.getItem(SAVE_KEY);
    if (
      current !== null &&
      localStorage.getItem(SAVE_KEY + "-recovery-backup") === null
    )
      localStorage.setItem(SAVE_KEY + "-recovery-backup", current);
    localStorage.setItem(SAVE_KEY, serialize(s));
    return { state: s, error: "" };
  } catch {
    return {
      state: null,
      error: "無法復原 V1：備份不存在、已損毀或儲存空間不足。現有檔案未刪除。",
    };
  }
}
export function exportSave(): string {
  return JSON.stringify({
    v3: localStorage.getItem(SAVE_KEY),
    v2: localStorage.getItem(V2_SAVE_KEY),
    v1: localStorage.getItem(LEGACY_SAVE_KEY),
  });
}

export function restoreV2Backup(): { state: GameState | null; error: string } {
  try {
    const raw = localStorage.getItem(V2_SAVE_KEY);
    if (raw === null || JSON.parse(raw).version !== 2) throw Error("無V2備份");
    const state = upgradeToV3(deserialize(raw));
    const current = localStorage.getItem(SAVE_KEY);
    if (
      current !== null &&
      localStorage.getItem(SAVE_KEY + "-recovery-backup") === null
    )
      localStorage.setItem(SAVE_KEY + "-recovery-backup", current);
    localStorage.setItem(SAVE_KEY, serialize(state));
    return { state, error: "" };
  } catch {
    return {
      state: null,
      error: "V2備份不存在、損毀或儲存失敗；現有資料未刪除。",
    };
  }
}

/** Import only an explicitly chosen JSON backup; protect current channel's save first. */
export function importSaveBackup(raw: string): { state: GameState | null; error: string } {
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data)) throw Error("invalid backup");
    let state: GameState | null = null;
    for (const [field, version] of [["v3", 3], ["v2", 2], ["v1", 1]] as const) {
      const value = data[field];
      if (typeof value !== "string" || !value) continue;
      const object: unknown = JSON.parse(value);
      if (!record(object) || object.version !== version) throw Error("incorrect version");
      state = upgradeToV3(deserialize(value));
      break;
    }
    if (!state) throw Error("no usable backup");
    const previous = localStorage.getItem(SAVE_KEY);
    if (previous !== null) localStorage.setItem(SAVE_KEY + "-import-backup", previous);
    localStorage.setItem(SAVE_KEY, serialize(state));
    return { state, error: "" };
  } catch {
    return { state: null, error: "匯入失敗：檔案格式／存檔資料不合法或空間不足。原進度不會主動刪除。" };
  }
}
