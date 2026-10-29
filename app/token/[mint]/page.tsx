import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bars } from "@/components/Bars";
import { TokenMark } from "@/components/TokenMark";
import { ageLabel, compactMint, istanbul, pct, tone, usd } from "@/lib/format";
import { COVERAGE_LABEL, RISK_LABEL, STATUS_LABEL, TIER_LABEL } from "@/lib/labels";
import { loadSnapshot } from "@/lib/loadSnapshot";
import type { TokenView } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }): Promise<Metadata> {
  const { mint } = await params;
  return { title: compactMint(mint) };
}

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  if (!MINT_RE.test(mint)) notFound();
  const { snapshot } = await loadSnapshot();
  const now = Date.now();
  const token = snapshot.tokens.find((item) => item.mint === mint) ?? null;
  const calls = snapshot.calls.filter((call) => call.mint === mint);
  const filtered = snapshot.filteredOut.find((item) => item.mint === mint) ?? null;

  return (
    <div>
      <p className="kicker">
        <Link href="/">Canlı</Link> / {token?.symbol || compactMint(mint)}
      </p>
      <section className="token-hero">
        <div className="who">
          <TokenMark symbol={token?.symbol || "?"} imageUrl={token?.imageUrl ?? calls[0]?.imageUrl ?? null} />
          <div>
            <h1>{token?.symbol || calls[0]?.symbol || "Token"}</h1>
            <p className="lede">{token?.name || calls[0]?.name || "Bu turda listede değil."}</p>
            <p className="meta mono">{mint}</p>
          </div>
        </div>
        <div className="scorebox">
          <strong>{token ? token.score : "—"}</strong>
          {token && (
            <div className="pills">
              <span className={`pill tier-${token.tier}`}>{TIER_LABEL[token.tier]}</span>
              <span className={`pill risk-${token.risk}`}>{RISK_LABEL[token.risk]}</span>
            </div>
          )}
        </div>
      </section>

      {!token && (
        <p className="fallback" style={{ marginTop: 12 }}>
          Bu mint son taramada ana listede yok.
          {filtered ? ` Elenme nedeni: ${filtered.rejectReasons.join(" ")}` : " Geçmiş çağrı varsa aşağıdadır."}
        </p>
      )}

      {token && <TokenBody token={token} now={now} />}

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Bağlantılar</h2>
        <div className="links">
          <a href={`https://dexscreener.com/solana/${token?.pairAddress || mint}`} target="_blank" rel="noreferrer">
            DexScreener
          </a>
          <a href={`https://solscan.io/token/${mint}`} target="_blank" rel="noreferrer">
            Solscan
          </a>
          <a href={`https://birdeye.so/token/${mint}?chain=solana`} target="_blank" rel="noreferrer">
            Birdeye
          </a>
          {token?.links.geckoterminal && (
            <a className="ghost" href={token.links.geckoterminal} target="_blank" rel="noreferrer">
              GeckoTerminal
            </a>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Bu tokenin çağrıları</h2>
        {calls.length === 0 ? (
          <p className="lede">Kayıtlı çağrı yok. İzleme listesinde olmak çağrı açıldığı anlamına gelmez.</p>
        ) : (
          calls.map((call) => (
            <article key={call.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
              <strong>
                {istanbul(call.calledAt)} · {STATUS_LABEL[call.status]} · {RISK_LABEL[call.risk]}
              </strong>
              <p className="meta">
                Giriş {usd(call.entryPrice)} · likidite {usd(call.entryLiquidityUsd)} · PD {usd(call.entryMarketCapUsd)}
              </p>
              <p className="meta">
                Güncel <span className={tone(call.currentPct)}>{pct(call.currentPct)}</span> · zirve{" "}
                <span className={tone(call.maxGainPct)}>{pct(call.maxGainPct)}</span> · dip{" "}
                <span className={tone(call.maxDrawdownPct)}>{pct(call.maxDrawdownPct)}</span>
                {call.closeReason ? ` · ${call.closeReason}` : ""}
              </p>
              <ul className="list">
                {call.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function TokenBody({ token, now }: { token: TokenView; now: number }) {
  const buys = token.txns.h1.buys;
  const sells = token.txns.h1.sells;
  const total = buys + sells;
  return (
    <div className="grid-2">
      <section className="panel">
        <h2>Neden bu skor</h2>
        <Bars breakdown={token.breakdown} />
        <ul className="list">
          {token.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
        {token.warnings.length > 0 && (
          <>
            <h2 style={{ marginTop: 16 }}>Uyarılar</h2>
            <ul className="list">
              {token.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </>
        )}
        {token.rejectReasons.length > 0 && (
          <>
            <h2 style={{ marginTop: 16 }}>Elenme</h2>
            <ul className="list">
              {token.rejectReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </>
        )}
      </section>
      <div style={{ display: "grid", gap: 12 }}>
        <section className="panel">
          <h2>Piyasa</h2>
          <div className="checks">
            <div className="check">
              <span>Fiyat</span>
              <b className="mono">{usd(token.priceUsd)}</b>
            </div>
            <div className="check">
              <span>5 dk / 1s / 6s / 24s</span>
              <b className="mono">
                {pct(token.priceChange.m5)} · {pct(token.priceChange.h1)} · {pct(token.priceChange.h6)} ·{" "}
                {pct(token.priceChange.h24)}
              </b>
            </div>
            <div className="check">
              <span>Hacim 1s / 24s</span>
              <b className="mono">
                {usd(token.volume.h1)} / {usd(token.volume.h24)}
              </b>
            </div>
            <div className="check">
              <span>Alım / satış 1s</span>
              <b className="mono">
                {buys} / {sells}
                {total > 0 ? ` (%${Math.round((buys / total) * 100)})` : ""}
              </b>
            </div>
            <div className="check">
              <span>Likidite</span>
              <b>{usd(token.liquidityUsd)}</b>
            </div>
            <div className="check">
              <span>PD / FDV</span>
              <b>
                {usd(token.marketCapUsd)} / {usd(token.fdvUsd)}
              </b>
            </div>
            <div className="check">
              <span>Yaş · DEX</span>
              <b>
                {ageLabel(token.pairCreatedAt, now)} · {token.dex || "—"}
              </b>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>Güvenlik · {COVERAGE_LABEL[token.safetyCoverage]}</h2>
          <SafetyList token={token} />
        </section>
      </div>
    </div>
  );
}

function yesNo(value: boolean | null, goodWhenTrue: boolean): string {
  if (value == null) return "bilinmiyor";
  const good = goodWhenTrue ? value : !value;
  return good ? "temiz" : "risk";
}

function SafetyList({ token }: { token: TokenView }) {
  const safety = token.safety;
  if (!safety) return <p className="lede">Bu turda güvenlik kaydı yok.</p>;
  return (
    <div className="checks">
      <div className="check">
        <span>Mint yetkisi</span>
        <b>{safety.mintAuthorityDisabled == null ? "bilinmiyor" : safety.mintAuthorityDisabled ? "kapalı" : "açık"}</b>
      </div>
      <div className="check">
        <span>Freeze yetkisi</span>
        <b>{safety.freezeAuthorityDisabled == null ? "bilinmiyor" : safety.freezeAuthorityDisabled ? "kapalı" : "açık"}</b>
      </div>
      <div className="check">
        <span>LP kilidi</span>
        <b>{safety.lpLockedPct == null ? "bilinmiyor" : `%${Math.round(safety.lpLockedPct)}`}</b>
      </div>
      <div className="check">
        <span>En büyük cüzdan</span>
        <b>{safety.topHolderPct == null ? "bilinmiyor" : `%${safety.topHolderPct.toFixed(1)}`}</b>
      </div>
      <div className="check">
        <span>İlk 10</span>
        <b>{safety.top10HolderPct == null ? "—" : `%${safety.top10HolderPct.toFixed(0)}`}</b>
      </div>
      <div className="check">
        <span>RugCheck risk</span>
        <b>{safety.rugcheckRisk == null ? "yok" : `${Math.round(safety.rugcheckRisk)}/100`}</b>
      </div>
      <div className="check">
        <span>Transfer ücreti</span>
        <b>{safety.transferFeePct == null ? "—" : `%${safety.transferFeePct}`}</b>
      </div>
      <div className="check">
        <span>Geliştirici bakiyesi</span>
        <b>{safety.devBalancePct == null ? "—" : `%${safety.devBalancePct.toFixed(1)}`}</b>
      </div>
      <div className="check">
        <span>Honeypot bayrağı</span>
        <b>{yesNo(!safety.dangerFlags.some((flag) => /honeypot/i.test(flag)), true)}</b>
      </div>
      {safety.dangerFlags.length > 0 && (
        <p className="reason">Tehlike: {safety.dangerFlags.join(", ")}</p>
      )}
      {safety.warnFlags.length > 0 && <p className="reason">Uyarı: {safety.warnFlags.join(", ")}</p>}
    </div>
  );
}
