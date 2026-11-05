'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const args=process.argv.slice(2);const [action,dir]=args;
const hash=(bytes,type)=>crypto.createHash(type).update(bytes).digest('hex');
if(action==='extract'){
 const old=fs.readFileSync(path.join(dir,'previous.exe'));
 if(hash(old,'sha256')!=='427169ed2e1aa46c74d192b4fb103d3234904385619c2ae54da5b5f75886b2f4')throw Error('Unexpected official 1.2.0 installer');
 const signature=Buffer.from('377abcaf271c','hex');let offset=-1;
 while((offset=old.indexOf(signature,offset+1))>=0){
  const size=32+Number(old.readBigUInt64LE(offset+12))+Number(old.readBigUInt64LE(offset+20));
  if(size>100000000&&offset+size<=old.length){fs.writeFileSync(path.join(dir,'payload.7z'),old.subarray(offset,offset+size));break;}
 }
 if(offset<0)throw Error('Missing Windows runtime');
}else if(action==='config'){
 const baseline=fs.readFileSync(path.join(dir,'original','resources','app.asar'));
 if(hash(baseline,'sha256')!=='9ee383b3963d50927446e427100880e6819aabd4cb3ad4017cbcc64abe272ef4')throw Error('Unexpected stock application');
 const config={appId:'mx.sagrario.pos',productName:'Sagrario POS',electronVersion:'44.7.1',asar:true,npmRebuild:false,directories:{output:path.resolve(dir,'installer')},artifactName:'Sagrario-POS-Setup-${version}.${ext}',win:{target:'nsis',icon:'assets/icon.ico'},nsis:{guid:'a6eea4d1-99a9-50a9-a38d-d93e7d6f4051',oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,deleteAppDataOnUninstall:false,shortcutName:'Sagrario POS'},publish:[{provider:'github',owner:'sistemascalc',repo:'sagrario-pos-instaladores',releaseType:'release'}]};
 fs.writeFileSync(path.join(dir,'builder.json'),JSON.stringify(config,null,2));
}else if(action==='verify'){
 const release=path.join(dir,'installer'),name='Sagrario-POS-Setup-1.2.1.exe';
 const bytes=fs.readFileSync(path.join(release,name)),yml=fs.readFileSync(path.join(release,'latest.yml'),'utf8');
 const digest=crypto.createHash('sha512').update(bytes).digest('base64');
 if(bytes.subarray(0,2).toString()!=='MZ'||!yml.includes(digest)||!yml.includes('version: 1.2.1')||!yml.includes(name)||!fs.statSync(path.join(release,name+'.blockmap')).size)throw Error('Installer or update metadata invalid');
 console.log('Verified installer and auto-update checksum',hash(bytes,'sha256'));
}
