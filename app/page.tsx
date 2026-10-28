import { SignalBoard } from "@/components/SignalBoard";
import { StatsPanel } from "@/components/StatsPanel";
import { agoLabel } from "@/lib/format";
import { loadSnapshot } from "@/lib/loadSnapshot";

export const revalidate = 60;

export default async function HomePage() {
  const { snapshot, source } = await loadSnapshot();
  const now = Date.now();
  const ageMin = (now - Date.parse(snapshot.updatedAt)) / 60_000;
  const stale = Number.isFinite(ageMin) && ageMin > 20;

  return (
    <div className="layout">
      <StatsPanel snapshot={snapshot} now={now} source={source} />
      <div>
        <p className="kicker">Sinyaller</p>
        <h2 style={{ fontSize: "1.6rem", marginBottom: 8 }}>Skoru açıklanan Solana adayları</h2>
        <p className="lede" style={{ marginBottom: 14 }}>
          Liste {agoLabel(snapshot.updatedAt, now)} yenilendi. Güçlü çağrı ve çağrı, geçmişe işlenir; izle yalnızca
          izleme listesidir.
        </p>
        {stale && (
          <p className="stale">
            Son tarama {Math.round(ageMin)} dakikadan eski. GitHub Actions içindeki “Solana tarama” işi gecikmiş veya
            henüz hiç çalışmamış olabilir.
          </p>
        )}
        {source === "yedek" && (
          <p className="fallback">Canlı data dalı okunamadı. Panel, repoya gömülü son yedek görüntüyü gösteriyor.</p>
        )}
        {snapshot.tokens.length === 0 ? (
          <div className="empty">
            Henüz listelenecek token yok. İlk tarama bittikten sonra bu sayfa dolar. Actions sekmesinden “Solana
            tarama” işini bir kez elle çalıştırman yeterli.
          </div>
        ) : (
          <SignalBoard tokens={snapshot.tokens} filteredOut={snapshot.filteredOut} now={now} />
        )}
        <footer>
          Fiyat değişimleri öncelik sırasıyla DexScreener, GeckoTerminal ve Jupiter'dan gelir. Ücretli DexScreener
          vitrini skora puan eklemez.
        </footer>
      </div>
    </div>
  );
}
