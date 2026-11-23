# Merkezi Servis Hizmeti

Fabrika personel servisi yönetim uygulaması (Windows masaüstü, Electron).

## Çalıştırma (geliştirme)
    npm install
    npm start

## Windows paketi
    npm run dist        → dist/ içinde zip

## Güncelleme sistemi
Uygulama, **Ayarlar → Güncelleme** bölümündeki adresten `update.json` dosyasını okur.
Sürüm yeniyse `files` listesindeki dosyaları indirir, `%APPDATA%/merkezi-servis/app-update/www`
altına yazar ve yeniden başlar. Kişi verileri `%APPDATA%/merkezi-servis/merkezi-servis-data.json`
dosyasındadır; güncellemeden etkilenmez.

Yeni sürüm yayınlamak için:
    node bump.js "Değişiklik notu yerine sürüm verilmezse 1.0.x otomatik artar"
    git add -A && git commit -m "v1.0.1" && git push

`www/seed.json` (personel başlangıç verisi) depoya gönderilmez.

## v1.0.9 – profesyonel modül (`www/pro.js`)
- **Seferler & Yoklama:** değişim günlerinden otomatik sefer, ek sefer, vakit (sabah/öğle/akşam/gece), araç ve şoför atama, kapasite kontrolü (2 otobüse bölme, uygun araç önerisi), QR/sicil ile yoklama.
- **Araçlar:** araç kartı, sigorta/muayene/ruhsat/ehliyet uyarıları, bakım ve yakıt kayıtları (km/litre), Excel içe/dışa aktarma.
- **Maliyet:** araç ve hat bazında maliyet, taşeron hakedişi, kişi başı maliyet, USD/SYP/TRY kur desteği.
- **Güvenlik:** kullanıcılar ve yetkiler (yönetici/operatör/görüntüleme), işlem geçmişi, günlük otomatik yedek (IndexedDB, 30 gün), çöp kutusu.
- **Görünüm:** koyu tema, kurum rengi, açılış ekranı, Ctrl+K hızlı arama ve klavye kısayolları.
- **Yeni raporlar:** şoför durak listesi, sefer/araç listesi, yoklama-devamsızlık, aylık özet, araç belge durumu, bakım-yakıt, hakediş, QR personel kartları.
