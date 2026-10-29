# PER — Solana memecoin çağrı masası

PER, yalnızca **Solana** memecoin'lerini halka açık ve anahtarsız verilerle tarayan bir sinyal panosudur. Yeni ve hareketlenen pariteleri toplar, her token için açıklanabilir bir skor üretir, eşiği geçenlere **çağrı** açar ve bu çağrıların girişten sonraki zirve / dip performansını tutar.

Bu bir alım-satım botu değildir ve **yatırım tavsiyesi değildir**. Memecoin'lerde yatırdığın tutarın tamamını kaybedebilirsin.

## Ne görürsün

- **Canlı masa:** skor, risk, 5 dk / 1 saat değişim, likidite, piyasa değeri, kısa gerekçe. Filtre ve sıralama tarayıcıda çalışır.
- **Token sayfası:** puanın beş parçası, uyarılar, mint / freeze / LP / holder / RugCheck dökümü, DexScreener, Solscan ve Birdeye linkleri.
- **Geçmiş:** açılan çağrıların giriş fiyatı, güncel getiri, görülen zirve ve dip. İsabet tanımı: olgun çağrılarda zirvenin **+%25** olması. Panel bunu kazanç gibi sunmaz.

Skorun ayrıntısı uygulamadaki [Yöntem](/yontem) sayfasında ve `lib/score.ts` içindedir.

## Veri kaynakları

Hepsi anahtarsızdır. Hesap, API anahtarı veya gizli değişken gerekmez.

| Kaynak | Ne için | Uç |
| --- | --- | --- |
| Jupiter lite | Yeni, trend ve hacimli token listesi; mint/freeze denetimi; holder ve geliştirici bakiyesi; fiyat tazeleme | `https://lite-api.jup.ag` |
| GeckoTerminal | Yeni ve trend Solana havuzları, işlem sayısı, likidite, yaş | `https://api.geckoterminal.com` |
| DexScreener | Boost / profil / CTO listeleri (keşif) ve parite özeti. Ücretli vitrin skora puan **eklemez** | `https://api.dexscreener.com` |
| RugCheck | Kısa listedeki tokenler için rug, LP kilidi, holder ve tehlike bayrakları | `https://api.rugcheck.xyz` |

pump.fun sitesi bot koruması istediği için doğrudan kullanılmaz. Pump üstünde açılan tokenler Jupiter ve GeckoTerminal listelerinden gelir. Halka açık Solana RPC kullanılmaz; yetki ve cüzdan yoğunluğu Jupiter denetimi ile RugCheck'ten okunur, böylece RPC kotasına bağımlı kalınmaz.

İsteklerde zaman aşımı vardır. 429 ve 5xx yanıtlarında bekleme artar. RugCheck, tur başına sınırlı sayıda token için ve aralıklı çağrılır; sonucu snapshot içinde yaklaşık 40 dakika önbelleğe alınır. Bir kaynak düşerse tarama diğerleriyle devam eder. Hepsi birden düşerse eski snapshot'ın üzerine yazılmaz.

## 24 saat nasıl döner

İki sınır yüzünden tempo siteye alındı:

- Vercel Hobby cron'u günde birden sık çalışamaz. Daha sık ifade deploy'u düşürür.
- GitHub `schedule: */5` bu repoda saatlerce hiç tur başlatmadı. GitHub bu kuyruğu garanti etmez; yoğunlukta işi geciktirir veya sessizce atlar.

Site açıkken veri en fazla iki dakika eskidir. Kayıt daha eskiyse Vercel fonksiyonu taramayı kendisi yapar (Hobby süre sınırı 300 saniye, bu tarama onun altında kalır). Çağrı geçmişi, anahtar gerektirmeyen Vercel runtime cache'e yazılır. Bu önbellek deploy ile silinmez. Aynı mint için on iki saat içindeki çift çağrılar tek kayıtta birleşir.

GitHub Actions yedektir. `17 * * * *` tetikleyicisi uzun bir döngü başlatır: yaklaşık 5,5 saat boyunca 3 dakikada bir tarar ve `data` dalındaki tek `snapshot.json` dosyasına yazar. Ziyaret olmasa da dosya taze kalır. Döngü düşünce site yine kendi taramasına döner. `data` dalını production branch yapma.

Ortam değişkeni yok.

## Vercel'e kurma

Ortam değişkeni yok. Root dizin repo kökü. Framework Next.js.

1. Bu pull request'i `main` dalına birleştir.
2. [vercel.com/login](https://vercel.com/login) adresine GitHub hesabınla gir.
3. [vercel.com/new](https://vercel.com/new) sayfasını aç.
4. **Import Git Repository** altında `muammeryldrm42/botsn-per` reposunu seç. Listede yoksa **Adjust GitHub App Permissions** ile bu repoya erişim ver, sonra geri dön.
5. **Framework Preset** olarak **Next.js** kalsın. **Root Directory** `./` olsun.
6. **Environment Variables** bölümüne hiçbir şey ekleme.
7. Production branch `main` olsun. `data` dalını seçme.
8. **Deploy** düğmesine bas. Proje zaten bağlıysa `main`'e birleştirmek yayını kendisi yapar; bu adımları tekrarlama.
9. Siteyi aç. İlk açılış taramayı kendisi bitirir ve üstte son tarama saati görünür. Kimse tıklamadan da sayfa taze kalır.
10. İsteğe bağlı: GitHub → **Actions** → **Solana tarama** → **Run workflow**. Bu, ziyaret olmasa da `data` dalını güncelleyen yedek döngüyü hemen başlatır. Site için zorunlu değildir.

Yerelde:

```bash
npm install
npm test
npm run scan
npm run dev
```

`npm run scan` ağa çıkar ve `data/snapshot.json` dosyasını yazar.

## Test

`npm test` skor kapılarını, elenen rug / honeypot / ince likidite hallerini, çağrı performansını (zirve, dip, 48 saat, çöküş) ve kaynak ayrıştırıcılarını çalıştırır. Ağ gerekmez. `npm run typecheck` tipi denetler.
