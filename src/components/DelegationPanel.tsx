import type { City, GameState } from "../engine/types";
import type { Policy } from "../engine/delegation/types";
import { getPolicy, policyNames, isBorder } from "../engine/delegation/policy";
export function DelegationPanel({
  state,
  city,
  locked,
  onPolicy,
  onBatch,
}: {
  state: GameState;
  city: City;
  locked: boolean;
  onPolicy: (id: string, policy: Policy) => void;
  onBatch: (policy: "balanced" | "manual") => void;
}) {
  if (city.ownerId !== state.playerId || state.status !== "playing")
    return null;
  const rear = state.cities.filter(
    (c) => c.ownerId === state.playerId && !isBorder(state, c),
  ).length;
  return (
    <section
      className="delegation-settings"
      aria-label={`${city.name}治理設定`}
    >
      <label>
        治理方針
        <select
          aria-label={`${city.name}治理方針`}
          value={getPolicy(state, city.id)}
          disabled={locked || !!state.pendingBattle}
          onChange={(e) => onPolicy(city.id, e.target.value as Policy)}
        >
          {Object.entries(policyNames).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <p className="delegation-note">
        設定免費。手動下令優先；結束本月時，委任才使用剩餘指令與待命武將。保留基本金糧，可不下令。
      </p>
      <details>
        <summary>委任說明與批次設定</summary>
        <p className="hint">
          均衡補短板；經濟發展農商、不徵兵；軍備維持兵糧後徵訓；防禦重視城防、治安與守軍。委任不會出征或調動。
        </p>
        <div className="delegation-batch">
          <button
            disabled={locked || !rear}
            onClick={() => onBatch("balanced")}
          >
            批次委任後方城池 · {rear}
          </button>
          <button disabled={locked || !rear} onClick={() => onBatch("manual")}>
            取消後方委任
          </button>
        </div>
        <p className="hint">須確認後才變更；前線城池保持原設定。</p>
      </details>
    </section>
  );
}
