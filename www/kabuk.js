/* Merkezi Servis — ortak çekirdek kabuğu (www/cekirdek/fc-core.js).
   Burada: kenar çubuğu menüsü, sağ üst sıra (Eşitle · Güncelle · Tema · Dil | Küçült · Orta · Tam ekran · Kapat),
   "klasik" renk şeması (1.0.x'in eski renkleri), ayarlar düzeni (Admin ile iletişim EN SON), Kullanım Limitleri,
   ilk açılış sihirbazı, "neler yeni", duyurular, çökme raporu ve ESKİ KABUK KÖPRÜSÜ.
   app.js'ten ÖNCE yüklenir; app.js'in genel değişkenlerine (S, LANG, t, save, render…) yalnız çağrı anında erişir.

   Eski kabuk köprüsü: ≤1.0.11 kurulumlarının main.js'i yalnız www/ dosyalarını raw.githubusercontent'ten indirip
   %APPDATA%\Merkezi Servis\app-update\www altından açar (main.js / preload.js güncellenmez). O kabukta window.fcHost yoktur,
   window.electronAPI.applyUpdate vardır → bu arayüz yine çalışır, ama yeni kurulum dosyasını indirmesi için kullanıcıyı yönlendirir. */
(function () {
  'use strict';
  var OWNER = 'departures-mil', REPO = 'merkezi-servis', APP = 'merkezi-servis', PREFIX = 'MerkeziServis';
  var REL = window.APP_RELEASE || { version: '0.0.0', notes: {} };
  var VER = REL.version;
  var api0 = window.electronAPI || null;
  var LEGACY = !!(api0 && !window.fcHost && api0.shell !== 'fc');
  var ui = FC.ui;

  /* ---------- metinler (app'in sözlüğü Türkçe anahtarlı) ---------- */
  var EN = {
    'Genel': 'General', 'Servis': 'Service', 'Filo': 'Fleet', 'Sistem': 'System', 'Veri özeti': 'Data summary',
    'Veri eşitleme': 'Data sync', 'Kurum rengi ve açılış': 'Brand colour and splash',
    'Renk şeması, koyu/açık mod ve yazı boyutu Görünüm kartındadır. Kurum rengi seçilirse şemanın vurgu rengini geçersiz kılar.': 'Colour scheme, dark/light mode and text size are in the Appearance card. A brand colour, if chosen, overrides the scheme accent.',
    'Bu program bulut ya da Wi-Fi eşitlemesi kullanmaz; veriler yalnız bu bilgisayarda saklanır. Başka bilgisayara taşımak ya da yedeklemek için:': 'This program does not use cloud or Wi-Fi sync; data is stored only on this computer. To back up or move it to another computer:',
    'Yedek al (JSON)': 'Back up (JSON)', 'Yedekten geri yükle': 'Restore from backup', "Excel'e ver": 'Export to Excel', 'Kapat': 'Close',
    'Bu program bulut eşitlemesi kullanmaz; veriler bu bilgisayarda kalır, güncellemeler GitHub\'dan ücretsiz gelir. Danışman yalnız sizin kendi yapay zekâ anahtarınızla çalışır.': 'This program does not use cloud sync; data stays on this computer and updates come free from GitHub. The Advisor works only with your own AI key.',
    'Yeni kurulum gerekli': 'New installer required',
    'Merkezi Servis {0} yeni bir kurulum programıyla gelir: tam ekran açılış, tek tuşla güncelleme (yalnızca değişen kısımlar indirilir) ve yeni görünüm. Bu sürümü bir kez kurun; sonraki güncellemeler kendiliğinden gelir.': 'Merkezi Servis {0} comes with a new installer: full-screen start, one-click updates (only the changed parts are downloaded) and a new look. Install it once; later updates arrive automatically.',
    'Verileriniz korunur: kişiler, hatlar, seferler ve ayarlar aynı yerde kalır, yeni sürüm onları kendiliğinden açar.': 'Your data is kept: people, lines, trips and settings stay where they are and the new version opens them automatically.',
    'Kurulum dosyasını indir': 'Download the installer', 'Sürümler sayfası': 'Releases page', 'Daha sonra': 'Later',
    'İndirilen dosyayı açın; kurulum birkaç saniye sürer ve masaüstüne kısayol ekler. Sonra bu eski pencereyi kapatıp yeni kısayolu kullanın.': 'Open the downloaded file; installation takes a few seconds and adds a desktop shortcut. Then close this old window and use the new shortcut.'
  };
  var AR = {
    'Genel': 'عام', 'Servis': 'الخدمة', 'Filo': 'الأسطول', 'Sistem': 'النظام', 'Veri özeti': 'ملخص البيانات',
    'Veri eşitleme': 'مزامنة البيانات', 'Kurum rengi ve açılış': 'لون المؤسسة وشاشة البدء',
    'Renk şeması, koyu/açık mod ve yazı boyutu Görünüm kartındadır. Kurum rengi seçilirse şemanın vurgu rengini geçersiz kılar.': 'نظام الألوان والوضع الداكن/الفاتح وحجم الخط موجودة في بطاقة المظهر. إذا اخترت لون المؤسسة فإنه يحلّ محل لون التمييز في النظام.',
    'Bu program bulut ya da Wi-Fi eşitlemesi kullanmaz; veriler yalnız bu bilgisayarda saklanır. Başka bilgisayara taşımak ya da yedeklemek için:': 'لا يستخدم هذا البرنامج المزامنة السحابية أو عبر Wi-Fi؛ تُحفظ البيانات على هذا الحاسوب فقط. للنسخ الاحتياطي أو النقل إلى حاسوب آخر:',
    'Yedek al (JSON)': 'نسخة احتياطية (JSON)', 'Yedekten geri yükle': 'استعادة من نسخة احتياطية', "Excel'e ver": 'تصدير إلى Excel', 'Kapat': 'إغلاق',
    'Bu program bulut eşitlemesi kullanmaz; veriler bu bilgisayarda kalır, güncellemeler GitHub\'dan ücretsiz gelir. Danışman yalnız sizin kendi yapay zekâ anahtarınızla çalışır.': 'لا يستخدم هذا البرنامج المزامنة السحابية؛ تبقى البيانات على هذا الحاسوب وتصل التحديثات مجاناً من GitHub. يعمل المستشار بمفتاح الذكاء الاصطناعي الخاص بك فقط.',
    'Yeni kurulum gerekli': 'يلزم مثبّت جديد',
    'Merkezi Servis {0} yeni bir kurulum programıyla gelir: tam ekran açılış, tek tuşla güncelleme (yalnızca değişen kısımlar indirilir) ve yeni görünüm. Bu sürümü bir kez kurun; sonraki güncellemeler kendiliğinden gelir.': 'يأتي Merkezi Servis {0} بمثبّت جديد: فتح بملء الشاشة، وتحديث بضغطة واحدة (تُنزَّل الأجزاء المتغيرة فقط)، ومظهر جديد. ثبّته مرة واحدة؛ وستصل التحديثات التالية تلقائياً.',
    'Verileriniz korunur: kişiler, hatlar, seferler ve ayarlar aynı yerde kalır, yeni sürüm onları kendiliğinden açar.': 'بياناتك محفوظة: الأشخاص والخطوط والرحلات والإعدادات تبقى في مكانها ويفتحها الإصدار الجديد تلقائياً.',
    'Kurulum dosyasını indir': 'تنزيل ملف التثبيت', 'Sürümler sayfası': 'صفحة الإصدارات', 'Daha sonra': 'لاحقاً',
    'İndirilen dosyayı açın; kurulum birkaç saniye sürer ve masaüstüne kısayol ekler. Sonra bu eski pencereyi kapatıp yeni kısayolu kullanın.': 'افتح الملف الذي نزّلته؛ يستغرق التثبيت بضع ثوانٍ ويضيف اختصاراً على سطح المكتب. ثم أغلق هذه النافذة القديمة واستخدم الاختصار الجديد.'
  };
  if (window.I18N) { Object.keys(EN).forEach(function (k) { if (!I18N.en[k]) I18N.en[k] = EN[k]; }); Object.keys(AR).forEach(function (k) { if (!I18N.ar[k]) I18N.ar[k] = AR[k]; }); }
  function T(s) { var a = [].slice.call(arguments, 1); return typeof t === 'function' ? t.apply(null, [s].concat(a)) : s; }

  /* ---------- menü simgeleri (çizgi simgeler, çekirdek simge kümesine eklenir) ---------- */
  Object.assign(ui.icons, {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
    route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    bus: '<path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
    idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4M5 16c.5-1.2 1.6-2 3-2s2.5.8 3 2"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8M16 17H8M10 9H8"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'
  });
  var ICON = { dash: 'home', ai: 'sparkles', persons: 'users', mainlines: 'compass', lines: 'route', places: 'pin', shifts: 'repeat', plan: 'calendar', trips: 'bus', drivers: 'idcard', vehicles: 'car', costs: 'coins', reports: 'printer', records: 'file', settings: 'settings' };
  var GROUPS = [['Genel', ['dash', 'ai']], ['Servis', ['persons', 'mainlines', 'lines', 'places', 'shifts', 'plan', 'trips']], ['Filo', ['drivers', 'vehicles', 'costs']], ['Sistem', ['reports', 'records', 'settings']]];

  /* ---------- "klasik" şema: 1.0.x'in style.css renkleri (açık = eski varsayılan, koyu = eski html.dark) ---------- */
  FC.look.registerScheme('klasik', {
    label: { tr: 'Klasik (eski görünüm)', en: 'Classic (previous look)', ar: 'الكلاسيكي (المظهر السابق)' },
    light: {
      '--bg': '#f3f4f6', '--bg-grid': '#0000', '--panel': '#ffffff', '--panel-solid': '#ffffff', '--panel-hover': '#f3f4f6',
      '--border': '#e5e7eb', '--border-strong': '#c9bd92', '--border-w': '1px', '--text': '#1f2937', '--muted': '#6b7280', '--label': '#374151',
      '--nav-text': '#d1d5db', '--nav-title': '#9aa3b2', '--accent': '#8a7a4e', '--accent-2': '#6e6038', '--on-accent': '#ffffff',
      '--primary-1': '#8a7a4e', '--primary-2': '#7c6d45', '--active-1': '#8a7a4e29', '--active-2': '#8a7a4e14', '--active-line': '#8a7a4e',
      '--accent-soft': '#8a7a4e17', '--accent-line': '#8a7a4e59', '--focus': '#8a7a4e', '--focus-w': '2px', '--focus-ring': '#c9bd9266',
      '--danger': '#b91c1c', '--warn': '#b45309', '--ok': '#15803d', '--ok-text': '#15803d', '--danger-text': '#b91c1c', '--warn-text': '#b45309',
      '--ok-soft': '#dcfce7', '--ok-line': '#86efac', '--danger-soft': '#fee2e2', '--danger-line': '#fecaca', '--warn-soft': '#fef3c7', '--warn-line': '#fcd34d',
      '--sidebar-bg': '#1f2430', '--topbar-bg': '#ffffff', '--modal-bg': '#ffffff', '--modal-border': '#e5e7eb', '--backdrop': '#00000066',
      '--toast-bg': '#111827', '--toast-text': '#ffffff', '--toast-line': '#111827', '--toast-err-bg': '#b91c1c', '--toast-err-text': '#ffffff', '--toast-err-line': '#b91c1c',
      '--badge-text': '#374151', '--badge-bg': '#eef0f3', '--badge-line': '#e5e7eb', '--on-badge': '#ffffff',
      '--bar-track': '#e5e7eb', '--scroll-thumb': '#9ca3af80', '--glow-1': '#0000', '--glow-2': '#0000',
      '--shadow-pop': '0 8px 24px #00000026', '--shadow-modal': '0 20px 60px #0000004d', '--shadow-toast': '0 8px 24px #0000004d',
      '--sidebar-text': '#ffffff', '--sidebar-hover': '#2b3140', '--sidebar-border': '#2f3542', '--nav-active-text': '#ffffff', '--nav-active-bg': '#8a7a4e', '--brand-tag': '#9aa3b2'
    },
    dark: {
      '--bg': '#12151c', '--bg-grid': '#0000', '--panel': '#1b1f29', '--panel-solid': '#1b1f29', '--panel-hover': '#232836',
      '--border': '#2d3340', '--border-strong': '#5b4f2b', '--border-w': '1px', '--text': '#e5e7eb', '--muted': '#9ca3af', '--label': '#d1d5db',
      '--nav-text': '#d1d5db', '--nav-title': '#9aa3b2', '--accent': '#b8a571', '--accent-2': '#8a7a4e', '--on-accent': '#ffffff',
      '--primary-1': '#8a7a4e', '--primary-2': '#7c6d45', '--active-1': '#8a7a4e40', '--active-2': '#8a7a4e1f', '--active-line': '#8a7a4e',
      '--accent-soft': '#8a7a4e26', '--accent-line': '#8a7a4e73', '--focus': '#b8a571', '--focus-w': '2px', '--focus-ring': '#8a7a4e4d',
      '--danger': '#f87171', '--warn': '#fbbf24', '--ok': '#4ade80', '--ok-text': '#4ade80', '--danger-text': '#f87171', '--warn-text': '#fbbf24',
      '--ok-soft': '#14341f', '--ok-line': '#166534', '--danger-soft': '#3d1414', '--danger-line': '#7f1d1d', '--warn-soft': '#3a2c0c', '--warn-line': '#92400e',
      '--sidebar-bg': '#0e1117', '--topbar-bg': '#1b1f29', '--modal-bg': '#1b1f29', '--modal-border': '#2d3340', '--backdrop': '#000000a6',
      '--toast-bg': '#111827', '--toast-text': '#ffffff', '--toast-line': '#374151', '--toast-err-bg': '#7f1d1d', '--toast-err-text': '#ffffff', '--toast-err-line': '#b91c1c',
      '--badge-text': '#d1d5db', '--badge-bg': '#2b3140', '--badge-line': '#374151', '--on-badge': '#ffffff',
      '--bar-track': '#2d3340', '--scroll-thumb': '#4b556380', '--glow-1': '#0000', '--glow-2': '#0000',
      '--shadow-pop': '0 8px 24px #00000080', '--shadow-modal': '0 20px 60px #000000a6', '--shadow-toast': '0 8px 24px #00000080',
      '--sidebar-text': '#ffffff', '--sidebar-hover': '#232836', '--sidebar-border': '#1f2430', '--nav-active-text': '#ffffff', '--nav-active-bg': '#8a7a4e', '--brand-tag': '#9aa3b2'
    }
  });

  /* ---------- çekirdeği başlat ---------- */
  // 1.0.x'ten gelen kullanıcı: "neler yeni" ilk açılışta gösterilsin (çekirdek önceki sürümü bilmiyor)
  try { if (FC.storage.get('whatsnew.seen', null) == null && localStorage.getItem('merkezi-servis-state')) FC.storage.set('whatsnew.seen', '1.0.11'); } catch (e) { }
  window.__msErrors = [];
  window.addEventListener('error', function (e) { if (e && e.message) window.__msErrors.push(String(e.message)); });
  FC.init({ app: APP, repo: REPO, version: VER, setupChannel: 'win-setup', announcements: true, whatsnew: false, onboarding: false });
  var OB = { firebase: false };   // bu uygulama Firebase kullanmaz; yapay zekâ adımı Danışman içindir (kullanıcının kendi anahtarı)

  /* ---------- kenar çubuğu ---------- */
  function renderNav() {
    var nav = document.getElementById('nav'); if (!nav || typeof NAV === 'undefined') return;
    var pro = typeof PRO === 'function' ? PRO() : null;
    var allowed = NAV.filter(function (n) { return !pro || pro.navAllowed(n[0]); });
    var byId = {}; allowed.forEach(function (n) { byId[n[0]] = n; });
    var html = '';
    GROUPS.forEach(function (g) {
      var items = g[1].filter(function (p) { return byId[p]; });
      if (!items.length) return;
      html += '<div class="nav-group"><div class="nav-group-title">' + h(T(g[0])) + '</div>';
      items.forEach(function (p) {
        var n = byId[p];
        html += '<button type="button" class="nav-item' + (p === page ? ' active' : '') + '" data-page="' + p + '">' + ui.icon(ICON[p] || 'box') + '<span>' + h(T(n[2])) + '</span>' + (pro ? pro.navBadge(p) : '') + '</button>';
      });
      html += '</div>';
    });
    // gruplara girmeyen (ileride eklenen) sayfalar
    allowed.forEach(function (n) { if (!GROUPS.some(function (g) { return g[1].indexOf(n[0]) >= 0; })) html += '<button type="button" class="nav-item' + (n[0] === page ? ' active' : '') + '" data-page="' + n[0] + '">' + ui.icon('box') + '<span>' + h(T(n[2])) + '</span></button>'; });
    nav.innerHTML = html;
    if (pro) pro.userBox();
    Array.prototype.forEach.call(nav.querySelectorAll('[data-page]'), function (a) { a.onclick = function () { go(a.dataset.page); document.getElementById('appShell').classList.remove('drawer-open'); }; });
    var sub = document.getElementById('brandSub'); if (sub && typeof S !== 'undefined' && S) sub.textContent = S.settings.orgName;
    var vb = document.getElementById('verBadge'); if (vb) vb.textContent = 'v' + VER;
    topbar(); syncTitle();
  }

  /* ---------- üst çubuk ---------- */
  var tb = null;
  function topbar() {
    var bar = document.getElementById('topbar'); if (!bar || tb) return;
    var mb = document.getElementById('menuBtn');
    if (mb) { mb.innerHTML = ui.icon('menu'); mb.onclick = function () { document.getElementById('appShell').classList.add('drawer-open'); }; }
    var back = document.getElementById('drawerBack'); if (back) back.onclick = function () { document.getElementById('appShell').classList.remove('drawer-open'); };
    tb = FC.topbar.mount(bar, { before: [FC.announcements.button()], sync: { state: 'off', onClick: syncMenu }, lan: false });
    tb.setSync('off');
  }
  function syncMenu() {
    var body = ui.el('div');
    body.appendChild(ui.el('p.muted', { text: T('Bu program bulut ya da Wi-Fi eşitlemesi kullanmaz; veriler yalnız bu bilgisayarda saklanır. Başka bilgisayara taşımak ya da yedeklemek için:') }));
    var m;
    var row = ui.el('div.fc-row', null, [
      ui.el('button.btn', { type: 'button', html: ui.icon('save') + h(T('Yedek al (JSON)')), onclick: function () { m.close(); saveBlob('merkezi-servis-yedek-' + todayISO() + '.json', new TextEncoder().encode(JSON.stringify(S, null, 1))); } }),
      ui.el('button.btn', { type: 'button', html: ui.icon('upload') + h(T('Yedekten geri yükle')), onclick: function () { m.close(); importBackup(); } }),
      ui.el('button.btn', { type: 'button', html: ui.icon('sheet') + h(T("Excel'e ver")), onclick: function () { m.close(); exportPersonsExcel(); } })
    ]);
    body.appendChild(row);
    m = ui.modal({ title: T('Veri eşitleme'), icon: 'sync', cls: 'small', body: body, buttons: [{ label: T('Kapat'), cls: 'primary' }] });
  }
  // Sayfa başlığı üst çubukta: içerikteki ilk <h1> buraya taşınır (içerikte gizlenir)
  function syncTitle() {
    var main = document.getElementById('main'), pt = document.getElementById('pageTitle'); if (!main || !pt) return;
    var h1 = main.querySelector(':scope > h1');
    if (h1) pt.innerHTML = h1.innerHTML;
    var ps = document.getElementById('pageSub');
    if (ps && typeof S !== 'undefined' && S) { var o = S.settings.orgName || ''; if (ps.dataset.org !== o) { ps.dataset.org = o; ps.querySelector('.org').textContent = o; } }
  }
  function pageChanged() { syncTitle(); }

  /* ---------- dil (app ↔ çekirdek iki yönlü) ---------- */
  function initialLang(appLang) {
    var fl = FC.storage.get('lang', null);
    if (fl) return fl;
    if (appLang) FC.i18n.set(appLang);
    return appLang;
  }
  function langChanged(l) { if (FC.i18n.lang() !== l) FC.i18n.set(l); }
  FC.i18n.onChange(function (l) {
    if (typeof S === 'undefined' || !S || typeof LANG === 'undefined' || l === LANG) return;
    S.settings.lang = l; save(); applyLang(l); renderNav(); render();
  });

  /* ---------- ayarlar ---------- */
  function usageCard() {
    // Firebase kullanılmaz; yapay zekâ (Danışman) yalnız kullanıcının kendi anahtarıyla çalışır ve burada sayılır.
    var c = FC.usage.card({ firebase: false, providers: ['gemini', 'openai', 'anthropic', 'groq'] });
    c.appendChild(ui.el('div.notice.ok', { text: T('Bu program bulut eşitlemesi kullanmaz; veriler bu bilgisayarda kalır, güncellemeler GitHub\'dan ücretsiz gelir. Danışman yalnız sizin kendi yapay zekâ anahtarınızla çalışır.') }));
    return c;
  }
  function buildSettings(grid, appCards) {
    FC.settings.build(grid, { cards: appCards.concat([usageCard()]), usage: false, about: { version: VER }, onboarding: OB });
  }

  /* ---------- açılış (giriş ekranından sonra) ---------- */
  function started() {
    var main = document.getElementById('main');
    if (main && !main.__msObs) { main.__msObs = new MutationObserver(syncTitle); main.__msObs.observe(main, { childList: true }); }
    syncTitle();
    if (LEGACY) { setTimeout(bridge, 800); return; }
    var wn = FC.whatsnew.start({ version: VER, notes: function (v) { return v === VER ? REL.notes : null; } });
    if (!wn) setTimeout(function () { FC.onboarding.maybeStart(OB); }, 700);
  }

  /* ---------- eski kabuk köprüsü ---------- */
  function setupUrl() { return 'https://github.com/' + OWNER + '/' + REPO + '/releases/download/v' + VER + '/' + PREFIX + '-' + VER + '-win-setup.exe'; }
  function bridge() {
    var body = ui.el('div');
    body.appendChild(ui.el('p', { text: T('Merkezi Servis {0} yeni bir kurulum programıyla gelir: tam ekran açılış, tek tuşla güncelleme (yalnızca değişen kısımlar indirilir) ve yeni görünüm. Bu sürümü bir kez kurun; sonraki güncellemeler kendiliğinden gelir.', VER) }));
    body.appendChild(ui.el('div.notice.ok', null, [ui.el('span', { html: ui.icon('check') }), ui.el('span', { text: T('Verileriniz korunur: kişiler, hatlar, seferler ve ayarlar aynı yerde kalır, yeni sürüm onları kendiliğinden açar.') })]));
    body.appendChild(ui.el('p.muted', { text: T('İndirilen dosyayı açın; kurulum birkaç saniye sürer ve masaüstüne kısayol ekler. Sonra bu eski pencereyi kapatıp yeni kısayolu kullanın.'), style: 'margin-top:12px' }));
    ui.modal({ title: T('Yeni kurulum gerekli'), icon: 'download', body: body, buttons: [
      { label: T('Daha sonra'), cls: 'ghost' }, 'spacer',
      { label: T('Sürümler sayfası'), onClick: function () { ui.openUrl('https://github.com/' + OWNER + '/' + REPO + '/releases/latest'); return false; } },
      { label: T('Kurulum dosyasını indir'), icon: 'download', cls: 'primary', onClick: function () { try { save(true); } catch (e) { } ui.openUrl(setupUrl()); return false; } }
    ] });
  }
  // Eski kabukta "Güncelle" düğmesi de kurulum dosyasına götürür
  if (LEGACY) {
    FC.updater.run = function () { bridge(); return Promise.resolve('legacy'); };
    FC.updater.check = function () { bridge(); return Promise.resolve(null); };
  }

  window.Kabuk = { renderNav: renderNav, topbar: topbar, langChanged: langChanged, initialLang: initialLang, pageChanged: pageChanged, buildSettings: buildSettings, started: started, legacy: LEGACY, setupUrl: setupUrl, bridge: bridge };
})();
