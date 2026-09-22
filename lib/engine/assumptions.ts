import type { ComplexStat, Market } from "../connectors/market";
import { percentileFromTable } from "../connectors/stats";
import { PY } from "../connectors/types";
import type { RentalInput } from "./models/rental";
import { runPro, type ProInput, type ProResult } from "./pro";
import type { Limits } from "./core";

export type Provenance = Record<string, string | undefined>;

/** 대출 + 승계 보증금이 매입가에서 차지하는 비중의 상한. 자동 채우기에서만 쓴다 */
export const EFF_LTV_CAP = 70;

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 임대주택 통매입 가정을 시장(지역 또는 단지) 통계로 채운다. 어떤 값이 어디서 왔는지 provenance에 남긴다.
 * Exit Cap은 진입 Cap + 25bp. 보유 중 Cap이 좁혀진다고 가정하지 않는 보수적 관행.
 */
export function suggestRental(prev: ProInput, m: Market, c: ComplexStat | null): { input: ProInput; from: Provenance } {
  const from: Provenance = {};
  const r: RentalInput = { ...prev.rental };
  const scope = c ? c.name : m.meta.name;
  const price = c?.pricePerPy ?? m.kpi.pricePerPy;
  if (price) {
    r.pricePerPy = round(price, 0);
    from["rental.pricePerPy"] = c?.pricePerPy ? `${scope} 최근 12개월 매매 중앙값 (${c.nTrade}건)` : `${m.meta.name} 매매 중앙값 (${m.kpi.priceN}건)${c ? " · 단지 매매 3건 미만" : ""}`;
  }
  const rent = c?.effRentPerPy ?? m.kpi.effRentPerPy;
  if (rent) {
    r.effRentPerPy = round(rent, 2);
    from["rental.effRentPerPy"] = c?.effRentPerPy ? `${scope} ${c.rentBasis === "new" ? "신규" : "전체"} 월세 환산 중앙값 (${c.nWolse}건)` : `${m.meta.name} 신규 월세 환산 중앙값 (${m.kpi.effRentN}건)`;
  }
  if (c) {
    r.areaPy = round(c.medArea / PY, 2);
    from["rental.areaPy"] = `${scope} 임대 계약 전용면적 중앙값 ${c.medArea.toFixed(1)}㎡`;
    if (c.medDeposit != null) { r.depositPerUnit = round(c.medDeposit, 0); from["rental.depositPerUnit"] = `${scope} 월세 계약 보증금 중앙값`; }
  } else {
    if (m.kpi.medAreaM2 != null) { r.areaPy = round(m.kpi.medAreaM2 / PY, 2); from["rental.areaPy"] = `${m.meta.name} 임대 계약 전용면적 중앙값 ${m.kpi.medAreaM2.toFixed(1)}㎡`; }
    if (m.kpi.depositToPricePct != null) {
      r.depositPerUnit = Math.round((r.pricePerPy * r.areaPy * m.kpi.depositToPricePct) / 100 / 100) * 100;
      from["rental.depositPerUnit"] = `${m.meta.name} 단지별 매매가 대비 보증금 중앙값 ${m.kpi.depositToPricePct.toFixed(1)}%`;
    }
  }
  r.convRatePct = m.conv.ratePct;
  from["rental.convRatePct"] = m.conv.method === "implied" ? `${m.meta.name} 전세·월세 쌍 ${m.conv.n.toLocaleString()}건에서 역산` : "표본 부족 · 기본값";
  if (m.kpi.rentYoYPct != null) {
    r.rentGrowthPct = round(clamp(m.kpi.rentYoYPct, 0, 4), 1);
    from["rental.rentGrowthPct"] = `동일 단지 신규 월세 전년비 ${m.kpi.rentYoYPct.toFixed(1)}% (${m.kpi.rentYoYN}개 단지) · 0~4%로 제한`;
  }
  let cap = { ...prev.cap };
  const unitPrice = r.pricePerPy * r.areaPy;
  if (unitPrice > 0) {
    const depShare = ((r.depositPerUnit * (1 - r.vacancyPct / 100)) / unitPrice) * 100;
    const room = Math.max(0, Math.floor((EFF_LTV_CAP - depShare) / 5) * 5);
    const wanted = Math.max(prev.cap.ltvPct, 50);
    const ltv = Math.min(wanted, room);
    if (ltv < wanted) from["cap.ltvPct"] = `승계 보증금이 매입가의 ${depShare.toFixed(0)}% · 실질 LTV ${EFF_LTV_CAP}% 안에 들도록 ${wanted}% → ${ltv}%로 낮춤`;
    cap = { ...cap, ltvPct: ltv };
  }
  const next: ProInput = { ...prev, asset: "rental", rental: r, cap };
  const goingIn = runPro(next).goingInCap;
  if (Number.isFinite(goingIn) && goingIn > 0) {
    next.cap = { ...next.cap, exitCapPct: round(goingIn * 100 + 0.25, 2) };
    from["cap.exitCapPct"] = `진입 Cap ${(goingIn * 100).toFixed(2)}% + 25bp`;
  }
  return { input: next, from };
}

export type Stance = "aggressive" | "neutral" | "conservative" | "na";
export type Position = { stance: Stance; text: string };
export const STANCE_LABEL: Record<Stance, string> = { aggressive: "공격적", neutral: "중립", conservative: "보수적", na: "자료 없음" };

/** 가정별 시장 대비 위치. 공공데이터로 확인할 수 없는 항목은 "자료 없음" */
export function positions(i: ProInput, r: ProResult, m: Market | null, corpAAPct: number | null): Record<string, Position> {
  const out: Record<string, Position> = {};
  const allIn = r.rate * 100;
  if (corpAAPct !== null) {
    const d = allIn - corpAAPct;
    out["cap.spreadBp"] = { stance: d < 0 ? "aggressive" : d > 1.5 ? "conservative" : "neutral", text: `회사채 AA- 3년 ${corpAAPct.toFixed(2)}% 대비 ${d >= 0 ? "+" : ""}${Math.round(d * 100)}bp` };
  }
  if (Number.isFinite(r.goingInCap)) {
    const d = i.cap.exitCapPct - r.goingInCap * 100;
    out["cap.exitCapPct"] = { stance: d < 0 ? "aggressive" : d >= 0.5 ? "conservative" : "neutral", text: `진입 Cap ${(r.goingInCap * 100).toFixed(2)}% 대비 ${d >= 0 ? "+" : ""}${Math.round(d * 100)}bp` };
  }
  if (i.asset === "rental") {
    if (m) {
      const pp = percentileFromTable(m.tables.price, i.rental.pricePerPy);
      if (pp !== null) out["rental.pricePerPy"] = { stance: "neutral", text: `시장 매매 단가의 P${Math.round(pp)} (${m.kpi.priceN}건)` };
      const rp = percentileFromTable(m.tables.rent, i.rental.effRentPerPy);
      if (rp !== null) out["rental.effRentPerPy"] = { stance: rp > 75 ? "aggressive" : rp < 40 ? "conservative" : "neutral", text: `시장 신규 월세의 P${Math.round(rp)} (${m.kpi.effRentN}건)` };
      if (m.kpi.rentYoYPct != null) {
        const d = i.rental.rentGrowthPct - m.kpi.rentYoYPct;
        out["rental.rentGrowthPct"] = { stance: d > 0.5 ? "aggressive" : d < -0.5 ? "conservative" : "neutral", text: `동일 단지 실측 ${m.kpi.rentYoYPct.toFixed(1)}%/년 대비 ${d >= 0 ? "+" : ""}${d.toFixed(1)}%p` };
      }
      const d = i.rental.convRatePct - m.conv.ratePct;
      out["rental.convRatePct"] = { stance: Math.abs(d) <= 0.3 ? "neutral" : d > 0 ? "aggressive" : "conservative", text: m.conv.method === "implied" ? `시장 역산 ${m.conv.ratePct.toFixed(2)}% (IQR ${m.conv.p25?.toFixed(1)}~${m.conv.p75?.toFixed(1)}%)` : "시장 표본 부족" };
    }
    out["rental.units"] = { stance: "na", text: "실거래가에는 건물 전체 세대수가 없습니다. 건축물대장에서 확인해 직접 입력하십시오" };
    out["rental.vacancyPct"] = { stance: "na", text: "실거래가 자료에는 공실 정보가 없습니다. 현장 실사 값으로 대체하십시오" };
    out["rental.opexPct"] = { stance: "na", text: "운영비는 공공데이터에 없습니다. 임대관리 견적으로 대체하십시오" };
  } else {
    out["office.rentPerPy"] = { stance: "na", text: "오피스·물류 임대료는 공개 실거래가에 없습니다. 렌트롤 또는 부동산원 임대동향조사(분기)로 대조하십시오" };
    out["office.vacancyPct"] = { stance: "na", text: "권역 공실률은 부동산원 분기 조사 기준으로 별도 확인이 필요합니다" };
    out["office.price"] = { stance: "na", text: "상업업무용 실거래는 지번이 일부 가려져 있어 개별 비교가 어렵습니다. 감정평가·거래사례로 대조하십시오" };
  }
  return out;
}

export type Verdict = { tone: "ok" | "warn" | "bad"; headline: string; lender: string | null; tally: Record<Stance, number> };

const f1 = (v: number) => v.toFixed(1);
const signed = (v: number) => `${v > 0 ? "+" : ""}${f1(v)}%`;

export function verdict(i: ProInput, r: ProResult, L: Limits, targetIrrPct: number, pos: Record<string, Position>): Verdict {
  const tally: Record<Stance, number> = { aggressive: 0, neutral: 0, conservative: 0, na: 0 };
  for (const p of Object.values(pos)) tally[p.stance]++;
  if (!r.ok || r.leveredIrr === null) return { tone: "bad", headline: "수익률을 계산할 수 없는 구조입니다. 대출·우선주·승계 보증금의 합이 취득원가를 넘거나 현금흐름이 성립하지 않습니다.", lender: null, tally };
  const irrPct = r.leveredIrr * 100;
  const unit = i.asset === "rental" ? "만원/평" : "만원";
  const fmtP = (v: number) => (i.asset === "rental" ? Math.round(v).toLocaleString("ko-KR") : `${(v / 10000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`);
  const gap = L.maxPrice === null ? null : (L.maxPrice / r.price0 - 1) * 100;
  const priceTxt = (up: boolean) => (gap === null ? "" : ` 매입가를 ${fmtP(L.maxPrice as number)}${i.asset === "rental" ? unit : ""}(${signed(gap)})까지 ${up ? "올려도 목표가 유지됩니다" : "낮춰야 목표가 맞습니다"}.`);
  let tone: Verdict["tone"];
  let headline: string;
  if (irrPct >= targetIrrPct && tally.aggressive > 0) {
    tone = "warn";
    headline = `IRR ${irrPct.toFixed(2)}%로 목표 ${f1(targetIrrPct)}%를 넘지만, 시장 대비 공격적인 가정 ${tally.aggressive}개에 기대고 있습니다. 그 가정이 실현될 근거를 먼저 확인하십시오.`;
  } else if (irrPct >= targetIrrPct) {
    tone = "ok";
    headline = `목표 IRR ${f1(targetIrrPct)}%를 충족합니다 (${irrPct.toFixed(2)}%).${priceTxt(true)}`;
  } else {
    tone = irrPct < 0 ? "bad" : "warn";
    headline = `현재 가정으로는 IRR ${irrPct.toFixed(2)}%로 목표 ${f1(targetIrrPct)}%에 못 미칩니다.${priceTxt(false)}`;
  }
  let lender: string | null = null;
  if (r.loan > 0 && L.debtCover) {
    const dscr = r.minDscr === null ? "" : ` · 최소 DSCR ${r.minDscr.toFixed(2)}x${r.minDscr < 1.2 ? " (1.2x 미달)" : ""}`;
    lender = `대주 관점 · 매각가가 매입가 대비 ${signed(L.debtCover.saleVsPrice * 100)}까지 내려가도 대출과 보증금을 전액 상환합니다${dscr}.`;
  } else if (r.loan === 0) lender = "대출 없이 자기자본과 승계 보증금만으로 취득하는 구조입니다.";
  return { tone, headline, lender, tally };
}
