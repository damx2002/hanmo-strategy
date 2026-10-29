import { it, expect, vi, afterEach } from "vitest";
import { newScenarioGame, scenarioTemplate } from "../data/scenarios";
import { historicalOfficers } from "../data/world/officers";
import { deserialize, serialize, isGameState, upgradeToV3, loadGame, saveGame, SAVE_KEY, V2_SAVE_KEY } from "../engine/save";
import v023 from "./fixtures/v0.2.2-save.json";
import battle from "./fixtures/v0.2.1-battle-save.json";
afterEach(()=>vi.unstubAllGlobals());
it.each(["warlords194","three214"] as const)("%s 世界完整、歷史可用年及41城連通，存檔往返",id=>{
 const s=newScenarioGame(id,"liu");expect(s.cities).toHaveLength(41);expect(s.officers.length).toBeGreaterThanOrEqual(150);expect(s.factions.length).toBeGreaterThanOrEqual(6);
 expect(new Set(s.officers.map(o=>o.id)).size).toBe(s.officers.length);
 for(const o of s.officers) {expect((o.availableFrom??0)<=s.year).toBe(true);if(o.born)expect(s.year-o.born).toBeGreaterThanOrEqual(16);if(o.died)expect(o.died).toBeGreaterThanOrEqual(s.year);}
 const seen=new Set([s.cities[0].id]),queue=[s.cities[0].id];for(const id of queue)for(const n of s.cities.find(c=>c.id===id)!.neighbors){expect(s.cities.find(c=>c.id===n)!.neighbors).toContain(id);if(!seen.has(n)){seen.add(n);queue.push(n)}}expect(seen.size).toBe(41);
 expect(s.cities.every(c=>s.officers.some(o=>o.cityId===c.id&&o.factionId===c.ownerId))).toBe(true);
 expect(isGameState(s)).toBe(true);expect(deserialize(serialize(s))).toEqual(s);
});
it("已去世或未成年著名人物不進錯誤年代",()=>{
 const a=scenarioTemplate("warlords194"),b=scenarioTemplate("three214");
 for(const name of ["董卓","孫堅","諸葛亮","孫權","司馬懿"])expect(a.officers.some(o=>o.name===name)).toBe(false);
 for(const name of ["袁紹","郭嘉","孫策","太史慈","呂布"])expect(b.officers.some(o=>o.name===name)).toBe(false);
 expect(historicalOfficers.length).toBe(new Set(historicalOfficers.map(o=>o.name)).size);
});
it.each([v023,battle])("舊世界與戰鬥完整遷移，只新增V3識別與預設 %#",fixture=>{
 const n=upgradeToV3(deserialize(JSON.stringify(fixture)));
 expect(n).toEqual({...fixture,version:3,scenarioId:"legacy",diplomacy:[],monthResolution:null,pendingDefense:null});expect(isGameState(n)).toBe(true);
});
it("V3優先、V2原檔保留；損毀V3不回退或覆寫",()=>{
 const m=new Map([[V2_SAVE_KEY,JSON.stringify(v023)]]);vi.stubGlobal("localStorage",{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>m.set(k,v)});
 const n=loadGame().state!;expect(n.version).toBe(3);expect(n.cities).toEqual(v023.cities);saveGame(n);expect(m.get(V2_SAVE_KEY)).toBe(JSON.stringify(v023));
 m.set(SAVE_KEY,"{broken");expect(loadGame().state).toBeNull();expect(m.get(V2_SAVE_KEY)).toBe(JSON.stringify(v023));expect(m.get(SAVE_KEY)).toBe("{broken");
});
it("未知劇本、外來城池和不合法陣營不被接受",()=>{
 const n=newScenarioGame("warlords194","liu");expect(isGameState({...n,scenarioId:"bad"})).toBe(false);const bad=structuredClone(n);bad.cities[0].ownerId="fake";expect(isGameState(bad)).toBe(false);
});
