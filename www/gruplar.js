/* Merkezi Servis – Grup araçları: tek tuşla kategori (Ev / işyeri) atama,
   grup adını değiştirme, otomatik Ev ↔ İş rotasyonu, işlem geçmişi ve geri alma.
   app.js'teki yardımcıları (S, t, h, $, $$, save, render, modal…) kullanır. */
'use strict';

// ---- Rotasyon kuralı: değişim tarihlerinin hesaplandığı "etkin" grup ayarı ----
// - Sabitlenmiş grup ya da duraklatılmış rotasyon → hiç değişim yok
// - Tarih girilmemişse ve otomatik rotasyon açıksa → "bu durumdan beri" + döngü günü
function groupCfg(g) {
  const st = S.settings;
  if (g.pinned || st.rotationPaused) return Object.assign({}, g, { customDates: [], nextChange: '' });
  const hasAnchor = (g.customDates || []).some(Boolean) || !!g.nextChange;
  if (!hasAnchor && st.autoRotate !== false) return Object.assign({}, g, { nextChange: addDays(g.statusSince || todayISO(), Math.max(1, st.cycleDays | 0 || 10)) });
  return g;
}

// ---- Kategoriler: Ev + tüm işyerleri ----
function groupCategories() {
  return [{ id: 'home', label: '🏠 ' + t('Ev') }].concat(workPlaces().map(w => ({ id: w.id, label: '🏭 ' + shortWork(w) })));
}
// Grubun bugünkü konumu: 'home' | işyeri id | 'work'
function groupLocationAt(g, d) {
  if (groupStatusAt(g, d || todayISO()) !== 'work') return 'home';
  return (g.workPlaceId && placeById(g.workPlaceId)) ? g.workPlaceId : 'work';
}
const groupLocLabel = loc => loc === 'home' ? '🏠 ' + t('Evde') : loc === 'work' ? '🏭 ' + t('İşte') : '🏭 ' + shortWork(placeById(loc));

// ---- Geçmiş (log) ----
const snapGroup = g => JSON.parse(JSON.stringify({ id: g.id, name: g.name, status: g.status, statusSince: g.statusSince, nextChange: g.nextChange, customDates: g.customDates || [], workPlaceId: g.workPlaceId || '', pinned: !!g.pinned }));
function logGroup(kind, gids, text, extra) {
  S.groupLog = S.groupLog || [];
  const groups = gids.map(groupById).filter(Boolean);
  const ov = {}; S.persons.forEach(p => { if (gids.includes(p.group) && p.statusOverride) ov[p.id] = JSON.parse(JSON.stringify(p.statusOverride)); });
  const e = Object.assign({ id: uid('gl'), at: Date.now(), date: todayISO(), kind, gids, text, snap: { groups: groups.map(snapGroup), ov, settings: { rotationPaused: !!S.settings.rotationPaused, autoRotate: S.settings.autoRotate !== false } } }, extra || {});
  S.groupLog.unshift(e); if (S.groupLog.length > 200) S.groupLog.length = 200;
  return e;
}
function lastUndoable() { return (S.groupLog || []).find(e => e.kind !== 'auto' && !e.undone); }
function undoGroupLog(id) {
  const e = (S.groupLog || []).find(x => x.id === id); if (!e || e.undone) return;
  if (e !== lastUndoable()) return toast(t('Yalnızca en son işlem geri alınabilir'), true);
  e.snap.groups.forEach(sg => { const g = groupById(sg.id); if (g) Object.assign(g, JSON.parse(JSON.stringify(sg))); });
  S.persons.forEach(p => { if (e.gids.includes(p.group)) { if (e.snap.ov[p.id]) p.statusOverride = e.snap.ov[p.id]; else delete p.statusOverride; } });
  if (e.kind === 'pause' || e.kind === 'resume' || e.kind === 'rotate') { S.settings.rotationPaused = e.snap.settings.rotationPaused; }
  e.undone = true; save(); render(); toast(t('Geri alındı') + ': ' + e.text);
}
// Otomatik rotasyonları da geçmişe yaz (açılışta, kaçırılan günler dahil)
function rotLogCatchUp() {
  const d0 = todayISO(); let from = S.rotLogDone ? addDays(S.rotLogDone, 1) : d0;
  if (diffDays(from, d0) > 60) from = addDays(d0, -60);
  if (from > d0) return;
  let changed = false;
  for (let d = from; d <= d0; d = addDays(d, 1)) {
    const gs = S.groups.filter(g => d > (g.statusSince || '') && changeDatesBetween(g, S.settings.cycleDays, d, d).length && groupStatusAt(g, d) !== groupStatusAt(g, addDays(d, -1)));
    if (!gs.length) continue;
    const txt = gs.map(g => g.name + ' → ' + (groupStatusAt(g, d) === 'work' ? t('İşe') : t('Eve'))).join(', ');
    S.groupLog = S.groupLog || [];
    S.groupLog.unshift({ id: uid('gl'), at: parseISO(d).getTime(), date: d, kind: 'auto', gids: gs.map(g => g.id), text: t('Otomatik rotasyon') + ': ' + txt });
    changed = true;
  }
  if (S.groupLog && S.groupLog.length > 200) S.groupLog.length = 200;
  S.rotLogDone = d0; if (changed) save();
}

// ---- İşlemler ----
function resetCycleFrom(g, d0) {
  g.statusSince = d0;
  g.customDates = (g.customDates || []).filter(x => x > d0);
  g.nextChange = g.customDates.length ? '' : addDays(d0, Math.max(1, S.settings.cycleDays | 0 || 10));
}
function moveGroups(gids, target) {
  gids = gids.filter(groupById); if (!gids.length) return toast(t('Önce grup seçin'), true);
  const d0 = todayISO(); const cat = groupCategories().find(c => c.id === target); if (!cat) return;
  logGroup('move', gids, gids.map(id => groupById(id).name).join(', ') + ' → ' + cat.label);
  gids.forEach(id => {
    const g = groupById(id);
    g.status = target === 'home' ? 'home' : 'work';
    if (target !== 'home') g.workPlaceId = target;
    resetCycleFrom(g, d0);
    S.persons.forEach(p => { if (p.group === id) delete p.statusOverride; });
  });
  save(); render(); toast(gids.map(id => groupById(id).name).join(', ') + ' → ' + cat.label);
}
function rotateNow(gids) {
  const d0 = todayISO(); gids = gids.filter(id => { const g = groupById(id); return g && !g.pinned; });
  if (!gids.length) return toast(t('Değiştirilecek grup yok (hepsi sabit)'), true);
  logGroup('rotate', gids, t('Elle rotasyon') + ': ' + gids.map(id => { const g = groupById(id); return g.name + ' → ' + (groupStatusAt(g, d0) === 'work' ? t('Eve') : t('İşe')); }).join(', '));
  gids.forEach(id => { const g = groupById(id); g.status = groupStatusAt(g, d0) === 'work' ? 'home' : 'work'; resetCycleFrom(g, d0); S.persons.forEach(p => { if (p.group === id) delete p.statusOverride; }); });
  save(); render(); toast(t('Rotasyon uygulandı'));
}
function setPaused(on) {
  const d0 = todayISO();
  logGroup(on ? 'pause' : 'resume', S.groups.map(g => g.id), on ? t('Rotasyon duraklatıldı') : t('Rotasyon devam ediyor'));
  if (on) { S.groups.forEach(g => { g.status = groupStatusAt(g, d0); g.statusSince = d0; }); S.settings.rotationPaused = true; }
  else { S.settings.rotationPaused = false; S.groups.forEach(g => { if (!g.pinned) resetCycleFrom(g, d0); }); }
  save(); render(); toast(on ? t('Rotasyon duraklatıldı') : t('Rotasyon devam ediyor'));
}
function setPinned(id, on) {
  const g = groupById(id); if (!g) return; const d0 = todayISO();
  logGroup('pin', [id], g.name + ': ' + (on ? t('rotasyondan muaf (sabit)') : t('rotasyona dahil')));
  if (on) { g.status = groupStatusAt(g, d0); g.statusSince = d0; g.pinned = true; }
  else { g.pinned = false; resetCycleFrom(g, d0); }
  save(); render();
}
function nameTaken(name, exceptId) {
  const n = String(name).trim().toLocaleLowerCase('tr');
  return S.groups.some(g => g.id !== exceptId && (String(g.name).toLocaleLowerCase('tr') === n || String(g.id).toLocaleLowerCase('tr') === n));
}
function renameGroup(id) {
  const g = groupById(id); if (!g) return;
  modal(`<h2>✎ ${t('Grup adını değiştir')}</h2>
    <label class="f">${t('Yeni ad')}<input id="rgN" value="${h(g.name)}" maxlength="30"></label>
    <p class="small muted">${t('Kişiler, geçmiş ve raporlar otomatik olarak yeni adı kullanır; hiçbir kayıt silinmez.')}</p>
    <div class="actions">${cancelBtn()}<button class="btn primary" id="rgOk">${t('Kaydet')}</button></div>`, (r, close) => {
    const inp = $('#rgN', r); inp.focus(); inp.select();
    const ok = () => {
      const v = inp.value.trim(); if (!v) return toast(t('Ad boş olamaz'), true);
      if (v === g.name) return close();
      if (nameTaken(v, id)) return toast(t('Bu adda başka bir grup var'), true);
      logGroup('rename', [id], g.name + ' → ' + v); g.name = v; save(); close(); render(); toast(t('Grup adı değiştirildi'));
    };
    $('#rgOk', r).onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
  });
}

// ---- Arayüz: Genel Durum'daki grup kartı ----
function groupQuickTable(d0, inService) {
  rotLogCatchUp();
  const cats = groupCategories();
  const lu = lastUndoable();
  return `<div class="card"><h2>${t('Gruplar – bugün')}${lu ? ` <button class="btn sm" data-gundo="${lu.id}" title="${h(lu.text)}" style="float:inline-end">↶ ${t('Geri al')}</button>` : ''}</h2>
    ${S.settings.rotationPaused ? `<p class="badge warn">⏸ ${t('Otomatik rotasyon duraklatıldı')}</p>` : ''}
    <table><tr><th>${t('Grup')}</th><th>${t('Konum')}</th><th>${t('Kişi')}</th><th>${t('Sonraki değişim')}</th><th>${t('Kalan')}</th><th>${t('Tek tuşla taşı')}</th></tr>
    ${S.groups.map(g => {
      const loc = groupLocationAt(g, d0); const nx = groupNextChange(g, addDays(d0, 1)); const cnt = inService.filter(p => p.group === g.id).length;
      return `<tr><td><b>${h(g.name)}</b> <button class="btn sm ghost" data-gren="${h(g.id)}" title="${t('Grup adını değiştir')}">✎</button>${g.pinned ? ' 📌' : ''}</td>
        <td><span class="badge ${loc === 'home' ? 'gray' : 'ok'}">${h(groupLocLabel(loc))}</span></td><td>${cnt}</td>
        <td>${nx ? fmt(nx) + ' ' + dayName(nx) : `<span class="badge warn">${g.pinned ? t('sabit') : S.settings.rotationPaused ? t('duraklatıldı') : t('tarih girilmedi')}</span>`}</td><td>${nx ? diffDays(d0, nx) + ' ' + t('gün') : ''}</td>
        <td><div class="gq">${cats.map(c => `<button class="btn sm ${loc === c.id ? 'primary' : ''}" data-gmove="${h(g.id)}" data-cat="${h(c.id)}" ${loc === c.id ? 'disabled' : ''}>${h(c.label)}</button>`).join('')}</div></td></tr>`;
    }).join('')}
    </table>
    <p class="small muted">${t('Her')} ${S.settings.cycleDays} ${t('günde bir evdekiler işe, işteki gruplar eve otomatik geçer.')} <a href="#" data-go="shifts">${t('Vardiya & Değişim')}</a></p>
  </div>`;
}
function bindGroupQuick(m) {
  $$('[data-gmove]', m).forEach(b => b.onclick = () => moveGroups([b.dataset.gmove], b.dataset.cat));
  $$('[data-gren]', m).forEach(b => b.onclick = () => renameGroup(b.dataset.gren));
  $$('[data-gundo]', m).forEach(b => b.onclick = () => undoGroupLog(b.dataset.gundo));
}

// ---- Arayüz: Vardiya sayfasındaki araç kartları ----
function groupToolsHtml() {
  rotLogCatchUp();
  const d0 = todayISO(); const cats = groupCategories(); const nx = S.groups.map(g => groupNextChange(g, addDays(d0, 1))).filter(Boolean).sort()[0];
  const lu = lastUndoable(); const log = (S.groupLog || []).slice(0, 15);
  return `<div class="grid c2">
  <div class="card"><h2>⚡ ${t('Tek tuşla grup taşıma')}</h2>
    <p class="small muted">${t('Grupları işaretleyin, sonra gidecekleri yere basın. Döngü bugünden yeniden başlar.')}</p>
    <div class="row gsel">${S.groups.map(g => { const loc = groupLocationAt(g, d0); return `<label class="pill"><input type="checkbox" data-gpick="${h(g.id)}"> <b>${h(g.name)}</b> <span class="muted small">${h(groupLocLabel(loc))}</span></label>`; }).join('')}</div>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="gpAll">${t('Tümünü seç')}</button><button class="btn sm" id="gpNone">${t('Seçimi kaldır')}</button></div>
    <div class="row gq" style="margin-top:10px">${cats.map(c => `<button class="btn" data-gbulk="${h(c.id)}">${h(c.label)}</button>`).join('')}</div>
  </div>
  <div class="card"><h2>🔄 ${t('Otomatik rotasyon (Ev ↔ İş)')}</h2>
    <label class="f"><span><input type="checkbox" id="rAuto" ${S.settings.autoRotate !== false ? 'checked' : ''}> ${t('Tarih girilmemiş gruplar her döngüde otomatik değişsin')}</span></label>
    <p>${S.settings.rotationPaused ? `<span class="badge warn">⏸ ${t('Duraklatıldı')}</span>` : `<span class="badge ok">▶ ${t('Çalışıyor')}</span>`} · ${t('Döngü')}: <b>${S.settings.cycleDays}</b> ${t('gün')} · ${t('Sonraki değişim')}: <b>${nx ? fmt(nx) + ' ' + dayName(nx) + ' (' + diffDays(d0, nx) + ' ' + t('gün') + ')' : '—'}</b></p>
    <table><tr><th>${t('Grup')}</th><th>${t('Şu an')}</th><th>${t('Sonraki değişim')}</th><th>📌 ${t('Sabit (muaf)')}</th></tr>
    ${S.groups.map(g => { const n = groupNextChange(g, addDays(d0, 1)); return `<tr><td><b>${h(g.name)}</b></td><td>${h(groupLocLabel(groupLocationAt(g, d0)))}</td><td>${n ? fmt(n) : '—'}</td><td><input type="checkbox" data-gpin="${h(g.id)}" ${g.pinned ? 'checked' : ''}></td></tr>`; }).join('')}
    </table>
    <div class="row" style="margin-top:10px">
      <button class="btn primary" id="rNow">🔄 ${t('Şimdi değiştir (tüm gruplar)')}</button>
      <button class="btn" id="rPause">${S.settings.rotationPaused ? '▶ ' + t('Devam ettir') : '⏸ ' + t('Duraklat')}</button>
    </div>
  </div></div>
  <div class="card"><h2>🕘 ${t('Grup işlem geçmişi')}</h2>
    ${log.length ? `<table><tr><th>${t('Tarih')}</th><th>${t('İşlem')}</th><th></th></tr>${log.map(e => `<tr style="${e.undone ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${fmt(e.date)} ${e.kind === 'auto' ? '' : new Date(e.at).toLocaleTimeString(LANG === 'ar' ? 'ar-SY' : LANG, { hour: '2-digit', minute: '2-digit' })}</td><td dir="auto">${e.kind === 'auto' ? '⏱ ' : ''}${h(e.text)}</td><td>${lu && e.id === lu.id ? `<button class="btn sm" data-gundo="${e.id}">↶ ${t('Geri al')}</button>` : ''}</td></tr>`).join('')}</table>` : `<p class="muted small">${t('Henüz işlem yok')}</p>`}
  </div>`;
}
function bindGroupTools(m) {
  const picked = () => $$('[data-gpick]', m).filter(x => x.checked).map(x => x.dataset.gpick);
  $('#gpAll', m).onclick = () => $$('[data-gpick]', m).forEach(x => x.checked = true);
  $('#gpNone', m).onclick = () => $$('[data-gpick]', m).forEach(x => x.checked = false);
  $$('[data-gbulk]', m).forEach(b => b.onclick = () => moveGroups(picked(), b.dataset.gbulk));
  $$('[data-gpin]', m).forEach(x => x.onchange = () => setPinned(x.dataset.gpin, x.checked));
  $('#rAuto', m).onchange = e => { S.settings.autoRotate = e.target.checked; save(); render(); };
  $('#rNow', m).onclick = () => confirmDlg(t('Sabit olmayan tüm gruplar şimdi yer değiştirsin mi? (evdekiler işe, işteki gruplar eve)'), () => rotateNow(S.groups.map(g => g.id)));
  $('#rPause', m).onclick = () => setPaused(!S.settings.rotationPaused);
  $$('[data-gundo]', m).forEach(b => b.onclick = () => undoGroupLog(b.dataset.gundo));
  $$('[data-gren]', m).forEach(b => b.onclick = () => renameGroup(b.dataset.gren));
}
