(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
function create({room,canOpen,onNavigate}){
 const storageKey='pi-helper-help-alerts:'+room;
 let saved=[];try{const data=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(data))saved=data.filter(x=>typeof x==='string')}catch{}
 const acknowledged=new Set(saved),previous=new Map(),queue=new Map();let active=null,paused=false,previousFocus=null,navigating=false,accepting=false,generation=0;
 const dialog=make('dialog',undefined,'help-request-dialog');dialog.id='helpRequestDialog';dialog.setAttribute('aria-labelledby','helpRequestTitle');dialog.setAttribute('aria-describedby','helpRequestDescription');
 const title=make('h2','學生需要協助');title.id='helpRequestTitle';const description=make('p','先接手，再依學生目前步驟協助。','muted');description.id='helpRequestDescription';
 const group=make('p',undefined,'help-request-group'),stage=make('p'),step=make('h3'),result=make('p',undefined,'group-result'),notice=make('p',undefined,'muted'),actions=make('div',undefined,'help-request-actions'),open=make('button','協助此組','primary'),later=make('button','稍後處理');open.type=later.type='button';actions.append(open,later);dialog.append(title,description,group,stage,step,result,notice,actions);document.body.append(dialog);
 const source=row=>JSON.stringify([row.group_no,row.session_id||'legacy']);
 const fingerprint=row=>JSON.stringify([source(row),row.stage,row.step,row.result,row.stepChangedAt||null,row.helpId||null]);
 const fresh=row=>row?.state==='need_help'&&(row.persistentHelp||(Number.isFinite(Date.parse(row.updated_at))&&Date.now()-Date.parse(row.updated_at)<60000));
 function save(){try{sessionStorage.setItem(storageKey,JSON.stringify([...acknowledged].slice(-2000)))}catch{}}
 function remember(key){acknowledged.add(key);while(acknowledged.size>2000)acknowledged.delete(acknowledged.values().next().value);save()}
 function showContent(row){group.textContent='第 '+String(row.group_no).padStart(2,'0')+' 組';stage.textContent='階段：'+row.stage;step.textContent=row.step;result.textContent='學生回報：'+row.result;open.textContent=row.persistentHelp?(row.canClaim===false?'填寫稱呼並接手':'接手並查看步驟'):'查看學生步驟';open.disabled=false;notice.textContent=row.persistentHelp?'接手後，學生會看到你正在協助。稍後處理會保留在組別看板。':'目前僅有步驟回報。請查看學生畫面並直接協助；共用接手尚未啟用。'}
 function flush(resume=false){if(resume)paused=false;if(paused||active||dialog.open||document.hidden||!canOpen()||typeof dialog.showModal!=='function')return;if(Array.from(document.querySelectorAll('dialog')).some(d=>d!==dialog&&d.open))return;
  for(const [id,row] of queue){queue.delete(id);if(!fresh(row)||acknowledged.has(fingerprint(row)))continue;active=row;showContent(row);previousFocus=document.activeElement;dialog.showModal();remember(fingerprint(row));later.focus();break}
 }
 function scan(rows){const current=new Map();let novel=false,changed=false;
  for(const row of rows){const id=source(row),key=fingerprint(row),old=previous.get(id);if(row.state!=='need_help'&&old?.state==='need_help'){acknowledged.delete(old.key);changed=true}previous.set(id,{state:row.state,key});if(fresh(row)){current.set(id,row);if(!acknowledged.has(key)){if(!queue.has(id)||fingerprint(queue.get(id))!==key)novel=true;queue.set(id,row)}}}
  for(const [id] of queue)if(!current.has(id))queue.delete(id);if(changed)save();
  if(active&&!accepting){const next=current.get(source(active));if(next){if(open.disabled||fingerprint(active)!==fingerprint(next)){active=next;showContent(next);remember(fingerprint(next));queue.delete(source(next))}}else{notice.textContent='這則求助已被接手、更新或清除，請回看板確認最新狀態。';open.disabled=true}}
  if(novel)paused=false;flush();
 }
 open.onclick=async()=>{if(!active||open.disabled||accepting)return;const row=active,token=generation;accepting=true;open.disabled=later.disabled=true;notice.textContent='正在開啟求助處理…';try{const after=await onNavigate(row);if(token!==generation)return;active=null;paused=true;navigating=true;dialog.close();if(typeof after==='function')after()}catch(e){if(token===generation){notice.textContent=e.message+' 請按「稍後處理」回看板確認。';open.disabled=false}}finally{if(token===generation){accepting=false;later.disabled=false}}};
 later.onclick=()=>{paused=true;active=null;dialog.close()};
 dialog.addEventListener('cancel',event=>{if(accepting){event.preventDefault();return}paused=true});
 dialog.addEventListener('close',()=>{if(dialog.open)return;active=null;if(!navigating&&previousFocus?.isConnected!==false)previousFocus?.focus?.({preventScroll:true});navigating=false;setTimeout(()=>flush(),0)});
 document.addEventListener('visibilitychange',()=>flush());
 function reset(){generation++;accepting=false;open.disabled=false;later.disabled=false;paused=true;queue.clear();previous.clear();if(dialog.open)dialog.close();active=null}
 return {scan,flush,reset};
}
window.PiHelpNotifications={create};
})();
