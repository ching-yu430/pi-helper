(()=>{
'use strict';
const main=document.querySelector('main');if(!main)return;
const notice=document.createElement('p');notice.className='classroom-pause-notice';notice.id='classroomPauseNotice';notice.setAttribute('role','status');notice.hidden=true;notice.textContent='先完成目前步驟，等老師說明。';main.prepend(notice);
function render(){notice.hidden=window.PiLearning?.policy.teaching_paused!==true}
document.addEventListener('pi-helper-course-policy',render);render();
})();
