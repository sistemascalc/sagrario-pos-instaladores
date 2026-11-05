'use strict';
const {app, BrowserWindow, session} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {printHTML, isJobFile, mayLoad} = require('./print-native.cjs');
let root;
async function run() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sagrario-qa-'));
  await fs.mkdir(path.join(root,'profile'));app.setPath('userData',path.join(root,'profile'));
  app.on('window-all-closed',()=>{});await app.whenReady();
  const large='<!doctype html><html lang="es"><body><p>Agenda de prueba · San José · 11:00 AM</p><!--'+' '.repeat(1800000)+'--></body></html>';
  const before=new BrowserWindow({show:false,webPreferences:{javascript:false,sandbox:true}});
  try {
    const old='data:text/html;charset=utf-8,'+encodeURIComponent(large);
    await assert.rejects(before.loadURL(old),e=>e.code==='ERR_INVALID_URL' || e.errno===-300);
  }finally{before.destroy();}
  const printed=[];
  class TestWindow extends BrowserWindow {
    constructor(options) {
      super(options);const wc=this.webContents;
      wc.print=(opts,callback)=>{
        if(opts.deviceName==='fail'){callback(false,'failed');return;}
        wc.printToPDF({printBackground:true,pageSize:opts.pageSize==='A4'?'A4':'Letter',preferCSSPageSize:true}).then(async bytes=>{
          assert(bytes.subarray(0,5).toString()==='%PDF-');assert(bytes.length>1000);
          const url=wc.getURL();assert(url.startsWith('file:'));assert(url.length<1000);
          const source=await fs.readFile(require('node:url').fileURLToPath(url),'utf8');
          printed.push({size:Buffer.byteLength(source),printer:opts.deviceName,paper:opts.pageSize,bytes:bytes.length});callback(true);
        }).catch(e=>callback(false,e.message));
      };
    }
  }
  const docs=[['receipt','<h1>Recibo</h1>',true,{width:80000,height:90000}],['intenciones','<h1>Intenciones del día</h1>',false,'A4'],['agenda',large,false,'Letter']];
  const submit=(html,receipt,options)=>printHTML({app:{getPath:()=>root},BrowserWindow:TestWindow,session,trusted:()=>false,html,receipt,options});
  for(const [name,html,receipt,paper] of docs)await submit(html,receipt,{deviceName:name,pageSize:paper,printBackground:true});
  assert.equal(printed.length,3);assert.equal(printed[2].size,Buffer.byteLength(large));
  await assert.rejects(submit(large,false,{deviceName:'fail',pageSize:'Letter'}),/impresora/);
  assert(!(await fs.readdir(root)).some(n=>n.startsWith('sagrario-print-')));
  assert(isJobFile('file:///c:/Temp/El%20Sagrario/documento.html','C:\\Temp\\El Sagrario\\documento.html',true));
  assert(!mayLoad({url:'file:///etc/passwd',resourceType:'image'},'/job/documento.html',()=>false));
  assert(!mayLoad({url:'data:text/html,otro',resourceType:'mainFrame'},'/job/documento.html',()=>true));
  console.log('PASS: reproduced original -300 and printed receipt, A4 intentions and long Letter agenda through the fixed loader; verified cleanup on success and failure.',JSON.stringify(printed));
}
run().then(()=>finish(0)).catch(e=>{console.error(String(e.message).slice(0,420));finish(1);});
async function finish(code){for(const w of BrowserWindow.getAllWindows())w.destroy();if(root)await fs.rm(root,{recursive:true,force:true,maxRetries:3}).catch(()=>{});app.exit(code);}
