(()=>{
'use strict';
const room=()=>window.PI_HELPER_CONFIG?.defaultRoomCode||'default',ids=['flash','ssh','desktop','shutdown'],names={flash:'刷機圖解',ssh:'SSH 連線',desktop:'遠端桌面',shutdown:'正確關機'};
const defaults=()=>({open_lessons:{flash:true,ssh:true,desktop:true,shutdown:true},current_lesson:'flash',current_step:0,revision:0,managed:false,teaching_paused:false,pause_supported:false});
let policy=defaults(),loadSequence=0,appliedSequence=0;
function notify(){document.dispatchEvent(new Event('pi-helper-course-policy'))}
async function loadPolicy(){const sequence=++loadSequence;try{const next=await PiSyncAPI.rpc('pi_helper_course_settings',{p_room_code:room()});if(!next||!ids.every(id=>typeof next.open_lessons?.[id]==='boolean'))throw Error('無法讀取課程開放設定');if(sequence<appliedSequence)return policy;appliedSequence=sequence;policy={...next,teaching_paused:next.teaching_paused===true,pause_supported:next.pause_supported===true,managed:true};notify();return policy}catch(e){if(e.code==='FEATURE_UNAVAILABLE'){if(sequence<appliedSequence)return policy;appliedSequence=sequence;policy=defaults();notify();return policy}throw e}}
function key(group){return 'pi-helper-learning:'+room()+':'+group}
function read(group){try{const value=JSON.parse(localStorage.getItem(key(group))||'null');return value?.version===1&&value.group===group?value:null}catch{return null}}
function save(group,patch){if(!/^pi5-(?:0[1-9]|[1-9]\d)$/.test(group||''))return false;try{const old=read(group)||{},value={...old,...patch,version:1,group,completed:{...old.completed,...patch.completed}};localStorage.setItem(key(group),JSON.stringify(value));return true}catch{return false}}
function clear(group){try{localStorage.removeItem(key(group))}catch{}}
window.PiLearning={ids,names,read,save,clear,loadPolicy,get policy(){return policy},allowed(id){return policy.open_lessons[id]===true}};
})();
