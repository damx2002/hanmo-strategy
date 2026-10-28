import { useState } from "react";
import type { TacticalState, Unit } from "../../engine/tactical/types";
import { reachable } from "../../engine/tactical/movement";
import { canAttack, fireReason } from "../../engine/tactical/damage";
import {
  terrainNames,
  troopNames,
} from "../../engine/tactical/tacticalBalance";
export function TacticalMap({
  battle,
  selected,
  mode,
  onCell,
}: {
  battle: TacticalState;
  selected: Unit | undefined;
  mode: "move" | "attack" | "fire";
  onCell: (x: number, y: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const moves = selected && mode === "move" ? reachable(battle, selected) : [];
  return (
    <section className="tactical-map-frame">
      <div className="tactical-map-heading">
        <span>戰場輿圖 · 8 × 6</span>
        <div className="zoom">
          <button
            aria-label="縮小戰場"
            disabled={zoom <= 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.25))}
          >
            −
          </button>
          <button aria-label="重設戰場縮放" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="放大戰場"
            disabled={zoom >= 2}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            ＋
          </button>
        </div>
      </div>
      <div className="tactical-scroll" tabIndex={0} aria-label="戰場捲動區">
        <div
          className="battle-grid"
          role="group"
          aria-label="八乘六戰術棋盤"
          style={{ width: `max(100%, ${zoom * 448}px)` }}
        >
          {battle.map.flatMap((row, y) =>
            row.map((terrain, x) => {
              const unit = battle.units.find(
                  (u) => u.troops > 0 && u.x === x && u.y === y,
                ),
                move = moves.some((p) => p.x === x && p.y === y);
              const target =
                selected &&
                unit &&
                (mode === "attack"
                  ? canAttack(battle, selected, unit)
                  : mode === "fire" && !fireReason(battle, selected, unit));
              return (
                <button
                  key={`${x}-${y}`}
                  data-x={x}
                  data-y={y}
                  className={`battle-cell ${x === 7 && y === 2 ? "cell-keep" : ""} terrain-${terrain} ${unit ? `side-${unit.side}` : ""} ${selected?.id === unit?.id && unit ? "unit-selected" : ""} ${unit?.attacked ? "unit-acted" : ""} ${move ? "cell-move" : ""} ${target ? "cell-target" : ""}`}
                  aria-label={`${x + 1}列${y + 1}行 ${x === 7 && y === 2 ? "內城據點 " : ""}${terrainNames[terrain]}${unit ? ` ${unit.side === "attacker" ? "我軍" : "敵軍"}${troopNames[unit.type]} ${unit.troops.toLocaleString("zh-TW")}兵` : ""}${move ? " 可移動" : ""}${target ? " 可攻擊" : ""}`}
                  onClick={() => onCell(x, y)}
                >
                  <small className="tile-terrain">
                    {terrain === "forest"
                      ? "林"
                      : terrain === "hill"
                        ? "丘"
                        : terrain === "city"
                          ? x === 7 && y === 2
                            ? "內城"
                            : "城"
                          : terrain === "gate"
                            ? "門"
                            : ""}
                  </small>
                  {unit ? (
                    <>
                      <span className="unit-banner">
                        ⚑{troopNames[unit.type][0]}
                      </span>
                      <strong>
                        {unit.troops < 10000
                          ? unit.troops.toLocaleString("zh-TW")
                          : `${(unit.troops / 10000).toFixed(1)}萬`}
                      </strong>
                    </>
                  ) : terrain === "gate" ? (
                    <span className="gate-art">
                      {battle.gate.hp > 0 ? "▥" : "破"}
                    </span>
                  ) : (
                    <span className="terrain-art" aria-hidden="true">
                      {terrain === "forest"
                        ? "♠"
                        : terrain === "hill"
                          ? "▴"
                          : terrain === "city"
                            ? x === 7 && y === 2
                              ? "⚑"
                              : "▥"
                            : "·"}
                    </span>
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <p className="hint map-key">
        金框：選取 · 綠格：可移動 · 紅框：可攻擊 · 金旗：內城據點
        <br />
        步／騎相鄰攻擊；弓射程 2 格，高地 3 格。點擊己軍選取，再點合法目標。
      </p>
    </section>
  );
}
