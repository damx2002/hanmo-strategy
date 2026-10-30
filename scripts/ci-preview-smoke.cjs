const {spawn}=require("node:child_process");
const path=require("node:path");
(async()=>{
  const port=process.env.PWA_PREVIEW_PORT||"4175",url="http://127.0.0.1:"+port+"/hanmo-strategy-preview/";
  const server=spawn(process.execPath,[path.join(__dirname,"../node_modules/vite/bin/vite.js"),"preview","--host","127.0.0.1","--port",port,"--strictPort"],{stdio:"inherit",env:{...process.env,HANMO_BASE_PATH:"/hanmo-strategy-preview/",VITE_HANMO_CHANNEL:"preview"}});
  let done=false;server.on("exit",()=>{done=true;});
  try{
    let ready=false;
    for(let i=0;i<80&&!done;i++){try{const r=await fetch(url);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
    if(!ready)throw Error("預覽候選產物無法啟動");
    const child=spawn(process.execPath,[path.join(__dirname,"browser-pwa.cjs")],{stdio:"inherit",env:{...process.env,GAME_URL:url,PWA_PREVIEW:"1"}});
    const code=await new Promise((res,rej)=>{child.on("error",rej);child.on("exit",res);});
    if(code!==0)throw Error("預覽版 PWA 離線回歸測試失敗");
  }finally{server.kill("SIGTERM");}
})().catch(e=>{console.error(e);process.exitCode=1;});
