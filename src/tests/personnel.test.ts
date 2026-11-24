import { it, expect } from "vitest";
import { newScenarioGame } from "../data/scenarios";
import {
  personnelDispatch,
  personnelReason,
  settlePersonnel,
  loyaltyOf,
} from "../engine/personnel";
import { dispatch } from "../engine/actions";
import { checkResult } from "../engine/game";
import { isGameState, deserialize, serialize } from "../engine/save";
function setup() {
  const s = newScenarioGame("three214", "liu", 1),
    c = s.cities.find((c) => c.ownerId === "liu")!,
    o = s.officers.find((o) => o.cityId === c.id && o.factionId === "liu")!,
    t = s.officers.find((o) => !o.factionId)!;
  t.cityId = c.id;
  t.discovered = false;
  t.retired = false;
  return { s, c, o, t };
}
it("搜尋花費真實指令與金錢，成功後才可登用", () => {
  const { s, c, o, t } = setup();
  const r = personnelDispatch(s, {
    type: "search",
    cityId: c.id,
    officerId: o.id,
  });
  expect(r.ok).toBe(true);
  expect(r.state.cities.find((x) => x.id === c.id)!.gold).toBe(c.gold - 200);
  expect(r.state.officers.find((x) => x.id === o.id)!.acted).toBe(true);
  expect(r.state.seed).not.toBe(s.seed);
  expect(
    r.state.officers.some(
      (x) => x.cityId === c.id && !x.factionId && x.discovered,
    ),
  ).toBe(true);
  expect(t.discovered).toBe(false);
});
it.each([1, 1600])("登用種子%i真實成功或失敗，不是必定加入", (seed) => {
  const { s, c, o, t } = setup();
  s.seed = seed;
  t.discovered = true;
  t.loyalty = 30;
  o.charm = 90;
  const a = {
    type: "hire" as const,
    cityId: c.id,
    officerId: o.id,
    targetOfficerId: t.id,
  };
  const r = personnelDispatch(s, a);
  expect(r.ok).toBe(true);
  expect(r.state.officers.find((x) => x.id === t.id)!.factionId).toBe(
    seed === 1 ? "liu" : null,
  );
  expect(personnelDispatch(s, a)).toEqual(r);
  expect(r.state.cities.find((x) => x.id === c.id)!.gold).toBe(c.gold - 500);
});
it("高忠誠敵將不允許無條件挖角；賞賜提高忠誠", () => {
  const { s, c, o, t } = setup();
  t.factionId = "cao";
  t.discovered = true;
  t.loyalty = 100;
  expect(
    personnelReason(s, {
      type: "hire",
      cityId: c.id,
      officerId: o.id,
      targetOfficerId: t.id,
    }),
  ).not.toBe("");
  t.factionId = "liu";
  t.loyalty = 50;
  const r = personnelDispatch(s, {
    type: "reward",
    cityId: c.id,
    officerId: o.id,
    targetOfficerId: t.id,
  });
  expect(r.ok).toBe(true);
  expect(
    loyaltyOf(r.state.officers.find((x) => x.id === t.id)!),
  ).toBeGreaterThan(50);
  expect(r.state.cities.find((x) => x.id === c.id)!.gold).toBe(c.gold - 200);
});
it("無資源、重複行動、錯誤駐地不扣資源", () => {
  const { s, c, o, t } = setup();
  c.gold = 0;
  const a = { type: "search" as const, cityId: c.id, officerId: o.id };
  expect(personnelDispatch(s, a).state).toBe(s);
  c.gold = 1000;
  o.acted = true;
  expect(personnelDispatch(s, a).ok).toBe(false);
  o.acted = false;
  o.cityId = s.cities[0].id;
  expect(personnelDispatch(s, a).ok).toBe(false);
});
it("太守任命與能吏實際提升發展，移動太守清除舊任", () => {
  const { s, c, o, t } = setup();
  t.factionId = "liu";
  t.loyalty = 80;
  t.politics = 100;
  delete c.governorId;
  const baseline = dispatch(s, {
    type: "farm",
    cityId: c.id,
    officerId: o.id,
  }).state.cities.find((x) => x.id === c.id)!.agriculture;
  const appoint = personnelDispatch(s, {
    type: "appoint",
    cityId: c.id,
    officerId: o.id,
    targetOfficerId: t.id,
  });
  expect(appoint.ok).toBe(true);
  expect(appoint.state.cities.find((x) => x.id === c.id)!.governorId).toBe(
    t.id,
  );
  const boosted = structuredClone(s);
  boosted.cities.find((x) => x.id === c.id)!.governorId = t.id;
  expect(
    dispatch(boosted, {
      type: "farm",
      cityId: c.id,
      officerId: o.id,
    }).state.cities.find((x) => x.id === c.id)!.agriculture,
  ).toBeGreaterThan(baseline);
  boosted.officers.find((x) => x.id === t.id)!.cityId = s.cities.find(
    (x) => x.ownerId === "liu" && x.id !== c.id,
  )!.id;
  expect(
    checkResult(boosted).cities.find((x) => x.id === c.id)!.governorId,
  ).toBeUndefined();
});
it("低忠誠離開與確知卒年退出，原人名紀錄不刪除", () => {
  const { s, c, o, t } = setup();
  o.loyalty = 0;
  c.food = 0;
  const before = s.officers.length;
  settlePersonnel(s);
  expect(o.factionId).toBeNull();
  t.died = 214;
  s.year = 215;
  settlePersonnel(s);
  expect(t.retired).toBe(true);
  expect(s.officers.length).toBe(before);
  expect(
    checkResult(s).cities.every(
      (c) =>
        !c.governorId ||
        s.officers.some((o) => o.id === c.governorId && !o.retired),
    ),
  ).toBe(true);
});
it("人事存檔保留駐地、忠誠及搜尋狀態", () => {
  const { s, c, o, t } = setup();
  const r = personnelDispatch(s, {
    type: "search",
    cityId: c.id,
    officerId: o.id,
  });
  expect(isGameState(r.state)).toBe(true);
  expect(deserialize(serialize(r.state))).toEqual(r.state);
});
