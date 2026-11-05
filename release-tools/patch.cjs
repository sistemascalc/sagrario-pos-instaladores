'use strict';
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(process.argv[2]);
const read = file => fs.readFileSync(path.join(target, file), 'utf8');
const write = (file, text) => fs.writeFileSync(path.join(target, file), text);
function replace(source, from, to) {
  if (source.split(from).length !== 2) throw Error('Unexpected 1.2.0 source at ' + from.slice(0,50));
  return source.replace(from, () => to);
}
const pkg = JSON.parse(read('package.json'));
if (pkg.name !== 'sagrario-pos' || pkg.version !== '1.2.0') throw Error('Requires official Sagrario POS 1.2.0');
let main = read('main.cjs');
main = replace(main, "const { createActivation } = require('./activation.cjs');", "const { createActivation } = require('./activation.cjs');\nconst { printHTML } = require('./print-native.cjs');");
main = replace(main,'let printWindow, acquired = false;', 'let acquired = false;');
main = replace(main,"const deviceName = readSettings()[entry.kind] || '';", "const receipt = entry.kind === 'pos' && payload.receipt === true;\n    const deviceName = readSettings()[receipt ? 'pos' : 'intentions'] || '';");
const start = main.indexOf("    const printSession = session.fromPartition('sagrario-print');");
const end = main.indexOf('    const options = { silent:',start);
if (start < 0 || end < start || !main.slice(start,end).includes("loadURL('data:text/html")) throw Error('Old data-URL loader not found');
main = main.slice(0,start) + main.slice(end);
main = replace(main, "} : 'A4',", "} : entry.kind === 'pos' ? 'Letter' : 'A4',");
main = replace(main, "await new Promise((resolve, reject) => printWindow.webContents.print(options, (ok, reason) => ok ? resolve() : reject(new Error(reason || 'La impresión se canceló.'))));", "await printHTML({app, BrowserWindow, session, trusted, html: payload.html, receipt, options});");
main = replace(main, 'if (printWindow && !printWindow.isDestroyed()) printWindow.destroy(); if (acquired) printing = false;', 'if (acquired) printing = false;');
let preload = read('print-preload.cjs');
preload = replace(preload, 'const copy = doc.documentElement.cloneNode(true);', `const agenda = doc.body.classList.contains('pa-printing') && doc.getElementById('parishPrintArea');
          const copy = doc.documentElement.cloneNode(!agenda);
          if (agenda) {
            const body = doc.body.cloneNode(false);
            body.append(agenda.cloneNode(true));
            copy.append(doc.head.cloneNode(true), body);
          }`);
preload = replace(preload, "else target.dispatchEvent(new Event('afterprint'));", 'return result;');
preload = replace(preload, "} catch (error) { window.alert('No se pudo imprimir: ' + error.message); }\n        finally { busy = false; }", "} catch (error) { window.alert('No se pudo imprimir: ' + error.message); return {ok:false,error:error.message}; }\n        finally { busy = false; target.dispatchEvent(new Event('afterprint')); }");
write('main.cjs',main);write('print-preload.cjs',preload);
fs.copyFileSync(path.join(__dirname,'print-native.cjs'),path.join(target,'print-native.cjs'));
pkg.version='1.2.1';write('package.json',JSON.stringify(pkg,null,2)+'\n');
