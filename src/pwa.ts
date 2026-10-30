// PWA lifecycle: only explicitly activate an update once the current save is safe.
let waiting: ServiceWorker | null = null;
let reloadRequested = false;
export const hasPwaUpdate = () => waiting !== null;
export function registerHanmoPwa() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js", {scope:import.meta.env.BASE_URL}).then(reg => {
      const check = () => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting;
          window.dispatchEvent(new Event("hanmo-pwa-update"));
        }
      };
      check();
      reg.addEventListener("updatefound", () => reg.installing?.addEventListener("statechange", check));
      window.addEventListener("online", () => { void reg.update().catch(() => {}); });
      void reg.update().catch(() => {});
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadRequested) { reloadRequested = false; window.location.reload(); }
      });
    }).catch(err => console.warn("PWA 離線服務未啟用", err));
  }, {once:true});
}
export function applyPwaUpdate(): boolean {
  if (!waiting) return false;
  reloadRequested = true;
  waiting.postMessage({type:"SKIP_WAITING"});
  return true;
}
