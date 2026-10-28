import type { TacticalState } from "../../engine/tactical/types";
import { nextTacticalUnit } from "../../engine/tactical/feedback";
export function selectionAfterUpdate(
  b: TacticalState,
  selected: string,
  previous?: { id: string; attacked: boolean },
): string {
  const current = b.units.find(
    (u) => u.id === selected && u.side === "attacker",
  );
  if (!current || current.troops <= 0) return nextTacticalUnit(b, "");
  if (previous?.id === selected && !previous.attacked && current.attacked)
    return nextTacticalUnit(b, selected);
  return selected;
}
