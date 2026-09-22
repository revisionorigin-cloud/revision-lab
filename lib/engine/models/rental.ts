import type { Check, RevenueResult } from "../core";

/**
 * 임대주택 통매입 (오피스텔 · 도시형 · 아파트 다세대 일괄). RENTCAP 모델을 그대로 옮겼다.
 * 월세 현금 = 환산월세 × 전용평 − 보증금 × 전환율 ÷ 12
 */
export type RentalInput = {
  units: number;
  areaPy: number;
  pricePerPy: number;
  acqTaxPct: number;
  acqCostPct: number;
  effRentPerPy: number;
  depositPerUnit: number;
  convRatePct: number;
  vacancyPct: number;
  opexPct: number; // EGI 대비
  capexPct: number; // EGI 대비
  holdTaxPct: number; // 매입가 대비, 연
  rentGrowthPct: number;
};

export const RENTAL_DEFAULT: RentalInput = {
  units: 120, areaPy: 8, pricePerPy: 2900, acqTaxPct: 4.6, acqCostPct: 1.0,
  effRentPerPy: 13.3, depositPerUnit: 1000, convRatePct: 5.8,
  vacancyPct: 5, opexPct: 15, capexPct: 2, holdTaxPct: 0.25, rentGrowthPct: 2,
};

const pct = (x: number) => x / 100;

export function rentalRevenue(i: RentalInput, holdYears: number): RevenueResult & { gla: number; cashRentPerUnit: number; pgi1: number; breakevenOcc: number | null } {
  const warnings: string[] = [];
  const gla = i.units * i.areaPy;
  const price = gla * i.pricePerPy;
  const acqCost = price * (pct(i.acqTaxPct) + pct(i.acqCostPct));
  const occ = 1 - pct(i.vacancyPct);
  const deposits = i.units * i.depositPerUnit * occ;
  const raw = i.effRentPerPy * i.areaPy - (i.depositPerUnit * pct(i.convRatePct)) / 12;
  const cashRentPerUnit = Math.max(0, raw);
  if (raw < 0) warnings.push("보증금이 환산월세 전체를 넘어섭니다. 사실상 전세 구조이며 월세 현금수입을 0으로 계산했습니다.");
  const holdTax = price * pct(i.holdTaxPct);
  const g = pct(i.rentGrowthPct);
  const n = Math.max(1, Math.round(holdYears));
  const noi: number[] = [];
  let pgi1 = 0;
  const rows: { pgi: number; vac: number; opex: number; capex: number; noi: number }[] = [];
  for (let y = 1; y <= n + 1; y++) {
    const pgi = cashRentPerUnit * 12 * i.units * Math.pow(1 + g, y - 1);
    if (y === 1) pgi1 = pgi;
    const vac = pgi * pct(i.vacancyPct);
    const egi = pgi - vac;
    const opex = egi * pct(i.opexPct);
    const capex = egi * pct(i.capexPct);
    const v = egi - opex - capex - holdTax;
    rows.push({ pgi, vac, opex, capex, noi: v });
    noi.push(v);
  }
  const checks: Check[] = [{
    label: "연도별 NOI 항등식", pass: rows.every((r) => Math.abs(r.pgi - r.vac - r.opex - r.capex - holdTax - r.noi) < 1e-6 * Math.max(1, r.pgi)),
    detail: "PGI − 공실 − 운영비 − 수선적립 − 보유세 = NOI (전 연도)",
  }];
  return {
    price, acqCost, deposits, noi, otherFixed: 0, warnings, checks, gla, cashRentPerUnit, pgi1,
    breakevenOcc: null, // 이자를 알아야 하므로 코어 결과와 함께 계산한다 (breakevenOccupancy)
  };
}

/** 1년차 손익분기 입주율: EGI×(1−opex−capex) − 보유세 − 원리금 − 고정비 = 0 */
export function breakevenOccupancy(i: RentalInput, pgi1: number, debtService: number, fixed: number): number | null {
  const margin = 1 - pct(i.opexPct) - pct(i.capexPct);
  const holdTax = i.units * i.areaPy * i.pricePerPy * pct(i.holdTaxPct);
  return pgi1 > 0 && margin > 0 ? (holdTax + debtService + fixed) / margin / pgi1 : null;
}
