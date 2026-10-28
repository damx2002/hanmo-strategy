import { it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { playCampaign } from "./helpers/playCampaign";

it("劉備從初始劇本以合法指令，經 AI 與月結完成統一", () => {
  const s = playCampaign(newGame("liu", 214019));
  expect(
    s.status,
    `${s.turn} 個月後有 ${s.cities.filter((c) => c.ownerId === "liu").length} 城`,
  ).toBe("won");
  expect(s.cities.every((c) => c.ownerId === "liu")).toBe(true);
  expect(s.battles.some((b) => b.won && b.attacker === "liu")).toBe(true);
});
