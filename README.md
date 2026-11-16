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
    node bump.js 1.0.1 "Değişiklik notu"
    git add -A && git commit -m "v1.0.1" && git push

`www/seed.json` (personel başlangıç verisi) depoya gönderilmez.
