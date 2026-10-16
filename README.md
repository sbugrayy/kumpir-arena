# Kumpir Arena

Brotato'dan esinlenen, saf **HTML + CSS + JavaScript** ile yazılmış bir arena hayatta kalma (roguelite) oyunu.
Hiçbir kütüphane veya kurulum gerektirmez.

Bir patates seç, 6 silaha kadar kuşan, rotanı çiz ve 20 dalga boyunca uzaylı istilasından sağ çık. 20. dalgada üç patrondan biri seni bekliyor. İstersen bir arkadaşınla aynı klavyede oyna.

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

Sunucu üzerinden açıldığında oyun bir **PWA**'dır: tarayıcının "Uygulamayı yükle" seçeneğiyle ana ekrana eklenebilir ve bir kez açıldıktan sonra **internetsiz** de oynanır.

### GitHub Pages ile yayınlama

Oyun tamamen statik dosyalardan oluşur, derleme gerekmez:

1. Depoda **Settings → Pages** sayfasını aç.
2. **Source** olarak **Deploy from a branch**, dal olarak `main` ve klasör olarak `/ (root)` seç, kaydet.
3. Birkaç dakika sonra oyun `https://<kullanıcı-adı>.github.io/<depo-adı>/` adresinde açılır.

`.nojekyll` dosyası, GitHub'ın dosyaları olduğu gibi sunmasını sağlar. Service worker göreli yollar kullandığı için alt klasörde de çalışır.

## Kontroller

| Tuş | Tek kişi | İki kişi (aynı klavye) |
| --- | --- | --- |
| Hareket | `W` `A` `S` `D` veya ok tuşları | 1. oyuncu `WASD`, 2. oyuncu ok tuşları |
| Atılma | `Boşluk` veya `Shift` | 1. `Boşluk` / `Sol Shift`, 2. `Enter` |
| Yetenek | `E` veya `Q` | 1. `E` / `Q`, 2. `Sağ Shift` |
| Duraklat | `Esc` veya `P` | aynı |
| Geliştirme seç | `1` `2` `3` `4` | aynı |

- **Gamepad:** sol çubuk/yön tuşları hareket, `A` atılma, `X`/`Y`/`B` yetenek, `Start` duraklat. Menülerde yön tuşlarıyla gezin, `A` seç, `B` geri. İki gamepad takılırsa iki kişilik oyunda her oyuncu kendi kolunu kullanır.
- **Dokunmatik ekran:** parmağını sürükle (sanal joystick), sağ alttaki düğmelerle atıl ve yeteneğini kullan.

### Telefon ve tablet

Oyun telefonda ve tablette, dikey ya da yatay tutuşta oynanır; yatay tutuş arenayı daha geniş gösterir.

- Dokunmatik cihaz açılışta tanınır: menüde ve duraklatmada klavye yerine dokunmatik kontroller anlatılır, ilk dalgada joystick ipucu çıkar.
- Kamera küçük ekranlarda biraz daha yakındır; ekranın dışından yaklaşan düşmanlar ve patron kenarlarda okla gösterilir.
- Ekranlar çentikli telefonlarda güvenli alana göre yerleşir; dükkandaki "Haritaya Git" düğmesi kaydırırken hep görünür.
- Destekleyen tarayıcılarda menüde ve duraklatmada **Tam Ekran** düğmesi, destekleyen telefonlarda hasar alınca kısa **titreşim** vardır (ayarlardan kapatılabilir).
- Tarayıcının "Ana ekrana ekle" seçeneğiyle uygulama gibi tam ekran açılır ve internetsiz de çalışır.

Silahlar menzile giren düşmana **kendiliğinden** saldırır. Silahına tıklayıp (dükkanda ya da duraklatınca) hedef önceliğini **en yakın / en güçlü / en az canlı** olarak seçebilirsin.

## Oyunun içeriği

- **9 karakter**, her birinin kendine özgü **aktif yeteneği** var: Çok Yönlü (Patates Yağmuru), Kavgacı (Yer Sarsıntısı), Avcı (Avcı Odağı), Büyücü (Ateş Halkası), Mühendis (Acil Taret), Şanslı (Şans Zarı) ve başarımlarla açılan kural değiştiren karakterler:
  - **Haşlanmış:** silah taşıyamaz, dokunduğu düşmanı haşlar (Buhar Patlaması)
  - **Kasap:** kesici silahlar %50 güçlü, diğerleri %25 zayıf (Satır Fırtınası)
  - **Çürük:** etrafına zehir saçar ama her dalga 1 maks. can kaybeder (Zehir Bulutu)
- **Atılma:** kısa bir hamle; atılırken hasar almazsın.
- **12 silah + 6 evrim silahı**, 4 kademe. Aynı silahtan iki tane birleşir. Belirli iki silah en az III. kademedeyken bir katalizör eşyayla evrimleşir (silahlardan birine sahip olunca dükkan katalizörü çok daha sık önerir):
  Tabanca + Makineli Tüfek + Mermi Kutusu = Gatling · Ateş Asası + Pompalı + Kibrit = Alev Püskürtücü · Yumruk + Çekiç + Bileme Taşı = Deprem Eldiveni · Arbalet + Mızrak + Dürbün = Balista · Roketatar + İngiliz Anahtarı + Tornavida = Güdümlü Füze · Bıçak + Kılıç + Vampir Dişi = Vampir Kılıcı
- **55 eşya**, bunların 12'si kuralı değiştirir (Bomba Yeleği, Zincir Yıldırım, Kalkan Jeneratörü, Gölge Pelerini, Diken Zırhı, Kumbara, Sihirli Fasulye...)
- **8 silah sınıfı ve set bonusları**, 16 istatistik
- **Düşmanlar:** Bebek Uzaylı, Fırlayan, Tükürükçü, Boğa, Kabadayı, malzemeni çalıp kaçan **Hırsız**, ölünce bölünen **Pelte**, diğerlerini iyileştiren **Şifacı**, önden gelen mermiyi durduran **Kalkanlı**, ganimet veren Ağaçlar
- **Elitler** rastgele özellik taşır: Hızlı, Patlayan, Çağıran, Zırhlı, Yenilenen
- **3 patron** (20. dalgada biri rastgele): Kraliçe Zorg, Gözcü Kroz (dönen lazerler), Yumurta Ana (yumurta bırakır)
- **3 arena** (7 dalgada bir değişir): Tarla (çamur yavaşlatır), Mutfak (ocak gözleri ve yuvarlanan oklavalar), Pazar Yeri (tezgahlar engel ve siper)
- **Rota haritası:** her dalgadan sonra sıradaki durağı seç: dalga, elit dalga, olay ya da dinlenme. Düğümler **dalga değiştiricileri** taşıyabilir: Sis, Dev Uzaylılar, Kalabalık, Telaş, Altın Yağmuru, Meyve Bahçesi, Sakin Gece
- **9 olay:** Gezgin Tohumcu, Şüpheli Kutu, Yaşlı Kumpirci, Kan Bağışı, Silah Ustası, Kaçak Uzaylı, Kumarbaz Kertenkele, Yonca Tapınağı, Dilek Kuyusu
- **Tohum ve faiz:** bahçene tohum ek, birkaç dalga sonra bedava sandık hasat et. Elinde tuttuğun her 10 malzeme dalga sonunda 1 faiz getirir (en fazla 10).
- **Kumpir:** düşmanlardan kaşar, sosis, turşu, mısır gibi malzemeler düşer. 4 yuvaya koyduğun malzemeler bonus verir; doğru karışımlar **6 tarif** açar (Klasik, Acılı, Akdeniz, Bahçe, Kahvaltılık, Ortaköy Usulü). Gece **Ortaköy tezgahında** müşterilerin siparişlerini hazırlayıp malzeme kazanabilirsin.
- **Pişme evreleri:** seviye atladıkça patatesin çiğden haşlanmışa, fırına ve kumpire dönüşür. Canın azalınca yüzü telaşlanır; ölünce "Püre oldun!"
- **16 başarım**, 3'ü yeni karakter açar
- **Günlük meydan okuma:** herkes o gün aynı karakter, silah, harita, dükkan ve patronla oynar; puanını kopyalayıp paylaşabilirsin
- **Sonsuz mod:** zaferden sonra devam et; her 5 dalgada elit, her 10 dalgada patron
- **4 tehlike seviyesi** ve **kolay mod** (alınan hasar yarıya iner)
- **Erişilebilirlik:** renk körü paleti (kademeler ayrıca şekille de gösterilir), oyun hızı (%75 / %100 / %125), ekran sarsıntısı ve vuruş donması kapatılabilir
- **Müzik:** kodla üretilen dört parça: menüde *Arcade Tema*, dükkanda *Pazar Funk*, dalgada *Synthwave Aksiyon*, patronda *Karanlık Synth*. Dalga ilerledikçe katmanlar eklenir, son saniyelerde tempo hafifçe artar; patron müziği patronun canı azaldıkça sertleşir; duraklatınca müzik kısılıp boğuklaşır. Büyük vuruşlarda kısa vuruş donması vardır.
- Otomatik kayıt: dalga aralarında (dükkan, harita, olay, dinlenme dahil) kaydedilir, menüden **Devam Et** ile sürdürülür. Eski sürümün kayıtları otomatik yükseltilir.

## Proje yapısı

```
index.html             Sayfa iskeleti ve ekranlar
manifest.webmanifest   PWA tanımı
sw.js                  Çevrimdışı önbellek (service worker)
icons/                 Uygulama simgeleri (tools/make-icons.js ile üretilir)
css/style.css          Arayüz stilleri
js/util.js             Yardımcılar ve tohumlu rastgele sayı üreteci
js/data.js             Silahlar, eşyalar, karakterler, düşmanlar, olaylar, tarifler, başarımlar
js/audio.js            Üretilen ses efektleri ve müzik
js/input.js            Klavye (iki oyuncu), dokunmatik ve gamepad
js/game.js             Oyun motoru: koşu, kayıt, oyuncular, silahlar, düşmanlar, yetenekler
js/arena.js            Arenalar ve tehlikeleri
js/progress.js         Dalga arası sistemler: dükkan, evrim, harita, olaylar, tohum, faiz, kumpir, tezgah
js/meta.js             Kalıcı profil: başarımlar, kilitler, günlük meydan okuma
js/art.js              Patates, düşman, silah ve ikon çizimleri
js/render.js           Canvas çizimleri (arena, kamera, efektler)
js/ui.js               Menüler, HUD, ayarlar, başarımlar, günlük ekranı
js/ui-run.js           Seviye, sandık, tezgah, dükkan, harita, olay ve dinlenme ekranları
js/main.js             Başlatma ve ana döngü
server.js              Bağımlılıksız yerel sunucu
tools/build-single.js  Oyunu tek HTML dosyasına paketler (npm run build)
tools/make-icons.js    Simgeleri oyunun çizim koduyla üretir
tests/e2e.js           Playwright ile uçtan uca testler (npm test)
tests/bot.js           Testlerde ve denge simülasyonlarında oynayan bot
tests/balance.js       Denge simülasyonu (npm run balance)
```

## Testler

```
npm i -D playwright
npm test
```

Testler arayüzün tüm akışını tıklayarak dener (menü, kilitli karakterler, atılma ve yetenekler, hedef önceliği, seviye/sandık/tezgah/dükkan sekmeleri, rota haritası, olay ve dinlenme, kayıttan devam, eski kayıt yükseltmesi, co-op, gamepad, ayarlar, telefon görünümü; ayrıca 320 px'lik küçük telefondan tablete beş farklı ekran boyutunda taşma, çakışma ve dokunma hedefi boyutu kontrolleri), her yeni mekaniği ayrı ayrı doğrular (eşya etkileri, evrimler, yeni düşmanlar, elit özellikleri, üç patron, arenalar, değiştiriciler, olaylar, tarifler, tohumlu rastgelelik, PWA çevrimdışı açılış, tek dosya paket) ve bot ile 20 dalgalık tam koşular oynar.

`npm run balance` farklı karakter ve tehlike seviyeleriyle botun ne kadar ilerlediğini gösterir.

---

Bu proje Brotato'nun (Blobfish) resmi bir ürünü değildir; oyun mekaniklerinden esinlenen, hayran yapımı bir klondur. Tüm çizimler ve sesler kodla üretilmiştir.
