import type { GameState, Action } from "./types";
import type { PersonnelAction } from "./personnel";
import type { DiplomaticAction } from "./diplomacy";
import { personnelReason } from "./personnel";
import { attackProhibition, factionPower, relationOf } from "./diplomacy";
import { estimate, defenderFor } from "./combat";
import { B } from "./balance";
import { income } from "./economy";
import { planDelegatedAction } from "./delegation/planner";
export type AIIntent=Action|PersonnelAction|DiplomaticAction;
export function planAI(s:GameState,actor:string,id:string,attacked:boolean,governed:boolean,diplomacyDone=false):AIIntent|null {
 const c=s.cities.find(c=>c.id===id&&c.ownerId===actor);if(!c||c.actions<=0)return null;
 const officers=s.officers.filter(o=>o.cityId===id&&o.factionId===actor&&!o.acted&&!o.retired).sort((a,b)=>b.leadership-a.leadership);
 const o=officers[0];if(!o)return null;
 const neighbors=s.cities.filter(t=>c.neighbors.includes(t.id)),enemies=neighbors.filter(t=>t.ownerId!==actor&&!attackProhibition(s,actor,t.ownerId));
 const sent=Math.min(c.troops-B.guard,Math.floor(c.troops*.8));
 const enemy=enemies.sort((a,b)=>a.troops-b.troops).find(t=>{const p=estimate(c,t,o,defenderFor(s.officers,t),sent);return p.attack>p.defense*B.aiMargin});
 if(!attacked&&enemy&&sent>B.guard&&c.food>=Math.ceil(sent*B.foodPerTroop)+1400)return{type:"attack",cityId:id,officerId:o.id,targetId:enemy.id,troops:sent,officerIds:officers.slice(0,3).map(o=>o.id)};
 if(!diplomacyDone&&s.turn%12===0&&c.gold>1600){const f=s.factions.filter(f=>f.active&&f.id!==actor&&factionPower(s,f.id)>factionPower(s,actor)*1.5&&!attackProhibition(s,actor,f.id)&&(relationOf(s,actor,f.id)?.contactUntil??0)<=s.turn).sort((a,b)=>factionPower(s,b.id)-factionPower(s,a.id))[0];if(f)return{type:"alliance",cityId:id,officerId:o.id,targetFactionId:f.id};}
 const free=s.officers.filter(t=>!t.factionId&&!t.retired&&t.cityId===id);
 const target=free.find(t=>t.discovered);
 if(target&&c.gold>1800){const a:PersonnelAction={type:"hire",cityId:id,officerId:o.id,targetOfficerId:target.id};if(!personnelReason(s,a,actor))return a;}
 if(!governed&&free.some(t=>!t.discovered)&&c.gold>1500)return{type:"search",cityId:id,officerId:o.id};
 if(!c.governorId&&c.gold>1000){const t=officers.filter(t=>(t.loyalty??80)>=50).sort((a,b)=>b.politics-a.politics)[0];if(t)return{type:"appoint",cityId:id,officerId:o.id,targetOfficerId:t.id};}
 const border=neighbors.some(t=>t.ownerId!==actor);
 if(!border&&officers.length>1&&c.troops>9000){
  const queue=[[id]],seen=new Set([id]);let route:string[]|undefined;
  for(const p of queue){const town=s.cities.find(c=>c.id===p.at(-1))!;if(p.length>1&&town.neighbors.some(n=>s.cities.find(c=>c.id===n)!.ownerId!==actor)){route=p;break;}for(const n of town.neighbors)if(!seen.has(n)&&s.cities.some(c=>c.id===n&&c.ownerId===actor)){seen.add(n);queue.push([...p,n]);}}
  if(route)return{type:"transfer",cityId:id,officerId:o.id,targetId:route[1],troops:Math.floor((c.troops-500)/2),food:Math.floor(c.food*.4)};
 }
 const weak=officers.find(t=>(t.loyalty??80)<55);if(weak&&c.gold>1000)return{type:"reward",cityId:id,officerId:o.id,targetOfficerId:weak.id};
 const wanted=border?Math.min(30000,Math.max(10000,...enemies.map(t=>t.troops*1.25))):8000;
 const newUpkeep=Math.ceil((c.troops+B.recruitBase+o.charm*B.charmScale)*B.troopUpkeep),i=income(c);
 if(c.troops<wanted&&c.training>=70&&c.gold>1300&&i.food>=newUpkeep&&c.food-B.recruitFood+i.food-newUpkeep>1400+2*newUpkeep)return{type:"recruit",cityId:id,officerId:o.id};
 const planned=planDelegatedAction({...s,playerId:actor},id,border?"military":"balanced");
 return planned.action;
}
