import { useEffect, useState } from "react";
import type { Battle, GameState } from "../engine/types";
const n = (x: number) => x.toLocaleString("zh-TW");
export function BattleReport({
  battle,
  state,
  onClose,
}: {
  battle: Battle;
  state?: GameState;
  onClose: () => void;
}) {
  const [animated, setAnimated] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setAnimated(false), 1200);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-title"
        className="modal battle-report"
      >
        <small>前 線 捷 報</small>
        <h2 id="battle-title">
          {battle.from} → {battle.to}
        </h2>
        <div className={`battle-flags ${animated ? "clash" : ""}`}>
          <span>⚑ 攻</span>
          <b>⚔</b>
          <span>守 ⚑</span>
        </div>
        {animated ? (
          <button autoFocus onClick={() => setAnimated(false)}>
            略過交戰動畫
          </button>
        ) : (
          <>
            <h3 className={battle.won ? "ready" : "danger"}>
              {battle.won ? "攻城得勝 · 占領成功" : "攻城失利 · 撤回原城"}
            </h3>
            <p>
              {battle.commander}率領 {n(battle.sent)} 兵出征
            </p>
            <div className="report-grid">
              <div>
                <small>進攻戰力</small>
                <b>{n(battle.attackPower)}</b>
                <small>攻軍傷亡</small>
                <b>{n(battle.attackLoss)}</b>
              </div>
              <div>
                <small>守城戰力</small>
                <b>{n(battle.defensePower)}</b>
                <small>守軍傷亡</small>
                <b>{n(battle.defenseLoss)}</b>
              </div>
            </div>
            <p>
              生還 {n(battle.survivors)} 人
              {battle.won ? `，隨主將進駐${battle.to}。` : "，已返回出發城池。"}
            </p>
            {!!battle.defenseRouted && (
              <p>
                守軍撤退／潰散 {n(battle.defenseRouted)} 人；已依剩餘領土結算。
              </p>
            )}
            {battle.reinforcements?.map((r) => (
              <p key={r.cityId}>
                援軍：
                {state?.cities.find((c) => c.id === r.cityId)?.name ?? r.cityId}{" "}
                · {state?.officers.find((o) => o.id === r.officerId)?.name} ·
                出兵{n(r.sent)}／傷亡{n(r.loss)}／生還{n(r.survivors)}，返回
                {state?.cities.find((c) => c.id === r.returnedTo)?.name ??
                  "無友城"}
                ，散去{n(r.dispersed)}；耗糧{n(r.food)}。
              </p>
            ))}
            {battle.tacticalEvents && (
              <details>
                <summary>戰術交戰明細</summary>
                <div className="summary-list">
                  {battle.tacticalEvents.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              </details>
            )}
            <button className="primary full" autoFocus onClick={onClose}>
              收閱戰報
            </button>
          </>
        )}
      </section>
    </div>
  );
}
