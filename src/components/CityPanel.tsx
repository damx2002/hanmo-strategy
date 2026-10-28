import type { Action, City, GameState } from "../engine/types";
import { income } from "../engine/economy";
import { ActionPanel } from "./ActionPanel";
import { OfficerPanel } from "./OfficerPanel";
export function CityPanel({
  onManual,
  feedback,
  state,
  city,
  onAction,
  locked,
  onTarget,
}: {
  onManual?: (a: Extract<Action, { targetId: string }>) => void;
  feedback?: string;
  state: GameState;
  city: City;
  onAction: (a: Action) => void;
  locked: boolean;
  onTarget: (id?: string) => void;
}) {
  const f = state.factions.find((f) => f.id === city.ownerId)!,
    i = income(city);
  const officers = state.officers.filter((o) => o.cityId === city.id);
  return (
    <aside className="city-panel">
      <div className="city-title">
        <div>
          <small>城 池 情 報</small>
          <h2>{city.name}</h2>
        </div>
        <span
          className="faction-badge"
          style={{ color: f.color, borderColor: f.color }}
        >
          {f.name}軍
        </span>
      </div>
      <div className="resources">
        {[
          ["金錢", city.gold],
          ["兵糧", city.food],
          ["兵力", city.troops],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{Number(value).toLocaleString("zh-TW")}</strong>
          </div>
        ))}
      </div>
      <div className="stats">
        {[
          ["農業", city.agriculture],
          ["商業", city.commerce],
          ["治安", city.security],
          ["訓練", city.training],
          ["城防", city.defense],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <meter
              min="0"
              max="100"
              value={Number(value)}
              aria-label={String(label)}
            />
            <b>{value}</b>
          </div>
        ))}
      </div>
      <p className="hint">
        月入：金 {i.gold.toLocaleString("zh-TW")} ／ 糧{" "}
        {i.food.toLocaleString("zh-TW")}
        <br />
        軍糧支出：{i.upkeep.toLocaleString("zh-TW")} ／ 月
      </p>
      <details open>
        <summary>駐城武將 · {officers.length}人</summary>
        <OfficerPanel officers={officers} compact />
      </details>
      {city.ownerId === state.playerId && state.status === "playing" ? (
        <ActionPanel
          key={`${city.id}-${state.turn}`}
          state={state}
          city={city}
          onAction={onAction}
          onManual={onManual}
          feedback={feedback}
          locked={locked}
          onTarget={onTarget}
        />
      ) : (
        <p className="enemy-note">
          {city.ownerId === state.playerId
            ? "天下大勢已定。"
            : "敵境情報 · 請由相鄰己方城池出征。"}
        </p>
      )}
    </aside>
  );
}
