import { useState } from "react";
import type { GameState } from "../engine/types";
import type { PersonnelAction } from "../engine/personnel";
import { personnelReason } from "../engine/personnel";
export function PersonnelPanel({
  state,
  onAction,
  feedback,
}: {
  state: GameState;
  feedback?: string;
  onAction: (a: PersonnelAction) => void;
}) {
  const [city, setCity] = useState(
      state.cities.find((c) => c.ownerId === state.playerId)?.id ?? "",
    ),
    [actor, setActor] = useState(""),
    [target, setTarget] = useState(""),
    [type, setType] = useState<PersonnelAction["type"]>("search");
  const town = state.cities.find(
    (c) => c.id === city && c.ownerId === state.playerId,
  );
  const available = state.officers.filter(
    (o) =>
      o.factionId === state.playerId &&
      o.cityId === city &&
      !o.acted &&
      !o.retired,
  );
  const effective = available.some((o) => o.id === actor)
    ? actor
    : (available[0]?.id ?? "");
  const options = state.officers.filter(
    (o) =>
      !o.retired &&
      (type === "hire"
        ? (o.discovered ?? !!o.factionId) &&
          o.factionId !== state.playerId &&
          !!o.cityId &&
          (o.cityId === city || !!town?.neighbors.includes(o.cityId))
        : o.factionId === state.playerId && o.cityId === city),
  );
  const a = {
      type,
      cityId: city,
      officerId: effective,
      targetOfficerId: target,
    },
    reason = personnelReason(state, a);
  return (
    <details className="system-panel">
      <summary>人事 · 搜尋、登用、賞賜與太守</summary>
      <label>
        人事城池
        <select
          aria-label="人事城池"
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setTarget("");
          }}
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
        執行武將
        <select
          aria-label="人事執行武將"
          value={effective}
          onChange={(e) => setActor(e.target.value)}
        >
          <option value="">選擇待命武將</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · 魅{o.charm} 政{o.politics}
            </option>
          ))}
        </select>
      </label>
      <label>
        人事指令
        <select
          aria-label="人事指令"
          value={type}
          onChange={(e) => {
            setType(e.target.value as PersonnelAction["type"]);
            setTarget("");
          }}
        >
          <option value="search">搜尋人才 · 200金</option>
          <option value="hire">登用人才／招攬低忠誠敵將 · 500金</option>
          <option value="reward">賞賜 · 200金</option>
          <option value="appoint">任命太守 · 一令一將</option>
        </select>
      </label>
      {type !== "search" && (
        <label>
          目標武將
          <select
            aria-label="人事目標武將"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">選擇目標</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · 忠{o.loyalty ?? 80} ·{" "}
                {state.cities.find((c) => c.id === o.cityId)?.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        className="primary full"
        disabled={!!reason}
        title={reason}
        onClick={() => onAction(a)}
      >
        執行人事
      </button>
      <p className="hint">
        {reason ||
          "登用有機率；失敗仍花費資源與行動。太守提升農商發展，賞賜可抵抗敵方招攬。"}
      </p>
      <p className="system-feedback" role="status">
        {feedback || "搜尋、登用或賞賜的實際結果會顯示於此。"}
      </p>
      <p className="hint">
        本城未發現人才{" "}
        {
          state.officers.filter(
            (o) =>
              o.cityId === city && !o.factionId && !o.retired && !o.discovered,
          ).length
        }{" "}
        名。武將可由城務「調動」攜兵糧移往相鄰己城。
      </p>
    </details>
  );
}
