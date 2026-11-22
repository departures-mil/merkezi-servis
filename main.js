// Merkezi Servis – Electron ana süreç
const { app, BrowserWindow, ipcMain, dialog, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

const BUNDLED_WWW = path.join(__dirname, 'www');
const UPDATE_DIR = () => path.join(app.getPath('userData'), 'app-update');
const UPDATE_WWW = () => path.join(UPDATE_DIR(), 'www');
const DATA_FILE = () => path.join(app.getPath('userData'), 'merkezi-servis-data.json');

function readVersion(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).version || '0.0.0'; }
  catch (e) { return '0.0.0'; }
}
function cmpVer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}
// Güncellenmiş kopya bundled sürümden yeniyse onu, değilse bundled'ı kullan
function activeWww() {
  const upd = UPDATE_WWW();
  if (fs.existsSync(path.join(upd, 'index.html')) && cmpVer(readVersion(upd), readVersion(BUNDLED_WWW)) > 0) return upd;
  return BUNDLED_WWW;
}

// Chromium ağı (sistem proxy/VPN ayarlarını kullanır); raw.githubusercontent erişilemezse jsDelivr yedeği
const MIRRORS = base => {
  const m = base.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//);
  return m ? [base, `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}/`] : [base];
};
async function fetchOne(url, onChunk) {
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await net.fetch(url, { signal: ctrl.signal, cache: 'no-store', headers: { 'User-Agent': 'MerkeziServis' } });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' – ' + url);
    if (!onChunk || !r.body) return Buffer.from(await r.arrayBuffer());
    const reader = r.body.getReader(); const parts = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      parts.push(Buffer.from(value)); got += value.length; onChunk(value.length, got);
    }
    return Buffer.concat(parts);
  } finally { clearTimeout(tm); }
}
let workingBase = null;
async function fetchFrom(base, rel, onChunk) {
  const list = workingBase && MIRRORS(base).includes(workingBase) ? [workingBase, ...MIRRORS(base).filter(x => x !== workingBase)] : MIRRORS(base);
  let lastErr;
  for (const b of list) {
    let got = 0;
    try { const buf = await fetchOne(b + rel + (b.includes('jsdelivr') ? '' : (rel.includes('?') ? '&' : '?') + 't=' + Date.now()), onChunk && ((n, g) => { got = g; onChunk(n); })); workingBase = b; return buf; }
    catch (e) { lastErr = e; if (onChunk && got) onChunk(-got); }
  }
  throw lastErr;
}
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1380, height: 860, minWidth: 1000, minHeight: 640,
    title: 'Merkezi Servis',
    icon: path.join(BUNDLED_WWW, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(activeWww(), 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---- Veri dosyası (localStorage'a ek olarak diske de yazılır) ----
ipcMain.handle('data:load', () => { try { return fs.readFileSync(DATA_FILE(), 'utf8'); } catch (e) { return null; } });
ipcMain.handle('data:save', (e, json) => { try { fs.writeFileSync(DATA_FILE(), json, 'utf8'); return true; } catch (err) { return false; } });
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
ipcMain.handle('app:info', () => ({
  bundledVersion: readVersion(BUNDLED_WWW), activeVersion: readVersion(activeWww()),
  updatedCopy: activeWww() !== BUNDLED_WWW, userData: app.getPath('userData')
}));

// ---- Güncelleme: GitHub raw üzerinden ----
ipcMain.handle('update:check', async (e, baseUrl) => {
  const base = baseUrl.replace(/\/?$/, '/');
  const manifest = JSON.parse((await fetchFrom(base, 'update.json')).toString('utf8'));
  const current = readVersion(activeWww());
  return { current, remote: manifest.version, available: cmpVer(manifest.version, current) > 0, notes: manifest.notes || '', files: manifest.files || [] };
});
ipcMain.handle('update:apply', async (e, baseUrl) => {
  const base = baseUrl.replace(/\/?$/, '/');
  const manifest = JSON.parse((await fetchFrom(base, 'update.json')).toString('utf8'));
  const files = manifest.files || [];
  if (!files.length) throw new Error('Manifest dosya listesi boş');
  const tmp = path.join(UPDATE_DIR(), 'tmp-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  // İlerleme bildirimi: indirilen / toplam bayt (toplam manifestteki "sizes" alanından)
  const sizes = manifest.sizes || {};
  const total = files.reduce((a, f) => a + (sizes[f] || 0), 0);
  let done = 0, lastSent = 0;
  const send = (force) => { const now = Date.now(); if (!force && now - lastSent < 120) return; lastSent = now; try { e.sender.send('update:progress', { done, total, version: manifest.display || manifest.version }); } catch (_) { } };
  send(true);
  for (const f of files) {
    const buf = await fetchFrom(base, f, n => { done += n; send(false); });
    const dest = path.join(tmp, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
  }
  send(true);
  fs.writeFileSync(path.join(tmp, 'www', 'version.json'), JSON.stringify({ version: manifest.version, display: manifest.display }), 'utf8');
  // Güncellemede gelmeyen dosyaları (seed.json, kütüphaneler, resimler) paketten tamamla
  const copyMissing = (src, dst) => {
    for (const name of fs.readdirSync(src)) {
      const s = path.join(src, name), d = path.join(dst, name);
      if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyMissing(s, d); }
      else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
    }
  };
  copyMissing(BUNDLED_WWW, path.join(tmp, 'www'));
  // Eski güncellemeyi değiştir
  const target = UPDATE_WWW();
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(path.join(tmp, 'www'), target);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { version: manifest.version };
});
ipcMain.handle('update:reset', () => { const t = UPDATE_WWW(); if (fs.existsSync(t)) fs.rmSync(t, { recursive: true, force: true }); return true; });
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
// admin ile iletişim — FormSubmit, Referer/Origin başlığı olmayan isteği reddeder; mesaj ana süreçten gider
ipcMain.handle('contact:send', async (e, m) => {
  const msg = String((m && m.message) || '').slice(0, 5000).trim();
  if (!msg) return { ok: false, error: 'empty' };
  const to = Buffer.from('bW9jLmxpYW1ub3RvcnBANDMyMWxkaW50bWxkYmE=', 'base64').toString().split('').reverse().join('');
  const body = { _subject: 'Merkezi Servis: yeni mesaj', _template: 'table', _captcha: 'false', Ad: String(m.name || '-').slice(0, 80), Mesaj: msg, Surum: String(m.version || app.getVersion()), Cihaz: 'Windows', Dil: String(m.lang || '') };
  if (m.email) { body.email = String(m.email).slice(0, 120); body._replyto = body.email; }
  try {
    const r = await fetch('https://formsubmit.co/ajax/' + to, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: 'https://departures-mil.github.io/merkezi-servis/', Origin: 'https://departures-mil.github.io' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if ((!r.ok || String(j.success) === 'false') && !/activat/i.test(j.message || '')) return { ok: false, error: j.message || String(r.status) };
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('app:print', () => win.webContents.print({ silent: false, printBackground: true }));
