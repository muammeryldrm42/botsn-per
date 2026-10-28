import type { CallStatus, RiskLevel, Tier } from "./types";

export const TIER_LABEL: Record<Tier, string> = {
  guclu: "Güçlü çağrı",
  cagri: "Çağrı",
  izle: "İzle",
  zayif: "Zayıf",
  elendi: "Elendi",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  dusuk: "Düşük risk",
  orta: "Orta risk",
  yuksek: "Yüksek risk",
  cok_yuksek: "Çok yüksek risk",
};

export const STATUS_LABEL: Record<CallStatus, string> = {
  acik: "Açık",
  kapandi: "Kapandı",
  coktu: "Çöktü",
};

export const COVERAGE_LABEL = {
  yok: "Güvenlik doğrulanmadı",
  kismi: "Kısmi güvenlik (Jupiter denetimi)",
  tam: "RugCheck + denetim",
} as const;

export const BREAKDOWN_META = [
  { key: "momentum", label: "Momentum", max: 35, hint: "Fiyat ivmesi, hacim hızlanması, alım/satım" },
  { key: "liquidity", label: "Likidite", max: 20, hint: "Havuz derinliği ve piyasa değerine oranı" },
  { key: "age", label: "Yaş", max: 15, hint: "Paritenin ne kadar süredir işlem gördüğü" },
  { key: "market", label: "Piyasa", max: 15, hint: "Piyasa değeri ve FDV seyrelmesi" },
  { key: "safety", label: "Güvenlik", max: 15, hint: "Yetkiler, LP, yoğunlaşma, RugCheck" },
] as const;
