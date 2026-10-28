"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ageLabel, pct, tone, usd } from "@/lib/format";
import { RISK_LABEL, STATUS_LABEL } from "@/lib/labels";
import type { CallRecord, CallStatus } from "@/lib/types";

export function CallTable({ calls, now }: { calls: CallRecord[]; now: number }) {
  const [status, setStatus] = useState<"hepsi" | CallStatus>("hepsi");
  const rows = useMemo(
    () => calls.filter((call) => (status === "hepsi" ? true : call.status === status)),
    [calls, status],
  );

  if (!calls.length) {
    return (
      <div className="empty">
        Henüz kayıtlı çağrı yok. Tarayıcı, skoru ve güvenlik eşiğini geçen token bulunca burada giriş fiyatı ve
        sonraki performansı birikir.
      </div>
    );
  }

  return (
    <div>
      <div className="chips" role="toolbar" aria-label="Çağrı durumu">
        {(
          [
            ["hepsi", "Tümü"],
            ["acik", "Açık"],
            ["kapandi", "Kapandı"],
            ["coktu", "Çöktü"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className="chip" data-on={status === id} type="button" onClick={() => setStatus(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>Token</th>
              <th>Giriş</th>
              <th>Güncel</th>
              <th>Zirve</th>
              <th>Dip</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((call) => (
              <tr key={call.id}>
                <td>
                  <Link href={`/token/${call.mint}`}>
                    <strong>{call.symbol}</strong>
                  </Link>
                  <div className="meta">
                    skor {call.score} · {RISK_LABEL[call.risk]} · {ageLabel(call.calledAt, now)} önce açıldı
                  </div>
                </td>
                <td className="mono">{usd(call.entryPrice)}</td>
                <td className={`mono ${tone(call.currentPct)}`}>{pct(call.currentPct)}</td>
                <td className={`mono ${tone(call.maxGainPct)}`}>{pct(call.maxGainPct)}</td>
                <td className={`mono ${tone(call.maxDrawdownPct)}`}>{pct(call.maxDrawdownPct)}</td>
                <td>
                  {STATUS_LABEL[call.status]}
                  {call.closeReason ? <div className="meta">{call.closeReason}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cards">
        {rows.map((call) => (
          <article key={call.id} className="call-card">
            <Link href={`/token/${call.mint}`}>{call.symbol}</Link>
            <div className="meta">
              {STATUS_LABEL[call.status]} · {RISK_LABEL[call.risk]} · skor {call.score}
            </div>
            <div className="meta">
              Giriş {usd(call.entryPrice)} · güncel <span className={tone(call.currentPct)}>{pct(call.currentPct)}</span>{" "}
              · zirve <span className={tone(call.maxGainPct)}>{pct(call.maxGainPct)}</span> · dip{" "}
              <span className={tone(call.maxDrawdownPct)}>{pct(call.maxDrawdownPct)}</span>
            </div>
            <div className="reason">{call.reasons[0]}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
