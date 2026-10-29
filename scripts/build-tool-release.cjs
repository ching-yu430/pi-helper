'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.join(__dirname,'..');
const arg=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const file=path.join(root,'tooling/release.json'),version=arg('version')||(fs.existsSync(file)?JSON.parse(fs.readFileSync(file)).version:'1.0.0');
if(!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version))throw Error('Invalid version');
const sources={device:'device-agent/pi_reporter.py',course:'courseware/pi_course.py',camera:'courseware/camera_app.py'},hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const release={version,bootstrap_sha256:hash('tooling/install.py'),files:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(v)]))};
const json=JSON.stringify(release,null,2)+'\n',dir=path.join(root,'tooling/releases',version),migrationDir=path.join(root,'supabase/migrations');
const seed="insert into pi_helper.tool_releases(version,bootstrap_sha256,files) values ('"+version+"','"+release.bootstrap_sha256+"','"+JSON.stringify(release.files)+"'::jsonb) on conflict(version) do nothing;";
const bundle={...Object.fromEntries(Object.entries(sources).map(([k,v])=>[k+'.py',v])),'install.py':'tooling/install.py'};
if(process.argv.includes('--check')){
 if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==json||!fs.readdirSync(migrationDir).some(name=>name.endsWith('.sql')&&fs.readFileSync(path.join(migrationDir,name),'utf8').includes(seed)))throw Error('Release catalog is stale; publish a new immutable version.');
 for(const [name,source] of Object.entries(bundle))if(!fs.existsSync(path.join(dir,name))||!fs.readFileSync(path.join(dir,name)).equals(fs.readFileSync(path.join(root,source))))throw Error('Released package differs from its source.');
 console.log('Tool release hashes and immutable package match the installer, components and SQL catalog.');
}else{
 const migration=path.join(migrationDir,arg('migration')||'016_tool_assignments.sql'),sql=fs.readFileSync(migration,'utf8');
 if(!sql.includes('-- RELEASE_SEED'))throw Error('Use a new migration and version for an already published package.');
 fs.mkdirSync(dir,{recursive:true});for(const [name,source] of Object.entries(bundle))fs.copyFileSync(path.join(root,source),path.join(dir,name));
 fs.writeFileSync(file,json);fs.writeFileSync(migration,sql.replace('-- RELEASE_SEED',seed));console.log('Prepared immutable tool release '+version);
}
