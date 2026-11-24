#!/usr/bin/env node
// Arayüz ekran görüntüleri (başsız Chromium, sahte kabuk): node tools/ekran.js <çıktı-klasörü>
// PLAYWRIGHT_CORE=/yol/playwright-core ve PLAYWRIGHT_BROWSERS_PATH ortamdan alınır. Ağ istekleri engellenir.
'use strict';
const path = require('path');
const fs = require('fs');
const pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const OUT = path.resolve(process.argv[2] || 'ekran');
const URL0 = 'file://' + path.join(__dirname, '..', 'www', 'index.html');
fs.mkdirSync(OUT, { recursive: true });

function sample() {
  const P = (id, name, type, lat, lon) => ({ id, name, type, lat, lon, exempt: null });
  const places = [P('w1', 'Kadısiye', 'work', 35.13, 36.75), P('w2', 'Hama', 'work', 35.14, 36.76), P('h1', 'Suran', 'home', 35.29, 36.75), P('h2', 'Taybe', 'home', 35.25, 36.80), P('h3', 'Halfaya', 'home', 35.26, 36.61), P('h4', 'Mahrada', 'home', 35.25, 36.57), P('h5', 'Kafr Nabudah', 'home', 35.43, 36.57)];
  const lines = [{ id: 'l1', name: 'Kuzey hattı', endA: 'w1', stops: ['h1', 'h2', 'h5'], color: '#0891b2' }, { id: 'l2', name: 'Batı hattı', endA: 'w1', stops: ['h3', 'h4'], color: '#d97706' }];
  const names = ['Ahmet Yılmaz', 'Mehmet Kaya', 'Ali Demir', 'Hasan Çelik', 'Hüseyin Şahin', 'İbrahim Koç', 'Mustafa Arslan', 'Yusuf Aydın', 'Ömer Doğan', 'Halil Kılıç', 'Ramazan Aslan', 'Murat Öztürk', 'Emre Polat', 'Kerem Taş', 'Selim Kurt', 'Burak Ateş', 'Okan Bulut', 'Cem Yıldız'];
  const persons = names.map((n, i) => ({ id: 'u' + i, seq: i + 1, regNo: String(1000 + i), title: 'Uzman', name: n, mother: '', nickname: '', group: ['A', 'A1', 'B', 'B2'][i % 4], homeId: ['h1', 'h2', 'h3', 'h4', 'h5'][i % 5], workId: 'w1', lineId: i % 5 < 2 || i % 5 === 4 ? 'l1' : 'l2', exempt: null, active: true, notes: '' }));
  return { schemaVersion: 1, savedAt: Date.now(), settings: { orgName: 'Merkezi Servis Hizmeti', adminName: 'İdareci', lang: 'tr', splash: false, cycleDays: 10 }, places, lines, persons, groupsV2: true };
}
const shots = [
  { name: 'tr-falcon-dark', lang: 'tr', theme: 'dark', scheme: 'falcon' },
  { name: 'ar-falcon-light', lang: 'ar', theme: 'light', scheme: 'falcon' },
  { name: 'tr-klasik', lang: 'tr', theme: 'light', scheme: 'klasik' },
  { name: 'tr-klasik-dark', lang: 'tr', theme: 'dark', scheme: 'klasik' },
  { name: 'tr-falcon-dark-ayarlar', lang: 'tr', theme: 'dark', scheme: 'falcon', page: 'settings' },
  { name: 'ar-falcon-light-ayarlar', lang: 'ar', theme: 'light', scheme: 'falcon', page: 'settings' },
  { name: 'tr-falcon-dark-kisiler', lang: 'tr', theme: 'dark', scheme: 'falcon', page: 'persons' },
  { name: 'ar-falcon-light-kisiler', lang: 'ar', theme: 'light', scheme: 'falcon', page: 'persons' },
  { name: 'tr-eski-kabuk-kopru', lang: 'tr', theme: 'dark', scheme: 'falcon', legacy: true }
];
(async () => {
  const browser = await pw.chromium.launch();
  const errors = [];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: s.page === 'settings' ? 2300 : 960 }, deviceScaleFactor: 1 });
    await ctx.route(/^https?:/, (r) => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(s.name + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errors.push(s.name + ' console: ' + m.text()); });
    await page.addInitScript(({ s, data }) => {
      const set = (k, v) => localStorage.setItem('fc.' + k, JSON.stringify(v));
      set('lang', s.lang); set('theme', s.theme); set('scheme', s.scheme); set('onboarding.done', true); set('whatsnew.seen', s.ver || '9.9.9');
      const json = JSON.stringify(Object.assign(data, { settings: Object.assign(data.settings, { lang: s.lang }) }));
      if (s.legacy) {   // ≤1.0.11 kabuğu: fcHost yok, eski electronAPI var
        window.electronAPI = { loadData: async () => json, saveData: async () => true, dataPath: async () => 'C:\\Users\\x\\AppData\\Roaming\\Merkezi Servis\\merkezi-servis-data.json', checkUpdate: async () => ({}), applyUpdate: async () => ({}), relaunch: async () => {}, print: async () => {}, saveFile: async () => null, openFile: async () => null };
        return;
      }
      const st = { fullscreen: true, half: false }, cbs = [];
      window.fcHost = { kind: 'electron', platform: 'win32', version: '1.1.0', window: { minimize: async () => {}, half: async () => {}, toggleFullscreen: async () => {}, close: async () => {}, getState: async () => st, onState: (f) => { cbs.push(f); return () => {}; } }, update: { channel: 'win-app', applyPatch: async () => 'restarting', installFull: async () => 'restarting' } };
      window.electronAPI = { shell: 'fc', loadData: async () => json, saveData: async () => true, dataPath: async () => 'C:\\Users\\x\\AppData\\Roaming\\Merkezi Servis\\merkezi-servis-data.json', saveFile: async () => null, openFile: async () => null, appInfo: async () => ({ version: '1.1.0' }), relaunch: async () => {}, print: async () => {} };
    }, { s: Object.assign({ ver: require('../package.json').version }, s), data: sample() });
    await page.goto(URL0);
    await page.waitForTimeout(1500);
    if (s.page) { await page.evaluate((p) => go(p), s.page); await page.waitForTimeout(700); }
    await page.screenshot({ path: path.join(OUT, s.name + '.png') });
    await ctx.close();
    console.log('✓', s.name);
  }
  await browser.close();
  if (errors.length) { console.error('HATALAR:\n' + errors.join('\n')); process.exitCode = 1; }
})();
