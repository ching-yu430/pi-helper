(()=>{
'use strict';
let count=9;
const host=n=>'pi5-'+String(n).padStart(2,'0');
function populate(select,isHost=false){if(!select)return;const old=select.value;select.replaceChildren();for(let n=1;n<=count;n++){const o=document.createElement('option');o.value=host(n)+(isHost?'.local':'');o.textContent='第 '+n+' 組 · '+o.value;select.append(o)}select.value=Array.from(select.children).some(o=>o.value===old)?old:host(1)+(isHost?'.local':'')}
function apply(value){if(!Number.isInteger(value)||value<1||value>99)throw Error('組數必須為 1～99。');const changed=count!==value;const reselect=['group','flashGroup'].some(id=>{const selected=document.getElementById(id)?.value;return selected&&Number(selected.slice(-2))>value});const hostSelect=document.getElementById('host'),oldHost=hostSelect?.value;count=value;if(!changed)return count;for(const id of ['group','flashGroup','guideGroup'])populate(document.getElementById(id));populate(hostSelect,true);if(hostSelect&&oldHost!==hostSelect.value)hostSelect.dispatchEvent(new Event('input',{bubbles:true}));if(changed)document.dispatchEvent(new CustomEvent('pi-helper-groups-changed',{detail:{count,reselect}}))}
let refreshSequence=0;
async function refresh(teacher){const sequence=++refreshSequence;if(!window.PiSyncAPI?.configured())return count;const data=await PiSyncAPI.rpc('pi_helper_group_settings',{p_room_code:window.PI_HELPER_CONFIG.defaultRoomCode,...(teacher?{p_teacher_code:teacher}:{})});if(sequence===refreshSequence)apply(data.group_count);return count}
window.PiGroups={get count(){return count},host,populate,apply,refresh};
})();
