(()=>{
'use strict';
const key='pi-helper-selected-group:'+(window.PI_HELPER_CONFIG?.defaultRoomCode||'default');
const valid=group=>typeof group==='string'&&/^pi5-(?:0[1-9]|[1-9]\d)$/.test(group);
function read(){const params=new URLSearchParams(window.location?.search||'');if(params.has('group')){const group=params.get('group');return valid(group)?group:''}try{const group=sessionStorage.getItem(key);return valid(group)?group:''}catch{return ''}}
function homeLinks(group){try{for(const link of document.querySelectorAll('[data-group-home]')){const url=new URL('index.html',location.href);if(valid(group))url.searchParams.set('group',group);link.href=url.href}}catch{}}
function save(group){if(!valid(group))return;try{sessionStorage.setItem(key,group)}catch{}try{const url=new URL(location.href);url.searchParams.set('group',group);history.replaceState(null,'',url)}catch{}homeLinks(group)}
function clear(){try{sessionStorage.removeItem(key)}catch{}try{const url=new URL(location.href);url.searchParams.delete('group');history.replaceState(null,'',url)}catch{}homeLinks('')}
window.PiStudentGroup={read,save,clear,valid};
})();
