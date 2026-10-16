(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function create({room,canOpen,onNavigate}){
 const storageKey='pi-helper-help-alerts:'+room;
 let saved=[];try{const data=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(data))saved=data.filter(x=>typeof x==='string')}catch{}
 const acknowledged=new Set(saved),previous=new Map(),queue=new Map();let active=null,paused=false,previousFocus=null;
 const dialog=make('dialog',undefined,'help-request-dialog');dialog.id='helpRequestDialog';dialog.setAttribute('aria-labelledby','helpRequestTitle');dialog.setAttribute('aria-describedby','helpRequestDescription');
 const title=make('h2','學生回報卡住');title.id='helpRequestTitle';const description=make('p','這是學生自行回報，網站未直接驗證樹莓派。','muted');description.id='helpRequestDescription';
 const group=make('p',undefined,'help-request-group'),stage=make('p'),step=make('h3'),result=make('p',undefined,'group-result'),notice=make('p',undefined,'muted'),actions=make('div',undefined,'help-request-actions'),open=make('button','前往本組排查','primary'),later=make('button','稍後處理');open.type=later.type='button';actions.append(open,later);dialog.append(title,description,group,stage,step,result,notice,actions);document.body.append(dialog);
 const source=row=>JSON.stringify([row.group_no,row.session_id||'legacy']);
 const fingerprint=row=>JSON.stringify([source(row),row.stage,row.step,row.result,row.stepChangedAt||null,row.helpId||null]);
 const fresh=row=>row?.state==='need_help'&&Number.isFinite(Date.parse(row.updated_at))&&Date.now()-Date.parse(row.updated_at)<60000;
 function save(){try{sessionStorage.setItem(storageKey,JSON.stringify([...acknowledged].slice(-2000)))}catch{}}
 function remember(key){acknowledged.add(key);while(acknowledged.size>2000)acknowledged.delete(acknowledged.values().next().value);save()}
 function showContent(row){group.textContent='第 '+String(row.group_no).padStart(2,'0')+' 組';stage.textContent='階段：'+row.stage;step.textContent=row.step;result.textContent='學生回報：'+row.result;open.textContent=row.stage==='刷機'?'前往本組刷機圖解':'前往本組排查';open.disabled=false;notice.textContent='這個助教分頁不會因自動同步重複提醒同一則求助。稍後可從看板的「幫助」查看。'}
 function flush(resume=false){if(resume)paused=false;if(paused||active||dialog.open||document.hidden||!canOpen()||typeof dialog.showModal!=='function')return;if(Array.from(document.querySelectorAll('dialog')).some(d=>d!==dialog&&d.open))return;
  for(const [id,row] of queue){queue.delete(id);if(!fresh(row)||acknowledged.has(fingerprint(row)))continue;active=row;showContent(row);previousFocus=document.activeElement;dialog.showModal();remember(fingerprint(row));later.focus();break}
 }
 function scan(rows){const current=new Map();let novel=false,changed=false;
  for(const row of rows){const id=source(row),key=fingerprint(row),old=previous.get(id);if(row.state!=='need_help'&&old?.state==='need_help'){acknowledged.delete(old.key);changed=true}previous.set(id,{state:row.state,key});if(fresh(row)){current.set(id,row);if(!acknowledged.has(key)){if(!queue.has(id)||fingerprint(queue.get(id))!==key)novel=true;queue.set(id,row)}}}
  for(const [id] of queue)if(!current.has(id))queue.delete(id);if(changed)save();
  if(active){const next=current.get(source(active));if(next){if(open.disabled||fingerprint(active)!==fingerprint(next)){active=next;showContent(next);remember(fingerprint(next));queue.delete(source(next))}}else{notice.textContent='這則求助目前沒有近期卡住回報。請回看板確認最新狀態。';open.disabled=true}}
  if(novel)paused=false;flush();
 }
 open.onclick=()=>{if(!active||open.disabled)return;const row=active;dialog.close();onNavigate(row)};
 later.onclick=()=>{paused=true;dialog.close()};
 dialog.addEventListener('cancel',()=>{paused=true});
 dialog.addEventListener('close',()=>{active=null;if(previousFocus?.isConnected!==false)previousFocus?.focus?.({preventScroll:true});setTimeout(()=>flush(),0)});
 document.addEventListener('visibilitychange',()=>flush());
 function reset(){paused=true;queue.clear();previous.clear();if(dialog.open)dialog.close();active=null}
 return {scan,flush,reset};
}
window.PiHelpNotifications={create};
})();
