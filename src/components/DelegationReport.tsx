import type { DelegationReport } from "../engine/delegation/types";
import { policyNames } from "../engine/delegation/policy";
import { fieldNames } from "../engine/delegation/summary";
import { actionNames } from "../engine/balance";
const n = (v: number) => v.toLocaleString("zh-TW");
export function DelegationReportView({ report }: { report: DelegationReport }) {
  return (
    <section className="delegation-report" aria-label="委任成果">
      <h3>
        本月委任成果{" "}
        <small>
          {report.year} 年 {report.month} 月
        </small>
      </h3>
      {report.cities.map((c) => (
        <details className="delegation-city-result" key={c.cityId}>
          <summary>
            <strong>
              {c.name}｜{policyNames[c.policy]}
            </strong>
            <span>
              {c.actions.length
                ? `${c.actions.length} 令 · 支出 ${n(c.gold)} 金${c.food ? `、${n(c.food)} 糧` : ""}`
                : `未下令 · ${c.reason}`}
            </span>
          </summary>
          {c.actions.map((a, i) => (
            <p key={i}>
              {a.officerName}執行{actionNames[a.type]}：{fieldNames[a.type]}{" "}
              {n(a.before)} → {n(a.after)}
              <small>
                支出 {n(a.gold)} 金{a.food ? `、${n(a.food)} 糧` : ""}
              </small>
            </p>
          ))}
          <p className="hint">{c.reason}；未使用的指令不另收費。</p>
        </details>
      ))}
      {report.economy && (
        <details className="delegation-economy">
          <summary>月度收支 · 與委任支出分開計算</summary>
          {report.economy.map((c) => (
            <p key={c.cityId}>
              <strong>{c.name}</strong>：金入庫 +{n(c.gold)}；產糧 +{n(c.food)}
              、軍糧 −{n(c.upkeep)}；糧庫實變 {c.netFood >= 0 ? "+" : ""}
              {n(c.netFood)}
              {c.deserters ? `；缺糧逃兵 ${n(c.deserters)}` : ""}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
