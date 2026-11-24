import { useState } from "react";
import type { GameState } from "../engine/types";
import {
  attackProhibition,
  relationOf,
  diplomaticChance,
} from "../engine/diplomacy";
import type { DiplomaticAction } from "../engine/diplomacy";
export function DiplomacyPanel({
  state,
  onAction,
  feedback,
}: {
  state: GameState;
  feedback?: string;
  onAction: (a: DiplomaticAction) => void;
}) {
  const [city, setCity] = useState(
      state.cities.find((c) => c.ownerId === state.playerId)?.id ?? "",
    ),
    [officer, setOfficer] = useState(""),
    [target, setTarget] = useState(""),
    [type, setType] = useState<DiplomaticAction["type"]>("gift");
  const available = state.officers.filter(
      (o) =>
        o.factionId === state.playerId &&
        o.cityId === city &&
        !o.acted &&
        !o.retired,
    ),
    effective = available.some((o) => o.id === officer)
      ? officer
      : (available[0]?.id ?? "");
  const a = {
    type,
    cityId: city,
    officerId: effective,
    targetFactionId: target,
  };
  return (
    <details className="system-panel">
      <summary>外交與勢力 · 同盟、停戰、贈禮</summary>
      <div className="faction-relations">
        {state.factions
          .filter((f) => f.id !== state.playerId && f.active)
          .map((f) => {
            const r = relationOf(state, state.playerId, f.id);
            return (
              <p key={f.id}>
                <strong style={{ color: f.color }}>{f.name}</strong> ·{" "}
                {state.cities.filter((c) => c.ownerId === f.id).length}城 · 關係{" "}
                {r?.relation ?? 0} ·{" "}
                {attackProhibition(state, state.playerId, f.id) || "無條約"}
                {r && Math.max(r.allianceUntil, r.truceUntil) > state.turn
                  ? ` 剩${Math.max(r.allianceUntil, r.truceUntil) - state.turn}月`
                  : ""}
              </p>
            );
          })}
      </div>
      <label>
        外交城池
        <select
          aria-label="外交城池"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          {state.cities
            .filter((c) => c.ownerId === state.playerId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.actions}令
              </option>
            ))}
        </select>
      </label>
      <label>
        使者
        <select
          aria-label="外交使者"
          value={effective}
          onChange={(e) => setOfficer(e.target.value)}
        >
          <option value="">選擇待命使者</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · 魅{o.charm}
            </option>
          ))}
        </select>
      </label>
      <label>
        目標勢力
        <select
          aria-label="外交目標"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">選擇勢力</option>
          {state.factions
            .filter((f) => f.active && f.id !== state.playerId)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        交涉
        <select
          aria-label="外交指令"
          value={type}
          onChange={(e) => setType(e.target.value as DiplomaticAction["type"])}
        >
          <option value="gift">贈禮 · 400金／關係+20</option>
          <option value="alliance">同盟六個月 · 300金</option>
          <option value="truce">停戰三個月 · 300金</option>
          <option value="break">解除條約 · 關係下降</option>
        </select>
      </label>
      <p className="hint">
        {type === "alliance" || type === "truce"
          ? `預估成功率 ${Math.round(diplomaticChance(state, a) * 100)}%；失敗仍消耗行動及金錢。`
          : "每次使用一令、一位使者；解除條約才能提前宣戰。"}
      </p>
      <button
        className="primary full"
        disabled={
          !target ||
          !effective ||
          !!state.monthResolution ||
          !!state.pendingBattle ||
          !!state.pendingDefense
        }
        onClick={() => onAction(a)}
      >
        執行外交
      </button>
      <p className="system-feedback" role="status">
        {feedback || "交涉成果會顯示於此，並記入軍情。"}
      </p>
    </details>
  );
}
