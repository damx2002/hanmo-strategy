import { createCities, createOfficers, factions as legacyFactions } from "./scenario";
import type { City, Faction, GameState, Officer } from "../engine/types";
import { historicalOfficers, historicalRating } from "./world/officers";
import { worldCities, worldLinks } from "./world/cities";
export type ScenarioId = "legacy" | "warlords194" | "three214";
export const scenarioList = [
 {id:"warlords194",name:"群雄割據",year:194,description:"漢室衰微，諸侯爭衡。194年末架空分界，孫策以廬江為自主據點。"},
 {id:"three214",name:"三分天下",year:214,description:"214年初，劉備入蜀、成都尚未陷落。三強之外仍有地方勢力。"},
 {id:"legacy",name:"經典十二城（舊版相容）",year:214,description:"保留原12城30將，供既有進度繼續。"},
] as const;
const colors = ["#6b9fca","#88b778","#d47c67","#ac8fc4","#d2a85f","#7ab6a6","#b3ad78","#b88981","#88a7c2","#b9abca","#8eae87","#cf9c76","#a5bb79","#b49fb6","#85b4b2","#ceac8a"];
const leaders: Record<string,string> = {cao:"曹操",liu:"劉備",sun:"孫策",yuan:"袁紹",shu:"袁術",biao:"劉表",zhang:"劉璋",lu:"張魯",ma:"馬騰",bu:"呂布",gongsun:"公孫瓚",liaodong:"公孫度",kong:"孔融",yao:"劉繇",lang:"王朗",yang:"張楊",han:"韓遂",gong:"公孫恭"};
const lands194: Record<string,string[]> = {
 cao:["chenliu","xuchang"],liu:["xiapi","xiaopei"],sun:["lujiang"],yuan:["ye","nanpi","pingyuan"],shu:["shouchun"],biao:["wan","xinye","xiangyang","jiangxia","jiangling","changsha","wuling","lingling","guiyang"],zhang:["chengdu","zitong","jiangzhou","yongan","jianning","yongchang"],lu:["hanzhong"],ma:["wuwei","tianshui"],bu:["puyang"],gongsun:["beiping","ji"],liaodong:["xiangping"],kong:["beihai"],yao:["jianye","wu","chaisang"],lang:["kuaiji"],yang:["jinyang","shangdang"],jue:["changan","anding","luoyang"],
};
const lands214: Record<string,string[]> = {
 cao:["beiping","ji","nanpi","pingyuan","ye","jinyang","shangdang","beihai","puyang","chenliu","xiaopei","xiapi","shouchun","xuchang","luoyang","changan","tianshui","anding","wan","xinye","xiangyang"],
 liu:["jiangling","yongan","jiangzhou","zitong","changsha","wuling","lingling","guiyang"],sun:["jiangxia","chaisang","jianye","wu","kuaiji","lujiang"],zhang:["chengdu","jianning","yongchang"],lu:["hanzhong"],han:["wuwei"],gong:["xiangping"],
};
const early: Record<string,string> = {張遼:"bu",張郃:"yuan",徐晃:"jue",賈詡:"jue",華歆:"shu",王朗:"lang",劉曄:"shu",陳群:"liu",陳琳:"yuan",辛毗:"yuan",崔琰:"yuan",田豫:"gongsun",田疇:"gongsun",閻柔:"gongsun",牽招:"yuan",文聘:"biao",黃忠:"biao",魏延:"biao",甘寧:"biao",太史慈:"yao",虞翻:"lang",馬超:"ma",馬岱:"ma",龐德:"ma",吳懿:"zhang",吳班:"zhang",李嚴:"zhang",劉巴:"biao",許靖:"zhang",黃權:"zhang",張燕:"yang",公孫瓚:"gongsun",公孫範:"gongsun",公孫續:"gongsun",田楷:"gongsun",單經:"gongsun",鄒丹:"gongsun",孔融:"kong",武安國:"kong",劉繇:"yao",笮融:"yao",薛禮:"yao",張英:"yao",樊能:"yao",于麋:"yao",陳橫:"yao",周昕:"lang",周昂:"lang",周喁:"lang",張楊:"yang",眭固:"yang",楊醜:"yang",李傕:"jue",郭汜:"jue",張濟:"jue",張繡:"jue",樊稠:"jue",李蒙:"jue",段煨:"jue",伍習:"jue",李儒:"jue",公孫度:"liaodong",公孫康:"liaodong",公孫恭:"liaodong"};
const late: Record<string,string> = {孫策:"sun",孫權:"sun",韓遂:"han",成公英:"han",閻行:"han",公孫恭:"gong",公孫康:"gong",張郃:"cao",徐晃:"cao",張遼:"cao",賈詡:"cao",文聘:"cao",王朗:"cao",華歆:"cao",辛毗:"cao",牽招:"cao",閻柔:"cao",馬超:"lu",馬岱:"lu",龐德:"lu",吳懿:"zhang",吳班:"zhang",李嚴:"liu",法正:"liu",黃權:"zhang",劉循:"zhang",孫乾:"liu",郝普:"liu",潘濬:"liu",孟達:"liu",申儀:"cao",申耽:"cao"};
function worldFactions(id: ScenarioId): Faction[] {
 const lands = id === "warlords194" ? lands194 : lands214;
 return Object.keys(lands).map((key,i) => ({ id:key,name: key === "jue" ? "李傕" : key === "sun" && id === "three214" ? "孫權" : leaders[key], color:colors[i%colors.length],motto:"經略山河，安定百姓",active:true }));
}
export function scenarioTemplate(id: string = "legacy") {
 if (id === "legacy") return { cities:createCities(), officers:createOfficers(), factions:structuredClone(legacyFactions) };
 if (id !== "warlords194" && id !== "three214") throw Error("未知劇本");
 const year = id === "warlords194" ? 194 : 214, lands = year === 194 ? lands194 : lands214;
 const factions = worldFactions(id), leaderNames = new Set(factions.map((f) => f.name));
 const cities: City[] = worldCities.map(([key,name,x,y],i) => ({ id:key,name,x,y,ownerId:Object.keys(lands).find((f) => lands[f].includes(key))!,neighbors:worldLinks.filter((p) => p.includes(key)).map((p)=>p[0]===key?p[1]:p[0]),gold:4000+i%4*600,food:15000+i%3*2000,troops:6000+i%4*900,agriculture:48+i%6*5,commerce:45+i%5*6,security:78+i%4*4,training:50+i%4*5,defense:40+i%4*8,actions:3,scale:["ye","chengdu","jianye","changan","xuchang"].includes(key)?3:1 }));
 const officers: Officer[] = historicalOfficers.filter((h) => h.from <= year && h.until >= year).map((h,i) => {
   let group = (year === 194 ? early[h.name] : late[h.name]) ?? h.group;
   if (year === 214 && group === "ma") group = "han";
   const lord = factions.find((f)=>f.name===h.name); if(lord) group=lord.id;
   const owned = cities.filter((c)=>c.ownerId===group);
   const wild = !owned.length || (!leaderNames.has(h.name) && h.role === "c" && i%7===0);
   const town = owned.length ? owned[(leaderNames.has(h.name)?0:i)%owned.length] : cities[i%cities.length];
   return { id:h.id,name:h.name,factionId:wild?null:group,cityId:town.id,...historicalRating(h),acted:false,loyalty:wild?35:leaderNames.has(h.name)?100:75+i%21,discovered:!wild,born:h.born,died:h.died,availableFrom:h.from,traits:[h.role === "s"?"軍師":h.role === "m"?"猛將":h.role === "c"?"能吏":"統御"] };
 });
 // Every city starts with actual local staff; relocate within the same faction only.
 for(const c of cities) if(!officers.some((o)=>o.cityId===c.id&&o.factionId===c.ownerId)) {
   const donor = officers.find((o)=>o.factionId===c.ownerId&&!leaderNames.has(o.name)&&officers.filter((x)=>x.cityId===o.cityId&&x.factionId===c.ownerId).length>1);
   if(donor) donor.cityId=c.id;
 }
 for(const c of cities) c.governorId=officers.filter((o)=>o.cityId===c.id&&o.factionId===c.ownerId).sort((a,b)=>b.politics-a.politics)[0]?.id;
 return {cities,officers,factions};
}
export function newScenarioGame(id: ScenarioId, playerId: string, seed=194021): GameState {
 const t=scenarioTemplate(id); if(!t.factions.some((f)=>f.id===playerId)) throw Error("勢力不存在");
 return {version:3,scenarioId:id,year:scenarioList.find((s)=>s.id===id)!.year,month:1,turn:0,playerId, ...t,seed,status:"playing",events:["新劇本開始。可搜尋人才、委任城池、交涉外交或出征。"],battles:[],pendingBattle:null,diplomacy:[],monthResolution:null,pendingDefense:null};
}
export const scenarioIds = scenarioList.map((s)=>s.id) as readonly string[];
