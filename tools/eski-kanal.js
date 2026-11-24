#!/usr/bin/env node
// ESKİ GÜNCELLEME KANALI (köprü) — ≤1.0.11 kurulumları için update.json üretir.
//
// Eski main.js ne yapar (1.0.11, main.js satır ~100-142):
//   raw.githubusercontent.com/departures-mil/merkezi-servis/<main'in son commit'i>/update.json okur,
//   "version" kurulu www/version.json'daki İÇ sürümden (1.8.13) büyükse "files" listesindeki her dosyayı aynı
//   commit'ten indirir, %APPDATA%\Merkezi Servis\app-update\www altına yazar, listede olmayanları kurulu paketten
//   tamamlar ve yeniden başlar. main.js / preload.js GÜNCELLENMEZ, SHA denetimi yoktur.
// Bu yüzden köprü: yeni www/ (ortak çekirdekli arayüz) eski kabukta da çalışır, window.fcHost olmadığını görür ve
// kullanıcıyı yeni kurulum dosyasına (GitHub Releases, win-setup) yönlendirir (www/kabuk.js → bridge()).
//
//   node tools/eski-kanal.js            files + sizes'ı www/'ye göre yeniler; version/display DEĞİŞMEZ (eski kullanıcılar tetiklenmez)
//   node tools/eski-kanal.js --yayinla  ayrıca version = eski karşılaştırmaya uygun iç sürüm, display = package.json sürümü
//                                       (YALNIZ GitHub Release yayınlandıktan SONRA çalıştırın, sonra main'e push)
//   node tools/eski-kanal.js --check    update.json www/ ile tutarlı mı (npm test)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const UPD = path.join(ROOT, 'update.json');
const SKIP = new Set(['www/seed.json']);   // kişisel başlangıç verisi depoda yok

function listWww() {
  const out = [];
  (function walk(rel) {
    for (const n of fs.readdirSync(path.join(ROOT, rel)).sort()) {
      const r = rel + '/' + n, st = fs.statSync(path.join(ROOT, r));
      if (st.isDirectory()) walk(r); else if (!SKIP.has(r) && !n.startsWith('.')) out.push(r);
    }
  })('www');
  return out.sort();
}
/** 1.x.y → 2.x.y: eski kurulumlar "1.8.13" iç sürümüyle karşılaştırır; yeni semver ondan büyük görünmeli. */
function legacyVersion(v) { const p = v.split('.').map(Number); return (p[0] + 1) + '.' + p[1] + '.' + p[2]; }
function cmpVer(a, b) { const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; }
function build(publish) {
  const cur = JSON.parse(fs.readFileSync(UPD, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const files = listWww(), sizes = {};
  for (const f of files) sizes[f] = fs.statSync(path.join(ROOT, f)).size;
  const u = { version: cur.version, display: cur.display, notes: cur.notes, files, sizes };
  if (publish) {
    const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'release-notes.json'), 'utf8'));
    u.version = legacyVersion(pkg.version); u.display = pkg.version;
    u.notes = 'Merkezi Servis ' + pkg.version + ' yeni kurulum programıyla gelir (GitHub Releases). Bu güncellemeden sonra program sizi kurulum dosyasına yönlendirir; verileriniz korunur.\n' + notes.tr;
  }
  return u;
}
function check() {
  const u = JSON.parse(fs.readFileSync(UPD, 'utf8')), want = build(false), errs = [];
  if (JSON.stringify(u.files) !== JSON.stringify(want.files)) errs.push('files listesi www/ ile aynı değil');
  for (const f of want.files) if (u.sizes[f] !== want.sizes[f]) errs.push('boyut farklı: ' + f);
  if (cmpVer(u.version, '1.8.13') < 0) errs.push('version eski iç sürümden (1.8.13) küçük olamaz');
  return errs;
}
module.exports = { build, check, listWww, legacyVersion, cmpVer };
if (require.main === module) {
  const a = process.argv[2];
  if (a === '--check') { const e = check(); if (e.length) { console.error(e.join('\n') + '\n→ node tools/eski-kanal.js'); process.exit(1); } console.log('update.json tutarlı'); process.exit(0); }
  const u = build(a === '--yayinla');
  fs.writeFileSync(UPD, JSON.stringify(u, null, 2) + '\n');
  console.log('update.json: ' + u.files.length + ' dosya, version ' + u.version + ' (görünen ' + u.display + ')');
}
