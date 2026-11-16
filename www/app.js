/* Merkezi Servis – uygulama mantığı (tarayıcı + Electron) */
'use strict';
const APP_VERSION = '1.3.2';
const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/departures-mil/merkezi-servis/main/';
const EXEMPT_DEFAULT = ['حلب', 'جرابلس', 'دركوش', 'تل رفعت', 'سرمدا', 'حارم', 'جنديرس', 'Halep', 'Cerablus', 'Derkuş', 'Tel Rıfat', 'Sermede', 'Harim', 'Cinderes'];
const GROUPS_DEFAULT = ['A', 'B'];
const isElectron = !!window.electronAPI;

// ---------------- dil (i18n) ----------------
const LANGS = { tr: 'Türkçe', ar: 'العربية', en: 'English' };
let LANG = 'tr';
function t(s, ...args) { const d = (window.I18N || {})[LANG]; let r = (d && d[s]) || s; args.forEach((a, i) => { r = r.replace('{' + i + '}', a); }); return r; }
const DAYS = { tr: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'], ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };

// ---------------- yardımcılar ----------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (p || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const toISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const todayISO = () => toISO(new Date());
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const fmt = iso => iso ? iso.split('-').reverse().join('.') : '—';
const dayName = iso => (DAYS[LANG] || DAYS.tr)[parseISO(iso).getDay()];
const sortTR = (a, b) => String(a).localeCompare(String(b), LANG);
let toastT;
function toast(msg, err) { const el = $('#toast'); el.textContent = msg; el.className = 'toast' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => el.classList.add('hidden'), 2800); }

// ---------------- durum (state) ----------------
let S = null;
function emptyState() {
  return {
    schemaVersion: 1, savedAt: 0,
    settings: { orgName: 'Merkezi Servis Hizmeti', adminName: 'İdareci', pin: '', lang: 'tr', cycleDays: 10, exemptKeywords: EXEMPT_DEFAULT.slice(), updateUrl: DEFAULT_UPDATE_URL, defaultLetterheadId: 'lh-default' },
    groups: GROUPS_DEFAULT.map(g => ({ id: g, name: g, status: g.startsWith('A') ? 'work' : 'home', statusSince: todayISO(), nextChange: '', customDates: [] })),
    driver: { cycleDays: 10, activeTeam: 1, statusSince: todayISO(), nextChange: '', customDates: [] },
    places: [], lines: [], persons: [],
    drivers: [1, 2, 3, 4].map(i => ({ id: 'd' + i, name: 'Şoför ' + i, phone: '', team: i <= 2 ? 1 : 2, startDate: '', endDate: '', notes: '' })),
    letterheads: [{ id: 'lh-default', name: 'Varsayılan antet (Şablon)', kind: 'builtin', left: 'Ministry of Defense\nUAV Administration\nFixed Wing Division', right: 'وزارة الدفاع السورية\nإدارة المسيرات\nفرع المجنح', logo: 'assets/logo.png', watermark: true, footer: 'نسخة إلى: ديوان الفرع' }],
    plans: {}
  };
}
async function loadSeed(st) {
  try { const r = await fetch('seed.json'); const seed = await r.json(); st.places = seed.places; st.lines = seed.lines; st.persons = seed.persons; delete st.mainLines; ensureMainLines(st); } catch (e) { console.warn('seed yüklenemedi', e); }
  return st;
}
const LS_KEY = 'merkezi-servis-state';
async function loadState() {
  let local = null, disk = null;
  try { local = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { }
  if (isElectron) { try { const x = await window.electronAPI.loadData(); if (x) disk = JSON.parse(x); } catch (e) { } }
  let st = local && disk ? ((disk.savedAt || 0) >= (local.savedAt || 0) ? disk : local) : (disk || local);
  if (!st) { st = await loadSeed(emptyState()); st.firstRun = true; }
  const e = emptyState();
  st.settings = Object.assign(e.settings, st.settings || {});
  st.groups = st.groups && st.groups.length ? st.groups : e.groups;
  // A1/B1 alt grupları A/B ile birleştir (yalnızca A ve B değişim grubu)
  const normG = g => g === 'A1' ? 'A' : g === 'B1' ? 'B' : g;
  (st.persons || []).forEach(p => { if (p.group === 'A1' || p.group === 'B1') { p.subgroup = p.group; p.group = normG(p.group); } });
  if (st.groups.some(g => g.id === 'A1' || g.id === 'B1')) st.groups = st.groups.filter(g => g.id !== 'A1' && g.id !== 'B1');
  st.driver = Object.assign(e.driver, st.driver || {});
  st.drivers = st.drivers || e.drivers; st.letterheads = st.letterheads && st.letterheads.length ? st.letterheads : e.letterheads;
  st.places = st.places || []; st.lines = st.lines || []; ensureMainLines(st);
  st.plans = st.plans || {}; st.lines = st.lines || []; st.persons = st.persons || [];
  return st;
}
let saveT;
function save(immediate) {
  S.savedAt = Date.now();
  const json = JSON.stringify(S);
  try { localStorage.setItem(LS_KEY, json); } catch (e) { }
  $('#saveInfo').textContent = t('Kaydediliyor…'); const si = $('#saveInfoTop'); if (si) si.textContent = '⏳ ' + t('Kaydediliyor…');
  clearTimeout(saveT);
  const doDisk = async () => { if (isElectron) await window.electronAPI.saveData(json); $('#saveInfo').textContent = t('Kaydedildi') + ' ' + new Date().toLocaleTimeString(LANG === 'ar' ? 'ar-SY' : LANG); const si2 = $('#saveInfoTop'); if (si2) si2.textContent = '✓ ' + $('#saveInfo').textContent; };
  if (immediate) doDisk(); else saveT = setTimeout(doDisk, 400);
}

// ---------------- alan erişimcileri ----------------
const placeById = id => S.places.find(p => p.id === id);
const placeName = id => (placeById(id) || {}).name || '—';
const lineById = id => S.lines.find(l => l.id === id);
const lname = L => L ? ((LANG === 'ar' && L.nameAr) || (LANG === 'en' && L.nameEn) || L.name) : '—';
const lineName = id => lname(lineById(id));
const groupById = id => S.groups.find(g => g.id === id);
const workPlaces = () => S.places.filter(p => p.type === 'work');
const homePlaces = () => S.places.filter(p => p.type !== 'work');
function placeIsExemptByKeyword(name) { return (S.settings.exemptKeywords || []).some(k => k && name.includes(k)); }
function placeExempt(p) { return p.exempt === true || (p.exempt == null && placeIsExemptByKeyword(p.name)); }
function personExempt(p) { if (p.exempt === true) return true; if (p.exempt === false) return false; const pl = placeById(p.homeId); return !!(pl && placeExempt(pl)); }
const personInService = p => p.active !== false && !personExempt(p);
function placeCoord(p) {
  if (p.lat != null && p.lon != null) return { lon: +p.lon, lat: +p.lat, auto: false };
  const g = GEO.lookup(p.name);
  // aynı noktaya düşenleri hafifçe ayır (ada göre deterministik)
  let hsh = 0; for (const c of p.name) hsh = (hsh * 31 + c.charCodeAt(0)) & 0xffff;
  const jx = ((hsh % 13) - 6) * 0.012, jy = (((hsh >> 4) % 11) - 5) * 0.012;
  if (g) return { lon: g.lon + (g.key.length <= 5 ? jx : 0), lat: g.lat + (g.key.length <= 5 ? jy : 0), auto: true };
  return { lon: 36.9 + jx * 6, lat: 34.8 + jy * 6, auto: true, unknown: true };
}

// ---------------- vardiya hesapları ----------------
function changeDatesBetween(cfg, cycleDays, a, b) {
  const step = Math.max(1, cycleDays | 0);
  let anchors = (cfg.customDates || []).filter(Boolean).slice().sort();
  if (!anchors.length && cfg.nextChange) anchors = [cfg.nextChange];
  if (!anchors.length) return [];
  const set = new Set(anchors);
  let d = anchors[0]; while (d > a) { d = addDays(d, -step); if (d >= a) set.add(d); }
  d = anchors[anchors.length - 1]; while (d < b) { d = addDays(d, step); if (d <= b) set.add(d); }
  return Array.from(set).filter(x => x >= a && x <= b).sort();
}
function statusAt(cfg, cycleDays, dateISO, curStatus) {
  const R = cfg.statusSince || todayISO();
  const n = dateISO >= R ? changeDatesBetween(cfg, cycleDays, addDays(R, 1), dateISO).length : changeDatesBetween(cfg, cycleDays, addDays(dateISO, 1), R).length;
  return n % 2 === 0 ? curStatus : (curStatus === 'work' ? 'home' : 'work');
}
const groupStatusAt = (g, d) => statusAt(g, S.settings.cycleDays, d, g.status);
function groupNextChange(g, from) { const l = changeDatesBetween(g, S.settings.cycleDays, from || todayISO(), addDays(from || todayISO(), 400)); return l[0] || ''; }
const groupPrevStatus = (g, d) => groupStatusAt(g, addDays(d, -1));
function driverTeamAt(d) { return statusAt(S.driver, S.driver.cycleDays, d, S.driver.activeTeam === 1 ? 'work' : 'home') === 'work' ? 1 : 2; }
function driverNextChange(from) { const l = changeDatesBetween(S.driver, S.driver.cycleDays, from || todayISO(), addDays(from || todayISO(), 400)); return l[0] || ''; }
function changesOn(dateISO) { return S.groups.filter(g => changeDatesBetween(g, S.settings.cycleDays, dateISO, dateISO).length > 0); }
function upcomingChangeDates(n) { const set = new Set(); const d0 = todayISO(); S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, d0, addDays(d0, 400)).forEach(d => set.add(d))); return Array.from(set).sort().slice(0, n || 12); }
const stWork = (g, d) => g && groupStatusAt(g, d) === 'work';

// ---------------- sefer planı ----------------
function planFor(dateISO) {
  const groups = changesOn(dateISO); const gids = new Set(groups.map(g => g.id));
  const result = { date: dateISO, groups, lines: [] };
  S.lines.forEach(L => {
    const cfg = (S.plans[dateISO] || {})[L.id] || { buses: 1, firstStopBus1: '' };
    const persons = S.persons.filter(p => p.lineId === L.id && gids.has(p.group) && personInService(p));
    const idx = s => { const i = L.stops.indexOf(s); return i < 0 ? 999 : i; };
    const splitIdx = cfg.buses === 2 && cfg.firstStopBus1 ? idx(cfg.firstStopBus1) : -1;
    const busOf = sid => { if (cfg.buses !== 2) return 1; const ov = (cfg.stopBus || {})[sid]; if (ov === 1 || ov === 2) return ov; const i = idx(sid); return i === 999 ? 2 : (i >= splitIdx ? 1 : 2); };
    const rows = persons.map(p => { const g = groupById(p.group); const prev = g ? groupPrevStatus(g, dateISO) : 'work'; return { p, dir: prev === 'work' ? 'toHome' : 'toWork', stopId: p.homeId, bus: busOf(p.homeId) }; });
    const byStop = {}; rows.forEach(r => { (byStop[r.stopId] = byStop[r.stopId] || []).push(r); });
    const stopList = L.stops.filter(s => byStop[s]).concat(Object.keys(byStop).filter(s => !L.stops.includes(s)));
    result.lines.push({ line: L, cfg, rows, byStop, stopList, toHome: rows.filter(r => r.dir === 'toHome').length, toWork: rows.filter(r => r.dir === 'toWork').length });
  });
  return result;
}

// ---------------- router ----------------
let page = 'dash';
const NAV = [['dash', '🏠', 'Genel Durum'], ['persons', '👥', 'Kişiler'], ['mainlines', '🧭', 'Ana Hatlar'], ['lines', '🛣️', 'Hatlar & Duraklar'], ['places', '📍', 'Yerleşim Yerleri'], ['shifts', '🔄', 'Vardiya & Değişim'], ['drivers', '🚌', 'Şoförler'], ['plan', '🗓️', 'Sefer Planı'], ['reports', '🖨️', 'Çıktılar'], ['settings', '⚙️', 'Ayarlar']];
function renderNav() {
  $('#nav').innerHTML = NAV.map(([p, ic, lb]) => `<a data-page="${p}" class="${p === page ? 'active' : ''}">${ic} ${h(t(lb))}</a>`).join('');
  $$('#nav a').forEach(a => a.onclick = () => go(a.dataset.page));
  $('#langSel').innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${v}</option>`).join('');
  $('#brandSub').textContent = S.settings.orgName;
  renderTopbar();
}
let updateAvail = null;
function renderTopbar() {
  const tb = $('#topbar'); if (!tb) return;
  tb.innerHTML = `<span id="saveInfoTop" class="muted">${$('#saveInfo') ? $('#saveInfo').textContent : ''}</span>
    <span class="menu" id="syncMenu"><button class="btn sm" id="syncBtn">⇄ ${t('Eşitle')}</button><div class="dd"><a id="tbExp">⬇ ${t('Yedek al (JSON)')}</a><a id="tbImp">⬆ ${t('Yedekten geri yükle')}</a><a id="tbXls">📗 ${t("Excel'e ver")}</a></div></span>
    <span class="menu" id="updMenu"><button class="btn sm ${updReady ? 'primary' : ''}" id="updBtn">⟳ ${updReady ? 'v' + h(updReady) + ' ' + t('hazır') : t('Güncelle')}${updateAvail && !updReady ? '<span class="dot-new"></span>' : ''}</button><div class="dd upd" id="updDd"></div></span>`;
  const mn = $('#syncMenu', tb);
  $('#syncBtn', tb).onclick = e => { e.stopPropagation(); mn.classList.toggle('open'); };
  document.addEventListener('click', () => mn.classList.remove('open'), { once: true });
  $('#tbExp', tb).onclick = () => saveBlob('merkezi-servis-yedek-' + todayISO() + '.json', new TextEncoder().encode(JSON.stringify(S, null, 1)));
  $('#tbImp', tb).onclick = () => importBackup();
  $('#tbXls', tb).onclick = () => exportPersonsExcel();
  const um = $('#updMenu', tb), ud = $('#updDd', tb);
  ud.onclick = e => e.stopPropagation();
  $('#updBtn', tb).onclick = async e => {
    e.stopPropagation(); mn.classList.remove('open');
    if (um.classList.contains('open')) { um.classList.remove('open'); return; }
    um.classList.add('open'); document.addEventListener('click', () => um.classList.remove('open'), { once: true });
    const info = () => `<div class="small muted" style="margin-top:6px">v${h(currentVer)} · ${t('Otomatik güncelleme')}: <b>${S.settings.autoUpdate === false ? t('kapalı') : t('açık')}</b>${lastUpdCheck ? ' · ' + t('son kontrol') + ' ' + new Date(lastUpdCheck).toLocaleTimeString(LANG === 'ar' ? 'ar-SY' : LANG, { hour: '2-digit', minute: '2-digit' }) : ''}</div>`;
    if (!isElectron) { ud.innerHTML = `<div class="pad">${t('Sadece masaüstü uygulamasında.')}</div>`; return; }
    if (updReady) { ud.innerHTML = `<div class="pad"><b>✓ v${h(updReady)} ${t('hazır')}</b><div style="margin-top:6px"><button class="btn primary sm" id="updRs">${t('Şimdi yeniden başlat')}</button></div>${info()}</div>`; $('#updRs', ud).onclick = () => scheduleRestart(true); return; }
    ud.innerHTML = `<div class="pad">${t('Kontrol ediliyor…')}${info()}</div>`;
    await autoUpdate(true);
    if (updReady) { ud.innerHTML = `<div class="pad"><b>✓ v${h(updReady)} ${t('indirildi')}</b><div class="small muted">${t('Uygulama birazdan kendini yenileyecek')}</div><div style="margin-top:6px"><button class="btn primary sm" id="updRs">${t('Şimdi yeniden başlat')}</button></div>${info()}</div>`; $('#updRs', ud).onclick = () => scheduleRestart(true); }
    else if (lastUpdErr) ud.innerHTML = `<div class="pad err">${t('Kontrol edilemedi')}: ${h(lastUpdErr)}</div><div class="pad" style="padding-top:0">${info()}</div>`;
    else ud.innerHTML = `<div class="pad">✓ ${t('Güncel.')}${info()}</div>`;
  };
}
const APP_START = Date.now(); let lastUserAct = Date.now(), updReady = null, lastUpdCheck = 0, lastUpdErr = '', currentVer = APP_VERSION, updBusy = false;
['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { lastUserAct = Date.now(); }, { passive: true, capture: true }));
// GitHub önbelleğini aşmak için dalı son commit'e sabitle (raw/<sha>/ değişmez ve anlık)
async function resolveUpdateBase(url) {
  const m = String(url).match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
  if (!m || /^[0-9a-f]{40}$/.test(m[3])) return url;
  try {
    const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/commits/${m[3]}`, { headers: { Accept: 'application/vnd.github.sha' }, cache: 'no-store', signal: ctrl.signal });
    clearTimeout(tm);
    if (!r.ok) return url;
    const sha = (await r.text()).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${sha}/` : url;
  } catch (e) { return url; }
}
// Otomatik güncelleme: kontrol et → indir → kullanıcı boştayken yeniden başlat
async function autoUpdate(manual) {
  if (!isElectron || updBusy || updReady) return;
  if (!manual && S.settings.autoUpdate === false) return;
  updBusy = true;
  try {
    const url = await resolveUpdateBase(S.settings.updateUrl || DEFAULT_UPDATE_URL);
    const r = await window.electronAPI.checkUpdate(url); lastUpdCheck = Date.now(); lastUpdErr = ''; currentVer = r.current;
    updateAvail = r.available ? r.remote : null; renderTopbar();
    if (r.available) {
      const a = await window.electronAPI.applyUpdate(url); updReady = a.version; save(true); renderTopbar();
      toast(t('Sürüm {0} indirildi; uygulama birazdan kendini yenileyecek', a.version));
      scheduleRestart();
    }
  } catch (e) { lastUpdCheck = Date.now(); lastUpdErr = e.message || String(e); renderTopbar(); }
  finally { updBusy = false; }
}
function scheduleRestart(now) {
  const go2 = () => { save(true); setTimeout(() => window.electronAPI.relaunch(), 400); };
  if (now) return go2();
  const tryIt = () => {
    const fresh = Date.now() - APP_START < 25000;           // açılışta bulunduysa hemen
    const idle = Date.now() - lastUserAct > 45000;          // ya da kullanıcı 45 sn boştaysa
    const modalOpen = !!$('#modalRoot').innerHTML.trim();
    if ((fresh || idle) && !modalOpen) go2(); else setTimeout(tryIt, 10000);
  };
  setTimeout(tryIt, 3000);
}
function silentUpdateCheck() { return autoUpdate(false); }
async function importBackup() {
  const f = await pickFile('.json'); if (!f) return;
  try { const st = JSON.parse(new TextDecoder().decode(f.data)); if (!st.persons) throw 0; confirmDlg(t('Mevcut veriler yedekteki verilerle değiştirilecek. Devam?'), () => { S = st; save(true); applyLang(S.settings.lang); renderNav(); render(); toast(t('Geri yüklendi')); }); } catch (e) { toast(t('Geçersiz yedek dosyası'), true); }
}
function applyLang(l) {
  LANG = LANGS[l] ? l : 'tr'; document.documentElement.lang = LANG; document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  document.title = t('Merkezi Servis');
  $('#verInfo').textContent = 'v' + APP_VERSION + (isElectron ? '' : ' · ' + t('tarayıcı'));
}
function go(p) { page = p; $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === p)); render(); $('#main').scrollTop = 0; }
function render() {
  const m = $('#main');
  if (page !== 'dash' && page !== 'mainlines' && LMAP) { try { LMAP.remove(); } catch (e) { } LMAP = null; }
  const fn = { dash: renderDash, mainlines: renderMainLines, persons: renderPersons, lines: renderLines, places: renderPlaces, shifts: renderShifts, drivers: renderDrivers, plan: renderPlan, reports: renderReports, settings: renderSettings }[page];
  m.innerHTML = ''; fn(m);
}

// ---------------- modal ----------------
function modal(html, onMount) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-bg"><div class="modal">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('.modal-bg').addEventListener('click', e => { if (e.target.classList.contains('modal-bg')) close(); });
  $$('[data-close]', root).forEach(b => b.onclick = close);
  if (onMount) onMount(root, close);
  return close;
}
function confirmDlg(msg, cb) {
  modal(`<h2>${t('Onay')}</h2><p>${h(msg)}</p><div class="actions"><button class="btn" data-close>${t('Vazgeç')}</button><button class="btn danger" id="okBtn">${t('Evet')}</button></div>`, (r, close) => { $('#okBtn', r).onclick = () => { close(); cb(); }; });
}
const opt = (list, val, label = x => x.name, value = x => x.id, empty) => (empty ? `<option value="">${h(empty)}</option>` : '') + list.map(x => `<option value="${h(value(x))}" ${value(x) === val ? 'selected' : ''}>${h(label(x))}</option>`).join('');
const cancelBtn = () => `<button class="btn" data-close>${t('Vazgeç')}</button>`;
const statusBadge = st => st ? (st === 'work' ? `<span class="badge ok">${t('İşte')}</span>` : `<span class="badge gray">${t('Evde')}</span>`) : '';

// ================= SAYFALAR =================
function renderDash(m) {
  const d0 = todayISO();
  const inService = S.persons.filter(personInService);
  const exempt = S.persons.filter(p => p.active !== false && personExempt(p));
  const inactive = S.persons.filter(p => p.active === false);
  const team = driverTeamAt(d0); const nextDates = upcomingChangeDates(6);
  m.innerHTML = `
  <h1>${t('Genel Durum')} <span class="muted small">— ${fmt(d0)} ${dayName(d0)}</span></h1>
  ${S.settings.mapHidden ? `<p><button class="btn sm" id="mshow">🗺️ ${t('Haritayı göster')}</button></p>` : '<div class="card tight" id="mapCard"></div>'}
  <div class="grid c4">
    <div class="card stat"><div class="v">${inService.length}</div><div class="l">${t('Serviste olan kişi')}</div></div>
    <div class="card stat"><div class="v">${exempt.length}</div><div class="l">${t('Muaf (servis dışı)')}</div></div>
    <div class="card stat"><div class="v">${inactive.length}</div><div class="l">${t('Sistemden çıkarılmış')}</div></div>
    <div class="card stat"><div class="v">${S.lines.length}</div><div class="l">${t('Hat')}</div></div>
  </div>
  <div class="grid c2">
    <div class="card"><h2>${t('Gruplar – bugün')}</h2>
      <table><tr><th>${t('Grup')}</th><th>${t('Durum')}</th><th>${t('Kişi')}</th><th>${t('Sonraki değişim')}</th><th>${t('Kalan')}</th></tr>
      ${S.groups.map(g => { const st = groupStatusAt(g, d0); const nx = groupNextChange(g); const cnt = inService.filter(p => p.group === g.id).length; return `<tr><td><b>${h(g.name)}</b></td><td>${st === 'work' ? '<span class="badge ok">' + t('İşte') + '</span>' : '<span class="badge gray">' + t('Evde') + '</span>'}</td><td>${cnt}</td><td>${nx ? fmt(nx) + ' ' + dayName(nx) : '<span class="badge warn">' + t('tarih girilmedi') + '</span>'}</td><td>${nx ? diffDays(d0, nx) + ' ' + t('gün') : ''}</td></tr>`; }).join('')}
      </table>
      <p class="small muted">${t('Değişim tarihlerini')} <a href="#" data-go="shifts">${t('Vardiya & Değişim')}</a> ${t('sayfasından girin.')}</p>
    </div>
    <div class="card"><h2>${t('Şoförler – bugün')}</h2>
      ${S.drivers.map(d => `<div class="drv ${d.team === team ? 'on' : 'off'}"><span class="nm" dir="auto">${h(d.name)}</span><span class="badge ${d.team === team ? 'ok' : 'gray'}">${d.team === team ? t('Aktif (nöbette)') : t('İstirahatte')}</span><span class="small muted">${t('Ekip')} ${d.team}</span></div>`).join('')}
      <div class="small muted">${t('Sonraki şoför değişimi')}: <b>${driverNextChange() ? fmt(driverNextChange()) : t('tarih girilmedi')}</b></div>
    </div>
  </div>
  <div class="grid c2">
    <div class="card"><h2>${t('Yaklaşan değişim günleri')}</h2>
      ${nextDates.length ? `<div class="timeline">${nextDates.map(d => `<div class="tl ${d === d0 ? 'today' : ''}"><b>${fmt(d)}</b>${dayName(d)}<br><span class="muted">${changesOn(d).map(g => g.name).join(', ')}</span></div>`).join('')}</div>` : `<p class="muted">${t('Henüz değişim tarihi girilmedi.')}</p>`}
      <p><button class="btn primary" data-go="plan">${t('Sefer planını aç')}</button></p>
    </div>
    <div class="card"><h2>${t('Hatlar')}</h2>
      <table><tr><th>${t('Hat')}</th><th>${t('Durak')}</th><th>${t('Kişi (serviste)')}</th><th>${t('İşte / Evde')}</th></tr>
      ${S.lines.map(L => { const ps = inService.filter(p => p.lineId === L.id); const w = ps.filter(p => stWork(groupById(p.group), d0)).length; return `<tr><td><i class="dot" style="background:${lineColor(L)}"></i> ${h(lname(L))}</td><td>${L.stops.length}</td><td>${ps.length}</td><td>${w} / ${ps.length - w}</td></tr>`; }).join('')}
      </table>
    </div>
  </div>`;
  if (S.settings.mapHidden) { $('#mshow', m).onclick = () => { S.settings.mapHidden = false; save(); render(); }; }
  else mountMap($('#mapCard', m));
  $$('[data-go]', m).forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
}

// ---------- Kişiler ----------
let pf = { q: '', group: '', line: '', status: '', work: '', place: '' };
function renderPersons(m) {
  m.innerHTML = `<h1>${t('Kişiler')}</h1>
  <div class="toolbar">
    <input type="search" id="pq" placeholder="${t('Ad, lakap, sicil, yer ara…')}" value="${h(pf.q)}">
    <select id="pg"><option value="">${t('Tüm gruplar')}</option>${S.groups.map(g => `<option ${pf.group === g.id ? 'selected' : ''}>${h(g.id)}</option>`).join('')}<option value="-" ${pf.group === '-' ? 'selected' : ''}>${t('Grupsuz')}</option></select>
    <select id="pl">${opt(S.lines, pf.line, x => lname(x), x => x.id, t('Tüm hatlar'))}</select>
    <select id="pw">${opt(workPlaces(), pf.work, x => x.name, x => x.id, t('Tüm işyerleri'))}</select>
    <select id="ps"><option value="">${t('Tüm durumlar')}</option><option value="service" ${pf.status === 'service' ? 'selected' : ''}>${t('Serviste')}</option><option value="exempt" ${pf.status === 'exempt' ? 'selected' : ''}>${t('Muaf')}</option><option value="inactive" ${pf.status === 'inactive' ? 'selected' : ''}>${t('Sistemden çıkarılmış')}</option></select>
    ${pf.place ? `<span class="pill">${t('Yer')}: <span dir="auto">${h(placeName(pf.place))}</span><button id="pplx">✕</button></span>` : ''}
    <span style="flex:1"></span>
    <button class="btn" id="pImport">${t("Excel'den al")}</button>
    <button class="btn" id="pExport">${t("Excel'e ver")}</button>
    <button class="btn primary" id="pAdd">+ ${t('Kişi ekle')}</button>
  </div>
  <div class="card tight"><div class="tbl-wrap"><table id="ptbl"></table></div></div>`;
  const draw = () => {
    const q = pf.q.trim().toLowerCase();
    let list = S.persons.filter(p => {
      if (pf.group && pf.group !== '-' && p.group !== pf.group) return false;
      if (pf.group === '-' && p.group) return false;
      if (pf.line && p.lineId !== pf.line) return false;
      if (pf.work && p.workId !== pf.work) return false;
      if (pf.place && p.homeId !== pf.place && p.workId !== pf.place) return false;
      const ex = personExempt(p), ia = p.active === false;
      if (pf.status === 'service' && (ex || ia)) return false;
      if (pf.status === 'exempt' && (!ex || ia)) return false;
      if (pf.status === 'inactive' && !ia) return false;
      if (q) { const s = [p.name, p.nickname, p.regNo, p.title, placeName(p.homeId), p.mother].join(' ').toLowerCase(); if (!s.includes(q)) return false; }
      return true;
    });
    list.sort((a, b) => (Number(a.seq) || 9999) - (Number(b.seq) || 9999));
    const d0 = todayISO();
    $('#ptbl').innerHTML = `<tr><th>#</th><th>${t('Sicil')}</th><th>${t('Ad Soyad')}</th><th>${t('Lakap')}</th><th>${t('Unvan')}</th><th>${t('Grup')}</th><th>${t('Bugün')}</th><th>${t('Ev (durak)')}</th><th>${t('İşyeri')}</th><th>${t('Hat')}</th><th>${t('Durum')}</th><th></th></tr>` +
      list.map(p => {
        const g = groupById(p.group); const st = g ? groupStatusAt(g, d0) : '';
        const ex = personExempt(p), ia = p.active === false;
        const status = ia ? `<span class="badge bad">${t('Çıkarıldı')}</span>` : ex ? `<span class="badge warn">${t('Muaf')}${p.exempt === true ? ' (' + t('kişi') + ')' : ''}</span>` : `<span class="badge ok">${t('Serviste')}</span>`;
        return `<tr><td class="num">${h(p.seq)}</td><td>${h(p.regNo)}</td><td dir="auto"><b>${h(p.name)}</b></td><td dir="auto">${h(p.nickname)}</td><td dir="auto">${h(p.title)}</td><td>${h(p.group) || '—'}</td><td>${statusBadge(st)}</td><td dir="auto">${h(placeName(p.homeId))}</td><td dir="auto">${h(placeName(p.workId))}</td><td>${h(lineName(p.lineId))}</td><td>${status}</td><td><button class="btn sm" data-edit="${p.id}">${t('Düzenle')}</button></td></tr>`;
      }).join('') + (list.length ? '' : `<tr><td colspan="12" class="muted">${t('Kayıt yok')}</td></tr>`);
    $$('[data-edit]', m).forEach(b => b.onclick = () => editPerson(b.dataset.edit));
  };
  draw();
  $('#pq').oninput = e => { pf.q = e.target.value; draw(); };
  $('#pg').onchange = e => { pf.group = e.target.value; draw(); };
  $('#pl').onchange = e => { pf.line = e.target.value; draw(); };
  $('#pw').onchange = e => { pf.work = e.target.value; draw(); };
  $('#ps').onchange = e => { pf.status = e.target.value; draw(); };
  const px = $('#pplx'); if (px) px.onclick = () => { pf.place = ''; render(); };
  $('#pAdd').onclick = () => editPerson(null);
  $('#pExport').onclick = () => exportPersonsExcel();
  $('#pImport').onclick = () => importPersonsExcel();
}
function editPerson(id, preset) {
  const p = id ? S.persons.find(x => x.id === id) : Object.assign({ id: uid('u'), seq: (Math.max(0, ...S.persons.map(x => Number(x.seq) || 0)) + 1), regNo: '', title: '', name: '', mother: '', nickname: '', group: '', homeId: '', workId: '', lineId: '', exempt: null, active: true, notes: '' }, preset || {});
  modal(`<h2>${id ? t('Kişiyi düzenle') : t('Yeni kişi')}</h2>
  <div class="grid c3">
    <label class="f">${t('Sıra no')}<input id="f_seq" value="${h(p.seq)}"></label>
    <label class="f">${t('Sicil no')}<input id="f_reg" value="${h(p.regNo)}"></label>
    <label class="f">${t('Grup')}<select id="f_grp"><option value="">— ${t('Grupsuz')} —</option>${S.groups.map(g => `<option ${p.group === g.id ? 'selected' : ''}>${h(g.id)}</option>`).join('')}</select></label>
  </div>
  <div class="grid c2">
    <label class="f">${t('Ad Soyad')}<input id="f_name" dir="auto" value="${h(p.name)}"></label>
    <label class="f">${t('Lakap')}<input id="f_nick" dir="auto" value="${h(p.nickname)}"></label>
    <label class="f">${t('Unvan')}<input id="f_title" dir="auto" value="${h(p.title)}"></label>
    <label class="f">${t('Anne adı')}<input id="f_mother" dir="auto" value="${h(p.mother)}"></label>
    <label class="f">${t('İşyeri')}<select id="f_work">${opt(workPlaces(), p.workId, x => x.name, x => x.id, t('— seçiniz —'))}</select></label>
    <label class="f">${t('Hat')}<select id="f_line">${opt(S.lines, p.lineId, x => lname(x), x => x.id, t('— seçiniz —'))}</select></label>
    <label class="f">${t('Ev (oturduğu yer / durak)')}<select id="f_home">${opt(homePlaces().slice().sort((a, b) => sortTR(a.name, b.name)), p.homeId, x => x.name + (placeExempt(x) ? '  (' + t('muaf yer') + ')' : ''), x => x.id, t('— seçiniz —'))}</select></label>
    <label class="f">${t('Muafiyet')}<select id="f_ex"><option value="" ${p.exempt == null ? 'selected' : ''}>${t('Yere göre (otomatik)')}</option><option value="1" ${p.exempt === true ? 'selected' : ''}>${t('Muaf (servis dışı)')}</option><option value="0" ${p.exempt === false ? 'selected' : ''}>${t('Muaf değil (servise dahil)')}</option></select></label>
  </div>
  <label class="f">${t('Not')}<textarea id="f_notes" rows="2" dir="auto">${h(p.notes)}</textarea></label>
  <label class="chk" style="margin-top:8px"><input type="checkbox" id="f_active" ${p.active !== false ? 'checked' : ''}> ${t('Sistemde aktif (işareti kaldırırsanız kişi sistemden çıkarılır, kaydı kalır)')}</label>
  <div class="actions">${id ? `<button class="btn danger" id="f_del">${t('Kaydı sil')}</button>` : ''}<span style="flex:1"></span>${cancelBtn()}<button class="btn primary" id="f_save">${t('Kaydet')}</button></div>`,
    (r, close) => {
      $('#f_save', r).onclick = () => {
        const name = $('#f_name', r).value.trim(); if (!name) return toast(t('Ad gerekli'), true);
        Object.assign(p, { seq: $('#f_seq', r).value.trim(), regNo: $('#f_reg', r).value.trim(), group: $('#f_grp', r).value, name, nickname: $('#f_nick', r).value.trim(), title: $('#f_title', r).value.trim(), mother: $('#f_mother', r).value.trim(), workId: $('#f_work', r).value, lineId: $('#f_line', r).value, homeId: $('#f_home', r).value, notes: $('#f_notes', r).value.trim(), active: $('#f_active', r).checked });
        const ex = $('#f_ex', r).value; p.exempt = ex === '' ? null : ex === '1';
        if (!id) S.persons.push(p);
        const L = lineById(p.lineId); if (L && p.homeId && !L.stops.includes(p.homeId)) L.stops.push(p.homeId);
        save(); close(); render(); toast(t('Kaydedildi'));
      };
      if (id) $('#f_del', r).onclick = () => confirmDlg(t('Bu kişi kalıcı olarak silinsin mi?'), () => { S.persons = S.persons.filter(x => x.id !== id); save(); close(); render(); });
    });
}

// ---------- Yerler ----------
function renderPlaces(m) {
  const list = S.places.slice().sort((a, b) => (a.type === 'work' ? 0 : 1) - (b.type === 'work' ? 0 : 1) || sortTR(a.name, b.name));
  m.innerHTML = `<h1>${t('Yerleşim Yerleri')}</h1>
  <p class="muted">${t('İşyerleri')}: <b>${workPlaces().map(p => h(p.name)).join(', ')}</b>. ${t('Geri kalan yerler evdir. Muaf yerler (ör. Halep, Cerablus, Derkuş, Tel Rıfat, Sermede, Harim, Cinderes) sistemden ayrıdır; buradaki kişiler servise dahil edilmez (kişi bazında aktif edilebilir).')}</p>
  <div class="toolbar"><input type="search" id="plq" placeholder="${t('Yer ara…')}"><span style="flex:1"></span><button class="btn primary" id="plAdd">+ ${t('Yer ekle')}</button></div>
  <div class="card tight"><div class="tbl-wrap"><table id="pltbl"></table></div></div>`;
  const draw = () => {
    const q = ($('#plq').value || '').toLowerCase();
    $('#pltbl').innerHTML = `<tr><th>${t('Yer')}</th><th>${t('Tür')}</th><th>${t('Muafiyet')}</th><th>${t('Kişi')}</th><th>${t('Hatlar')}</th><th>${t('Harita')}</th><th></th></tr>` + list.filter(p => p.name.toLowerCase().includes(q)).map(p => {
      const cnt = S.persons.filter(x => x.homeId === p.id || x.workId === p.id).length;
      const ls = S.lines.filter(L => L.stops.includes(p.id) || L.endA === p.id).map(L => lname(L)).join(', ');
      const ex = p.type === 'work' ? '' : placeExempt(p) ? `<span class="badge warn">${t('Muaf')}${p.exempt == null ? ' (' + t('otomatik') + ')' : ''}</span>` : p.exempt === false ? `<span class="badge ok">${t('Dahil (zorla)')}</span>` : `<span class="badge ok">${t('Dahil')}</span>`;
      const c = placeCoord(p);
      return `<tr><td dir="auto"><b>${h(p.name)}</b></td><td>${p.type === 'work' ? `<span class="badge info">${t('İşyeri')}</span>` : t('Ev')}</td><td>${ex}</td><td>${cnt}</td><td>${h(ls)}</td><td class="small muted">${c.unknown ? `<span class="badge warn">${t('konum bilinmiyor')}</span>` : c.auto ? t('otomatik') : t('elle')}</td><td><button class="btn sm" data-e="${p.id}">${t('Düzenle')}</button></td></tr>`;
    }).join('');
    $$('[data-e]', m).forEach(b => b.onclick = () => editPlace(b.dataset.e));
  };
  draw(); $('#plq').oninput = draw; $('#plAdd').onclick = () => editPlace(null);
}
function editPlace(id) {
  const p = id ? placeById(id) : { id: uid('p'), name: '', type: 'home', exempt: null };
  const c = placeCoord(p);
  modal(`<h2>${id ? t('Yeri düzenle') : t('Yeni yer')}</h2>
  <div class="grid c2">
    <label class="f">${t('Yer adı')}<input id="g_name" dir="auto" value="${h(p.name)}"></label>
    <label class="f">${t('Tür')}<select id="g_type"><option value="home" ${p.type !== 'work' ? 'selected' : ''}>${t('Ev (yerleşim)')}</option><option value="work" ${p.type === 'work' ? 'selected' : ''}>${t('İşyeri')}</option></select></label>
    <label class="f">${t('Muafiyet')}<select id="g_ex"><option value="" ${p.exempt == null ? 'selected' : ''}>${t('Otomatik (anahtar kelimeye göre)')}</option><option value="1" ${p.exempt === true ? 'selected' : ''}>${t('Muaf (sistem dışı)')}</option><option value="0" ${p.exempt === false ? 'selected' : ''}>${t('Dahil')}</option></select></label>
    <label class="f">${t('Harita konumu (enlem, boylam)')}<div class="row" style="gap:4px"><input id="g_lat" style="width:110px" placeholder="${t('enlem')}" value="${p.lat != null ? p.lat : ''}"><input id="g_lon" style="width:110px" placeholder="${t('boylam')}" value="${p.lon != null ? p.lon : ''}"></div><span class="small muted">${t('Boş bırakılırsa otomatik')}: ${c.lat.toFixed(3)}, ${c.lon.toFixed(3)}${c.unknown ? ' (' + t('tahmini') + ')' : ''}</span></label>
  </div>
  <div class="actions">${id ? `<button class="btn danger" id="g_del">${t('Sil')}</button>` : ''}<span style="flex:1"></span>${cancelBtn()}<button class="btn primary" id="g_save">${t('Kaydet')}</button></div>`, (r, close) => {
    $('#g_save', r).onclick = () => {
      const name = $('#g_name', r).value.trim(); if (!name) return toast(t('Ad gerekli'), true);
      p.name = name; p.type = $('#g_type', r).value; const ex = $('#g_ex', r).value; p.exempt = ex === '' ? null : ex === '1';
      const la = parseFloat($('#g_lat', r).value), lo = parseFloat($('#g_lon', r).value); if (isFinite(la) && isFinite(lo)) { p.lat = la; p.lon = lo; } else { delete p.lat; delete p.lon; }
      if (!id) S.places.push(p); save(); close(); render();
    };
    if (id) $('#g_del', r).onclick = () => {
      if (S.persons.some(x => x.homeId === id || x.workId === id)) return toast(t('Bu yerde kayıtlı kişiler var; önce onları taşıyın.'), true);
      confirmDlg(t('Yer silinsin mi?'), () => { S.places = S.places.filter(x => x.id !== id); S.lines.forEach(L => { L.stops = L.stops.filter(s => s !== id); }); save(); close(); render(); });
    };
  });
}

// ---------- Hatlar ----------
let selLine = '';
function renderLines(m) {
  if (!lineById(selLine) && S.lines[0]) selLine = S.lines[0].id;
  const L = lineById(selLine);
  m.innerHTML = `<h1>${t('Hatlar & Duraklar')}</h1>
  <div class="toolbar"><select id="lsel">${opt(S.lines, selLine, x => lname(x))}</select>
    <button class="btn" id="lEdit" ${L ? '' : 'disabled'}>${t('Hattı düzenle')}</button>
    <button class="btn primary" id="lAdd">+ ${t('Yeni hat')}</button></div>
  ${L ? lineDetail(L) : `<p class="muted">${t('Hat yok.')}</p>`}`;
  $('#lsel').onchange = e => { selLine = e.target.value; render(); };
  $('#lAdd').onclick = () => editLine(null); $('#lEdit').onclick = () => editLine(L.id);
  if (!L) return;
  $$('[data-up]', m).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [L.stops[i - 1], L.stops[i]] = [L.stops[i], L.stops[i - 1]]; save(); render(); } });
  $$('[data-down]', m).forEach(b => b.onclick = () => { const i = +b.dataset.down; if (i < L.stops.length - 1) { [L.stops[i + 1], L.stops[i]] = [L.stops[i], L.stops[i + 1]]; save(); render(); } });
  $$('[data-rm]', m).forEach(b => b.onclick = () => { const sid = b.dataset.rm; const n = S.persons.filter(p => p.lineId === L.id && p.homeId === sid).length; if (n) return toast(t('Bu durakta {0} kişi var; önce kişileri başka durağa/hatta alın.', n), true); L.stops = L.stops.filter(s => s !== sid); save(); render(); });
  $$('[data-addp]', m).forEach(b => b.onclick = () => addPersonToStop(L, b.dataset.addp));
  $$('[data-rmp]', m).forEach(b => b.onclick = () => { const p = S.persons.find(x => x.id === b.dataset.rmp); p.lineId = ''; save(); render(); toast(p.name + ' — ' + t('hattan çıkarıldı')); });
  $('#stopAdd').onclick = () => { const v = $('#stopSel').value; if (!v) return; if (!L.stops.includes(v)) L.stops.push(v); save(); render(); };
  $('#stopNew').onclick = () => { modal(`<h2>${t('Yeni durak (yer)')}</h2><label class="f">${t('Yer adı')}<input id="ns" dir="auto"></label><div class="actions">${cancelBtn()}<button class="btn primary" id="nsOk">${t('Ekle')}</button></div>`, (r, close) => { $('#nsOk', r).onclick = () => { const n = $('#ns', r).value.trim(); if (!n) return; const p = { id: uid('p'), name: n, type: 'home', exempt: null }; S.places.push(p); L.stops.push(p.id); save(); close(); render(); }; }); };
}
function lineDetail(L) {
  const d0 = todayISO();
  const persons = S.persons.filter(p => p.lineId === L.id);
  const unplaced = persons.filter(p => !L.stops.includes(p.homeId));
  const row = (p) => { const ex = personExempt(p) || p.active === false; const g = groupById(p.group); const st = g ? groupStatusAt(g, d0) : ''; return `<span class="pill" style="${ex ? 'opacity:.55' : ''}" title="${h(p.title)}"><span dir="auto">${h(p.name)}</span> <span class="muted">${h(p.group)}${st ? ' · ' + (st === 'work' ? t('işte') : t('evde')) : ''}${ex ? ' · ' + t('muaf/pasif') : ''}</span><button data-rmp="${p.id}" title="${t('Hattan çıkar')}">✕</button></span>`; };
  return `<div class="grid c2">
  <div>
    <div class="card"><div class="row between"><h2><i class="dot" style="background:${lineColor(L)}"></i> ${h(lname(L))}</h2><span class="muted small">${persons.filter(personInService).length} ${t('kişi serviste')} / ${persons.length} ${t('kayıtlı')}</span></div>
    <div class="small muted">${t('Başlangıç (işyeri)')}: <b dir="auto">${h(placeName(L.endA))}</b> → ${t('duraklar işyerinden uzaklaşma sırasına göre. Sıra, sefer planında ve ekspres otobüs bölmesinde kullanılır.')}</div></div>
    <div class="stop work"><span class="n">🏭</span><span class="name" dir="auto">${h(placeName(L.endA))}</span><span class="cnt">${t('işyeri')}</span></div>
    ${L.stops.map((sid, i) => { const pl = placeById(sid); const ps = persons.filter(p => p.homeId === sid); return `<div class="stop ${pl && placeExempt(pl) ? 'exempt' : ''}"><span class="n">${i + 1}</span><div class="name"><div dir="auto"><b>${h(placeName(sid))}</b> ${pl && placeExempt(pl) ? `<span class="badge warn">${t('muaf yer')}</span>` : ''}</div><div class="pill-list" style="margin-top:4px">${ps.map(row).join('')}<button class="btn sm" data-addp="${sid}">+ ${t('kişi')}</button></div></div><span class="cnt">${ps.filter(personInService).length}</span><button class="btn sm" data-up="${i}">▲</button><button class="btn sm" data-down="${i}">▼</button><button class="btn sm danger" data-rm="${sid}">✕</button></div>`; }).join('')}
    <div class="row" style="margin-top:8px"><select id="stopSel">${opt(homePlaces().filter(p => !L.stops.includes(p.id)).sort((a, b) => sortTR(a.name, b.name)), '', x => x.name, x => x.id, t('— mevcut yerden durak ekle —'))}</select><button class="btn" id="stopAdd">${t('Durak ekle')}</button><button class="btn" id="stopNew">+ ${t('Yeni yer oluştur')}</button></div>
  </div>
  <div>
    ${unplaced.length ? `<div class="card"><h3>${t('Durağı hatta tanımlı olmayan kişiler')}</h3><div class="pill-list">${unplaced.map(row).join('')}</div><p class="small muted">${t('Bu kişilerin ev yerini hattın duraklarına ekleyin (yukarıdan "Durak ekle").')}</p></div>` : ''}
    <div class="card"><h3>${t('Hat özeti')}</h3><div class="kv">
      <b>${t('Durak')}</b><span>${L.stops.length}</span>
      <b>${t('İşte olanlar')}</b><span>${persons.filter(p => personInService(p) && stWork(groupById(p.group), d0)).length}</span>
      <b>${t('Evde olanlar')}</b><span>${persons.filter(p => personInService(p) && groupById(p.group) && !stWork(groupById(p.group), d0)).length}</span>
      <b>${t('Muaf / pasif')}</b><span>${persons.filter(p => !personInService(p)).length}</span></div></div>
  </div></div>`;
}
function editLine(id) {
  const L = id ? lineById(id) : { id: uid('l'), name: '', endA: (workPlaces()[0] || {}).id || '', stops: [], color: LINE_COLORS[S.lines.length % LINE_COLORS.length] };
  modal(`<h2>${id ? t('Hattı düzenle') : t('Yeni hat')}</h2>
  <div class="grid c3"><label class="f">${t('Hat adı')}<input id="l_name" dir="auto" value="${h(lname(L))}"></label>
  <label class="f">${t('Başlangıç işyeri')}<select id="l_endA">${opt(workPlaces(), L.endA)}</select></label>
  <label class="f">${t('Harita rengi')}<input type="color" id="l_color" value="${lineColor(L)}" style="height:34px"></label>
  <label class="f">${t('Hat sonu (haritada)')}<select id="l_endB">${opt(homePlaces().slice().sort((a, b) => sortTR(a.name, b.name)), lineEndB(L), x => x.name, x => x.id, t('— otomatik —'))}</select></label></div>
  <div class="actions">${id ? `<button class="btn danger" id="l_del">${t('Hattı sil')}</button>` : ''}<span style="flex:1"></span>${cancelBtn()}<button class="btn primary" id="l_save">${t('Kaydet')}</button></div>`, (r, close) => {
    $('#l_save', r).onclick = () => { const n = $('#l_name', r).value.trim(); if (!n) return toast(t('Ad gerekli'), true); L.name = n; L.nameAr = $('#l_nameAr', r).value.trim(); L.nameEn = $('#l_nameEn', r).value.trim(); L.endA = $('#l_endA', r).value; L.endB = $('#l_endB', r).value; L.color = $('#l_color', r).value; if (!id) { S.lines.push(L); selLine = L.id; } save(); close(); render(); };
    if (id) $('#l_del', r).onclick = () => confirmDlg(t('Hat silinsin mi? Hattaki kişiler hatsız kalır.'), () => { S.persons.forEach(p => { if (p.lineId === id) p.lineId = ''; }); S.lines = S.lines.filter(x => x.id !== id); selLine = ''; save(); close(); render(); });
  });
}
function addPersonToStop(L, stopId) {
  const cands = S.persons.filter(p => !(p.lineId === L.id && p.homeId === stopId)).sort((a, b) => sortTR(a.name, b.name));
  modal(`<h2>${t('Durağa kişi ekle')} – <span dir="auto">${h(placeName(stopId))}</span></h2>
  <input type="search" id="apq" placeholder="${t('Kişi ara…')}" style="width:100%"><div class="tbl-wrap" style="max-height:50vh;margin-top:8px"><table id="aptbl"></table></div>
  <p class="small muted">${t('Seçilen kişinin hattı')} <b>${h(lname(L))}</b>, ${t('ev durağı')} <b dir="auto">${h(placeName(stopId))}</b> ${t('olarak güncellenir.')}</p>
  <div class="actions"><button class="btn" data-close>${t('Kapat')}</button></div>`, (r, close) => {
    const draw = () => { const q = $('#apq', r).value.toLowerCase(); $('#aptbl', r).innerHTML = cands.filter(p => (p.name + ' ' + p.nickname + ' ' + placeName(p.homeId)).toLowerCase().includes(q)).slice(0, 60).map(p => `<tr><td dir="auto">${h(p.name)}</td><td>${h(p.group)}</td><td dir="auto" class="muted">${h(placeName(p.homeId))} / ${h(lineName(p.lineId))}</td><td><button class="btn sm" data-pick="${p.id}">${t('Ekle')}</button></td></tr>`).join(''); $$('[data-pick]', r).forEach(b => b.onclick = () => { const p = S.persons.find(x => x.id === b.dataset.pick); p.lineId = L.id; p.homeId = stopId; save(); close(); render(); toast(p.name + ' — ' + t('eklendi')); }); };
    draw(); $('#apq', r).oninput = draw;
  });
}

// ---------- Vardiya & Değişim ----------
function renderShifts(m) {
  const d0 = todayISO();
  const calRows = (() => { const dates = new Set([d0]); S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, d0, addDays(d0, 120)).forEach(d => dates.add(d))); changeDatesBetween(S.driver, S.driver.cycleDays, d0, addDays(d0, 120)).forEach(d => dates.add(d)); return Array.from(dates).sort(); })();
  m.innerHTML = `<h1>${t('Vardiya & Değişim')}</h1>
  <div class="card"><h2>${t('Döngü')}</h2>
    <div class="row"><label class="f">${t('Döngü süresi (gün)')} <input id="cyc" type="number" min="1" value="${S.settings.cycleDays}" style="width:90px"></label>
    <span class="muted small">${t('Kural: 9 gün iş, 10. gün değişim → döngü 10 gün. Her değişim gününde işteki grup eve, evdeki grup işe gider.')}</span></div></div>
  <div class="card"><h2>${t('Gruplar – şu anki durum ve değişim tarihleri')}</h2>
    <p class="small muted">${t('Her grup için şu an nerede olduğunu, bu durumun hangi tarihten beri sürdüğünü ve sonraki değişim tarihini girin; sonrası döngüye göre otomatik hesaplanır. Düzensiz tarihler için "özel tarihler" alanına virgülle ayrılmış tarihler yazabilirsiniz (ör. 2026-11-20, 2026-12-01); listeden sonrası yine döngüyle devam eder.')}</p>
    <table><tr><th>${t('Grup')}</th><th>${t('Şu an')}</th><th>${t('Bu durum… tarihinden beri')}</th><th>${t('Sonraki değişim')}</th><th>${t('Özel değişim tarihleri (isteğe bağlı)')}</th><th>${t('Kişi')}</th><th></th></tr>
    ${S.groups.map(g => `<tr data-g="${g.id}"><td><input class="gname" value="${h(g.name)}" style="width:70px"></td>
      <td><select class="gst"><option value="work" ${g.status === 'work' ? 'selected' : ''}>${t('İşte')}</option><option value="home" ${g.status === 'home' ? 'selected' : ''}>${t('Evde')}</option></select></td>
      <td><input type="date" class="gsince" value="${h(g.statusSince)}"></td>
      <td><input type="date" class="gnext" value="${h(g.nextChange)}"></td>
      <td><input class="gcustom" value="${h((g.customDates || []).join(', '))}" placeholder="YYYY-MM-DD, …" style="width:260px"></td>
      <td>${S.persons.filter(p => p.group === g.id && personInService(p)).length}</td>
      <td><button class="btn sm danger" data-gdel="${g.id}">✕</button></td></tr>`).join('')}
    </table>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="gSave">${t('Kaydet')}</button><button class="btn" id="gAdd">+ ${t('Grup ekle')}</button><button class="btn" id="gApplyAll">${t('Tüm gruplara aynı sonraki tarihi uygula')}</button></div>
  </div>
  <div class="card"><h2>${t('Hesaplanan takvim (önümüzdeki 120 gün)')}</h2>
    <table><tr><th>${t('Tarih')}</th><th>${t('Gün')}</th>${S.groups.map(g => `<th>${h(g.name)}</th>`).join('')}<th>${t('Şoför ekibi')}</th></tr>
    ${calRows.map(d => `<tr><td><b>${fmt(d)}</b>${d === d0 ? ` <span class="badge info">${t('bugün')}</span>` : ''}</td><td>${dayName(d)}</td>${S.groups.map(g => { const ch = changeDatesBetween(g, S.settings.cycleDays, d, d).length > 0; const st = groupStatusAt(g, d); return `<td>${ch ? '<span class="badge ' + (st === 'work' ? 'ok' : 'gray') + '">' + (st === 'work' ? '→ ' + t('İşe gidiş') : '→ ' + t('Eve dönüş')) + '</span>' : '<span class="muted">' + (st === 'work' ? t('işte') : t('evde')) + '</span>'}</td>`; }).join('')}<td>${changeDatesBetween(S.driver, S.driver.cycleDays, d, d).length ? `<span class="badge info">${t('Ekip')} ${driverTeamAt(d)} ${t('göreve')}</span>` : `<span class="muted">${t('Ekip')} ${driverTeamAt(d)}</span>`}</td></tr>`).join('')}
    </table></div>`;
  $('#gSave').onclick = () => {
    S.settings.cycleDays = Math.max(1, +$('#cyc').value || 10);
    $$('tr[data-g]', m).forEach(tr => { const g = groupById(tr.dataset.g); g.name = $('.gname', tr).value.trim() || g.id; g.status = $('.gst', tr).value; g.statusSince = $('.gsince', tr).value || d0; g.nextChange = $('.gnext', tr).value; g.customDates = $('.gcustom', tr).value.split(/[,\s]+/).map(x => x.trim()).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)); });
    save(); render(); toast(t('Vardiya ayarları kaydedildi'));
  };
  $('#gAdd').onclick = () => modal(`<h2>${t('Yeni grup')}</h2><label class="f">${t('Grup kodu')}<input id="ng"></label><div class="actions">${cancelBtn()}<button class="btn primary" id="ngOk">${t('Ekle')}</button></div>`, (r, close) => { $('#ngOk', r).onclick = () => { const id = $('#ng', r).value.trim(); if (!id || groupById(id)) return toast(t('Geçersiz veya mevcut kod'), true); S.groups.push({ id, name: id, status: 'home', statusSince: d0, nextChange: '', customDates: [] }); save(); close(); render(); }; });
  $$('[data-gdel]', m).forEach(b => b.onclick = () => { const id = b.dataset.gdel; if (S.persons.some(p => p.group === id)) return toast(t('Bu grupta kişiler var'), true); confirmDlg(t('Grup silinsin mi?'), () => { S.groups = S.groups.filter(g => g.id !== id); save(); render(); }); });
  $('#gApplyAll').onclick = () => { const a = $$('tr[data-g]', m); const first = a[0] && $('.gnext', a[0]).value; if (!first) return toast(t('Önce ilk grubun sonraki değişim tarihini girin'), true); a.forEach(tr => { $('.gnext', tr).value = first; }); toast(t("Tüm gruplara uygulandı; Kaydet'e basın")); };
}

// ---------- Şoförler ----------
function renderDrivers(m) {
  const d0 = todayISO(); const team = driverTeamAt(d0);
  m.innerHTML = `<h1>${t('Şoförler')}</h1>
  <div class="grid c2">
  <div class="card"><div class="row between"><h2>${t('Şoför listesi')}</h2><button class="btn primary" id="dAdd">+ ${t('Şoför ekle')}</button></div>
    ${S.drivers.map(d => `<div class="drv ${d.team === team ? 'on' : 'off'}"><div style="flex:1"><div class="nm" dir="auto">${h(d.name)} <span class="small muted">${h(d.phone)}</span></div><div class="small muted">${t('Ekip')} ${d.team} · ${t('İşe başlama')}: ${fmt(d.startDate)} · ${t('Bitiş')}: ${d.endDate ? fmt(d.endDate) : '—'} ${d.notes ? '· ' + h(d.notes) : ''}</div></div><span class="badge ${d.team === team ? 'ok' : 'gray'}">${d.team === team ? t('Aktif') : t('İstirahatte')}</span><button class="btn sm" data-de="${d.id}">${t('Düzenle')}</button></div>`).join('')}
  </div>
  <div class="card"><h2>${t('Nöbet düzeni')}</h2>
    <p class="small muted">${t('2 şoför çalışır, 2 şoför istirahattedir (Ekip 1 / Ekip 2). Şoför değişimi yolcu değişiminin ortasında (5. gün) yapılır.')}</p>
    <div class="grid c2">
      <label class="f">${t('Şu an görevde olan ekip')}<select id="dteam"><option value="1" ${S.driver.activeTeam === 1 ? 'selected' : ''}>${t('Ekip')} 1</option><option value="2" ${S.driver.activeTeam === 2 ? 'selected' : ''}>${t('Ekip')} 2</option></select></label>
      <label class="f">${t('Bu ekip … tarihinden beri görevde')}<input type="date" id="dsince" value="${h(S.driver.statusSince)}"></label>
      <label class="f">${t('Sonraki şoför değişimi')}<input type="date" id="dnext" value="${h(S.driver.nextChange)}"></label>
      <label class="f">${t('Şoför döngüsü (gün)')}<input type="number" id="dcyc" min="1" value="${S.driver.cycleDays}"></label>
    </div>
    <label class="f" style="margin-top:8px">${t('Özel değişim tarihleri (isteğe bağlı)')}<input id="dcustom" value="${h((S.driver.customDates || []).join(', '))}" placeholder="YYYY-MM-DD, …"></label>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="dSave">${t('Kaydet')}</button><button class="btn" id="dAuto">${t('Yolcu değişiminin ortasına ayarla (5 gün sonrası)')}</button></div>
    <h3 style="margin-top:14px">${t('Yaklaşan şoför değişimleri')}</h3>
    <div class="timeline">${changeDatesBetween(S.driver, S.driver.cycleDays, d0, addDays(d0, 90)).map(d => `<div class="tl"><b>${fmt(d)}</b>${dayName(d)}<br><span class="muted">${t('Ekip')} ${driverTeamAt(d)} ${t('göreve')}</span></div>`).join('') || `<span class="muted">${t('tarih girilmedi')}</span>`}</div>
  </div></div>`;
  $('#dAdd').onclick = () => editDriver(null); $$('[data-de]', m).forEach(b => b.onclick = () => editDriver(b.dataset.de));
  $('#dSave').onclick = () => { S.driver.activeTeam = +$('#dteam').value; S.driver.statusSince = $('#dsince').value || d0; S.driver.nextChange = $('#dnext').value; S.driver.cycleDays = Math.max(1, +$('#dcyc').value || 10); S.driver.customDates = $('#dcustom').value.split(/[,\s]+/).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)); save(); render(); toast(t('Kaydedildi')); };
  $('#dAuto').onclick = () => { const nx = upcomingChangeDates(1)[0]; if (!nx) return toast(t('Önce grup değişim tarihini girin'), true); const half = Math.round(S.settings.cycleDays / 2); let d = addDays(nx, half); if (d < d0) d = addDays(d, S.settings.cycleDays); $('#dnext').value = d; $('#dcyc').value = S.settings.cycleDays; toast(t('Önerilen tarih yazıldı') + ': ' + fmt(d)); };
}
function editDriver(id) {
  const d = id ? S.drivers.find(x => x.id === id) : { id: uid('d'), name: '', phone: '', team: 1, startDate: '', endDate: '', notes: '' };
  modal(`<h2>${id ? t('Şoförü düzenle') : t('Yeni şoför')}</h2><div class="grid c2">
  <label class="f">${t('Ad Soyad')}<input id="d_name" dir="auto" value="${h(d.name)}"></label><label class="f">${t('Telefon')}<input id="d_phone" value="${h(d.phone)}"></label>
  <label class="f">${t('Ekip')}<select id="d_team"><option value="1" ${d.team === 1 ? 'selected' : ''}>${t('Ekip')} 1</option><option value="2" ${d.team === 2 ? 'selected' : ''}>${t('Ekip')} 2</option></select></label>
  <label class="f">${t('İşe başlama tarihi')}<input type="date" id="d_start" value="${h(d.startDate)}"></label><label class="f">${t('İşten ayrılış tarihi')}<input type="date" id="d_end" value="${h(d.endDate)}"></label>
  <label class="f">${t('Not')}<input id="d_notes" dir="auto" value="${h(d.notes)}"></label></div>
  <div class="actions">${id ? `<button class="btn danger" id="d_del">${t('Sil')}</button>` : ''}<span style="flex:1"></span>${cancelBtn()}<button class="btn primary" id="d_save">${t('Kaydet')}</button></div>`, (r, close) => {
    $('#d_save', r).onclick = () => { Object.assign(d, { name: $('#d_name', r).value.trim() || t('Şoför'), phone: $('#d_phone', r).value.trim(), team: +$('#d_team', r).value, startDate: $('#d_start', r).value, endDate: $('#d_end', r).value, notes: $('#d_notes', r).value.trim() }); if (!id) S.drivers.push(d); save(); close(); render(); };
    if (id) $('#d_del', r).onclick = () => confirmDlg(t('Şoför silinsin mi?'), () => { S.drivers = S.drivers.filter(x => x.id !== id); save(); close(); render(); });
  });
}

// ---------- Sefer planı ----------
let planDate = '';
function planCfg(lid) { S.plans[planDate] = S.plans[planDate] || {}; return S.plans[planDate][lid] = S.plans[planDate][lid] || { buses: 1, firstStopBus1: '' }; }
function renderPlan(m) {
  const d0 = todayISO(); const upcoming = upcomingChangeDates(10);
  if (!planDate) planDate = upcoming[0] || d0;
  const P = planFor(planDate);
  m.innerHTML = `<h1>${t('Sefer Planı')}</h1>
  <div class="toolbar"><label class="f">${t('Değişim tarihi')}<input type="date" id="pdate" value="${planDate}"></label>
    <select id="pquick"><option value="">${t('Yaklaşan değişimler…')}</option>${upcoming.map(d => `<option value="${d}">${fmt(d)} ${dayName(d)} — ${changesOn(d).map(g => g.name).join(', ')}</option>`).join('')}</select>
    <span style="flex:1"></span><button class="btn" id="pXls">${t("Excel'e ver")}</button><button class="btn primary" id="pPrint">🖨️ ${t('Yazdır')}</button></div>
  ${P.groups.length ? `<p>${t('Bu tarihte değişen gruplar')}: ${P.groups.map(g => `<span class="badge ${groupPrevStatus(g, planDate) === 'work' ? 'ok' : 'gray'}">${h(g.name)}: ${groupPrevStatus(g, planDate) === 'work' ? t('işten eve') : t('evden işe')}</span>`).join(' ')}</p>` : `<p class="badge warn">${t('Bu tarihte değişim yok. Vardiya sayfasından değişim tarihlerini kontrol edin.')}</p>`}
  <p class="small muted">${t('Şoför')}: ${t('Ekip')} ${driverTeamAt(planDate)} ${t('görevde')}. ${t('Otobüs işyerinden çıkar, eve dönenleri duraklara bırakır ve aynı duraklardan işe gidenleri alır.')}</p>
  ${P.lines.map(pl => planLineHtml(pl)).join('')}`;
  $('#pdate').onchange = e => { planDate = e.target.value; render(); };
  $('#pquick').onchange = e => { if (e.target.value) { planDate = e.target.value; render(); } };
  $$('[data-buses]', m).forEach(s => s.onchange = () => { planCfg(s.dataset.buses).buses = +s.value; save(); render(); });
  $$('[data-split]', m).forEach(s => s.onchange = () => { planCfg(s.dataset.split).firstStopBus1 = s.value; save(); render(); });
  $$('[data-note]', m).forEach(s => s.onchange = () => { planCfg(s.dataset.note).note = s.value; save(); });
  $$('[data-sb]', m).forEach(s => s.onchange = () => { const c = planCfg(s.dataset.sb); c.stopBus = c.stopBus || {}; c.stopBus[s.dataset.stop] = +s.value; save(); render(); });
  $$('[data-sbreset]', m).forEach(b => b.onclick = () => { planCfg(b.dataset.sbreset).stopBus = {}; save(); render(); });
  $('#pPrint').onclick = () => printReport('plan', { date: planDate });
  $('#pXls').onclick = () => exportPlanExcel(planDate);
}
function planLineHtml(pl) {
  const L = pl.line, cfg = pl.cfg;
  if (!pl.rows.length) return `<div class="card tight"><i class="dot" style="background:${lineColor(L)}"></i> <b>${h(lname(L))}</b> <span class="muted small">— ${t('bu tarihte yolcu yok')}</span></div>`;
  const stopHtml = sid => { const rs = pl.byStop[sid]; const bus = rs[0].bus; return `<div class="plan-stop ${cfg.buses === 2 ? 'bus' + bus : ''}"><div class="hd"><span dir="auto">${h(placeName(sid))} ${L.stops.includes(sid) ? '' : `<span class="badge warn">${t('durak tanımsız')}</span>`}</span><span class="small muted">${cfg.buses === 2 ? `<select class="sb" data-sb="${L.id}" data-stop="${sid}"><option value="1" ${bus === 1 ? 'selected' : ''}>${t('Otobüs')} 1</option><option value="2" ${bus === 2 ? 'selected' : ''}>${t('Otobüs')} 2</option></select> · ` : ''}${t('eve')} ${rs.filter(r => r.dir === 'toHome').length} · ${t('işe')} ${rs.filter(r => r.dir === 'toWork').length}</span></div><ul>${rs.map(r => `<li>${r.dir === 'toHome' ? '🏠' : '🏭'} <span dir="auto">${h(r.p.name)}</span> <span class="muted small">${h(r.p.group)}</span></li>`).join('')}</ul></div>`; };
  return `<div class="card"><div class="row between"><h2><i class="dot" style="background:${lineColor(L)}"></i> ${h(lname(L))} <span class="muted small">— ${t('eve dönen')} ${pl.toHome}, ${t('işe giden')} ${pl.toWork}, ${t('toplam')} ${pl.rows.length}</span></h2>
    <div class="row"><label class="f">${t('Sefer türü')}<select data-buses="${L.id}"><option value="1" ${cfg.buses !== 2 ? 'selected' : ''}>${t('Normal (1 otobüs)')}</option><option value="2" ${cfg.buses === 2 ? 'selected' : ''}>${t('Özel durum: 2 otobüs')}</option></select></label>
    ${cfg.buses === 2 ? `<label class="f">${t('Otobüs 1 (ekspres) ilk durağı')}<select data-split="${L.id}">${opt(L.stops.map(s => ({ id: s, name: placeName(s) })), cfg.firstStopBus1, x => x.name, x => x.id, t('— seçiniz —'))}</select></label><button class="btn sm" data-sbreset="${L.id}" style="margin-top:16px" title="${t('Durak bazlı atamaları temizle')}">${t('Atamaları sıfırla')}</button>` : ''}</div></div>
    ${cfg.buses === 2 ? `<div class="legend"><span class="badge info">${t('Otobüs')} 1</span> ${t('ekspres: seçilen duraktan önce kimseyi almaz/bırakmaz')} · <span class="badge warn">${t('Otobüs')} 2</span> ${t('kalan durakları toplar')} · ${t('İstersen her durağın otobüsünü aşağıdan tek tek değiştirebilirsin.')}</div>` : ''}
    <div class="grid c2" style="margin-top:8px">${pl.stopList.map(stopHtml).join('')}</div>
    <label class="f" style="margin-top:8px">${t('Not (çıktıda görünür)')}<input data-note="${L.id}" value="${h(cfg.note || '')}"></label></div>`;
}

// ---------- Çıktılar ----------
const REPORT_TYPES = [['plan', 'Sefer planı (değişim günü)'], ['persons', 'Kişi listesi (tüm)'], ['line', 'Hat listesi (duraklara göre)'], ['groups', 'Grup listeleri (işte / evde)'], ['exempt', 'Muaf ve sistem dışı kişiler'], ['calendar', 'Değişim takvimi'], ['drivers', 'Şoför nöbet çizelgesi']];
function renderReports(m) {
  m.innerHTML = `<h1>${t('Çıktılar')}</h1>
  <div class="card"><div class="grid c3">
    <label class="f">${t('Rapor')}<select id="rtype">${REPORT_TYPES.map(([v, l]) => `<option value="${v}">${t(l)}</option>`).join('')}</select></label>
    <label class="f">${t('Antet')}<select id="rlh">${opt(S.letterheads, S.settings.defaultLetterheadId)}</select></label>
    <label class="f">${t('Tarih')}<input type="date" id="rdate" value="${planDate || upcomingChangeDates(1)[0] || todayISO()}"></label>
    <label class="f">${t('Hat')}<select id="rline">${opt(S.lines, '', x => lname(x), x => x.id, t('Tüm hatlar'))}</select></label>
    <label class="f">${t('Başlık (isteğe bağlı)')}<input id="rtitle" placeholder="${t('Varsayılan başlık')}"></label>
  </div>
  <div class="row" style="margin-top:12px"><button class="btn primary" id="rPrint">🖨️ ${t('Yazdır / PDF')}</button><button class="btn" id="rXls">📗 ${t("Excel'e ver")}</button><button class="btn" id="rPrev">${t('Önizleme')}</button></div></div>
  <div id="rprev" class="card" style="display:none"></div>`;
  const opts = () => ({ date: $('#rdate').value, lineId: $('#rline').value, lhId: $('#rlh').value, title: $('#rtitle').value.trim() });
  $('#rPrint').onclick = () => printReport($('#rtype').value, opts());
  $('#rPrev').onclick = () => { const d = $('#rprev'); d.style.display = 'block'; d.innerHTML = '<div class="print-area" style="display:block;background:#fff;padding:10px">' + reportHtml($('#rtype').value, opts()) + '</div>'; };
  $('#rXls').onclick = () => { const ty = $('#rtype').value, o = opts(); if (ty === 'plan') exportPlanExcel(o.date); else if (ty === 'calendar') exportCalendarExcel(); else if (ty === 'drivers') exportDriversExcel(); else exportPersonsExcel(ty, o); };
}
function letterheadHtml(lhId) {
  const lh = S.letterheads.find(x => x.id === lhId) || S.letterheads.find(x => x.id === S.settings.defaultLetterheadId) || S.letterheads[0];
  if (!lh) return '';
  if (lh.kind === 'image') return `<div class="lh img-only"><img src="${lh.imageData}"></div>` + (lh.watermark ? '<div class="wm"></div>' : '');
  return `${lh.watermark ? '<div class="wm"></div>' : ''}<div class="lh"><div class="l">${h(lh.left)}</div><img src="${h(lh.logo || 'assets/logo.png')}"><div class="r">${h(lh.right)}</div></div>`;
}
const dirLabel = r => r.dir === 'toHome' ? t('Eve dönüş') : t('İşe gidiş');
const personStatusLabel = p => p.active === false ? t('Çıkarıldı') : personExempt(p) ? t('Muaf') : t('Serviste');
function reportHtml(type, o) {
  const d0 = todayISO(); const date = o.date || d0;
  const head = (title, sub) => `<h1>${h(o.title || title)}</h1><div class="sub">${h(sub || '')}</div>`;
  const foot = () => `<div class="foot"><span>${h(S.settings.orgName)} · ${h(S.settings.adminName)}</span><span>${t('Yazdırma')}: ${fmt(d0)}</span></div>`;
  let body = '';
  if (type === 'plan') {
    const P = planFor(date);
    body = head(t('Sefer Planı – Değişim Günü'), `${fmt(date)} ${dayName(date)} · ${t('Değişen gruplar')}: ${P.groups.map(g => g.name).join(', ') || '—'} · ${t('Şoför')} ${t('Ekip')} ${driverTeamAt(date)} (${S.drivers.filter(d => d.team === driverTeamAt(date)).map(d => d.name).join(', ')})`);
    P.lines.filter(pl => pl.rows.length && (!o.lineId || pl.line.id === o.lineId)).forEach((pl, i) => {
      body += `<div class="sec ${i ? 'pb' : ''}">${h(lname(pl.line))} — ${t('eve dönen')} ${pl.toHome}, ${t('işe giden')} ${pl.toWork}, ${t('toplam')} ${pl.rows.length}${pl.cfg.buses === 2 ? ' · ' + t('2 otobüs') + ' (' + t('Otobüs') + ' 1 ' + t('ekspres') + ': ' + h(placeName(pl.cfg.firstStopBus1)) + ' ' + t('durağından itibaren') + ')' : ''}</div>`;
      if (pl.cfg.note) body += `<div class="small">${t('Not')}: ${h(pl.cfg.note)}</div>`;
      body += `<table><tr><th>#</th><th>${t('Durak')}</th>${pl.cfg.buses === 2 ? `<th>${t('Otobüs')}</th>` : ''}<th>${t('Ad Soyad')}</th><th>${t('Lakap')}</th><th>${t('Sicil')}</th><th>${t('Grup')}</th><th>${t('Yön')}</th></tr>`;
      let n = 0; pl.stopList.forEach(sid => pl.byStop[sid].forEach(r => { body += `<tr><td>${++n}</td><td dir="auto">${h(placeName(sid))}</td>${pl.cfg.buses === 2 ? '<td>' + r.bus + '</td>' : ''}<td dir="auto">${h(r.p.name)}</td><td dir="auto">${h(r.p.nickname)}</td><td>${h(r.p.regNo)}</td><td>${h(r.p.group)}</td><td>${dirLabel(r)}</td></tr>`; }));
      body += '</table>';
    });
    body += `<div class="sig"><div>${t('Şoför')}</div><div>${h(S.settings.adminName)}</div></div>`;
  } else if (['persons', 'exempt', 'groups', 'line'].includes(type)) {
    let list = S.persons.slice().sort((a, b) => (Number(a.seq) || 9999) - (Number(b.seq) || 9999));
    if (type === 'exempt') list = list.filter(p => personExempt(p) || p.active === false);
    if (o.lineId) list = list.filter(p => p.lineId === o.lineId);
    const tbl = rows => `<table><tr><th>#</th><th>${t('Sicil')}</th><th>${t('Ad Soyad')}</th><th>${t('Lakap')}</th><th>${t('Unvan')}</th><th>${t('Grup')}</th><th>${t('Ev')}</th><th>${t('İşyeri')}</th><th>${t('Hat')}</th><th>${t('Durum')}</th></tr>${rows.map((p, i) => `<tr><td>${i + 1}</td><td>${h(p.regNo)}</td><td dir="auto">${h(p.name)}</td><td dir="auto">${h(p.nickname)}</td><td dir="auto">${h(p.title)}</td><td>${h(p.group)}</td><td dir="auto">${h(placeName(p.homeId))}</td><td dir="auto">${h(placeName(p.workId))}</td><td>${h(lineName(p.lineId))}</td><td>${personStatusLabel(p)}</td></tr>`).join('')}</table>`;
    if (type === 'groups') {
      body = head(t('Grup Listeleri'), `${fmt(date)}`);
      S.groups.forEach(g => { const rows = list.filter(p => p.group === g.id && personInService(p)); body += `<div class="sec">${t('Grup')} ${h(g.name)} — ${groupStatusAt(g, date) === 'work' ? t('İŞTE') : t('EVDE')} — ${rows.length} ${t('kişi')} · ${t('sonraki değişim')} ${fmt(groupNextChange(g, date))}</div>` + tbl(rows); });
    } else if (type === 'line') {
      body = head(t('Hat Listesi'), o.lineId ? lineName(o.lineId) : t('Tüm hatlar'));
      S.lines.filter(L => !o.lineId || L.id === o.lineId).forEach(L => { body += `<div class="sec">${h(lname(L))} — ${t('işyeri')}: ${h(placeName(L.endA))}</div>`; L.stops.forEach((sid, i) => { const rows = list.filter(p => p.lineId === L.id && p.homeId === sid); if (!rows.length) return; body += `<div class="small"><b>${i + 1}. ${h(placeName(sid))}</b> (${rows.length})</div>` + tbl(rows); }); const un = list.filter(p => p.lineId === L.id && !L.stops.includes(p.homeId)); if (un.length) body += `<div class="small"><b>${t('Durağı tanımsız')}</b></div>` + tbl(un); });
    } else body = head(type === 'exempt' ? t('Muaf ve Sistem Dışı Kişiler') : t('Kişi Listesi'), `${list.length} ${t('kişi')} · ${fmt(d0)}`) + tbl(list);
  } else if (type === 'calendar') {
    const dates = new Set(); S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, date, addDays(date, 180)).forEach(d => dates.add(d))); changeDatesBetween(S.driver, S.driver.cycleDays, date, addDays(date, 180)).forEach(d => dates.add(d));
    body = head(t('Değişim Takvimi'), `${fmt(date)} – ${fmt(addDays(date, 180))}`) + `<table><tr><th>${t('Tarih')}</th><th>${t('Gün')}</th>${S.groups.map(g => `<th>${h(g.name)}</th>`).join('')}<th>${t('Şoför')}</th></tr>` + Array.from(dates).sort().map(d => `<tr><td>${fmt(d)}</td><td>${dayName(d)}</td>${S.groups.map(g => { const ch = changeDatesBetween(g, S.settings.cycleDays, d, d).length > 0; const st = groupStatusAt(g, d); return `<td>${ch ? (st === 'work' ? t('İşe gidiş') : t('Eve dönüş')) : (st === 'work' ? t('işte') : t('evde'))}</td>`; }).join('')}<td>${t('Ekip')} ${driverTeamAt(d)}${changeDatesBetween(S.driver, S.driver.cycleDays, d, d).length ? ' ' + t('göreve') : ''}</td></tr>`).join('') + '</table>';
  } else if (type === 'drivers') {
    body = head(t('Şoför Nöbet Çizelgesi'), `${fmt(date)} · ${t('Görevde')}: ${t('Ekip')} ${driverTeamAt(date)}`) + `<table><tr><th>${t('Ad Soyad')}</th><th>${t('Telefon')}</th><th>${t('Ekip')}</th><th>${t('Durum')}</th><th>${t('İşe başlama')}</th><th>${t('Bitiş')}</th><th>${t('Not')}</th></tr>${S.drivers.map(d => `<tr><td dir="auto">${h(d.name)}</td><td>${h(d.phone)}</td><td>${d.team}</td><td>${d.team === driverTeamAt(date) ? t('Aktif') : t('İstirahatte')}</td><td>${fmt(d.startDate)}</td><td>${d.endDate ? fmt(d.endDate) : '—'}</td><td dir="auto">${h(d.notes)}</td></tr>`).join('')}</table><div class="sec">${t('Yaklaşan şoför değişimleri')}</div><table><tr><th>${t('Tarih')}</th><th>${t('Gün')}</th><th>${t('Göreve gelen ekip')}</th><th>${t('Şoförler')}</th></tr>${changeDatesBetween(S.driver, S.driver.cycleDays, date, addDays(date, 120)).map(d => `<tr><td>${fmt(d)}</td><td>${dayName(d)}</td><td>${t('Ekip')} ${driverTeamAt(d)}</td><td dir="auto">${S.drivers.filter(x => x.team === driverTeamAt(d)).map(x => h(x.name)).join(', ')}</td></tr>`).join('')}</table>`;
  }
  return `<div class="page" dir="${LANG === 'ar' ? 'rtl' : 'ltr'}">${letterheadHtml(o.lhId)}${body}${foot()}</div>`;
}
function printReport(type, o) { $('#printArea').innerHTML = reportHtml(type, o); setTimeout(() => { if (isElectron) window.electronAPI.print(); else window.print(); }, 150); }

// ---------- Excel ----------
async function saveBlob(name, u8) {
  if (isElectron) { let bin = ''; const a = new Uint8Array(u8); for (let i = 0; i < a.length; i += 8192) bin += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); const p = await window.electronAPI.saveFile({ name, dataBase64: btoa(bin), filters: [{ name: 'Excel', extensions: ['xlsx'] }, { name: 'JSON', extensions: ['json'] }] }); if (p) toast(t('Kaydedildi') + ': ' + p); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8])); a.download = name; a.click();
}
function xlsxFromSheets(sheets) { const wb = XLSX.utils.book_new(); sheets.forEach(([n, rows]) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(40, Math.max(8, ...rows.map(r => String(r[i] ?? '').length + 2))) })); if (LANG === 'ar') ws['!views'] = [{ RTL: true }]; XLSX.utils.book_append_sheet(wb, ws, n.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 30)); }); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); }
const personRow = p => [p.seq, p.regNo, p.name, p.nickname, p.title, p.mother, p.group, placeName(p.homeId), placeName(p.workId), lineName(p.lineId), personStatusLabel(p), p.notes];
const PH = () => ['Sıra', 'Sicil', 'Ad Soyad', 'Lakap', 'Unvan', 'Anne adı', 'Grup', 'Ev', 'İşyeri', 'Hat', 'Durum', 'Not'].map(x => t(x));
function exportPersonsExcel(type, o) {
  let list = S.persons.slice().sort((a, b) => (Number(a.seq) || 9999) - (Number(b.seq) || 9999));
  if (type === 'exempt') list = list.filter(p => personExempt(p) || p.active === false);
  if (o && o.lineId) list = list.filter(p => p.lineId === o.lineId);
  const sheets = [];
  if (type === 'groups') S.groups.forEach(g => sheets.push([t('Grup') + ' ' + g.name, [PH(), ...list.filter(p => p.group === g.id).map(personRow)]]));
  else if (type === 'line') S.lines.forEach(L => { if (o && o.lineId && L.id !== o.lineId) return; sheets.push([lname(L), [[t('Durak sırası'), ...PH()], ...L.stops.flatMap((sid, i) => list.filter(p => p.lineId === L.id && p.homeId === sid).map(p => [i + 1, ...personRow(p)]))]]); });
  else sheets.push([t('Kişiler'), [PH(), ...list.map(personRow)]]);
  saveBlob('kisiler-' + todayISO() + '.xlsx', xlsxFromSheets(sheets));
}
function exportPlanExcel(date) {
  const P = planFor(date); const sheets = [];
  P.lines.filter(pl => pl.rows.length).forEach(pl => { const rows = [[t('Durak'), t('Otobüs'), t('Ad Soyad'), t('Lakap'), t('Sicil'), t('Grup'), t('Yön')]]; pl.stopList.forEach(sid => pl.byStop[sid].forEach(r => rows.push([placeName(sid), pl.cfg.buses === 2 ? r.bus : 1, r.p.name, r.p.nickname, r.p.regNo, r.p.group, dirLabel(r)]))); sheets.push([lname(pl.line), rows]); });
  if (!sheets.length) return toast(t('Bu tarihte yolcu yok'), true);
  saveBlob('sefer-plani-' + date + '.xlsx', xlsxFromSheets(sheets));
}
function exportCalendarExcel() {
  const d0 = todayISO(); const dates = new Set(); S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, d0, addDays(d0, 365)).forEach(d => dates.add(d))); changeDatesBetween(S.driver, S.driver.cycleDays, d0, addDays(d0, 365)).forEach(d => dates.add(d));
  const rows = [[t('Tarih'), t('Gün'), ...S.groups.map(g => g.name), t('Şoför ekibi')]]; Array.from(dates).sort().forEach(d => rows.push([fmt(d), dayName(d), ...S.groups.map(g => { const ch = changeDatesBetween(g, S.settings.cycleDays, d, d).length > 0; const st = groupStatusAt(g, d); return ch ? (st === 'work' ? t('İşe gidiş') : t('Eve dönüş')) : (st === 'work' ? t('işte') : t('evde')); }), t('Ekip') + ' ' + driverTeamAt(d)]));
  saveBlob('degisim-takvimi.xlsx', xlsxFromSheets([[t('Takvim'), rows]]));
}
function exportDriversExcel() { saveBlob('soforler.xlsx', xlsxFromSheets([[t('Şoförler'), [[t('Ad Soyad'), t('Telefon'), t('Ekip'), t('İşe başlama'), t('Bitiş'), t('Not')], ...S.drivers.map(d => [d.name, d.phone, d.team, fmt(d.startDate), d.endDate ? fmt(d.endDate) : '', d.notes])]]])); }

async function pickFile(accept) {
  if (isElectron) { const f = await window.electronAPI.openFile({ filters: [{ name: t('Dosya'), extensions: accept.split(',').map(x => x.replace('.', '')) }] }); if (!f) return null; const bin = atob(f.dataBase64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return { name: f.name, data: u8 }; }
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = async () => { const f = i.files[0]; if (!f) return res(null); res({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }); }; i.click(); });
}
const b64 = u8 => { let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(bin); };
async function importPersonsExcel() {
  const f = await pickFile('.xlsx,.xls'); if (!f) return;
  const wb = XLSX.read(f.data, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hdr = rows[0].map(x => String(x).trim());
  const col = (names, idx) => { const i = hdr.findIndex(hh => names.some(n => hh.includes(n))); return i >= 0 ? i : idx; };
  const C = { seq: col(['تسلسل', 'Sıra', 'No'], 0), reg: col(['الرقم', 'Sicil', 'Reg'], 1), title: col(['المسمى', 'Unvan', 'Title'], 2), name: col(['الأسم', 'الاسم', 'Ad Soyad', 'Name'], 3), mother: col(['الأم', 'Anne', 'Mother'], 4), nick: col(['اللقب', 'Lakap', 'Nick'], 5), grp: col(['فئة', 'Grup', 'Group'], 6), home: col(['السكن', 'Ev', 'Home'], 7), line: col(['خط', 'Hat', 'Line'], 8), from: col(['من'], 9), to: col(['الى', 'إلى'], 10), notes: col(['ملاحظات', 'Not'], 11), work: col(['İşyeri', 'Work'], -1) };
  const clean = v => String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const findPlace = (name, type) => { if (!name) return ''; let p = S.places.find(x => x.name === name); if (!p) { p = { id: uid('p'), name, type: type || 'home', exempt: null }; S.places.push(p); } return p.id; };
  let added = 0, updated = 0;
  rows.slice(1).forEach(r => {
    const name = clean(r[C.name]); if (!name) return;
    const grpRaw = clean(r[C.grp]); const grp = /^A/i.test(grpRaw) ? 'A' : /^B/i.test(grpRaw) ? 'B' : grpRaw; const from = clean(r[C.from]), to = clean(r[C.to]);
    const work = C.work >= 0 ? clean(r[C.work]) : (grp.startsWith('A') ? from : grp.startsWith('B') ? to : '');
    const wp = workPlaces().find(w => work && (work.includes(w.name) || w.name.includes(work) || (work.includes('القادسية') && w.name.includes('القادسية')) || (work.includes('حماة') && w.name.includes('حماة'))));
    const reg = clean(r[C.reg]);
    let p = S.persons.find(x => (reg && x.regNo === reg) || x.name === name);
    if (!p) { p = { id: uid('u'), exempt: null, active: true, lineId: '' }; S.persons.push(p); added++; } else updated++;
    if (grp && !groupById(grp)) S.groups.push({ id: grp, name: grp, status: 'home', statusSince: todayISO(), nextChange: '', customDates: [] });
    Object.assign(p, { seq: clean(r[C.seq]) || p.seq, regNo: reg || p.regNo, title: clean(r[C.title]), name, mother: clean(r[C.mother]), nickname: clean(r[C.nick]), group: groupById(grp) ? grp : p.group || '', subgroup: grpRaw !== grp ? grpRaw : '', notes: clean(r[C.notes]) });
    const home = clean(r[C.home]); if (home) p.homeId = findPlace(home, 'home');
    if (wp) p.workId = wp.id;
    const ln = clean(r[C.line]); if (ln) { const L = S.lines.find(x => x.name === ln) || S.lines.find(x => ln.includes('حلب') ? x.name.includes('Halep') : (ln.includes('الشام') || ln.includes('درعا')) ? (wp && wp.name.includes('حماة') ? x.name.includes('Şam') : x.name.includes('Dera')) : (ln.includes('الجسر') || ln.includes('ادلب')) ? (wp && wp.name.includes('حماة') ? x.name.includes('Hama') && x.name.includes('Cisr') : x.name.includes('Kadısiye') && x.name.includes('Cisr')) : false); if (L) { p.lineId = L.id; if (p.homeId && !L.stops.includes(p.homeId)) L.stops.push(p.homeId); } }
  });
  save(); render(); toast(t('İçe aktarıldı: {0} yeni, {1} güncellendi', added, updated));
}

// ---------- Ayarlar ----------
function renderSettings(m) {
  const s = S.settings;
  m.innerHTML = `<h1>${t('Ayarlar')}</h1>
  <div class="grid c2">
  <div>
    <div class="card"><h2>${t('Genel')}</h2><div class="grid c2">
      <label class="f">${t('Kurum / sistem adı')}<input id="s_org" dir="auto" value="${h(s.orgName)}"></label>
      <label class="f">${t('İdareci adı')}<input id="s_admin" dir="auto" value="${h(s.adminName)}"></label>
      <label class="f">${t('İdareci şifresi (boş = şifresiz)')}<input id="s_pin" type="password" value="${h(s.pin)}"></label>
      <label class="f">${t('Dil')}<select id="s_lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === LANG ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <label class="f" style="margin-top:8px">${t('Muaf yer anahtar kelimeleri (virgülle)')}<textarea id="s_ex" rows="2" dir="auto">${h((s.exemptKeywords || []).join(', '))}</textarea></label>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="sSave">${t('Kaydet')}</button></div></div>
    <div class="card"><h2>${t('Antetler')}</h2>
      <p class="small muted">${t('Çıktılarda kullanılacak antet. Varsayılan (favori) antet yıldızla işaretlidir; yazdırırken başka antet de seçilebilir.')}</p>
      ${S.letterheads.map(l => `<div class="drv ${l.id === s.defaultLetterheadId ? 'on' : ''}"><span class="nm">${l.id === s.defaultLetterheadId ? '⭐ ' : ''}${h(l.name)} <span class="small muted">${l.kind === 'image' ? '(' + t('resim') + ')' : '(' + t('şablon') + ')'}</span></span><button class="btn sm" data-lhdef="${l.id}">${t('Favori yap')}</button><button class="btn sm" data-lhedit="${l.id}">${t('Düzenle')}</button>${S.letterheads.length > 1 ? `<button class="btn sm danger" data-lhdel="${l.id}">✕</button>` : ''}</div>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn" id="lhAddImg">+ ${t('Resimden antet ekle')}</button><button class="btn" id="lhAddTxt">+ ${t('Yazılı antet ekle')}</button></div>
      <div class="lh-prev"><div class="print-area" style="display:block">${letterheadHtml(s.defaultLetterheadId).replace('<div class="wm"></div>', '')}</div></div></div>
  </div>
  <div>
    <div class="card"><h2>${t('Güncelleme')}</h2>
      <div class="kv"><b>${t('Uygulama sürümü')}</b><span id="curVer">${APP_VERSION}</span><b>${t('Güncelleme adresi')}</b><span></span></div>
      <input id="s_upd" value="${h(s.updateUrl)}" style="width:100%;margin:6px 0" dir="ltr">
      <label class="chk" style="margin-bottom:6px"><input type="checkbox" id="s_auto" ${s.autoUpdate === false ? '' : 'checked'}> ${t('Otomatik güncelleme (açılışta ve 20 dakikada bir)')}</label>
      <div class="row"><button class="btn primary" id="updCheck">${t('Güncellemeyi kontrol et')}</button><button class="btn" id="updReset">${t('Fabrika sürümüne dön')}</button></div>
      <div id="updMsg" class="small" style="margin-top:8px"></div>
      ${isElectron ? '' : `<p class="small muted">${t('Tarayıcı modunda güncelleme yapılamaz; masaüstü uygulamasını kullanın.')}</p>`}</div>
    <div class="card"><h2>${t('Yedekleme')}</h2>
      <div class="row"><button class="btn" id="bkExp">${t('Yedek al (JSON)')}</button><button class="btn" id="bkImp">${t('Yedekten geri yükle')}</button><button class="btn danger" id="bkReset">${t('Başlangıç verisine dön')}</button></div>
      <p class="small muted" id="dataPath"></p></div>
    <div class="card"><h2>${t('Hakkında')}</h2><p class="small">Merkezi Servis · v${APP_VERSION}<br>${t('Vardiya')}: ${s.cycleDays} ${t('günlük döngü')} · ${t('Şoför')}: ${S.driver.cycleDays} ${t('günlük döngü')}<br>${t('Kişi')}: ${S.persons.length} · ${t('Yer')}: ${S.places.length} · ${t('Hat')}: ${S.lines.length}</p></div>
  </div></div>`;
  $('#sSave').onclick = () => { s.orgName = $('#s_org').value.trim(); s.adminName = $('#s_admin').value.trim(); s.pin = $('#s_pin').value; s.lang = $('#s_lang').value; s.exemptKeywords = $('#s_ex').value.split(',').map(x => x.trim()).filter(Boolean); s.updateUrl = $('#s_upd').value.trim() || DEFAULT_UPDATE_URL; save(); applyLang(s.lang); renderNav(); render(); toast(t('Kaydedildi')); };
  $$('[data-lhdef]', m).forEach(b => b.onclick = () => { s.defaultLetterheadId = b.dataset.lhdef; save(); render(); });
  $$('[data-lhdel]', m).forEach(b => b.onclick = () => confirmDlg(t('Antet silinsin mi?'), () => { S.letterheads = S.letterheads.filter(x => x.id !== b.dataset.lhdel); if (s.defaultLetterheadId === b.dataset.lhdel) s.defaultLetterheadId = S.letterheads[0].id; save(); render(); }));
  $$('[data-lhedit]', m).forEach(b => b.onclick = () => editLetterhead(b.dataset.lhedit));
  $('#lhAddTxt').onclick = () => { const l = { id: uid('lh'), name: t('Yeni antet'), kind: 'builtin', left: '', right: '', logo: 'assets/logo.png', watermark: true, footer: '' }; S.letterheads.push(l); save(); editLetterhead(l.id); };
  $('#lhAddImg').onclick = async () => { const f = await pickFile('.png,.jpg,.jpeg'); if (!f) return; const mime = f.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'; S.letterheads.push({ id: uid('lh'), name: f.name, kind: 'image', imageData: `data:${mime};base64,${b64(f.data)}`, watermark: false }); save(); render(); toast(t('Antet eklendi')); };
  $('#bkExp').onclick = () => saveBlob('merkezi-servis-yedek-' + todayISO() + '.json', new TextEncoder().encode(JSON.stringify(S, null, 1)));
  $('#bkImp').onclick = importBackup;
  $('#bkReset').onclick = () => confirmDlg(t("Tüm veriler silinip Excel'den gelen başlangıç verisi yüklenecek. Devam?"), async () => { const lang = S.settings.lang; S = await loadSeed(emptyState()); S.settings.lang = lang; save(true); mapFitted = false; render(); });
  if (isElectron) { window.electronAPI.dataPath().then(p => { $('#dataPath').textContent = t('Veri dosyası') + ': ' + p; }); window.electronAPI.appInfo().then(i => { $('#curVer').textContent = i.activeVersion + (i.updatedCopy ? ' (' + t('güncellenmiş') + ')' : ''); }); }
  $('#updCheck').onclick = async () => {
    const msg = $('#updMsg'); if (!isElectron) return msg.textContent = t('Sadece masaüstü uygulamasında.');
    msg.textContent = t('Kontrol ediliyor…');
    try {
      const base = await resolveUpdateBase($('#s_upd').value.trim() || DEFAULT_UPDATE_URL); const r = await window.electronAPI.checkUpdate(base);
      updateAvail = r.available ? r.remote : null; renderTopbar(); if (!r.available) return msg.innerHTML = `${t('Güncel.')} (${r.current} / ${r.remote})`;
      msg.innerHTML = `${t('Yeni sürüm bulundu')}: <b>${h(r.remote)}</b> (${t('mevcut')} ${h(r.current)})<br>${h(r.notes)}<br><button class="btn primary sm" id="updGo">${t('Şimdi güncelle')}</button>`;
      $('#updGo').onclick = async () => { msg.textContent = t('İndiriliyor…'); try { const a = await window.electronAPI.applyUpdate(base); msg.textContent = t('Sürüm {0} yüklendi, uygulama yeniden başlatılıyor…', a.version); save(true); setTimeout(() => window.electronAPI.relaunch(), 800); } catch (e) { msg.textContent = t('Güncelleme hatası') + ': ' + e.message; } };
    } catch (e) { msg.textContent = t('Kontrol edilemedi') + ': ' + (e.message || e); }
  };
  $('#s_auto').onchange = e => { s.autoUpdate = e.target.checked; save(); renderTopbar(); };
  $('#updReset').onclick = async () => { if (!isElectron) return; await window.electronAPI.resetUpdate(); toast(t('Fabrika sürümüne dönüldü, yeniden başlatılıyor')); setTimeout(() => window.electronAPI.relaunch(), 600); };
}
function editLetterhead(id) {
  const l = S.letterheads.find(x => x.id === id);
  modal(`<h2>${t('Antet düzenle')}</h2><div class="grid c2"><label class="f">${t('Antet adı')}<input id="lh_name" value="${h(l.name)}"></label>
  <label class="chk" style="margin-top:16px"><input type="checkbox" id="lh_wm" ${l.watermark ? 'checked' : ''}> ${t('Arka plan filigranı (desen)')}</label>
  ${l.kind === 'builtin' ? `<label class="f">${t('Sol metin (satır satır)')}<textarea id="lh_left" rows="4">${h(l.left)}</textarea></label><label class="f">${t('Sağ metin (Arapça, satır satır)')}<textarea id="lh_right" rows="4" dir="rtl">${h(l.right)}</textarea></label><label class="f">${t('Alt bilgi')}<input id="lh_foot" dir="auto" value="${h(l.footer || '')}"></label>` : ''}</div>
  ${l.kind === 'builtin' ? `<div class="row" style="margin-top:8px"><button class="btn" id="lh_logo">${t('Logo değiştir (PNG/JPG)')}</button></div>` : ''}
  <div class="actions">${cancelBtn()}<button class="btn primary" id="lh_save">${t('Kaydet')}</button></div>`, (r, close) => {
    $('#lh_save', r).onclick = () => { l.name = $('#lh_name', r).value.trim() || l.name; l.watermark = $('#lh_wm', r).checked; if (l.kind === 'builtin') { l.left = $('#lh_left', r).value; l.right = $('#lh_right', r).value; l.footer = $('#lh_foot', r).value; } save(); close(); render(); };
    const lg = $('#lh_logo', r); if (lg) lg.onclick = async () => { const f = await pickFile('.png,.jpg,.jpeg'); if (!f) return; l.logo = `data:${f.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${b64(f.data)}`; toast(t('Logo değiştirildi')); };
  });
}

// ---------------- başlangıç ----------------
(async function init() {
  S = await loadState();
  applyLang(S.settings.lang || 'tr');
  renderNav();
  $('#langSel').onchange = e => { S.settings.lang = e.target.value; save(); applyLang(S.settings.lang); renderNav(); render(); };
  const start = () => { $('#lock').classList.add('hidden'); render(); if (isElectron) window.electronAPI.appInfo().then(i => { currentVer = i.activeVersion; }).catch(() => { }); setTimeout(() => autoUpdate(false), 1500); setInterval(() => autoUpdate(false), 20 * 60 * 1000); window.addEventListener('online', () => autoUpdate(false)); if (navigator.onLine !== false) autoRouteAll(false).then(r => { if (r.ok && (page === 'dash' || page === 'mainlines')) render(); }); if (S.firstRun) { delete S.firstRun; save(true); toast(t("Excel'den gelen başlangıç verisi yüklendi")); } };
  if (S.settings.pin) {
    $('#lock').classList.remove('hidden'); $('#lockTitle').textContent = t('İdareci şifresi'); $('#lockBtn').textContent = t('Giriş');
    const tryPin = () => { if ($('#lockPin').value === S.settings.pin) start(); else $('#lockErr').textContent = t('Hatalı şifre'); };
    $('#lockBtn').onclick = tryPin; $('#lockPin').onkeydown = e => { if (e.key === 'Enter') tryPin(); }; $('#lockPin').focus();
  } else start();
})();
