/* Merkezi Servis – profesyonel modül (v1.0.9)
   Seferler & yoklama, araçlar, bakım/yakıt, maliyet & hakediş, kullanıcılar & yetkiler,
   işlem geçmişi, otomatik yedek, çöp kutusu, tema, kısayollar, ek raporlar.
   app.js'den ÖNCE yüklenir; app.js'deki fonksiyonları yalnızca çağrı anında kullanır. */
'use strict';
(function () {
  const P = window.Pro = {};
  const hasS = () => { try { return !!S; } catch (e) { return false; } };

  // ================= yardımcılar =================
  const SLOTS = [['morning', 'Sabah'], ['noon', 'Öğle'], ['evening', 'Akşam'], ['night', 'Gece']];
  const slotLbl = s => t((SLOTS.find(x => x[0] === s) || SLOTS[0])[1]);
  const CURS = { USD: '$', SYP: 'ل.س', TRY: '₺' };
  const ROLES = [['admin', 'Yönetici'], ['operator', 'Operatör'], ['viewer', 'Sadece görüntüleme']];
  const roleLbl = r => t((ROLES.find(x => x[0] === r) || ROLES[2])[1]);
  const MAINT_TYPES = ['Periyodik bakım', 'Yağ değişimi', 'Lastik', 'Fren', 'Arıza / tamir', 'Kaporta', 'Diğer'];
  const monthOf = iso => String(iso || todayISO()).slice(0, 7);
  const monthRange = ym => { const [y, m] = ym.split('-').map(Number); const a = toISO(new Date(y, m - 1, 1)), b = toISO(new Date(y, m, 0)); return [a, b]; };
  const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const monthLbl = ym => { try { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(LANG === 'ar' ? 'ar-SY' : LANG, { month: 'long', year: 'numeric' }); } catch (e) { return ym; } };
  const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const fx = () => Object.assign({ USD: 1, SYP: 13000, TRY: 41 }, S.settings.fx || {});
  const baseCur = () => S.settings.currency || 'USD';
  const conv = (v, from, to) => { const r = fx(); return num(v) / (r[from || 'USD'] || 1) * (r[to || baseCur()] || 1); };
  const money = (v, cur) => { cur = cur || baseCur(); const d = cur === 'SYP' ? 0 : 2; let s; try { s = Number(v || 0).toLocaleString(LANG === 'ar' ? 'ar-SY' : LANG === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); } catch (e) { s = Number(v || 0).toFixed(d); } return s + ' ' + (CURS[cur] || cur); };
  const curSel = (id, val) => `<select id="${id}">${Object.keys(CURS).map(c => `<option ${c === (val || baseCur()) ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
  const clone = o => JSON.parse(JSON.stringify(o));
  const vehById = id => (S.vehicles || []).find(v => v.id === id);
  const iso = x => '\u2068' + x + '\u2069'; // plaka gibi metinler sağdan sola dilde karışmasın
  const vehName = id => { const v = vehById(id); return v ? iso(v.plate) + (v.model ? ' · ' + v.model : '') : '—'; };
  const drvById = id => S.drivers.find(d => d.id === id);
  const drvName = id => (drvById(id) || {}).name || '—';
  const daysTo = iso => iso ? diffDays(todayISO(), iso) : null;
  const tm = (hhmm, add) => { if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return ''; const [hh, mm] = hhmm.split(':').map(Number); const x = hh * 60 + mm + (add || 0); return String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(((x % 60) + 60) % 60).padStart(2, '0'); };
  P.helpers = { monthOf, monthRange, money, conv, vehName, drvName };

  // ================= çeviriler (TR anahtar → [EN, AR]) =================
  const TX = {
    'Seferler & Yoklama': ['Trips & Attendance', 'الرحلات والتفقد'], 'Araçlar': ['Vehicles', 'المركبات'], 'Maliyet': ['Costs', 'التكاليف'], 'Kayıtlar': ['Records', 'السجلات'],
    'Sabah': ['Morning', 'صباحاً'], 'Öğle': ['Noon', 'ظهراً'], 'Akşam': ['Evening', 'مساءً'], 'Gece': ['Night', 'ليلاً'],
    'Yönetici': ['Administrator', 'مدير'], 'Operatör': ['Operator', 'مشغّل'], 'Sadece görüntüleme': ['View only', 'عرض فقط'],
    'Periyodik bakım': ['Periodic service', 'صيانة دورية'], 'Yağ değişimi': ['Oil change', 'تغيير زيت'], 'Lastik': ['Tyres', 'إطارات'], 'Fren': ['Brakes', 'مكابح'], 'Arıza / tamir': ['Breakdown / repair', 'عطل / إصلاح'], 'Kaporta': ['Bodywork', 'هيكل'], 'Diğer': ['Other', 'أخرى'],
    'Sefer': ['Trip', 'رحلة'], 'Değişim': ['Changeover', 'تبديل'], 'Ek sefer': ['Extra trip', 'رحلة إضافية'], '+ Ek sefer': ['+ Extra trip', '+ رحلة إضافية'],
    'Planlandı': ['Planned', 'مخططة'], 'Tamamlandı': ['Completed', 'مكتملة'], 'İptal': ['Cancelled', 'ملغاة'],
    'Vakit': ['Time slot', 'الفترة'], 'Kalkış': ['Departure', 'الانطلاق'], 'Araç': ['Vehicle', 'المركبة'], 'Araç 2': ['Vehicle 2', 'المركبة 2'], 'Şoför 2': ['Driver 2', 'السائق 2'],
    'Yolcu': ['Passengers', 'الركاب'], 'Doluluk': ['Load', 'الإشغال'], 'Yoklama': ['Attendance', 'التفقد'], 'Yolcular': ['Passengers', 'الركاب'],
    '— araç seçin —': ['— choose vehicle —', '— اختر مركبة —'], '— şoför seçin —': ['— choose driver —', '— اختر سائقاً —'],
    'Bu tarihte sefer yok': ['No trips on this date', 'لا توجد رحلات في هذا التاريخ'], 'Tarih': ['Date', 'التاريخ'],
    'Kapasite aşıldı': ['Capacity exceeded', 'تجاوز السعة'], 'Araç atanmadı': ['No vehicle assigned', 'لم تُخصص مركبة'], 'Şoför atanmadı': ['No driver assigned', 'لم يُخصص سائق'],
    '2 otobüse böl': ['Split into 2 buses', 'تقسيم إلى حافلتين'], 'Uygun araç öner': ['Suggest a suitable vehicle', 'اقتراح مركبة مناسبة'], 'Uygun boş araç yok': ['No suitable free vehicle', 'لا توجد مركبة متاحة مناسبة'],
    '{0} aracı atandı': ['Vehicle {0} assigned', 'تم تخصيص المركبة {0}'], 'Sefer 2 otobüse bölündü': ['Trip split into 2 buses', 'تم تقسيم الرحلة إلى حافلتين'],
    'Bu araç aynı vakitte başka sefere atanmış': ['This vehicle is already assigned to another trip in the same slot', 'هذه المركبة مخصصة لرحلة أخرى في نفس الفترة'],
    'Bu şoför aynı vakitte başka sefere atanmış': ['This driver is already assigned to another trip in the same slot', 'هذا السائق مخصص لرحلة أخرى في نفس الفترة'],
    'Sefer sayısı': ['Trips', 'عدد الرحلات'], 'Araçsız': ['Without vehicle', 'بلا مركبة'], 'Kapasite uyarısı': ['Capacity warnings', 'تحذيرات السعة'], 'Yoklama alınan': ['Attendance taken', 'تم التفقد'],
    'Şoför listelerini yazdır': ['Print driver lists', 'طباعة قوائم السائقين'], 'Önceki ek seferleri kopyala': ['Copy previous extra trips', 'نسخ الرحلات الإضافية السابقة'],
    'Kopyalanacak ek sefer bulunamadı': ['No extra trips found to copy', 'لم يتم العثور على رحلات إضافية للنسخ'], '{0} ek sefer kopyalandı': ['{0} extra trips copied', 'تم نسخ {0} رحلات إضافية'],
    'Yön': ['Direction', 'الاتجاه'], 'İşe gidiş': ['To work', 'ذهاب إلى العمل'], 'Eve dönüş': ['Return home', 'عودة إلى المنزل'],
    'Ek sefer düzenle': ['Edit extra trip', 'تعديل رحلة إضافية'], 'Yolcu seçin': ['Choose passengers', 'اختر الركاب'], 'seçili': ['selected', 'محدد'],
    'Sefer silinsin mi?': ['Delete trip?', 'حذف الرحلة؟'], 'Sefer silindi': ['Trip deleted', 'تم حذف الرحلة'],
    'QR / sicil okut': ['Scan QR / reg. no', 'امسح QR / الرقم'], 'Okuyucu ile okutun veya sicil no yazıp Enter\'a basın': ['Scan with a reader or type the reg. no and press Enter', 'امسح بالقارئ أو اكتب الرقم واضغط Enter'],
    'Bindi': ['Boarded', 'صعد'], 'Gelmedi': ['Absent', 'غائب'], 'İşaretlenmedi': ['Not marked', 'غير محدد'], 'Hepsi bindi': ['All boarded', 'الجميع صعدوا'], 'Temizle': ['Clear', 'مسح'],
    'Bu kişi bu seferin listesinde yok': ['This person is not on this trip', 'هذا الشخص ليس ضمن هذه الرحلة'], 'Kişi bulunamadı': ['Person not found', 'لم يتم العثور على الشخص'],
    'bindi olarak işaretlendi': ['marked as boarded', 'تم تسجيله كصاعد'], 'QR kart': ['QR card', 'بطاقة QR'], 'QR kartları yazdır': ['Print QR cards', 'طباعة بطاقات QR'],
    'Durak saati (dk)': ['Stop time (min)', 'وقت المحطة (دقيقة)'], 'Kalkış saati': ['Departure time', 'وقت الانطلاق'], 'Arapça adı': ['Arabic name', 'الاسم بالعربية'], 'İngilizce adı': ['English name', 'الاسم بالإنجليزية'],
    'kalkıştan sonra dakika': ['minutes after departure', 'دقائق بعد الانطلاق'],
    // araçlar
    'Plaka': ['Plate', 'اللوحة'], 'Model': ['Model', 'الطراز'], 'Yıl': ['Year', 'السنة'], 'Kapasite': ['Capacity', 'السعة'], 'Sahiplik': ['Ownership', 'الملكية'],
    'Kurum aracı': ['Own vehicle', 'مركبة المؤسسة'], 'Kiralık (taşeron)': ['Hired (contractor)', 'مستأجرة (متعهد)'], 'Taşeron': ['Contractor', 'المتعهد'], 'Taşeron telefonu': ['Contractor phone', 'هاتف المتعهد'],
    'Ücret türü': ['Rate type', 'نوع الأجر'], 'Sefer başı': ['Per trip', 'لكل رحلة'], 'Gün başı': ['Per day', 'لكل يوم'], 'Aylık sabit': ['Fixed monthly', 'شهري ثابت'], 'Ücret': ['Rate', 'الأجر'], 'Para birimi': ['Currency', 'العملة'],
    'Varsayılan hat': ['Default line', 'الخط الافتراضي'], 'Varsayılan şoför': ['Default driver', 'السائق الافتراضي'], 'Sigorta bitişi': ['Insurance expiry', 'انتهاء التأمين'], 'Muayene bitişi': ['Inspection expiry', 'انتهاء الفحص'], 'Ruhsat bitişi': ['Registration expiry', 'انتهاء الترخيص'],
    'Kilometre': ['Odometer (km)', 'العداد (كم)'], 'Sonraki bakım km': ['Next service km', 'كم الصيانة القادمة'], 'Sonraki bakım tarihi': ['Next service date', 'تاريخ الصيانة القادمة'], 'Kullanımda': ['In use', 'قيد الاستخدام'],
    'Yeni araç': ['New vehicle', 'مركبة جديدة'], 'Aracı düzenle': ['Edit vehicle', 'تعديل المركبة'], '+ Araç ekle': ['+ Add vehicle', '+ إضافة مركبة'], 'Plaka gerekli': ['Plate is required', 'اللوحة مطلوبة'], 'Araç silinsin mi?': ['Delete vehicle?', 'حذف المركبة؟'],
    'Belgeler': ['Documents', 'الوثائق'], 'Bakım': ['Maintenance', 'الصيانة'], 'Yakıt': ['Fuel', 'الوقود'], 'Bakım & arıza': ['Maintenance & repairs', 'الصيانة والأعطال'],
    '+ Bakım / arıza kaydı': ['+ Maintenance / repair record', '+ سجل صيانة / عطل'], '+ Yakıt kaydı': ['+ Fuel record', '+ سجل وقود'], 'Tür': ['Type', 'النوع'], 'Tutar': ['Amount', 'المبلغ'], 'Servis / yer': ['Workshop / place', 'الورشة / المكان'],
    'Litre': ['Litres', 'لتر'], 'İstasyon': ['Station', 'المحطة'], 'km/litre': ['km/litre', 'كم/لتر'], 'Toplam litre': ['Total litres', 'مجموع اللترات'], 'Toplam tutar': ['Total amount', 'المبلغ الإجمالي'], 'Ortalama km/l': ['Average km/l', 'متوسط كم/لتر'],
    'Kayıt yok': ['No records', 'لا توجد سجلات'], 'Kayıt silinsin mi?': ['Delete record?', 'حذف السجل؟'], 'Tüm araçlar': ['All vehicles', 'جميع المركبات'], 'Araç seçin': ['Choose a vehicle', 'اختر مركبة'],
    'Önce araç ekleyin': ['Add a vehicle first', 'أضف مركبة أولاً'], 'Şablon indir': ['Download template', 'تنزيل القالب'], 'süresi geçti': ['expired', 'منتهي'], '{0} gün kaldı': ['{0} days left', 'باقٍ {0} يوم'],
    'Belge ve bakım uyarıları': ['Document & service alerts', 'تنبيهات الوثائق والصيانة'], 'Uyarı yok': ['No alerts', 'لا توجد تنبيهات'], 'Ehliyet bitişi': ['Licence expiry', 'انتهاء الرخصة'], 'Bakım zamanı': ['Service due', 'موعد الصيانة'],
    'km kaldı': ['km left', 'كم متبقية'], 'km geçti': ['km over', 'كم تجاوز'], 'İçe aktarıldı: {0} yeni, {1} güncellendi': ['Imported: {0} new, {1} updated', 'تم الاستيراد: {0} جديد، {1} محدث'],
    // şoför
    'Ehliyet sınıfı': ['Licence class', 'فئة الرخصة'], 'Atandığı hat': ['Assigned line', 'الخط المخصص'], 'Atandığı araç': ['Assigned vehicle', 'المركبة المخصصة'],
    // maliyet
    'Ay': ['Month', 'الشهر'], 'Gösterim para birimi': ['Display currency', 'عملة العرض'], 'Toplam maliyet': ['Total cost', 'التكلفة الإجمالية'], 'Hakediş': ['Contractor payment', 'مستحقات المتعهد'], 'Kişi başı': ['Per person', 'للشخص'],
    'Araç bazında': ['By vehicle', 'حسب المركبة'], 'Hat bazında': ['By line', 'حسب الخط'], 'Gün': ['Days', 'الأيام'], 'Kişi (serviste)': ['People (in service)', 'الأشخاص (في الخدمة)'], 'Taşınan yolcu': ['Passengers carried', 'الركاب المنقولون'],
    'Son 6 ay': ['Last 6 months', 'آخر 6 أشهر'], 'Atanmamış': ['Unallocated', 'غير موزع'], 'Kur ayarları': ['Exchange rates', 'أسعار الصرف'], '1 USD =': ['1 USD =', '1 دولار ='],
    'Maliyetler, seferlere atanan araçlardan hesaplanır. Yakıt ve bakım giderleri aracın o aydaki sefer sayısına göre hatlara paylaştırılır.': ['Costs are calculated from vehicles assigned to trips. Fuel and maintenance costs are shared between lines according to the vehicle\'s trips that month.', 'تُحسب التكاليف من المركبات المخصصة للرحلات. تُوزع تكاليف الوقود والصيانة على الخطوط حسب عدد رحلات المركبة في ذلك الشهر.'],
    'Hakediş raporu': ['Payment report', 'تقرير المستحقات'],
    // güvenlik
    'Kullanıcılar ve yetkiler': ['Users & permissions', 'المستخدمون والصلاحيات'], 'Kullanıcı': ['User', 'المستخدم'], 'Kullanıcı adı': ['Username', 'اسم المستخدم'], 'Yetki': ['Role', 'الصلاحية'], 'Şifre': ['Password', 'كلمة المرور'],
    '+ Kullanıcı ekle': ['+ Add user', '+ إضافة مستخدم'], 'Yeni kullanıcı': ['New user', 'مستخدم جديد'], 'Kullanıcıyı düzenle': ['Edit user', 'تعديل المستخدم'], 'Şifre (değiştirmek için yazın)': ['Password (type to change)', 'كلمة المرور (اكتب للتغيير)'],
    'Kullanıcı tanımlanınca açılışta giriş istenir. Yönetici her şeyi yapar; operatör kullanıcı yönetimi ve geri yükleme dışında her şeyi yapar; görüntüleme yetkisi değişiklik yapamaz.': ['Once users exist, sign-in is required at start. Administrators can do everything; operators can do everything except user management and restores; view-only users cannot change anything.', 'عند إضافة مستخدمين يُطلب تسجيل الدخول عند البدء. المدير يملك كل الصلاحيات؛ المشغّل كل شيء عدا إدارة المستخدمين والاستعادة؛ مستخدم العرض لا يمكنه التعديل.'],
    'Henüz kullanıcı yok; uygulama şifresiz açılıyor.': ['No users yet; the app opens without a password.', 'لا يوجد مستخدمون بعد؛ يفتح التطبيق دون كلمة مرور.'],
    'Ad ve kullanıcı adı gerekli': ['Name and username are required', 'الاسم واسم المستخدم مطلوبان'], 'Bu kullanıcı adı zaten var': ['This username already exists', 'اسم المستخدم موجود مسبقاً'], 'Yeni kullanıcı için şifre gerekli': ['A password is required for a new user', 'كلمة المرور مطلوبة للمستخدم الجديد'],
    'En az bir yönetici kalmalı': ['At least one administrator must remain', 'يجب أن يبقى مدير واحد على الأقل'], 'Kendi hesabınızı silemezsiniz': ['You cannot delete your own account', 'لا يمكنك حذف حسابك'], 'Kullanıcı silinsin mi?': ['Delete user?', 'حذف المستخدم؟'], 'Aktif': ['Active', 'نشط'],
    'Giriş': ['Sign in', 'دخول'], 'Çıkış': ['Sign out', 'خروج'], 'Hatalı şifre': ['Wrong password', 'كلمة مرور خاطئة'], 'Kullanıcı girişi': ['User sign-in', 'تسجيل دخول المستخدم'],
    'Görüntüleme yetkiniz var; değişiklik kaydedilmedi': ['You have view-only access; the change was not saved', 'لديك صلاحية العرض فقط؛ لم يتم حفظ التغيير'], 'Bu işlem için yönetici yetkisi gerekir': ['This action requires administrator rights', 'هذا الإجراء يتطلب صلاحية المدير'],
    'Eski idareci şifreniz "admin" kullanıcısına aktarıldı': ['Your old admin password was moved to the "admin" user', 'تم نقل كلمة مرور المدير القديمة إلى المستخدم "admin"'],
    'İşlem geçmişi': ['Activity log', 'سجل العمليات'], 'Çöp kutusu': ['Recycle bin', 'سلة المحذوفات'], 'Yedekler': ['Backups', 'النسخ الاحتياطية'], 'Zaman': ['Time', 'الوقت'], 'İşlem': ['Action', 'العملية'], 'Kayıt': ['Record', 'السجل'],
    'eklendi': ['added', 'أضيف'], 'değiştirildi': ['changed', 'عُدّل'], 'silindi': ['deleted', 'حُذف'], 'toplu': ['bulk', 'جماعي'], 'Ara…': ['Search…', 'بحث…'],
    'Kişi': ['Person', 'شخص'], 'Yer': ['Place', 'مكان'], 'Hat': ['Line', 'خط'], 'Şoför': ['Driver', 'سائق'], 'Grup': ['Group', 'مجموعة'], 'Antet': ['Letterhead', 'ترويسة'], 'Ana hat': ['Main line', 'خط رئيسي'],
    'Ayarlar': ['Settings', 'الإعدادات'], 'Sefer planı': ['Trip plan', 'خطة الرحلات'], 'Bakım kaydı': ['Maintenance record', 'سجل صيانة'], 'Yakıt kaydı': ['Fuel record', 'سجل وقود'],
    'Geri al': ['Restore', 'استعادة'], 'Kalıcı sil': ['Delete permanently', 'حذف نهائي'], 'Çöp kutusunu boşalt': ['Empty recycle bin', 'إفراغ سلة المحذوفات'], 'Çöp kutusu boş': ['Recycle bin is empty', 'سلة المحذوفات فارغة'],
    'Geri alındı': ['Restored', 'تمت الاستعادة'], 'Aynı kayıt zaten mevcut': ['The same record already exists', 'السجل نفسه موجود بالفعل'], 'Kalıcı olarak silinsin mi? Bu işlem geri alınamaz.': ['Delete permanently? This cannot be undone.', 'حذف نهائي؟ لا يمكن التراجع عن هذا.'],
    'Silen': ['Deleted by', 'حذفه'], 'Silinme': ['Deleted at', 'وقت الحذف'], 'Otomatik günlük yedek': ['Automatic daily backup', 'نسخة احتياطية يومية تلقائية'], 'Şimdi yedekle': ['Back up now', 'نسخ احتياطي الآن'],
    'Program her gün bir yedek alır ve son 30 günü saklar. Elle alınan yedeklerin son 20 tanesi saklanır.': ['The app takes a backup every day and keeps the last 30 days. The last 20 manual backups are kept.', 'يأخذ البرنامج نسخة احتياطية يومياً ويحتفظ بآخر 30 يوماً، ويحتفظ بآخر 20 نسخة يدوية.'],
    'Yedek alındı': ['Backup taken', 'تم أخذ نسخة احتياطية'], 'Bu yedeğe dönülsün mü? Şu anki veriler önce ayrıca yedeklenir.': ['Return to this backup? Current data will be backed up first.', 'العودة إلى هذه النسخة؟ سيتم نسخ البيانات الحالية أولاً.'],
    'Yedekten geri yüklendi': ['Restored from backup', 'تمت الاستعادة من النسخة الاحتياطية'], 'elle': ['manual', 'يدوي'], 'otomatik': ['automatic', 'تلقائي'], 'Boyut': ['Size', 'الحجم'], 'İndir': ['Download', 'تنزيل'], 'Yedek bulunamadı': ['No backups found', 'لا توجد نسخ احتياطية'],
    'Yedekleme bu ortamda kullanılamıyor': ['Backups are not available in this environment', 'النسخ الاحتياطي غير متاح في هذه البيئة'], 'geri yükleme öncesi': ['before restore', 'قبل الاستعادة'],
    // tema / görünüm
    'Görünüm': ['Appearance', 'المظهر'], 'Tema': ['Theme', 'السمة'], 'Açık': ['Light', 'فاتح'], 'Koyu': ['Dark', 'داكن'], 'Sisteme göre': ['Follow system', 'حسب النظام'], 'Kurum rengi': ['Brand colour', 'لون المؤسسة'], 'Açılış ekranı': ['Splash screen', 'شاشة البدء'], 'Varsayılan renk': ['Default colour', 'اللون الافتراضي'],
    'Klavye kısayolları': ['Keyboard shortcuts', 'اختصارات لوحة المفاتيح'], 'Hızlı arama': ['Quick search', 'بحث سريع'], 'Sayfalar arasında geçiş': ['Switch pages', 'التنقل بين الصفحات'], 'Bu sayfada yeni kayıt': ['New record on this page', 'سجل جديد في هذه الصفحة'],
    'Yazdır': ['Print', 'طباعة'], 'Sayfadaki aramaya git': ['Go to page search', 'الانتقال إلى بحث الصفحة'], 'Kısayol yardımı': ['Shortcut help', 'مساعدة الاختصارات'], 'Pencereyi kapat': ['Close dialog', 'إغلاق النافذة'],
    'Kişi, yer, hat, araç, şoför ara…': ['Search people, places, lines, vehicles, drivers…', 'ابحث عن أشخاص، أماكن، خطوط، مركبات، سائقين…'], 'Sonuç yok': ['No results', 'لا توجد نتائج'], 'Yükleniyor…': ['Loading…', 'جارٍ التحميل…'],
    // panel
    'Seferler': ['Trips', 'الرحلات'], 'Sonraki değişim günü': ['Next changeover day', 'يوم التبديل القادم'], 'Seferleri aç': ['Open trips', 'فتح الرحلات'], 'Bu ay': ['This month', 'هذا الشهر'], 'Aylık maliyet': ['Monthly cost', 'التكلفة الشهرية'], 'Maliyeti aç': ['Open costs', 'فتح التكاليف'], 'hazır': ['ready', 'جاهز'],
    // raporlar
    'Şoför durak listesi': ['Driver stop list', 'قائمة محطات السائق'], 'Sefer ve araç atama listesi': ['Trip & vehicle assignment list', 'قائمة الرحلات وتخصيص المركبات'], 'Yoklama / devamsızlık raporu': ['Attendance / absence report', 'تقرير التفقد / الغياب'],
    'Aylık özet': ['Monthly summary', 'الملخص الشهري'], 'Araç listesi ve belge durumu': ['Vehicle list & document status', 'قائمة المركبات وحالة الوثائق'], 'Bakım ve yakıt raporu': ['Maintenance & fuel report', 'تقرير الصيانة والوقود'],
    'Taşeron hakediş raporu': ['Contractor payment report', 'تقرير مستحقات المتعهدين'], 'QR personel kartları': ['QR staff cards', 'بطاقات QR للموظفين'], 'Bitiş tarihi': ['End date', 'تاريخ النهاية'], 'Tüm şoförler': ['All drivers', 'جميع السائقين'],
    'Durak': ['Stop', 'المحطة'], 'Tahmini saat': ['Est. time', 'الوقت التقديري'], 'İnecekler': ['Getting off', 'النازلون'], 'Binecekler': ['Getting on', 'الصاعدون'], 'İmza': ['Signature', 'التوقيع'],
    'Bindi sayısı': ['Times boarded', 'مرات الصعود'], 'Gelmedi sayısı': ['Times absent', 'مرات الغياب'], 'Devamsızlık oranı': ['Absence rate', 'نسبة الغياب'], 'Sefer bazında yoklama': ['Attendance by trip', 'التفقد حسب الرحلة'], 'Kişi bazında devamsızlık': ['Absence by person', 'الغياب حسب الشخص'],
    'Yoklama kaydı yok': ['No attendance records', 'لا توجد سجلات تفقد'], 'Seferler ve yolcular': ['Trips & passengers', 'الرحلات والركاب'], 'Uyarılar': ['Alerts', 'التنبيهات'], 'Durum': ['Status', 'الحالة'],
    'Sefer / gün': ['Trips / days', 'رحلات / أيام'], 'Ödenecek': ['Payable', 'المستحق'], 'Kurum aracı – hakediş yok': ['Own vehicle – no payment', 'مركبة المؤسسة – لا مستحقات'], 'Taşeron araç yok': ['No contractor vehicles', 'لا توجد مركبات متعهدين'],
    'Sicil': ['Reg. no', 'الرقم'], 'Ad Soyad': ['Full name', 'الاسم الكامل'], 'Not': ['Note', 'ملاحظة'], 'Telefon': ['Phone', 'الهاتف'], 'Toplam': ['Total', 'المجموع'], 'Ekip': ['Team', 'الفريق'],
    'Kaydet': ['Save', 'حفظ'], 'Sil': ['Delete', 'حذف'], 'Düzenle': ['Edit', 'تعديل'], 'Ekle': ['Add', 'إضافة'], 'Kapat': ['Close', 'إغلاق'], "Excel'e ver": ['Export to Excel', 'تصدير إلى Excel'], "Excel'den al": ['Import from Excel', 'استيراد من Excel'],
    'Tüm hatlar': ['All lines', 'جميع الخطوط'], 'Kaydedildi': ['Saved', 'تم الحفظ'], 'Ad': ['Name', 'الاسم'], 'Kişi ara…': ['Search person…', 'ابحث عن شخص…'], 'işyeri': ['workplace', 'مكان العمل'],
    'Değişiklik yok': ['No changes', 'لا تغييرات'], 'Yeni sürüm notu': ['Release note', 'ملاحظة الإصدار'], 'Tümünü göster': ['Show all', 'عرض الكل'],
    'Hat listesinde durakları kalkıştan sonraki dakikaya göre girerseniz şoför listesinde tahmini saat yazılır.': ['If you enter the stops\' minutes after departure in the line list, the driver list shows estimated times.', 'إذا أدخلت دقائق المحطات بعد الانطلاق في قائمة الخط، تظهر الأوقات التقديرية في قائمة السائق.'],
    'Araç ve şoför atamaları Seferler sayfasından yapılır.': ['Vehicles and drivers are assigned on the Trips page.', 'يتم تخصيص المركبات والسائقين من صفحة الرحلات.'],
    'otobüs': ['bus', 'حافلة'], 'kişi': ['people', 'شخص'], 'gün': ['days', 'يوم'], 'Yükleme': ['Load', 'الحمولة'], 'Excel şablonu: Plaka, Model, Yıl, Kapasite, Sahiplik, Taşeron, Ücret, Para birimi, Sigorta bitişi, Muayene bitişi, Ruhsat bitişi, Kilometre': ['Excel template: Plate, Model, Year, Capacity, Ownership, Contractor, Rate, Currency, Insurance expiry, Inspection expiry, Registration expiry, Odometer', 'قالب Excel: اللوحة، الطراز، السنة، السعة، الملكية، المتعهد، الأجر، العملة، انتهاء التأمين، انتهاء الفحص، انتهاء الترخيص، العداد'],
    'Yolcu yok': ['No passengers', 'لا ركاب'], 'Sefer bilgisi': ['Trip info', 'معلومات الرحلة'], 'Gidiş': ['Outbound', 'ذهاب'], 'Dönüş': ['Return', 'عودة'], 'Hepsini temizle': ['Clear all', 'مسح الكل'], 'Kart': ['Card', 'بطاقة'],
    'Modüller': ['Modules', 'الوحدات'], 'Kullanmadığınız bölümleri kapatın; menüden, panelden ve raporlardan kalkar. Kayıtlı veriler silinmez, modülü açınca geri gelir.': ['Turn off the sections you don\'t use; they disappear from the menu, dashboard and reports. Saved data is not deleted and comes back when you turn the module on.', 'أوقف الأقسام التي لا تستخدمها؛ فتختفي من القائمة واللوحة والتقارير. لا تُحذف البيانات المحفوظة وتعود عند تشغيل الوحدة.'],
    'Önce şu modülü açın': ['Turn this module on first', 'شغّل هذه الوحدة أولاً'], 'Ana Hatlar & Harita': ['Main Lines & Map', 'الخطوط الرئيسية والخريطة'], 'Şoförler': ['Drivers', 'السائقون'],
    'Araç/şoför atama, kapasite kontrolü, yoklama, QR kartlar': ['Vehicle/driver assignment, capacity check, attendance, QR cards', 'تخصيص المركبات والسائقين، فحص السعة، التفقد، بطاقات QR'],
    'Araç kartları, belge uyarıları, bakım ve yakıt kayıtları': ['Vehicle cards, document alerts, maintenance and fuel records', 'بطاقات المركبات، تنبيهات الوثائق، سجلات الصيانة والوقود'],
    'Maliyet, taşeron hakedişi, kur ayarları': ['Costs, contractor payments, exchange rates', 'التكاليف، مستحقات المتعهدين، أسعار الصرف'],
    'Ana hatlar sayfası ve Genel Durum haritası': ['Main lines page and the dashboard map', 'صفحة الخطوط الرئيسية وخريطة الحالة العامة'],
    'Şoför listesi ve nöbet düzeni': ['Driver list and duty rota', 'قائمة السائقين وجدول المناوبة'],
    'İşlem geçmişi, çöp kutusu ve yedek listesi (otomatik yedek her zaman çalışır)': ['Activity log, recycle bin and backup list (automatic backup always runs)', 'سجل العمليات وسلة المحذوفات وقائمة النسخ (النسخ التلقائي يعمل دائماً)'],
    'açık': ['on', 'مفعّل'], 'kapalı': ['off', 'متوقف'],
    'Sürüm': ['Version', 'الإصدار'], 'Yenilikler': ['What\'s new', 'الجديد'], 'Tamam': ['OK', 'حسناً']
  };
  window.I18N = window.I18N || {}; ['en', 'ar'].forEach((l, i) => { window.I18N[l] = window.I18N[l] || {}; for (const k in TX) if (!(k in window.I18N[l])) window.I18N[l][k] = TX[k][i]; });
  // app.js'deki yeni metinler
  const TX2 = {
    'Görüntüleme': ['View', 'عرض'], 'Durak dakikaları kaydedildi': ['Stop minutes saved', 'تم حفظ دقائق المحطات'], 'Ehliyet': ['Licence', 'الرخصة'], 'QR kartlar': ['QR cards', 'بطاقات QR'],
    'Bitiş': ['End', 'النهاية'], 'Araç / şoför': ['Vehicle / driver', 'المركبة / السائق']
  };
  ['en', 'ar'].forEach((l, i) => { for (const k in TX2) if (!(k in window.I18N[l])) window.I18N[l][k] = TX2[k][i]; });

  // ================= veri göçü =================
  P.migrate = function (st) {
    ['vehicles', 'maint', 'fuel', 'trips', 'users', 'audit', 'trash'].forEach(k => { if (!Array.isArray(st[k])) st[k] = []; });
    if (!st.attendance || typeof st.attendance !== 'object') st.attendance = {};
    st.settings.fx = Object.assign({ USD: 1, SYP: 13000, TRY: 41 }, st.settings.fx || {});
    st.settings.currency = st.settings.currency || 'USD';
    st.settings.theme = st.settings.theme || 'light';
    (st.lines || []).forEach(L => { L.stopMins = L.stopMins || {}; });
    return st;
  };

  // ================= kullanıcı & yetki =================
  P.user = null;
  const role = () => (P.user && P.user.role) || 'admin';
  P.isAdmin = () => role() === 'admin';
  P.canWrite = () => role() !== 'viewer';
  P.needAdmin = () => { if (P.isAdmin()) return true; toast(t('Bu işlem için yönetici yetkisi gerekir'), true); return false; };
  async function hashPw(pw, salt) {
    const data = new TextEncoder().encode('ms|' + salt + '|' + pw);
    try { const b = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    catch (e) { let x = 5381; for (const c of data) x = ((x << 5) + x + c) >>> 0; return 'f' + x.toString(16); }
  }
  const activeUsers = () => (S.users || []).filter(u => u.active !== false);
  P.login = async function (start) {
    // eski tek şifreyi "admin" kullanıcısına taşı
    if (S.settings.pin && !(S.users || []).length) {
      const salt = uid('s'); S.users.push({ id: uid('us'), name: S.settings.adminName || 'İdareci', username: 'admin', role: 'admin', salt, hash: await hashPw(S.settings.pin, salt), active: true });
      S.settings.pin = ''; P.lastJson = JSON.stringify(S); save(true); setTimeout(() => toast(t('Eski idareci şifreniz "admin" kullanıcısına aktarıldı')), 1500);
    }
    const users = activeUsers();
    if (!users.length) { P.user = { id: '', name: S.settings.adminName || t('Yönetici'), role: 'admin', implicit: true }; P.hideSplash(); return start(); }
    const lock = $('#lock'); lock.classList.remove('hidden'); P.hideSplash();
    $('#lockTitle').textContent = t('Kullanıcı girişi'); $('#lockBtn').textContent = t('Giriş');
    const us = $('#lockUser'); us.classList.remove('hidden');
    let last = ''; try { last = localStorage.getItem('ms-last-user') || ''; } catch (e) { }
    us.innerHTML = users.map(u => `<option value="${h(u.id)}" ${u.id === last ? 'selected' : ''}>${h(u.name)} (${h(u.username)})</option>`).join('');
    const pin = $('#lockPin'); pin.value = ''; pin.placeholder = t('Şifre');
    const tryIt = async () => {
      const u = users.find(x => x.id === us.value); if (!u) return;
      if (await hashPw(pin.value, u.salt) === u.hash) { P.user = u; try { localStorage.setItem('ms-last-user', u.id); } catch (e) { } lock.classList.add('hidden'); start(); }
      else { $('#lockErr').textContent = t('Hatalı şifre'); pin.select(); }
    };
    $('#lockBtn').onclick = tryIt; pin.onkeydown = e => { if (e.key === 'Enter') tryIt(); }; pin.focus();
  };
  P.logout = () => { try { save(true); } catch (e) { } setTimeout(() => location.reload(), 300); };

  // ================= kaydetme kancası: yetki + işlem geçmişi =================
  P.lastJson = '';
  P.beforeSave = function () {
    if (P.canWrite()) { audit(); return true; }
    // görüntüleme: yalnızca dil/tema değişikliği kalır
    let prev; try { prev = JSON.parse(P.lastJson); } catch (e) { return false; }
    const lang = S.settings.lang, theme = S.settings.theme;
    const changed = JSON.stringify(Object.assign({}, prev, { savedAt: 0, settings: Object.assign({}, prev.settings, { lang, theme }) })) !== JSON.stringify(Object.assign({}, S, { savedAt: 0 }));
    prev.settings.lang = lang; prev.settings.theme = theme; prev.savedAt = S.savedAt; S = prev; // eslint-disable-line
    if (changed) { toast(t('Görüntüleme yetkiniz var; değişiklik kaydedilmedi'), true); setTimeout(() => { try { render(); } catch (e) { } }, 0); }
    return true;
  };
  const AUD = { persons: 'Kişi', places: 'Yer', lines: 'Hat', drivers: 'Şoför', vehicles: 'Araç', maint: 'Bakım kaydı', fuel: 'Yakıt kaydı', trips: 'Sefer', groups: 'Grup', letterheads: 'Antet', users: 'Kullanıcı', mainLines: 'Ana hat' };
  const recName = (k, x) => k === 'vehicles' ? x.plate : k === 'trips' ? fmt(x.date) + ' · ' + lineName(x.lineId) : (k === 'maint' || k === 'fuel') ? fmt(x.date) + ' · ' + vehName(x.vehicleId) : k === 'users' ? x.username : (x.name || x.id);
  let snap = null;
  function takeSnap() {
    const s = {};
    for (const k in AUD) s[k] = new Map((S[k] || []).map(x => [x.id, JSON.stringify(x)]));
    const st = Object.assign({}, S.settings); delete st.lang; delete st.theme; s.settings = JSON.stringify(st);
    s.plans = JSON.stringify(S.plans || {}); s.attendance = JSON.stringify(S.attendance || {}); s.driver = JSON.stringify(S.driver || {});
    return s;
  }
  P.resetSnap = () => { snap = takeSnap(); };
  function audit() {
    if (!snap) { snap = takeSnap(); return; }
    const now = takeSnap(); const ev = [];
    for (const k in AUD) {
      const a = snap[k], b = now[k], byId = new Map((S[k] || []).map(x => [x.id, x]));
      b.forEach((j, id) => { if (!a.has(id)) ev.push(['add', k, recName(k, byId.get(id))]); else if (a.get(id) !== j) ev.push(['upd', k, recName(k, byId.get(id))]); });
      a.forEach((j, id) => { if (!b.has(id)) { let x = {}; try { x = JSON.parse(j); } catch (e) { } ev.push(['del', k, recName(k, x)]); } });
    }
    if (now.settings !== snap.settings) ev.push(['upd', 'settings', '']);
    if (now.plans !== snap.plans) ev.push(['upd', 'plans', '']);
    if (now.attendance !== snap.attendance) ev.push(['upd', 'attendance', '']);
    if (now.driver !== snap.driver) ev.push(['upd', 'driver', '']);
    snap = now;
    if (!ev.length) return;
    const at = Date.now(), u = P.user ? (P.user.username || P.user.name) : '';
    const last = S.audit[S.audit.length - 1];
    let list = ev;
    if (ev.length > 25) { const cnt = {}; ev.forEach(([a, k]) => { const key = a + '|' + k; cnt[key] = (cnt[key] || 0) + 1; }); list = Object.entries(cnt).map(([key, n]) => { const [a, k] = key.split('|'); return [a, k, n + ' ' + t('toplu')]; }); }
    list.forEach(([a, k, n]) => {
      // aynı kaydın art arda değişimlerini birleştir (yazarken her tuşta kayıt olmasın)
      if (last && a === 'upd' && last.a === 'upd' && last.k === k && last.n === n && last.u === u && at - last.at < 60000) { last.at = at; return; }
      S.audit.push({ at, u, a, k, n });
    });
    if (S.audit.length > 3000) S.audit.splice(0, S.audit.length - 3000);
  }
  const kindLbl = k => t(AUD[k] || { settings: 'Ayarlar', plans: 'Sefer planı', attendance: 'Yoklama', driver: 'Şoför' }[k] || k);

  // ================= çöp kutusu =================
  P.trash = function (kind, item, extra) {
    S.trash = S.trash || [];
    S.trash.push({ id: uid('tr'), kind, item: clone(item), extra: extra || null, at: Date.now(), by: P.user ? (P.user.username || P.user.name) : '' });
    if (S.trash.length > 500) S.trash.splice(0, S.trash.length - 500);
  };
  function restoreTrash(id) {
    const e = S.trash.find(x => x.id === id); if (!e) return;
    const col = S[e.kind]; if (!Array.isArray(col)) return;
    if (col.some(x => x.id === e.item.id)) return toast(t('Aynı kayıt zaten mevcut'), true);
    col.push(e.item);
    const x = e.extra || {};
    if (e.kind === 'places' && x.stops) x.stops.forEach(({ lineId, idx }) => { const L = lineById(lineId); if (L && !L.stops.includes(e.item.id)) L.stops.splice(Math.min(idx, L.stops.length), 0, e.item.id); });
    if (e.kind === 'lines' && x.persons) x.persons.forEach(pid => { const p = S.persons.find(q => q.id === pid); if (p && !p.lineId) p.lineId = e.item.id; });
    S.trash = S.trash.filter(q => q.id !== id);
    save(); render(); toast(t('Geri alındı'));
  }

  // ================= otomatik yedek (IndexedDB) =================
  const BK = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no idb'));
        const r = indexedDB.open('merkezi-servis-yedek', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('data', { keyPath: 'key' }); r.result.createObjectStore('meta', { keyPath: 'key' }); };
        r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error);
      });
    },
    async tx(stores, mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction(stores, mode); const out = fn(tx); tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out); tx.onerror = () => rej(tx.error); }); },
    async list() { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction('meta').objectStore('meta').getAll(); r.onsuccess = () => res((r.result || []).sort((a, b) => b.at - a.at)); r.onerror = () => rej(r.error); }); },
    async get(key) { const db = await this.open(); return new Promise((res, rej) => { const r = db.transaction('data').objectStore('data').get(key); r.onsuccess = () => res(r.result && r.result.json); r.onerror = () => rej(r.error); }); },
    async put(key, kind, json, note) { const meta = { key, kind, at: Date.now(), size: json.length, note: note || '', persons: (S.persons || []).length }; await this.tx(['data', 'meta'], 'readwrite', tx => { tx.objectStore('data').put({ key, json }); tx.objectStore('meta').put(meta); }); return meta; },
    async del(key) { await this.tx(['data', 'meta'], 'readwrite', tx => { tx.objectStore('data').delete(key); tx.objectStore('meta').delete(key); }); },
    async prune() { const l = await this.list(); const auto = l.filter(x => x.kind === 'auto'), man = l.filter(x => x.kind !== 'auto'); for (const x of auto.slice(30)) await this.del(x.key); for (const x of man.slice(20)) await this.del(x.key); }
  };
  P.backupNow = async (kind, note) => { const key = kind === 'auto' ? 'auto-' + todayISO() : 'man-' + Date.now(); await BK.put(key, kind || 'manual', JSON.stringify(S), note); await BK.prune(); return key; };
  async function dailyBackup() { try { const l = await BK.list(); if (!l.some(x => x.key === 'auto-' + todayISO())) await P.backupNow('auto'); } catch (e) { console.warn('yedek', e); } }

  // ================= seferler =================
  function changeTrips(date) {
    const PL = planFor(date);
    return PL.lines.filter(pl => pl.rows.length).map(pl => {
      const id = 'c:' + date + ':' + pl.line.id; const rec = S.trips.find(x => x.id === id);
      return Object.assign({ id, kind: 'change', date, lineId: pl.line.id, slot: 'morning', time: pl.line.departure || '', vehicleId: pl.line.vehicleId || '', vehicle2Id: '', driverId: '', driver2Id: '', status: 'planned', note: '' }, rec || {}, { _pl: pl });
    });
  }
  function extraTrips(date) { return S.trips.filter(x => x.kind === 'extra' && x.date === date); }
  function tripsOn(date) { return changeTrips(date).concat(extraTrips(date)).sort((a, b) => (SLOTS.findIndex(s => s[0] === a.slot) - SLOTS.findIndex(s => s[0] === b.slot)) || String(a.time).localeCompare(String(b.time)) || sortTR(lineName(a.lineId), lineName(b.lineId))); }
  function changeDatesIn(a, b) { const set = new Set(); S.groups.forEach(g => changeDatesBetween(g, S.settings.cycleDays, a, b).forEach(d => set.add(d))); return Array.from(set).sort(); }
  function tripsIn(a, b) {
    let out = [];
    changeDatesIn(a, b).forEach(d => { out = out.concat(changeTrips(d)); });
    S.trips.filter(x => x.kind === 'extra' && x.date >= a && x.date <= b).forEach(x => out.push(x));
    // kişi listesi değişse de atanmış kayıtlar kaybolmasın
    S.trips.filter(x => x.kind === 'change' && x.date >= a && x.date <= b && !out.some(o => o.id === x.id)).forEach(x => out.push(x));
    return out;
  }
  P.tripsIn = tripsIn;
  function tripPassengers(tr) {
    if (tr.kind === 'change') { const pl = tr._pl || (changeTrips(tr.date).find(x => x.id === tr.id) || {})._pl; return pl ? pl.rows.map(r => ({ p: r.p, stopId: r.stopId, dir: r.dir, bus: r.bus })) : []; }
    return (tr.passengers || []).map(pid => S.persons.find(p => p.id === pid)).filter(Boolean).map(p => ({ p, stopId: p.homeId, dir: tr.dir || 'toWork', bus: 1 }));
  }
  function tripBuses(tr) { if (tr.kind !== 'change') return 1; const pl = tr._pl; return pl && pl.cfg.buses === 2 ? 2 : 1; }
  function busLoad(rows, bus) { const rs = rows.filter(r => (r.bus || 1) === bus); return Math.max(rs.filter(r => r.dir === 'toHome').length, rs.filter(r => r.dir === 'toWork').length); }
  function tripCheck(tr) {
    const rows = tripPassengers(tr), nb = tripBuses(tr); const res = { rows, nb, loads: [], caps: [], over: false, noVeh: false, noDrv: !tr.driverId };
    for (let b = 1; b <= nb; b++) { const vid = b === 1 ? tr.vehicleId : tr.vehicle2Id; const v = vehById(vid); const load = nb === 1 ? busLoad(rows.map(r => Object.assign({}, r, { bus: 1 })), 1) : busLoad(rows, b); res.loads.push(load); res.caps.push(v ? num(v.capacity) : 0); if (!v) res.noVeh = true; else if (num(v.capacity) && load > num(v.capacity)) res.over = true; }
    if (nb === 2 && !tr.driver2Id) res.noDrv2 = true;
    res.load = res.loads.reduce((a, b) => a + b, 0); res.cap = res.caps.reduce((a, b) => a + b, 0);
    return res;
  }
  function saveTrip(tr) {
    const rec = Object.assign({}, tr); delete rec._pl;
    const i = S.trips.findIndex(x => x.id === rec.id); if (i >= 0) S.trips[i] = rec; else S.trips.push(rec);
    return rec;
  }
  function busyOther(tr, field, val) { if (!val) return false; return tripsOn(tr.date).some(o => o.id !== tr.id && o.status !== 'cancelled' && (o.slot || 'morning') === (tr.slot || 'morning') && (field === 'veh' ? (o.vehicleId === val || o.vehicle2Id === val) : (o.driverId === val || o.driver2Id === val))); }
  function suggestVehicle(tr, need) {
    const used = new Set(); tripsOn(tr.date).forEach(o => { if (o.id !== tr.id && (o.slot || 'morning') === (tr.slot || 'morning')) { used.add(o.vehicleId); used.add(o.vehicle2Id); } });
    return (S.vehicles || []).filter(v => v.active !== false && !used.has(v.id) && num(v.capacity) >= need).sort((a, b) => num(a.capacity) - num(b.capacity))[0];
  }
  function splitTwo(tr) {
    const pl = tr._pl; if (!pl) return; const L = pl.line; const idx = s => { const i = L.stops.indexOf(s); return i < 0 ? 999 : i; };
    const total = pl.rows.length; let best = L.stops[Math.floor(L.stops.length / 2)] || '', bestD = 1e9;
    L.stops.forEach(s => { const far = pl.rows.filter(r => idx(r.stopId) >= idx(s)).length; const d = Math.abs(far - total / 2); if (far && d < bestD) { bestD = d; best = s; } });
    S.plans[tr.date] = S.plans[tr.date] || {}; S.plans[tr.date][L.id] = Object.assign(S.plans[tr.date][L.id] || {}, { buses: 2, firstStopBus1: best, stopBus: {} });
  }
  let tripDate = '';
  function renderTrips(m) {
    const d0 = todayISO(); const up = upcomingChangeDates(10);
    if (!tripDate) tripDate = up.includes(d0) ? d0 : (up[0] || d0);
    const list = tripsOn(tripDate);
    const checks = list.map(tr => [tr, tripCheck(tr)]);
    const attDone = list.filter(tr => Object.keys(S.attendance[tr.id] || {}).length).length;
    m.innerHTML = `<h1>${t('Seferler & Yoklama')}</h1>
    <div class="toolbar"><label class="f">${t('Tarih')}<input type="date" id="tdate" value="${tripDate}"></label>
      <select id="tquick"><option value="">${t('Yaklaşan değişimler…')}</option><option value="${d0}">${fmt(d0)} ${dayName(d0)} — ${t('bugün')}</option>${up.map(d => `<option value="${d}">${fmt(d)} ${dayName(d)} — ${changesOn(d).map(g => h(g.name)).join(', ')}</option>`).join('')}</select>
      <span style="flex:1"></span>
      <button class="btn" id="tCopy">${t('Önceki ek seferleri kopyala')}</button>
      <button class="btn" id="tXls">📗 ${t("Excel'e ver")}</button>
      <button class="btn" id="tPrint">🖨️ ${t('Şoför listelerini yazdır')}</button>
      <button class="btn primary" id="tAdd">${t('+ Ek sefer')}</button></div>
    <div class="grid c4">
      <div class="card stat"><div class="v">${list.length}</div><div class="l">${t('Sefer sayısı')}</div></div>
      ${modOn('vehicles') ? `<div class="card stat"><div class="v ${checks.some(([, c]) => c.noVeh) ? 'txt-warn' : ''}">${checks.filter(([, c]) => c.noVeh).length}</div><div class="l">${t('Araçsız')}</div></div>
      <div class="card stat"><div class="v ${checks.some(([, c]) => c.over) ? 'txt-bad' : ''}">${checks.filter(([, c]) => c.over).length}</div><div class="l">${t('Kapasite uyarısı')}</div></div>` : ''}
      <div class="card stat"><div class="v">${attDone} / ${list.length}</div><div class="l">${t('Yoklama alınan')}</div></div>
    </div>
    ${list.length ? checks.map(([tr, c]) => tripCard(tr, c)).join('') : `<div class="card muted">${t('Bu tarihte sefer yok')}</div>`}`;
    $('#tdate', m).onchange = e => { tripDate = e.target.value || d0; render(); };
    $('#tquick', m).onchange = e => { if (e.target.value) { tripDate = e.target.value; render(); } };
    $('#tAdd', m).onclick = () => editExtraTrip(null);
    $('#tPrint', m).onclick = () => printReport('driverStops', { date: tripDate, lhId: S.settings.defaultLetterheadId });
    $('#tXls', m).onclick = () => P.reportXls('trips', { date: tripDate });
    $('#tCopy', m).onclick = () => {
      const prev = S.trips.filter(x => x.kind === 'extra' && x.date < tripDate).map(x => x.date).sort().pop();
      if (!prev) return toast(t('Kopyalanacak ek sefer bulunamadı'), true);
      const src = extraTrips(prev); src.forEach(x => S.trips.push(Object.assign(clone(x), { id: uid('tp'), date: tripDate, status: 'planned' })));
      save(); render(); toast(t('{0} ek sefer kopyalandı', src.length));
    };
    $$('[data-tr]', m).forEach(card => {
      const tr = list.find(x => x.id === card.dataset.tr); if (!tr) return;
      $$('[data-f]', card).forEach(el => el.onchange = () => {
        const f = el.dataset.f; const v = el.value;
        if ((f === 'vehicleId' || f === 'vehicle2Id') && busyOther(tr, 'veh', v)) toast(t('Bu araç aynı vakitte başka sefere atanmış'), true);
        if ((f === 'driverId' || f === 'driver2Id') && busyOther(tr, 'drv', v)) toast(t('Bu şoför aynı vakitte başka sefere atanmış'), true);
        tr[f] = v;
        if (f === 'vehicleId' && v && !tr.driverId) { const vv = vehById(v); if (vv && vv.driverId) tr.driverId = vv.driverId; }
        saveTrip(tr); save(); render();
      });
      const q = s => $(s, card);
      if (q('[data-att]')) q('[data-att]').onclick = () => attendanceModal(tr);
      if (q('[data-ed]')) q('[data-ed]').onclick = () => editExtraTrip(tr.id);
      if (q('[data-del]')) q('[data-del]').onclick = () => confirmDlg(t('Sefer silinsin mi?'), () => { P.trash('trips', tr); S.trips = S.trips.filter(x => x.id !== tr.id); delete S.attendance[tr.id]; save(); render(); toast(t('Sefer silindi')); });
      if (q('[data-split]')) q('[data-split]').onclick = () => { splitTwo(tr); save(); render(); toast(t('Sefer 2 otobüse bölündü')); };
      if (q('[data-sug]')) q('[data-sug]').onclick = () => { const c = tripCheck(tr); const v = suggestVehicle(tr, c.loads[0] || c.rows.length); if (!v) return toast(t('Uygun boş araç yok'), true); tr.vehicleId = v.id; if (!tr.driverId && v.driverId) tr.driverId = v.driverId; saveTrip(tr); save(); render(); toast(t('{0} aracı atandı', v.plate)); };
      if (q('[data-pr]')) q('[data-pr]').onclick = () => printReport('driverStops', { date: tr.date, tripId: tr.id, lhId: S.settings.defaultLetterheadId });
    });
  }
  function vehOpts(val) {
    const vs = (S.vehicles || []).filter(v => v.active !== false || v.id === val);
    return `<option value="">${t('— araç seçin —')}</option>` + vs.map(v => `<option value="${h(v.id)}" ${v.id === val ? 'selected' : ''}>${h(iso(v.plate))}${v.model ? ' · ' + h(v.model) : ''} (${num(v.capacity) || '?'})</option>`).join('');
  }
  function drvOpts(val, date) {
    const ds = S.drivers.slice().sort((a, b) => (driverActiveAt(b, date) ? 1 : 0) - (driverActiveAt(a, date) ? 1 : 0));
    return `<option value="">${t('— şoför seçin —')}</option>` + ds.map(d => `<option value="${h(d.id)}" ${d.id === val ? 'selected' : ''}>${h(d.name)} ${driverActiveAt(d, date) ? '· ' + t('Aktif') : '· ' + t('İstirahatte')}</option>`).join('');
  }
  function tripCard(tr, c) {
    const L = lineById(tr.lineId); const att = S.attendance[tr.id] || {}; const marked = Object.keys(att).length, absent = Object.values(att).filter(v => v === 0).length;
    const warn = []; const VM = modOn('vehicles'); if (!VM) { c.noVeh = false; c.over = false; }
    if (c.noVeh) warn.push(`<span class="badge warn">${t('Araç atanmadı')}</span>`);
    if (c.noDrv || c.noDrv2) warn.push(`<span class="badge warn">${t('Şoför atanmadı')}</span>`);
    if (c.over) warn.push(`<span class="badge bad">${t('Kapasite aşıldı')}: ${c.loads.join(' + ')} / ${c.caps.join(' + ')}</span>${tr.kind === 'change' && c.nb === 1 ? `<button class="btn sm" data-split>${t('2 otobüse böl')}</button>` : ''}<button class="btn sm" data-sug>${t('Uygun araç öner')}</button>`);
    else if (c.noVeh && c.rows.length) warn.push(`<button class="btn sm" data-sug>${t('Uygun araç öner')}</button>`);
    const sel = (f, html) => `<select data-f="${f}">${html}</select>`;
    return `<div class="card trip ${tr.status === 'cancelled' ? 'cancel' : ''}" data-tr="${h(tr.id)}">
      <div class="row between"><h2><i class="dot" style="background:${L ? lineColor(L) : '#999'}"></i> ${h(lineName(tr.lineId))} <span class="badge ${tr.kind === 'change' ? 'info' : 'gray'}">${tr.kind === 'change' ? t('Değişim') : t('Ek sefer')}</span>
        <span class="small muted">· ${t('Yolcu')} ${c.rows.length}${tr.kind === 'change' ? ` (${t('eve')} ${c.rows.filter(r => r.dir === 'toHome').length} / ${t('işe')} ${c.rows.filter(r => r.dir === 'toWork').length})` : ' · ' + (tr.dir === 'toHome' ? t('Eve dönüş') : t('İşe gidiş'))}</span></h2>
        <div class="row">${warn.join(' ')}</div></div>
      <div class="trip-grid">
        <label class="f">${t('Vakit')}${sel('slot', SLOTS.map(([k, l]) => `<option value="${k}" ${tr.slot === k ? 'selected' : ''}>${t(l)}</option>`).join(''))}</label>
        <label class="f">${t('Kalkış')}<input type="time" data-f="time" value="${h(tr.time || '')}"></label>
        ${VM ? `<label class="f">${t('Araç')}${c.nb === 2 ? ' 1' : ''}${sel('vehicleId', vehOpts(tr.vehicleId))}</label>` : ''}
        <label class="f">${t('Şoför')}${c.nb === 2 ? ' 1' : ''}${sel('driverId', drvOpts(tr.driverId, tr.date))}</label>
        ${c.nb === 2 ? `${VM ? `<label class="f">${t('Araç 2')}${sel('vehicle2Id', vehOpts(tr.vehicle2Id))}</label>` : ''}<label class="f">${t('Şoför 2')}${sel('driver2Id', drvOpts(tr.driver2Id, tr.date))}</label>` : ''}
        <label class="f">${t('Durum')}${sel('status', [['planned', 'Planlandı'], ['done', 'Tamamlandı'], ['cancelled', 'İptal']].map(([k, l]) => `<option value="${k}" ${tr.status === k ? 'selected' : ''}>${t(l)}</option>`).join(''))}</label>
        <label class="f">${t('Not')}<input data-f="note" dir="auto" value="${h(tr.note || '')}"></label>
      </div>
      <div class="row" style="margin-top:8px">
        <span class="cap-bar" title="${t('Doluluk')}">${!VM ? '' : c.loads.map((l, i) => { const cap = c.caps[i]; const pct = cap ? Math.min(100, Math.round(l / cap * 100)) : 0; return `<span class="cb"><i style="width:${pct}%" class="${cap && l > cap ? 'over' : ''}"></i></span><span class="small muted">${l} / ${cap || '?'}</span>`; }).join(' ')}</span>
        <span style="flex:1"></span>
        <span class="small muted">${t('Yoklama')}: ${marked}/${c.rows.length}${absent ? ` · <b class="txt-bad">${absent} ${t('Gelmedi')}</b>` : ''}</span>
        <button class="btn sm primary" data-att>✔ ${t('Yoklama')}</button>
        <button class="btn sm" data-pr>🖨️</button>
        ${tr.kind === 'extra' ? `<button class="btn sm" data-ed>${t('Düzenle')}</button><button class="btn sm danger" data-del>✕</button>` : ''}
      </div></div>`;
  }
  function editExtraTrip(id) {
    const tr = id ? S.trips.find(x => x.id === id) : { id: uid('tp'), kind: 'extra', date: tripDate || todayISO(), lineId: (S.lines[0] || {}).id || '', slot: 'morning', time: '', dir: 'toWork', vehicleId: '', driverId: '', status: 'planned', passengers: [], note: '' };
    const chosen = new Set(tr.passengers || []);
    modal(`<h2>${id ? t('Ek sefer düzenle') : t('+ Ek sefer')}</h2>
      <div class="grid c3">
        <label class="f">${t('Tarih')}<input type="date" id="x_date" value="${h(tr.date)}"></label>
        <label class="f">${t('Hat')}<select id="x_line">${opt(S.lines, tr.lineId, x => lname(x))}</select></label>
        <label class="f">${t('Yön')}<select id="x_dir"><option value="toWork" ${tr.dir !== 'toHome' ? 'selected' : ''}>${t('İşe gidiş')}</option><option value="toHome" ${tr.dir === 'toHome' ? 'selected' : ''}>${t('Eve dönüş')}</option></select></label>
        <label class="f">${t('Vakit')}<select id="x_slot">${SLOTS.map(([k, l]) => `<option value="${k}" ${tr.slot === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></label>
        <label class="f">${t('Kalkış')}<input type="time" id="x_time" value="${h(tr.time || '')}"></label>
        <label class="f">${t('Not')}<input id="x_note" dir="auto" value="${h(tr.note || '')}"></label>
      </div>
      <h3 style="margin-top:12px">${t('Yolcu seçin')} <span class="small muted" id="x_cnt"></span></h3>
      <div class="row"><input type="search" id="x_q" placeholder="${t('Kişi ara…')}" style="flex:1"><label class="chk"><input type="checkbox" id="x_lineOnly" checked> ${t('Hat')}</label></div>
      <div class="tbl-wrap" style="max-height:42vh;margin-top:6px"><table id="x_tbl"></table></div>
      <div class="actions">${cancelBtn()}<button class="btn primary" id="x_save">${t('Kaydet')}</button></div>`, (r, close) => {
      const draw = () => {
        const q = $('#x_q', r).value.toLowerCase(), lid = $('#x_line', r).value, only = $('#x_lineOnly', r).checked;
        const list = S.persons.filter(p => p.active !== false && (!only || p.lineId === lid || chosen.has(p.id)) && (!q || (p.name + ' ' + (p.nickname || '') + ' ' + (p.regNo || '') + ' ' + placeName(p.homeId)).toLowerCase().includes(q))).sort((a, b) => sortTR(a.name, b.name)).slice(0, 300);
        $('#x_tbl', r).innerHTML = list.map(p => `<tr><td><input type="checkbox" data-pp="${p.id}" ${chosen.has(p.id) ? 'checked' : ''}></td><td dir="auto">${h(p.name)}</td><td>${h(p.regNo)}</td><td>${h(gName(p.group))}</td><td dir="auto" class="muted">${h(placeName(p.homeId))}</td></tr>`).join('') || `<tr><td class="muted">${t('Sonuç yok')}</td></tr>`;
        $$('[data-pp]', r).forEach(c => c.onchange = () => { if (c.checked) chosen.add(c.dataset.pp); else chosen.delete(c.dataset.pp); $('#x_cnt', r).textContent = chosen.size + ' ' + t('seçili'); });
        $('#x_cnt', r).textContent = chosen.size + ' ' + t('seçili');
      };
      draw(); $('#x_q', r).oninput = draw; $('#x_line', r).onchange = draw; $('#x_lineOnly', r).onchange = draw;
      $('#x_save', r).onclick = () => {
        Object.assign(tr, { date: $('#x_date', r).value || todayISO(), lineId: $('#x_line', r).value, dir: $('#x_dir', r).value, slot: $('#x_slot', r).value, time: $('#x_time', r).value, note: $('#x_note', r).value.trim(), passengers: Array.from(chosen) });
        const L = lineById(tr.lineId); if (!id && L && L.vehicleId && !tr.vehicleId) tr.vehicleId = L.vehicleId;
        if (!id) S.trips.push(tr); tripDate = tr.date; save(); close(); render(); toast(t('Kaydedildi'));
      };
    });
  }
  // ---- yoklama ----
  function findByCode(code) {
    code = String(code || '').trim(); if (!code) return null;
    const c = code.replace(/^MS:/i, '');
    return S.persons.find(p => p.regNo && String(p.regNo) === c) || S.persons.find(p => p.id === c) || null;
  }
  function attendanceModal(tr) {
    const rows = tripPassengers(tr); const L = lineById(tr.lineId);
    const byStop = {}; rows.forEach(r => { (byStop[r.stopId] = byStop[r.stopId] || []).push(r); });
    const order = (L ? L.stops : []).filter(s => byStop[s]).concat(Object.keys(byStop).filter(s => !L || !L.stops.includes(s)));
    modal(`<h2>✔ ${t('Yoklama')} — ${h(lineName(tr.lineId))} <span class="small muted">${fmt(tr.date)} · ${slotLbl(tr.slot)}${tr.time ? ' ' + h(tr.time) : ''}</span></h2>
      <div class="scan"><label class="f">${t('QR / sicil okut')}<input id="a_scan" autocomplete="off" placeholder="MS:…"></label><span class="small muted">${t("Okuyucu ile okutun veya sicil no yazıp Enter'a basın")}</span></div>
      <div class="row" style="margin:8px 0"><span id="a_cnt" class="att-cnt"></span><span style="flex:1"></span><button class="btn sm" id="a_all">✔ ${t('Hepsi bindi')}</button><button class="btn sm" id="a_clr">${t('Hepsini temizle')}</button></div>
      <div class="att-list">${rows.length ? order.map(sid => `<div class="att-stop"><div class="hd" dir="auto">${h(placeName(sid))}</div>${byStop[sid].map(r => `<div class="att-row" data-pid="${r.p.id}"><span class="nm" dir="auto">${r.dir === 'toHome' ? '🏠' : '🏭'} ${h(r.p.name)} <span class="small muted">${h(r.p.regNo || '')} · ${h(gName(r.p.group))}</span></span><button class="att-b in" data-v="1">✔ ${t('Bindi')}</button><button class="att-b out" data-v="0">✕ ${t('Gelmedi')}</button></div>`).join('')}</div>`).join('') : `<p class="muted">${t('Yolcu yok')}</p>`}</div>
      <div class="actions"><button class="btn primary" data-close>${t('Kapat')}</button></div>`, (r) => {
      const att = () => (S.attendance[tr.id] = S.attendance[tr.id] || {});
      const paint = () => {
        const a = S.attendance[tr.id] || {};
        $$('.att-row', r).forEach(row => { const v = a[row.dataset.pid]; row.classList.toggle('in', v === 1); row.classList.toggle('out', v === 0); });
        const yes = rows.filter(x => a[x.p.id] === 1).length, no = rows.filter(x => a[x.p.id] === 0).length;
        $('#a_cnt', r).innerHTML = `<b class="txt-ok">✔ ${yes}</b> · <b class="txt-bad">✕ ${no}</b> · ${t('İşaretlenmedi')} ${rows.length - yes - no} / ${rows.length}`;
      };
      const setV = (pid, v) => { const a = att(); if (a[pid] === v) delete a[pid]; else a[pid] = v; if (tr.kind === 'change' && !S.trips.some(x => x.id === tr.id)) saveTrip(tr); save(); paint(); };
      $$('.att-b', r).forEach(b => b.onclick = () => setV(b.closest('.att-row').dataset.pid, +b.dataset.v));
      $('#a_all', r).onclick = () => { const a = att(); rows.forEach(x => { if (a[x.p.id] == null) a[x.p.id] = 1; }); save(); paint(); };
      $('#a_clr', r).onclick = () => { S.attendance[tr.id] = {}; save(); paint(); };
      const sc = $('#a_scan', r);
      sc.onkeydown = e => {
        if (e.key !== 'Enter') return; const p = findByCode(sc.value); sc.value = '';
        if (!p) return toast(t('Kişi bulunamadı'), true);
        if (!rows.some(x => x.p.id === p.id)) return toast(p.name + ': ' + t('Bu kişi bu seferin listesinde yok'), true);
        att()[p.id] = 1; save(); paint(); toast(p.name + ' — ' + t('bindi olarak işaretlendi'));
        const row = $(`.att-row[data-pid="${p.id}"]`, r); if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 900); }
      };
      paint(); setTimeout(() => sc.focus(), 50);
    });
  }
  P.attendanceModal = attendanceModal;

  // ================= araçlar =================
  let vtab = 'list', vfilter = '';
  function docAlerts(within) {
    within = within == null ? 30 : within; const out = [];
    const chk = (kind, id, name, doc, date) => { if (!date) return; const d = daysTo(date); if (d <= within) out.push({ kind, id, name, doc, date, days: d }); };
    (S.vehicles || []).filter(v => v.active !== false).forEach(v => {
      chk('veh', v.id, v.plate, 'Sigorta bitişi', v.insuranceEnd); chk('veh', v.id, v.plate, 'Muayene bitişi', v.inspectionEnd); chk('veh', v.id, v.plate, 'Ruhsat bitişi', v.licenseEnd); chk('veh', v.id, v.plate, 'Sonraki bakım tarihi', v.nextServiceDate);
      if (num(v.nextServiceKm) && num(v.km)) { const left = num(v.nextServiceKm) - num(v.km); if (left <= 500) out.push({ kind: 'veh', id: v.id, name: v.plate, doc: 'Bakım zamanı', km: left, days: left < 0 ? -1 : 9999 }); }
    });
    S.drivers.filter(d => !d.endDate || d.endDate >= todayISO()).forEach(d => chk('drv', d.id, d.name, 'Ehliyet bitişi', d.licenseEnd));
    return out.sort((a, b) => a.days - b.days);
  }
  P.docAlerts = docAlerts;
  const alertBadge = a => a.km != null ? `<span class="badge ${a.km < 0 ? 'bad' : 'warn'}">${Math.abs(a.km)} ${a.km < 0 ? t('km geçti') : t('km kaldı')}</span>` : a.days < 0 ? `<span class="badge bad">${t('süresi geçti')} (${fmt(a.date)})</span>` : `<span class="badge warn">${t('{0} gün kaldı', a.days)} (${fmt(a.date)})</span>`;
  const docCell = date => { if (!date) return '<span class="muted">—</span>'; const d = daysTo(date); return d < 0 ? `<span class="badge bad">${fmt(date)}</span>` : d <= 30 ? `<span class="badge warn">${fmt(date)}</span>` : `<span class="small">${fmt(date)}</span>`; };
  function vehKm(v) { let km = num(v.km); (S.fuel || []).concat(S.maint || []).forEach(x => { if (x.vehicleId === v.id && num(x.km) > km) km = num(x.km); }); return km; }
  function renderVehicles(m) {
    const tabs = [['list', '🚐 ' + t('Araçlar')], ['maint', '🔧 ' + t('Bakım & arıza')], ['fuel', '⛽ ' + t('Yakıt')]];
    m.innerHTML = `<h1>${t('Araçlar')}</h1><div class="tabs">${tabs.map(([k, l]) => `<a data-vt="${k}" class="${vtab === k ? 'active' : ''}">${l}</a>`).join('')}</div><div id="vbody"></div>`;
    $$('[data-vt]', m).forEach(a => a.onclick = () => { vtab = a.dataset.vt; render(); });
    const b = $('#vbody', m);
    if (vtab === 'list') vehList(b); else if (vtab === 'maint') logList(b, 'maint'); else logList(b, 'fuel');
  }
  function vehList(b) {
    const al = docAlerts();
    b.innerHTML = `<div class="toolbar"><input type="search" id="vq" placeholder="${t('Ara…')}" value="${h(vfilter)}"><span style="flex:1"></span>
      <button class="btn" id="vTpl">${t('Şablon indir')}</button><button class="btn" id="vImp">${t("Excel'den al")}</button><button class="btn" id="vXls">${t("Excel'e ver")}</button><button class="btn primary" id="vAdd">${t('+ Araç ekle')}</button></div>
      ${al.length ? `<div class="card"><h3>⚠ ${t('Belge ve bakım uyarıları')}</h3>${al.map(a => `<div class="alert-row"><b dir="auto">${h(a.name)}</b> <span class="muted">${t(a.doc)}</span> ${alertBadge(a)}</div>`).join('')}</div>` : ''}
      <div class="card tight"><div class="tbl-wrap"><table id="vtbl"></table></div></div>`;
    const draw = () => {
      const q = vfilter.toLowerCase();
      const list = (S.vehicles || []).filter(v => !q || [v.plate, v.model, v.contractor, lineName(v.lineId), drvName(v.driverId)].join(' ').toLowerCase().includes(q));
      $('#vtbl', b).innerHTML = `<tr><th>${t('Plaka')}</th><th>${t('Model')}</th><th>${t('Kapasite')}</th><th>${t('Sahiplik')}</th><th>${t('Varsayılan hat')}</th><th>${t('Varsayılan şoför')}</th><th>${t('Sigorta bitişi')}</th><th>${t('Muayene bitişi')}</th><th>${t('Ruhsat bitişi')}</th><th>${t('Kilometre')}</th><th></th></tr>` +
        (list.map(v => `<tr class="${v.active === false ? 'dim' : ''}"><td><b dir="auto">${h(v.plate)}</b></td><td dir="auto">${h(v.model || '')} ${v.year ? '<span class="muted small">' + h(v.year) + '</span>' : ''}</td><td>${num(v.capacity) || '—'}</td><td>${v.ownership === 'contract' ? `<span class="badge warn">${t('Taşeron')}</span> <span dir="auto" class="small">${h(v.contractor || '')}</span><div class="small muted">${money(num(v.rate), v.currency)} · ${t({ trip: 'Sefer başı', day: 'Gün başı', month: 'Aylık sabit' }[v.rateType || 'trip'])}</div>` : `<span class="badge info">${t('Kurum aracı')}</span>`}</td><td>${h(lineName(v.lineId))}</td><td dir="auto">${h(drvName(v.driverId))}</td><td>${docCell(v.insuranceEnd)}</td><td>${docCell(v.inspectionEnd)}</td><td>${docCell(v.licenseEnd)}</td><td>${vehKm(v) || '—'}</td><td><button class="btn sm" data-ve="${v.id}">${t('Düzenle')}</button></td></tr>`).join('') || `<tr><td colspan="11" class="muted">${t('Kayıt yok')}</td></tr>`);
      $$('[data-ve]', b).forEach(x => x.onclick = () => editVehicle(x.dataset.ve));
    };
    draw(); $('#vq', b).oninput = e => { vfilter = e.target.value; draw(); };
    $('#vAdd', b).onclick = () => editVehicle(null);
    $('#vXls', b).onclick = () => P.reportXls('vehicles', {});
    $('#vTpl', b).onclick = () => saveBlob('arac-sablonu.xlsx', xlsxFromSheets([[t('Araçlar'), [VEH_COLS.map(c => t(c))]]]));
    $('#vImp', b).onclick = importVehicles;
  }
  const VEH_COLS = ['Plaka', 'Model', 'Yıl', 'Kapasite', 'Sahiplik', 'Taşeron', 'Ücret', 'Para birimi', 'Sigorta bitişi', 'Muayene bitişi', 'Ruhsat bitişi', 'Kilometre'];
  async function importVehicles() {
    const f = await pickFile('.xlsx,.xls'); if (!f) return;
    const wb = XLSX.read(f.data, { type: 'array', cellDates: true }); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const hdr = (rows[0] || []).map(x => String(x).trim().toLowerCase());
    const col = k => { const names = [k, t(k), (TX[k] || [])[0], (TX[k] || [])[1]].filter(Boolean).map(x => x.toLowerCase()); return hdr.findIndex(x => names.includes(x)); };
    const C = {}; VEH_COLS.forEach(k => C[k] = col(k));
    const val = (r, k) => C[k] >= 0 ? r[C[k]] : '';
    const dt = v => { if (!v) return ''; if (v instanceof Date) return toISO(v); const s = String(v).trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : ''; };
    let added = 0, updated = 0;
    rows.slice(1).forEach(r => {
      const plate = String(val(r, 'Plaka') || '').trim(); if (!plate) return;
      let v = S.vehicles.find(x => x.plate === plate); if (!v) { v = { id: uid('v'), plate, active: true, rateType: 'trip' }; S.vehicles.push(v); added++; } else updated++;
      const own = String(val(r, 'Sahiplik') || '').toLowerCase();
      Object.assign(v, { model: String(val(r, 'Model') || v.model || ''), year: String(val(r, 'Yıl') || v.year || ''), capacity: num(val(r, 'Kapasite')) || v.capacity || 0, contractor: String(val(r, 'Taşeron') || v.contractor || ''), rate: num(val(r, 'Ücret')) || v.rate || 0, currency: String(val(r, 'Para birimi') || v.currency || baseCur()).toUpperCase(), insuranceEnd: dt(val(r, 'Sigorta bitişi')) || v.insuranceEnd || '', inspectionEnd: dt(val(r, 'Muayene bitişi')) || v.inspectionEnd || '', licenseEnd: dt(val(r, 'Ruhsat bitişi')) || v.licenseEnd || '', km: num(val(r, 'Kilometre')) || v.km || 0 });
      if (own) v.ownership = /ta[sş]eron|kira|contract|hire|متعهد|مستأجر/.test(own) ? 'contract' : 'own'; else if (v.contractor) v.ownership = 'contract'; else v.ownership = v.ownership || 'own';
      if (!CURS[v.currency]) v.currency = baseCur();
    });
    save(); render(); toast(t('İçe aktarıldı: {0} yeni, {1} güncellendi', added, updated));
  }
  function editVehicle(id) {
    const v = id ? vehById(id) : { id: uid('v'), plate: '', model: '', year: '', capacity: '', ownership: 'own', contractor: '', contractorPhone: '', rateType: 'trip', rate: '', currency: baseCur(), lineId: '', driverId: '', insuranceEnd: '', inspectionEnd: '', licenseEnd: '', km: '', nextServiceKm: '', nextServiceDate: '', active: true, notes: '' };
    modal(`<h2>${id ? t('Aracı düzenle') : t('Yeni araç')}</h2>
      <div class="grid c3">
        <label class="f">${t('Plaka')} *<input id="v_plate" dir="auto" value="${h(v.plate)}"></label>
        <label class="f">${t('Model')}<input id="v_model" dir="auto" value="${h(v.model || '')}"></label>
        <label class="f">${t('Yıl')}<input id="v_year" value="${h(v.year || '')}"></label>
        <label class="f">${t('Kapasite')}<input id="v_cap" type="number" min="0" value="${h(v.capacity || '')}"></label>
        <label class="f">${t('Varsayılan hat')}<select id="v_line">${opt(S.lines, v.lineId, x => lname(x), x => x.id, '—')}</select></label>
        <label class="f">${t('Varsayılan şoför')}<select id="v_drv">${opt(S.drivers, v.driverId, x => x.name, x => x.id, '—')}</select></label>
        <label class="f">${t('Sahiplik')}<select id="v_own"><option value="own" ${v.ownership !== 'contract' ? 'selected' : ''}>${t('Kurum aracı')}</option><option value="contract" ${v.ownership === 'contract' ? 'selected' : ''}>${t('Kiralık (taşeron)')}</option></select></label>
        <label class="f c-only">${t('Taşeron')}<input id="v_con" dir="auto" value="${h(v.contractor || '')}"></label>
        <label class="f c-only">${t('Taşeron telefonu')}<input id="v_conph" value="${h(v.contractorPhone || '')}"></label>
        <label class="f c-only">${t('Ücret türü')}<select id="v_rt"><option value="trip" ${v.rateType === 'trip' ? 'selected' : ''}>${t('Sefer başı')}</option><option value="day" ${v.rateType === 'day' ? 'selected' : ''}>${t('Gün başı')}</option><option value="month" ${v.rateType === 'month' ? 'selected' : ''}>${t('Aylık sabit')}</option></select></label>
        <label class="f c-only">${t('Ücret')}<input id="v_rate" type="number" min="0" step="any" value="${h(v.rate || '')}"></label>
        <label class="f c-only">${t('Para birimi')}${curSel('v_cur', v.currency)}</label>
        <label class="f">${t('Sigorta bitişi')}<input type="date" id="v_ins" value="${h(v.insuranceEnd || '')}"></label>
        <label class="f">${t('Muayene bitişi')}<input type="date" id="v_insp" value="${h(v.inspectionEnd || '')}"></label>
        <label class="f">${t('Ruhsat bitişi')}<input type="date" id="v_lic" value="${h(v.licenseEnd || '')}"></label>
        <label class="f">${t('Kilometre')}<input id="v_km" type="number" min="0" value="${h(v.km || '')}"></label>
        <label class="f">${t('Sonraki bakım km')}<input id="v_nkm" type="number" min="0" value="${h(v.nextServiceKm || '')}"></label>
        <label class="f">${t('Sonraki bakım tarihi')}<input type="date" id="v_nd" value="${h(v.nextServiceDate || '')}"></label>
      </div>
      <label class="f" style="margin-top:8px">${t('Not')}<input id="v_notes" dir="auto" value="${h(v.notes || '')}"></label>
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="v_act" ${v.active !== false ? 'checked' : ''}> ${t('Kullanımda')}</label>
      <div class="actions">${id ? `<button class="btn danger" id="v_del">${t('Sil')}</button>` : ''}<span style="flex:1"></span>${cancelBtn()}<button class="btn primary" id="v_save">${t('Kaydet')}</button></div>`, (r, close) => {
      const tog = () => $$('.c-only', r).forEach(x => x.style.display = $('#v_own', r).value === 'contract' ? '' : 'none'); tog(); $('#v_own', r).onchange = tog;
      $('#v_save', r).onclick = () => {
        const plate = $('#v_plate', r).value.trim(); if (!plate) return toast(t('Plaka gerekli'), true);
        Object.assign(v, { plate, model: $('#v_model', r).value.trim(), year: $('#v_year', r).value.trim(), capacity: num($('#v_cap', r).value), lineId: $('#v_line', r).value, driverId: $('#v_drv', r).value, ownership: $('#v_own', r).value, contractor: $('#v_con', r).value.trim(), contractorPhone: $('#v_conph', r).value.trim(), rateType: $('#v_rt', r).value, rate: num($('#v_rate', r).value), currency: $('#v_cur', r).value, insuranceEnd: $('#v_ins', r).value, inspectionEnd: $('#v_insp', r).value, licenseEnd: $('#v_lic', r).value, km: num($('#v_km', r).value), nextServiceKm: num($('#v_nkm', r).value), nextServiceDate: $('#v_nd', r).value, notes: $('#v_notes', r).value.trim(), active: $('#v_act', r).checked });
        if (!id) S.vehicles.push(v);
        // varsayılan hat → hattın varsayılan aracı
        S.lines.forEach(L => { if (L.vehicleId === v.id && L.id !== v.lineId) delete L.vehicleId; }); const L = lineById(v.lineId); if (L) L.vehicleId = v.id;
        save(); close(); render(); toast(t('Kaydedildi'));
      };
      if (id) $('#v_del', r).onclick = () => confirmDlg(t('Araç silinsin mi?'), () => { P.trash('vehicles', v); S.vehicles = S.vehicles.filter(x => x.id !== id); S.lines.forEach(L => { if (L.vehicleId === id) delete L.vehicleId; }); save(); close(); render(); });
    });
  }
  function logList(b, kind) {
    const isF = kind === 'fuel';
    b.innerHTML = `<div class="toolbar"><select id="lv"><option value="">${t('Tüm araçlar')}</option>${(S.vehicles || []).map(v => `<option value="${h(v.id)}">${h(v.plate)}</option>`).join('')}</select>
      <label class="f">${t('Ay')}<input type="month" id="lm" value=""></label><span style="flex:1"></span>
      <button class="btn primary" id="lAddLog">${isF ? t('+ Yakıt kaydı') : t('+ Bakım / arıza kaydı')}</button></div>
      <div id="lsum"></div><div class="card tight"><div class="tbl-wrap"><table id="ltbl"></table></div></div>`;
    const draw = () => {
      const vid = $('#lv', b).value, ym = $('#lm', b).value;
      const list = (S[kind] || []).filter(x => (!vid || x.vehicleId === vid) && (!ym || monthOf(x.date) === ym)).sort((a, c) => String(c.date).localeCompare(String(a.date)) || num(c.km) - num(a.km));
      if (isF) {
        const kml = x => { const prev = (S.fuel || []).filter(y => y.vehicleId === x.vehicleId && num(y.km) < num(x.km) && num(y.km) > 0).sort((a, c) => num(c.km) - num(a.km))[0]; return prev && num(x.liters) ? ((num(x.km) - num(prev.km)) / num(x.liters)) : null; };
        const lit = list.reduce((a, x) => a + num(x.liters), 0), cost = list.reduce((a, x) => a + conv(x.cost, x.currency), 0); const ks = list.map(kml).filter(x => x != null && isFinite(x));
        $('#lsum', b).innerHTML = `<div class="grid c3"><div class="card stat"><div class="v">${lit.toFixed(1)}</div><div class="l">${t('Toplam litre')}</div></div><div class="card stat"><div class="v">${money(cost)}</div><div class="l">${t('Toplam tutar')}</div></div><div class="card stat"><div class="v">${ks.length ? (ks.reduce((a, c) => a + c, 0) / ks.length).toFixed(2) : '—'}</div><div class="l">${t('Ortalama km/l')}</div></div></div>`;
        $('#ltbl', b).innerHTML = `<tr><th>${t('Tarih')}</th><th>${t('Araç')}</th><th>${t('Kilometre')}</th><th>${t('Litre')}</th><th>${t('Tutar')}</th><th>${t('km/litre')}</th><th>${t('İstasyon')}</th><th></th></tr>` + (list.map(x => { const k = kml(x); return `<tr><td>${fmt(x.date)}</td><td dir="auto">${h(vehName(x.vehicleId))}</td><td>${num(x.km) || '—'}</td><td>${num(x.liters)}</td><td>${money(num(x.cost), x.currency)}</td><td>${k != null && isFinite(k) ? k.toFixed(2) : '—'}</td><td dir="auto">${h(x.station || '')}</td><td><button class="btn sm" data-le="${x.id}">${t('Düzenle')}</button></td></tr>`; }).join('') || `<tr><td colspan="8" class="muted">${t('Kayıt yok')}</td></tr>`);
      } else {
        const cost = list.reduce((a, x) => a + conv(x.cost, x.currency), 0);
        $('#lsum', b).innerHTML = `<div class="grid c3"><div class="card stat"><div class="v">${list.length}</div><div class="l">${t('Kayıt')}</div></div><div class="card stat"><div class="v">${money(cost)}</div><div class="l">${t('Toplam tutar')}</div></div><div></div></div>`;
        $('#ltbl', b).innerHTML = `<tr><th>${t('Tarih')}</th><th>${t('Araç')}</th><th>${t('Tür')}</th><th>${t('Kilometre')}</th><th>${t('Tutar')}</th><th>${t('Servis / yer')}</th><th>${t('Not')}</th><th></th></tr>` + (list.map(x => `<tr><td>${fmt(x.date)}</td><td dir="auto">${h(vehName(x.vehicleId))}</td><td>${h(t(x.type || 'Diğer'))}</td><td>${num(x.km) || '—'}</td><td>${money(num(x.cost), x.currency)}</td><td dir="auto">${h(x.place || '')}</td><td dir="auto">${h(x.note || '')}</td><td><button class="btn sm" data-le="${x.id}">${t('Düzenle')}</button></td></tr>`).join('') || `<tr><td colspan="8" class="muted">${t('Kayıt yok')}</td></tr>`);
      }
      $$('[data-le]', b).forEach(x => x.onclick = () => editLog(kind, x.dataset.le));
    };
    draw(); $('#lv', b).onchange = draw; $('#lm', b).onchange = draw;
    $('#lAddLog', b).onclick = () => { if (!(S.vehicles || []).length) return toast(t('Önce araç ekleyin'), true); editLog(kind, null, $('#lv', b).value); };
  }
  function editLog(kind, id, vid) {
    const isF = kind === 'fuel'; const col = S[kind];
    const x = id ? col.find(y => y.id === id) : { id: uid(isF ? 'f' : 'mt'), vehicleId: vid || (S.vehicles[0] || {}).id, date: todayISO(), km: '', cost: '', currency: baseCur(), liters: '', station: '', type: 'Periyodik bakım', place: '', note: '' };
    modal(`<h2>${isF ? t('Yakıt kaydı') : t('Bakım kaydı')}</h2><div class="grid c3">
      <label class="f">${t('Araç')}<select id="g_v">${(S.vehicles || []).map(v => `<option value="${h(v.id)}" ${v.id === x.vehicleId ? 'selected' : ''}>${h(v.plate)}</option>`).join('')}</select></label>
      <label class="f">${t('Tarih')}<input type="date" id="g_d" value="${h(x.date)}"></label>
      <label class="f">${t('Kilometre')}<input type="number" id="g_km" min="0" value="${h(x.km || '')}"></label>
      ${isF ? `<label class="f">${t('Litre')}<input type="number" step="any" id="g_l" value="${h(x.liters || '')}"></label><label class="f">${t('İstasyon')}<input id="g_st" dir="auto" value="${h(x.station || '')}"></label>` : `<label class="f">${t('Tür')}<select id="g_t">${MAINT_TYPES.map(k => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${t(k)}</option>`).join('')}</select></label><label class="f">${t('Servis / yer')}<input id="g_p" dir="auto" value="${h(x.place || '')}"></label>`}
      <label class="f">${t('Tutar')}<input type="number" step="any" id="g_c" value="${h(x.cost || '')}"></label>
      <label class="f">${t('Para birimi')}${curSel('g_cur', x.currency)}</label></div>
      <label class="f" style="margin-top:8px">${t('Not')}<input id="g_n" dir="auto" value="${h(x.note || '')}"></label>
      <div class="actions">${id ? `<button class="btn danger" id="g_del">${t('Sil')}</button>` : ''}<span style="flex:1"></span>${cancelBtn()}<button class="btn primary" id="g_ok">${t('Kaydet')}</button></div>`, (r, close) => {
      $('#g_ok', r).onclick = () => {
        Object.assign(x, { vehicleId: $('#g_v', r).value, date: $('#g_d', r).value || todayISO(), km: num($('#g_km', r).value), cost: num($('#g_c', r).value), currency: $('#g_cur', r).value, note: $('#g_n', r).value.trim() });
        if (isF) Object.assign(x, { liters: num($('#g_l', r).value), station: $('#g_st', r).value.trim() }); else Object.assign(x, { type: $('#g_t', r).value, place: $('#g_p', r).value.trim() });
        if (!id) col.push(x);
        const v = vehById(x.vehicleId); if (v && num(x.km) > num(v.km)) v.km = num(x.km);
        save(); close(); render(); toast(t('Kaydedildi'));
      };
      if (id) $('#g_del', r).onclick = () => confirmDlg(t('Kayıt silinsin mi?'), () => { P.trash(kind, x); S[kind] = S[kind].filter(y => y.id !== id); save(); close(); render(); });
    });
  }

  // ================= maliyet =================
  function costsFor(ym) {
    const [a, b] = monthRange(ym); const trips = tripsIn(a, b).filter(x => x.status !== 'cancelled');
    const veh = {}; const line = {}; const ensureL = id => (line[id] = line[id] || { trips: 0, pass: 0, pay: 0, fuel: 0, maint: 0 });
    const ensureV = id => (veh[id] = veh[id] || { trips: 0, days: new Set(), lines: {}, pay: 0, fuel: 0, maint: 0 });
    trips.forEach(tr => {
      const rows = tripPassengers(tr); const L = ensureL(tr.lineId); L.trips++; L.pass += rows.length;
      [tr.vehicleId, tr.vehicle2Id].filter(Boolean).forEach(vid => { const V = ensureV(vid); V.trips++; V.days.add(tr.date); V.lines[tr.lineId] = (V.lines[tr.lineId] || 0) + 1; });
    });
    (S.vehicles || []).forEach(v => {
      const V = ensureV(v.id);
      if (v.ownership === 'contract') { const r = conv(v.rate, v.currency); V.pay = v.rateType === 'day' ? r * V.days.size : v.rateType === 'month' ? (V.trips || v.active !== false ? r : 0) : r * V.trips; }
      V.fuel = (S.fuel || []).filter(x => x.vehicleId === v.id && monthOf(x.date) === ym).reduce((s, x) => s + conv(x.cost, x.currency), 0);
      V.maint = (S.maint || []).filter(x => x.vehicleId === v.id && monthOf(x.date) === ym).reduce((s, x) => s + conv(x.cost, x.currency), 0);
      const tot = Object.values(V.lines).reduce((s, n) => s + n, 0);
      if (tot) Object.entries(V.lines).forEach(([lid, n]) => { const L = ensureL(lid); const k = n / tot; L.pay += V.pay * k; L.fuel += V.fuel * k; L.maint += V.maint * k; });
      else if (V.pay || V.fuel || V.maint) { const L = ensureL('_none'); L.pay += V.pay; L.fuel += V.fuel; L.maint += V.maint; }
    });
    const total = Object.values(veh).reduce((s, V) => s + V.pay + V.fuel + V.maint, 0);
    const people = S.persons.filter(personInService).length;
    return { ym, trips, veh, line, total, pay: Object.values(veh).reduce((s, V) => s + V.pay, 0), fuel: Object.values(veh).reduce((s, V) => s + V.fuel, 0), maint: Object.values(veh).reduce((s, V) => s + V.maint, 0), people };
  }
  P.costsFor = costsFor;
  function barChart(data, w, hgt) {
    w = w || 520; hgt = hgt || 170; const max = Math.max(1, ...data.map(d => d[1])); const bw = (w - 20) / data.length;
    return `<svg viewBox="0 0 ${w} ${hgt + 34}" class="bchart" role="img">${data.map(([lb, v], i) => { const bh = Math.round(v / max * hgt); const x = 10 + i * bw + bw * .18; return `<rect x="${x}" y="${hgt - bh + 14}" width="${bw * .64}" height="${Math.max(bh, 1)}" rx="4" class="bar"></rect><text x="${x + bw * .32}" y="${hgt - bh + 9}" class="bv">${v ? money(v).replace(/[.,]00(?=\s)/, '') : ''}</text><text x="${x + bw * .32}" y="${hgt + 30}" class="bl">${h(lb)}</text>`; }).join('')}</svg>`;
  }
  P.barChart = barChart;
  function lastMonths(n) { const cur = monthOf(todayISO()); const out = []; for (let i = n - 1; i >= 0; i--) { const ym = addMonths(cur, -i); out.push([monthLbl(ym).split(' ')[0].slice(0, 3), costsFor(ym).total]); } return out; }
  let costYm = '';
  function renderCosts(m) {
    if (!costYm) costYm = monthOf(todayISO());
    const C = costsFor(costYm);
    const vrows = (S.vehicles || []).map(v => [v, C.veh[v.id]]).filter(([, V]) => V && (V.trips || V.pay || V.fuel || V.maint));
    const lrows = Object.entries(C.line).map(([lid, L]) => [lid, L]).sort((a, b) => sortTR(lineName(a[0]), lineName(b[0])));
    m.innerHTML = `<h1>${t('Maliyet')}</h1>
    <div class="toolbar"><label class="f">${t('Ay')}<input type="month" id="cym" value="${costYm}"></label><label class="f">${t('Gösterim para birimi')}${curSel('ccur', baseCur())}</label><span style="flex:1"></span>
      <button class="btn" id="cXls">📗 ${t("Excel'e ver")}</button><button class="btn" id="cPay">🖨️ ${t('Hakediş raporu')}</button></div>
    <p class="small muted">${t('Maliyetler, seferlere atanan araçlardan hesaplanır. Yakıt ve bakım giderleri aracın o aydaki sefer sayısına göre hatlara paylaştırılır.')}</p>
    <div class="grid c4">
      <div class="card stat"><div class="v">${money(C.total)}</div><div class="l">${t('Toplam maliyet')} · ${h(monthLbl(costYm))}</div></div>
      <div class="card stat"><div class="v">${money(C.pay)}</div><div class="l">${t('Hakediş')}</div></div>
      <div class="card stat"><div class="v">${money(C.fuel + C.maint)}</div><div class="l">${t('Yakıt')} + ${t('Bakım')}</div></div>
      <div class="card stat"><div class="v">${C.people ? money(C.total / C.people) : '—'}</div><div class="l">${t('Kişi başı')} (${C.people} ${t('kişi')})</div></div>
    </div>
    <div class="grid c2">
      <div class="card"><h2>${t('Araç bazında')}</h2><table><tr><th>${t('Araç')}</th><th>${t('Sefer / gün')}</th><th>${t('Hakediş')}</th><th>${t('Yakıt')}</th><th>${t('Bakım')}</th><th>${t('Toplam')}</th></tr>
        ${vrows.map(([v, V]) => `<tr><td dir="auto"><b>${h(v.plate)}</b> ${v.ownership === 'contract' ? `<span class="small muted">${h(v.contractor || t('Taşeron'))}</span>` : ''}</td><td>${V.trips} / ${V.days.size}</td><td>${money(V.pay)}</td><td>${money(V.fuel)}</td><td>${money(V.maint)}</td><td><b>${money(V.pay + V.fuel + V.maint)}</b></td></tr>`).join('') || `<tr><td colspan="6" class="muted">${t('Kayıt yok')}</td></tr>`}</table></div>
      <div class="card"><h2>${t('Son 6 ay')}</h2>${barChart(lastMonths(6))}</div>
    </div>
    <div class="card"><h2>${t('Hat bazında')}</h2><table><tr><th>${t('Hat')}</th><th>${t('Sefer sayısı')}</th><th>${t('Taşınan yolcu')}</th><th>${t('Hakediş')}</th><th>${t('Yakıt')}</th><th>${t('Bakım')}</th><th>${t('Toplam')}</th><th>${t('Kişi (serviste)')}</th><th>${t('Kişi başı')}</th></tr>
      ${lrows.map(([lid, L]) => { const tot = L.pay + L.fuel + L.maint; const ppl = lid === '_none' ? 0 : S.persons.filter(p => p.lineId === lid && personInService(p)).length; return `<tr><td>${lid === '_none' ? `<i>${t('Atanmamış')}</i>` : h(lineName(lid))}</td><td>${L.trips}</td><td>${L.pass}</td><td>${money(L.pay)}</td><td>${money(L.fuel)}</td><td>${money(L.maint)}</td><td><b>${money(tot)}</b></td><td>${ppl || '—'}</td><td>${ppl ? money(tot / ppl) : '—'}</td></tr>`; }).join('') || `<tr><td colspan="9" class="muted">${t('Kayıt yok')}</td></tr>`}</table></div>`;
    $('#cym', m).onchange = e => { costYm = e.target.value || monthOf(todayISO()); render(); };
    $('#ccur', m).onchange = e => { S.settings.currency = e.target.value; save(); render(); };
    $('#cXls', m).onclick = () => P.reportXls('costs', { date: costYm + '-01' });
    $('#cPay', m).onclick = () => printReport('payments', { date: costYm + '-01', lhId: S.settings.defaultLetterheadId });
  }

  // ================= kayıtlar (işlem geçmişi / çöp kutusu / yedekler) =================
  let rtab = 'audit', aq = '', aLimit = 300;
  function renderRecords(m) {
    const tabs = [['audit', '📜 ' + t('İşlem geçmişi')], ['trash', '🗑️ ' + t('Çöp kutusu') + (S.trash.length ? ` (${S.trash.length})` : '')], ['backup', '💾 ' + t('Yedekler')]];
    m.innerHTML = `<h1>${t('Kayıtlar')}</h1><div class="tabs">${tabs.map(([k, l]) => `<a data-rt="${k}" class="${rtab === k ? 'active' : ''}">${l}</a>`).join('')}</div><div id="rbody"></div>`;
    $$('[data-rt]', m).forEach(a => a.onclick = () => { rtab = a.dataset.rt; render(); });
    const b = $('#rbody', m);
    if (rtab === 'audit') {
      b.innerHTML = `<div class="toolbar"><input type="search" id="aq" placeholder="${t('Ara…')}" value="${h(aq)}"></div><div class="card tight"><div class="tbl-wrap"><table id="atbl"></table></div></div>`;
      const AL = { add: ['ok', 'eklendi'], upd: ['info', 'değiştirildi'], del: ['bad', 'silindi'] };
      const draw = () => {
        const q = aq.toLowerCase(); const list = S.audit.slice().reverse().filter(e => !q || [e.u, e.n, kindLbl(e.k), t(AL[e.a][1])].join(' ').toLowerCase().includes(q));
        $('#atbl', b).innerHTML = `<tr><th>${t('Zaman')}</th><th>${t('Kullanıcı')}</th><th>${t('İşlem')}</th><th>${t('Tür')}</th><th>${t('Kayıt')}</th></tr>` + (list.slice(0, aLimit).map(e => `<tr><td class="small">${new Date(e.at).toLocaleString(LANG === 'ar' ? 'ar-SY' : LANG)}</td><td>${h(e.u || '—')}</td><td><span class="badge ${AL[e.a][0]}">${t(AL[e.a][1])}</span></td><td>${h(kindLbl(e.k))}</td><td dir="auto">${h(e.n)}</td></tr>`).join('') || `<tr><td colspan="5" class="muted">${t('Kayıt yok')}</td></tr>`) + (list.length > aLimit ? `<tr><td colspan="5"><button class="btn sm" id="amore">${t('Tümünü göster')} (${list.length})</button></td></tr>` : '');
        const mo = $('#amore', b); if (mo) mo.onclick = () => { aLimit = 1e9; draw(); };
      };
      draw(); $('#aq', b).oninput = e => { aq = e.target.value; draw(); };
    } else if (rtab === 'trash') {
      b.innerHTML = `<div class="toolbar"><span style="flex:1"></span>${S.trash.length ? `<button class="btn danger" id="tEmpty">${t('Çöp kutusunu boşalt')}</button>` : ''}</div><div class="card tight"><table>${S.trash.length ? `<tr><th>${t('Silinme')}</th><th>${t('Tür')}</th><th>${t('Kayıt')}</th><th>${t('Silen')}</th><th></th></tr>` + S.trash.slice().reverse().map(e => `<tr><td class="small">${new Date(e.at).toLocaleString(LANG === 'ar' ? 'ar-SY' : LANG)}</td><td>${h(kindLbl(e.kind))}</td><td dir="auto"><b>${h(recName(e.kind, e.item))}</b></td><td>${h(e.by || '—')}</td><td><button class="btn sm primary" data-rs="${e.id}">↶ ${t('Geri al')}</button> <button class="btn sm danger" data-rd="${e.id}">${t('Kalıcı sil')}</button></td></tr>`).join('') : `<tr><td class="muted">${t('Çöp kutusu boş')}</td></tr>`}</table></div>`;
      $$('[data-rs]', b).forEach(x => x.onclick = () => restoreTrash(x.dataset.rs));
      $$('[data-rd]', b).forEach(x => x.onclick = () => { if (!P.needAdmin()) return; confirmDlg(t('Kalıcı olarak silinsin mi? Bu işlem geri alınamaz.'), () => { S.trash = S.trash.filter(e => e.id !== x.dataset.rd); save(); render(); }); });
      const te = $('#tEmpty', b); if (te) te.onclick = () => { if (!P.needAdmin()) return; confirmDlg(t('Kalıcı olarak silinsin mi? Bu işlem geri alınamaz.'), () => { S.trash = []; save(); render(); }); };
    } else {
      b.innerHTML = `<div class="card"><div class="row between"><div><h2>${t('Otomatik günlük yedek')}</h2><p class="small muted">${t('Program her gün bir yedek alır ve son 30 günü saklar. Elle alınan yedeklerin son 20 tanesi saklanır.')}</p></div><button class="btn primary" id="bkNow">💾 ${t('Şimdi yedekle')}</button></div><div id="bklist" class="muted">${t('Yükleniyor…')}</div></div>`;
      const fill = async () => {
        try {
          const l = await BK.list();
          $('#bklist', b).innerHTML = l.length ? `<table><tr><th>${t('Zaman')}</th><th>${t('Tür')}</th><th>${t('Kişi')}</th><th>${t('Boyut')}</th><th></th></tr>${l.map(x => `<tr><td>${new Date(x.at).toLocaleString(LANG === 'ar' ? 'ar-SY' : LANG)}</td><td>${x.kind === 'auto' ? t('otomatik') : t('elle')}${x.note ? ' · ' + h(t(x.note)) : ''}</td><td>${x.persons ?? ''}</td><td>${(x.size / 1024).toFixed(0)} KB</td><td><button class="btn sm" data-bd="${h(x.key)}">⬇ ${t('İndir')}</button> <button class="btn sm primary" data-br="${h(x.key)}">↶ ${t('Geri al')}</button></td></tr>`).join('')}</table>` : `<span class="muted">${t('Yedek bulunamadı')}</span>`;
          $$('[data-bd]', b).forEach(x => x.onclick = async () => { const j = await BK.get(x.dataset.bd); if (j) saveBlob('merkezi-servis-' + x.dataset.bd + '.json', new TextEncoder().encode(j)); });
          $$('[data-br]', b).forEach(x => x.onclick = () => { if (!P.needAdmin()) return; confirmDlg(t('Bu yedeğe dönülsün mü? Şu anki veriler önce ayrıca yedeklenir.'), async () => {
            const j = await BK.get(x.dataset.br); if (!j) return; await P.backupNow('manual', 'geri yükleme öncesi');
            const keepUsers = S.users; S = P.migrate(JSON.parse(j)); if (!(S.users || []).length && keepUsers && keepUsers.length) S.users = keepUsers; // eslint-disable-line
            P.resetSnap(); save(true); applyLang(S.settings.lang); renderNav(); render(); toast(t('Yedekten geri yüklendi'));
          }); });
        } catch (e) { $('#bklist', b).textContent = t('Yedekleme bu ortamda kullanılamıyor'); }
      };
      fill();
      $('#bkNow', b).onclick = async () => { try { await P.backupNow('manual'); toast(t('Yedek alındı')); fill(); } catch (e) { toast(t('Yedekleme bu ortamda kullanılamıyor'), true); } };
    }
  }

  P.pages = { trips: renderTrips, vehicles: renderVehicles, costs: renderCosts, records: renderRecords };

  // ================= modüller =================
  // Kapatılan modülün verisi silinmez; yalnızca menüden, panelden, raporlardan ve formlardan gizlenir.
  const MODULES = [
    { id: 'trips', icon: '🚍', name: 'Seferler & Yoklama', desc: 'Araç/şoför atama, kapasite kontrolü, yoklama, QR kartlar', pages: ['trips'] },
    { id: 'vehicles', icon: '🚐', name: 'Araçlar', desc: 'Araç kartları, belge uyarıları, bakım ve yakıt kayıtları', pages: ['vehicles'] },
    { id: 'costs', icon: '💰', name: 'Maliyet', desc: 'Maliyet, taşeron hakedişi, kur ayarları', pages: ['costs'], needs: ['vehicles'] },
    { id: 'mainlines', icon: '🧭', name: 'Ana Hatlar & Harita', desc: 'Ana hatlar sayfası ve Genel Durum haritası', pages: ['mainlines'] },
    { id: 'drivers', icon: '🚌', name: 'Şoförler', desc: 'Şoför listesi ve nöbet düzeni', pages: ['drivers'] },
    { id: 'records', icon: '📜', name: 'Kayıtlar', desc: 'İşlem geçmişi, çöp kutusu ve yedek listesi (otomatik yedek her zaman çalışır)', pages: ['records'] }
  ];
  const modOn = id => { const st = (hasS() && S.settings.modules) || {}; const M = MODULES.find(x => x.id === id); if (!M) return true; if (st[id] === false) return false; return (M.needs || []).every(modOn); };
  P.mod = modOn; P.modules = MODULES;
  const pageModule = pg => (MODULES.find(M => M.pages.includes(pg)) || {}).id;
  const REPORT_MOD = { driverStops: 'trips', trips: 'trips', attendance: 'trips', qrcards: 'trips', vehicles: 'vehicles', maint: 'vehicles', payments: 'costs', drivers: 'drivers' };
  P.reportAllowed = ty => !REPORT_MOD[ty] || modOn(REPORT_MOD[ty]);
  function modulesCard() {
    const st = S.settings.modules || {};
    return `<div class="card"><h2>🧩 ${t('Modüller')}</h2><p class="small muted">${t('Kullanmadığınız bölümleri kapatın; menüden, panelden ve raporlardan kalkar. Kayıtlı veriler silinmez, modülü açınca geri gelir.')}</p>
      <div class="mods">${MODULES.map(M => { const on = st[M.id] !== false; const blocked = on && !modOn(M.id); return `<label class="mod ${on && !blocked ? 'on' : ''}"><input type="checkbox" data-mod="${M.id}" ${on ? 'checked' : ''} ${P.isAdmin() ? '' : 'disabled'}><span class="mi">${M.icon}</span><span class="mt"><b>${t(M.name)}</b><small>${t(M.desc)}</small>${blocked ? `<small class="txt-warn">${t('Önce şu modülü açın')}: ${(M.needs || []).filter(n => !modOn(n)).map(n => t(MODULES.find(x => x.id === n).name)).join(', ')}</small>` : ''}</span><span class="sw"></span></label>`; }).join('')}</div></div>`;
  }

  // ================= menü, kullanıcı kutusu, rol arayüzü =================
  P.navAllowed = p => { const md = pageModule(p); if (md && !modOn(md)) return false; if (p === 'records') return role() !== 'viewer'; return true; };
  P.navBadge = p => { if (p === 'vehicles' && modOn('vehicles')) { const n = docAlerts().length; return n ? ` <span class="nbadge">${n}</span>` : ''; } return ''; };
  P.userBox = function () {
    const f = $('.side-foot'); if (!f) return; let el = $('#userBox'); if (!el) { el = document.createElement('div'); el.id = 'userBox'; el.className = 'userbox'; f.insertBefore(el, f.firstChild); }
    if (!P.user || P.user.implicit) { el.innerHTML = ''; return; }
    el.innerHTML = `<span>👤 <b>${h(P.user.name)}</b> <small>${h(roleLbl(P.user.role))}</small></span><a id="logoutBtn">${t('Çıkış')}</a>`;
    $('#logoutBtn', el).onclick = P.logout;
  };
  P.afterRender = function (m) {
    document.body.classList.toggle('ro', !P.canWrite());
    if (page === 'settings' && !P.isAdmin()) { ['#bkImp', '#bkReset', '#updReset'].forEach(s => { const x = $(s, m); if (x) x.style.display = 'none'; }); }
  };

  // ================= panel (Genel Durum) ekleri =================
  P.dash = function (m) {
    const h1 = $('h1', m); if (!h1) return;
    const d0 = todayISO(); const nx = upcomingChangeDates(5).find(d => d >= d0) || d0;
    const trs = tripsOn(nx); const ch = trs.map(tripCheck);
    const al = modOn('vehicles') ? docAlerts() : []; const C = modOn('costs') ? costsFor(monthOf(d0)) : null;
    const cards = [];
    if (modOn('trips')) cards.push(`
      <div class="card"><div class="row between"><h2>🚍 ${t('Seferler')}</h2><button class="btn sm" data-pgo="trips">${t('Seferleri aç')}</button></div>
        <div class="small muted">${t('Sonraki değişim günü')}: <b>${fmt(nx)} ${dayName(nx)}</b> (${diffDays(d0, nx)} ${t('gün')})</div>
        <div class="kv" style="margin-top:8px"><b>${t('Sefer sayısı')}</b><span>${trs.length}</span><b>${t('Yolcu')}</b><span>${ch.reduce((a, c) => a + c.rows.length, 0)}</span>
        ${modOn('vehicles') ? `<b>${t('Araçsız')}</b><span>${ch.filter(c => c.noVeh).length ? `<span class="badge warn">${ch.filter(c => c.noVeh).length}</span>` : '✓'}</span>
        <b>${t('Kapasite uyarısı')}</b><span>${ch.filter(c => c.over).length ? `<span class="badge bad">${ch.filter(c => c.over).length}</span>` : '✓'}</span>` : ''}</div></div>`);
    if (modOn('vehicles')) cards.push(`
      <div class="card"><div class="row between"><h2>⚠ ${t('Belge ve bakım uyarıları')}</h2><button class="btn sm" data-pgo="vehicles">${t('Araçlar')}</button></div>
        ${al.length ? al.slice(0, 6).map(a => `<div class="alert-row"><b dir="auto">${h(a.name)}</b> <span class="muted small">${t(a.doc)}</span> ${alertBadge(a)}</div>`).join('') + (al.length > 6 ? `<div class="small muted">+${al.length - 6}</div>` : '') : `<p class="muted">✓ ${t('Uyarı yok')}</p>`}</div>`);
    if (modOn('costs')) cards.push(`
      <div class="card"><div class="row between"><h2>💰 ${t('Aylık maliyet')}</h2><button class="btn sm" data-pgo="costs">${t('Maliyeti aç')}</button></div>
        <div class="small muted">${t('Bu ay')}: <b>${money(C.total)}</b>${C.people ? ' · ' + t('Kişi başı') + ' ' + money(C.total / C.people) : ''}</div>${barChart(lastMonths(6), 360, 110)}</div>`);
    if (!cards.length) return;
    const box = document.createElement('div'); box.className = 'grid c' + Math.max(2, cards.length);
    box.innerHTML = cards.join('');
    h1.after(box);
    $$('[data-pgo]', box).forEach(b => b.onclick = () => go(b.dataset.pgo));
  };

  // ================= ayarlar ekleri =================
  P.settingsHtml = function () {
    const s = S.settings; const fxv = fx();
    const users = (S.users || []);
    return modulesCard() + `
    <div class="card"><h2>🎨 ${t('Görünüm')}</h2><div class="grid c3">
      <label class="f">${t('Tema')}<select id="s_theme"><option value="light" ${s.theme === 'light' ? 'selected' : ''}>${t('Açık')}</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>${t('Koyu')}</option><option value="auto" ${s.theme === 'auto' ? 'selected' : ''}>${t('Sisteme göre')}</option></select></label>
      <label class="f">${t('Kurum rengi')}<div class="row" style="gap:6px"><input type="color" id="s_accent" value="${h(s.accent || '#8a7a4e')}" style="height:34px;width:60px"><button class="btn sm" id="s_accReset">${t('Varsayılan renk')}</button></div></label>
      <label class="chk" style="margin-top:18px"><input type="checkbox" id="s_splash" ${s.splash === false ? '' : 'checked'}> ${t('Açılış ekranı')}</label></div></div>
    ${modOn('costs') ? `<div class="card"><h2>💱 ${t('Kur ayarları')}</h2><div class="grid c3">
      <label class="f">${t('Gösterim para birimi')}${curSel('s_cur', baseCur())}</label>
      <label class="f">${t('1 USD =')} SYP<input type="number" step="any" id="s_fxSYP" value="${h(fxv.SYP)}"></label>
      <label class="f">${t('1 USD =')} TRY<input type="number" step="any" id="s_fxTRY" value="${h(fxv.TRY)}"></label></div>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="s_fxSave">${t('Kaydet')}</button></div></div>` : ''}
    ${P.isAdmin() ? `<div class="card"><div class="row between"><h2>🔐 ${t('Kullanıcılar ve yetkiler')}</h2><button class="btn primary sm" id="uAdd">${t('+ Kullanıcı ekle')}</button></div>
      <p class="small muted">${t('Kullanıcı tanımlanınca açılışta giriş istenir. Yönetici her şeyi yapar; operatör kullanıcı yönetimi ve geri yükleme dışında her şeyi yapar; görüntüleme yetkisi değişiklik yapamaz.')}</p>
      ${users.length ? `<table><tr><th>${t('Ad')}</th><th>${t('Kullanıcı adı')}</th><th>${t('Yetki')}</th><th>${t('Aktif')}</th><th></th></tr>${users.map(u => `<tr><td dir="auto">${h(u.name)}</td><td>${h(u.username)}</td><td>${h(roleLbl(u.role))}</td><td>${u.active !== false ? '✓' : '—'}</td><td><button class="btn sm" data-ue="${u.id}">${t('Düzenle')}</button></td></tr>`).join('')}</table>` : `<p class="muted small">${t('Henüz kullanıcı yok; uygulama şifresiz açılıyor.')}</p>`}</div>` : ''}
    <div class="card"><h2>⌨️ ${t('Klavye kısayolları')}</h2>${shortcutTable()}</div>`;
  };
  function shortcutTable() {
    return `<div class="kv">${[['Ctrl + K', 'Hızlı arama'], ['Alt + 1…9, 0', 'Sayfalar arasında geçiş'], ['Ctrl + N', 'Bu sayfada yeni kayıt'], ['Ctrl + P', 'Yazdır'], ['Ctrl + F', 'Sayfadaki aramaya git'], ['F1', 'Kısayol yardımı'], ['Esc', 'Pencereyi kapat']].map(([k, l]) => `<b><kbd>${k}</kbd></b><span>${t(l)}</span>`).join('')}</div>`;
  }
  P.bindSettings = function (m) {
    const s = S.settings;
    $('#s_theme', m).onchange = e => { s.theme = e.target.value; save(); P.applyTheme(); };
    $('#s_accent', m).onchange = e => { s.accent = e.target.value; save(); P.applyTheme(); };
    $('#s_accReset', m).onclick = () => { delete s.accent; save(); P.applyTheme(); render(); };
    $('#s_splash', m).onchange = e => { s.splash = e.target.checked; save(); };
    $$('[data-mod]', m).forEach(c => c.onchange = () => { if (!P.needAdmin()) { c.checked = !c.checked; return; } S.settings.modules = Object.assign({}, S.settings.modules || {}, { [c.dataset.mod]: c.checked }); save(); renderNav(); render(); toast(t(MODULES.find(x => x.id === c.dataset.mod).name) + ': ' + (c.checked ? t('açık') : t('kapalı'))); });
    const fxs = $('#s_fxSave', m); if (fxs) fxs.onclick = () => { s.currency = $('#s_cur', m).value; s.fx = Object.assign(fx(), { SYP: num($('#s_fxSYP', m).value) || fx().SYP, TRY: num($('#s_fxTRY', m).value) || fx().TRY }); save(); toast(t('Kaydedildi')); };
    const ua = $('#uAdd', m); if (ua) ua.onclick = () => editUser(null);
    $$('[data-ue]', m).forEach(b => b.onclick = () => editUser(b.dataset.ue));
  };
  function editUser(id) {
    if (!P.needAdmin()) return;
    const u = id ? S.users.find(x => x.id === id) : { id: uid('us'), name: '', username: '', role: 'operator', active: true };
    modal(`<h2>${id ? t('Kullanıcıyı düzenle') : t('Yeni kullanıcı')}</h2><div class="grid c2">
      <label class="f">${t('Ad')}<input id="u_name" dir="auto" value="${h(u.name)}"></label>
      <label class="f">${t('Kullanıcı adı')}<input id="u_user" value="${h(u.username)}"></label>
      <label class="f">${t('Yetki')}<select id="u_role">${ROLES.map(([k, l]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></label>
      <label class="f">${id ? t('Şifre (değiştirmek için yazın)') : t('Şifre')}<input id="u_pw" type="password" autocomplete="new-password"></label></div>
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="u_act" ${u.active !== false ? 'checked' : ''}> ${t('Aktif')}</label>
      <div class="actions">${id ? `<button class="btn danger" id="u_del">${t('Sil')}</button>` : ''}<span style="flex:1"></span>${cancelBtn()}<button class="btn primary" id="u_save">${t('Kaydet')}</button></div>`, (r, close) => {
      const admins = () => S.users.filter(x => x.role === 'admin' && x.active !== false);
      $('#u_save', r).onclick = async () => {
        const name = $('#u_name', r).value.trim(), username = $('#u_user', r).value.trim(), pw = $('#u_pw', r).value, roleV = $('#u_role', r).value, act = $('#u_act', r).checked;
        if (!name || !username) return toast(t('Ad ve kullanıcı adı gerekli'), true);
        if (S.users.some(x => x.id !== u.id && x.username.toLowerCase() === username.toLowerCase())) return toast(t('Bu kullanıcı adı zaten var'), true);
        if (!id && !pw) return toast(t('Yeni kullanıcı için şifre gerekli'), true);
        const wasAdmin = id && u.role === 'admin' && u.active !== false;
        if (wasAdmin && (roleV !== 'admin' || !act) && admins().length <= 1) return toast(t('En az bir yönetici kalmalı'), true);
        if (!id && !S.users.length && roleV !== 'admin') return toast(t('En az bir yönetici kalmalı'), true);
        Object.assign(u, { name, username, role: roleV, active: act });
        if (pw) { u.salt = uid('s'); u.hash = await hashPw(pw, u.salt); }
        if (!id) S.users.push(u);
        if (P.user && P.user.implicit && u.role === 'admin') P.user = u; // ilk yönetici: oturum bu kullanıcıyla sürer
        if (P.user && P.user.id === u.id) P.user = u;
        save(); close(); renderNav(); render(); toast(t('Kaydedildi'));
      };
      if (id) $('#u_del', r).onclick = () => {
        if (P.user && P.user.id === u.id) return toast(t('Kendi hesabınızı silemezsiniz'), true);
        if (u.role === 'admin' && admins().length <= 1) return toast(t('En az bir yönetici kalmalı'), true);
        confirmDlg(t('Kullanıcı silinsin mi?'), () => { S.users = S.users.filter(x => x.id !== u.id); save(); close(); render(); });
      };
    });
  }

  // ================= tema & açılış =================
  function shade(hex, f) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex; const n = parseInt(m[1], 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.max(0, Math.min(255, Math.round(x * f)))); return '#' + c.map(x => x.toString(16).padStart(2, '0')).join(''); }
  P.applyTheme = function () {
    const s = (hasS() && S.settings) || {}; const de = document.documentElement;
    const dark = s.theme === 'dark' || (s.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    de.classList.toggle('dark', !!dark);
    if (s.accent) { de.style.setProperty('--accent', s.accent); de.style.setProperty('--accent-d', shade(s.accent, .8)); } else { de.style.removeProperty('--accent'); de.style.removeProperty('--accent-d'); }
  };
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => P.applyTheme()); } catch (e) { }
  const splashT0 = Date.now();
  P.hideSplash = function () { const sp = document.getElementById('splash'); if (!sp) return; const wait = (hasS() && S.settings && S.settings.splash === false) ? 0 : Math.max(0, 700 - (Date.now() - splashT0)); setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 400); }, wait); };

  // ================= kısayollar & hızlı arama =================
  function quickSearch() {
    modal(`<input type="search" id="qs" class="qs" placeholder="${t('Kişi, yer, hat, araç, şoför ara…')}" autocomplete="off"><div id="qsr" class="qsr"></div>`, (r, close) => {
      const inp = $('#qs', r); let items = [], sel = 0;
      const draw = () => {
        const q = inp.value.trim().toLowerCase(); items = [];
        if (q) {
          S.persons.forEach(p => { if ([p.name, p.nickname, p.regNo, p.title].join(' ').toLowerCase().includes(q)) items.push(['👤', p.name, (p.regNo || '') + ' · ' + placeName(p.homeId), () => editPerson(p.id)]); });
          (modOn('vehicles') ? S.vehicles || [] : []).forEach(v => { if ([v.plate, v.model, v.contractor].join(' ').toLowerCase().includes(q)) items.push(['🚐', v.plate, v.model || '', () => { go('vehicles'); setTimeout(() => editVehicle(v.id), 30); }]); });
          (modOn('drivers') ? S.drivers : []).forEach(d => { if ([d.name, d.phone].join(' ').toLowerCase().includes(q)) items.push(['🧑‍✈️', d.name, d.phone || '', () => { go('drivers'); setTimeout(() => editDriver(d.id), 30); }]); });
          S.lines.forEach(L => { if ([L.name, L.nameAr, L.nameEn].join(' ').toLowerCase().includes(q)) items.push(['🛣️', lname(L), '', () => { selLine = L.id; go('lines'); }]); }); // eslint-disable-line
          S.places.forEach(p => { if (p.name.toLowerCase().includes(q)) items.push(['📍', p.name, '', () => { pf = { q: '', group: '', line: '', status: '', work: '', place: p.id }; go('persons'); }]); }); // eslint-disable-line
          NAV.forEach(([pg, ic, lb]) => { if (t(lb).toLowerCase().includes(q) && P.navAllowed(pg)) items.push([ic, t(lb), '', () => go(pg)]); });
        }
        items = items.slice(0, 40); sel = Math.min(sel, Math.max(0, items.length - 1));
        $('#qsr', r).innerHTML = q ? (items.map((it, i) => `<a class="${i === sel ? 'on' : ''}" data-i="${i}"><span>${it[0]}</span><b dir="auto">${h(it[1])}</b><span class="small muted" dir="auto">${h(it[2])}</span></a>`).join('') || `<div class="muted pad">${t('Sonuç yok')}</div>`) : '';
        $$('[data-i]', r).forEach(a => a.onclick = () => { close(); items[+a.dataset.i][3](); });
      };
      inp.oninput = () => { sel = 0; draw(); };
      inp.onkeydown = e => {
        if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
        else if (e.key === 'Enter' && items[sel]) { close(); items[sel][3](); }
      };
      setTimeout(() => inp.focus(), 20);
    });
    $('#modalRoot .modal').classList.add('qs-modal');
  }
  P.quickSearch = quickSearch;
  function bindKeys() {
    document.addEventListener('keydown', e => {
      if (!hasS() || !$('#lock').classList.contains('hidden')) return;
      const k = e.key.toLowerCase(); const mod = e.ctrlKey || e.metaKey; const open = !!$('#modalRoot').innerHTML.trim();
      if (e.key === 'Escape' && open) { $('#modalRoot').innerHTML = ''; return; }
      if (mod && k === 'k') { e.preventDefault(); quickSearch(); return; }
      if (e.key === 'F1') { e.preventDefault(); modal(`<h2>⌨️ ${t('Klavye kısayolları')}</h2>${shortcutTable()}<div class="actions"><button class="btn primary" data-close>${t('Tamam')}</button></div>`); return; }
      if (open) return;
      if (e.altKey && !mod && /^[0-9]$/.test(e.key)) { const list = NAV.filter(([p]) => P.navAllowed(p)); const i = e.key === '0' ? 9 : +e.key - 1; if (list[i]) { e.preventDefault(); go(list[i][0]); } return; }
      if (mod && k === 'n') {
        const f = { persons: () => editPerson(null), vehicles: () => vtab === 'list' ? editVehicle(null) : editLog(vtab, null), trips: () => editExtraTrip(null), drivers: () => editDriver(null), places: () => editPlace(null) }[page];
        if (f) { e.preventDefault(); f(); } return;
      }
      if (mod && k === 'p') {
        const f = { plan: () => printReport('plan', { date: planDate }), trips: () => printReport('driverStops', { date: tripDate, lhId: S.settings.defaultLetterheadId }), reports: () => { const b = $('#rPrint'); if (b) b.click(); } }[page]; // eslint-disable-line
        if (f) { e.preventDefault(); f(); } return;
      }
      if (mod && k === 'f') { const s = $('#main input[type=search]'); if (s) { e.preventDefault(); s.focus(); s.select(); } }
    });
  }

  // ================= raporlar =================
  P.reportTypes = [['driverStops', 'Şoför durak listesi'], ['trips', 'Sefer ve araç atama listesi'], ['attendance', 'Yoklama / devamsızlık raporu'], ['monthly', 'Aylık özet'], ['vehicles', 'Araç listesi ve belge durumu'], ['maint', 'Bakım ve yakıt raporu'], ['payments', 'Taşeron hakediş raporu'], ['qrcards', 'QR personel kartları']];
  const rangeOf = o => { if (o.date2 && o.date2 >= o.date) return [o.date, o.date2]; return monthRange(monthOf(o.date)); };
  const tripFilter = o => tr => (!o.lineId || tr.lineId === o.lineId) && (!o.vehicleId || tr.vehicleId === o.vehicleId || tr.vehicle2Id === o.vehicleId) && (!o.driverId || tr.driverId === o.driverId || tr.driver2Id === o.driverId) && (!o.tripId || tr.id === o.tripId);
  function attStats(a, b, o) {
    const trips = tripsIn(a, b).filter(tripFilter(o || {}));
    const per = {}; const tripRows = [];
    trips.forEach(tr => {
      const att = S.attendance[tr.id]; if (!att) return; const rows = tripPassengers(tr); let y = 0, n = 0;
      rows.forEach(r => { const v = att[r.p.id]; const P2 = per[r.p.id] = per[r.p.id] || { p: r.p, yes: 0, no: 0, dates: [] }; if (v === 1) { P2.yes++; y++; } else if (v === 0) { P2.no++; n++; P2.dates.push(tr.date); } });
      tripRows.push({ tr, total: rows.length, y, n });
    });
    return { per: Object.values(per).sort((x, z) => z.no - x.no || sortTR(x.p.name, z.p.name)), tripRows };
  }
  function qrSvg(text, cell) { try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag(cell || 3, 0); } catch (e) { return ''; } }
  P.qrSvg = qrSvg;
  P.reportBody = function (type, o, head) {
    const d0 = todayISO(); const date = o.date || d0; let body = '';
    if (type === 'driverStops' || type === 'trips') {
      const trs = tripsOn(date).filter(tripFilter(o)).filter(tr => tr.status !== 'cancelled');
      if (type === 'trips') {
        body = head(t('Sefer ve araç atama listesi'), `${fmt(date)} ${dayName(date)}`) + `<table><tr><th>#</th><th>${t('Hat')}</th><th>${t('Sefer')}</th><th>${t('Vakit')}</th><th>${t('Kalkış')}</th><th>${t('Araç')}</th><th>${t('Şoför')}</th><th>${t('Yolcu')}</th><th>${t('Kapasite')}</th><th>${t('Durum')}</th></tr>` +
          trs.map((tr, i) => { const c = tripCheck(tr); return `<tr><td>${i + 1}</td><td>${h(lineName(tr.lineId))}</td><td>${tr.kind === 'change' ? t('Değişim') : t('Ek sefer')}</td><td>${slotLbl(tr.slot)}</td><td>${h(tr.time || '')}</td><td dir="auto">${h(vehName(tr.vehicleId))}${tr.vehicle2Id ? ' + ' + h(vehName(tr.vehicle2Id)) : ''}</td><td dir="auto">${h(drvName(tr.driverId))}${tr.driver2Id ? ' + ' + h(drvName(tr.driver2Id)) : ''}</td><td>${c.rows.length}</td><td>${c.loads.join('+')} / ${c.caps.join('+') || '?'}${c.over ? ' ⚠' : ''}</td><td>${t({ planned: 'Planlandı', done: 'Tamamlandı', cancelled: 'İptal' }[tr.status || 'planned'])}</td></tr>`; }).join('') + '</table>';
        return body;
      }
      trs.forEach((tr, i) => {
        const L = lineById(tr.lineId); const rows = tripPassengers(tr); const c = tripCheck(tr);
        const buses = c.nb;
        for (let b = 1; b <= buses; b++) {
          const rs = buses === 1 ? rows : rows.filter(r => r.bus === b);
          const byStop = {}; rs.forEach(r => { (byStop[r.stopId] = byStop[r.stopId] || []).push(r); });
          const order = (L ? L.stops : []).filter(s => byStop[s]).concat(Object.keys(byStop).filter(s => !L || !L.stops.includes(s)));
          const veh = b === 1 ? tr.vehicleId : tr.vehicle2Id, drv = b === 1 ? tr.driverId : tr.driver2Id, dv = drvById(drv);
          body += `<div class="${i || b > 1 ? 'pb' : ''}">${i || b > 1 ? letterheadHtml(o.lhId) : ''}` + head(t('Şoför durak listesi'), `${fmt(date)} ${dayName(date)} · ${slotLbl(tr.slot)}${tr.time ? ' ' + tr.time : ''}`) +
            `<div class="kvp"><span><b>${t('Hat')}:</b> ${h(lineName(tr.lineId))}${buses === 2 ? ' · ' + t('Otobüs') + ' ' + b : ''}</span><span><b>${t('Araç')}:</b> ${h(vehName(veh))}</span><span><b>${t('Şoför')}:</b> ${h(dv ? dv.name : '—')} ${dv && dv.phone ? '· ' + h(dv.phone) : ''}</span><span><b>${t('Yolcu')}:</b> ${rs.length}</span></div>` +
            `<table><tr><th>#</th><th>${t('Durak')}</th><th>${t('Tahmini saat')}</th><th>${t('İnecekler')}</th><th>${t('Binecekler')}</th><th>✔</th></tr>` +
            order.map((sid, k) => { const g = byStop[sid]; const off = g.filter(r => r.dir === 'toHome'), on = g.filter(r => r.dir === 'toWork'); const mins = L && L.stopMins ? L.stopMins[sid] : null; return `<tr><td>${k + 1}</td><td dir="auto"><b>${h(placeName(sid))}</b></td><td>${mins != null && mins !== '' ? h(tm(tr.time || (L && L.departure), num(mins)) || ('+' + mins + ' dk')) : ''}</td><td dir="auto">${off.map(r => h(r.p.name)).join('<br>')}${off.length ? ` <b>(${off.length})</b>` : ''}</td><td dir="auto">${on.map(r => h(r.p.name)).join('<br>')}${on.length ? ` <b>(${on.length})</b>` : ''}</td><td style="width:60px"></td></tr>`; }).join('') + '</table>' +
            (tr.note ? `<div class="small">${t('Not')}: ${h(tr.note)}</div>` : '') + `<div class="sig"><div>${t('Şoför')}</div><div>${h(S.settings.adminName)}</div></div></div>`;
        }
      });
      if (!trs.length) body = head(t('Şoför durak listesi'), fmt(date)) + `<p>${t('Bu tarihte sefer yok')}</p>`;
      return body;
    }
    if (type === 'attendance') {
      const [a, b] = rangeOf(o); const st = attStats(a, b, o);
      body = head(t('Yoklama / devamsızlık raporu'), `${fmt(a)} – ${fmt(b)}${o.lineId ? ' · ' + lineName(o.lineId) : ''}`);
      if (!st.tripRows.length) return body + `<p>${t('Yoklama kaydı yok')}</p>`;
      body += `<div class="sec">${t('Sefer bazında yoklama')}</div><table><tr><th>${t('Tarih')}</th><th>${t('Hat')}</th><th>${t('Sefer')}</th><th>${t('Yolcu')}</th><th>${t('Bindi')}</th><th>${t('Gelmedi')}</th><th>${t('İşaretlenmedi')}</th></tr>${st.tripRows.map(x => `<tr><td>${fmt(x.tr.date)}</td><td>${h(lineName(x.tr.lineId))}</td><td>${x.tr.kind === 'change' ? t('Değişim') : t('Ek sefer')} · ${slotLbl(x.tr.slot)}</td><td>${x.total}</td><td>${x.y}</td><td>${x.n}</td><td>${x.total - x.y - x.n}</td></tr>`).join('')}</table>`;
      body += `<div class="sec">${t('Kişi bazında devamsızlık')}</div><table><tr><th>#</th><th>${t('Sicil')}</th><th>${t('Ad Soyad')}</th><th>${t('Grup')}</th><th>${t('Hat')}</th><th>${t('Bindi sayısı')}</th><th>${t('Gelmedi sayısı')}</th><th>${t('Devamsızlık oranı')}</th><th>${t('Tarih')}</th></tr>${st.per.filter(x => x.no || !o.onlyAbsent).map((x, i) => `<tr><td>${i + 1}</td><td>${h(x.p.regNo)}</td><td dir="auto">${h(x.p.name)}</td><td>${h(gName(x.p.group))}</td><td>${h(lineName(x.p.lineId))}</td><td>${x.yes}</td><td>${x.no}</td><td>${x.yes + x.no ? Math.round(x.no / (x.yes + x.no) * 100) + '%' : '—'}</td><td class="small">${x.dates.map(fmt).join(', ')}</td></tr>`).join('')}</table>`;
      return body;
    }
    if (type === 'monthly') {
      const CM = modOn('costs'), VM = modOn('vehicles'), TM = modOn('trips');
      const ym = monthOf(date); const [a, b] = monthRange(ym); const C = costsFor(ym); const st = attStats(a, b, {});
      const lines = S.lines.filter(L => !o.lineId || L.id === o.lineId);
      body = head(t('Aylık özet'), h(monthLbl(ym)));
      body += `<div class="kvp"><span><b>${t('Sefer sayısı')}:</b> ${C.trips.length}</span><span><b>${t('Taşınan yolcu')}:</b> ${C.trips.reduce((s, tr) => s + tripPassengers(tr).length, 0)}</span>${TM ? `<span><b>${t('Yoklama')}:</b> ✔ ${st.tripRows.reduce((s, x) => s + x.y, 0)} · ✕ ${st.tripRows.reduce((s, x) => s + x.n, 0)}</span>` : ''}${CM ? `<span><b>${t('Toplam maliyet')}:</b> ${money(C.total)}</span>` : ''}</div>`;
      if (CM) body += `<div class="sec">${t('Seferler ve yolcular')} / ${t('Maliyet')}</div><table><tr><th>${t('Hat')}</th><th>${t('Sefer sayısı')}</th><th>${t('Taşınan yolcu')}</th><th>${t('Hakediş')}</th><th>${t('Yakıt')}</th><th>${t('Bakım')}</th><th>${t('Toplam')}</th><th>${t('Kişi başı')}</th></tr>${lines.map(L => { const x = C.line[L.id] || { trips: 0, pass: 0, pay: 0, fuel: 0, maint: 0 }; const tot = x.pay + x.fuel + x.maint; const ppl = S.persons.filter(p => p.lineId === L.id && personInService(p)).length; return `<tr><td>${h(lname(L))}</td><td>${x.trips}</td><td>${x.pass}</td><td>${money(x.pay)}</td><td>${money(x.fuel)}</td><td>${money(x.maint)}</td><td><b>${money(tot)}</b></td><td>${ppl ? money(tot / ppl) : '—'}</td></tr>`; }).join('')}</table>`;
      else body += `<div class="sec">${t('Seferler ve yolcular')}</div><table><tr><th>${t('Hat')}</th><th>${t('Sefer sayısı')}</th><th>${t('Taşınan yolcu')}</th><th>${t('Kişi (serviste)')}</th></tr>${lines.map(L => { const x = C.line[L.id] || { trips: 0, pass: 0 }; return `<tr><td>${h(lname(L))}</td><td>${x.trips}</td><td>${x.pass}</td><td>${S.persons.filter(p => p.lineId === L.id && personInService(p)).length}</td></tr>`; }).join('')}</table>`;
      if (CM) body += `<div class="sec">${t('Araç bazında')}</div><table><tr><th>${t('Araç')}</th><th>${t('Sefer / gün')}</th><th>${t('Hakediş')}</th><th>${t('Yakıt')}</th><th>${t('Bakım')}</th><th>${t('Toplam')}</th></tr>${(S.vehicles || []).map(v => { const V = C.veh[v.id]; if (!V || !(V.trips || V.pay || V.fuel || V.maint)) return ''; return `<tr><td dir="auto">${h(v.plate)}</td><td>${V.trips} / ${V.days.size}</td><td>${money(V.pay)}</td><td>${money(V.fuel)}</td><td>${money(V.maint)}</td><td>${money(V.pay + V.fuel + V.maint)}</td></tr>`; }).join('')}</table>`;
      const al = VM ? docAlerts() : []; if (al.length) body += `<div class="sec">${t('Uyarılar')}</div><table><tr><th>${t('Kayıt')}</th><th>${t('Tür')}</th><th>${t('Durum')}</th></tr>${al.map(x => `<tr><td dir="auto">${h(x.name)}</td><td>${t(x.doc)}</td><td>${x.km != null ? Math.abs(x.km) + ' ' + (x.km < 0 ? t('km geçti') : t('km kaldı')) : (x.days < 0 ? t('süresi geçti') : t('{0} gün kaldı', x.days)) + (x.date ? ' (' + fmt(x.date) + ')' : '')}</td></tr>`).join('')}</table>`;
      return body;
    }
    if (type === 'vehicles') {
      const vs = (S.vehicles || []).filter(v => !o.vehicleId || v.id === o.vehicleId);
      return head(t('Araç listesi ve belge durumu'), fmt(d0)) + `<table><tr><th>#</th><th>${t('Plaka')}</th><th>${t('Model')}</th><th>${t('Kapasite')}</th><th>${t('Sahiplik')}</th><th>${t('Varsayılan hat')}</th><th>${t('Varsayılan şoför')}</th><th>${t('Sigorta bitişi')}</th><th>${t('Muayene bitişi')}</th><th>${t('Ruhsat bitişi')}</th><th>${t('Kilometre')}</th></tr>${vs.map((v, i) => `<tr><td>${i + 1}</td><td dir="auto">${h(v.plate)}</td><td dir="auto">${h(v.model || '')}</td><td>${num(v.capacity) || ''}</td><td dir="auto">${v.ownership === 'contract' ? t('Taşeron') + ' · ' + h(v.contractor || '') : t('Kurum aracı')}</td><td>${h(lineName(v.lineId))}</td><td dir="auto">${h(drvName(v.driverId))}</td><td>${fmt(v.insuranceEnd)}${v.insuranceEnd && daysTo(v.insuranceEnd) < 0 ? ' ⚠' : ''}</td><td>${fmt(v.inspectionEnd)}${v.inspectionEnd && daysTo(v.inspectionEnd) < 0 ? ' ⚠' : ''}</td><td>${fmt(v.licenseEnd)}${v.licenseEnd && daysTo(v.licenseEnd) < 0 ? ' ⚠' : ''}</td><td>${vehKm(v) || ''}</td></tr>`).join('')}</table>`;
    }
    if (type === 'maint') {
      const [a, b] = rangeOf(o); const inR = x => x.date >= a && x.date <= b && (!o.vehicleId || x.vehicleId === o.vehicleId);
      const ms = (S.maint || []).filter(inR).sort((x, z) => String(x.date).localeCompare(z.date)), fs = (S.fuel || []).filter(inR).sort((x, z) => String(x.date).localeCompare(z.date));
      return head(t('Bakım ve yakıt raporu'), `${fmt(a)} – ${fmt(b)}${o.vehicleId ? ' · ' + vehName(o.vehicleId) : ''}`) +
        `<div class="sec">${t('Bakım & arıza')} — ${money(ms.reduce((s, x) => s + conv(x.cost, x.currency), 0))}</div><table><tr><th>${t('Tarih')}</th><th>${t('Araç')}</th><th>${t('Tür')}</th><th>${t('Kilometre')}</th><th>${t('Tutar')}</th><th>${t('Servis / yer')}</th><th>${t('Not')}</th></tr>${ms.map(x => `<tr><td>${fmt(x.date)}</td><td dir="auto">${h(vehName(x.vehicleId))}</td><td>${h(t(x.type || ''))}</td><td>${num(x.km) || ''}</td><td>${money(num(x.cost), x.currency)}</td><td dir="auto">${h(x.place || '')}</td><td dir="auto">${h(x.note || '')}</td></tr>`).join('')}</table>` +
        `<div class="sec">${t('Yakıt')} — ${fs.reduce((s, x) => s + num(x.liters), 0).toFixed(1)} L · ${money(fs.reduce((s, x) => s + conv(x.cost, x.currency), 0))}</div><table><tr><th>${t('Tarih')}</th><th>${t('Araç')}</th><th>${t('Kilometre')}</th><th>${t('Litre')}</th><th>${t('Tutar')}</th><th>${t('İstasyon')}</th></tr>${fs.map(x => `<tr><td>${fmt(x.date)}</td><td dir="auto">${h(vehName(x.vehicleId))}</td><td>${num(x.km) || ''}</td><td>${num(x.liters)}</td><td>${money(num(x.cost), x.currency)}</td><td dir="auto">${h(x.station || '')}</td></tr>`).join('')}</table>`;
    }
    if (type === 'payments') {
      const ym = monthOf(date); const C = costsFor(ym); const vs = (S.vehicles || []).filter(v => v.ownership === 'contract' && (!o.vehicleId || v.id === o.vehicleId));
      body = head(t('Taşeron hakediş raporu'), h(monthLbl(ym)));
      if (!vs.length) return body + `<p>${t('Taşeron araç yok')}</p>`;
      const groups = {}; vs.forEach(v => { (groups[v.contractor || '—'] = groups[v.contractor || '—'] || []).push(v); });
      Object.entries(groups).forEach(([con, list]) => {
        let tot = 0;
        body += `<div class="sec">${t('Taşeron')}: ${h(con)}</div><table><tr><th>${t('Plaka')}</th><th>${t('Ücret türü')}</th><th>${t('Ücret')}</th><th>${t('Sefer / gün')}</th><th>${t('Ödenecek')} (${baseCur()})</th></tr>${list.map(v => { const V = C.veh[v.id] || { trips: 0, days: new Set(), pay: 0 }; tot += V.pay; return `<tr><td dir="auto">${h(v.plate)}</td><td>${t({ trip: 'Sefer başı', day: 'Gün başı', month: 'Aylık sabit' }[v.rateType || 'trip'])}</td><td>${money(num(v.rate), v.currency)}</td><td>${V.trips} / ${V.days.size}</td><td><b>${money(V.pay)}</b></td></tr>`; }).join('')}<tr><td colspan="4" style="text-align:end"><b>${t('Toplam')}</b></td><td><b>${money(tot)}</b></td></tr></table>`;
      });
      body += `<div class="sig"><div>${t('Taşeron')}</div><div>${h(S.settings.adminName)}</div></div>`;
      return body;
    }
    if (type === 'qrcards') {
      let list = S.persons.filter(p => p.active !== false); if (o.lineId) list = list.filter(p => p.lineId === o.lineId);
      list.sort((a, b) => (Number(a.seq) || 9999) - (Number(b.seq) || 9999));
      return head(t('QR personel kartları'), `${list.length} ${t('kişi')}`) + `<div class="qr-grid">${list.map(p => `<div class="qr-card"><div class="qr">${qrSvg('MS:' + (p.regNo || p.id), 3)}</div><div class="qi"><b dir="auto">${h(p.name)}</b><span>${t('Sicil')}: ${h(p.regNo || '—')}</span><span>${t('Grup')}: ${h(p.group || '—')}</span><span dir="auto">${h(lineName(p.lineId))}</span><span dir="auto">${h(placeName(p.homeId))}</span><small>${h(S.settings.orgName)}</small></div></div>`).join('')}</div>`;
    }
    return '';
  };
  P.reportXls = function (type, o) {
    o = o || {}; const date = o.date || todayISO(); const sheets = [];
    if (type === 'trips' || type === 'driverStops') {
      const trs = tripsOn(date).filter(tripFilter(o));
      sheets.push([t('Seferler'), [[t('Hat'), t('Sefer'), t('Vakit'), t('Kalkış'), t('Araç'), t('Şoför'), t('Yolcu'), t('Kapasite'), t('Durum')], ...trs.map(tr => { const c = tripCheck(tr); return [lineName(tr.lineId), tr.kind === 'change' ? t('Değişim') : t('Ek sefer'), slotLbl(tr.slot), tr.time || '', vehName(tr.vehicleId) + (tr.vehicle2Id ? ' + ' + vehName(tr.vehicle2Id) : ''), drvName(tr.driverId) + (tr.driver2Id ? ' + ' + drvName(tr.driver2Id) : ''), c.rows.length, c.cap || '', t({ planned: 'Planlandı', done: 'Tamamlandı', cancelled: 'İptal' }[tr.status || 'planned'])]; })]]);
      trs.forEach(tr => { const att = S.attendance[tr.id] || {}; sheets.push([lineName(tr.lineId) + ' ' + (tr.kind === 'change' ? '' : slotLbl(tr.slot)), [[t('Durak'), t('Ad Soyad'), t('Sicil'), t('Grup'), t('Yön'), t('Yoklama')], ...tripPassengers(tr).map(r => [placeName(r.stopId), r.p.name, r.p.regNo, gName(r.p.group), r.dir === 'toHome' ? t('Eve dönüş') : t('İşe gidiş'), att[r.p.id] === 1 ? t('Bindi') : att[r.p.id] === 0 ? t('Gelmedi') : ''])]]); });
      if (!trs.length) return toast(t('Bu tarihte sefer yok'), true), true;
      saveBlob('seferler-' + date + '.xlsx', xlsxFromSheets(sheets)); return true;
    }
    if (type === 'vehicles') {
      sheets.push([t('Araçlar'), [[...VEH_COLS.map(c => t(c)), t('Varsayılan hat'), t('Varsayılan şoför')], ...(S.vehicles || []).map(v => [v.plate, v.model, v.year, v.capacity, v.ownership === 'contract' ? t('Taşeron') : t('Kurum aracı'), v.contractor, v.rate, v.currency, v.insuranceEnd, v.inspectionEnd, v.licenseEnd, vehKm(v), lineName(v.lineId), drvName(v.driverId)])]]);
      sheets.push([t('Bakım'), [[t('Tarih'), t('Araç'), t('Tür'), t('Kilometre'), t('Tutar'), t('Para birimi'), t('Servis / yer'), t('Not')], ...(S.maint || []).map(x => [x.date, vehName(x.vehicleId), t(x.type || ''), x.km, x.cost, x.currency, x.place, x.note])]]);
      sheets.push([t('Yakıt'), [[t('Tarih'), t('Araç'), t('Kilometre'), t('Litre'), t('Tutar'), t('Para birimi'), t('İstasyon')], ...(S.fuel || []).map(x => [x.date, vehName(x.vehicleId), x.km, x.liters, x.cost, x.currency, x.station])]]);
      saveBlob('araclar-' + todayISO() + '.xlsx', xlsxFromSheets(sheets)); return true;
    }
    if (type === 'maint') {
      const [a, b] = rangeOf(o); const inR = x => x.date >= a && x.date <= b && (!o.vehicleId || x.vehicleId === o.vehicleId);
      sheets.push([t('Bakım'), [[t('Tarih'), t('Araç'), t('Tür'), t('Kilometre'), t('Tutar'), t('Para birimi'), t('Servis / yer'), t('Not')], ...(S.maint || []).filter(inR).map(x => [x.date, vehName(x.vehicleId), t(x.type || ''), x.km, x.cost, x.currency, x.place, x.note])]]);
      sheets.push([t('Yakıt'), [[t('Tarih'), t('Araç'), t('Kilometre'), t('Litre'), t('Tutar'), t('Para birimi'), t('İstasyon')], ...(S.fuel || []).filter(inR).map(x => [x.date, vehName(x.vehicleId), x.km, x.liters, x.cost, x.currency, x.station])]]);
      saveBlob('bakim-yakit-' + a + '.xlsx', xlsxFromSheets(sheets)); return true;
    }
    if (type === 'costs' || type === 'monthly' || type === 'payments') {
      const ym = monthOf(date); const C = costsFor(ym); const cur = baseCur();
      sheets.push([t('Araç bazında'), [[t('Araç'), t('Taşeron'), t('Sefer sayısı'), t('Gün'), t('Hakediş') + ' ' + cur, t('Yakıt') + ' ' + cur, t('Bakım') + ' ' + cur, t('Toplam') + ' ' + cur], ...(S.vehicles || []).map(v => { const V = C.veh[v.id] || { trips: 0, days: new Set(), pay: 0, fuel: 0, maint: 0 }; return [v.plate, v.ownership === 'contract' ? v.contractor || t('Taşeron') : t('Kurum aracı'), V.trips, V.days.size, +V.pay.toFixed(2), +V.fuel.toFixed(2), +V.maint.toFixed(2), +(V.pay + V.fuel + V.maint).toFixed(2)]; })]]);
      sheets.push([t('Hat bazında'), [[t('Hat'), t('Sefer sayısı'), t('Taşınan yolcu'), t('Hakediş') + ' ' + cur, t('Yakıt') + ' ' + cur, t('Bakım') + ' ' + cur, t('Toplam') + ' ' + cur, t('Kişi (serviste)'), t('Kişi başı') + ' ' + cur], ...Object.entries(C.line).map(([lid, L]) => { const tot = L.pay + L.fuel + L.maint; const ppl = lid === '_none' ? 0 : S.persons.filter(p => p.lineId === lid && personInService(p)).length; return [lid === '_none' ? t('Atanmamış') : lineName(lid), L.trips, L.pass, +L.pay.toFixed(2), +L.fuel.toFixed(2), +L.maint.toFixed(2), +tot.toFixed(2), ppl, ppl ? +(tot / ppl).toFixed(2) : '']; })]]);
      saveBlob('maliyet-' + ym + '.xlsx', xlsxFromSheets(sheets)); return true;
    }
    if (type === 'attendance') {
      const [a, b] = rangeOf(o); const st = attStats(a, b, o);
      sheets.push([t('Kişi bazında devamsızlık'), [[t('Sicil'), t('Ad Soyad'), t('Grup'), t('Hat'), t('Bindi sayısı'), t('Gelmedi sayısı'), t('Devamsızlık oranı'), t('Tarih')], ...st.per.map(x => [x.p.regNo, x.p.name, gName(x.p.group), lineName(x.p.lineId), x.yes, x.no, x.yes + x.no ? Math.round(x.no / (x.yes + x.no) * 100) + '%' : '', x.dates.join(', ')])]]);
      sheets.push([t('Sefer bazında yoklama'), [[t('Tarih'), t('Hat'), t('Sefer'), t('Yolcu'), t('Bindi'), t('Gelmedi')], ...st.tripRows.map(x => [x.tr.date, lineName(x.tr.lineId), x.tr.kind === 'change' ? t('Değişim') : t('Ek sefer'), x.total, x.y, x.n])]]);
      saveBlob('yoklama-' + a + '.xlsx', xlsxFromSheets(sheets)); return true;
    }
    return false;
  };

  // ================= başlangıçta arka plan işleri =================
  P.start = function () {
    P.lastJson = JSON.stringify(S); P.resetSnap(); P.userBox();
    setTimeout(dailyBackup, 8000); setInterval(dailyBackup, 60 * 60 * 1000);
    window.addEventListener('beforeunload', () => { try { save(true); } catch (e) { } });
  };
  bindKeys();
})();
