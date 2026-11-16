/* Merkezi Servis – harita (Leaflet) ve Ana Hatlar
   Önce çevrimiçi: harita altlığı (CARTO / OSM) ve gerçek yol rotası (OSRM).
   Çevrimdışı: gömülü Suriye haritası ve düz/eğri çizgi. */
'use strict';
const LINE_COLORS = ['#1d4ed8', '#b45309', '#15803d', '#be185d', '#7c3aed', '#0e7490', '#b91c1c', '#4d7c0f'];
const lineColor = L => L.color || LINE_COLORS[Math.max(0, S.lines.indexOf(L)) % LINE_COLORS.length];
let mapView = { editing: false, views: {} };
let mapFitted = false; // eski kodla uyum
let LMAP = null;
let netState = 'unknown';

function lineEndB(L) {
  if (L.endB && placeById(L.endB)) return L.endB;
  const keys = ['درعا', 'جسر الشغور', 'دمشق', 'الشام', 'حلب', 'Dera', 'Cisr', 'Şam', 'Halep'];
  for (const kw of keys) { if (lname(L).includes(kw) || L.name.includes(kw)) { const hit = L.stops.map(placeById).find(p => p && p.name.includes(kw)); if (hit) return hit.id; } }
  return L.stops[L.stops.length - 1] || '';
}

// ---------------- Ana hatlar ----------------
const mlName = M => (LANG === 'ar' && M.nameAr) || (LANG === 'en' && M.nameEn) || M.name;
const mlColor = (M, i) => M.color || LINE_COLORS[(i ?? S.mainLines.indexOf(M)) % LINE_COLORS.length];
const ll = p => { const c = placeCoord(p); return [c.lat, c.lon]; };
const mlCount = M => S.persons.filter(q => personInService(q) && (M.lineIds || []).includes(q.lineId)).length;
function findPlaceId(st, kws, exact, type) {
  const ps = st.places.filter(p => !type || p.type === type);
  for (const e of (exact || [])) { const p = ps.find(x => x.name.trim() === e); if (p) return p.id; }
  for (const k of kws) { const p = ps.find(x => x.name.includes(k)); if (p) return p.id; }
  return '';
}
function defaultMainLines(st) {
  const ensure = (kws, exact, type, name) => { let id = findPlaceId(st, kws, exact, type); if (!id) { id = uid('p'); st.places.push({ id, name, type: type || 'home', exempt: null }); } return id; };
  const kad = ensure(['القادسية'], [], 'work', 'مركز القادسية (نظري)');
  const ham = ensure(['حماة'], ['مركز حماة (عملي)'], 'work', 'مركز حماة (عملي)');
  const dar = ensure(['درعا'], ['درعا'], 'home', 'درعا');
  const cis = ensure(['جسر الشغور'], ['ادلب جسر الشغور', 'جسر الشغور'], 'home', 'جسر الشغور');
  const dam = ensure(['دمشق', 'الشام'], ['دمشق'], 'home', 'دمشق');
  const lid = (pred, fb) => { const L = (st.lines || []).find(pred); return L ? [L.id] : (fb ? [fb] : []); };
  return [
    { id: 'm1', name: 'Kadısiye (Sermede) – Dera', nameAr: 'القادسية (سرمدا) – درعا', nameEn: 'Qadisiyah (Sarmada) – Daraa', fromId: kad, toId: dar, color: '#1d4ed8', lineIds: lid(L => /Kadısiye/.test(L.name) && /Dera/.test(L.name), 'l1') },
    { id: 'm2', name: 'Kadısiye (Sermede) – Cisr eş-Şuğur', nameAr: 'القادسية (سرمدا) – جسر الشغور', nameEn: 'Qadisiyah (Sarmada) – Jisr al-Shughur', fromId: kad, toId: cis, color: '#b45309', lineIds: lid(L => /Kadısiye/.test(L.name) && /Cisr/.test(L.name), 'l2') },
    { id: 'm3', name: 'Hama – Cisr eş-Şuğur', nameAr: 'حماة – جسر الشغور', nameEn: 'Hama – Jisr al-Shughur', fromId: ham, toId: cis, color: '#15803d', lineIds: lid(L => /Hama/.test(L.name) && /Cisr/.test(L.name), 'l3') },
    { id: 'm4', name: 'Hama – Şam', nameAr: 'حماة – دمشق', nameEn: 'Hama – Damascus', fromId: ham, toId: dam, color: '#be185d', lineIds: lid(L => /Hama/.test(L.name) && /Şam/.test(L.name), 'l4') }
  ];
}
function ensureMainLines(st) { if (!Array.isArray(st.mainLines)) st.mainLines = defaultMainLines(st); return st; }

function curvePts(a, b, bend) {
  const [la1, lo1] = a, [la2, lo2] = b; const dx = lo2 - lo1, dy = la2 - la1;
  const cx = (lo1 + lo2) / 2 - dy * bend, cy = (la1 + la2) / 2 + dx * bend; const out = [];
  for (let i = 0; i <= 32; i++) { const q = i / 32; out.push([(1 - q) * (1 - q) * la1 + 2 * (1 - q) * q * cy + q * q * la2, (1 - q) * (1 - q) * lo1 + 2 * (1 - q) * q * cx + q * q * lo2]); }
  return out;
}
function routeKey(M) { const a = placeById(M.fromId), b = placeById(M.toId); return [a ? ll(a).map(x => x.toFixed(4)).join(',') : '', b ? ll(b).map(x => x.toFixed(4)).join(',') : ''].join('|'); }
const routeValid = M => Array.isArray(M.route) && M.route.length > 1 && M.routeKey === routeKey(M);
function thin(pts, max) { if (pts.length <= max) return pts; const step = pts.length / max; const out = []; for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)]); out.push(pts[pts.length - 1]); return out; }
async function routeMainLine(M) {
  const a = placeById(M.fromId), b = placeById(M.toId); if (!a || !b) throw new Error(t('Başlangıç ve bitiş seçin'));
  const [la1, lo1] = ll(a), [la2, lo2] = ll(b);
  const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${lo1},${la1};${lo2},${la2}?overview=full&geometries=geojson`, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); const rt = j.routes && j.routes[0]; if (!rt) throw new Error(t('Rota bulunamadı'));
    M.route = thin(rt.geometry.coordinates.map(([lo, la]) => [+la.toFixed(5), +lo.toFixed(5)]), 500);
    M.routeKey = routeKey(M); M.routeKm = Math.round(rt.distance / 1000); M.routeMin = Math.round(rt.duration / 60);
    return true;
  } finally { clearTimeout(tm); }
}
async function autoRouteAll(force) {
  let ok = 0, fail = 0;
  for (const M of S.mainLines || []) { if (!force && routeValid(M)) continue; try { await routeMainLine(M); ok++; } catch (e) { fail++; } }
  if (ok) save();
  return { ok, fail };
}

// ---------------- harita ----------------
function mapModeSel(cur) { return [['full', 'Ayrıntılı görünüm'], ['simple', 'Sade görünüm'], ['lines', 'Sadece hatlar']].map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t(l)}</option>`).join(''); }
function mapBaseSel(cur) { return [['auto', 'Altlık: otomatik (çevrimiçi)'], ['osm', 'Altlık: ayrıntılı (OSM)'], ['offline', 'Altlık: çevrimdışı']].map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${t(l)}</option>`).join(''); }

function mountMap(container, opts) {
  opts = opts || {};
  const mode = opts.mode || S.settings.mapMode || 'full';
  const base = S.settings.mapBase || 'auto';
  const labels = S.settings.mapLabels !== false;
  const hidden = new Set(S.settings.mapHiddenLines || []);
  const legend = mode === 'lines'
    ? S.mainLines.map((M, i) => `<span class="lg" data-ml="${M.id}"><i style="background:${mlColor(M, i)}"></i>${h(mlName(M))}</span>`).join('')
    : S.lines.map(L => `<span class="lg ${hidden.has(L.id) ? 'off' : ''}" data-tline="${L.id}" title="${t('Göster / gizle')}"><i style="background:${lineColor(L)}"></i>${h(lname(L))}</span>`).join('');
  container.innerHTML = `<div class="map-wrap"><div class="map-tools">
    ${opts.compact ? '' : `<select id="mmode" class="sm">${mapModeSel(mode)}</select>`}
    <select id="mbase" class="sm">${mapBaseSel(base)}</select>
    <button class="btn sm ${labels ? 'primary' : ''}" id="mlabels">${t('Adlar')}</button>
    <button class="btn sm ${mapView.editing ? 'primary' : ''}" id="medit">${mapView.editing ? t('Konum düzenleme açık') : t('Konumları düzenle')}</button>
    <button class="btn sm" id="mfit">${t('Sığdır')}</button>
    <span class="legend">${legend}</span>
    <span style="flex:1"></span><span id="netb"></span>${opts.compact ? '' : `<button class="btn sm" id="mhide">${t('Haritayı gizle')}</button>`}</div>
    <div id="mapHost" class="lmap offline-bg ${mode}" style="height:${opts.height || 520}px" dir="ltr"></div><div id="mapPop" class="map-pop hidden"></div></div>`;
  if (LMAP) { try { LMAP.off(); LMAP.stop && LMAP.stop(); LMAP.remove(); } catch (e) { } LMAP = null; }
  const host = $('#mapHost', container); const pop = $('#mapPop', container);
  if (typeof L === 'undefined') { host.innerHTML = '<p class="muted" style="padding:20px">Leaflet yüklenemedi</p>'; return; }
  const map = L.map(host, { zoomAnimation: true, fadeAnimation: false, markerZoomAnimation: true, zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 17, zoomSnap: 0.5, wheelPxPerZoomLevel: 90 });
  LMAP = map; map.setView([35, 38], 6.5, { animate: false });
  const setNet = st => { netState = st; const b = $('#netb', container); if (b) b.innerHTML = st === 'online' ? `<span class="badge ok">● ${t('Çevrimiçi harita')}</span>` : `<span class="badge gray">○ ${t('Çevrimdışı harita')}</span>`; };
  // çevrimdışı altlık
  const off = L.layerGroup();
  L.polygon(GEO.syria.map(([lo, la]) => [la, lo]), { color: '#a89b6b', weight: 1.2, fillColor: '#f5f0e1', fillOpacity: 1, interactive: false }).addTo(off);
  GEO.neighbors.forEach(([tr, ar, en, lo, la]) => L.marker([la, lo], { interactive: false, icon: L.divIcon({ className: 'lcountry', iconSize: null, html: `<span>${h(LANG === 'ar' ? ar : LANG === 'en' ? en : tr)}</span>` }) }).addTo(off));
  if (mode === 'full') GEO.cities.forEach(([n, lo, la]) => L.marker([la, lo], { interactive: false, icon: L.divIcon({ className: 'lcity', iconSize: null, html: `<span>${h(n)}</span>` }) }).addTo(off));
  off.addTo(map);
  // çevrimiçi altlık (önce dene)
  if (base !== 'offline' && navigator.onLine !== false) {
    const url = base === 'osm' ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      : `https://{s}.basemaps.cartocdn.com/${mode === 'full' ? 'rastertiles/voyager' : 'light_all'}/{z}/{x}/{y}{r}.png`;
    const tl = L.tileLayer(url, { subdomains: base === 'osm' ? 'abc' : 'abcd', maxZoom: 19, attribution: base === 'osm' ? '© OpenStreetMap' : '© OpenStreetMap © CARTO' });
    let okc = 0, errc = 0, dead = false;
    const fallback = () => { if (dead || LMAP !== map) return; dead = true; map.removeLayer(tl); if (!map.hasLayer(off)) off.addTo(map); host.classList.add('offline-bg'); setNet('offline'); };
    tl.on('tileload', () => { if (LMAP !== map) return; if (!okc++) { map.removeLayer(off); host.classList.remove('offline-bg'); setNet('online'); } });
    tl.on('tileerror', () => { if (++errc >= 3 && !okc) fallback(); });
    tl.addTo(map); setNet('offline');
    setTimeout(() => { if (!okc) fallback(); }, 8000);
  } else setNet('offline');
  map.attributionControl.setPrefix('');

  const inService = S.persons.filter(personInService); const d0 = todayISO();
  const bounds = [];
  const stopIcon = (p, cnt, col, isWork, big) => L.divIcon({ className: 'lstop', iconSize: null, html: `<div class="lst ${isWork ? 'work' : ''} ${big ? 'big' : ''}" style="--c:${col}">${isWork ? '🏭' : (cnt || '')}</div>${labels ? `<div class="lnm">${h(p.name)}</div>` : ''}` });
  const addStop = (p, cnt, col, big, after) => {
    const mk = L.marker(ll(p), { icon: stopIcon(p, cnt, col, p.type === 'work', big), draggable: mapView.editing, riseOnHover: true, title: p.name }).addTo(map);
    mk.on('click', e => { if (!mapView.editing) showPop(p.id, e.containerPoint); });
    mk.on('dragend', async () => { const q = mk.getLatLng(); p.lat = +q.lat.toFixed(5); p.lon = +q.lng.toFixed(5); save(); if (after) await after(); mountMap(container, opts); });
    bounds.push(ll(p));
  };

  if (mode === 'lines') {
    const ends = {};
    S.mainLines.forEach((M, i) => {
      const a = placeById(M.fromId), b = placeById(M.toId); if (!a || !b) return;
      const col = mlColor(M, i); const ok = routeValid(M);
      const pts = ok ? M.route : curvePts(ll(a), ll(b), i % 2 ? -0.12 : 0.12);
      L.polyline(pts, { color: '#fff', weight: 10, opacity: .9, interactive: false }).addTo(map);
      L.polyline(pts, { color: col, weight: 5, dashArray: ok ? null : '10 8', lineCap: 'round' }).addTo(map)
        .bindTooltip(`${h(mlName(M))} — ${ok ? M.routeKm + ' km · ' + t('yol rotası') : t('düz çizgi (çevrimdışı)')}`, { sticky: true });
      const mid = pts[Math.floor((pts.length - 1) * (i % 2 ? 0.38 : 0.62))];
      L.marker(mid, { icon: L.divIcon({ className: 'lmtag', iconSize: null, html: `<div class="mtag" style="background:${col}">${h(mlName(M))} · ${mlCount(M)} ${t('kişi')}${ok ? ' · ' + M.routeKm + ' km' : ''}</div>` }) }).addTo(map).on('click', () => { if (page !== 'mainlines') go('mainlines'); });
      ends[a.id] = a; ends[b.id] = b; pts.forEach(x => bounds.push(x));
    });
    Object.values(ends).forEach(p => {
      const cnt = inService.filter(q => q.homeId === p.id || (p.type === 'work' && q.workId === p.id)).length;
      addStop(p, cnt, p.type === 'work' ? '#8a7a4e' : '#1f2937', true, async () => {
        const aff = S.mainLines.filter(M => M.fromId === p.id || M.toId === p.id);
        for (const M of aff) { try { await routeMainLine(M); } catch (e) { } } save();
      });
    });
  } else {
    const simple = mode === 'simple';
    const visibleP = p => { if (S.lines.some(Lx => hidden.has(Lx.id) && Lx.stops.includes(p.id)) && !S.lines.some(Lx => !hidden.has(Lx.id) && (Lx.stops.includes(p.id) || Lx.endA === p.id))) return false; if (!simple || p.type === 'work') return true; return inService.some(q => q.homeId === p.id); };
    S.lines.forEach(Lx => {
      if (hidden.has(Lx.id)) return;
      const ids = [Lx.endA, ...Lx.stops].filter(id => { const p = placeById(id); return p && visibleP(p); }); if (ids.length < 2) return;
      const pts = ids.map(id => ll(placeById(id))); const col = lineColor(Lx);
      L.polyline(pts, { color: '#fff', weight: simple ? 6 : 7, opacity: .9, interactive: false }).addTo(map);
      L.polyline(pts, { color: col, weight: simple ? 3 : 4, dashArray: simple ? null : '8 6' }).addTo(map).bindTooltip(h(lname(Lx)), { sticky: true }).on('click', () => { selLine = Lx.id; go('lines'); });
    });
    const used = new Set(); S.lines.forEach(Lx => { used.add(Lx.endA); Lx.stops.forEach(s => used.add(s)); }); S.persons.forEach(p => { if (p.homeId) used.add(p.homeId); if (p.workId) used.add(p.workId); });
    S.places.filter(p => used.has(p.id) && visibleP(p)).forEach(p => {
      const isWork = p.type === 'work'; const cnt = inService.filter(q => q.homeId === p.id || (isWork && q.workId === p.id)).length;
      const onLine = S.lines.find(Lx => Lx.stops.includes(p.id));
      addStop(p, cnt, isWork ? '#8a7a4e' : (!isWork && placeExempt(p)) ? '#9ca3af' : onLine ? lineColor(onLine) : '#64748b', false, async () => { for (const M of S.mainLines.filter(M => M.fromId === p.id || M.toId === p.id)) { try { await routeMainLine(M); } catch (e) { } } save(); });
    });
  }
  // görünüm (her mod için hatırlanır)
  const vkey = mode + (opts.compact ? '-c' : '');
  const v = mapView.views[vkey];
  const fit = () => { if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], animate: false }); else map.setView([35, 38], 6.5); };
  if (v && !opts.refit) map.setView(v.c, v.z, { animate: false }); else fit();
  const zcls = () => host.classList.toggle('zlow', map.getZoom() < 8.5);
  map.on('moveend zoomend', () => { mapView.views[vkey] = { c: map.getCenter(), z: map.getZoom() }; zcls(); pop.classList.add('hidden'); });
  zcls();
  map.on('click', () => pop.classList.add('hidden'));
  setTimeout(() => { if (LMAP === map) map.invalidateSize(); }, 50);

  function showPop(pid, cpt) {
    const p = placeById(pid);
    const ps = S.persons.filter(q => q.homeId === pid || (p.type === 'work' && q.workId === pid));
    const ins = ps.filter(personInService); const atWork = ins.filter(q => personStatusAt(q, d0) === 'work').length;
    const Ls = S.lines.filter(Lx => Lx.stops.includes(pid) || Lx.endA === pid);
    pop.innerHTML = `<div class="row between"><b dir="auto">${h(p.name)}</b><button class="btn sm" id="popX">✕</button></div>
      <div class="small muted">${p.type === 'work' ? t('İşyeri') : t('Ev')} · ${Ls.map(Lx => h(lname(Lx))).join(', ') || t('hatta bağlı değil')}${placeExempt(p) && p.type !== 'work' ? ' · <span class="badge warn">' + t('muaf yer') + '</span>' : ''}</div>
      <div class="kv" style="margin:6px 0"><b>${t('Serviste')}</b><span>${ins.length} (${t('işte')} ${atWork} / ${t('evde')} ${ins.length - atWork})</span><b>${t('Muaf / pasif')}</b><span>${ps.length - ins.length}</span></div>
      <div class="pill-list">${ins.slice(0, 12).map(q => `<span class="pill" data-pp="${q.id}" title="${t('Düzenle')}"><span dir="auto">${h(q.name)}</span><span class="muted">${h(q.group)}</span></span>`).join('')}${ins.length > 12 ? `<span class="pill">+${ins.length - 12}</span>` : ''}</div>
      <div class="row" style="margin-top:8px;gap:6px">
        <button class="btn sm primary" id="popAdd">+ ${t('Kişi ekle')}</button>
        <button class="btn sm" id="popList">${t('Kişileri gör')}</button>
        ${Ls[0] ? `<button class="btn sm" id="popLine">${t('Hattı aç')}</button>` : ''}
        <button class="btn sm" id="popPlace">${t('Yeri düzenle')}</button></div>`;
    pop.classList.remove('hidden');
    const W = host.clientWidth, H = host.clientHeight + 40; let px = cpt.x + 14, py = cpt.y + 50;
    if (px + 340 > W) px = Math.max(0, cpt.x - 350); if (py + 240 > H) py = Math.max(40, py - 250);
    pop.style.left = px + 'px'; pop.style.top = py + 'px';
    $('#popX', pop).onclick = () => pop.classList.add('hidden');
    $('#popAdd', pop).onclick = () => editPerson(null, { homeId: p.type === 'work' ? '' : pid, workId: p.type === 'work' ? pid : '', lineId: (Ls[0] || {}).id || '' });
    $('#popList', pop).onclick = () => { pf = { q: '', group: '', line: '', status: '', work: '', place: pid }; go('persons'); };
    const pl = $('#popLine', pop); if (pl) pl.onclick = () => { selLine = Ls[0].id; go('lines'); };
    $('#popPlace', pop).onclick = () => editPlace(pid);
    $$('[data-pp]', pop).forEach(el => el.onclick = () => editPerson(el.dataset.pp));
  }

  // araç çubuğu
  const re = o => mountMap(container, Object.assign({}, opts, o || {}));
  const mm = $('#mmode', container); if (mm) mm.onchange = e => { S.settings.mapMode = e.target.value; save(); re(); };
  $('#mbase', container).onchange = e => { S.settings.mapBase = e.target.value; save(); re(); };
  $('#mlabels', container).onclick = () => { S.settings.mapLabels = !labels; save(); re(); };
  $('#medit', container).onclick = () => { mapView.editing = !mapView.editing; re(); if (mapView.editing) toast(t('Noktaları sürükleyerek yerini değiştirebilirsiniz')); };
  $('#mfit', container).onclick = () => { delete mapView.views[vkey]; re({ refit: true }); };
  const mh = $('#mhide', container); if (mh) mh.onclick = () => { S.settings.mapHidden = true; save(); render(); };
  $$('[data-tline]', container).forEach(el => el.onclick = () => { const id = el.dataset.tline; let hl = S.settings.mapHiddenLines || []; hl = hl.includes(id) ? hl.filter(x => x !== id) : hl.concat(id); S.settings.mapHiddenLines = hl; save(); re(); });
  $$('[data-ml]', container).forEach(el => el.onclick = () => { if (page !== 'mainlines') go('mainlines'); });
}
function fitMap() { mapView.views = {}; }

// ---------------- Ana Hatlar sayfası ----------------
function renderMainLines(m) {
  const allPlaces = S.places.slice().sort((a, b) => (a.type === 'work' ? 0 : 1) - (b.type === 'work' ? 0 : 1) || sortTR(a.name, b.name));
  m.innerHTML = `<h1>${t('Ana Hatlar')}</h1>
  <p class="small muted">${t('Ana hatların başlangıç ve bitiş noktalarını buradan düzenleyin; harita siz yazdıkça güncellenir. Rota önce çevrimiçi (gerçek yol) hesaplanır; internet yoksa düz çizgi (çevrimdışı) çizilir. Noktaların yerini haritada "Konumları düzenle" ile sürükleyerek de düzeltebilirsiniz.')}</p>
  <div class="toolbar"><button class="btn primary" id="mlAdd">+ ${t('Yeni ana hat')}</button><button class="btn" id="mlRouteAll">🛣️ ${t('Tüm rotaları çevrimiçi düzelt')}</button><button class="btn" id="mlDefaults">${t('Varsayılan 4 hattı yükle')}</button><span id="mlMsg" class="small muted"></span></div>
  <div id="mltbl"></div>
  <div class="card tight" id="mlMap"></div>`;
  const map = () => mountMap($('#mlMap', m), { mode: 'lines', compact: true, height: 480 });
  let mt; const refreshMap = (refit) => { clearTimeout(mt); mt = setTimeout(() => { if (refit) delete mapView.views['lines-c']; map(); }, 250); };
  const msg = s => { $('#mlMsg', m).textContent = s; };
  const status = M => routeValid(M) ? `<span class="badge ok">${t('yol rotası')} · ${M.routeKm} km · ~${Math.round(M.routeMin / 6) / 10} ${t('saat')}</span>` : `<span class="badge gray">${t('düz çizgi (çevrimdışı)')}</span>`;
  const tryRoute = async (M, row) => { const st = row && row.querySelector('.mlst'); if (st) st.innerHTML = `<span class="badge info">${t('rota hesaplanıyor…')}</span>`; try { await routeMainLine(M); save(); } catch (e) { } if (st) st.innerHTML = status(M); refreshMap(); };
  const draw = () => {
    $('#mltbl', m).innerHTML = S.mainLines.map((M, i) => `<div class="mlcard" data-m="${M.id}" style="--c:${mlColor(M, i)}">
        <div class="mlrow">
          <span class="mlord"><button class="btn sm" data-up="${i}">▲</button><button class="btn sm" data-dn="${i}">▼</button></span>
          <input type="color" class="f-color" value="${mlColor(M, i)}" title="${t('Renk')}">
          <label class="f grow">${t('Ad')} (TR)<input class="f-name" value="${h(M.name)}"></label>
          <label class="f grow">${t('Ad')} (AR)<input class="f-nameAr" dir="rtl" value="${h(M.nameAr || '')}"></label>
          <label class="f grow">${t('Ad')} (EN)<input class="f-nameEn" value="${h(M.nameEn || '')}"></label>
        </div>
        <div class="mlrow">
          <label class="f grow">${t('Başlangıç')}<select class="f-from" dir="auto">${opt(allPlaces, M.fromId, x => (x.type === 'work' ? '🏭 ' : '') + x.name, x => x.id, t('— seçiniz —'))}</select></label>
          <span class="mlarrow">⇄</span>
          <label class="f grow">${t('Bitiş')}<select class="f-to" dir="auto">${opt(allPlaces, M.toId, x => (x.type === 'work' ? '🏭 ' : '') + x.name, x => x.id, t('— seçiniz —'))}</select></label>
          <span class="mlst">${status(M)}</span>
          <span><button class="btn sm" data-rt="${M.id}" title="${t('Rotayı çevrimiçi hesapla')}">⟳ ${t('Rota')}</button> <button class="btn sm" data-st="${M.id}" title="${t('Düz çizgi yap')}">／</button> <button class="btn sm danger" data-del="${M.id}">✕</button></span>
        </div>
        <div class="mlrow small"><span class="muted">${t('Bağlı hatlar (kişi sayısı için)')}:</span>${S.lines.map(Lx => `<label class="chk small"><input type="checkbox" class="f-line" value="${Lx.id}" ${(M.lineIds || []).includes(Lx.id) ? 'checked' : ''}>${h(lname(Lx))}</label>`).join('')}<span class="muted">· ${mlCount(M)} ${t('kişi')}</span></div>
      </div>`).join('') + (S.mainLines.length ? '' : `<p class="muted">${t('Kayıt yok')}</p>`);
    $$('.mlcard', m).forEach(tr => {
      const M = S.mainLines.find(x => x.id === tr.dataset.m);
      const bind = (sel, key, ev) => { const el = $(sel, tr); el.addEventListener(ev || 'input', () => { M[key] = el.value; save(); refreshMap(); }); };
      bind('.f-name', 'name'); bind('.f-nameAr', 'nameAr'); bind('.f-nameEn', 'nameEn'); bind('.f-color', 'color');
      ['.f-from', '.f-to'].forEach(sel => $(sel, tr).addEventListener('change', e => { M[sel === '.f-from' ? 'fromId' : 'toId'] = e.target.value; save(); refreshMap(true); tryRoute(M, tr); }));
      $$('.f-line', tr).forEach(cb => cb.addEventListener('change', () => { M.lineIds = $$('.f-line', tr).filter(x => x.checked).map(x => x.value); save(); refreshMap(); }));
    });
    $$('[data-up]', m).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [S.mainLines[i - 1], S.mainLines[i]] = [S.mainLines[i], S.mainLines[i - 1]]; save(); draw(); refreshMap(); } });
    $$('[data-dn]', m).forEach(b => b.onclick = () => { const i = +b.dataset.dn; if (i < S.mainLines.length - 1) { [S.mainLines[i + 1], S.mainLines[i]] = [S.mainLines[i], S.mainLines[i + 1]]; save(); draw(); refreshMap(); } });
    $$('[data-rt]', m).forEach(b => b.onclick = async () => { const M = S.mainLines.find(x => x.id === b.dataset.rt); const tr = b.closest('.mlcard'); await tryRoute(M, tr); if (!routeValid(M)) toast(t('Çevrimiçi rota alınamadı; düz çizgi kullanılıyor'), true); });
    $$('[data-st]', m).forEach(b => b.onclick = () => { const M = S.mainLines.find(x => x.id === b.dataset.st); delete M.route; delete M.routeKey; save(); draw(); refreshMap(); });
    $$('[data-del]', m).forEach(b => b.onclick = () => confirmDlg(t('Ana hat silinsin mi?'), () => { S.mainLines = S.mainLines.filter(x => x.id !== b.dataset.del); save(); draw(); refreshMap(true); }));
  };
  draw(); map();
  $('#mlAdd', m).onclick = () => { S.mainLines.push({ id: uid('m'), name: t('Yeni ana hat'), nameAr: '', nameEn: '', fromId: (workPlaces()[0] || {}).id || '', toId: '', color: LINE_COLORS[S.mainLines.length % LINE_COLORS.length], lineIds: [] }); save(); draw(); };
  $('#mlDefaults', m).onclick = () => confirmDlg(t('Ana hatlar varsayılan 4 hatla değiştirilsin mi?'), async () => { S.mainLines = defaultMainLines(S); save(); draw(); refreshMap(true); msg(t('rota hesaplanıyor…')); const r = await autoRouteAll(true); msg(r.ok ? t('{0} rota çevrimiçi düzeltildi', r.ok) : t('Çevrimdışı: düz çizgi kullanılıyor')); draw(); refreshMap(); });
  $('#mlRouteAll', m).onclick = async () => { msg(t('rota hesaplanıyor…')); const r = await autoRouteAll(true); msg(r.ok ? t('{0} rota çevrimiçi düzeltildi', r.ok) + (r.fail ? ' · ' + t('{0} başarısız', r.fail) : '') : t('Çevrimdışı: düz çizgi kullanılıyor')); draw(); refreshMap(); };
}
