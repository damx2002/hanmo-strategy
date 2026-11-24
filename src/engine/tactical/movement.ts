import { live } from "./control";
import type { TacticalState, Unit } from "./types";
import { T } from "./tacticalBalance";
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const inside = (x: number, y: number) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 0 &&
  x < T.width &&
  y >= 0 &&
  y < T.height;
export function movementCost(b: TacticalState, u: Unit, x: number, y: number) {
  return u.type === "cavalry" && ["forest", "hill"].includes(b.map[y][x])
    ? 2
    : 1;
}
export function reachable(
  b: TacticalState,
  u: Unit,
): { x: number; y: number; cost: number }[] {
  if (!live(u) || u.moved || u.attacked) return [];
  const queue = [{ x: u.x, y: u.y, cost: 0 }],
    best = new Map([[`${u.x},${u.y}`, 0]]);
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const p = queue.shift()!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx,
        y = p.y + dy;
      if (!inside(x, y)) continue;
      if (
        b.units.some((v) => live(v) && v.id !== u.id && v.x === x && v.y === y)
      )
        continue;
      if (u.side === "attacker" && x >= 6 && b.gate.hp > 0) continue;
      const cost = p.cost + movementCost(b, u, x, y),
        key = `${x},${y}`;
      if (cost > T.movement[u.type] || cost >= (best.get(key) ?? Infinity))
        continue;
      best.set(key, cost);
      queue.push({ x, y, cost });
    }
  }
  return [...best]
    .filter(([k]) => k !== `${u.x},${u.y}`)
    .map(([key, cost]) => {
      const [x, y] = key.split(",").map(Number);
      return { x, y, cost };
    });
}
