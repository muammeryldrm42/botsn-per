import { agoLabel, istanbul, pct } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

const SOURCE_LABEL: Record<string, string> = {
  jupiter_recent: "Jupiter yeni",
  jupiter_trend_5m: "Jupiter 5dk",
  jupiter_trend_1h: "Jupiter 1s",
  jupiter_traded_1h: "Jupiter hacim",
  jupiter_open_prices: "Jupiter fiyat",
  gecko_new: "Gecko yeni",
  gecko_trend: "Gecko trend",
  dex_boosts_latest: "Dex boost",
  dex_boosts_top: "Dex üst boost",
  dex_profiles: "Dex profil",
  dex_cto: "Dex CTO",
  dex_tokens: "Dex parite",
  rugcheck: "RugCheck",
};

export function StatsPanel({
  snapshot,
  now,
  source,
}: {
  snapshot: Snapshot;
  now: number;
  source: "canli" | "yedek";
}) {
  const { stats } = snapshot;
  const hit = stats.hitRate == null ? "—" : pct(stats.hitRate * 100, 0);
  return (
    <aside className="side">
      <p className="kicker">Son tarama</p>
      <h1>Canlı masa</h1>
      <p className="lede">
        {istanbul(snapshot.updatedAt)} İstanbul · {agoLabel(snapshot.updatedAt, now)}
        {snapshot.livePriceAt ? ` · canlı fiyat ${agoLabel(snapshot.livePriceAt, now)}` : ""}
      </p>
      <div className="stats">
        <div className="stat">
          <b>{stats.open}</b>
          <span>açık çağrı</span>
        </div>
        <div className="stat">
          <b>{hit}</b>
          <span>zirve +{stats.targetPct}% isabeti</span>
        </div>
        <div className="stat">
          <b>{stats.avgMaxGainPct == null ? "—" : pct(stats.avgMaxGainPct, 0)}</b>
          <span>olgun çağrıların ortalama zirvesi</span>
        </div>
        <div className="stat">
          <b>{stats.medianCurrentPct == null ? "—" : pct(stats.medianCurrentPct, 0)}</b>
          <span>medyan güncel getiri</span>
        </div>
      </div>
      <p className="hint">
        İsabet, en az 30 dakikası dolmuş veya kapanmış çağrılarda girişten sonra zirvenin +%{stats.targetPct}
        görmesidir. {stats.mature} olgun / {stats.total} toplam çağrı. {stats.rugCount} çağrı çöktü veya zirveden
        %50'den fazla geri verdi. Bu bir kazanç vaadi değil.
      </p>
      <p className="hint">
        {source === "canli" ? "Veri, data dalındaki son taramadan." : "Uzak tarama okunamadı; depodaki yedek görüntü kullanılıyor."}{" "}
        Bu tur {snapshot.meta.discovered} adaydan {snapshot.meta.scored} tanesi skorlandı, {snapshot.tokens.length}{" "}
        tanesi listede. RugCheck sorgusu: {snapshot.meta.rugcheckFetched}.
      </p>
      <div className="sources">
        {Object.entries(snapshot.sources)
          .filter(([name]) => !name.startsWith("rugcheck_"))
          .map(([name, status]) => (
            <span key={name} className="src" data-ok={status.ok} title={status.error || ""}>
              {status.ok ? "●" : "○"} {SOURCE_LABEL[name] || name}
            </span>
          ))}
      </div>
    </aside>
  );
}
