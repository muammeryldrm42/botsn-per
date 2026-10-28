import { THRESHOLDS } from "./thresholds";
import type { RiskLevel, SafetyInput, ScoreInput, ScoreResult, Tier } from "./types";
import { clamp, uniq } from "./num";

function ageHours(createdAtMs: number | null, nowMs: number): number | null {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return null;
  return (nowMs - createdAtMs) / 3_600_000;
}

function scorePriceImpulse(h1: number | null): number {
  if (h1 == null) return 3;
  if (h1 <= -40) return 0;
  if (h1 < 0) return 2;
  if (h1 < 8) return 6;
  if (h1 < 35) return 12;
  if (h1 < 80) return 14;
  if (h1 < 150) return 10;
  if (h1 < 300) return 6;
  return 3;
}

function scoreShortTerm(m5: number | null): number {
  if (m5 == null) return 1;
  if (m5 <= -15) return 0;
  if (m5 < 0) return 1;
  if (m5 < 8) return 3;
  if (m5 < 25) return 5;
  if (m5 < 60) return 3;
  return 1;
}

function scoreVolumeAccel(volH1: number, volH24: number): number {
  if (volH1 <= 0) return 0;
  const baseline = volH24 > 0 ? volH24 / 24 : 0;
  if (baseline <= 0) {
    if (volH1 >= 20_000) return 8;
    if (volH1 >= 5_000) return 6;
    if (volH1 >= 1_000) return 4;
    return 2;
  }
  const ratio = volH1 / baseline;
  if (ratio >= 4 && volH1 >= 8_000) return 8;
  if (ratio >= 2 && volH1 >= 4_000) return 6;
  if (ratio >= 1 && volH1 >= 2_000) return 4;
  if (volH1 >= 1_000) return 2;
  return 1;
}

function scoreBuyPressure(buys: number, sells: number): number {
  const total = buys + sells;
  if (total < 8) return 1;
  const ratio = buys / total;
  if (ratio >= 0.68) return 8;
  if (ratio >= 0.58) return 6;
  if (ratio >= 0.5) return 4;
  if (ratio >= 0.42) return 2;
  return 0;
}

function scoreLiquidity(liq: number, mcap: number | null): number {
  let base: number;
  if (liq < THRESHOLDS.displayLiquidityUsd) base = 0;
  else if (liq < 15_000) base = 8;
  else if (liq < 40_000) base = 14;
  else if (liq < 150_000) base = 18;
  else if (liq < 400_000) base = 16;
  else if (liq < 1_500_000) base = 12;
  else base = 8;

  let bonus = 0;
  if (mcap != null && mcap > 0) {
    const depth = liq / mcap;
    if (depth >= 0.08 && depth <= 0.45) bonus = 2;
    else if (depth < 0.03) bonus = -2;
  }
  return clamp(base + bonus, 0, THRESHOLDS.weights.liquidity);
}

function scoreAge(hours: number | null): number {
  if (hours == null) return 5;
  if (hours < 0) return 5;
  if (hours < 0.25) return 6;
  if (hours < 2) return 13;
  if (hours < 12) return 15;
  if (hours < 48) return 11;
  if (hours < 24 * 7) return 7;
  if (hours < 24 * 30) return 4;
  return 2;
}

function scoreMarket(mcap: number | null, fdv: number | null): number {
  const cap = mcap ?? fdv;
  if (cap == null || cap <= 0) return 4;
  let base: number;
  if (cap < 30_000) base = 7;
  else if (cap < 150_000) base = 13;
  else if (cap < 800_000) base = 15;
  else if (cap < 3_000_000) base = 11;
  else if (cap < 15_000_000) base = 7;
  else base = 3;

  if (mcap != null && fdv != null && mcap > 0) {
    const ratio = fdv / mcap;
    if (ratio > 20) base -= 8;
    else if (ratio > 8) base -= 5;
    else if (ratio > 3) base -= 2;
  }
  return clamp(base, 0, THRESHOLDS.weights.market);
}

function isCriticalDanger(flag: string): boolean {
  return /honeypot|mint authority|freeze authority|rugged|lp unlocked/i.test(flag);
}

function scoreSafety(safety: SafetyInput | null): {
  points: number;
  reasons: string[];
  warnings: string[];
  reject: string[];
} {
  if (!safety) {
    return {
      points: 4,
      reasons: [],
      warnings: ["Güvenlik raporu yok; bu turda çağrı üretilmez."],
      reject: [],
    };
  }

  let points: number = THRESHOLDS.weights.safety;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const reject: string[] = [];

  if (safety.honeypot === true) {
    reject.push("Honeypot olarak işaretlendi.");
    points = 0;
  }
  if (safety.rugged === true) {
    reject.push("RugCheck bu tokeni rug olarak işaretlemiş.");
    points = 0;
  }

  if (safety.transferFeePct != null && safety.transferFeePct > 10) {
    reject.push(`Transfer ücreti %${trimPct(safety.transferFeePct)}; satış sıkışabilir.`);
    points -= 10;
  } else if (safety.transferFeePct != null && safety.transferFeePct > 0) {
    warnings.push(`Transfer ücreti %${trimPct(safety.transferFeePct)}.`);
    points -= 4;
  }

  if (safety.mintAuthorityDisabled === false) {
    warnings.push("Mint yetkisi açık; arz artırılabilir.");
    points -= 8;
  } else if (safety.mintAuthorityDisabled === true) {
    reasons.push("Mint yetkisi kapalı.");
  }

  if (safety.freezeAuthorityDisabled === false) {
    warnings.push("Freeze yetkisi açık; hesaplar dondurulabilir.");
    points -= 6;
  } else if (safety.freezeAuthorityDisabled === true) {
    reasons.push("Freeze yetkisi kapalı.");
  }

  if (safety.lpLockedPct != null) {
    const locked = Math.round(safety.lpLockedPct);
    if (safety.lpLockedPct >= 95) {
      reasons.push(`LP'nin %${locked} kadarı kilitli veya yakılmış.`);
    } else if (safety.lpLockedPct >= 50) {
      warnings.push(`LP kilidi kısmi (%${locked}).`);
      points -= 3;
    } else {
      warnings.push("LP'nin büyük kısmı kilitsiz.");
      points -= 6;
    }
  }

  if (safety.topHolderPct != null) {
    const top = safety.topHolderPct;
    if (top > THRESHOLDS.maxTopHolderPct) {
      reject.push(`Tek cüzdan arzın %${top.toFixed(0)} kadarını tutuyor (havuz hariç).`);
      points -= 10;
    } else if (top > 25) {
      warnings.push(`En büyük cüzdan arzın %${top.toFixed(1)} kadarını tutuyor.`);
      points -= 6;
    } else if (top > 12) {
      warnings.push(`En büyük cüzdan %${top.toFixed(1)}; yoğunlaşma var.`);
      points -= 3;
    } else {
      reasons.push(`En büyük cüzdan %${top.toFixed(1)} (havuz hariç).`);
    }
  }

  if (safety.top10HolderPct != null && safety.top10HolderPct > 60) {
    warnings.push(`İlk 10 cüzdan arzın %${safety.top10HolderPct.toFixed(0)} kadarını tutuyor.`);
    points -= 3;
  }

  if (safety.devBalancePct != null && safety.devBalancePct > 15) {
    warnings.push(`Geliştirici cüzdanı arzın %${safety.devBalancePct.toFixed(1)} kadarını tutuyor.`);
    points -= safety.devBalancePct > 30 ? 4 : 2;
    if (safety.devBalancePct > 55) {
      reject.push("Geliştirici cüzdanı arzın yarısından fazlasını tutuyor.");
    }
  }

  if (safety.devMigrations != null && safety.devMigrations >= 10) {
    reject.push(`Geliştirici ${safety.devMigrations} token migrate etmiş; seri üretici.`);
    points -= 8;
  } else if (safety.devMigrations != null && safety.devMigrations >= 3) {
    warnings.push(`Geliştirici ${safety.devMigrations} kez başka token migrate etmiş.`);
    points -= safety.devMigrations >= 6 ? 6 : 3;
  }

  if (safety.rugcheckRisk != null) {
    const risk = Math.round(safety.rugcheckRisk);
    if (safety.rugcheckRisk >= 85) {
      reject.push(`RugCheck risk skoru ${risk}/100.`);
      points -= 10;
    } else if (safety.rugcheckRisk >= 50) {
      warnings.push(`RugCheck risk skoru ${risk}/100.`);
      points -= 5;
    } else if (safety.rugcheckRisk >= 20) {
      warnings.push(`RugCheck risk skoru ${risk}/100.`);
      points -= 2;
    } else {
      reasons.push(`RugCheck risk skoru düşük (${risk}/100).`);
    }
  }

  for (const flag of safety.dangerFlags) {
    warnings.push(`RugCheck tehlike: ${flag}.`);
    points -= 4;
    if (!isCriticalDanger(flag)) continue;
    if (/lp unlocked/i.test(flag) && safety.lpLockedPct != null && safety.lpLockedPct >= 90) {
      continue;
    }
    reject.push(`RugCheck tehlike bayrağı: ${flag}.`);
  }

  if (safety.dangerFlags.length >= 2 && safety.rugcheckRisk != null && safety.rugcheckRisk >= 60) {
    reject.push("Birden fazla RugCheck tehlike bayrağı var.");
  }

  for (const flag of safety.warnFlags.slice(0, 3)) {
    warnings.push(`RugCheck uyarı: ${flag}.`);
    points -= 1;
  }

  return { points: clamp(points, 0, THRESHOLDS.weights.safety), reasons, warnings, reject };
}

function trimPct(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function classifyRisk(input: ScoreInput, rejected: boolean, nowMs: number): RiskLevel {
  if (rejected || input.priceUsd <= 0 || input.liquidityUsd < THRESHOLDS.displayLiquidityUsd) {
    return "cok_yuksek";
  }
  const safety = input.safety;
  if (!safety || input.safetyCoverage === "yok") return "cok_yuksek";

  const hours = ageHours(input.pairCreatedAtMs, nowMs);
  let pressure = 0;
  if (input.liquidityUsd < 20_000) pressure += 1;
  if (input.liquidityUsd < THRESHOLDS.callLiquidityUsd) pressure += 1;
  if (safety.topHolderPct != null && safety.topHolderPct > 20) pressure += 1;
  if (safety.topHolderPct != null && safety.topHolderPct > 30) pressure += 1;
  if (safety.mintAuthorityDisabled === false) pressure += 2;
  if (safety.freezeAuthorityDisabled === false) pressure += 2;
  if (safety.rugcheckRisk != null && safety.rugcheckRisk >= 40) pressure += 1;
  if (safety.lpLockedPct != null && safety.lpLockedPct < 80) pressure += 1;
  if (safety.dangerFlags.length) pressure += 2;
  if (safety.warnFlags.length >= 2) pressure += 1;
  if ((safety.devBalancePct ?? 0) > 25) pressure += 1;
  if ((safety.devMigrations ?? 0) >= 3) pressure += 1;
  if (hours != null && hours < 0.5) pressure += 1;

  const clean =
    input.safetyCoverage === "tam" &&
    safety.mintAuthorityDisabled === true &&
    safety.freezeAuthorityDisabled === true &&
    (safety.topHolderPct == null || safety.topHolderPct < 10) &&
    input.liquidityUsd >= 80_000 &&
    (safety.rugcheckRisk == null || safety.rugcheckRisk < 15) &&
    safety.dangerFlags.length === 0 &&
    (safety.lpLockedPct == null || safety.lpLockedPct >= 95) &&
    (hours == null || hours >= 2) &&
    pressure === 0;

  if (clean) return "dusuk";

  const structurallyOk =
    safety.mintAuthorityDisabled !== false &&
    safety.freezeAuthorityDisabled !== false &&
    (safety.topHolderPct == null || safety.topHolderPct < 18);

  if (
    input.safetyCoverage === "tam" &&
    pressure === 0 &&
    input.liquidityUsd >= 30_000 &&
    structurallyOk
  ) {
    return "orta";
  }
  if (pressure >= 4) return "cok_yuksek";
  if (input.safetyCoverage === "kismi") return pressure >= 3 ? "cok_yuksek" : "yuksek";
  return pressure >= 3 ? "cok_yuksek" : "yuksek";
}

function classifyTier(score: number, rejected: boolean, coverage: ScoreInput["safetyCoverage"]): Tier {
  if (rejected) return "elendi";
  if (coverage === "yok") return score >= THRESHOLDS.watchScore ? "izle" : "zayif";
  if (score >= THRESHOLDS.strongScore && coverage === "tam") return "guclu";
  if (score >= THRESHOLDS.callScore) return "cagri";
  if (score >= THRESHOLDS.watchScore) return "izle";
  return "zayif";
}

function momentumReasons(input: ScoreInput, momentum: number): { reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const h1 = input.priceChangeH1;
  const buys = input.buysH1;
  const sells = input.sellsH1;
  const total = buys + sells;

  if (h1 != null && h1 >= 8 && h1 < 150) {
    reasons.push(`Son 1 saatte fiyat %${h1.toFixed(0)} (erken momentum bandı).`);
  } else if (h1 != null && h1 >= 150) {
    warnings.push(`Son 1 saatte fiyat %${h1.toFixed(0)}; tepe kovalama riski yüksek.`);
  } else if (h1 != null && h1 <= -20) {
    warnings.push(`Son 1 saatte fiyat %${h1.toFixed(0)}.`);
  }

  if (input.volumeH1Usd > 0) {
    const baseline = input.volumeH24Usd > 0 ? input.volumeH24Usd / 24 : 0;
    if (baseline > 0 && input.volumeH1Usd / baseline >= 2) {
      reasons.push(
        `1 saatlik hacim, 24 saatlik ortalamanın ${(input.volumeH1Usd / baseline).toFixed(1)} katı.`,
      );
    } else if (baseline <= 0 && input.volumeH1Usd >= 5_000) {
      reasons.push("Hacim yeni paritede toplanmış; akış taze.");
    }
  }

  if (total >= 8) {
    const ratio = buys / total;
    if (ratio >= 0.58) {
      reasons.push(`Son 1 saatte işlemlerin %${Math.round(ratio * 100)} kadarı alım.`);
    } else if (ratio < 0.42) {
      warnings.push(`Son 1 saatte satış işlemleri ağırlıkta (%${Math.round((1 - ratio) * 100)}).`);
    }
  }

  if (!reasons.length && momentum >= 20) {
    reasons.push("Kısa vadeli akış olumlu.");
  }
  return { reasons, warnings };
}

/**
 * Explainable 0-100 score. Components are integers and the total is their sum.
 * A hard reject sets `rejected` and tier `elendi` without hiding the math.
 */
export function scoreToken(input: ScoreInput, nowMs: number): ScoreResult {
  const hours = ageHours(input.pairCreatedAtMs, nowMs);
  const momentum = clamp(
    scorePriceImpulse(input.priceChangeH1) +
      scoreShortTerm(input.priceChangeM5) +
      scoreVolumeAccel(input.volumeH1Usd, input.volumeH24Usd) +
      scoreBuyPressure(input.buysH1, input.sellsH1),
    0,
    THRESHOLDS.weights.momentum,
  );
  const liquidity = scoreLiquidity(input.liquidityUsd, input.marketCapUsd);
  const age = scoreAge(hours);
  const market = scoreMarket(input.marketCapUsd, input.fdvUsd);
  const safetyScore = scoreSafety(input.safety);

  const reject = [...safetyScore.reject];
  if (!Number.isFinite(input.priceUsd) || input.priceUsd <= 0) {
    reject.push("Fiyat yok veya sıfır.");
  }
  if (input.liquidityUsd < THRESHOLDS.displayLiquidityUsd) {
    reject.push(
      `Likidite ${Math.round(input.liquidityUsd).toLocaleString("tr-TR")} USD; ${THRESHOLDS.displayLiquidityUsd.toLocaleString("tr-TR")} USD altı elenir.`,
    );
  }
  if (
    input.safety?.mintAuthorityDisabled === false &&
    input.safety.freezeAuthorityDisabled === false &&
    input.liquidityUsd < 25_000
  ) {
    reject.push("Mint ve freeze yetkisi açık, likidite de zayıf.");
  }
  if (
    input.liquidityChangeH1 != null &&
    input.liquidityChangeH1 <= -70 &&
    input.priceChangeH1 != null &&
    input.priceChangeH1 <= -40
  ) {
    reject.push("Likidite ve fiyat birlikte çöküyor.");
  }

  const rejected = reject.length > 0;
  const breakdown = { momentum, liquidity, age, market, safety: safetyScore.points };
  const score = clamp(
    breakdown.momentum + breakdown.liquidity + breakdown.age + breakdown.market + breakdown.safety,
    0,
    100,
  );
  let tier = classifyTier(score, rejected, input.safetyCoverage);
  const risk = classifyRisk(input, rejected, nowMs);
  if (!rejected && hours != null && hours >= 24 * 7 && (tier === "guclu" || tier === "cagri")) {
    tier = "izle";
  }
  if (!rejected && risk === "cok_yuksek" && score < THRESHOLDS.veryHighRiskScore && (tier === "guclu" || tier === "cagri")) {
    tier = "izle";
  }
  if (tier === "guclu" && input.safety?.lpLockedPct != null && input.safety.lpLockedPct < 50) {
    tier = "cagri";
  }

  const move = momentumReasons(input, momentum);
  const reasons = uniq([...move.reasons, ...safetyScore.reasons]);
  const warnings = uniq([...safetyScore.warnings, ...move.warnings]);

  if (input.liquidityUsd >= 15_000 && input.liquidityUsd < 150_000) {
    reasons.push("Likidite, erken bir memecoin için izlenebilir derinlikte.");
  } else if (input.liquidityUsd >= THRESHOLDS.displayLiquidityUsd && input.liquidityUsd < 15_000) {
    warnings.push("Likidite ince; çıkışta kayma yüksek olabilir.");
  }

  const cap = input.marketCapUsd ?? input.fdvUsd;
  if (cap != null && cap >= 30_000 && cap < 800_000) {
    reasons.push("Piyasa değeri asimetrik bölgede.");
  } else if (cap != null && cap >= 15_000_000) {
    warnings.push("Piyasa değeri yüksek; memecoin çarpanı sınırlı.");
  }
  if (input.marketCapUsd != null && input.fdvUsd != null && input.marketCapUsd > 0) {
    const ratio = input.fdvUsd / input.marketCapUsd;
    if (ratio > 3) {
      warnings.push(`FDV, piyasa değerinin ${ratio.toFixed(1)} katı; kilit açılımı seyreltebilir.`);
    }
  }

  if (hours != null && hours >= 0.25 && hours < 12) {
    reasons.push(hours < 1 ? `Parite ${Math.round(hours * 60)} dakikalık.` : `Parite ${hours.toFixed(1)} saatlik.`);
  } else if (hours != null && hours < 0.25) {
    warnings.push("Parite 15 dakikadan yeni; veri gürültülü olabilir.");
  } else if (hours != null && hours >= 24 * 7) {
    warnings.push("Token bir haftadan eski; bu bir keşif çağrısı değil.");
  }

  if (input.safetyCoverage === "kismi") {
    warnings.push("RugCheck raporu yok; güvenlik yalnızca Jupiter denetiminden.");
  }

  return {
    score,
    tier,
    risk,
    rejected,
    rejectReasons: uniq(reject),
    breakdown,
    reasons: reasons.slice(0, 6),
    warnings: warnings.slice(0, 6),
  };
}

/** Whether this scored token may open a new call, ignoring duplicate history. */
export function passesCallGate(result: ScoreResult, input: ScoreInput): { ok: boolean; why: string[] } {
  const why: string[] = [];
  if (result.rejected) why.push("Elenme kuralına takıldı.");
  if (result.tier !== "guclu" && result.tier !== "cagri") why.push("Kademe çağrı değil.");
  if (input.safetyCoverage === "yok") why.push("Güvenlik doğrulaması yok.");
  if (result.score < THRESHOLDS.callScore) why.push(`Skor ${THRESHOLDS.callScore} altında.`);
  if (input.liquidityUsd < THRESHOLDS.callLiquidityUsd) {
    why.push(`Çağrı için likidite ${THRESHOLDS.callLiquidityUsd.toLocaleString("tr-TR")} USD altında.`);
  }
  const prints = input.buysH1 + input.sellsH1;
  if (prints < THRESHOLDS.minPrintsH1 && input.volumeH1Usd < THRESHOLDS.minVolumeH1Usd) {
    why.push("İşlem akışı yetersiz.");
  }
  if (input.safetyCoverage === "kismi" && result.score < THRESHOLDS.partialCoverageScore) {
    why.push("RugCheck olmadan çağrı eşiği daha yüksek.");
  }
  if (result.risk === "cok_yuksek") {
    const allowed =
      result.score >= THRESHOLDS.veryHighRiskScore &&
      input.safetyCoverage === "tam" &&
      !result.rejected;
    if (!allowed) why.push("Risk çok yüksek ve tam doğrulama eşiği geçilmedi.");
  }
  return { ok: why.length === 0, why };
}
