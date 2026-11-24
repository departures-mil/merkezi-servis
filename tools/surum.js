#!/usr/bin/env node
// Tek sürüm kaynağı: package.json "version" (semver X.Y.Z) + release-notes.json → www/surum.js
//   node tools/surum.js            → www/surum.js'i package.json'dan yeniden yazar
//   node tools/surum.js 1.2.0      → package.json sürümünü 1.2.0 yapar, sonra yazar
//   node tools/surum.js --check    → www/surum.js güncel değilse hata (testte kullanılır)
// Eski "görünen 1.0.x / iç 1.8.x" ikili sürüm düzeni kaldırıldı (bump.js). Yayın: git tag vX.Y.Z → CI → GitHub Releases.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'package.json'), NOTES = path.join(ROOT, 'release-notes.json'), OUT = path.join(ROOT, 'www', 'surum.js');
const SEMVER = /^\d+\.\d+\.\d+$/;

function render() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  if (!SEMVER.test(pkg.version)) throw new Error('package.json version X.Y.Z olmalı: ' + pkg.version);
  const notes = JSON.parse(fs.readFileSync(NOTES, 'utf8'));
  for (const l of ['tr', 'en', 'ar']) if (typeof notes[l] !== 'string' || !notes[l].trim()) throw new Error('release-notes.json: "' + l + '" eksik');
  return '/* OTOMATİK: node tools/surum.js (kaynak: package.json + release-notes.json). Elle düzenlemeyin. */\n' +
    'window.APP_RELEASE = ' + JSON.stringify({ version: pkg.version, notes: { tr: notes.tr, en: notes.en, ar: notes.ar } }, null, 1) + ';\n';
}
module.exports = { render, OUT };
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--check') {
    const ok = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === render();
    if (!ok) { console.error('www/surum.js güncel değil: node tools/surum.js'); process.exit(1); }
    console.log('www/surum.js güncel'); process.exit(0);
  }
  if (arg) {
    if (!SEMVER.test(arg)) { console.error('Sürüm X.Y.Z olmalı'); process.exit(1); }
    const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8')); pkg.version = arg;
    fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
    try { const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')); lock.version = arg; if (lock.packages && lock.packages['']) lock.packages[''].version = arg; fs.writeFileSync(path.join(ROOT, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n'); } catch (e) { }
  }
  fs.writeFileSync(OUT, render());
  console.log('Sürüm ' + JSON.parse(fs.readFileSync(PKG, 'utf8')).version + ' → www/surum.js');
}
