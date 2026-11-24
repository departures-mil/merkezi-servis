# Merkezi Servis Hizmeti

Fabrika personel servisi yönetim uygulaması (Windows masaüstü, Electron).

## Çalıştırma (geliştirme)
    npm install
    npm start

## Windows paketi
    npm run dist        → dist/MerkeziServis-Setup-X.Y.Z.exe (NSIS, kullanıcı başına %LOCALAPPDATA%\Programs) + win-unpacked/resources/app.asar

## Ortak çekirdek (1.1.0+)
Görünüm, sağ üst düğmeler, tam ekran açılış, güncelleme, Admin ile iletişim, çökme raporu, duyurular, ilk açılış
rehberi ve "neler yeni" `departures-mil/ortak-cekirdek`'ten gelir: `www/cekirdek/` (arayüz) ve `cekirdek/electron/`
(ana süreç). Hangi commit'ten alındığı `cekirdek/VERSION`'da. Uygulamaya özgü kabuk kodu: `www/kabuk.js`.

## Sürüm ve yayın
Tek sürüm: `package.json` (semver). Değiştirmek için `node tools/surum.js 1.2.0`, notlar `release-notes.json` (tr/en/ar).
Yayın: main'e birleştir → `git tag v1.2.0 && git push origin v1.2.0` → `.github/workflows/release.yml`
(test → Windows derleme → GitHub Release: setup exe, app.asar, delta yamalar, latest.json). Program tek tuşla günceller.

## Eski kurulumlar (≤1.0.11) için köprü
Eski sürümler yalnız `update.json` (raw, main dalı) kanalını bilir ve yalnız `www/` dosyalarını değiştirir.
`npm test` update.json'un www/ ile tutarlı olduğunu denetler; www/ değişince `node tools/eski-kanal.js` çalıştırın.
Yeni sürüm Release'te yayınlandıktan SONRA `node tools/eski-kanal.js --yayinla` + main'e push: eski kurulumlar yeni
arayüzü alır, arayüz eski kabukta olduğunu anlar ve kurulum dosyasını indirmeye yönlendirir (veriler aynı klasörde kalır).
Kişi verileri `%APPDATA%\Merkezi Servis\merkezi-servis-data.json` (+ .bak) dosyasındadır; güncelleme dokunmaz.
`www/seed.json` (personel başlangıç verisi) depoya gönderilmez.

## v1.0.9 – profesyonel modül (`www/pro.js`)
- **Seferler & Yoklama:** değişim günlerinden otomatik sefer, ek sefer, vakit (sabah/öğle/akşam/gece), araç ve şoför atama, kapasite kontrolü (2 otobüse bölme, uygun araç önerisi), QR/sicil ile yoklama.
- **Araçlar:** araç kartı, sigorta/muayene/ruhsat/ehliyet uyarıları, bakım ve yakıt kayıtları (km/litre), Excel içe/dışa aktarma.
- **Maliyet:** araç ve hat bazında maliyet, taşeron hakedişi, kişi başı maliyet, USD/SYP/TRY kur desteği.
- **Güvenlik:** kullanıcılar ve yetkiler (yönetici/operatör/görüntüleme), işlem geçmişi, günlük otomatik yedek (IndexedDB, 30 gün), çöp kutusu.
- **Görünüm:** koyu tema, kurum rengi, açılış ekranı, Ctrl+K hızlı arama ve klavye kısayolları.
- **Yeni raporlar:** şoför durak listesi, sefer/araç listesi, yoklama-devamsızlık, aylık özet, araç belge durumu, bakım-yakıt, hakediş, QR personel kartları.

## v1.0.10 – modüler sistem
Ayarlar → **Modüller**: Seferler & Yoklama, Araçlar, Maliyet (Araçlar'a bağlı), Ana Hatlar & Harita, Şoförler, Kayıtlar açılıp kapatılabilir.
Kapalı modül menüden, Genel Durum panelinden, raporlardan, hızlı aramadan ve formlardan kalkar; verisi silinmez.
Ayar `settings.modules` içinde tutulur (`false` = kapalı). Yalnızca yönetici değiştirebilir.
