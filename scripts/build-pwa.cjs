const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const dist=path.resolve(__dirname,"../dist"),base=process.env.HANMO_BASE_PATH||"/hanmo-strategy/";
if(!base.startsWith("/")||!base.endsWith("/")||base.includes(".."))throw Error("Invalid PWA base path");
const preview=process.env.VITE_HANMO_CHANNEL==="preview",channel=preview?"preview":"production";
const manifest={name:preview?"漢末群雄志（測試版）":"漢末群雄志",short_name:preview?"漢末測試版":"漢末群雄志",id:base+"?channel="+channel,start_url:base,scope:base,lang:"zh-TW",display:"standalone",orientation:"any",background_color:"#142722",theme_color:"#142722",description:"原創三國回合制策略遊戲",icons:[
{src:base+"icons/hanmo-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
{src:base+"icons/hanmo-512.png",sizes:"512x512",type:"image/png",purpose:"any maskable"}]};
fs.writeFileSync(path.join(dist,"manifest.webmanifest"),JSON.stringify(manifest,null,2));
function walk(dir){return fs.readdirSync(path.join(dist,dir),{withFileTypes:true}).flatMap(d=>{const p=path.posix.join(dir,d.name);return d.isDirectory()?walk(p):[p];});}
const files=walk("").filter(f=>f!=="sw.js"&&!f.endsWith(".map")).sort();
const digest=crypto.createHash("sha256");for(const f of files){digest.update(f);digest.update(fs.readFileSync(path.join(dist,f)));}
const prefix="hanmo-pwa-"+channel+"-"+crypto.createHash("sha1").update(base).digest("hex").slice(0,8)+"-";
const cacheName=prefix+digest.digest("hex").slice(0,12);
const list=[base,...files.map(f=>base+f)];
const worker=[
"const APP_ROOT="+JSON.stringify(base)+";",
"const CACHE_NAME="+JSON.stringify(cacheName)+";",
"const CACHE_PREFIX="+JSON.stringify(prefix)+";",
"const FILES="+JSON.stringify(list)+";",
'self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(FILES))));',
'self.addEventListener("activate",e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME)await caches.delete(k);await self.clients.claim();})()));',
'self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")self.skipWaiting();});',
'self.addEventListener("fetch",e=>{const req=e.request,url=new URL(req.url);if(req.method!=="GET"||url.origin!==self.location.origin||!url.pathname.startsWith(APP_ROOT))return;if(req.mode==="navigate"){e.respondWith(fetch(req).then(r=>r.ok?r:Promise.reject(Error("offline"))).catch(async()=>await caches.match(APP_ROOT)||await caches.match(APP_ROOT+"index.html")||Response.error()));}else e.respondWith(caches.match(req).then(r=>r||fetch(req)));});'
].join("\n");
fs.writeFileSync(path.join(dist,"sw.js"),worker);
console.log("PWA ready",channel,base,files.length,"files");
