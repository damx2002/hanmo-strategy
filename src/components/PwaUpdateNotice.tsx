import {useEffect,useState} from "react";
import {applyPwaUpdate,hasPwaUpdate} from "../pwa";
export function PwaUpdateNotice({canUpdate,saveBeforeUpdate}:{canUpdate:boolean;saveBeforeUpdate:()=>boolean}) {
  const [ready,setReady]=useState(hasPwaUpdate);
  const [error,setError]=useState("");
  useEffect(()=>{const update=()=>setReady(hasPwaUpdate());window.addEventListener("hanmo-pwa-update",update);return ()=>window.removeEventListener("hanmo-pwa-update",update);},[]);
  if(!ready)return null;
  return <aside className="pwa-update" role="status">
    <span>新版已可用，{canUpdate?"儲存進度後即可更新。":"請先完成戰鬥或月結再更新。"}{error}</span>
    <button disabled={!canUpdate} onClick={()=>{if(!saveBeforeUpdate()){setError(" 存檔失敗，已取消更新。");return;}if(!applyPwaUpdate())setError(" 更新服務未就緒。");}}>儲存並更新</button>
  </aside>;
}
