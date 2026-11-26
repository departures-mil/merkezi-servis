// Node duman testi: sürüm, eski kanal köprüsü, gömülü çekirdek, paketleme ayarları, dosya bütünlüğü (bağımlılıksız).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pkg = JSON.parse(R('package.json'));

test('tek semver sürüm: package.json = www/surum.js = release-notes', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  const surum = require('../tools/surum.js');
  assert.strictEqual(R('www/surum.js'), surum.render(), 'www/surum.js eski: node tools/surum.js');
  const ctx = { window: {} }; vm.runInNewContext(R('www/surum.js'), ctx);
  assert.strictEqual(ctx.window.APP_RELEASE.version, pkg.version);
  for (const l of ['tr', 'en', 'ar']) assert.ok(ctx.window.APP_RELEASE.notes[l].length > 20, 'not: ' + l);
  assert.ok(!fs.existsSync(path.join(ROOT, 'bump.js')), 'ikili sürüm aracı (bump.js) kaldırılmış olmalı');
  assert.ok(!/1\.8\.\d+|display/.test(R('www/app.js').slice(0, 400)), 'app.js iç sürüm taşımamalı');
});

test('eski kanal (update.json) www/ ile tutarlı ve eski güncelleyiciyle uyumlu', () => {
  const ek = require('../tools/eski-kanal.js');
  assert.deepStrictEqual(ek.check(), []);
  const u = JSON.parse(R('update.json'));
  assert.ok(u.files.every((f) => f.startsWith('www/')), 'eski güncelleyici yalnız www/ altını taşır');
  for (const need of ['www/index.html', 'www/kabuk.js', 'www/surum.js', 'www/cekirdek/fc-core.js', 'www/cekirdek/css/core.css', 'www/cekirdek/css/tokens.css']) assert.ok(u.files.includes(need), need);
  assert.ok(u.files.some((f) => f.startsWith('www/cekirdek/fonts/') && f.endsWith('.woff2')), 'yazı tipleri listede');
  // köprü sürümü eski iç sürümden (1.8.13) büyük olmalı ki eski kurulumlar indirsin
  assert.ok(ek.cmpVer(ek.legacyVersion(pkg.version), '1.8.13') > 0);
  assert.strictEqual(ek.legacyVersion('1.1.0'), '2.1.0');
});

test('gömülü ortak çekirdek: sürüm kaydı ve modüller', () => {
  for (const f of ['cekirdek/VERSION', 'www/cekirdek/VERSION']) assert.match(R(f), /^ortak-cekirdek [0-9a-f]{40}\n/);
  assert.strictEqual(R('cekirdek/VERSION'), R('www/cekirdek/VERSION'));
  delete globalThis.FC;
  require('../www/cekirdek/fc-core.js');
  const FC = globalThis.FC;
  for (const m of ['updater', 'topbar', 'settings', 'contact', 'crash', 'look', 'onboarding', 'whatsnew', 'announcements', 'progress', 'host']) assert.ok(FC[m], 'FC.' + m);
  const H = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const man = { schema: 1, app: 'merkezi-servis', version: '1.2.0', minVersion: '1.0.0', assets: {
    'win-app': { file: 'MerkeziServis-1.2.0-win-app.asar', size: 100, sha256: H('a'), patches: { '1.1.0': { file: 'MerkeziServis-win-app.patch-from-1.1.0.bin', size: 10, sha256: H('b') } } },
    'win-setup': { file: 'MerkeziServis-1.2.0-win-setup.exe', size: 200, sha256: H('c') } } };
  const p = FC.updater.plan(man, { repo: 'merkezi-servis', app: 'merkezi-servis', version: '1.1.0', channel: 'win-app', setupChannel: 'win-setup' });
  assert.strictEqual(p.mode, 'patch');
  assert.strictEqual(p.url, 'https://github.com/departures-mil/merkezi-servis/releases/download/v1.2.0/MerkeziServis-win-app.patch-from-1.1.0.bin');
  assert.strictEqual(FC.updater.plan(Object.assign({}, man, { minVersion: '1.2.0' }), { repo: 'merkezi-servis', app: 'merkezi-servis', version: '1.1.0', channel: 'win-app', setupChannel: 'win-setup' }).channel, 'win-setup');
  assert.strictEqual(FC.updater.plan(man, { repo: 'merkezi-servis', app: 'merkezi-servis', version: '1.2.0', channel: 'win-app' }), null);
});

test('FCD1 yama uygulayıcı (Electron ana süreç) — FORMAT.md test vektörü', () => {
  const { applyFcd1 } = require('../cekirdek/electron/fcd1.js');
  const zlib = require('zlib');
  const sha = (b) => crypto.createHash('sha256').update(b).digest();
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
  const src = Buffer.alloc(0), dst = Buffer.from('abc');
  const patch = Buffer.concat([Buffer.from('FCD1'), Buffer.from([1]), u64(0), sha(src), u64(3), sha(dst), zlib.deflateSync(Buffer.from([2, 3, 0x61, 0x62, 0x63, 0]))]);
  assert.strictEqual(applyFcd1(src, patch).toString(), 'abc');
  assert.throws(() => applyFcd1(Buffer.from('x'), patch));
});

test('tüm arayüz ve ana süreç dosyaları sözdizimi olarak geçerli', () => {
  const files = ['main.js', 'preload.js', 'cekirdek/electron/fc-electron-main.js', 'cekirdek/electron/fc-preload.js', 'cekirdek/electron/fcd1.js']
    .concat(fs.readdirSync(path.join(ROOT, 'www')).filter((f) => f.endsWith('.js')).map((f) => 'www/' + f));
  for (const f of files) assert.doesNotThrow(() => new vm.Script(R(f), { filename: f }), f);
  assert.ok(!fs.existsSync(path.join(ROOT, 'www/admin-iletisim.js')) && !fs.existsSync(path.join(ROOT, 'www/kullanim.js')) && !fs.existsSync(path.join(ROOT, 'www/duyuru.js')), 'eski kopya modüller çekirdekle değişti');
  assert.ok(!/update:apply|update:check/.test(R('main.js')), 'eski raw update.json güncelleyicisi kaldırılmış olmalı');
  assert.match(R('main.js'), /fc\.install\(win, \{ channel: 'win-app' \}\)/);
});

test('index.html: başvurulan her dosya var, sıra doğru', () => {
  const html = R('www/index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  for (const r of refs) assert.ok(fs.existsSync(path.join(ROOT, 'www', r)), 'eksik: ' + r);
  const pos = (s) => html.indexOf(s);
  assert.ok(pos('cekirdek/css/tokens.css') < pos('cekirdek/css/core.css') && pos('cekirdek/css/core.css') < pos('style.css'));
  assert.ok(pos('cekirdek/fc-core.js') < pos('kabuk.js') && pos('kabuk.js') < pos('app.js') && pos('i18n.js') < pos('kabuk.js'));
  for (const css of ['www/cekirdek/css/tokens.css']) for (const m of R(css).matchAll(/url\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'www/cekirdek/css', m[1].replace(/["']/g, ''))), m[1]);
});

test('çeviriler: yeni metinlerin İngilizce ve Arapçası var', () => {
  const ctx = { window: {} }; vm.runInNewContext(R('www/i18n.js'), ctx);
  const src = R('www/kabuk.js');
  const keysEN = [...src.slice(src.indexOf('var EN = {'), src.indexOf('var AR = {')).matchAll(/\n\s+'([^']+)':|, '([^']+)':/g)].map((m) => m[1] || m[2]);
  assert.ok(keysEN.length > 15);
  const ar = src.slice(src.indexOf('var AR = {'), src.indexOf('if (window.I18N)'));
  for (const k of keysEN) assert.ok(ar.includes("'" + k.replace(/'/g, "\\'") + "'") || ar.includes(k), 'ar eksik: ' + k);
});

test('paketleme: NSIS, kullanıcı başına kurulum, kısayollar, 3 dil; app.asar ayrı yayınlanır', () => {
  const b = pkg.build;
  assert.strictEqual(b.productName, 'Merkezi Servis', 'productName değişirse %APPDATA% veri klasörü değişir!');
  assert.strictEqual(pkg.name, 'merkezi-servis');
  assert.strictEqual(b.win.target[0].target, 'nsis');
  assert.strictEqual(b.nsis.oneClick, true); assert.strictEqual(b.nsis.perMachine, false);
  assert.strictEqual(b.nsis.createDesktopShortcut, true); assert.strictEqual(b.nsis.createStartMenuShortcut, true);
  assert.deepStrictEqual(b.nsis.installerLanguages, ['tr_TR', 'en_US', 'ar_SA']);
  assert.strictEqual(b.nsis.deleteAppDataOnUninstall, false);
  assert.ok(b.files.includes('cekirdek/**/*') && b.files.includes('www/**/*'));
  assert.ok(!b.asarUnpack, 'asarUnpack yama kapsamı dışında kalır');
  const wf = R('.github/workflows/release.yml');
  assert.match(wf, /win-app=app\.asar/); assert.match(wf, /win-setup=\*Setup\*\.exe/);
  assert.match(wf, /reusable-release\.yml@main/); assert.match(wf, /needs: \[test, build\]/);
});

test('Danışman: menüde, modülde, ayarlarda; metinlerin İngilizce ve Arapçası var; anahtar yalnız kullanıcınınki', () => {
  const src = R('www/danisman.js');
  assert.ok(R('www/index.html').indexOf('danisman.js') > R('www/index.html').indexOf('app.js'), 'danisman.js app.js\'ten sonra yüklenmeli');
  assert.match(R('www/app.js'), /\['ai', '✦', 'Danışman'\]/);
  assert.match(R('www/pro.js'), /id: 'ai'/);
  assert.match(R('www/kabuk.js'), /\['dash', 'ai'\]/);
  const en = src.slice(src.indexOf('var EN = {'), src.indexOf('var AR = {'));
  const ar = src.slice(src.indexOf('var AR = {'), src.indexOf('if (window.I18N)'));
  const keys = [...en.matchAll(/'((?:[^'\\]|\\.)+)':\s*'/g)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  for (const k of keys) assert.ok(ar.includes("'" + k + "':"), 'ar eksik: ' + k);
  for (const l of ['tr', 'en', 'ar']) assert.ok(new RegExp('\\n    ' + l + ': \\{').test(src), 'çevrim dışı kalıp: ' + l);
  assert.ok(!/AIza[0-9A-Za-z_-]{30,}/.test(src), 'gömülü ortak anahtar olmamalı');
  assert.match(src, /FC\.storage\.get\('ai'/);
});
