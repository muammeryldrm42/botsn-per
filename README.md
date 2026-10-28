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

Vercel Hobby cron'u günde bir kezle sınırlıdır ve sürekli tarama için uygun değildir. Kalıcı kayıt da sunucusuz fonksiyonun belleğinde durmaz. Bu yüzden tarama **GitHub Actions** üzerinde çalışır:

1. `.github/workflows/scan.yml` her 5 dakikada bir (ve elle) `npm test` ardından `scripts/scan.ts` çalıştırır.
2. Script önceki `snapshot.json` dosyasını okur, yeni turu bunun üstüne işler, çağrı geçmişini taşır.
3. Sonuç, `main` dalına değil **`data`** dalındaki tek `snapshot.json` dosyasına yazılır. Dal her seferinde tek commit'tir; git geçmişi şişmez. Çağrıların hafızası dosyanın içindedir.
4. Vercel'deki Next.js uygulaması bu dosyayı `https://raw.githubusercontent.com/muammeryldrm42/botsn-per/data/snapshot.json` adresinden okur. Sonuç 60 saniye önbelleğe alınır. Yeni dalda bu adres kısa süre 404 önbelleğine takılırsa aynı dosya, anahtarsız GitHub içerik ucundan alınır (`api.github.com`, beş dakika önbellek; saatlik kotayı zorlamamak için). O da olmazsa repodaki gömülü görüntü kullanılır. Tarama 3 dakikadan eskiyse görünen fiyat Jupiter ile tazelenir; asıl kayıt yine Actions'tadır.
5. Repodaki `data/snapshot.json` yalnızca yedektir. `data` dalı okunamazsa panel onu gösterir.

GitHub, ücretsiz depolarda cron'u yoğunlukta birkaç dakika geciktirebilir. Repo herkese açıktır; Vercel gizli token olmadan ham dosyayı okuyabilir. `data` dalını Vercel'de production branch yapma. Production **`main`** kalmalı.

Zamanlanmış iş, workflow dosyası `main` dalında olduktan sonra çalışır. Yeni repolarda Actions ilk seferde elle açılmayı isteyebilir.

## Vercel'e kurma

Ortam değişkeni yok. Root dizin repo kökü. Framework Next.js.

1. Bu pull request'i `main` dalına birleştir.
2. [vercel.com/login](https://vercel.com/login) adresine GitHub hesabınla gir.
3. [vercel.com/new](https://vercel.com/new) sayfasını aç.
4. **Import Git Repository** altında `muammeryldrm42/botsn-per` reposunu seç. Listede yoksa **Adjust GitHub App Permissions** ile bu repoya erişim ver, sonra geri dön.
5. **Framework Preset** olarak **Next.js** kalsın. **Root Directory** `./` olsun.
6. **Environment Variables** bölümüne hiçbir şey ekleme.
7. Production branch `main` olsun. `data` dalını seçme.
8. **Deploy** düğmesine bas.
9. Deploy bitince GitHub'da repoyu aç → **Actions** → **Solana tarama**.
10. Actions kapalıysa **I understand my workflows, go ahead and enable them** düğmesine bas.
11. Sağdaki **Run workflow** menüsünü aç, branch `main` kalsın, **Run workflow** de. İlk tur bir iki dakika sürer.
12. Siteyi aç. Üstte son tarama saati görünür. Bundan sonra aynı iş yaklaşık her 5 dakikada bir `data` dalını günceller; Vercel her turda yeniden derlenmez.

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
