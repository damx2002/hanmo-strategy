import { useEffect, useRef, useState } from "react";
import type { CombatFeedback } from "../../engine/tactical/types";
const empty: CombatFeedback[] = [];
// Presentation only: no timers here can issue combat actions or alter a GameState.
export function useCombatFeedback(
  events: CombatFeedback[] | undefined,
  skip: boolean,
) {
  const list = events ?? empty,
    last = list.at(-1)?.sequence ?? 0;
  const seen = useRef(last),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState<CombatFeedback[]>([]);
  useEffect(() => {
    if (last <= seen.current) return;
    const fresh = list.filter((f) => f.sequence > seen.current);
    seen.current = last;
    setVisible(fresh);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible([]), skip ? 1000 : 900);
  }, [list, last, skip]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return visible;
}
