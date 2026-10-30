'use strict';
// Compatibility entry for the interactive preview's real-UI screenshots.
// No credentials, Supabase connection or temporary classroom is needed.
const path=require('node:path'),{spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,[path.join(__dirname,'../tests/run-workbench-preview-browser.cjs')],{stdio:'inherit',env:{...process.env,PI_HELPER_CAPTURE_PREVIEW:'1'}});
if(result.error)throw result.error;
process.exit(result.status??1);
