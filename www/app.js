/* Merkezi Servis – uygulama mantığı (tarayıcı + Electron) */
'use strict';
const APP_VERSION = '1.0.0';
const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/departures-mil/merkezi-servis/main/';
const EXEMPT_DEFAULT = ['حلب', 'جرابلس', 'دركوش', 'تل رفعت', 'سرمدا', 'حارم', 'جنديرس', 'Halep', 'Cerablus', 'Derkuş', 'Tel Rıfat', 'Sermede', 'Harim', 'Cinderes'];
const GROUPS_DEFAULT = ['A', 'A1', 'B', 'B1'];
const isElectron = !!window.electronAPI;

// ---------------- yardımcılar ----------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (p || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const toISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseISO = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const fmt = iso => iso ? iso.split('-').reverse().join('.') : '—';
const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const dayName = iso => DAYS_TR[parseISO(iso).getDay()];
const sortTR = (a, b) => String(a).localeCompare(String(b), 'tr');
let toastT;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2800); }

// ---------------- durum (state) ----------------
let S = null;
function emptyState() {
  return {
    schemaVersion: 1, savedAt: 0,
    settings: {
      orgName: 'Merkezi Servis Hizmeti', adminName: 'İdareci', pin: '',
      cycleDays: 10, exemptKeywords: EXEMPT_DEFAULT.slice(),
      updateUrl: DEFAULT_UPDATE_URL, defaultLetterheadId: 'lh-default'
    },
    groups: GROUPS_DEFAULT.map(g => ({ id: g, name: g, status: g.startsWith('A') ? 'work' : 'home', statusSince: todayISO(), nextChange: '', customDates: [] })),
    driver: { cycleDays: 10, activeTeam: 1, statusSince: todayISO(), nextChange: '', customDates: [] },
    places: [], lines: [], persons: [], drivers: [
      { id: 'd1', name: 'Şoför 1', phone: '', team: 1, startDate: '', endDate: '', notes: '' },
      { id: 'd2', name: 'Şoför 2', phone: '', team: 1, startDate: '', endDate: '', notes: '' },
      { id: 'd3', name: 'Şoför 3', phone: '', team: 2, startDate: '', endDate: '', notes: '' },
      { id: 'd4', name: 'Şoför 4', phone: '', team: 2, startDate: '', endDate: '', notes: '' }
    ],
    letterheads: [{ id: 'lh-default', name: 'Varsayılan antet (Şablon)', kind: 'builtin', left: 'Ministry of Defense\nUAV Administration\nFixed Wing Division', right: 'وزارة الدفاع السورية\nإدارة المسيرات\nفرع المجنح', logo: 'assets/logo.png', watermark: true, footer: 'نسخة إلى: ديوان الفرع' }],
    plans: {}
  };
}
async function loadSeed(st) {
  try {
    const r = await fetch('seed.json'); const seed = await r.json();
    st.places = seed.places; st.lines = seed.lines; st.persons = seed.persons;
  } catch (e) { console.warn('seed yüklenemedi', e); }
  return st;
}
const LS_KEY = 'merkezi-servis-state';
async function loadState() {
  let local = null, disk = null;
  try { local = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { }
  if (isElectron) { try { const t = await window.electronAPI.loadData(); if (t) disk = JSON.parse(t); } catch (e) { } }
  let st = null;
  if (local && disk) st = (disk.savedAt || 0) >= (local.savedAt || 0) ? disk : local; else st = disk || local;
  if (!st) { st = await loadSeed(emptyState()); st.firstRun = true; }
  // eksik alanları tamamla
  const e = emptyState();
  st.settings = Object.assign(e.settings, st.settings || {});
  st.groups = st.groups && st.groups.length ? st.groups : e.groups;
  st.driver = Object.assign(e.driver, st.driver || {});
  st.drivers = st.drivers || e.drivers; st.letterheads = st.letterheads && st.letterheads.length ? st.letterheads : e.letterheads;
  st.plans = st.plans || {}; st.places = st.places || []; st.lines = st.lines || []; st.persons = st.persons || [];
  return st;
}
let saveT;
function save(immediate) {
  S.savedAt = Date.now();
  const json = JSON.stringify(S);
  try { localStorage.setItem(LS_KEY, json); } catch (e) { }
  $('#saveInfo').textContent = 'Kaydediliyor…';
  clearTimeout(saveT);
  const doDisk = async () => { if (isElectron) await window.electronAPI.saveData(json); $('#saveInfo').textContent = 'Kaydedildi ' + new Date().toLocaleTimeString('tr'); };
  if (immediate) doDisk(); else saveT = setTimeout(doDisk, 400);
}

// ---------------- alan erişimcileri ----------------
const placeById = id => S.places.find(p => p.id === id);
const placeName = id => (placeById(id) || {}).name || '—';
const lineById = id => S.lines.find(l => l.id === id);
const lineName = id => (lineById(id) || {}).name || '—';
const groupById = id => S.groups.find(g => g.id === id);
const workPlaces = () => S.places.filter(p => p.type === 'work');
const homePlaces = () => S.places.filter(p => p.type !== 'work');
function placeIsExemptByKeyword(name) { return (S.settings.exemptKeywords || []).some(k => k && name.includes(k)); }
function placeExempt(p) { return p.exempt === true || (p.exempt == null && placeIsExemptByKeyword(p.name)); }
function personExempt(p) {
  if (p.exempt === true) return true; if (p.exempt === false) return false;
  const pl = placeById(p.homeId); return !!(pl && placeExempt(pl));
}
const personInService = p => p.active !== false && !personExempt(p);

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
  let n;
  if (dateISO >= R) n = changeDatesBetween(cfg, cycleDays, addDays(R, 1), dateISO).length;
  else n = changeDatesBetween(cfg, cycleDays, addDays(dateISO, 1), R).length;
  const flip = s => s === 'work' ? 'home' : 'work';
  return n % 2 === 0 ? curStatus : flip(curStatus);
}
const groupStatusAt = (g, d) => statusAt(g, S.settings.cycleDays, d, g.status);
function groupNextChange(g, from) { const l = changeDatesBetween(g, S.settings.cycleDays, from || todayISO(), addDays(from || todayISO(), 400)); return l[0] || ''; }
const groupPrevStatus = (g, d) => groupStatusAt(g, addDays(d, -1));
function driverTeamAt(d) { const st = statusAt(S.driver, S.driver.cycleDays, d, S.driver.activeTeam === 1 ? 'work' : 'home'); return st === 'work' ? 1 : 2; }
function driverNextChange(from) { const l = changeDatesBetween(S.driver, S.driver.cycleDays, from || todayISO(), addDays(from || todayISO(), 400)); return l[0] || ''; }
function changesOn(dateISO) { return S.groups.filter(g => changeDatesBetween(g, S.settings.cycleDays, dateISO, dateISO).length > 0); }
function upcomingChangeDates(n) {
  const set = new Set(); const t = todayISO();
  S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, t, addDays(t, 400)).forEach(d => set.add(d)));
  return Array.from(set).sort().slice(0, n || 12);
}

// ---------------- sefer planı ----------------
function planFor(dateISO) {
  const groups = changesOn(dateISO);
  const gids = new Set(groups.map(g => g.id));
  const result = { date: dateISO, groups, lines: [] };
  S.lines.forEach(L => {
    const stopsOrder = L.stops.slice();
    const cfg = (S.plans[dateISO] || {})[L.id] || { buses: 1, firstStopBus1: '' };
    const persons = S.persons.filter(p => p.lineId === L.id && gids.has(p.group) && personInService(p));
    const idx = s => { const i = stopsOrder.indexOf(s); return i < 0 ? 999 : i; };
    const splitIdx = cfg.buses === 2 && cfg.firstStopBus1 ? idx(cfg.firstStopBus1) : -1;
    const busOf = stopId => { if (cfg.buses !== 2) return 1; const i = idx(stopId); if (i === 999) return 2; return i >= splitIdx ? 1 : 2; };
    const rows = persons.map(p => {
      const g = groupById(p.group); const prev = g ? groupPrevStatus(g, dateISO) : 'work';
      return { p, dir: prev === 'work' ? 'toHome' : 'toWork', stopId: p.homeId, bus: busOf(p.homeId) };
    });
    const byStop = {};
    rows.forEach(r => { (byStop[r.stopId] = byStop[r.stopId] || []).push(r); });
    const stopList = stopsOrder.filter(s => byStop[s]).concat(Object.keys(byStop).filter(s => !stopsOrder.includes(s)));
    result.lines.push({ line: L, cfg, rows, byStop, stopList, toHome: rows.filter(r => r.dir === 'toHome').length, toWork: rows.filter(r => r.dir === 'toWork').length });
  });
  return result;
}

// ---------------- router ----------------
let page = 'dash';
function go(p) { page = p; $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === p)); render(); $('#main').scrollTop = 0; }
function render() {
  const m = $('#main');
  const fn = { dash: renderDash, persons: renderPersons, lines: renderLines, places: renderPlaces, shifts: renderShifts, drivers: renderDrivers, plan: renderPlan, reports: renderReports, settings: renderSettings }[page];
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
  modal(`<h2>Onay</h2><p>${h(msg)}</p><div class="actions"><button class="btn" data-close>Vazgeç</button><button class="btn danger" id="okBtn">Evet</button></div>`, (r, close) => { $('#okBtn', r).onclick = () => { close(); cb(); }; });
}
const opt = (list, val, label = x => x.name, value = x => x.id, empty) => (empty ? `<option value="">${h(empty)}</option>` : '') + list.map(x => `<option value="${h(value(x))}" ${value(x) === val ? 'selected' : ''}>${h(label(x))}</option>`).join('');

// ================= SAYFALAR =================
function renderDash(m) {
  const t = todayISO();
  const inService = S.persons.filter(personInService);
  const exempt = S.persons.filter(p => p.active !== false && personExempt(p));
  const inactive = S.persons.filter(p => p.active === false);
  const team = driverTeamAt(t);
  const nextDates = upcomingChangeDates(6);
  m.innerHTML = `
  <h1>Genel Durum <span class="muted small">— ${fmt(t)} ${dayName(t)}</span></h1>
  <div class="grid c4">
    <div class="card stat"><div class="v">${inService.length}</div><div class="l">Serviste olan kişi</div></div>
    <div class="card stat"><div class="v">${exempt.length}</div><div class="l">Muaf (servis dışı)</div></div>
    <div class="card stat"><div class="v">${inactive.length}</div><div class="l">Sistemden çıkarılmış</div></div>
    <div class="card stat"><div class="v">${S.lines.length}</div><div class="l">Hat</div></div>
  </div>
  <div class="grid c2">
    <div class="card"><h2>Gruplar – bugün</h2>
      <table><tr><th>Grup</th><th>Durum</th><th>Kişi</th><th>Sonraki değişim</th><th>Kalan</th></tr>
      ${S.groups.map(g => { const st = groupStatusAt(g, t); const nx = groupNextChange(g); const cnt = inService.filter(p => p.group === g.id).length; return `<tr><td><b>${h(g.name)}</b></td><td>${st === 'work' ? '<span class="badge ok">İşte (fabrikada)</span>' : '<span class="badge gray">Evde</span>'}</td><td>${cnt}</td><td>${nx ? fmt(nx) + ' ' + dayName(nx) : '<span class="badge warn">tarih girilmedi</span>'}</td><td>${nx ? diffDays(t, nx) + ' gün' : ''}</td></tr>`; }).join('')}
      </table>
      <p class="small muted">Değişim tarihlerini <a href="#" data-go="shifts">Vardiya &amp; Değişim</a> sayfasından girin.</p>
    </div>
    <div class="card"><h2>Şoförler – bugün</h2>
      ${S.drivers.map(d => `<div class="drv ${d.team === team ? 'on' : 'off'}"><span class="nm" dir="auto">${h(d.name)}</span><span class="badge ${d.team === team ? 'ok' : 'gray'}">${d.team === team ? 'Aktif (nöbette)' : 'İstirahatte'}</span><span class="small muted">Ekip ${d.team}</span></div>`).join('')}
      <div class="small muted">Sonraki şoför değişimi: <b>${driverNextChange() ? fmt(driverNextChange()) : 'tarih girilmedi'}</b></div>
    </div>
  </div>
  <div class="grid c2">
    <div class="card"><h2>Yaklaşan değişim günleri</h2>
      ${nextDates.length ? `<div class="timeline">${nextDates.map(d => `<div class="tl ${d === t ? 'today' : ''}"><b>${fmt(d)}</b>${dayName(d)}<br><span class="muted">${changesOn(d).map(g => g.name).join(', ')}</span></div>`).join('')}</div>` : '<p class="muted">Henüz değişim tarihi girilmedi.</p>'}
      <p><button class="btn primary" data-go="plan">Sefer planını aç</button></p>
    </div>
    <div class="card"><h2>Hatlar</h2>
      <table><tr><th>Hat</th><th>Durak</th><th>Kişi (serviste)</th><th>İşte / Evde</th></tr>
      ${S.lines.map(L => { const ps = inService.filter(p => p.lineId === L.id); const w = ps.filter(p => { const g = groupById(p.group); return g && groupStatusAt(g, t) === 'work'; }).length; return `<tr><td>${h(L.name)}</td><td>${L.stops.length}</td><td>${ps.length}</td><td>${w} / ${ps.length - w}</td></tr>`; }).join('')}
      </table>
    </div>
  </div>`;
  $$('[data-go]', m).forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
}

// ---------- Kişiler ----------
let pf = { q: '', group: '', line: '', status: '', work: '' };
function renderPersons(m) {
  m.innerHTML = `<h1>Kişiler</h1>
  <div class="toolbar">
    <input type="search" id="pq" placeholder="Ad, lakap, sicil, yer ara…" value="${h(pf.q)}">
    <select id="pg"><option value="">Tüm gruplar</option>${S.groups.map(g => `<option ${pf.group === g.id ? 'selected' : ''}>${h(g.id)}</option>`).join('')}<option value="-" ${pf.group === '-' ? 'selected' : ''}>Grupsuz</option></select>
    <select id="pl">${opt(S.lines, pf.line, x => x.name, x => x.id, 'Tüm hatlar')}</select>
    <select id="pw">${opt(workPlaces(), pf.work, x => x.name, x => x.id, 'Tüm işyerleri')}</select>
    <select id="ps"><option value="">Tüm durumlar</option><option value="service" ${pf.status === 'service' ? 'selected' : ''}>Serviste</option><option value="exempt" ${pf.status === 'exempt' ? 'selected' : ''}>Muaf</option><option value="inactive" ${pf.status === 'inactive' ? 'selected' : ''}>Sistemden çıkarılmış</option></select>
    <span style="flex:1"></span>
    <button class="btn" id="pImport">Excel'den al</button>
    <button class="btn" id="pExport">Excel'e ver</button>
    <button class="btn primary" id="pAdd">+ Kişi ekle</button>
  </div>
  <div class="card tight"><div class="tbl-wrap"><table id="ptbl"></table></div></div>`;
  const draw = () => {
    const q = pf.q.trim().toLowerCase();
    let list = S.persons.filter(p => {
      if (pf.group && pf.group !== '-' && p.group !== pf.group) return false;
      if (pf.group === '-' && p.group) return false;
      if (pf.line && p.lineId !== pf.line) return false;
      if (pf.work && p.workId !== pf.work) return false;
      const ex = personExempt(p), ia = p.active === false;
      if (pf.status === 'service' && (ex || ia)) return false;
      if (pf.status === 'exempt' && (!ex || ia)) return false;
      if (pf.status === 'inactive' && !ia) return false;
      if (q) { const s = [p.name, p.nickname, p.regNo, p.title, placeName(p.homeId), p.mother].join(' ').toLowerCase(); if (!s.includes(q)) return false; }
      return true;
    });
    list.sort((a, b) => (Number(a.seq) || 9999) - (Number(b.seq) || 9999));
    const t = todayISO();
    $('#ptbl').innerHTML = `<tr><th>#</th><th>Sicil</th><th>Ad Soyad</th><th>Lakap</th><th>Unvan</th><th>Grup</th><th>Bugün</th><th>Ev (durak)</th><th>İşyeri</th><th>Hat</th><th>Durum</th><th></th></tr>` +
      list.map(p => {
        const g = groupById(p.group); const st = g ? groupStatusAt(g, t) : '';
        const ex = personExempt(p), ia = p.active === false;
        const status = ia ? '<span class="badge bad">Çıkarıldı</span>' : ex ? `<span class="badge warn">Muaf${p.exempt === true ? ' (kişi)' : ''}</span>` : '<span class="badge ok">Serviste</span>';
        return `<tr data-id="${p.id}"><td class="num">${h(p.seq)}</td><td>${h(p.regNo)}</td><td dir="auto"><b>${h(p.name)}</b></td><td dir="auto">${h(p.nickname)}</td><td dir="auto">${h(p.title)}</td><td>${h(p.group) || '—'}</td><td>${st ? (st === 'work' ? '<span class="badge ok">İşte</span>' : '<span class="badge gray">Evde</span>') : ''}</td><td dir="auto">${h(placeName(p.homeId))}</td><td dir="auto">${h(placeName(p.workId))}</td><td>${h(lineName(p.lineId))}</td><td>${status}</td><td><button class="btn sm" data-edit="${p.id}">Düzenle</button></td></tr>`;
      }).join('') + (list.length ? '' : '<tr><td colspan="12" class="muted">Kayıt yok</td></tr>');
    $$('[data-edit]', m).forEach(b => b.onclick = () => editPerson(b.dataset.edit));
  };
  draw();
  $('#pq').oninput = e => { pf.q = e.target.value; draw(); };
  $('#pg').onchange = e => { pf.group = e.target.value; draw(); };
  $('#pl').onchange = e => { pf.line = e.target.value; draw(); };
  $('#pw').onchange = e => { pf.work = e.target.value; draw(); };
  $('#ps').onchange = e => { pf.status = e.target.value; draw(); };
  $('#pAdd').onclick = () => editPerson(null);
  $('#pExport').onclick = () => exportPersonsExcel();
  $('#pImport').onclick = () => importPersonsExcel();
}
function editPerson(id) {
  const p = id ? S.persons.find(x => x.id === id) : { id: uid('u'), seq: (Math.max(0, ...S.persons.map(x => Number(x.seq) || 0)) + 1), regNo: '', title: '', name: '', mother: '', nickname: '', group: '', homeId: '', workId: '', lineId: '', exempt: null, active: true, notes: '' };
  modal(`<h2>${id ? 'Kişiyi düzenle' : 'Yeni kişi'}</h2>
  <div class="grid c3">
    <label class="f">Sıra no<input id="f_seq" value="${h(p.seq)}"></label>
    <label class="f">Sicil no<input id="f_reg" value="${h(p.regNo)}"></label>
    <label class="f">Grup<select id="f_grp"><option value="">— Grupsuz —</option>${S.groups.map(g => `<option ${p.group === g.id ? 'selected' : ''}>${h(g.id)}</option>`).join('')}</select></label>
  </div>
  <div class="grid c2">
    <label class="f">Ad Soyad<input id="f_name" dir="auto" value="${h(p.name)}"></label>
    <label class="f">Lakap<input id="f_nick" dir="auto" value="${h(p.nickname)}"></label>
    <label class="f">Unvan<input id="f_title" dir="auto" value="${h(p.title)}"></label>
    <label class="f">Anne adı<input id="f_mother" dir="auto" value="${h(p.mother)}"></label>
    <label class="f">İşyeri<select id="f_work">${opt(workPlaces(), p.workId, x => x.name, x => x.id, '— seçiniz —')}</select></label>
    <label class="f">Hat<select id="f_line">${opt(S.lines, p.lineId, x => x.name, x => x.id, '— seçiniz —')}</select></label>
    <label class="f">Ev (oturduğu yer / durak)<select id="f_home">${opt(homePlaces().slice().sort((a, b) => sortTR(a.name, b.name)), p.homeId, x => x.name + (placeExempt(x) ? '  (muaf yer)' : ''), x => x.id, '— seçiniz —')}</select></label>
    <label class="f">Muafiyet<select id="f_ex"><option value="" ${p.exempt == null ? 'selected' : ''}>Yere göre (otomatik)</option><option value="1" ${p.exempt === true ? 'selected' : ''}>Muaf (servis dışı)</option><option value="0" ${p.exempt === false ? 'selected' : ''}>Muaf değil (servise dahil)</option></select></label>
  </div>
  <label class="f">Not<textarea id="f_notes" rows="2" dir="auto">${h(p.notes)}</textarea></label>
  <label class="chk" style="margin-top:8px"><input type="checkbox" id="f_active" ${p.active !== false ? 'checked' : ''}> Sistemde aktif (işareti kaldırırsanız kişi sistemden çıkarılır, kaydı kalır)</label>
  <div class="actions">${id ? '<button class="btn danger" id="f_del">Kaydı sil</button>' : ''}<span style="flex:1"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="f_save">Kaydet</button></div>`,
    (r, close) => {
      $('#f_save', r).onclick = () => {
        const name = $('#f_name', r).value.trim(); if (!name) return toast('Ad gerekli', true);
        Object.assign(p, { seq: $('#f_seq', r).value.trim(), regNo: $('#f_reg', r).value.trim(), group: $('#f_grp', r).value, name, nickname: $('#f_nick', r).value.trim(), title: $('#f_title', r).value.trim(), mother: $('#f_mother', r).value.trim(), workId: $('#f_work', r).value, lineId: $('#f_line', r).value, homeId: $('#f_home', r).value, notes: $('#f_notes', r).value.trim(), active: $('#f_active', r).checked });
        const ex = $('#f_ex', r).value; p.exempt = ex === '' ? null : ex === '1';
        if (!id) S.persons.push(p);
        // ev yeri hattın duraklarında yoksa ekle
        const L = lineById(p.lineId); if (L && p.homeId && !L.stops.includes(p.homeId)) L.stops.push(p.homeId);
        save(); close(); render(); toast('Kaydedildi');
      };
      if (id) $('#f_del', r).onclick = () => confirmDlg('Bu kişi kalıcı olarak silinsin mi?', () => { S.persons = S.persons.filter(x => x.id !== id); save(); close(); render(); });
    });
}

// ---------- Yerler ----------
function renderPlaces(m) {
  const list = S.places.slice().sort((a, b) => (a.type === 'work' ? 0 : 1) - (b.type === 'work' ? 0 : 1) || sortTR(a.name, b.name));
  m.innerHTML = `<h1>Yerleşim Yerleri</h1>
  <p class="muted">İşyerleri: <b>${workPlaces().map(p => h(p.name)).join(', ')}</b>. Geri kalan yerler evdir. Muaf yerler (ör. Halep, Cerablus, Derkuş, Tel Rıfat, Sermede, Harim, Cinderes) sistemden ayrıdır; buradaki kişiler servise dahil edilmez (kişi bazında aktif edilebilir).</p>
  <div class="toolbar"><input type="search" id="plq" placeholder="Yer ara…"><span style="flex:1"></span><button class="btn primary" id="plAdd">+ Yer ekle</button></div>
  <div class="card tight"><div class="tbl-wrap"><table id="pltbl"></table></div></div>`;
  const draw = () => {
    const q = ($('#plq').value || '').toLowerCase();
    $('#pltbl').innerHTML = `<tr><th>Yer</th><th>Tür</th><th>Muafiyet</th><th>Kişi</th><th>Hatlar</th><th></th></tr>` + list.filter(p => p.name.toLowerCase().includes(q)).map(p => {
      const cnt = S.persons.filter(x => x.homeId === p.id || x.workId === p.id).length;
      const ls = S.lines.filter(L => L.stops.includes(p.id) || L.endA === p.id).map(L => L.name).join(', ');
      const ex = p.type === 'work' ? '' : placeExempt(p) ? `<span class="badge warn">Muaf${p.exempt == null ? ' (otomatik)' : ''}</span>` : p.exempt === false ? '<span class="badge ok">Dahil (zorla)</span>' : '<span class="badge ok">Dahil</span>';
      return `<tr><td dir="auto"><b>${h(p.name)}</b></td><td>${p.type === 'work' ? '<span class="badge info">İşyeri</span>' : 'Ev'}</td><td>${ex}</td><td>${cnt}</td><td>${h(ls)}</td><td><button class="btn sm" data-e="${p.id}">Düzenle</button></td></tr>`;
    }).join('');
    $$('[data-e]', m).forEach(b => b.onclick = () => editPlace(b.dataset.e));
  };
  draw(); $('#plq').oninput = draw; $('#plAdd').onclick = () => editPlace(null);
}
function editPlace(id) {
  const p = id ? placeById(id) : { id: uid('p'), name: '', type: 'home', exempt: null };
  modal(`<h2>${id ? 'Yeri düzenle' : 'Yeni yer'}</h2>
  <div class="grid c2">
    <label class="f">Yer adı<input id="g_name" dir="auto" value="${h(p.name)}"></label>
    <label class="f">Tür<select id="g_type"><option value="home" ${p.type !== 'work' ? 'selected' : ''}>Ev (yerleşim)</option><option value="work" ${p.type === 'work' ? 'selected' : ''}>İşyeri</option></select></label>
    <label class="f">Muafiyet<select id="g_ex"><option value="" ${p.exempt == null ? 'selected' : ''}>Otomatik (anahtar kelimeye göre)</option><option value="1" ${p.exempt === true ? 'selected' : ''}>Muaf (sistem dışı)</option><option value="0" ${p.exempt === false ? 'selected' : ''}>Dahil</option></select></label>
  </div>
  <div class="actions">${id ? '<button class="btn danger" id="g_del">Sil</button>' : ''}<span style="flex:1"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="g_save">Kaydet</button></div>`, (r, close) => {
    $('#g_save', r).onclick = () => {
      const name = $('#g_name', r).value.trim(); if (!name) return toast('Ad gerekli', true);
      p.name = name; p.type = $('#g_type', r).value; const ex = $('#g_ex', r).value; p.exempt = ex === '' ? null : ex === '1';
      if (!id) S.places.push(p); save(); close(); render();
    };
    if (id) $('#g_del', r).onclick = () => {
      const used = S.persons.some(x => x.homeId === id || x.workId === id);
      if (used) return toast('Bu yerde kayıtlı kişiler var; önce onları taşıyın.', true);
      confirmDlg('Yer silinsin mi?', () => { S.places = S.places.filter(x => x.id !== id); S.lines.forEach(L => { L.stops = L.stops.filter(s => s !== id); }); save(); close(); render(); });
    };
  });
}

// ---------- Hatlar ----------
let selLine = '';
function renderLines(m) {
  if (!selLine && S.lines[0]) selLine = S.lines[0].id;
  const L = lineById(selLine);
  m.innerHTML = `<h1>Hatlar &amp; Duraklar</h1>
  <div class="toolbar"><select id="lsel">${opt(S.lines, selLine)}</select>
    <button class="btn" id="lEdit" ${L ? '' : 'disabled'}>Hattı düzenle</button>
    <button class="btn primary" id="lAdd">+ Yeni hat</button></div>
  ${L ? lineDetail(L) : '<p class="muted">Hat yok.</p>'}`;
  $('#lsel').onchange = e => { selLine = e.target.value; render(); };
  $('#lAdd').onclick = () => editLine(null); $('#lEdit').onclick = () => editLine(L.id);
  if (!L) return;
  $$('[data-up]', m).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [L.stops[i - 1], L.stops[i]] = [L.stops[i], L.stops[i - 1]]; save(); render(); } });
  $$('[data-down]', m).forEach(b => b.onclick = () => { const i = +b.dataset.down; if (i < L.stops.length - 1) { [L.stops[i + 1], L.stops[i]] = [L.stops[i], L.stops[i + 1]]; save(); render(); } });
  $$('[data-rm]', m).forEach(b => b.onclick = () => { const sid = b.dataset.rm; const n = S.persons.filter(p => p.lineId === L.id && p.homeId === sid).length; if (n) return toast('Bu durakta ' + n + ' kişi var; önce kişileri başka durağa/hatta alın.', true); L.stops = L.stops.filter(s => s !== sid); save(); render(); });
  $$('[data-addp]', m).forEach(b => b.onclick = () => addPersonToStop(L, b.dataset.addp));
  $$('[data-rmp]', m).forEach(b => b.onclick = () => { const p = S.persons.find(x => x.id === b.dataset.rmp); p.lineId = ''; save(); render(); toast(p.name + ' hattan çıkarıldı'); });
  $('#stopAdd').onclick = () => { const v = $('#stopSel').value; if (!v) return; if (!L.stops.includes(v)) L.stops.push(v); save(); render(); };
  $('#stopNew').onclick = () => { modal(`<h2>Yeni durak (yer)</h2><label class="f">Yer adı<input id="ns" dir="auto"></label><div class="actions"><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="nsOk">Ekle</button></div>`, (r, close) => { $('#nsOk', r).onclick = () => { const n = $('#ns', r).value.trim(); if (!n) return; const p = { id: uid('p'), name: n, type: 'home', exempt: null }; S.places.push(p); L.stops.push(p.id); save(); close(); render(); }; }); };
}
function lineDetail(L) {
  const t = todayISO();
  const persons = S.persons.filter(p => p.lineId === L.id);
  const unplaced = persons.filter(p => !L.stops.includes(p.homeId));
  const row = (p) => { const ex = personExempt(p) || p.active === false; const g = groupById(p.group); const st = g ? groupStatusAt(g, t) : ''; return `<span class="pill" style="${ex ? 'opacity:.55' : ''}" title="${h(p.title)}"><span dir="auto">${h(p.name)}</span> <span class="muted">${h(p.group)}${st ? (st === 'work' ? ' · işte' : ' · evde') : ''}${ex ? ' · muaf/pasif' : ''}</span><button data-rmp="${p.id}" title="Hattan çıkar">✕</button></span>`; };
  return `<div class="grid c2">
  <div>
    <div class="card"><div class="row between"><h2>${h(L.name)}</h2><span class="muted small">${persons.filter(personInService).length} kişi serviste / ${persons.length} kayıtlı</span></div>
    <div class="small muted">Başlangıç (işyeri): <b dir="auto">${h(placeName(L.endA))}</b> → duraklar işyerinden uzaklaşma sırasına göre. Sıra, sefer planında ve ekspres otobüs bölmesinde kullanılır.</div></div>
    <div class="stop work"><span class="n">🏭</span><span class="name" dir="auto">${h(placeName(L.endA))}</span><span class="cnt">işyeri</span></div>
    ${L.stops.map((sid, i) => { const pl = placeById(sid); const ps = persons.filter(p => p.homeId === sid); return `<div class="stop ${pl && placeExempt(pl) ? 'exempt' : ''}"><span class="n">${i + 1}</span><div class="name"><div dir="auto"><b>${h(placeName(sid))}</b> ${pl && placeExempt(pl) ? '<span class="badge warn">muaf yer</span>' : ''}</div><div class="pill-list" style="margin-top:4px">${ps.map(row).join('')}<button class="btn sm" data-addp="${sid}">+ kişi</button></div></div><span class="cnt">${ps.filter(personInService).length}</span><button class="btn sm" data-up="${i}">▲</button><button class="btn sm" data-down="${i}">▼</button><button class="btn sm danger" data-rm="${sid}">✕</button></div>`; }).join('')}
    <div class="row" style="margin-top:8px"><select id="stopSel">${opt(homePlaces().filter(p => !L.stops.includes(p.id)).sort((a, b) => sortTR(a.name, b.name)), '', x => x.name, x => x.id, '— mevcut yerden durak ekle —')}</select><button class="btn" id="stopAdd">Durak ekle</button><button class="btn" id="stopNew">+ Yeni yer oluştur</button></div>
  </div>
  <div>
    ${unplaced.length ? `<div class="card"><h3>Durağı hatta tanımlı olmayan kişiler</h3><div class="pill-list">${unplaced.map(row).join('')}</div><p class="small muted">Bu kişilerin ev yerini hattın duraklarına ekleyin (yukarıdan "Durak ekle").</p></div>` : ''}
    <div class="card"><h3>Hat özeti</h3><div class="kv">
      <b>Durak</b><span>${L.stops.length}</span>
      <b>İşte olanlar</b><span>${persons.filter(p => personInService(p) && (groupById(p.group) ? groupStatusAt(groupById(p.group), t) : '') === 'work').length}</span>
      <b>Evde olanlar</b><span>${persons.filter(p => personInService(p) && (groupById(p.group) ? groupStatusAt(groupById(p.group), t) : '') === 'home').length}</span>
      <b>Muaf / pasif</b><span>${persons.filter(p => !personInService(p)).length}</span></div></div>
  </div></div>`;
}
function editLine(id) {
  const L = id ? lineById(id) : { id: uid('l'), name: '', endA: (workPlaces()[0] || {}).id || '', stops: [] };
  modal(`<h2>${id ? 'Hattı düzenle' : 'Yeni hat'}</h2>
  <div class="grid c2"><label class="f">Hat adı<input id="l_name" dir="auto" value="${h(L.name)}"></label>
  <label class="f">Başlangıç işyeri<select id="l_endA">${opt(workPlaces(), L.endA)}</select></label></div>
  <div class="actions">${id ? '<button class="btn danger" id="l_del">Hattı sil</button>' : ''}<span style="flex:1"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="l_save">Kaydet</button></div>`, (r, close) => {
    $('#l_save', r).onclick = () => { const n = $('#l_name', r).value.trim(); if (!n) return toast('Ad gerekli', true); L.name = n; L.endA = $('#l_endA', r).value; if (!id) { S.lines.push(L); selLine = L.id; } save(); close(); render(); };
    if (id) $('#l_del', r).onclick = () => confirmDlg('Hat silinsin mi? Hattaki kişiler hatsız kalır.', () => { S.persons.forEach(p => { if (p.lineId === id) p.lineId = ''; }); S.lines = S.lines.filter(x => x.id !== id); selLine = ''; save(); close(); render(); });
  });
}
function addPersonToStop(L, stopId) {
  const cands = S.persons.filter(p => !(p.lineId === L.id && p.homeId === stopId)).sort((a, b) => sortTR(a.name, b.name));
  modal(`<h2>Durağa kişi ekle – <span dir="auto">${h(placeName(stopId))}</span></h2>
  <input type="search" id="apq" placeholder="Kişi ara…" style="width:100%"><div class="tbl-wrap" style="max-height:50vh;margin-top:8px"><table id="aptbl"></table></div>
  <p class="small muted">Seçilen kişinin hattı <b>${h(L.name)}</b>, ev durağı <b dir="auto">${h(placeName(stopId))}</b> olarak güncellenir.</p>
  <div class="actions"><button class="btn" data-close>Kapat</button></div>`, (r, close) => {
    const draw = () => { const q = $('#apq', r).value.toLowerCase(); $('#aptbl', r).innerHTML = cands.filter(p => (p.name + ' ' + p.nickname + ' ' + placeName(p.homeId)).toLowerCase().includes(q)).slice(0, 60).map(p => `<tr><td dir="auto">${h(p.name)}</td><td>${h(p.group)}</td><td dir="auto" class="muted">${h(placeName(p.homeId))} / ${h(lineName(p.lineId))}</td><td><button class="btn sm" data-pick="${p.id}">Ekle</button></td></tr>`).join(''); $$('[data-pick]', r).forEach(b => b.onclick = () => { const p = S.persons.find(x => x.id === b.dataset.pick); p.lineId = L.id; p.homeId = stopId; save(); close(); render(); toast(p.name + ' eklendi'); }); };
    draw(); $('#apq', r).oninput = draw;
  });
}

// ---------- Vardiya & Değişim ----------
function renderShifts(m) {
  const t = todayISO();
  m.innerHTML = `<h1>Vardiya &amp; Değişim</h1>
  <div class="card"><h2>Döngü</h2>
    <div class="row"><label class="f">Döngü süresi (gün) <input id="cyc" type="number" min="1" value="${S.settings.cycleDays}" style="width:90px"></label>
    <span class="muted small">Kural: 9 gün iş, 10. gün değişim → döngü 10 gün. Her değişim gününde işteki grup eve, evdeki grup işe gider.</span></div></div>
  <div class="card"><h2>Gruplar – şu anki durum ve değişim tarihleri</h2>
    <p class="small muted">Her grup için <b>şu an nerede</b> olduğunu, bu durumun <b>hangi tarihten beri</b> sürdüğünü ve <b>sonraki değişim tarihini</b> girin; sonrası döngüye göre otomatik hesaplanır. Düzensiz tarihler için "özel tarihler" alanına virgülle ayrılmış tarihler yazabilirsiniz (ör. 2026-11-20, 2026-12-01); listeden sonrası yine döngüyle devam eder.</p>
    <table><tr><th>Grup</th><th>Şu an</th><th>Bu durum… tarihinden beri</th><th>Sonraki değişim</th><th>Özel değişim tarihleri (isteğe bağlı)</th><th>Kişi</th><th></th></tr>
    ${S.groups.map(g => `<tr data-g="${g.id}"><td><input class="gname" value="${h(g.name)}" style="width:70px"></td>
      <td><select class="gst"><option value="work" ${g.status === 'work' ? 'selected' : ''}>İşte (fabrikada)</option><option value="home" ${g.status === 'home' ? 'selected' : ''}>Evde</option></select></td>
      <td><input type="date" class="gsince" value="${h(g.statusSince)}"></td>
      <td><input type="date" class="gnext" value="${h(g.nextChange)}"></td>
      <td><input class="gcustom" value="${h((g.customDates || []).join(', '))}" placeholder="YYYY-AA-GG, …" style="width:260px"></td>
      <td>${S.persons.filter(p => p.group === g.id && personInService(p)).length}</td>
      <td><button class="btn sm danger" data-gdel="${g.id}">✕</button></td></tr>`).join('')}
    </table>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="gSave">Kaydet</button><button class="btn" id="gAdd">+ Grup ekle</button><button class="btn" id="gApplyAll">A/A1 ve B/B1 için aynı sonraki tarihi uygula</button></div>
  </div>
  <div class="card"><h2>Hesaplanan takvim (önümüzdeki 120 gün)</h2>
    <table><tr><th>Tarih</th><th>Gün</th>${S.groups.map(g => `<th>${h(g.name)}</th>`).join('')}<th>Şoför ekibi</th></tr>
    ${(() => { const dates = new Set([t]); S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, t, addDays(t, 120)).forEach(d => dates.add(d))); changeDatesBetween(S.driver, S.driver.cycleDays, t, addDays(t, 120)).forEach(d => dates.add(d)); return Array.from(dates).sort().map(d => `<tr><td><b>${fmt(d)}</b>${d === t ? ' <span class="badge info">bugün</span>' : ''}</td><td>${dayName(d)}</td>${S.groups.map(g => { const ch = changeDatesBetween(g, S.settings.cycleDays, d, d).length > 0; const st = groupStatusAt(g, d); return `<td>${ch ? '<span class="badge ' + (st === 'work' ? 'ok' : 'gray') + '">' + (st === 'work' ? '→ İşe gidiş' : '→ Eve dönüş') + '</span>' : '<span class="muted">' + (st === 'work' ? 'işte' : 'evde') + '</span>'}</td>`; }).join('')}<td>${changeDatesBetween(S.driver, S.driver.cycleDays, d, d).length ? '<span class="badge info">Ekip ' + driverTeamAt(d) + ' göreve</span>' : '<span class="muted">Ekip ' + driverTeamAt(d) + '</span>'}</td></tr>`).join(''); })()}
    </table></div>`;
  $('#gSave').onclick = () => {
    S.settings.cycleDays = Math.max(1, +$('#cyc').value || 10);
    $$('tr[data-g]', m).forEach(tr => { const g = groupById(tr.dataset.g); g.name = $('.gname', tr).value.trim() || g.id; g.status = $('.gst', tr).value; g.statusSince = $('.gsince', tr).value || t; g.nextChange = $('.gnext', tr).value; g.customDates = $('.gcustom', tr).value.split(/[,\s]+/).map(x => x.trim()).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)); });
    save(); render(); toast('Vardiya ayarları kaydedildi');
  };
  $('#gAdd').onclick = () => modal(`<h2>Yeni grup</h2><label class="f">Grup kodu<input id="ng"></label><div class="actions"><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="ngOk">Ekle</button></div>`, (r, close) => { $('#ngOk', r).onclick = () => { const id = $('#ng', r).value.trim(); if (!id || groupById(id)) return toast('Geçersiz veya mevcut kod', true); S.groups.push({ id, name: id, status: 'home', statusSince: t, nextChange: '', customDates: [] }); save(); close(); render(); }; });
  $$('[data-gdel]', m).forEach(b => b.onclick = () => { const id = b.dataset.gdel; if (S.persons.some(p => p.group === id)) return toast('Bu grupta kişiler var', true); confirmDlg('Grup silinsin mi?', () => { S.groups = S.groups.filter(g => g.id !== id); save(); render(); }); });
  $('#gApplyAll').onclick = () => { const a = $$('tr[data-g]', m); const first = a[0] && $('.gnext', a[0]).value; if (!first) return toast('Önce ilk grubun sonraki değişim tarihini girin', true); a.forEach(tr => { $('.gnext', tr).value = first; }); toast('Tüm gruplara uygulandı; Kaydet\'e basın'); };
}

// ---------- Şoförler ----------
function renderDrivers(m) {
  const t = todayISO(); const team = driverTeamAt(t);
  m.innerHTML = `<h1>Şoförler</h1>
  <div class="grid c2">
  <div class="card"><div class="row between"><h2>Şoför listesi</h2><button class="btn primary" id="dAdd">+ Şoför ekle</button></div>
    ${S.drivers.map(d => `<div class="drv ${d.team === team ? 'on' : 'off'}"><div style="flex:1"><div class="nm" dir="auto">${h(d.name)} <span class="small muted">${h(d.phone)}</span></div><div class="small muted">Ekip ${d.team} · İşe başlama: ${fmt(d.startDate)} · Bitiş: ${d.endDate ? fmt(d.endDate) : '—'} ${d.notes ? '· ' + h(d.notes) : ''}</div></div><span class="badge ${d.team === team ? 'ok' : 'gray'}">${d.team === team ? 'Aktif' : 'İstirahatte'}</span><button class="btn sm" data-de="${d.id}">Düzenle</button></div>`).join('')}
  </div>
  <div class="card"><h2>Nöbet düzeni</h2>
    <p class="small muted">2 şoför çalışır, 2 şoför istirahattedir (Ekip 1 / Ekip 2). Şoför değişimi yolcu değişiminin ortasında (5. gün) yapılır.</p>
    <div class="grid c2">
      <label class="f">Şu an görevde olan ekip<select id="dteam"><option value="1" ${S.driver.activeTeam === 1 ? 'selected' : ''}>Ekip 1</option><option value="2" ${S.driver.activeTeam === 2 ? 'selected' : ''}>Ekip 2</option></select></label>
      <label class="f">Bu ekip … tarihinden beri görevde<input type="date" id="dsince" value="${h(S.driver.statusSince)}"></label>
      <label class="f">Sonraki şoför değişimi<input type="date" id="dnext" value="${h(S.driver.nextChange)}"></label>
      <label class="f">Şoför döngüsü (gün)<input type="number" id="dcyc" min="1" value="${S.driver.cycleDays}"></label>
    </div>
    <label class="f" style="margin-top:8px">Özel değişim tarihleri (isteğe bağlı)<input id="dcustom" value="${h((S.driver.customDates || []).join(', '))}" placeholder="YYYY-AA-GG, …"></label>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="dSave">Kaydet</button><button class="btn" id="dAuto">Yolcu değişiminin ortasına ayarla (5 gün sonrası)</button></div>
    <h3 style="margin-top:14px">Yaklaşan şoför değişimleri</h3>
    <div class="timeline">${changeDatesBetween(S.driver, S.driver.cycleDays, t, addDays(t, 90)).map(d => `<div class="tl"><b>${fmt(d)}</b>${dayName(d)}<br><span class="muted">Ekip ${driverTeamAt(d)} göreve</span></div>`).join('') || '<span class="muted">Tarih girilmedi</span>'}</div>
  </div></div>`;
  $('#dAdd').onclick = () => editDriver(null); $$('[data-de]', m).forEach(b => b.onclick = () => editDriver(b.dataset.de));
  $('#dSave').onclick = () => { S.driver.activeTeam = +$('#dteam').value; S.driver.statusSince = $('#dsince').value || t; S.driver.nextChange = $('#dnext').value; S.driver.cycleDays = Math.max(1, +$('#dcyc').value || 10); S.driver.customDates = $('#dcustom').value.split(/[,\s]+/).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)); save(); render(); toast('Kaydedildi'); };
  $('#dAuto').onclick = () => { const nx = upcomingChangeDates(1)[0]; if (!nx) return toast('Önce grup değişim tarihini girin', true); const half = Math.round(S.settings.cycleDays / 2); let d = addDays(nx, half); if (d < t) d = addDays(d, S.settings.cycleDays); $('#dnext').value = d; $('#dcyc').value = S.settings.cycleDays; toast('Önerilen tarih yazıldı: ' + fmt(d) + ' — Kaydet\'e basın'); };
}
function editDriver(id) {
  const d = id ? S.drivers.find(x => x.id === id) : { id: uid('d'), name: '', phone: '', team: 1, startDate: '', endDate: '', notes: '' };
  modal(`<h2>${id ? 'Şoförü düzenle' : 'Yeni şoför'}</h2><div class="grid c2">
  <label class="f">Ad Soyad<input id="d_name" dir="auto" value="${h(d.name)}"></label><label class="f">Telefon<input id="d_phone" value="${h(d.phone)}"></label>
  <label class="f">Ekip<select id="d_team"><option value="1" ${d.team === 1 ? 'selected' : ''}>Ekip 1</option><option value="2" ${d.team === 2 ? 'selected' : ''}>Ekip 2</option></select></label>
  <label class="f">İşe başlama tarihi<input type="date" id="d_start" value="${h(d.startDate)}"></label><label class="f">İşten ayrılış tarihi<input type="date" id="d_end" value="${h(d.endDate)}"></label>
  <label class="f">Not<input id="d_notes" dir="auto" value="${h(d.notes)}"></label></div>
  <div class="actions">${id ? '<button class="btn danger" id="d_del">Sil</button>' : ''}<span style="flex:1"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="d_save">Kaydet</button></div>`, (r, close) => {
    $('#d_save', r).onclick = () => { Object.assign(d, { name: $('#d_name', r).value.trim() || 'Şoför', phone: $('#d_phone', r).value.trim(), team: +$('#d_team', r).value, startDate: $('#d_start', r).value, endDate: $('#d_end', r).value, notes: $('#d_notes', r).value.trim() }); if (!id) S.drivers.push(d); save(); close(); render(); };
    if (id) $('#d_del', r).onclick = () => confirmDlg('Şoför silinsin mi?', () => { S.drivers = S.drivers.filter(x => x.id !== id); save(); close(); render(); });
  });
}

// ---------- Sefer planı ----------
let planDate = '';
function renderPlan(m) {
  const t = todayISO();
  const upcoming = upcomingChangeDates(10);
  if (!planDate) planDate = upcoming[0] || t;
  const P = planFor(planDate);
  m.innerHTML = `<h1>Sefer Planı</h1>
  <div class="toolbar"><label class="f">Değişim tarihi<input type="date" id="pdate" value="${planDate}"></label>
    <select id="pquick"><option value="">Yaklaşan değişimler…</option>${upcoming.map(d => `<option value="${d}">${fmt(d)} ${dayName(d)} — ${changesOn(d).map(g => g.name).join(', ')}</option>`).join('')}</select>
    <span style="flex:1"></span><button class="btn" id="pXls">Excel'e ver</button><button class="btn primary" id="pPrint">🖨️ Yazdır</button></div>
  ${P.groups.length ? `<p>Bu tarihte değişen gruplar: ${P.groups.map(g => `<span class="badge ${groupPrevStatus(g, planDate) === 'work' ? 'ok' : 'gray'}">${h(g.name)}: ${groupPrevStatus(g, planDate) === 'work' ? 'işten eve' : 'evden işe'}</span>`).join(' ')}</p>` : '<p class="badge warn">Bu tarihte değişim yok. Vardiya sayfasından değişim tarihlerini kontrol edin.</p>'}
  <p class="small muted">Şoför: Ekip ${driverTeamAt(planDate)} görevde. Otobüs işyerinden çıkar, eve dönenleri duraklara bırakır ve aynı duraklardan işe gidenleri alır.</p>
  ${P.lines.map(pl => planLineHtml(pl, planDate)).join('')}`;
  $('#pdate').onchange = e => { planDate = e.target.value; render(); };
  $('#pquick').onchange = e => { if (e.target.value) { planDate = e.target.value; render(); } };
  $$('[data-buses]', m).forEach(s => s.onchange = () => { const lid = s.dataset.buses; const c = ((S.plans[planDate] = S.plans[planDate] || {})[lid] = (S.plans[planDate] || {})[lid] || { buses: 1, firstStopBus1: '' }); c.buses = +s.value; save(); render(); });
  $$('[data-split]', m).forEach(s => s.onchange = () => { const lid = s.dataset.split; const c = ((S.plans[planDate] = S.plans[planDate] || {})[lid] = (S.plans[planDate] || {})[lid] || { buses: 2, firstStopBus1: '' }); c.firstStopBus1 = s.value; save(); render(); });
  $$('[data-note]', m).forEach(s => s.onchange = () => { const lid = s.dataset.note; const c = ((S.plans[planDate] = S.plans[planDate] || {})[lid] = (S.plans[planDate] || {})[lid] || { buses: 1, firstStopBus1: '' }); c.note = s.value; save(); });
  $('#pPrint').onclick = () => printReport('plan', { date: planDate });
  $('#pXls').onclick = () => exportPlanExcel(planDate);
}
function planLineHtml(pl, date) {
  const L = pl.line, cfg = pl.cfg;
  if (!pl.rows.length) return `<div class="card tight"><b>${h(L.name)}</b> <span class="muted small">— bu tarihte yolcu yok</span></div>`;
  const stopHtml = sid => { const rs = pl.byStop[sid]; const bus = rs[0].bus; return `<div class="plan-stop ${cfg.buses === 2 ? 'bus' + bus : ''}"><div class="hd"><span dir="auto">${h(placeName(sid))} ${L.stops.includes(sid) ? '' : '<span class="badge warn">durak tanımsız</span>'}</span><span class="small muted">${cfg.buses === 2 ? 'Otobüs ' + bus + ' · ' : ''}eve ${rs.filter(r => r.dir === 'toHome').length} · işe ${rs.filter(r => r.dir === 'toWork').length}</span></div><ul>${rs.map(r => `<li>${r.dir === 'toHome' ? '🏠' : '🏭'} <span dir="auto">${h(r.p.name)}</span> <span class="muted small">${h(r.p.group)}</span></li>`).join('')}</ul></div>`; };
  return `<div class="card"><div class="row between"><h2>${h(L.name)} <span class="muted small">— eve dönen ${pl.toHome}, işe giden ${pl.toWork}, toplam ${pl.rows.length}</span></h2>
    <div class="row"><label class="f">Otobüs sayısı<select data-buses="${L.id}"><option value="1" ${cfg.buses !== 2 ? 'selected' : ''}>1 otobüs</option><option value="2" ${cfg.buses === 2 ? 'selected' : ''}>2 otobüs (ekspres + toplayıcı)</option></select></label>
    ${cfg.buses === 2 ? `<label class="f">Otobüs 1 (ekspres) ilk durağı<select data-split="${L.id}">${opt(L.stops.map(s => ({ id: s, name: placeName(s) })), cfg.firstStopBus1, x => x.name, x => x.id, '— seçiniz —')}</select></label>` : ''}</div></div>
    ${cfg.buses === 2 ? '<div class="legend"><span class="badge info">Otobüs 1</span> ekspres: seçilen duraktan önce kimseyi almaz/bırakmaz · <span class="badge warn">Otobüs 2</span> kalan durakları toplar</div>' : ''}
    <div class="grid c2" style="margin-top:8px">${pl.stopList.map(stopHtml).join('')}</div>
    <label class="f" style="margin-top:8px">Not (çıktıda görünür)<input data-note="${L.id}" value="${h(cfg.note || '')}"></label></div>`;
}

// ---------- Çıktılar ----------
function renderReports(m) {
  const lhs = S.letterheads;
  m.innerHTML = `<h1>Çıktılar</h1>
  <div class="card"><div class="grid c3">
    <label class="f">Rapor<select id="rtype">
      <option value="plan">Sefer planı (değişim günü)</option>
      <option value="persons">Kişi listesi (tüm)</option>
      <option value="line">Hat listesi (duraklara göre)</option>
      <option value="groups">Grup listeleri (işte / evde)</option>
      <option value="exempt">Muaf ve sistem dışı kişiler</option>
      <option value="calendar">Değişim takvimi</option>
      <option value="drivers">Şoför nöbet çizelgesi</option></select></label>
    <label class="f">Antet<select id="rlh">${opt(lhs, S.settings.defaultLetterheadId)}</select></label>
    <label class="f">Tarih<input type="date" id="rdate" value="${planDate || upcomingChangeDates(1)[0] || todayISO()}"></label>
    <label class="f" id="rlineWrap">Hat<select id="rline">${opt(S.lines, '', x => x.name, x => x.id, 'Tüm hatlar')}</select></label>
    <label class="f">Başlık (isteğe bağlı)<input id="rtitle" placeholder="Varsayılan başlık"></label>
  </div>
  <div class="row" style="margin-top:12px"><button class="btn primary" id="rPrint">🖨️ Yazdır / PDF</button><button class="btn" id="rXls">📗 Excel'e ver</button><button class="btn" id="rPrev">Önizleme</button></div></div>
  <div id="rprev" class="card" style="display:none"></div>`;
  const opts = () => ({ date: $('#rdate').value, lineId: $('#rline').value, lhId: $('#rlh').value, title: $('#rtitle').value.trim() });
  $('#rPrint').onclick = () => printReport($('#rtype').value, opts());
  $('#rPrev').onclick = () => { const d = $('#rprev'); d.style.display = 'block'; d.innerHTML = '<div class="print-area" style="display:block;background:#fff;padding:10px">' + reportHtml($('#rtype').value, opts()) + '</div>'; };
  $('#rXls').onclick = () => { const ty = $('#rtype').value, o = opts(); if (ty === 'plan') exportPlanExcel(o.date); else if (ty === 'persons' || ty === 'exempt' || ty === 'groups' || ty === 'line') exportPersonsExcel(ty, o); else if (ty === 'calendar') exportCalendarExcel(); else if (ty === 'drivers') exportDriversExcel(); };
}
function letterheadHtml(lhId) {
  const lh = S.letterheads.find(x => x.id === lhId) || S.letterheads.find(x => x.id === S.settings.defaultLetterheadId) || S.letterheads[0];
  if (!lh) return '';
  if (lh.kind === 'image') return `<div class="lh img-only"><img src="${lh.imageData}"></div>` + (lh.watermark ? '<div class="wm"></div>' : '');
  return `${lh.watermark ? '<div class="wm"></div>' : ''}<div class="lh"><div class="l">${h(lh.left)}</div><img src="${h(lh.logo || 'assets/logo.png')}"><div class="r">${h(lh.right)}</div></div>`;
}
function reportHtml(type, o) {
  const t = todayISO(); const date = o.date || t;
  const head = (title, sub) => `<h1>${h(o.title || title)}</h1><div class="sub">${h(sub || '')}</div>`;
  const foot = () => `<div class="foot"><span>${h(S.settings.orgName)} · ${h(S.settings.adminName)}</span><span>Yazdırma: ${fmt(t)}</span></div>`;
  let body = '';
  if (type === 'plan') {
    const P = planFor(date);
    body = head('Sefer Planı – Değişim Günü', `${fmt(date)} ${dayName(date)} · Değişen gruplar: ${P.groups.map(g => g.name).join(', ') || '—'} · Şoför Ekip ${driverTeamAt(date)} (${S.drivers.filter(d => d.team === driverTeamAt(date)).map(d => d.name).join(', ')})`);
    P.lines.filter(pl => pl.rows.length && (!o.lineId || pl.line.id === o.lineId)).forEach((pl, i) => {
      body += `<div class="sec ${i ? 'pb' : ''}">${h(pl.line.name)} — eve dönen ${pl.toHome}, işe giden ${pl.toWork}, toplam ${pl.rows.length}${pl.cfg.buses === 2 ? ' · 2 otobüs (Otobüs 1 ekspres: ' + h(placeName(pl.cfg.firstStopBus1)) + ' durağından itibaren)' : ''}</div>`;
      if (pl.cfg.note) body += `<div class="small">Not: ${h(pl.cfg.note)}</div>`;
      body += `<table><tr><th>#</th><th>Durak</th>${pl.cfg.buses === 2 ? '<th>Otobüs</th>' : ''}<th>Ad Soyad</th><th>Lakap</th><th>Sicil</th><th>Grup</th><th>Yön</th></tr>`;
      let n = 0; pl.stopList.forEach(sid => pl.byStop[sid].forEach(r => { body += `<tr><td>${++n}</td><td dir="auto">${h(placeName(sid))}</td>${pl.cfg.buses === 2 ? '<td>' + r.bus + '</td>' : ''}<td dir="auto">${h(r.p.name)}</td><td dir="auto">${h(r.p.nickname)}</td><td>${h(r.p.regNo)}</td><td>${h(r.p.group)}</td><td>${r.dir === 'toHome' ? 'Eve dönüş' : 'İşe gidiş'}</td></tr>`; }));
      body += '</table>';
    });
    body += `<div class="sig"><div>Şoför</div><div>${h(S.settings.adminName)}</div></div>`;
  } else if (type === 'persons' || type === 'exempt' || type === 'groups' || type === 'line') {
    let list = S.persons.slice().sort((a, b) => (Number(a.seq) || 9999) - (Number(b.seq) || 9999));
    if (type === 'exempt') list = list.filter(p => personExempt(p) || p.active === false);
    if (o.lineId) list = list.filter(p => p.lineId === o.lineId);
    const tbl = rows => `<table><tr><th>#</th><th>Sicil</th><th>Ad Soyad</th><th>Lakap</th><th>Unvan</th><th>Grup</th><th>Ev</th><th>İşyeri</th><th>Hat</th><th>Durum</th></tr>${rows.map((p, i) => `<tr><td>${i + 1}</td><td>${h(p.regNo)}</td><td dir="auto">${h(p.name)}</td><td dir="auto">${h(p.nickname)}</td><td dir="auto">${h(p.title)}</td><td>${h(p.group)}</td><td dir="auto">${h(placeName(p.homeId))}</td><td dir="auto">${h(placeName(p.workId))}</td><td>${h(lineName(p.lineId))}</td><td>${p.active === false ? 'Çıkarıldı' : personExempt(p) ? 'Muaf' : 'Serviste'}</td></tr>`).join('')}</table>`;
    if (type === 'groups') {
      body = head('Grup Listeleri', `${fmt(date)} itibarıyla`);
      S.groups.forEach(g => { const rows = list.filter(p => p.group === g.id && personInService(p)); body += `<div class="sec">Grup ${h(g.name)} — ${groupStatusAt(g, date) === 'work' ? 'İŞTE (fabrikada)' : 'EVDE'} — ${rows.length} kişi · sonraki değişim ${fmt(groupNextChange(g, date))}</div>` + tbl(rows); });
    } else if (type === 'line') {
      body = head('Hat Listesi', o.lineId ? lineName(o.lineId) : 'Tüm hatlar');
      S.lines.filter(L => !o.lineId || L.id === o.lineId).forEach(L => { body += `<div class="sec">${h(L.name)} — işyeri: ${h(placeName(L.endA))}</div>`; L.stops.forEach((sid, i) => { const rows = list.filter(p => p.lineId === L.id && p.homeId === sid); if (!rows.length) return; body += `<div class="small"><b>${i + 1}. ${h(placeName(sid))}</b> (${rows.length})</div>` + tbl(rows); }); const un = list.filter(p => p.lineId === L.id && !L.stops.includes(p.homeId)); if (un.length) body += '<div class="small"><b>Durağı tanımsız</b></div>' + tbl(un); });
    } else body = head(type === 'exempt' ? 'Muaf ve Sistem Dışı Kişiler' : 'Kişi Listesi', `${list.length} kişi · ${fmt(t)}`) + tbl(list);
  } else if (type === 'calendar') {
    const dates = new Set(); S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, date, addDays(date, 180)).forEach(d => dates.add(d))); changeDatesBetween(S.driver, S.driver.cycleDays, date, addDays(date, 180)).forEach(d => dates.add(d));
    body = head('Değişim Takvimi', `${fmt(date)} – ${fmt(addDays(date, 180))}`) + `<table><tr><th>Tarih</th><th>Gün</th>${S.groups.map(g => `<th>${h(g.name)}</th>`).join('')}<th>Şoför</th></tr>` + Array.from(dates).sort().map(d => `<tr><td>${fmt(d)}</td><td>${dayName(d)}</td>${S.groups.map(g => { const ch = changeDatesBetween(g, S.settings.cycleDays, d, d).length > 0; const st = groupStatusAt(g, d); return `<td>${ch ? (st === 'work' ? 'İşe gidiş' : 'Eve dönüş') : (st === 'work' ? 'işte' : 'evde')}</td>`; }).join('')}<td>${changeDatesBetween(S.driver, S.driver.cycleDays, d, d).length ? 'Ekip ' + driverTeamAt(d) + ' göreve' : 'Ekip ' + driverTeamAt(d)}</td></tr>`).join('') + '</table>';
  } else if (type === 'drivers') {
    body = head('Şoför Nöbet Çizelgesi', `${fmt(date)} itibarıyla · Görevde: Ekip ${driverTeamAt(date)}`) + `<table><tr><th>Ad Soyad</th><th>Telefon</th><th>Ekip</th><th>Durum</th><th>İşe başlama</th><th>Bitiş</th><th>Not</th></tr>${S.drivers.map(d => `<tr><td dir="auto">${h(d.name)}</td><td>${h(d.phone)}</td><td>${d.team}</td><td>${d.team === driverTeamAt(date) ? 'Aktif' : 'İstirahatte'}</td><td>${fmt(d.startDate)}</td><td>${d.endDate ? fmt(d.endDate) : '—'}</td><td dir="auto">${h(d.notes)}</td></tr>`).join('')}</table><div class="sec">Yaklaşan şoför değişimleri</div><table><tr><th>Tarih</th><th>Gün</th><th>Göreve gelen ekip</th><th>Şoförler</th></tr>${changeDatesBetween(S.driver, S.driver.cycleDays, date, addDays(date, 120)).map(d => `<tr><td>${fmt(d)}</td><td>${dayName(d)}</td><td>Ekip ${driverTeamAt(d)}</td><td dir="auto">${S.drivers.filter(x => x.team === driverTeamAt(d)).map(x => h(x.name)).join(', ')}</td></tr>`).join('')}</table>`;
  }
  return `<div class="page">${letterheadHtml(o.lhId)}${body}${foot()}</div>`;
}
function printReport(type, o) {
  $('#printArea').innerHTML = reportHtml(type, o);
  setTimeout(() => { if (isElectron) window.electronAPI.print(); else window.print(); }, 150);
}

// ---------- Excel ----------
async function saveBlob(name, u8) {
  if (isElectron) { const b64 = btoa(String.fromCharCode(...new Uint8Array(u8))); const p = await window.electronAPI.saveFile({ name, dataBase64: b64, filters: [{ name: 'Excel', extensions: ['xlsx'] }, { name: 'JSON', extensions: ['json'] }] }); if (p) toast('Kaydedildi: ' + p); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8])); a.download = name; a.click();
}
function xlsxFromSheets(sheets) { const wb = XLSX.utils.book_new(); sheets.forEach(([n, rows]) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(40, Math.max(8, ...rows.map(r => String(r[i] ?? '').length + 2))) })); XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 30)); }); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); }
const personRow = p => [p.seq, p.regNo, p.name, p.nickname, p.title, p.mother, p.group, placeName(p.homeId), placeName(p.workId), lineName(p.lineId), p.active === false ? 'Çıkarıldı' : personExempt(p) ? 'Muaf' : 'Serviste', p.notes];
const PH = ['Sıra', 'Sicil', 'Ad Soyad', 'Lakap', 'Unvan', 'Anne adı', 'Grup', 'Ev', 'İşyeri', 'Hat', 'Durum', 'Not'];
function exportPersonsExcel(type, o) {
  let list = S.persons.slice().sort((a, b) => (Number(a.seq) || 9999) - (Number(b.seq) || 9999));
  if (type === 'exempt') list = list.filter(p => personExempt(p) || p.active === false);
  if (o && o.lineId) list = list.filter(p => p.lineId === o.lineId);
  const sheets = [];
  if (type === 'groups') S.groups.forEach(g => sheets.push(['Grup ' + g.name, [PH, ...list.filter(p => p.group === g.id).map(personRow)]]));
  else if (type === 'line') S.lines.forEach(L => { if (o && o.lineId && L.id !== o.lineId) return; sheets.push([L.name.replace(/[\\/?*\[\]:]/g, ' '), [['Durak sırası', ...PH], ...L.stops.flatMap((sid, i) => list.filter(p => p.lineId === L.id && p.homeId === sid).map(p => [i + 1, ...personRow(p)]))]]); });
  else sheets.push(['Kişiler', [PH, ...list.map(personRow)]]);
  saveBlob('kisiler-' + todayISO() + '.xlsx', xlsxFromSheets(sheets));
}
function exportPlanExcel(date) {
  const P = planFor(date); const sheets = [];
  P.lines.filter(pl => pl.rows.length).forEach(pl => { const rows = [['Durak', 'Otobüs', 'Ad Soyad', 'Lakap', 'Sicil', 'Grup', 'Yön']]; pl.stopList.forEach(sid => pl.byStop[sid].forEach(r => rows.push([placeName(sid), pl.cfg.buses === 2 ? r.bus : 1, r.p.name, r.p.nickname, r.p.regNo, r.p.group, r.dir === 'toHome' ? 'Eve dönüş' : 'İşe gidiş']))); sheets.push([pl.line.name.replace(/[\\/?*\[\]:]/g, ' '), rows]); });
  if (!sheets.length) return toast('Bu tarihte yolcu yok', true);
  saveBlob('sefer-plani-' + date + '.xlsx', xlsxFromSheets(sheets));
}
function exportCalendarExcel() {
  const t = todayISO(); const dates = new Set(); S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, t, addDays(t, 365)).forEach(d => dates.add(d))); changeDatesBetween(S.driver, S.driver.cycleDays, t, addDays(t, 365)).forEach(d => dates.add(d));
  const rows = [['Tarih', 'Gün', ...S.groups.map(g => g.name), 'Şoför ekibi']]; Array.from(dates).sort().forEach(d => rows.push([fmt(d), dayName(d), ...S.groups.map(g => { const ch = changeDatesBetween(g, S.settings.cycleDays, d, d).length > 0; const st = groupStatusAt(g, d); return ch ? (st === 'work' ? 'İşe gidiş' : 'Eve dönüş') : (st === 'work' ? 'işte' : 'evde'); }), 'Ekip ' + driverTeamAt(d)]));
  saveBlob('degisim-takvimi.xlsx', xlsxFromSheets([['Takvim', rows]]));
}
function exportDriversExcel() { saveBlob('soforler.xlsx', xlsxFromSheets([['Şoförler', [['Ad Soyad', 'Telefon', 'Ekip', 'İşe başlama', 'Bitiş', 'Not'], ...S.drivers.map(d => [d.name, d.phone, d.team, fmt(d.startDate), d.endDate ? fmt(d.endDate) : '', d.notes])]]])); }

async function pickFile(accept) {
  if (isElectron) { const f = await window.electronAPI.openFile({ filters: [{ name: 'Dosya', extensions: accept.split(',').map(x => x.replace('.', '')) }] }); if (!f) return null; const bin = atob(f.dataBase64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return { name: f.name, data: u8 }; }
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = async () => { const f = i.files[0]; if (!f) return res(null); res({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }); }; i.click(); });
}
async function importPersonsExcel() {
  const f = await pickFile('.xlsx,.xls'); if (!f) return;
  const wb = XLSX.read(f.data, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const hdr = rows[0].map(x => String(x).trim());
  const col = (names, idx) => { const i = hdr.findIndex(hh => names.some(n => hh.includes(n))); return i >= 0 ? i : idx; };
  const C = { seq: col(['تسلسل', 'Sıra'], 0), reg: col(['الرقم', 'Sicil'], 1), title: col(['المسمى', 'Unvan'], 2), name: col(['الأسم', 'الاسم', 'Ad Soyad'], 3), mother: col(['الأم', 'Anne'], 4), nick: col(['اللقب', 'Lakap'], 5), grp: col(['فئة', 'Grup'], 6), home: col(['السكن', 'Ev'], 7), line: col(['خط', 'Hat'], 8), from: col(['من'], 9), to: col(['الى', 'إلى'], 10), notes: col(['ملاحظات', 'Not'], 11), work: col(['İşyeri'], -1) };
  const clean = v => String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const findPlace = (name, type) => { if (!name) return ''; let p = S.places.find(x => x.name === name); if (!p) { p = { id: uid('p'), name, type: type || 'home', exempt: null }; S.places.push(p); } return p.id; };
  let added = 0, updated = 0;
  rows.slice(1).forEach(r => {
    const name = clean(r[C.name]); if (!name) return;
    const grp = clean(r[C.grp]); const from = clean(r[C.from]), to = clean(r[C.to]);
    let work = C.work >= 0 ? clean(r[C.work]) : (grp.startsWith('A') ? from : grp.startsWith('B') ? to : '');
    const wp = workPlaces().find(w => work && (work.includes(w.name) || w.name.includes(work) || (work.includes('القادسية') && w.name.includes('القادسية')) || (work.includes('حماة') && w.name.includes('حماة'))));
    const reg = clean(r[C.reg]);
    let p = S.persons.find(x => (reg && x.regNo === reg) || x.name === name);
    const isNew = !p; if (isNew) { p = { id: uid('u'), exempt: null, active: true, lineId: '' }; S.persons.push(p); added++; } else updated++;
    Object.assign(p, { seq: clean(r[C.seq]) || p.seq, regNo: reg || p.regNo, title: clean(r[C.title]), name, mother: clean(r[C.mother]), nickname: clean(r[C.nick]), group: GROUPS_DEFAULT.includes(grp) || groupById(grp) ? grp : p.group || '', notes: clean(r[C.notes]) });
    if (grp && !groupById(grp)) S.groups.push({ id: grp, name: grp, status: 'home', statusSince: todayISO(), nextChange: '', customDates: [] });
    const home = clean(r[C.home]); if (home) p.homeId = findPlace(home, 'home');
    if (wp) p.workId = wp.id;
    const ln = clean(r[C.line]); if (ln) { const L = S.lines.find(x => x.name === ln) || S.lines.find(x => ln.includes('حلب') ? x.name.includes('Halep') : (ln.includes('الشام') || ln.includes('درعا')) ? (wp && wp.name.includes('حماة') ? x.name.includes('Şam') : x.name.includes('Dera')) : (ln.includes('الجسر') || ln.includes('ادلب')) ? (wp && wp.name.includes('حماة') ? x.name.includes('Hama') && x.name.includes('Cisr') : x.name.includes('Kadısiye') && x.name.includes('Cisr')) : false); if (L) { p.lineId = L.id; if (p.homeId && !L.stops.includes(p.homeId)) L.stops.push(p.homeId); } }
  });
  save(); render(); toast(`İçe aktarıldı: ${added} yeni, ${updated} güncellendi`);
}

// ---------- Ayarlar ----------
function renderSettings(m) {
  const s = S.settings;
  m.innerHTML = `<h1>Ayarlar</h1>
  <div class="grid c2">
  <div>
    <div class="card"><h2>Genel</h2><div class="grid c2">
      <label class="f">Kurum / sistem adı<input id="s_org" value="${h(s.orgName)}"></label>
      <label class="f">İdareci adı<input id="s_admin" dir="auto" value="${h(s.adminName)}"></label>
      <label class="f">İdareci şifresi (boş = şifresiz)<input id="s_pin" type="password" value="${h(s.pin)}"></label></div>
      <label class="f" style="margin-top:8px">Muaf yer anahtar kelimeleri (virgülle)<textarea id="s_ex" rows="2" dir="auto">${h((s.exemptKeywords || []).join(', '))}</textarea></label>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="sSave">Kaydet</button></div></div>
    <div class="card"><h2>Antetler</h2>
      <p class="small muted">Çıktılarda kullanılacak antet. Varsayılan (favori) antet yıldızla işaretlidir; yazdırırken başka antet de seçilebilir.</p>
      ${S.letterheads.map(l => `<div class="drv ${l.id === s.defaultLetterheadId ? 'on' : ''}"><span class="nm">${l.id === s.defaultLetterheadId ? '⭐ ' : ''}${h(l.name)} <span class="small muted">${l.kind === 'image' ? '(resim)' : '(şablon)'}</span></span><button class="btn sm" data-lhdef="${l.id}">Favori yap</button><button class="btn sm" data-lhedit="${l.id}">Düzenle</button>${S.letterheads.length > 1 ? `<button class="btn sm danger" data-lhdel="${l.id}">✕</button>` : ''}</div>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn" id="lhAddImg">+ Resimden antet ekle</button><button class="btn" id="lhAddTxt">+ Yazılı antet ekle</button></div>
      <div class="lh-prev"><div class="print-area" style="display:block">${letterheadHtml(s.defaultLetterheadId).replace('<div class="wm"></div>', '')}</div></div></div>
  </div>
  <div>
    <div class="card"><h2>Güncelleme</h2>
      <div class="kv"><b>Uygulama sürümü</b><span id="curVer">${APP_VERSION}</span><b>Güncelleme adresi</b><span></span></div>
      <input id="s_upd" value="${h(s.updateUrl)}" style="width:100%;margin:6px 0">
      <div class="row"><button class="btn primary" id="updCheck">Güncellemeyi kontrol et</button><button class="btn" id="updReset">Fabrika sürümüne dön</button></div>
      <div id="updMsg" class="small" style="margin-top:8px"></div>
      ${isElectron ? '' : '<p class="small muted">Tarayıcı modunda güncelleme yapılamaz; masaüstü uygulamasını kullanın.</p>'}</div>
    <div class="card"><h2>Yedekleme</h2>
      <div class="row"><button class="btn" id="bkExp">Yedek al (JSON)</button><button class="btn" id="bkImp">Yedekten geri yükle</button><button class="btn danger" id="bkReset">Başlangıç verisine dön</button></div>
      <p class="small muted" id="dataPath"></p></div>
    <div class="card"><h2>Hakkında</h2><p class="small">Merkezi Servis Hizmeti · v${APP_VERSION}<br>Vardiya: ${s.cycleDays} günlük döngü · Şoför: ${S.driver.cycleDays} günlük döngü<br>Kişi: ${S.persons.length} · Yer: ${S.places.length} · Hat: ${S.lines.length}</p></div>
  </div></div>`;
  $('#sSave').onclick = () => { s.orgName = $('#s_org').value.trim(); s.adminName = $('#s_admin').value.trim(); s.pin = $('#s_pin').value; s.exemptKeywords = $('#s_ex').value.split(',').map(x => x.trim()).filter(Boolean); s.updateUrl = $('#s_upd').value.trim() || DEFAULT_UPDATE_URL; save(); render(); toast('Kaydedildi'); };
  $$('[data-lhdef]', m).forEach(b => b.onclick = () => { s.defaultLetterheadId = b.dataset.lhdef; save(); render(); });
  $$('[data-lhdel]', m).forEach(b => b.onclick = () => confirmDlg('Antet silinsin mi?', () => { S.letterheads = S.letterheads.filter(x => x.id !== b.dataset.lhdel); if (s.defaultLetterheadId === b.dataset.lhdel) s.defaultLetterheadId = S.letterheads[0].id; save(); render(); }));
  $$('[data-lhedit]', m).forEach(b => b.onclick = () => editLetterhead(b.dataset.lhedit));
  $('#lhAddTxt').onclick = () => { const l = { id: uid('lh'), name: 'Yeni antet', kind: 'builtin', left: '', right: '', logo: 'assets/logo.png', watermark: true, footer: '' }; S.letterheads.push(l); save(); editLetterhead(l.id); };
  $('#lhAddImg').onclick = async () => { const f = await pickFile('.png,.jpg,.jpeg'); if (!f) return; const b64 = btoa(String.fromCharCode(...f.data)); const mime = f.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'; S.letterheads.push({ id: uid('lh'), name: f.name, kind: 'image', imageData: `data:${mime};base64,${b64}`, watermark: false }); save(); render(); toast('Antet eklendi'); };
  $('#bkExp').onclick = () => saveBlob('merkezi-servis-yedek-' + todayISO() + '.json', new TextEncoder().encode(JSON.stringify(S, null, 1)));
  $('#bkImp').onclick = async () => { const f = await pickFile('.json'); if (!f) return; try { const st = JSON.parse(new TextDecoder().decode(f.data)); if (!st.persons) throw 0; confirmDlg('Mevcut veriler yedekteki verilerle değiştirilecek. Devam?', () => { S = st; save(true); render(); toast('Geri yüklendi'); }); } catch (e) { toast('Geçersiz yedek dosyası', true); } };
  $('#bkReset').onclick = () => confirmDlg('Tüm veriler silinip Excel\'den gelen başlangıç verisi yüklenecek. Devam?', async () => { S = await loadSeed(emptyState()); save(true); render(); });
  if (isElectron) { window.electronAPI.dataPath().then(p => { $('#dataPath').textContent = 'Veri dosyası: ' + p; }); window.electronAPI.appInfo().then(i => { $('#curVer').textContent = i.activeVersion + (i.updatedCopy ? ' (güncellenmiş)' : '') ; }); }
  $('#updCheck').onclick = async () => {
    const msg = $('#updMsg'); if (!isElectron) return msg.textContent = 'Sadece masaüstü uygulamasında.';
    msg.textContent = 'Kontrol ediliyor…';
    try {
      const r = await window.electronAPI.checkUpdate($('#s_upd').value.trim() || DEFAULT_UPDATE_URL);
      if (!r.available) return msg.innerHTML = `Güncel. (Mevcut ${r.current}, sunucu ${r.remote})`;
      msg.innerHTML = `Yeni sürüm bulundu: <b>${h(r.remote)}</b> (mevcut ${h(r.current)})<br>${h(r.notes)}<br><button class="btn primary sm" id="updGo">Şimdi güncelle</button>`;
      $('#updGo').onclick = async () => { msg.textContent = 'İndiriliyor…'; try { const a = await window.electronAPI.applyUpdate($('#s_upd').value.trim() || DEFAULT_UPDATE_URL); msg.textContent = 'Sürüm ' + a.version + ' yüklendi, uygulama yeniden başlatılıyor…'; save(true); setTimeout(() => window.electronAPI.relaunch(), 800); } catch (e) { msg.textContent = 'Güncelleme hatası: ' + e.message; } };
    } catch (e) { msg.textContent = 'Kontrol edilemedi: ' + (e.message || e); }
  };
  $('#updReset').onclick = async () => { if (!isElectron) return; await window.electronAPI.resetUpdate(); toast('Fabrika sürümüne dönüldü, yeniden başlatılıyor'); setTimeout(() => window.electronAPI.relaunch(), 600); };
}
function editLetterhead(id) {
  const l = S.letterheads.find(x => x.id === id);
  modal(`<h2>Antet düzenle</h2><div class="grid c2"><label class="f">Antet adı<input id="lh_name" value="${h(l.name)}"></label>
  <label class="chk" style="margin-top:16px"><input type="checkbox" id="lh_wm" ${l.watermark ? 'checked' : ''}> Arka plan filigranı (desen)</label>
  ${l.kind === 'builtin' ? `<label class="f">Sol metin (satır satır)<textarea id="lh_left" rows="4">${h(l.left)}</textarea></label><label class="f">Sağ metin (Arapça, satır satır)<textarea id="lh_right" rows="4" dir="rtl">${h(l.right)}</textarea></label><label class="f">Alt bilgi<input id="lh_foot" dir="auto" value="${h(l.footer || '')}"></label>` : ''}</div>
  ${l.kind === 'builtin' ? '<div class="row" style="margin-top:8px"><button class="btn" id="lh_logo">Logo değiştir (PNG/JPG)</button></div>' : ''}
  <div class="actions"><button class="btn" data-close>Vazgeç</button><button class="btn primary" id="lh_save">Kaydet</button></div>`, (r, close) => {
    $('#lh_save', r).onclick = () => { l.name = $('#lh_name', r).value.trim() || l.name; l.watermark = $('#lh_wm', r).checked; if (l.kind === 'builtin') { l.left = $('#lh_left', r).value; l.right = $('#lh_right', r).value; l.footer = $('#lh_foot', r).value; } save(); close(); render(); };
    const lg = $('#lh_logo', r); if (lg) lg.onclick = async () => { const f = await pickFile('.png,.jpg,.jpeg'); if (!f) return; const b64 = btoa(String.fromCharCode(...f.data)); l.logo = `data:${f.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${b64}`; toast('Logo değiştirildi (Kaydet)'); };
  });
}

// ---------------- başlangıç ----------------
(async function init() {
  S = await loadState();
  $('#verInfo').textContent = 'v' + APP_VERSION + (isElectron ? '' : ' · tarayıcı');
  $('#brandSub').textContent = S.settings.orgName;
  $$('#nav a').forEach(a => a.onclick = () => go(a.dataset.page));
  const start = () => { $('#lock').classList.add('hidden'); render(); if (S.firstRun) { delete S.firstRun; save(true); toast('Excel\'den gelen başlangıç verisi yüklendi'); } };
  if (S.settings.pin) {
    $('#lock').classList.remove('hidden');
    const tryPin = () => { if ($('#lockPin').value === S.settings.pin) start(); else $('#lockErr').textContent = 'Hatalı şifre'; };
    $('#lockBtn').onclick = tryPin; $('#lockPin').onkeydown = e => { if (e.key === 'Enter') tryPin(); }; $('#lockPin').focus();
  } else start();
})();
