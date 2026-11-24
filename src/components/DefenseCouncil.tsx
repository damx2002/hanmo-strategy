import { useState } from "react";
import type { GameState } from "../engine/types";
import type { Reinforcement } from "../engine/resolution/types";
import { reinforcementReason } from "../engine/resolution/defense";
export function DefenseCouncil({
  state,
  onResolve,
}: {
  state: GameState;
  onResolve: (
    mode: "manual" | "auto",
    reinforcements: Omit<Reinforcement, "food">[],
  ) => void;
}) {
  const p = state.pendingDefense!,
    target = state.cities.find((c) => c.id === p.order.targetId)!,
    source = state.cities.find((c) => c.id === p.order.cityId)!;
  const [home, setHome] = useState(""),
    [officer, setOfficer] = useState(""),
    [troops, setTroops] = useState(1000),
    [army, setArmy] = useState<Omit<Reinforcement, "food">[]>([]);
  const candidates = state.cities.filter(
    (c) =>
      c.ownerId === state.playerId &&
      target.neighbors.includes(c.id) &&
      !army.some((r) => r.cityId === c.id),
  );
  const reason = reinforcementReason(
    state,
    { cityId: home, officerId: officer, troops },
    army.map((r) => r.cityId),
  );
  return (
    <div className="overlay">
      <section
        className="modal defense-council"
        role="dialog"
        aria-modal="true"
        aria-labelledby="defense-title"
      >
        <h2 id="defense-title">敵軍來襲 · {target.name}</h2>
        <p>
          {state.factions.find((f) => f.id === p.attackerId)?.name}軍由
          {source.name}進攻，出兵 {p.order.troops.toLocaleString("zh-TW")}
          。本城守軍 {target.troops.toLocaleString("zh-TW")}，城防{" "}
          {target.defense}。
        </p>
        <p className="hint">
          月份已暫停並儲存；選定作戰方式後才扣兵糧。可由至多兩座相鄰己城派援軍，生還者戰後返回來源城。
        </p>
        <details>
          <summary>請求友城援軍 · 已選 {army.length} 隊</summary>
          <label>
            援軍來源
            <select
              aria-label="援軍來源"
              value={home}
              onChange={(e) => {
                setHome(e.target.value);
                setOfficer("");
              }}
            >
              <option value="">選擇相鄰己城</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.troops}兵 · {c.actions}令
                </option>
              ))}
            </select>
          </label>
          <label>
            援軍武將
            <select
              aria-label="援軍武將"
              value={officer}
              onChange={(e) => setOfficer(e.target.value)}
            >
              <option value="">選擇待命武將</option>
              {state.officers
                .filter(
                  (o) =>
                    o.cityId === home &&
                    o.factionId === state.playerId &&
                    !o.acted,
                )
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            援軍兵力
            <input
              aria-label="援軍兵力"
              type="number"
              min="1"
              value={troops}
              onChange={(e) => setTroops(Number(e.target.value))}
            />
          </label>
          <button
            disabled={!!reason || army.length >= 2}
            title={reason}
            onClick={() => {
              setArmy([...army, { cityId: home, officerId: officer, troops }]);
              setHome("");
              setOfficer("");
            }}
          >
            加入援軍
          </button>
          <small>{reason}</small>
        </details>
        {army.map((r, i) => (
          <p key={r.cityId}>
            {state.cities.find((c) => c.id === r.cityId)?.name}援軍 {r.troops} ·
            糧 {Math.ceil(r.troops * 0.22)}{" "}
            <button onClick={() => setArmy(army.filter((_, j) => i !== j))}>
              移除
            </button>
          </p>
        ))}
        <div className="button-row">
          <button className="primary" onClick={() => onResolve("manual", army)}>
            親自守城
          </button>
          <button onClick={() => onResolve("auto", army)}>委任防守</button>
        </div>
      </section>
    </div>
  );
}
