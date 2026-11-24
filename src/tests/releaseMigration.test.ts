import { afterEach, expect, it, vi } from "vitest";
import { newGame } from "../data/scenario";
import { newScenarioGame } from "../data/scenarios";
import { SAVE_KEY, V2_SAVE_KEY, PREVIEW_SAVE_KEY, serialize, loadGame, hasPreviewSave, restorePreviewSave, exportSave } from "../engine/save";

function mockStore() {
  const records = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, val: string) => { records.set(key, String(val)); },
    removeItem: (key: string) => { records.delete(key); },
    clear: () => records.clear(),
  });
  return records;
}
afterEach(() => vi.unstubAllGlobals());

it("正式 V0.2.3 V2 首次升級保留原始資料", () => {
  const db = mockStore(), original = serialize(newGame("liu", 42));
  db.set(V2_SAVE_KEY, original);
  const loaded = loadGame();
  expect(loaded.error).toBe("");
  expect(loaded.state?.version).toBe(3);
  expect(loaded.state?.scenarioId).toBe("legacy");
  expect(db.get(V2_SAVE_KEY)).toBe(original);
  expect(db.has(SAVE_KEY)).toBe(false);
});

it("預覽版 V3 不會自動取代既有正式版，明確恢復才備份並移轉", () => {
  const db = mockStore(), official = serialize(newScenarioGame("three214", "liu"));
  const preview = serialize(newScenarioGame("warlords194", "cao"));
  db.set(SAVE_KEY, official);
  db.set(PREVIEW_SAVE_KEY, preview);
  expect(hasPreviewSave()).toBe(true);
  expect(loadGame().state?.scenarioId).toBe("three214");
  const result = restorePreviewSave();
  expect(result.error).toBe("");
  expect(result.state?.scenarioId).toBe("warlords194");
  expect(db.get(SAVE_KEY)).toBe(preview);
  expect(db.get(SAVE_KEY + "-preview-recovery-backup")).toBe(official);
  expect(db.get(PREVIEW_SAVE_KEY)).toBe(preview);
  expect(JSON.parse(exportSave()).previewV3).toBe(preview);
});

it("預覽版資料損壞時不能覆蓋正式版", () => {
  const db = mockStore(), official = serialize(newScenarioGame("three214", "liu"));
  db.set(SAVE_KEY, official);
  db.set(PREVIEW_SAVE_KEY, "invalid-json");
  const result = restorePreviewSave();
  expect(result.state).toBeNull();
  expect(result.error).toBeTruthy();
  expect(db.get(SAVE_KEY)).toBe(official);
});
