'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

function isJobFile(value, file, windows = process.platform === 'win32') {
  try {
    const url = new URL(value);
    if (url.protocol !== 'file:' || url.search || url.hash) return false;
    const requested = fileURLToPath(url, { windows });
    return windows
      ? path.win32.normalize(requested).toLowerCase() === path.win32.normalize(file).toLowerCase()
      : requested === file;
  } catch { return false; }
}

function mayLoad(details, file, trusted) {
  if (details.resourceType === 'mainFrame') return isJobFile(details.url, file);
  if (!['image', 'font', 'stylesheet', 'media'].includes(details.resourceType)) return false;
  return /^(?:data:image\/|data:font\/|data:application\/(?:font-|vnd\.ms-fontobject))/i.test(details.url) || trusted(details.url);
}

async function printHTML({app, BrowserWindow, session, trusted, html, receipt, options}) {
  let directory, win;
  try {
    directory = await fs.mkdtemp(path.join(app.getPath('temp'), 'sagrario-print-'));
    const htmlPath = path.join(directory, 'documento.html');
    await fs.writeFile(htmlPath, html, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
    const file = await fs.realpath(htmlPath);
    const isolated = session.fromPartition('sagrario-print');
    isolated.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    isolated.setPermissionCheckHandler(() => false);
    isolated.webRequest.onBeforeRequest((details, cb) => cb({cancel: !mayLoad(details, file, trusted)}));
    win = new BrowserWindow({show: false, width: receipt ? 303 : 816, height: 1056,
      webPreferences: {session: isolated, javascript: false, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false}
    });
    win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('will-redirect', event => event.preventDefault());
    try { await win.loadFile(file); }
    catch { throw new Error('No se pudo abrir la hoja de impresión. Cierra el documento y vuelve a intentarlo.'); }
    await new Promise((resolve, reject) => {
      win.webContents.print(options, (ok, reason) => ok ? resolve() : reject(new Error(/cancel/i.test(reason || '') ? 'Impresión cancelada.' : 'La impresora no aceptó el documento. Revisa el papel y la conexión.')));
    });
  } finally {
    try { if (win && !win.isDestroyed()) win.destroy(); }
    finally { if (directory) await fs.rm(directory, {recursive: true, force: true, maxRetries: 3, retryDelay: 100}); }
  }
}
module.exports = {isJobFile, mayLoad, printHTML};
