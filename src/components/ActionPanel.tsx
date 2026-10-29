import { attackProhibition } from "../engine/diplomacy";
import { useEffect, useState } from "react";
import type { Action, City, Domestic, GameState } from "../engine/types";
import { B, actionNames } from "../engine/balance";
import { defenderFor, estimate } from "../engine/combat";
import { domesticReason } from "../engine/domestic";
import { nextAvailableOfficer } from "./actionSelection";
const n = (v: number) => v.toLocaleString("zh-TW");
export function ActionPanel({
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
  const [assist, setAssist] = useState<string[]>([]);
  const [type, setType] = useState<Domestic | "attack" | "transfer">("farm");
  const officers = state.officers.filter(
    (o) => o.cityId === city.id && o.factionId === state.playerId,
  );
  const [preferredOfficerId, setOfficer] = useState(
    officers.find((o) => !o.acted)?.id ?? "",
  );
  const officerId = nextAvailableOfficer(officers, preferredOfficerId);
  // Sync only when the effective selection changes, never on a new array reference.
  useEffect(() => {
    if (preferredOfficerId !== officerId) setOfficer(officerId);
  }, [officerId, preferredOfficerId]);
  const [targetId, setTarget] = useState("");
  const [troops, setTroops] = useState(Math.max(0, city.troops - B.guard));
  const [food, setFood] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const targets = state.cities.filter(
    (c) =>
      city.neighbors.includes(c.id) &&
      (type === "attack"
        ? c.ownerId !== city.ownerId
        : c.ownerId === city.ownerId),
  );
  const officer = officers.find((o) => o.id === officerId),
    target = targets.find((c) => c.id === targetId);
  const military = type === "attack" || type === "transfer";
  const maxTroops = Math.max(0, city.troops - B.guard);
  const reason = locked
    ? "月份結算中"
    : type === "attack" &&
        target &&
        attackProhibition(state, city.ownerId, target.ownerId)
      ? attackProhibition(state, city.ownerId, target.ownerId)
      : city.actions === 0
        ? "本城本月指令已用盡，請結束本月"
        : !officer
          ? officers.length
            ? "本城武將已全部行動"
            : "本城沒有可用武將，請由友城調入"
          : officer.acted
            ? "此武將本月已行動"
            : military && !target
              ? "請選擇相鄰目標城池"
              : military &&
                  (!Number.isSafeInteger(troops) ||
                    troops < 0 ||
                    troops > maxTroops ||
                    (type === "attack" && troops === 0))
                ? "兵力不合法"
                : type === "transfer" &&
                    (!Number.isSafeInteger(food) ||
                      food < 0 ||
                      food > city.food)
                  ? "調動兵糧不合法"
                  : type === "attack" &&
                      city.food < Math.ceil(troops * B.foodPerTroop)
                    ? "出征兵糧不足"
                    : !military
                      ? domesticReason(city, type as Domestic)
                      : "";
  function commandReason(command: keyof typeof actionNames) {
    if (locked) return "月份結算中";
    if (!city.actions) return "本城本月指令已用盡";
    if (!officer)
      return officers.length ? "本城武將已全部行動" : "本城沒有可用武將";
    if (command === "attack" || command === "transfer") {
      if (
        !state.cities.some(
          (c) =>
            city.neighbors.includes(c.id) &&
            (command === "attack"
              ? c.ownerId !== city.ownerId
              : c.ownerId === city.ownerId),
        )
      )
        return "沒有合法的相鄰目標";
      if (command === "attack" && city.troops <= B.guard)
        return "兵力不足，必須留下基本守軍";
      return "";
    }
    return domesticReason(city, command);
  }
  const action = (): Action =>
    military
      ? {
          type: type as "attack" | "transfer",
          cityId: city.id,
          officerId,
          targetId,
          troops,
          food,
          ...(type === "attack" && state.version === 3
            ? {
                officerIds: [
                  officerId,
                  ...assist.filter(
                    (id) =>
                      id !== officerId &&
                      officers.some((o) => o.id === id && !o.acted),
                  ),
                ].slice(0, 3),
              }
            : {}),
        }
      : { type: type as Domestic, cityId: city.id, officerId };
  const prediction =
    target && officer
      ? estimate(
          city,
          target,
          officer,
          defenderFor(state.officers, target),
          troops,
        )
      : null;
  return (
    <section className="commands">
      <h3>
        施政軍令 <span>本月剩餘 {city.actions}／3</span>
      </h3>
      <p className="action-feedback" role="status">
        {feedback || "下令後將在此顯示實際成果。"}
      </p>
      <div className="command-grid">
        {(Object.keys(actionNames) as (keyof typeof actionNames)[]).map((t) => (
          <button
            className={type === t ? "chosen" : ""}
            key={t}
            disabled={!!commandReason(t)}
            title={commandReason(t) || actionNames[t]}
            aria-pressed={type === t}
            onClick={() => {
              setType(t);
              setTarget("");
              onTarget(undefined);
            }}
          >
            {actionNames[t]}
          </button>
        ))}
      </div>
      <label>
        指揮武將
        <select value={officerId} onChange={(e) => setOfficer(e.target.value)}>
          <option value="">
            {officers.length && !officerId
              ? "本城武將已全部行動"
              : "選擇本城武將"}
          </option>
          {officers.map((o) => (
            <option key={o.id} value={o.id} disabled={o.acted}>
              {o.name}
              {o.acted ? " · 已行動" : ""}
            </option>
          ))}
        </select>
      </label>
      {type === "attack" && state.version === 3 && (
        <details className="army-roster">
          <summary>參戰武將 · 主將外最多兩人</summary>
          <div>
            {officers
              .filter((o) => !o.acted && o.id !== officerId)
              .map((o) => (
                <label key={o.id}>
                  <input
                    type="checkbox"
                    checked={assist.includes(o.id)}
                    disabled={!assist.includes(o.id) && assist.length >= 2}
                    onChange={(e) =>
                      setAssist(
                        e.target.checked
                          ? [...assist, o.id]
                          : assist.filter((id) => id !== o.id),
                      )
                    }
                  />
                  {o.name} · 統{o.leadership} · {o.traits?.join("／")}
                </label>
              ))}
          </div>
          <p className="hint">
            參戰者均消耗本月武將行動；每城仍只用一令。不同單位由參戰武將統率。
          </p>
        </details>
      )}
      {military ? (
        <>
          <label>
            {type === "attack" ? "攻城目標" : "調動目的地"}
            <select
              value={targetId}
              onChange={(e) => {
                setTarget(e.target.value);
                onTarget(e.target.value);
              }}
            >
              <option value="">
                選擇相鄰{type === "attack" ? "敵" : "友"}城
              </option>
              {targets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {n(c.troops)}兵
                </option>
              ))}
            </select>
          </label>
          <label>
            派遣兵力{" "}
            <small>
              最多 {n(maxTroops)}，留守 {B.guard}
            </small>
            <input
              aria-label="派遣兵力"
              type="number"
              min={type === "attack" ? 1 : 0}
              max={maxTroops}
              step="1"
              value={troops}
              onChange={(e) => setTroops(Number(e.target.value))}
            />
          </label>
          <input
            aria-label="調整派遣兵力"
            type="range"
            min="0"
            max={maxTroops}
            step="100"
            value={Math.min(troops, maxTroops)}
            onChange={(e) => setTroops(Number(e.target.value))}
          />
          {type === "transfer" ? (
            <label>
              隨軍兵糧
              <input
                type="number"
                min="0"
                max={city.food}
                value={food}
                onChange={(e) => setFood(Number(e.target.value))}
              />
            </label>
          ) : (
            <p className="hint">
              軍糧消耗 {n(Math.ceil(troops * B.foodPerTroop))}。
              {prediction &&
                `預估戰力比 ${(prediction.attack / Math.max(1, prediction.defense)).toFixed(2)}：1（未含 ±6% 變動）`}
            </p>
          )}
        </>
      ) : (
        <p className="hint">
          消耗金錢 {B.costs[type as Domestic]}
          {type === "recruit"
            ? `、兵糧 ${B.recruitFood}；魅力提升徵兵效率，治安 −${B.recruitSecurity}`
            : type === "train"
              ? "；統率提升訓練效果"
              : type === "patrol"
                ? "；政治及魅力提升巡察效果，治安最高 100"
                : type === "repair"
                  ? "；統率及政治提升修築效果，城防直接強化防守戰力"
                  : "；政治及智力提升發展效果"}
          。
        </p>
      )}
      <button
        className="primary full"
        disabled={!!reason}
        title={reason}
        onClick={() => {
          if (type === "attack") setConfirm(true);
          else onAction(action());
        }}
      >
        {actionNames[type]}
        {type === "attack" ? " · 檢視軍議" : " · 執行"}
      </button>
      <p className="hint" role="status">
        {reason || "每道指令使用城池行動一次、武將行動一次。"}
      </p>
      {confirm && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="war-title"
            className="modal"
          >
            <h2 id="war-title">軍議 · 確認出征</h2>
            <p>
              {officer?.name}自{city.name}率 {n(troops)} 兵攻打{target?.name}。
            </p>
            <p>
              守軍 {n(target?.troops ?? 0)}；守城訓練 {target?.training}，城防{" "}
              {target?.defense}。
            </p>
            <p>
              我軍訓練 {city.training}；軍糧消耗{" "}
              {n(Math.ceil(troops * B.foodPerTroop))}。預估戰力比{" "}
              {prediction
                ? (prediction.attack / Math.max(1, prediction.defense)).toFixed(
                    2,
                  )
                : "—"}
              ：1。
            </p>
            <p className="hint">變動範圍 ±6%，戰敗仍會損兵。確認後不可撤回。</p>
            <div className="button-row">
              <button autoFocus onClick={() => setConfirm(false)}>
                取消
              </button>
              <button
                className="primary"
                disabled={!!reason}
                onClick={() => {
                  setConfirm(false);
                  onManual?.(action() as Extract<Action, { targetId: string }>);
                }}
              >
                親自指揮
              </button>
              <button
                className="primary"
                disabled={!!reason}
                onClick={() => {
                  setConfirm(false);
                  onAction(action());
                }}
              >
                委任作戰
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
