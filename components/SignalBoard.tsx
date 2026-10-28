"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ageLabel, pct, tone, usd } from "@/lib/format";
import { RISK_LABEL, TIER_LABEL } from "@/lib/labels";
import type { FilteredOut, Tier, TokenView } from "@/lib/types";
import { TokenMark } from "./TokenMark";

type TierFilter = "aktif" | Tier | "hepsi";
type SortKey = "skor" | "h1" | "hacim" | "likidite" | "yeni";

const TIER_FILTERS: { id: TierFilter; label: string }[] = [
  { id: "aktif", label: "İzle ve üstü" },
  { id: "guclu", label: "Güçlü" },
  { id: "cagri", label: "Çağrı" },
  { id: "izle", label: "İzle" },
  { id: "hepsi", label: "Tümü" },
];

export function SignalBoard({
  tokens,
  filteredOut,
  now,
}: {
  tokens: TokenView[];
  filteredOut: FilteredOut[];
  now: number;
}) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<TierFilter>("aktif");
  const [hideExtreme, setHideExtreme] = useState(false);
  const [minLiq, setMinLiq] = useState(0);
  const [sort, setSort] = useState<SortKey>("skor");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = tokens.filter((token) => {
      if (q && !`${token.symbol} ${token.name}`.toLowerCase().includes(q)) return false;
      if (tier === "aktif" && (token.tier === "zayif" || token.tier === "elendi")) return false;
      if (tier !== "aktif" && tier !== "hepsi" && token.tier !== tier) return false;
      if (hideExtreme && token.risk === "cok_yuksek") return false;
      if (token.liquidityUsd < minLiq) return false;
      return true;
    });
    const value = (token: TokenView) => {
      if (sort === "h1") return token.priceChange.h1 ?? -9999;
      if (sort === "hacim") return token.volume.h1;
      if (sort === "likidite") return token.liquidityUsd;
      if (sort === "yeni") return token.pairCreatedAt ? Date.parse(token.pairCreatedAt) : 0;
      return token.score;
    };
    return rows.sort((a, b) => value(b) - value(a));
  }, [tokens, query, tier, hideExtreme, minLiq, sort]);

  return (
    <section>
      <div className="toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Sembol veya isim"
          aria-label="Token ara"
        />
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sırala">
          <option value="skor">Sıra: skor</option>
          <option value="h1">Sıra: 1s değişim</option>
          <option value="hacim">Sıra: 1s hacim</option>
          <option value="likidite">Sıra: likidite</option>
          <option value="yeni">Sıra: en yeni</option>
        </select>
        <select
          value={String(minLiq)}
          onChange={(event) => setMinLiq(Number(event.target.value))}
          aria-label="Minimum likidite"
        >
          <option value="0">Likidite: hepsi</option>
          <option value="8000">≥ $8K</option>
          <option value="15000">≥ $15K</option>
          <option value="40000">≥ $40K</option>
        </select>
      </div>
      <div className="chips" role="toolbar" aria-label="Filtreler">
        {TIER_FILTERS.map((item) => (
          <button key={item.id} className="chip" data-on={tier === item.id} onClick={() => setTier(item.id)} type="button">
            {item.label}
          </button>
        ))}
        <button className="chip" data-on={hideExtreme} onClick={() => setHideExtreme((value) => !value)} type="button">
          Çok yüksek riski gizle
        </button>
      </div>
      <div className="feed" style={{ marginTop: 12 }}>
        {visible.length === 0 ? (
          <div className="empty">Bu filtrede token yok. Eşiği gevşet veya bir sonraki taramayı bekle.</div>
        ) : (
          visible.map((token) => <SignalRow key={token.mint} token={token} now={now} />)
        )}
      </div>
      {filteredOut.length > 0 && (
        <details>
          <summary>Bu turda elenen {filteredOut.length} örnek (likiditesi eşiğin üstünde)</summary>
          <div className="feed" style={{ marginTop: 10 }}>
            {filteredOut.map((token) => (
              <Link key={token.mint} href={`/token/${token.mint}`} className="row">
                <div className="who">
                  <div className="copy">
                    <div className="symbol">{token.symbol}</div>
                    <div className="name">{token.name}</div>
                    <div className="reason">{token.rejectReasons.join(" ")}</div>
                  </div>
                </div>
                <div className="scorebox">
                  <strong>{token.score}</strong>
                  <div className="meta">{usd(token.liquidityUsd)} likidite</div>
                </div>
              </Link>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function SignalRow({ token, now }: { token: TokenView; now: number }) {
  const buyTotal = token.txns.h1.buys + token.txns.h1.sells;
  const buyPct = buyTotal > 0 ? Math.round((token.txns.h1.buys / buyTotal) * 100) : null;
  return (
    <Link href={`/token/${token.mint}`} className="row">
      <div className="who">
        <TokenMark symbol={token.symbol} imageUrl={token.imageUrl} />
        <div className="copy">
          <div className="symbol">{token.symbol}</div>
          <div className="name">{token.name}</div>
          <div className="meta">
            <span className={tone(token.priceChange.h1)}>{pct(token.priceChange.h1)} 1s</span>
            {" · "}
            <span className={tone(token.priceChange.m5)}>{pct(token.priceChange.m5)} 5dk</span>
            {" · "}
            {usd(token.liquidityUsd)} likidite · {usd(token.marketCapUsd ?? token.fdvUsd)} PD · {ageLabel(token.pairCreatedAt, now)}
            {buyPct != null ? ` · alım %${buyPct}` : ""}
          </div>
          <div className="reason">{token.reasons[0] || token.warnings[0] || "Skor ayrıntısı detayda."}</div>
        </div>
      </div>
      <div className="scorebox">
        <strong>{token.score}</strong>
        <div className="pills">
          <span className={`pill tier-${token.tier}`}>{TIER_LABEL[token.tier]}</span>
          <span className={`pill risk-${token.risk}`}>{RISK_LABEL[token.risk]}</span>
          {token.openCall?.status === "acik" && <span className="pill">Açık çağrı {pct(token.openCall.currentPct)}</span>}
        </div>
      </div>
    </Link>
  );
}
