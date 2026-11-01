(()=>{
'use strict';
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const guides={
 3:{title:'先找 USB 相機這一段',steps:['先看終端機最後的「可用 USB 相機：/dev/video…」，記下工具找到的位置。','再找 GENERAL WEBCAM 這一段。它下面的 /dev/video… 才是這台 USB 相機的候選位置。','下一步在網頁的「相機位置」選同一個位置。編號可能不同，不要直接照抄老師的 video0。']},
 4:{title:'確認選到能拍照的位置',steps:['在上方「相機位置」選本組剛才查到的 /dev/video…，再複製這一步的指令。','在終端機結果找 MJPG，再往它下面找 1920x1080。看到這兩個，才符合這次拍照作業的格式。','找不到格式、出現錯誤，或工具說不是可取像的 USB 相機：回上一行重看「可用 USB 相機」，改選同一台相機的可用位置，再執行一次。']},
 5:{title:'看設定，核對拍照的位置',steps:['留在剛才選好的相機位置，執行本頁指令。不要換成別的 video 編號。','在終端機找 Driver name：同款 USB 相機應看到 uvcvideo。再找 Device Caps 這一區的 Video Capture 或 Video Capture Multiplanar。','如果 Device Caps 只有 Metadata Capture，這個位置只傳相機資料，不提供畫面。回到「列出 USB 相機」，改選有畫面的節點，重新做解析度與設定查詢。']}
};
function build(lineIndex,device='/dev/video0',{collapsed=false}={}){
 const info=guides[lineIndex];if(!info)return null;
 const box=make(collapsed?'details':'section',undefined,'camera-device-guide');box.dataset.guideLine=String(lineIndex);box.append(make(collapsed?'summary':'h3',info.title));
 const steps=make('ol');for(const text of info.steps)steps.append(make('li',text));box.append(steps);
 if(lineIndex===3){
  const figure=make('figure',undefined,'camera-device-example');figure.append(make('figcaption','老師實測清單節錄｜只用來對照，不用貼到終端機'));
  figure.append(make('code','bcm2835-codec-decode (platform:…):\n    /dev/video10\nrpi-hevc-dec (platform:…):\n    /dev/video19','camera-device-ignore'));
  const usb=make('code',undefined,'camera-device-usb');usb.append(document.createTextNode('GENERAL WEBCAM: GENERAL WEBCAM (usb-…):\n    '),make('mark','/dev/video0'),document.createTextNode('\n    /dev/video1\n    /dev/media4'));figure.append(usb);box.append(figure,make('p','bcm2835…、rpi-hevc-dec 是 Pi 內部裝置，這一步不用選。/dev/media4 也不是拍照位置。同一台 USB 相機列出多個項目，不代表接了好幾台相機。','camera-device-note'));
 }else{
  box.append(make('p','目前網頁選擇：'+device+'。請與本組清單核對。','camera-device-choice'));
  if(lineIndex===4){const figure=make('figure',undefined,'camera-device-example');figure.append(make('figcaption','格式長這樣｜1920x1080 要在 MJPG 下面'),make('code',"[0]: 'MJPG' (Motion-JPEG)\n    Size: Discrete 1920x1080\n    Size: Discrete 1280x720\n[1]: 'YUYV'\n    Size: Discrete 640x480"));box.append(figure)}else box.append(make('p','這裡確認相機位置；下一階段還要開啟預覽、實際拍照。','camera-device-note'));
 }
 const reference=make('details',undefined,'camera-device-reference');reference.append(make('summary','同款相機的老師實測參考'));
 const table=make('table'),caption=make('caption','以下是老師那台 Pi 的結果，各組位置仍以自己的查詢為準。'),body=make('tbody');
 for(const [label,value] of [['驅動','uvcvideo（標準 UVC，系統已內建，不用另外下載廠商驅動）'],['可取像位置','老師這次是 /dev/video0；每組編號可能不同'],['MJPG／MJPEG','列出 1920×1080、1280×720，皆有 30 FPS 模式'],['YUYV','最高列出 640×480、30 FPS'],['當時設定','1920×1080、MJPEG、30 FPS'],['對焦控制','當時沒有列出自動或手動對焦控制項']]){const tr=make('tr'),th=make('th',label);th.scope='row';tr.append(th,make('td',value));body.append(tr)}
 table.append(caption,body);reference.append(table,make('p','清單列出 30 FPS 是支援模式，不代表已確認能長時間穩定拍攝；照片是否清楚仍要打開確認。','camera-device-note'));box.append(reference);return box;
}
window.PiCameraDeviceGuide={build};
})();
