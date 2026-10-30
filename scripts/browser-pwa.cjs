const assert=require("node:assert/strict");
const {chromium}=require("playwright-core");
const url=process.env.GAME_URL||"http://127.0.0.1:4174/hanmo-strategy/";
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
 const ctx=await browser.newContext({viewport:{width:412,height:915},serviceWorkers:"allow"});
 const page=await ctx.newPage();
 try {
  await page.goto(url);
  const manifest=await page.evaluate(async()=>{const l=document.querySelector('link[rel="manifest"]');return l?await(await fetch(l.href)).json():null;});
  assert.ok(manifest&&manifest.display==="standalone");
  assert.equal(manifest.start_url,new URL(url).pathname);
  assert.ok(manifest.icons.some(x=>x.sizes==="192x192"));
  assert.ok(manifest.icons.some(x=>x.sizes==="512x512"));
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator(".faction-cards button").first().click();
  const saved=await page.evaluate(()=>localStorage.getItem("hanmo-strategy-save-v3"));
  assert.ok(saved&&JSON.parse(saved).version===3,"offline save");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:/繼續遊戲/}).click();
  assert.ok(await page.locator(".game-header").count());
  console.log("PASS PWA: manifest, service worker, offline new game, resume");
 }finally{await ctx.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
