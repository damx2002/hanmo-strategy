import { getPolicy, policyShort } from "../engine/delegation/policy";
import type { City, GameState } from "../engine/types";
import { cityReadiness, adjacentExpeditions } from "./cityOverview";
const n = (v: number) => v.toLocaleString("zh-TW");
export function CityOverview({
  state,
  selected,
  onSelect,
}: {
  state: GameState;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <details className="city-overview">
      <summary>
        己方城池總覽 ·{" "}
        {state.cities.filter((c) => c.ownerId === state.playerId).length} 城
      </summary>
      <div className="city-overview-list">
        {state.cities
          .filter((c) => c.ownerId === state.playerId)
          .map((c) => {
            const r = cityReadiness(state, c);
            return (
              <button
                className={`city-overview-card ${c.id === selected ? "current-city" : ""}`}
                key={c.id}
                onClick={() => onSelect(c.id)}
              >
                <strong>
                  {c.name}{" "}
                  <small>
                    {r.border ? "邊境" : "腹地"} ·{" "}
                    {policyShort[getPolicy(state, c.id)]}
                  </small>
                </strong>
                <span>
                  兵 {n(c.troops)} · 金 {n(c.gold)} · 糧 {n(c.food)}
                </span>
                <span>
                  剩餘 {c.actions} 令 · 待命 {r.ready} 將{" "}
                  <b
                    className={
                      r.reason === "可下令" ? "ready" : "city-unavailable"
                    }
                  >
                    {r.reason}
                  </b>
                </span>
              </button>
            );
          })}
      </div>
    </details>
  );
}
export function EnemyApproaches({
  state,
  city,
  onSelect,
}: {
  state: GameState;
  city: City;
  onSelect: (id: string) => void;
}) {
  if (city.ownerId === state.playerId) return null;
  const sources = adjacentExpeditions(state, city);
  return (
    <div className="enemy-approaches">
      <strong>
        敵軍城池 · {state.factions.find((f) => f.id === city.ownerId)?.name}軍
      </strong>
      <p>此城屬於敵軍，無法執行己方內政。由相鄰己城出征：</p>
      {sources.length ? (
        sources.map(({ city: c, reason }) => (
          <button key={c.id} onClick={() => onSelect(c.id)}>
            {c.name} → 城務 <small>{reason}</small>
          </button>
        ))
      ) : (
        <p className="hint">目前沒有相鄰己城，須先擴展領土。</p>
      )}
    </div>
  );
}
