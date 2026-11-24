import type { Officer } from "../engine/types";
export function OfficerPanel({
  officers,
  compact = false,
}: {
  officers: Officer[];
  compact?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table className={compact ? "compact" : ""}>
        <thead>
          <tr>
            <th>武將</th>
            <th>統</th>
            <th>武</th>
            <th>智</th>
            <th>政</th>
            <th>魅</th>
            <th>忠誠</th>
            <th>行動</th>
          </tr>
        </thead>
        <tbody>
          {officers.map((o) => (
            <tr key={o.id} className={o.acted ? "officer-acted" : ""}>
              <td>
                <span className="officer-seal">{o.name[0]}</span>
                {o.name}
                <small className="officer-traits">{o.traits?.join("／")}</small>
              </td>
              <td>{o.leadership}</td>
              <td>{o.strength}</td>
              <td>{o.intelligence}</td>
              <td>{o.politics}</td>
              <td>{o.charm}</td>
              <td>{o.loyalty ?? 80}</td>
              <td className={o.acted ? "muted" : "ready"}>
                {o.acted ? "已行動" : "待命"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!officers.length && (
        <p className="muted">無駐城武將，可由相鄰友城調入。</p>
      )}
    </div>
  );
}
