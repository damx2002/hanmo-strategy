import type {
  City,
  Faction,
  FactionId,
  Officer,
  GameState,
} from "../engine/types";
import { B } from "../engine/balance";
export const factions: Faction[] = [
  {
    id: "cao",
    name: "曹操",
    color: "#6b9fca",
    motto: "挾天子以令諸侯",
    active: true,
  },
  {
    id: "liu",
    name: "劉備",
    color: "#88b778",
    motto: "興復漢室，仁義立國",
    active: true,
  },
  {
    id: "sun",
    name: "孫權",
    color: "#d47c67",
    motto: "據江東，圖天下",
    active: true,
  },
];
const locations: [string, string, FactionId, number, number][] = [
  ["ye", "鄴", "cao", 520, 108],
  ["puyang", "濮陽", "cao", 625, 200],
  ["xuchang", "許昌", "cao", 550, 294],
  ["luoyang", "洛陽", "cao", 415, 215],
  ["wan", "宛", "cao", 420, 344],
  ["hanzhong", "漢中", "liu", 265, 345],
  ["chengdu", "成都", "liu", 160, 480],
  ["jiangzhou", "江州", "liu", 320, 520],
  ["xiangyang", "襄陽", "liu", 475, 440],
  ["chaisang", "柴桑", "sun", 650, 510],
  ["jianye", "建業", "sun", 800, 420],
  ["kuaiji", "會稽", "sun", 868, 565],
];
export const links = [
  ["ye", "puyang"],
  ["ye", "luoyang"],
  ["puyang", "xuchang"],
  ["xuchang", "luoyang"],
  ["xuchang", "wan"],
  ["luoyang", "wan"],
  ["wan", "xiangyang"],
  ["wan", "hanzhong"],
  ["xiangyang", "hanzhong"],
  ["xiangyang", "chaisang"],
  ["hanzhong", "chengdu"],
  ["chengdu", "jiangzhou"],
  ["jiangzhou", "chaisang"],
  ["chaisang", "jianye"],
  ["jianye", "kuaiji"],
];
export function createCities(): City[] {
  return locations.map(([id, name, ownerId, x, y], i) => ({
    id,
    name,
    ownerId,
    x,
    y,
    neighbors: links
      .filter((l) => l.includes(id))
      .map((l) => (l[0] === id ? l[1] : l[0])),
    gold: 2800 + (i % 4) * 500,
    food: 10500 + (i % 3) * 1600,
    troops:
      ownerId === "cao"
        ? 5800 + (i % 3) * 900
        : ownerId === "liu"
          ? 6500 + (i % 3) * 600
          : 7600 + (i % 3) * 700,
    agriculture: 48 + ((i * 7) % 25),
    commerce: 42 + ((i * 9) % 32),
    security: 78 + (i % 4) * 4,
    training: 48 + ((i * 3) % 24),
    defense: 38 + ((i * 5) % 30),
    actions: B.actions,
  }));
}
// Original scenario attributes, ordered leadership / strength / intelligence / politics / charm.
const rosters: [
  FactionId,
  [string, string, number, number, number, number, number][],
][] = [
  [
    "cao",
    [
      ["曹操", "ye", 92, 73, 90, 94, 91],
      ["夏侯惇", "puyang", 85, 91, 61, 58, 77],
      ["夏侯淵", "xuchang", 87, 89, 63, 52, 72],
      ["曹仁", "wan", 91, 84, 72, 61, 76],
      ["張遼", "wan", 95, 93, 79, 62, 85],
      ["許褚", "luoyang", 72, 98, 35, 31, 66],
      ["郭嘉", "xuchang", 78, 29, 98, 85, 80],
      ["荀彧", "ye", 65, 24, 95, 99, 89],
      ["程昱", "puyang", 76, 48, 91, 87, 70],
      ["司馬懿", "luoyang", 92, 55, 97, 93, 78],
    ],
  ],
  [
    "liu",
    [
      ["劉備", "chengdu", 83, 77, 78, 88, 99],
      ["關羽", "xiangyang", 95, 98, 77, 70, 94],
      ["張飛", "jiangzhou", 87, 99, 44, 38, 63],
      ["趙雲", "hanzhong", 94, 97, 81, 73, 91],
      ["諸葛亮", "chengdu", 93, 32, 100, 98, 95],
      ["龐統", "hanzhong", 87, 29, 98, 90, 72],
      ["黃忠", "xiangyang", 88, 94, 65, 52, 79],
      ["馬超", "jiangzhou", 86, 98, 50, 43, 87],
      ["魏延", "hanzhong", 89, 94, 70, 49, 62],
      ["法正", "chengdu", 75, 26, 95, 91, 67],
    ],
  ],
  [
    "sun",
    [
      ["孫權", "jianye", 83, 65, 84, 94, 95],
      ["周瑜", "chaisang", 98, 75, 96, 88, 96],
      ["魯肅", "jianye", 83, 47, 93, 96, 93],
      ["呂蒙", "chaisang", 94, 86, 91, 79, 82],
      ["陸遜", "kuaiji", 97, 62, 98, 92, 87],
      ["甘寧", "chaisang", 89, 97, 74, 40, 70],
      ["太史慈", "kuaiji", 88, 97, 67, 54, 84],
      ["黃蓋", "chaisang", 86, 87, 76, 62, 86],
      ["程普", "jianye", 87, 82, 78, 74, 89],
      ["周泰", "kuaiji", 80, 96, 46, 39, 73],
    ],
  ],
];
export function createOfficers(): Officer[] {
  return rosters.flatMap(([factionId, rows]) =>
    rows.map(
      (
        [name, cityId, leadership, strength, intelligence, politics, charm],
        i,
      ) => ({
        id: `${factionId}-${i}`,
        name,
        factionId,
        cityId,
        leadership,
        strength,
        intelligence,
        politics,
        charm,
        acted: false,
      }),
    ),
  );
}
export function newGame(playerId: FactionId, seed = 214019): GameState {
  return {
    version: 1,
    year: 214,
    month: 1,
    turn: 0,
    playerId,
    cities: createCities(),
    officers: createOfficers(),
    factions: structuredClone(factions),
    seed,
    events: ["建安十九年，群雄對峙。請選擇城池，開創你的霸業。"],
    battles: [],
    status: "playing",
  };
}
