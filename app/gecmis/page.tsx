import type { Metadata } from "next";
import { CallTable } from "@/components/CallTable";
import { pct } from "@/lib/format";
import { loadSnapshot } from "@/lib/loadSnapshot";

export const metadata: Metadata = { title: "Çağrı geçmişi" };
export const revalidate = 60;

export default async function HistoryPage() {
  const { snapshot } = await loadSnapshot();
  const now = Date.now();
  const { stats } = snapshot;
  return (
    <div>
      <p className="kicker">Geçmiş</p>
      <h1>Çağrıların karnesi</h1>
      <p className="lede" style={{ maxWidth: 680 }}>
        Bir çağrı açılınca giriş fiyatı kilitlenir. Sonraki taramalar güncel fiyatı, görülen zirveyi ve dibi yazar.
        Çağrı 48 saat sonra kapanır. Likidite çökerse veya rug işareti gelirse durum “çöktü” olur. +{stats.targetPct}%
        zirve bir isabet sayılır; bu, kâra geçmek anlamına gelmez.
      </p>
      <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", margin: "16px 0 18px" }}>
        <div className="stat">
          <b>{stats.total}</b>
          <span>toplam çağrı</span>
        </div>
        <div className="stat">
          <b>{stats.open}</b>
          <span>açık</span>
        </div>
        <div className="stat">
          <b>{stats.hitRate == null ? "—" : pct(stats.hitRate * 100, 0)}</b>
          <span>isabet ({stats.hitCount}/{stats.mature})</span>
        </div>
        <div className="stat">
          <b>{stats.rugCount}</b>
          <span>çöken veya −%50 dip</span>
        </div>
      </div>
      <div className="panel">
        <CallTable calls={snapshot.calls} now={now} />
      </div>
    </div>
  );
}
