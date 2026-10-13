# Kumpir Arena

Brotato'dan esinlenen, saf **HTML + CSS + JavaScript** ile yazılmış bir arena hayatta kalma (roguelite) oyunu.
Hiçbir kütüphane veya kurulum gerektirmez.

Bir patates seç, 6 silaha kadar kuşan ve 20 dalga boyunca uzaylı istilasından sağ çık. 20. dalgada Kraliçe Zorg seni bekliyor.

## Nasıl çalıştırılır?

**En kolay yol:** `index.html` dosyasına çift tıkla. Oyun doğrudan tarayıcıda açılır.

**Yerel sunucu (localhost) ile:**

| Sistem | Komut |
| --- | --- |
| Windows | `baslat.bat` dosyasına çift tıkla |
| macOS / Linux | `./baslat.sh` |
| Node.js yüklüyse (her sistem) | `npm start` veya `node server.js --open` |
| Sadece Python varsa | `python -m http.server 8080` |

Ardından tarayıcıda **http://localhost:8080** adresini aç. Port doluysa: `node server.js --port 8081`.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| `W` `A` `S` `D` veya ok tuşları | Hareket |
| `Esc` veya `P` | Duraklat / devam et |
| `1` `2` `3` `4` | Seviye atlayınca geliştirme seç |
| Dokunmatik ekran | Parmağını ekranda sürükle (sanal joystick) |

Silahlar menzile giren en yakın düşmana **kendiliğinden** saldırır; sen sadece hareket edersin.

## Oyunun içeriği

- **6 karakter:** Çok Yönlü, Kavgacı, Avcı, Büyücü, Mühendis, Şanslı
- **12 silah**, 4 kademe (Sıradan, Nadir, Destansı, Efsanevi). Aynı silahtan aynı kademede iki tane birleştirilip bir üst kademeye çıkarılabilir.
- **8 silah sınıfı ve set bonusları** (Ateşli, Kesici, Hassas, Ağır, Alet, Elementel, Patlayıcı, Silahsız)
- **43 eşya**, 16 istatistik (maks. can, can yenilenmesi, can çalma, hasar, saldırı hızı, kritik, menzil, zırh, kaçınma, hız, şans, hasat, mühendislik...)
- **Düşmanlar:** Bebek Uzaylı, Fırlayan, Tükürükçü, Boğa (hücum eder), Kabadayı, ganimet veren Ağaçlar, 11. ve 16. dalgada Elit Muhafız, 20. dalgada üç evreli patron Kraliçe Zorg
- **Dükkan:** satın al, kilitle, yenile, sat, birleştir
- **Seviye atlama:** her seviyede 4 geliştirme arasından seçim
- **Sandıklar ve meyveler**, dalga sonunda yerde kalan malzemelerin çantaya girip sonraki dalgada iki katına çıkması
- **4 tehlike seviyesi**
- Otomatik kayıt: dalga aralarında kaydedilir, menüden **Devam Et** ile sürdürülür
- Sesler WebAudio ile üretilir (ses dosyası yok); ayarlardan ses, ekran sarsıntısı ve hasar sayıları açılıp kapatılabilir

## Proje yapısı

```
index.html          Sayfa iskeleti ve ekranlar
css/style.css       Arayüz stilleri
js/util.js          Yardımcı fonksiyonlar
js/data.js          Silahlar, eşyalar, karakterler, düşmanlar, dalga ayarları
js/audio.js         Üretilen ses efektleri
js/input.js         Klavye ve dokunmatik giriş
js/game.js          Oyun motoru (dalga simülasyonu, dükkan, seviye, kayıt)
js/render.js        Canvas çizimleri
js/ui.js            Menüler, dükkan ve gösterge paneli
js/main.js          Başlatma ve ana döngü
server.js           Bağımlılıksız yerel sunucu
tools/build-single.js  Oyunu tek HTML dosyasına paketler (npm run build)
tests/e2e.js        Playwright ile uçtan uca testler (npm test)
```

## Testler

```
npm i -D playwright
npm test
```

Testler arayüzün tüm akışını (menü, karakter/silah seçimi, duraklatma, seviye atlama, sandık, dükkanda satın alma/kilitleme/yenileme/satma/birleştirme, kayıttan devam, ölüm, telefon görünümü ve dokunmatik joystick) tıklayarak dener; ayrıca 20 dalgalık tam koşuları simüle eder.

---

Bu proje Brotato'nun (Blobfish) resmi bir ürünü değildir; oyun mekaniklerinden esinlenen, hayran yapımı bir klondur. Tüm çizimler kodla üretilmiştir.
