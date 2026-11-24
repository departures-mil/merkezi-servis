// Electron açılış testi: gerçek ana süreç + preload + arayüz. Pencere açılır, ortak çekirdek başlar, tam ekran, menü ve üst çubuk dolu.
// Linux'ta ekran yoksa xvfb-run ile çalışır (CI: ubuntu-latest). Electron ikilisi yoksa (npm ci yapılmadıysa) atlanır.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let electron = null;
try { electron = require('electron'); } catch (e) { }
const needX = process.platform === 'linux' && !process.env.DISPLAY;
const hasXvfb = !needX || spawnSync('sh', ['-c', 'command -v xvfb-run'], { encoding: 'utf8' }).status === 0;

test('Electron: pencere yüklenir, çekirdek başlar, tam ekran', { skip: !electron || typeof electron !== 'string' ? 'electron yok' : !hasXvfb ? 'xvfb-run yok' : false, timeout: 120000 }, () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-smoke-'));
  const args = [ROOT, '--no-sandbox', '--disable-gpu', '--user-data-dir=' + userData];
  const cmd = needX ? 'xvfb-run' : electron;
  const full = needX ? ['-a', '-s', '-screen 0 1600x1000x24', electron].concat(args) : args;
  const r = spawnSync(cmd, full, { encoding: 'utf8', timeout: 100000, env: Object.assign({}, process.env, { MS_SMOKE: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }) });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('MS_SMOKE '));
  assert.ok(line, 'çıktı yok: ' + (r.stdout || '') + (r.stderr || '').slice(-2000));
  const o = JSON.parse(line.slice(9));
  console.log(o);
  assert.deepStrictEqual(o.errors, []);
  assert.strictEqual(o.fc, true, 'FC çekirdeği yüklü');
  assert.strictEqual(o.host, 'electron', 'fcHost tanındı');
  assert.strictEqual(o.api, true);
  assert.strictEqual(o.version, require('../package.json').version);
  assert.strictEqual(o.appVersion, require('../package.json').version);
  assert.strictEqual(o.topbar, true);
  assert.strictEqual(o.winBtns, 4, 'Küçült · Orta · Tam ekran · Kapat');
  assert.ok(o.nav >= 8, 'menü öğeleri');
  assert.strictEqual(o.scheme, 'falcon');
  assert.strictEqual(o.fullscreen, true, 'her açılışta tam ekran');
  assert.strictEqual(o.ok, true);
});
