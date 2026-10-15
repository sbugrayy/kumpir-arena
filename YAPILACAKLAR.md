# Kumpir Arena 2.0 — Yapılacaklar listesi

Önerilen geliştirme fikirlerinin hepsi uygulandı. Her madde `tests/e2e.js` içinde ayrı testlerle doğrulanıyor (`npm test`).

- [x] **1. Altyapı: tohumlu rastgelelik ve çok oyunculu yapı** — Koşunun yapısı (harita, dükkan, seviye teklifleri, sandık, arena yerleşimi, olaylar, tezgah, patron) tohumdan üretilir; her alt sistemin kendi akışı olduğu için seviye sayısı gibi farklar dükkan sırasını kaydırmaz. Oyun motoru birden fazla oyuncuyu destekler.
- [x] **2. Atılma ve karaktere özel aktif yetenek** — `Boşluk`/`Shift` ile hasar almadan atılma; her karakterin bekleme süreli kendi yeteneği (Patates Yağmuru, Yer Sarsıntısı, Avcı Odağı, Ateş Halkası, Acil Taret, Şans Zarı, Buhar Patlaması, Satır Fırtınası, Zehir Bulutu). HUD'da bekleme göstergeli düğmeler, dokunmatik ekranda da basılabilir.
- [x] **3. Hedef önceliği** — Her silah için en yakın / en güçlü / en az canlı; dükkanda ya da duraklatınca silaha tıklayarak seçilir.
- [x] **4. Kural değiştiren eşyalar** — 12 tetiklenen eşya: Meyve Sepeti, Kumbara, Mıknatıslı Eldiven, Bomba Yeleği, Öfke Maskesi, Vampir Kolyesi, Diken Zırhı, Buz Kristali, Sihirli Fasulye, Gölge Pelerini, Zincir Yıldırım, Kalkan Jeneratörü.
- [x] **5. Silah evrimi** — 6 tarif (iki silah + katalizör eşya → efsanevi evrim silahı), dükkandaki Evrim sekmesinden.
- [x] **6. Yeni düşmanlar** — Hırsız (malzeme çalıp kaçar), Pelte (ölünce bölünür), Şifacı (diğerlerini iyileştirir), Kalkanlı (önden gelen mermiyi durdurur).
- [x] **7. Elit özellikleri** — Hızlı, Patlayan, Çağıran, Zırhlı, Yenilenen; Tehlike 2+ ve geç dalgalarda iki özellik.
- [x] **8. Üç patron** — Kraliçe Zorg, Gözcü Kroz, Yumurta Ana; koşu başında biri seçilir.
- [x] **9. Arenalar** — Tarla (çamur), Mutfak (ocak gözleri, oklavalar), Pazar Yeri (tezgahlar engel ve siper); 7 dalgada bir değişir.
- [x] **10. Rota haritası ve dalga değiştiricileri** — Dalga / elit / olay / dinlenme düğümleri; Sis, Dev Uzaylılar, Kalabalık, Telaş, Altın Yağmuru, Meyve Bahçesi, Sakin Gece.
- [x] **11. Olaylar, tohum ve faiz** — 9 olay, bahçede 3 tür tohum, her 10 malzemeye 1 faiz (en fazla 10).
- [x] **12. Kumpir malzemeleri, tarifler ve gece tezgahı** — 8 malzeme, 4 yuvalı kumpir, 6 tarif, Ortaköy tezgahında sipariş hazırlama.
- [x] **13. Pişme evreleri, telaşlı yüz, "Püre oldun!"** — Çiğ → haşlanmış → fırın → kumpir; canı azalınca telaşlı yüz.
- [x] **14. Kural değiştiren karakterler** — Haşlanmış, Kasap, Çürük.
- [x] **15. Başarımlar ve kilit açma** — 16 başarım, 3'ü karakter açar; kalıcı profil ve istatistikler.
- [x] **16. Günlük meydan okuma ve sonsuz mod** — Herkese aynı günlük koşu, puan ve paylaşım metni; zaferden sonra sonsuz mod.
- [x] **17. Aynı klavyede 2 kişilik co-op** — WASD + ok tuşları, ortak yapı, ölen oyuncu sonraki dalgada döner, kamera ikisini de gösterir.
- [x] **18. Gamepad desteği** — Oyun içinde hareket/atılma/yetenek/duraklatma, menülerde gezinme; iki gamepad ile co-op.
- [x] **19. Erişilebilirlik** — Renk körü paleti (kademeler ayrıca şekille gösterilir), oyun hızı %75/%100/%125, kolay mod.
- [x] **20. Müzik ve vuruş donması** — Menü, dükkan, dalga ve patron parçaları; kritik ve büyük vuruşlarda kısa donma (kapatılabilir).
- [x] **21. PWA ve GitHub Pages** — Manifest, simgeler, çevrimdışı önbellek; `.nojekyll` ile doğrudan GitHub Pages'te yayınlanabilir (adımlar README'de).
- [x] **22. Testler, denge simülasyonları, yayın** — Uçtan uca test paketi, test botu ve `npm run balance` denge simülasyonu; tehlike 2 ve 3 bu simülasyonlara göre sertleştirildi.

## Mobil uyum

- [x] **23. Mobil denetim** — 320×568'den 768×1024'e beş cihaz boyutunda, dikey ve yatay tüm ekranlar ölçüldü; sorunlar listelendi.
- [x] **24. Dokunmatik algılama** — Dokunmatik cihaz açılışta tanınır; menü, yardım ve duraklatmada dokunmatik kontroller anlatılır, klavye ipuçları gizlenir.
- [x] **25. Duyarlı düzen** — Çentik güvenli alanları, alçak yatay ekranlar için sıkı düzen, telefonda 2 sütunlu seviye ve tehlike kartları, kaydırırken hep görünen "Haritaya Git", yetenek düğmeleriyle çakışmayan bildirimler, dar ekranda çakışmayan harita etiketleri, dokunmatikte hover izi bırakmayan kartlar, çift dokunma yakınlaştırmasının ve uzun basma menüsünün engellenmesi.
- [x] **26. Mobil oynanış** — Dokunmatik cihazlarda daha yakın kamera, ekran dışındaki düşmanlar ve patron için kenar okları, ilk dalgada joystick ipucu, dikey tutuşta yan çevirme önerisi.
- [x] **27. Tam ekran ve titreşim** — Destekleyen tarayıcılarda tam ekran düğmesi; hasar alınca kısa titreşim (ayardan kapatılabilir); iOS'ta ana ekrana eklenince uygulama gibi açılma.
- [x] **28. Mobil testler** — Beş cihaz boyutunda taşma, çakışma, dokunma hedefi, yapışkan düğme, kamera, kenar oku, titreşim ve tam ekran testleri.

## Müzik

- [x] **29. Seçilen arka plan müzikleri** — Dinleme sayfasında seçilen parçalar oyuna eklendi: Menü *Arcade Tema*, Dükkan *Pazar Funk*, Dalga *Synthwave Aksiyon*, Patron *Karanlık Synth*. Her biri 8 ölçüye (A + B bölümü) uzatıldı; dalga yoğunluğuna göre katmanlar, patronun canına göre sertleşme, yumuşak parça geçişleri, duraklatınca boğuk ses. Ses seviyesi çevrimdışı ölçümle eski müziğe göre dengelendi.
