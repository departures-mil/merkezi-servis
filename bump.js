// Kullanım: node bump.js            → ekrandaki sürümü bir artırır (1.0.0 → 1.0.1)
//           node bump.js 1.0.5 "Not" → ekrandaki sürümü belirtilen değere ayarlar
// Ekranda görünen sürüm (display) 1.0.x şeklindedir. Güncelleyici her zaman artan
// gizli iç sürümü (version) karşılaştırır; böylece eski kurulumlar da güncellenir.
const fs = require('fs');
const u = JSON.parse(fs.readFileSync('update.json', 'utf8'));
let display = process.argv[2]; const notes = process.argv[3];
const inc = v => { const p = String(v).split('.').map(n => parseInt(n, 10) || 0); p[2]++; return p.join('.'); };
if (!display || !/^\d+\.\d+\.\d+$/.test(display)) { if (display) { console.error('Sürüm: X.Y.Z'); process.exit(1); } display = u.display ? inc(u.display) : '1.0.0'; }
const internal = (() => { const p = String(u.version).split('.').map(n => parseInt(n, 10) || 0); if (!u.display) return `${p[0]}.${p[1] + 1}.0`; p[2]++; return p.join('.'); })();
const rep = (f, re, s) => fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(re, s));
rep('www/app.js', /const APP_VERSION = '[^']+'/, `const APP_VERSION = '${display}'`);
fs.writeFileSync('www/version.json', JSON.stringify({ version: internal, display }));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.version = display; fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
u.sizes = {}; for (const f of u.files || []) { try { u.sizes[f] = fs.statSync(f).size; } catch (e) { } }
u.version = internal; u.display = display; if (notes) u.notes = notes;
fs.writeFileSync('update.json', JSON.stringify(u, null, 2) + '\n');
console.log(`Sürüm ${display} (iç: ${internal})`);
