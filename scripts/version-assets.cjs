'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),files=fs.readdirSync(root).sort();
const hash=crypto.createHash('sha256');
for(const name of files.filter(name=>/\.(css|js)$/.test(name))){hash.update(name+'\0');hash.update(fs.readFileSync(path.join(root,name)));hash.update('\0');}
const version=hash.digest('hex').slice(0,12);let count=0,stale=[];
for(const name of files.filter(name=>name.endsWith('.html'))){
 const target=path.join(root,name),source=fs.readFileSync(target,'utf8');
 const updated=source.replace(/((?:src|href)=["'])([^"']+\.(?:css|js))(?:\?[^"']*)?(["'])/g,(match,start,url,end)=>{
  if(/^(?:[a-z]+:|\/\/)/i.test(url))return match;
  if(!fs.existsSync(path.join(root,url)))throw Error('Missing local asset: '+url);
  count++;return start+url+'?v='+version+end;
 });
 if(updated!==source){stale.push(name);if(!process.argv.includes('--check'))fs.writeFileSync(target,updated);}
}
if(process.argv.includes('--check')&&stale.length){console.error('Stale asset versions: '+stale.join(', ')+'. Run node scripts/version-assets.cjs');process.exit(1);}
console.log('Asset version '+version+': '+count+' local CSS/JS references '+(process.argv.includes('--check')?'verified.':'updated.'));
