const { spawn } = require("node:child_process");
const path = require("node:path");
(async () => {
  const port = process.env.SMOKE_PORT || "4174";
  const url = `http://127.0.0.1:${port}/hanmo-strategy/`;
  const server = spawn(
    process.execPath,
    [
      path.join(__dirname, "../node_modules/vite/bin/vite.js"),
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      port,
      "--strictPort",
    ],
    { stdio: "inherit" },
  );
  let exited = false;
  server.on("exit", () => (exited = true));
  try {
    let ready = false;
    for (let i = 0; i < 60 && !exited; i++) {
      try {
        const r = await fetch(url);
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) throw Error("正式產物預覽無法啟動");
    for (const script of [
      "browser-v021.cjs",
      "browser-v022.cjs",
      "browser-v023.cjs",
      "browser-v030.cjs",
      "browser-pwa.cjs",
    ]) {
      const child = spawn(process.execPath, [path.join(__dirname, script)], {
        stdio: "inherit",
        env: { ...process.env, GAME_URL: url },
      });
      const code = await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", resolve);
      });
      if (code !== 0) throw Error(`${script} smoke 失敗 (${code})`);
    }
  } finally {
    server.kill("SIGTERM");
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
