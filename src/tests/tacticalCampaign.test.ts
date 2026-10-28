import { it, expect } from "vitest";
import { newGame } from "../data/scenario";
import { playCampaign } from "./helpers/playCampaign";
import { beginTactical } from "../engine/tactical/createBattle";
import { runTacticalPhase } from "../engine/tactical/ai";
import { completeTactical } from "../engine/tactical/resolve";
import { dispatch } from "../engine/actions";
import { deserialize, serialize } from "../engine/save";
it("從原始劉備劇本交替親征與委任，戰中讀檔後仍能統一十二城", () => {
  let manual = 0,
    total = 0;
  const s = playCampaign(newGame("liu", 214019), (state, action) => {
    total++;
    if (total % 2 === 0) {
      const r = dispatch(state, { ...action, type: "attack" });
      expect(r.ok).toBe(true);
      return r.state;
    }
    manual++;
    const start = beginTactical(state, action);
    expect(start.ok).toBe(true);
    let n = start.state,
      b = n.pendingBattle!;
    for (let i = 0; i < 32 && b.status === "active"; i++) {
      b = runTacticalPhase(b, b.phase);
      n = deserialize(serialize({ ...n, pendingBattle: b, seed: b.seed }));
      b = n.pendingBattle!;
    }
    expect(b.status).not.toBe("active");
    const r = completeTactical(n, b.id);
    expect(r.ok).toBe(true);
    return r.state;
  });
  expect(manual).toBeGreaterThan(0);
  expect(total).toBeGreaterThan(manual);
  expect(s.status).toBe("won");
  expect(s.cities.every((c) => c.ownerId === "liu")).toBe(true);
});
