import { it, expect } from "vitest";
import { newScenarioGame } from "../data/scenarios";
import { isGameState } from "../engine/save";
import { playWorldCampaign } from "./helpers/playWorldCampaign";
import { simulateWorld } from "./helpers/simulateWorld";
it("41城新劇本以合法內政、補給、出征及防守完成統一", () => {
  const r = playWorldCampaign(newScenarioGame("three214", "cao", 214030));
  expect(
    r.state.status,
    `${r.state.turn}月，${r.state.cities.filter((c) => c.ownerId === "cao").length}城`,
  ).toBe("won");
  expect(r.state.cities.every((c) => c.ownerId === "cao")).toBe(true);
  expect(r.orders).toBeGreaterThan(100);
  expect(r.captures).toBeGreaterThan(10);
  expect(r.invasions).toBeGreaterThan(0);
  expect(isGameState(r.state)).toBe(true);
  console.info("新世界玩家戰役", {
    months: r.state.turn,
    orders: r.orders,
    captures: r.captures,
    defenses: r.invasions,
  });
}, 60000);
it.each([194030, 214030])(
  "多勢力AI長期演進與資源安全，種子%i",
  (seed) => {
    const r = simulateWorld(newScenarioGame("three214", "cao", seed), 120);
    expect(r.state.turn).toBeGreaterThan(24);
    expect(r.attacks).toBeGreaterThan(10);
    expect(r.captures).toBeGreaterThan(10);
    expect(r.attackingFactions.length).toBeGreaterThanOrEqual(3);
    expect(r.hires).toBeGreaterThan(0);
    expect(r.state.diplomacy!.length).toBeGreaterThan(0);
    expect(r.emptyFood).toBeLessThan(
      r.state.turn * r.state.cities.length * 0.05,
    );
    expect(r.state.cities.reduce((n, c) => n + c.food, 0)).toBeGreaterThan(0);
    expect(isGameState(r.state)).toBe(true);
    console.info("多勢力長期AI", {
      seed,
      months: r.state.turn,
      attacks: r.attacks,
      captures: r.captures,
      hires: r.hires,
      emptyFoodCityMonths: r.emptyFood,
      attackingFactions: r.attackingFactions,
    });
  },
  60000,
);
it("群雄17勢力同種子意圖、外交與多次月結可重現", () => {
  const initial = newScenarioGame("warlords194", "biao", 194030),
    snapshot = JSON.stringify(initial);
  const a = simulateWorld(initial, 18),
    b = simulateWorld(initial, 18);
  expect(JSON.stringify(initial)).toBe(snapshot);
  expect(a).toEqual(b);
  expect(a.attacks).toBeGreaterThan(10);
  expect(a.attackingFactions.length).toBeGreaterThanOrEqual(6);
  expect(a.captures).toBeGreaterThan(5);
  console.info("群雄AI決定性", {
    months: a.state.turn,
    attacks: a.attacks,
    captures: a.captures,
    factions: a.attackingFactions.length,
  });
}, 60000);
