import type { GameState, ActionResult, Officer } from "./types";
import { random } from "./rng";
import { checkResult, event } from "./game";
export type PersonnelAction = { type:"search"|"hire"|"reward"|"appoint"; cityId:string;officerId:string;targetOfficerId?:string };
export const P = { search:200,hire:500,reward:200,appoint:0,minLoyalty:50,loyaltyGain:20,governorScale:0.001,searchBase:0.35,hireBase:0.15 } as const;
export const loyaltyOf = (o:Officer) => o.loyalty ?? 80;
export function personnelReason(s:GameState,a:PersonnelAction,actor=s.playerId) {
 if(s.status!=="playing"||s.pendingBattle||s.pendingDefense||(s.monthResolution&&actor===s.playerId))return "目前不是可下令人事的戰略階段。";
 const c=s.cities.find(c=>c.id===a.cityId),o=s.officers.find(o=>o.id===a.officerId),target=s.officers.find(o=>o.id===a.targetOfficerId);
 if(!c||c.ownerId!==actor||!o||o.factionId!==actor||o.cityId!==c.id||o.acted||o.retired||c.actions<=0)return "需要己城剩餘指令及本城待命武將。";
 if(c.gold<P[a.type])return "金錢不足。";
 if(a.type==="search") {
  if(!s.officers.some(t=>!t.factionId&&!t.retired&&!t.discovered&&t.cityId===c.id&&(t.availableFrom??0)<=s.year))return "本城目前沒有尚未發現的人才。";
 } else {
  if(!target||target.retired||target.id===o.id&&a.type==="hire")return "目標武將不合法。";
  if(a.type==="hire") {
   const place=s.cities.find(c=>c.id===target.cityId);
   if(!target.discovered||!place||!(place.id===c.id||c.neighbors.includes(place.id))||target.factionId===actor||loyaltyOf(target)>=95)return "只能登用本城／鄰城已知在野或非高忠誠敵將。";
  } else if(target.factionId!==actor||target.cityId!==c.id)return "目標必須為本城己將。";
  if(a.type==="reward"&&loyaltyOf(target)>=100)return "忠誠已達上限。";
  if(a.type==="appoint"&&(loyaltyOf(target)<P.minLoyalty||c.governorId===target.id))return "太守需忠誠至少50，且不可重複任命。";
 }
 return "";
}
export function personnelDispatch(state:GameState,a:PersonnelAction,actor=state.playerId):ActionResult {
 const reason=personnelReason(state,a,actor);if(reason)return{ok:false,state,error:reason};
 const s=structuredClone(state),c=s.cities.find(c=>c.id===a.cityId)!,o=s.officers.find(o=>o.id===a.officerId)!;
 c.gold-=P[a.type];c.actions--;o.acted=true;
 let text="";
 if(a.type==="search"||a.type==="hire") {
  const[r,next]=random(s.seed);s.seed=next;
  if(a.type==="search") {
   const t=s.officers.filter(t=>!t.factionId&&!t.retired&&!t.discovered&&t.cityId===c.id).sort((a,b)=>b.politics+b.leadership-a.politics-a.leadership)[0];
   const success=r<Math.min(.95,P.searchBase+o.intelligence*.003+o.charm*.002);
   if(success)t.discovered=true;
   text=success?`${o.name}在${c.name}訪得在野人才${t.name}。`:`${o.name}搜尋人才未果。`;
  } else {
   const t=s.officers.find(o=>o.id===a.targetOfficerId)!;
   const chance=Math.min(.92,P.hireBase+o.charm*.004+o.intelligence*.001+(100-loyaltyOf(t))*.003-(t.factionId?.length? .2:0));
   const success=r<chance;
   if(success){t.factionId=actor;t.cityId=c.id;t.loyalty=Math.min(95,55+Math.floor(o.charm*.3));t.acted=true;}
   text=`${o.name}登用${t.name}${success?"成功，已入駐"+c.name:"失敗"}。`;
  }
 }else{
  const t=s.officers.find(o=>o.id===a.targetOfficerId)!;
  if(a.type==="reward"){const before=loyaltyOf(t);t.loyalty=Math.min(100,before+P.loyaltyGain+Math.floor(o.charm*.05));text=`賞賜${t.name}：忠誠 ${before} → ${t.loyalty}。`;}
  else{c.governorId=t.id;text=`任命${t.name}為${c.name}太守，提升本城內政效率。`;}
 }
 event(s,text);return{ok:true,state:checkResult(s)};
}
export function settlePersonnel(s:GameState) {
 if(s.version!==3)return;
 for(const o of s.officers) {
  if(o.retired)continue;
  if(o.died&&s.year>o.died){o.retired=true;o.factionId=null;o.cityId=null;o.acted=true;event(s,`${o.name}因年事退出仕途。`);continue;}
  if(o.factionId&&o.loyalty!==undefined){const c=s.cities.find(c=>c.id===o.cityId);if(c&&(c.food===0||c.gold<200))o.loyalty=Math.max(0,o.loyalty-5);else if(s.turn%6===0)o.loyalty=Math.max(0,o.loyalty-1);
   if(o.loyalty<10){event(s,`${o.name}因忠誠低落離開原勢力，成為在野。`);o.factionId=null;o.discovered=false;o.acted=false;}
  }
 }
}
