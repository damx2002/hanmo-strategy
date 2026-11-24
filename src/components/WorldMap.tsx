import { useRef, useState } from "react";
import type { GameState } from "../engine/types";

// Voronoi half-plane clipping gives every city a territory that follows ownership.
function territory(x: number, y: number, cities: GameState["cities"]) {
  let polygon = [
    [0, 0],
    [1000, 0],
    [1000, 690],
    [0, 690],
  ];
  for (const c of cities) {
    if (c.x === x && c.y === y) continue;
    const a = c.x - x,
      b = c.y - y,
      d = (c.x * c.x + c.y * c.y - x * x - y * y) / 2;
    const result: number[][] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length];
      const u = a * p[0] + b * p[1] - d,
        v = a * q[0] + b * q[1] - d;
      if (u <= 0) result.push(p);
      if (u <= 0 !== v <= 0) {
        const t = u / (u - v);
        result.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    polygon = result;
  }
  return polygon.map((p) => p.join(",")).join(" ");
}
export function WorldMap({
  state,
  selected,
  target,
  onSelect,
}: {
  state: GameState;
  selected: string;
  target?: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const links = state.cities.flatMap((c) =>
    c.neighbors.filter((id) => c.id < id).map((id) => [c.id, id]),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const source = state.cities.find((c) => c.id === selected)!;
  return (
    <section
      className={`map-frame ${state.cities.length > 12 ? "world-expanded" : ""}`}
    >
      <div className="world-search">
        <input
          aria-label="搜尋城池"
          placeholder="搜尋城池"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="勢力篩選"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="">全部勢力</option>
          {state.factions
            .filter((f) => f.active)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
        <select
          aria-label="快速選城"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
        >
          {state.cities
            .filter(
              (c) =>
                (!search || c.name.includes(search)) &&
                (!owner || c.ownerId === owner),
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ·{" "}
                {state.factions.find((f) => f.id === c.ownerId)?.name}
              </option>
            ))}
        </select>
      </div>
      <div className="map-heading">
        <span>
          九州輿圖 <small>群雄對峙 · 架空歷史</small>
        </span>
        <div className="zoom">
          <button
            aria-label="縮小地圖"
            disabled={zoom <= 1}
            onClick={() => setZoom(Math.max(1, zoom - 0.25))}
          >
            −
          </button>
          <button
            aria-label="重設地圖縮放與位置"
            title="回到原始縮放與位置"
            onClick={() => {
              setZoom(1);
              scrollRef.current?.scrollTo({ left: 0, top: 0 });
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="放大地圖"
            disabled={zoom >= 2}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            ＋
          </button>
        </div>
      </div>
      <div
        className="map-scroll"
        ref={scrollRef}
        tabIndex={0}
        aria-label="地圖捲動區，可左右上下捲動"
      >
        <svg
          viewBox={`0 0 1000 ${state.cities.length > 12 ? 730 : 690}`}
          style={{ width: `max(${zoom * 100}%, ${zoom * (state.cities.length > 12 ? 1100 : 720)}px)` }}
          role="group"
          aria-label="十二城戰略地圖，可使用 Tab 選擇城池"
        >
          <defs>
            <clipPath id="land">
              <path d="M80 50L720 30 910 225 935 490 870 640 335 650 65 540Z" />
            </clipPath>
            <pattern
              id="grain"
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
            >
              <path d="M2 4h2M10 11h1" stroke="#8c9c75" strokeOpacity=".14" />
            </pattern>
            <pattern
              id="mountain"
              width="100"
              height="70"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M8 62l25-38 15 25 12-14 25 27M22 43l11-19 8 13"
                fill="none"
                stroke="#6c8164"
                strokeOpacity=".26"
                strokeWidth="2"
              />
            </pattern>
          </defs>
          <rect width="1000" height="690" fill="#182f2a" />
          <path
            d="M80 50L720 30 910 225 935 490 870 640 335 650 65 540Z"
            fill="#253e31"
            stroke="#657057"
            strokeWidth="2"
          />
          <g clipPath="url(#land)">
            {state.cities.map((c) => (
              <polygon
                key={c.id}
                points={territory(c.x, c.y, state.cities)}
                fill={state.factions.find((f) => f.id === c.ownerId)!.color}
                fillOpacity=".13"
                stroke="#acb08a"
                strokeOpacity=".13"
              />
            ))}
          </g>
          <rect x="70" y="50" width="820" height="560" fill="url(#mountain)" />
          <rect width="1000" height="690" fill="url(#grain)" />
          <path
            d="M110 155Q230 95 285 165T440 155 580 245 765 280"
            className="river"
          />
          <path
            d="M155 440Q215 585 365 474T600 495 845 385L920 370"
            className="river yangtze"
          />
          <text x="310" y="170" className="terrain-label">
            黃 河
          </text>
          <text x="535" y="530" className="terrain-label">
            長 江
          </text>
          <text x="100" y="340" className="region-label">
            益 州
          </text>
          <text x="690" y="130" className="region-label">
            中 原
          </text>
          <text x="765" y="620" className="region-label">
            江 東
          </text>
          <text
            x="940"
            y="300"
            className="terrain-label"
            transform="rotate(90 940 300)"
          >
            東 海
          </text>
          {links.map(([a, b]) => {
            const c = state.cities.find((c) => c.id === a)!,
              d = state.cities.find((c) => c.id === b)!;
            return (
              <path
                key={a + b}
                d={`M${c.x} ${c.y}L${d.x} ${d.y}`}
                className={
                  a === selected || b === selected ? "road active-road" : "road"
                }
              />
            );
          })}
          {state.cities.map((c) => {
            const color = state.factions.find((f) => f.id === c.ownerId)!.color;
            const attackable =
              source.ownerId === state.playerId &&
              source.neighbors.includes(c.id) &&
              c.ownerId !== state.playerId;
            return (
              <g
                key={c.id}
                role="button"
                tabIndex={0}
                aria-label={`${c.name}，${state.factions.find((f) => f.id === c.ownerId)!.name}軍，${c.troops}兵`}
                aria-pressed={selected === c.id}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(c.id);
                  }
                }}
                className={`city ${owner && c.ownerId !== owner ? "city-dim" : ""} ${search && !c.name.includes(search) ? "city-dim" : ""} ${selected === c.id ? "selected" : ""} ${attackable ? "attackable" : ""} ${target === c.id ? "target" : ""}`}
                transform={`translate(${c.x} ${c.y})`}
                style={{ color }}
              >
                <title>
                  {c.name} · {c.troops.toLocaleString("zh-TW")} 兵
                </title>
                <circle r="33" className="city-hit" />
                <circle r="26" className="city-ring" />
                <path
                  d="M-19 10V-9h6v6h6v-6H0v6h6v-6h6v6h6v19ZM-22 14h44M-14-12L0-23 14-12Z"
                  fill="#18221e"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <path
                  d="M18-8v-30h17l-5 7 5 6H18"
                  fill="currentColor"
                  stroke="currentColor"
                />
                <text y="39" textAnchor="middle" className="city-name">
                  {c.name}
                </text>
                <text y="56" textAnchor="middle" className="city-count">
                  {state.cities.length > 12
                    ? ""
                    : `${(c.troops / 1000).toFixed(1)} 千兵`}
                </text>
              </g>
            );
          })}
          <text x="30" y="660" className="map-note">
            示意輿圖 · 城池道路為遊戲設計，非歷史交通考據
          </text>
        </svg>
      </div>
      <div className="legend">
        {state.factions.map((f) => (
          <span key={f.id}>
            <i style={{ background: f.color }} />
            {f.name} · {state.cities.filter((c) => c.ownerId === f.id).length}城
          </span>
        ))}
        <small>金色外圈：已選取　虛線：可攻擊 · 可左右捲動，百分比可復位</small>
      </div>
    </section>
  );
}
