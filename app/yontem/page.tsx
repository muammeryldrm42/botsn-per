import type { Metadata } from "next";
import { THRESHOLDS } from "@/lib/thresholds";

export const metadata: Metadata = { title: "Yöntem" };

export default function MethodPage() {
  const w = THRESHOLDS.weights;
  return (
    <article className="panel" style={{ display: "grid", gap: 16 }}>
      <div>
        <p className="kicker">Yöntem</p>
        <h1>Skor nasıl kuruluyor</h1>
        <p className="lede">
          Toplam 100 puan beş parçadan gelir: momentum {w.momentum}, likidite {w.liquidity}, yaş {w.age}, piyasa{" "}
          {w.market}, güvenlik {w.safety}. Parçalar tam sayıdır ve toplam skordur. Elinen tokenin puanı gizlenmez;
          neden elendiği ayrıca yazılır.
        </p>
      </div>

      <section>
        <h2>Momentum ({w.momentum})</h2>
        <p>
          1 saatlik fiyat değişiminde tatlı bölge yaklaşık %8 ile %80 arasındadır. Daha dik mumlar puan kaybeder;
          tepe kovalamak ödüllendirilmez. 5 dakikalık değişim kısa bir ek puan verir. 1 saatlik hacim, 24 saatlik
          saate bölünmüş ortalamanın üstündeyse hızlanma sayılır. Alım işlemlerinin payı %58'i geçince alım baskısı
          puanı artar, %42'nin altında uyarı düşer.
        </p>
      </section>

      <section>
        <h2>Likidite ({w.liquidity})</h2>
        <p>
          {THRESHOLDS.displayLiquidityUsd.toLocaleString("tr-TR")} USD altı listeye çağrı olarak girmez. 15–150 bin
          USD bandı en yüksek puanı alır; çok ince havuzda çıkış kayması, çok derin ve yaşlı havuzda ise asimetri
          azalır. Likidite / piyasa değeri 0,08 ile 0,45 arasındaysa küçük bir derinlik puanı eklenir.
        </p>
      </section>

      <section>
        <h2>Yaş ({w.age}) ve piyasa ({w.market})</h2>
        <p>
          15 dakika ile 12 saat arası pariteler en yüksek yaş puanını alır. 15 dakikadan yeni parite gürültülüdür, bir
          haftadan eski token keşif çağrısı değildir. Piyasa değeri kabaca 150–800 bin USD bandı asimetrik bölge
          sayılır. FDV, dolaşımdaki değerin 3 katını aşarsa puan kırpılır.
        </p>
      </section>

      <section>
        <h2>Güvenlik ({w.safety})</h2>
        <p>
          Başlangıç {w.safety} puandır. Mint veya freeze yetkisi açıksa, LP kilidi zayıfsa, tek cüzdan (havuz ve AMM
          hariç) arzın önemli kısmını tutuyorsa, transfer ücreti varsa veya RugCheck tehlike bayrağı düşmüşse puan
          iner. RugCheck <code>score_normalised</code> yüksekse risk artar; bu ölçekte yüksek kötü demektir.
        </p>
        <p>Doğrudan elenir:</p>
        <ul className="list">
          <li>Likidite {THRESHOLDS.displayLiquidityUsd.toLocaleString("tr-TR")} USD altında</li>
          <li>Honeypot veya rug işareti</li>
          <li>Transfer ücreti %10 üzerinde</li>
          <li>Tek cüzdan %{THRESHOLDS.maxTopHolderPct} üzerinde</li>
          <li>Mint ve freeze birlikte açık ve likidite 25 bin USD altında</li>
          <li>Geliştiricinin rug geçmişi, açık mint/freeze yetkisi, honeypot veya kilitsiz LP bayrağı</li>
          <li>Likidite ve fiyatın aynı saatte birlikte çökmesi</li>
          <li>25 milyon USD üstü ve 14 günden yaşlı yerleşik varlıklar (LST, stable, büyük altyapı tokenleri zaten dışarıda)</li>
        </ul>
      </section>

      <section>
        <h2>Çağrı kapısı</h2>
        <p>
          Bir haftadan eski parite çağrı olmaz; listede kalsa bile kademesi en fazla izledir. Geliştirici 10 veya daha fazla
          token migrate ettiyse aday elenir. Çağrı için skor en az {THRESHOLDS.callScore}, likidite en az{" "}
          {THRESHOLDS.callLiquidityUsd.toLocaleString("tr-TR")} USD, son 1 saatte en az {THRESHOLDS.minPrintsH1} işlem
          veya {THRESHOLDS.minVolumeH1Usd.toLocaleString("tr-TR")} USD hacim gerekir. Kademe “güçlü” veya “çağrı”
          değilse kayıt açılmaz. Güvenlik hiç yoksa çağrı
          açılmaz. Yalnızca Jupiter denetimi varsa eşik {THRESHOLDS.partialCoverageScore} puana çıkar ve kademe
          “güçlü” olamaz. Çok yüksek risk, tam RugCheck doğrulaması ve en az {THRESHOLDS.veryHighRiskScore} puan
          ister. Aynı mint için açık çağrı varken veya son {THRESHOLDS.callWindowHours} saat içinde kapanmış çağrı
          varken yenisi açılmaz. İzleme eşiği {THRESHOLDS.watchScore} puandır; izle, geçmişe çağrı olarak yazılmaz.
        </p>
        <p>
          Risk etiketi dürüst tutulur. Memecoin'de “düşük risk” ancak mint ve freeze kapalı, LP kilitli, RugCheck
          skoru düşük, likidite 80 bin USD üstü ve yoğunlaşma azsa kullanılır. Çoğu çağrı yüksek risklidir.
        </p>
      </section>

      <section>
        <h2>Veri ve 24 saat çalışma</h2>
        <p>
          Keşif Jupiter'ın anahtarsız token listelerinden (yeni, trend, hacim), GeckoTerminal'ın yeni ve trend
          havuzlarından ve DexScreener'ın halka açık boost / profil listelerinden gelir. Parite ayrıntısı
          DexScreener token ucundan doldurulur. Güvenlik, kısa liste için RugCheck raporundan ve Jupiter denetim
          alanlarından okunur. pump.fun ön yüzü bot koruması arkasında olduğu için doğrudan kullanılmaz; pump
          tokenleri Jupiter ve GeckoTerminal üzerinden gelir. Halka açık Solana RPC kullanılmaz; yetki ve holder
          verisi bu iki kaynaktan gelir, böylece RPC kotasına takılınmaz.
        </p>
        <p>
          Site, kayıt iki dakikadan eskiyse taramayı kendi sunucusunda yapar. Sonuç Vercel'in anahtarsız çalışma
          önbelleğine yazılır; çağrı geçmişi bir sonraki istekte oradan okunur ve yeni deploy ile silinmez. GitHub
          Actions yedektir: <code>*/5</code> zamanlaması bu repoda saatlerce atlandığı için iş, başladığında yaklaşık
          5,5 saat boyunca 3 dakikada bir tarar ve <code>data</code> dalına yazar. Ziyaret olmasa da o döngü dosyayı
          taze tutar. Döngü düşerse site yine kendi taramasına döner.
        </p>
        <p>
          İstekler zaman aşımı, 429/5xx için artan bekleme ve RugCheck için token başına kısa ara ile sınırlıdır.
          Bir kaynak düşerse diğerleri devam eder. Hepsi düşerse eski snapshot'ın üzerine yazılmaz.
        </p>
      </section>
    </article>
  );
}
