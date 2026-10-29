import { playerSide, live } from "../../engine/tactical/control";
import type { TacticalState } from "../../engine/tactical/types";
import { nextTacticalUnit } from "../../engine/tactical/feedback";
export function selectionAfterUpdate(
  b: TacticalState,
  selected: string,
  previous?: { id: string; attacked: boolean },
): string {
  const current = b.units.find(
    (u) => u.id === selected && u.side === playerSide(b),
  );
  if (!current || !live(current)) return nextTacticalUnit(b, "");
  if (previous?.id === selected && !previous.attacked && current.attacked)
    return nextTacticalUnit(b, selected);
  return selected;
}
