(()=>{
'use strict';
const config=window.PI_HELPER_CONFIG||{};
function configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl||'')&&Boolean(config.supabaseKey)}
function safeKey(){const k=config.supabaseKey||'';if(k.startsWith('sb_secret_'))throw Error('不可在網頁使用 secret key。');if(k.startsWith('eyJ')){try{const part=k.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const p=JSON.parse(atob(part));if(p.role!=='anon')throw Error('wrong role')}catch{throw Error('只可使用 publishable 或 anon key。')}}return k}
async function rpc(name,args){if(!configured())throw Error('尚未設定 Supabase。');const key=safeKey(),headers={'Content-Type':'application/json',apikey:key};if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),signal:controller.signal,credentials:'omit'});const data=await r.json().catch(()=>null);if(!r.ok){const message=String(data?.message||'');if(message.includes('ROOM_NOT_FOUND'))throw Error('課堂加入碼錯誤、已停用或已過期。');if(message.includes('TEACHER_DENIED'))throw Error('課堂加入碼或助教管理碼不正確。');if(message.includes('INVALID_EXPIRY'))throw Error('請設定未來的截止日期與時間。');if(message.includes('SESSION_DENIED'))throw Error('這份回報的操作憑證已失效，請退出同步再加入。');throw Error('同步失敗，請確認網路與 Supabase 設定。')}return data}finally{clearTimeout(timer)}}
window.PiSyncAPI={configured,rpc,pollMs:Math.max(5000,Number(config.pollMs)||5000)};
})();
