import type { GameState, ActionResult } from "./types";
import { event } from "./game";
import { random } from "./rng";
export interface DiplomaticRelation { a: string; b: string; relation: number; allianceUntil: number; truceUntil: number; contactUntil?:number }
export type DiplomaticAction={type:"gift"|"alliance"|"truce"|"break";cityId:string;officerId:string;targetFactionId:string};
export const DIP={gift:400,talk:300,allianceMonths:6,truceMonths:3,contactMonths:12} as const;
export const relationOf=(s:GameState,a:string,b:string)=>s.diplomacy?.find(d=>d.a===[a,b].sort()[0]&&d.b===[a,b].sort()[1]);
export function attackProhibition(s:GameState,a:string,b:string){const d=relationOf(s,a,b);return d&&d.allianceUntil>s.turn?"雙方同盟期間不可進攻。":d&&d.truceUntil>s.turn?"停戰期限內不可進攻。":"";}
export const factionPower=(s:GameState,id:string)=>s.cities.filter(c=>c.ownerId===id).reduce((n,c)=>n+c.troops,1);
export function diplomaticChance(s:GameState,a:DiplomaticAction,actor=s.playerId){
 const o=s.officers.find(o=>o.id===a.officerId),d=relationOf(s,actor,a.targetFactionId);
 return Math.min(.9,Math.max(.05,.18+((d?.relation??0)+100)*.002+(o?.charm??40)*.002+Math.min(2,factionPower(s,actor)/factionPower(s,a.targetFactionId))*.08));
}
export function diplomacyDispatch(state:GameState,a:DiplomaticAction,actor=state.playerId):ActionResult{
 const fail=(error:string):ActionResult=>({ok:false,state,error});
 if(state.status!=="playing"||state.pendingBattle||state.pendingDefense||(state.monthResolution&&actor===state.playerId))return fail("目前不能外交。");
 const c=state.cities.find(c=>c.id===a.cityId),o=state.officers.find(o=>o.id===a.officerId),f=state.factions.find(f=>f.id===a.targetFactionId&&f.active);
 if(!c||c.ownerId!==actor||!o||o.cityId!==c.id||o.factionId!==actor||o.acted||c.actions<=0||!f||f.id===actor)return fail("需合法目標勢力、己城指令及待命使者。");
 const cost=a.type==="gift"?DIP.gift:a.type==="break"?0:DIP.talk;
 if(c.gold<cost)return fail("外交金錢不足。");
 const old=relationOf(state,actor,f.id);
 if(a.type==="break"&&!attackProhibition(state,actor,f.id))return fail("雙方沒有有效同盟或停戰。");
 if((a.type==="alliance"||a.type==="truce")&&old&&((old.contactUntil??0)>state.turn||attackProhibition(state,actor,f.id)))return fail("交涉冷卻或既有條約尚未到期。");
 const s=structuredClone(state),city=s.cities.find(x=>x.id===c.id)!,officer=s.officers.find(x=>x.id===o.id)!;
 city.gold-=cost;city.actions--;officer.acted=true;s.diplomacy??=[];
 let d=relationOf(s,actor,f.id);if(!d){const[x,y]=[actor,f.id].sort();d={a:x,b:y,relation:0,allianceUntil:0,truceUntil:0};s.diplomacy.push(d);}
 let success=true;
 if(a.type==="gift")d.relation=Math.min(100,d.relation+20);
 else if(a.type==="break"){d.allianceUntil=0;d.truceUntil=0;d.relation=Math.max(-100,d.relation-40);d.contactUntil=s.turn+3;}
 else {const[r,next]=random(s.seed);s.seed=next;success=r<diplomaticChance(state,a,actor);d.contactUntil=s.turn+DIP.contactMonths;if(success){if(a.type==="alliance")d.allianceUntil=s.turn+DIP.allianceMonths;else d.truceUntil=s.turn+DIP.truceMonths;d.relation=Math.min(100,d.relation+10);}else d.relation=Math.max(-100,d.relation-5);}
 const name={gift:"贈禮",alliance:"同盟交涉",truce:"停戰交涉",break:"解除條約"}[a.type];
 event(s,`${s.factions.find(f=>f.id===actor)!.name}對${f.name}${name}${success?"成功":"失敗"}${a.type==="alliance"&&success?"，有效六個月":a.type==="truce"&&success?"，有效三個月":""}。`);
 return{ok:true,state:s};
}
