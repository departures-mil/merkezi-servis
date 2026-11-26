/* Merkezi Servis — Danışman (yapay zekâ destekli soru-cevap).
   Çevrim içi: kullanıcının KENDİ yapay zekâ anahtarı (FC.storage 'ai' = {provider, key, model}; ilk açılış rehberi ve
   Ayarlar → Danışman kartı aynı kaydı kullanır). Programın sahibinin kotası hiç kullanılmaz.
   Çevrim dışı (internet ya da anahtar yoksa, istek başarısız olursa): yerleşik kural motoru kayıtlardan yanıt üretir.
   Gönderilen bağlam: yalnız soruyu yanıtlamak için gereken özet (sayılar, gruplar, hatlar, soru ile eşleşen kişiler).
   Telefon numarası, anne adı, not gibi alanlar hiçbir zaman gönderilmez.
   app.js'ten SONRA yüklenir; app.js'in genel adlarını (S, t, h, LANG, save, render, toast…) çağrı anında kullanır. */
(function () {
  'use strict';
  var CHAT_KEY = 'ms-danisman-sohbet', MAX_KEEP = 60, MAX_TURNS = 10;
  var GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  var PROV = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude', groq: 'Groq' };

  /* ---------- metinler (anahtar Türkçe; app.js'in sözlüğüne eklenir) ---------- */
  var EN = {
    'Danışman': 'Advisor',
    'Kayıtlarınız hakkında soru sorun: kim nerede, değişim günleri, hatlar, şoför nöbeti, araç belgeleri…': 'Ask about your records: who is where, changeover days, lines, driver duty, vehicle documents…',
    'Sorunuzu yazın…': 'Type your question…', 'Sor': 'Ask', 'Sohbeti temizle': 'Clear conversation', 'Sohbet temizlendi': 'Conversation cleared',
    'Çevrim içi': 'Online', 'Çevrim dışı': 'Offline', 'Yanıt hazırlanıyor…': 'Preparing the answer…',
    'Çevrim içi yanıt alınamadı; yerleşik danışman yanıtladı.': 'No online answer could be obtained; the built-in advisor answered.',
    'Yapay zekâ anahtarı girilmedi; yerleşik danışman (çevrim dışı) yanıtlıyor. Ayarlar → Danışman kartından kendi anahtarınızı ekleyebilirsiniz.': 'No AI key has been entered; the built-in (offline) advisor is answering. You can add your own key in Settings → Advisor.',
    'Bugün kim nerede?': 'Who is where today?', 'Yaklaşan değişim günleri': 'Upcoming changeover days', 'Nöbetteki şoförler': 'Drivers on duty',
    'Belgesi dolan araçlar': 'Vehicles with expiring documents', 'Hat özeti': 'Line summary', 'Genel özet': 'General summary',
    'Danışman (yapay zekâ)': 'Advisor (AI)',
    'Kendi yapay zekâ anahtarınızla çalışır; program sahibinin kotası kullanılmaz. Anahtar yalnız bu bilgisayarda saklanır. Soruya yanıt için gereken kayıt özeti sağlayıcıya gönderilir; telefon, anne adı ve notlar gönderilmez.': 'Works with your own AI key; the program owner\'s quota is never used. The key is stored only on this computer. The record summary needed for the answer is sent to the provider; phone numbers, mother\'s names and notes are never sent.',
    'Sağlayıcı': 'Provider', 'Anahtar': 'Key', 'Model (isteğe bağlı)': 'Model (optional)', 'Anahtarı al': 'Get a key', 'Dene': 'Test',
    'Çevrim içi yapay zekâ kullanılsın': 'Use online AI', 'Anahtar geçerli': 'Key is valid', 'Anahtar geçersiz': 'Key is invalid',
    'Denenemedi (internet?)': 'Could not test (internet?)', 'Bugünkü istek': 'Requests today',
    'Kayıtlar üzerinden soru-cevap: çevrim içi (kendi anahtarınızla) ve çevrim dışı': 'Q&A over your records: online (with your own key) and offline'
  };
  var AR = {
    'Danışman': 'المستشار',
    'Kayıtlarınız hakkında soru sorun: kim nerede, değişim günleri, hatlar, şoför nöbeti, araç belgeleri…': 'اسأل عن سجلاتك: من أين، أيام التبديل، الخطوط، مناوبة السائقين، وثائق المركبات…',
    'Sorunuzu yazın…': 'اكتب سؤالك…', 'Sor': 'اسأل', 'Sohbeti temizle': 'مسح المحادثة', 'Sohbet temizlendi': 'تم مسح المحادثة',
    'Çevrim içi': 'متصل', 'Çevrim dışı': 'دون اتصال', 'Yanıt hazırlanıyor…': 'جارٍ إعداد الإجابة…',
    'Çevrim içi yanıt alınamadı; yerleşik danışman yanıtladı.': 'تعذّر الحصول على إجابة عبر الإنترنت؛ أجاب المستشار المدمج.',
    'Yapay zekâ anahtarı girilmedi; yerleşik danışman (çevrim dışı) yanıtlıyor. Ayarlar → Danışman kartından kendi anahtarınızı ekleyebilirsiniz.': 'لم يُدخل مفتاح ذكاء اصطناعي؛ يجيب المستشار المدمج (دون اتصال). يمكنك إضافة مفتاحك الخاص من الإعدادات ← بطاقة المستشار.',
    'Bugün kim nerede?': 'من أين اليوم؟', 'Yaklaşan değişim günleri': 'أيام التبديل القادمة', 'Nöbetteki şoförler': 'السائقون المناوبون',
    'Belgesi dolan araçlar': 'مركبات تنتهي وثائقها', 'Hat özeti': 'ملخص الخطوط', 'Genel özet': 'ملخص عام',
    'Danışman (yapay zekâ)': 'المستشار (ذكاء اصطناعي)',
    'Kendi yapay zekâ anahtarınızla çalışır; program sahibinin kotası kullanılmaz. Anahtar yalnız bu bilgisayarda saklanır. Soruya yanıt için gereken kayıt özeti sağlayıcıya gönderilir; telefon, anne adı ve notlar gönderilmez.': 'يعمل بمفتاح الذكاء الاصطناعي الخاص بك؛ لا تُستخدم حصة مالك البرنامج. يُحفظ المفتاح على هذا الحاسوب فقط. يُرسَل إلى المزوّد ملخص السجلات اللازم للإجابة فقط؛ لا تُرسَل أرقام الهاتف ولا أسماء الأمهات ولا الملاحظات.',
    'Sağlayıcı': 'المزوّد', 'Anahtar': 'المفتاح', 'Model (isteğe bağlı)': 'النموذج (اختياري)', 'Anahtarı al': 'احصل على مفتاح', 'Dene': 'اختبار',
    'Çevrim içi yapay zekâ kullanılsın': 'استخدام الذكاء الاصطناعي عبر الإنترنت', 'Anahtar geçerli': 'المفتاح صالح', 'Anahtar geçersiz': 'المفتاح غير صالح',
    'Denenemedi (internet?)': 'تعذّر الاختبار (الإنترنت؟)', 'Bugünkü istek': 'طلبات اليوم',
    'Kayıtlar üzerinden soru-cevap: çevrim içi (kendi anahtarınızla) ve çevrim dışı': 'أسئلة وأجوبة حول سجلاتك: عبر الإنترنت (بمفتاحك الخاص) ودون اتصال'
  };
  if (window.I18N) {
    Object.keys(EN).forEach(function (k) { if (!I18N.en[k]) I18N.en[k] = EN[k]; });
    Object.keys(AR).forEach(function (k) { if (!I18N.ar[k]) I18N.ar[k] = AR[k]; });
  }

  /* ---------- çevrim dışı yanıt kalıpları (3 dil) ---------- */
  var TX = {
    tr: {
      today: function (d) { return '**' + d + '** itibarıyla servise dahil personelin bulunduğu yerler:'; },
      people: 'kişi', inService: 'Servise dahil', exempt: 'Muaf', inactive: 'Pasif',
      groups: 'Grupların bugünkü durumu', work: 'işte', home: 'evde', since: 'başlangıç', next: 'sonraki değişim', none: '—',
      changes: 'Yaklaşan değişim günleri', changing: 'değişen gruplar',
      noChange: 'Önümüzdeki dönem için değişim tarihi tanımlı değil. Vardiya & Değişim sayfasından tarihleri girin.',
      drivers: function (n) { return 'Bugün nöbette olan ekip: **Ekip ' + n + '**'; }, drvNext: 'Sonraki şoför değişimi', noDrivers: 'Nöbette şoför kaydı yok.',
      docs: 'Süresi geçmiş ya da 30 gün içinde dolacak araç belgeleri', expired: 'süresi geçti', daysLeft: function (n) { return n + ' gün kaldı'; },
      noDocs: 'Önümüzdeki 30 gün içinde süresi dolan araç belgesi yok.', noVeh: 'Araç kaydı yok (Araçlar modülü).',
      lines: 'Hatlar (servise dahil kişi sayısı)', stops: 'durak', vehicle: 'araç', noLines: 'Henüz hat tanımlanmamış.',
      person: 'Eşleşen kişiler', group: 'Grup', loc: 'Bugün', line: 'Hat', homeP: 'Ev', workP: 'İşyeri',
      tooMany: function (n) { return '…ve ' + n + ' kişi daha. Aramayı daraltın.'; },
      grp: function (g, st, s, n, c) { return '**' + g + '** grubu bugün **' + st + '** (' + s + ' tarihinden beri); sonraki değişim: ' + n + '. Grupta ' + c + ' kişi var.'; },
      help: 'Sorunuzu kayıtlarda eşleştiremedim. Şunları sorabilirsiniz: bugün kim nerede, bir kişinin adı, bir grup (A, B…), bir hattın adı, değişim günleri, nöbetteki şoförler, araç belgeleri.',
      summary: 'Genel özet'
    },
    en: {
      today: function (d) { return 'Where the personnel included in the service are as of **' + d + '**:'; },
      people: 'people', inService: 'In service', exempt: 'Exempt', inactive: 'Inactive',
      groups: 'Groups today', work: 'at work', home: 'at home', since: 'since', next: 'next change', none: '—',
      changes: 'Upcoming changeover days', changing: 'changing groups',
      noChange: 'No changeover date is defined for the coming period. Enter the dates on the Shifts & Changeover page.',
      drivers: function (n) { return 'Team on duty today: **Team ' + n + '**'; }, drvNext: 'Next driver changeover', noDrivers: 'No driver on duty is registered.',
      docs: 'Vehicle documents expired or expiring within 30 days', expired: 'expired', daysLeft: function (n) { return n + ' days left'; },
      noDocs: 'No vehicle document expires within the next 30 days.', noVeh: 'No vehicles are registered (Vehicles module).',
      lines: 'Lines (people included in the service)', stops: 'stops', vehicle: 'vehicle', noLines: 'No lines have been defined yet.',
      person: 'Matching people', group: 'Group', loc: 'Today', line: 'Line', homeP: 'Home', workP: 'Workplace',
      tooMany: function (n) { return '…and ' + n + ' more. Narrow the search.'; },
      grp: function (g, st, s, n, c) { return 'Group **' + g + '** is **' + st + '** today (since ' + s + '); next change: ' + n + '. The group has ' + c + ' people.'; },
      help: 'I could not match your question to the records. You can ask about: who is where today, a person\'s name, a group (A, B…), a line name, changeover days, drivers on duty, vehicle documents.',
      summary: 'General summary'
    },
    ar: {
      today: function (d) { return 'أماكن الأفراد المشمولين بالخدمة بتاريخ **' + d + '**:'; },
      people: 'شخص', inService: 'مشمولون بالخدمة', exempt: 'معفون', inactive: 'غير نشطين',
      groups: 'حالة المجموعات اليوم', work: 'في العمل', home: 'في البيت', since: 'منذ', next: 'التبديل التالي', none: '—',
      changes: 'أيام التبديل القادمة', changing: 'المجموعات المتبدلة',
      noChange: 'لا يوجد تاريخ تبديل محدد للفترة القادمة. أدخل التواريخ من صفحة المناوبة والتبديل.',
      drivers: function (n) { return 'الفريق المناوب اليوم: **الفريق ' + n + '**'; }, drvNext: 'تبديل السائقين التالي', noDrivers: 'لا يوجد سائق مناوب مسجل.',
      docs: 'وثائق مركبات منتهية أو تنتهي خلال 30 يوماً', expired: 'منتهية', daysLeft: function (n) { return 'بقي ' + n + ' يوماً'; },
      noDocs: 'لا توجد وثيقة مركبة تنتهي خلال الثلاثين يوماً القادمة.', noVeh: 'لا توجد مركبات مسجلة (وحدة المركبات).',
      lines: 'الخطوط (عدد المشمولين بالخدمة)', stops: 'محطة', vehicle: 'مركبة', noLines: 'لم تُعرَّف خطوط بعد.',
      person: 'الأشخاص المطابقون', group: 'المجموعة', loc: 'اليوم', line: 'الخط', homeP: 'السكن', workP: 'مكان العمل',
      tooMany: function (n) { return '…و' + n + ' آخرون. ضيّق البحث.'; },
      grp: function (g, st, s, n, c) { return 'المجموعة **' + g + '** اليوم **' + st + '** (منذ ' + s + ')؛ التبديل التالي: ' + n + '. في المجموعة ' + c + ' شخصاً.'; },
      help: 'لم أتمكن من مطابقة سؤالك مع السجلات. يمكنك السؤال عن: من أين اليوم، اسم شخص، مجموعة (A، B…)، اسم خط، أيام التبديل، السائقين المناوبين، وثائق المركبات.',
      summary: 'ملخص عام'
    }
  };
  // Çevrim dışı yanıt sorunun dilinde verilir (Arapça harf → ar; İngilizce sözcükler → en; yoksa arayüz dili)
  var QL = null;
  function qLang(q) {
    if (/[\u0600-\u06ff]/.test(q)) return 'ar';
    if (/\b(who|where|what|when|which|how|today|show|list|line|lines|driver|drivers|vehicle|vehicles|group|summary|changeover|is|are|the)\b/i.test(q) && !/[çğıöşüÇĞİÖŞÜ]/.test(q)) return 'en';
    return LANG;
  }
  function X() { return TX[QL || LANG] || TX.tr; }
  function tt(s) { var L = QL || LANG; if (L === 'tr') return s; var d = (window.I18N || {})[L]; return (d && d[s]) || s; }
  var DAYS3 = { tr: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] };
  function dn(iso) { return (DAYS3[QL || LANG] || DAYS3.tr)[parseISO(iso).getDay()]; }

  /* ---------- yardımcılar ---------- */
  function norm(s) {
    return String(s || '').toLocaleLowerCase('tr').normalize('NFKD').replace(/[̀-ًͯ-ٰٟ]/g, '')
      .replace(/[ıİ]/g, 'i').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }
  function words(q) { return norm(q).split(/[^0-9a-z؀-ۿ]+/).filter(function (w) { return w.length >= 3; }); }
  function aiCfg() { var a = FC.storage.get('ai', null); return a && a.key && a.provider ? a : null; }
  function onlineAllowed() { return S.settings.aiOnline !== false && navigator.onLine !== false && !!aiCfg(); }
  function pro() { return window.Pro || null; }
  function modOn(id) { var p = pro(); return !p || !p.mod || p.mod(id); }
  function grpName(id) { var g = S.groups.find(function (x) { return x.id === id; }); return g ? g.name : (id || '—'); }
  function locText(loc) {
    if (loc === 'home') return X().home;
    if (loc === 'transit') return tt('Serviste (yolda)');
    if (!loc) return '—';
    var w = placeById(loc); return w ? shortWorkL(w) : X().work;
  }
  function shortWorkL(w) { var n = (w && w.name) || ''; return n.indexOf('القادسية') >= 0 ? tt('Kadısiye merkezi') : n.indexOf('حماة') >= 0 ? tt('Hama merkezi') : n; }
  function personHit(p, ws) {
    var hay = norm([p.name, p.nickname, p.regNo].join(' '));
    return ws.some(function (w) { return hay.indexOf(w) >= 0; });
  }
  function matchPersons(q) {
    var ws = words(q).filter(function (w) { return !STOP[w]; });
    if (!ws.length) return [];
    var exact = S.persons.filter(function (p) { var n = norm(p.name); return ws.length > 1 && ws.every(function (w) { return n.indexOf(w) >= 0; }); });
    return exact.length ? exact : S.persons.filter(function (p) { return personHit(p, ws); });
  }
  // eşleşmede gürültü yapan sık sözcükler
  var STOP = {};
  ('bugun bugün kim kimler nerede nerde hangi kac kaç tane var mi mı mu mü icin için olan olanlar listesi liste ile ve veya gibi daha '
    + 'what who where which when how many much the and for with are today now list show '
    + 'من اين أين متى كم اليوم الان الآن قائمه قائمة في على').split(' ').forEach(function (w) { STOP[norm(w)] = 1; });

  /* ---------- bağlam (çevrim içi istek için; yalnız gerekli özet) ---------- */
  function context(q) {
    var d0 = todayISO(), ctx = { today: d0, weekday: dayName(d0), organization: S.settings.orgName, cycleDays: S.settings.cycleDays };
    var ins = S.persons.filter(personInService);
    ctx.counts = { persons: S.persons.length, inService: ins.length, exempt: S.persons.filter(function (p) { return p.active !== false && personExempt(p); }).length, inactive: S.persons.filter(function (p) { return p.active === false; }).length };
    var byLoc = {}; ins.forEach(function (p) { var k = locText(personLocationAt(p, d0)); byLoc[k] = (byLoc[k] || 0) + 1; });
    ctx.whereToday = byLoc;
    ctx.groups = S.groups.map(function (g) {
      return { group: g.name, today: groupStatusAt(g, d0) === 'work' ? 'work' : 'home', since: g.statusSince || '', nextChange: groupNextChange(g, d0) || '', members: S.persons.filter(function (p) { return p.group === g.id && personInService(p); }).length };
    });
    ctx.upcomingChanges = upcomingChangeDates(8).map(function (d) { return { date: d, weekday: dayName(d), groups: changesOn(d).map(function (g) { return g.name; }) }; });
    if (modOn('drivers')) {
      var team = driverTeamAt(d0);
      ctx.drivers = { teamOnDutyToday: team, nextDriverChange: driverNextChange(d0) || '', list: S.drivers.filter(function (d) { return !d.endDate || d.endDate >= d0; }).map(function (d) { return { name: d.name, team: d.team }; }) };
    }
    ctx.lines = S.lines.map(function (L) {
      var v = (S.vehicles || []).find(function (x) { return x.id === L.vehicleId || x.lineId === L.id; });
      return { line: lname(L), stops: (L.stops || []).length, inService: ins.filter(function (p) { return p.lineId === L.id; }).length, vehicle: v ? v.plate : '' };
    });
    if (modOn('vehicles')) ctx.vehicleDocs = docList(60);
    if (modOn('trips') && Array.isArray(S.trips)) {
      var tr = S.trips.filter(function (x) { return x.date === d0; });
      if (tr.length) ctx.tripsToday = tr.length;
    }
    var hits = matchPersons(q).slice(0, 25);
    if (hits.length) ctx.matchedPersons = hits.map(personInfo);
    var json = JSON.stringify(ctx);
    if (json.length > 14000) { delete ctx.lines; ctx.matchedPersons = (ctx.matchedPersons || []).slice(0, 10); json = JSON.stringify(ctx); }
    return json;
  }
  function personInfo(p) {
    var d0 = todayISO(), g = S.groups.find(function (x) { return x.id === p.group; });
    return {
      name: p.name, nickname: p.nickname || '', regNo: p.regNo || '', title: p.title || '', group: grpName(p.group),
      home: (placeById(p.homeId) || {}).name || '', workplace: p.workId ? shortWork(placeById(p.workId)) : '', line: lineName(p.lineId) || '',
      active: p.active !== false, exempt: personExempt(p), todayLocation: locText(personLocationAt(p, d0)),
      groupNextChange: g ? groupNextChange(g, d0) || '' : ''
    };
  }
  function docList(days) {
    var out = [], d0 = todayISO();
    (S.vehicles || []).filter(function (v) { return v.active !== false; }).forEach(function (v) {
      [['Sigorta bitişi', v.insuranceEnd], ['Muayene bitişi', v.inspectionEnd], ['Ruhsat bitişi', v.licenseEnd], ['Sonraki bakım tarihi', v.nextServiceDate]].forEach(function (x) {
        if (!x[1]) return; var n = diffDays(d0, x[1]);
        if (n <= days) out.push({ plate: v.plate, document: tt(x[0]), date: x[1], daysLeft: n });
      });
    });
    return out.sort(function (a, b) { return a.daysLeft - b.daysLeft; });
  }

  /* ---------- çevrim dışı motor ---------- */
  var RX = {
    today: /bug[uü]n|[sş]u ?an|nerede|i[sş]te|evde|today|now|where|at work|at home|اليوم|الآن|الان|اين|أين|العمل|البيت|المنزل/i,
    change: /de[gğ]i[sş]im|vardiya|rotasyon|d[oö]ng[uü]|change|rotation|shift|cycle|تبديل|مناوب|دوره|دورة/i,
    driver: /[sş]of[oö]r|n[oö]bet|driver|duty|سائق|سائقين|مناوبه|مناوبة/i,
    docs: /ara[cç]|plaka|sigorta|muayene|ruhsat|belge|bak[iı]m|vehicle|insurance|inspection|licen[cs]e|document|maintenance|مركب|سياره|سيارة|تأمين|تامين|فحص|رخصه|رخصة|وثيق|صيانه|صيانة/i,
    lines: /\bhat\b|hatlar|hatt|durak|g[uü]zergah|line|route|stop|خط|خطوط|محطه|محطة|مسار/i,
    summary: /[oö]zet|genel|toplam|ka[cç]|summary|overview|total|how many|ملخص|عام|مجموع|كم/i
  };
  function li(arr) { return arr.map(function (x) { return '- ' + x; }).join('\n'); }
  function aTodayLines() {
    var d0 = todayISO(), ins = S.persons.filter(personInService), out = [];
    workPlaces().forEach(function (w) { out.push(shortWorkL(w) + ': **' + ins.filter(function (p) { return personLocationAt(p, d0) === w.id; }).length + '** ' + X().people); });
    out.push(X().home + ': **' + ins.filter(function (p) { return personLocationAt(p, d0) === 'home'; }).length + '** ' + X().people);
    var tr = ins.filter(function (p) { return personLocationAt(p, d0) === 'transit'; }).length;
    if (tr) out.push(tt('Serviste (yolda)') + ': **' + tr + '** ' + X().people);
    return X().today(fmt(d0) + ' ' + dn(d0)) + '\n' + li(out) + '\n\n' + aGroups();
  }
  function aGroups() {
    var d0 = todayISO();
    return '**' + X().groups + '**\n' + li(S.groups.map(function (g) {
      return g.name + ': ' + (groupStatusAt(g, d0) === 'work' ? X().work : X().home) + ' · ' + X().next + ': ' + (groupNextChange(g, d0) ? fmt(groupNextChange(g, d0)) : X().none);
    }));
  }
  function aChanges() {
    var ds = upcomingChangeDates(8);
    if (!ds.length) return X().noChange;
    return '**' + X().changes + '**\n' + li(ds.map(function (d) { return fmt(d) + ' ' + dn(d) + ' — ' + X().changing + ': ' + changesOn(d).map(function (g) { return g.name; }).join(', '); }));
  }
  function aDrivers() {
    var d0 = todayISO(), team = driverTeamAt(d0);
    var on = S.drivers.filter(function (d) { return driverActiveAt(d, d0); });
    var nx = driverNextChange(d0);
    return X().drivers(team) + '\n' + (on.length ? li(on.map(function (d) { return d.name; })) : X().noDrivers) + (nx ? '\n\n' + X().drvNext + ': **' + fmt(nx) + ' ' + dn(nx) + '**' : '');
  }
  function aDocs() {
    if (!(S.vehicles || []).length) return X().noVeh;
    var l = docList(30);
    if (!l.length) return X().noDocs;
    return '**' + X().docs + '**\n' + li(l.map(function (x) { return x.plate + ' · ' + x.document + ': ' + fmt(x.date) + ' (' + (x.daysLeft < 0 ? X().expired : X().daysLeft(x.daysLeft)) + ')'; }));
  }
  function aLines(q) {
    if (!S.lines.length) return X().noLines;
    var ins = S.persons.filter(personInService), ws = words(q);
    var pick = S.lines.filter(function (L) { var n = norm(lname(L)); return ws.some(function (w) { return !STOP[w] && n.indexOf(w) >= 0; }); });
    var list = pick.length ? pick : S.lines;
    return '**' + X().lines + '**\n' + li(list.map(function (L) {
      var v = (S.vehicles || []).find(function (x) { return x.id === L.vehicleId || x.lineId === L.id; });
      return lname(L) + ': **' + ins.filter(function (p) { return p.lineId === L.id; }).length + '** ' + X().people + ' · ' + (L.stops || []).length + ' ' + X().stops + (v ? ' · ' + X().vehicle + ' ' + v.plate : '');
    }));
  }
  function aPersons(list) {
    var d0 = todayISO(), shown = list.slice(0, 12);
    var s = '**' + X().person + '**\n' + li(shown.map(function (p) {
      var g = S.groups.find(function (x) { return x.id === p.group; }), nx = g ? groupNextChange(g, d0) : '';
      return '**' + p.name + '**' + (p.nickname ? ' (' + p.nickname + ')' : '') + ' — ' + X().loc + ': ' + locText(personLocationAt(p, d0)) +
        ' · ' + X().group + ': ' + grpName(p.group) + (nx ? ' (' + X().next + ' ' + fmt(nx) + ')' : '') +
        (p.lineId ? ' · ' + X().line + ': ' + lineName(p.lineId) : '') + (p.homeId ? ' · ' + X().homeP + ': ' + ((placeById(p.homeId) || {}).name || '') : '');
    }));
    if (list.length > shown.length) s += '\n' + X().tooMany(list.length - shown.length);
    return s;
  }
  function aGroup(g) {
    var d0 = todayISO(), nx = groupNextChange(g, d0);
    return X().grp(g.name, groupStatusAt(g, d0) === 'work' ? X().work : X().home, fmt(g.statusSince), nx ? fmt(nx) + ' ' + dn(nx) : X().none,
      S.persons.filter(function (p) { return p.group === g.id && personInService(p); }).length);
  }
  function aSummary() {
    var ins = S.persons.filter(personInService);
    return '**' + X().summary + '**\n' + li([
      X().inService + ': **' + ins.length + '**', X().exempt + ': ' + S.persons.filter(function (p) { return p.active !== false && personExempt(p); }).length,
      X().inactive + ': ' + S.persons.filter(function (p) { return p.active === false; }).length, tt('Hatlar') + ': ' + S.lines.length
    ]) + '\n\n' + aTodayLines();
  }
  function offline(q) {
    QL = qLang(q);
    try { return offline0(q); } finally { QL = null; }
  }
  function offline0(q) {
    var parts = [], ws = words(q);
    var grp = S.groups.filter(function (g) { return new RegExp('(^|[^0-9A-Za-z])' + g.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^0-9A-Za-z]|$)').test(q); });
    var people = matchPersons(q);
    // grup adı tek harf olabildiğinden ("A") yalnız tek başına geçerse
    grp.forEach(function (g) { parts.push(aGroup(g)); });
    if (people.length && people.length <= 40) parts.push(aPersons(people));
    if (RX.change.test(q)) parts.push(aChanges());
    if (RX.driver.test(q)) parts.push(aDrivers());
    if (RX.docs.test(q)) parts.push(aDocs());
    if (RX.lines.test(q)) parts.push(aLines(q));
    if (!parts.length && RX.today.test(q)) parts.push(aTodayLines());
    if (!parts.length && RX.summary.test(q)) parts.push(aSummary());
    if (!parts.length && !ws.length) parts.push(aSummary());
    if (!parts.length) parts.push(X().help + '\n\n' + aSummary());
    return parts.join('\n\n');
  }

  /* ---------- çevrim içi ---------- */
  function system() {
    var L = { tr: 'Turkish', en: 'English', ar: 'Arabic' }[LANG] || 'Turkish';
    return 'You are the expert advisor inside "Merkezi Servis", a factory personnel shuttle-service management program (rotating groups between workplace and home, lines with stops, drivers on duty teams, vehicles). ' +
      'Answer ONLY from the JSON data provided with each question; if the data does not contain the answer, say so plainly and suggest which page of the program holds it. Never invent people, dates or numbers. ' +
      'Use a formal, professional and technical register (no slang). Reply in the language of the question; if unclear, in ' + L + '. ' +
      'Dates in the data are ISO (YYYY-MM-DD); write them as DD.MM.YYYY. Be concise; use short Markdown lists or a table when helpful. Place names may be in Arabic; keep them as written.';
  }
  function history() {
    var all = chat();
    return all.slice(-MAX_TURNS * 2).filter(function (m) { return m.role === 'user' || m.role === 'ai'; });
  }
  async function online(q) {
    var a = aiCfg(), msgs = history(), data = context(q);
    var userText = 'DATA (JSON):\n' + data + '\n\nQUESTION: ' + q;
    var r, j, u, hd = { 'Content-Type': 'application/json' }, body, pick;
    var prov = a.provider;
    if (FC.usage) FC.usage.count('ai.' + prov);
    bump();
    if (prov === 'gemini') {
      var contents = msgs.map(function (m) { return { role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }; });
      contents.push({ role: 'user', parts: [{ text: userText }] });
      body = { system_instruction: { parts: [{ text: system() }] }, contents: contents, generationConfig: { temperature: 0.2 } };
      var models = a.model ? [a.model] : GEMINI_MODELS, last = null;
      for (var i = 0; i < models.length; i++) {
        u = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(models[i]) + ':generateContent?key=' + encodeURIComponent(a.key);
        r = await fetch(u, { method: 'POST', headers: hd, body: JSON.stringify(body) });
        if (r.ok) { j = await r.json(); var tx = (((j.candidates || [])[0] || {}).content || {}).parts; if (tx && tx.length) return tx.map(function (p) { return p.text || ''; }).join(''); last = new Error('EMPTY'); continue; }
        if (r.status === 429 && FC.usage) FC.usage.count('ai.gemini.full');
        last = new Error('HTTP_' + r.status);
        if (r.status === 400 || r.status === 401 || r.status === 403) break;
      }
      throw last || new Error('FAIL');
    }
    var msgsOA = msgs.map(function (m) { return { role: m.role === 'user' ? 'user' : 'assistant', content: m.text }; });
    msgsOA.push({ role: 'user', content: userText });
    if (prov === 'anthropic') {
      u = 'https://api.anthropic.com/v1/messages'; hd['x-api-key'] = a.key; hd['anthropic-version'] = '2023-06-01'; hd['anthropic-dangerous-direct-browser-access'] = 'true';
      body = { model: a.model || 'claude-haiku-5-5', max_tokens: 1200, system: system(), messages: msgsOA };
      pick = function (x) { return x.content.map(function (c) { return c.text || ''; }).join(''); };
    } else {
      u = prov === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
      hd.Authorization = 'Bearer ' + a.key;
      body = { model: a.model || (prov === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'), temperature: 0.2, messages: [{ role: 'system', content: system() }].concat(msgsOA) };
      pick = function (x) { return x.choices[0].message.content; };
    }
    r = await fetch(u, { method: 'POST', headers: hd, body: JSON.stringify(body) });
    if (!r.ok) { if (r.status === 429 && FC.usage) FC.usage.count('ai.' + prov + '.full'); throw new Error('HTTP_' + r.status); }
    j = await r.json();
    var out = pick(j); if (!out) throw new Error('EMPTY');
    return out;
  }
  function bump() { var k = todayISO(), u = S.settings.aiUse || {}; if (u.d !== k) u = { d: k, n: 0 }; u.n++; S.settings.aiUse = u; save(); }
  function usedToday() { var u = S.settings.aiUse || {}; return u.d === todayISO() ? u.n : 0; }

  /* ---------- sohbet kaydı (yalnız bu bilgisayarda) ---------- */
  function chat() { try { return JSON.parse(localStorage.getItem(CHAT_KEY) || '[]'); } catch (e) { return []; } }
  function keep(list) { try { localStorage.setItem(CHAT_KEY, JSON.stringify(list.slice(-MAX_KEEP))); } catch (e) { } }

  /* ---------- güvenli Markdown ---------- */
  function md(s) {
    var lines = h(s).split('\n'), out = [], inList = false, table = [];
    function flushTable() {
      if (!table.length) return;
      var rows = table.filter(function (r) { return !/^\|?\s*:?-{2,}/.test(r); }).map(function (r) { return r.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }); });
      out.push('<table class="ai-tbl">' + rows.map(function (r, i) { return '<tr>' + r.map(function (c) { return (i ? '<td>' : '<th>') + inl(c) + (i ? '</td>' : '</th>'); }).join('') + '</tr>'; }).join('') + '</table>');
      table = [];
    }
    function inl(x) { return x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>'); }
    lines.forEach(function (l) {
      if (/^\s*\|.*\|\s*$/.test(l)) { if (inList) { out.push('</ul>'); inList = false; } table.push(l.trim()); return; }
      flushTable();
      var m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
      if (m) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + inl(m[1]) + '</li>'); return; }
      if (inList) { out.push('</ul>'); inList = false; }
      var hm = /^#{1,4}\s+(.*)$/.exec(l);
      if (hm) { out.push('<div class="ai-h">' + inl(hm[1]) + '</div>'); return; }
      out.push(l.trim() ? '<p>' + inl(l) + '</p>' : '');
    });
    flushTable(); if (inList) out.push('</ul>');
    return out.join('');
  }

  /* ---------- sayfa ---------- */
  var busy = false;
  function render(m) {
    var a = aiCfg(), on = onlineAllowed();
    var chips = ['Bugün kim nerede?', 'Yaklaşan değişim günleri', 'Hat özeti', 'Genel özet'];
    if (modOn('drivers')) chips.splice(2, 0, 'Nöbetteki şoförler');
    if (modOn('vehicles')) chips.splice(3, 0, 'Belgesi dolan araçlar');
    m.innerHTML = '<h1>✦ ' + h(t('Danışman')) + ' <span class="badge ' + (on ? 'ok' : 'gray') + '" id="aiMode">' + h(on ? t('Çevrim içi') + ' · ' + (PROV[a.provider] || a.provider) : t('Çevrim dışı')) + '</span></h1>' +
      '<p class="muted small">' + h(t('Kayıtlarınız hakkında soru sorun: kim nerede, değişim günleri, hatlar, şoför nöbeti, araç belgeleri…')) + '</p>' +
      (a ? '' : '<div class="card tight"><p class="small">' + h(t('Yapay zekâ anahtarı girilmedi; yerleşik danışman (çevrim dışı) yanıtlıyor. Ayarlar → Danışman kartından kendi anahtarınızı ekleyebilirsiniz.')) + '</p></div>') +
      '<div class="card ai-card"><div class="ai-log" id="aiLog" aria-live="polite"></div>' +
      '<div class="ai-chips">' + chips.map(function (c) { return '<button class="btn sm" data-aiq="' + h(c) + '">' + h(t(c)) + '</button>'; }).join('') + '</div>' +
      '<form class="ai-form" id="aiForm"><textarea id="aiIn" rows="2" dir="auto" placeholder="' + h(t('Sorunuzu yazın…')) + '"></textarea>' +
      '<div class="ai-btns"><button class="btn primary" type="submit" id="aiSend">' + h(t('Sor')) + '</button><button class="btn sm" type="button" id="aiClear">' + h(t('Sohbeti temizle')) + '</button></div></form></div>';
    draw();
    var inp = $('#aiIn', m);
    $('#aiForm', m).onsubmit = function (e) { e.preventDefault(); ask(inp.value); };
    inp.onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(inp.value); } };
    $$('[data-aiq]', m).forEach(function (b) { b.onclick = function () { ask(t(b.dataset.aiq)); }; });
    $('#aiClear', m).onclick = function () { keep([]); draw(); toast(t('Sohbet temizlendi')); };
    inp.focus();
  }
  function draw(pending) {
    var log = $('#aiLog'); if (!log) return;
    var list = chat();
    log.innerHTML = list.map(function (x) {
      return '<div class="ai-msg ' + (x.role === 'user' ? 'me' : 'bot') + '"><div class="ai-b" dir="auto">' + (x.role === 'user' ? h(x.text).replace(/\n/g, '<br>') : md(x.text)) + '</div>' +
        (x.role !== 'user' ? '<div class="ai-meta">' + h(x.mode === 'online' ? '✦ ' + t('Çevrim içi') : '⌂ ' + t('Çevrim dışı')) + (x.note ? ' · ' + h(t(x.note)) : '') + '</div>' : '') + '</div>';
    }).join('') + (pending ? '<div class="ai-msg bot"><div class="ai-b muted">' + h(t('Yanıt hazırlanıyor…')) + '</div></div>' : '');
    log.scrollTop = log.scrollHeight;
  }
  async function ask(q) {
    q = String(q || '').trim(); if (!q || busy) return;
    busy = true; var inp = $('#aiIn'); if (inp) inp.value = '';
    var send = $('#aiSend'); if (send) send.disabled = true;
    var list = chat(); list.push({ role: 'user', text: q, at: Date.now() }); keep(list); draw(true);
    var ans, mode = 'offline', note = '';
    if (onlineAllowed()) {
      try { ans = await online(q); mode = 'online'; } catch (e) { console.warn('danışman çevrim içi', e); note = 'Çevrim içi yanıt alınamadı; yerleşik danışman yanıtladı.'; }
    }
    if (!ans) ans = offline(q);
    list = chat(); list.push({ role: 'ai', text: ans, mode: mode, note: note, at: Date.now() }); keep(list);
    busy = false; if (send) send.disabled = false;
    draw(); var i2 = $('#aiIn'); if (i2) i2.focus();
  }

  /* ---------- Ayarlar kartı ---------- */
  var KEY_URL = { gemini: 'https://aistudio.google.com/app/apikey', openai: 'https://platform.openai.com/api-keys', anthropic: 'https://console.anthropic.com/settings/keys', groq: 'https://console.groq.com/keys' };
  function settingsHtml() {
    var a = FC.storage.get('ai', null) || { provider: 'gemini', key: '' };
    return '<div class="card" id="aiSet"><h2>✦ ' + h(t('Danışman (yapay zekâ)')) + '</h2>' +
      '<p class="small muted">' + h(t('Kendi yapay zekâ anahtarınızla çalışır; program sahibinin kotası kullanılmaz. Anahtar yalnız bu bilgisayarda saklanır. Soruya yanıt için gereken kayıt özeti sağlayıcıya gönderilir; telefon, anne adı ve notlar gönderilmez.')) + '</p>' +
      '<label class="chk"><input type="checkbox" id="ai_on" ' + (S.settings.aiOnline !== false ? 'checked' : '') + '> ' + h(t('Çevrim içi yapay zekâ kullanılsın')) + '</label>' +
      '<div class="grid c2" style="margin-top:8px"><label class="f">' + h(t('Sağlayıcı')) + '<select id="ai_prov">' + Object.keys(PROV).map(function (k) { return '<option value="' + k + '"' + (a.provider === k ? ' selected' : '') + '>' + PROV[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">' + h(t('Model (isteğe bağlı)')) + '<input id="ai_model" dir="ltr" value="' + h(a.model || '') + '" placeholder="' + (a.provider === 'gemini' || !a.provider ? GEMINI_MODELS[0] : '') + '"></label></div>' +
      '<label class="f" style="margin-top:8px">' + h(t('Anahtar')) + '<input id="ai_key" type="password" dir="ltr" autocomplete="off" value="' + h(a.key || '') + '"></label>' +
      '<div class="row" style="margin-top:10px"><button class="btn primary" id="ai_save">' + h(t('Kaydet')) + '</button><button class="btn" id="ai_test">' + h(t('Dene')) + '</button><button class="btn" id="ai_get">' + h(t('Anahtarı al')) + '</button>' +
      '<span class="small muted" id="ai_state">' + h(t('Bugünkü istek')) + ': ' + usedToday() + '</span></div></div>';
  }
  function readForm(m) { return { provider: $('#ai_prov', m).value, key: $('#ai_key', m).value.trim(), model: $('#ai_model', m).value.trim() }; }
  function bindSettings(m) {
    if (!$('#aiSet', m)) return;
    $('#ai_save', m).onclick = function () {
      var v = readForm(m); if (!v.model) delete v.model;
      FC.storage.set('ai', v); S.settings.aiOnline = $('#ai_on', m).checked; save(); toast(t('Kaydedildi'));
    };
    $('#ai_on', m).onchange = function () { S.settings.aiOnline = this.checked; save(); };
    $('#ai_get', m).onclick = function () { var u = KEY_URL[$('#ai_prov', m).value]; if (u) FC.ui.openUrl(u); };
    $('#ai_test', m).onclick = async function () {
      var v = readForm(m), st = $('#ai_state', m); st.textContent = '…';
      var r = 'unknown';
      try { r = await FC.onboarding.testAi(v.provider, v.key); } catch (e) { }
      st.textContent = r === 'ok' ? '✓ ' + t('Anahtar geçerli') : r === 'bad' ? '✕ ' + t('Anahtar geçersiz') : t('Denenemedi (internet?)');
    };
  }

  window.Danisman = { render: render, settingsHtml: settingsHtml, bindSettings: bindSettings, offline: offline, context: context, md: md, ask: ask };
})();
