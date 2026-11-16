// Kullanım: node bump.js 1.0.1 "Not"  → version.json, app.js, package.json ve update.json sürümünü günceller
const fs = require('fs');
const v = process.argv[2]; const notes = process.argv[3] || '';
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Sürüm: X.Y.Z'); process.exit(1); }
const rep = (f, re, s) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(re, s));
rep('www/app.js', /const APP_VERSION = '[^']+'/, `const APP_VERSION = '${v}'`);
fs.writeFileSync('www/version.json', JSON.stringify({ version: v }));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.version = v; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
const u = JSON.parse(fs.readFileSync('update.json', 'utf8')); u.version = v; if (notes) u.notes = notes; fs.writeFileSync('update.json', JSON.stringify(u, null, 2) + '\n');
console.log('Sürüm', v, 'yazıldı. Şimdi: git add -A && git commit -m "v' + v + '" && git push');
