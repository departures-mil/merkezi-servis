// Merkezi Servis – Electron ana süreç
// Pencere, tam ekran açılış, sağ üst pencere düğmeleri, GitHub Releases güncellemesi (yama + tam dosya) ve ana süreç
// hata raporu ortak çekirdekten gelir (cekirdek/electron/fc-electron-main.js). Burada yalnız uygulamaya özgü IPC kalır.
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fc = require('./cekirdek/electron/fc-electron-main');

const WWW = path.join(__dirname, 'www');
// Kullanıcı verisi: %APPDATA%\Merkezi Servis\merkezi-servis-data.json (eski sürümlerle aynı yer; güncelleme dokunmaz)
const DATA_FILE = () => path.join(app.getPath('userData'), 'merkezi-servis-data.json');

// Tek kopya: ikinci açılış mevcut pencereyi öne getirir (iki pencerenin aynı veri dosyasına yazması önlenir)
const gotLock = !!process.env.MS_SMOKE || app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

let win;
function createWindow() {
  win = new BrowserWindow(fc.windowOptions({
    minWidth: 900, minHeight: 600,
    title: 'Merkezi Servis',
    backgroundColor: '#070b14',
    icon: path.join(WWW, 'assets', 'icon.png'),
    // sandbox:false → preload ortak çekirdeğin fc-preload.js'ini require edebilir (contextIsolation açık kalır)
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: false }
  }));
  fc.install(win, { channel: 'win-app' });
  win.loadFile(path.join(WWW, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); } });
  if (process.env.MS_SMOKE) smoke();
}

// Electron açılış testi (npm run test:electron): pencere yüklendi mi, çekirdek başladı mı?
function smoke() {
  const out = (o) => { process.stdout.write('MS_SMOKE ' + JSON.stringify(o) + '\n'); };
  const consoleErrors = [];
  win.webContents.on('console-message', (e, level, message) => { if (level >= 3) consoleErrors.push(String(message).slice(0, 300)); });
  const fail = setTimeout(() => { out({ ok: false, error: 'timeout' }); app.exit(2); }, 45000);
  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const r = await win.webContents.executeJavaScript(`({
          fc: !!(window.FC && FC.updater && FC.topbar), host: window.FC && FC.host.kind, fcHost: !!window.fcHost, api: !!window.electronAPI,
          version: window.APP_RELEASE && APP_RELEASE.version, scheme: document.documentElement.dataset.scheme,
          topbar: !!document.querySelector('#topbar .topbar-actions'), winBtns: document.querySelectorAll('#topbar .win-controls button').length,
          nav: document.querySelectorAll('#nav .nav-item').length, title: document.title, errors: (window.__msErrors || []).slice(0, 5)
        })`);
        r.fullscreen = win.isFullScreen(); r.appVersion = app.getVersion(); r.errors = r.errors.concat(consoleErrors.filter((m) => !/net::|Failed to load resource|ERR_/.test(m)));
        clearTimeout(fail);
        out(Object.assign({ ok: r.fc && r.host === 'electron' && r.topbar && r.nav > 0 && !r.errors.length }, r));
        app.exit(0);
      } catch (e) { out({ ok: false, error: String(e && e.message || e) }); app.exit(3); }
    }, 2500);
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- Veri dosyası (localStorage'a ek olarak diske de yazılır) ----
// Yazma atomiktir: önce .tmp, sonra yeniden adlandırma; önceki dosya .bak olarak kalır (veri asla yarım yazılmaz).
ipcMain.handle('data:load', () => {
  for (const f of [DATA_FILE(), DATA_FILE() + '.bak']) { try { const s = fs.readFileSync(f, 'utf8'); JSON.parse(s); return s; } catch (e) { /* sıradaki */ } }
  return null;
});
ipcMain.handle('data:save', (e, json) => {
  try {
    JSON.parse(json);
    const f = DATA_FILE(), tmp = f + '.tmp';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, json, 'utf8');
    if (fs.existsSync(f)) { try { fs.copyFileSync(f, f + '.bak'); } catch (err) { /* önemli değil */ } }
    fs.renameSync(tmp, f);
    return true;
  } catch (err) { return false; }
});
ipcMain.handle('data:path', () => DATA_FILE());

// ---- Dosya kaydetme (Excel / yedek) ----
ipcMain.handle('file:save', async (e, { name, dataBase64, filters }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: filters || [{ name: 'Tüm dosyalar', extensions: ['*'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(dataBase64, 'base64'));
  return r.filePath;
});
ipcMain.handle('file:open', async (e, { filters }) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filters || [] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { name: path.basename(r.filePaths[0]), dataBase64: fs.readFileSync(r.filePaths[0]).toString('base64') };
});
ipcMain.handle('app:info', () => ({ version: app.getVersion(), userData: app.getPath('userData'), packaged: app.isPackaged }));
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('app:print', () => win.webContents.print({ silent: false, printBackground: true }));
