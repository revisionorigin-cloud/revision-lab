import type { Check, RevenueResult } from "../core";

/**
 * 오피스 · 물류센터 매입. RE:VISION Model Desk의 acqEngine을 옮겼다.
 * 임대료·관리비·운영비는 평당 월 단위(만원). 면적은 연면적(평)과 전용률로 임대면적을 구한다.
 * NOI를 직접 아는 경우(IM의 안정화 NOI 등) noiDirect에 넣으면 임대료 계산을 건너뛴다.
 */
export type OfficeInput = {
  kind: "office" | "logistics";
  price: number; // 매입가 (만원)
  gfaPy: number; // 연면적 (평)
  effRatioPct: number; // 전용률 (오피스 88 · 물류 97 관행)
  acqTaxPct: number;
  acqCostPct: number;
  rentPerPy: number; // 임대료 만원/평·월 (임대면적 기준)
  mgmtNetPerPy: number; // 관리비 순수입 만원/평·월 (관리비 수입 − 실비)
  vacancyPct: number;
  otherIncome: number; // 기타 수입 연 (주차 등, 만원)
  depositPerPy: number; // 보증금 만원/평 (임대면적)
  depositRatePct: number; // 보증금 운용수익률
  assumeDeposit: boolean; // 보증금 승계 여부
  noiDirect: number; // >0 이면 1년차 NOI 직접 입력 (만원)
  rentGrowthPct: number;
  opexPerPy: number; // 운영비 만원/평·월 (연면적 기준)
  opexGrowthPct: number;
  aumFeePct: number; // 운용보수 (매입가 대비, 연)
  fixedCost: number; // 기타 고정비 연 (만원)
};

export const OFFICE_DEFAULT: OfficeInput = {
  kind: "office", price: 10_000_000, gfaPy: 3300, effRatioPct: 88, acqTaxPct: 4.6, acqCostPct: 0.6,
  rentPerPy: 13, mgmtNetPerPy: 1.8, vacancyPct: 3, otherIncome: 0, depositPerPy: 120, depositRatePct: 3, assumeDeposit: true,
  noiDirect: 0, rentGrowthPct: 2.5, opexPerPy: 2.6, opexGrowthPct: 2, aumFeePct: 0.4, fixedCost: 500,
};

export const LOGISTICS_DEFAULT: OfficeInput = {
  ...OFFICE_DEFAULT, kind: "logistics", price: 8_500_000, gfaPy: 15000, effRatioPct: 97,
  rentPerPy: 3.6, mgmtNetPerPy: 0.2, vacancyPct: 10, depositPerPy: 36, opexPerPy: 0.75,
};

const pct = (x: number) => x / 100;

export function officeRevenue(i: OfficeInput, holdYears: number): RevenueResult & { nla: number; egi1: number; opex1: number } {
  const warnings: string[] = [];
  const price = i.price;
  const acqCost = price * (pct(i.acqTaxPct) + pct(i.acqCostPct));
  const nla = i.gfaPy * pct(i.effRatioPct);
  const depositTot = i.assumeDeposit ? i.depositPerPy * nla : 0;
  const depositIncome = depositTot * pct(i.depositRatePct);
  const grossRent = i.rentPerPy * nla * 12;
  const mgmtNet = i.mgmtNetPerPy * nla * 12;
  const opex1 = i.opexPerPy * i.gfaPy * 12;
  const direct = i.noiDirect > 0;
  const g = pct(i.rentGrowthPct);
  const n = Math.max(1, Math.round(holdYears));
  const noi: number[] = [];
  let egi1 = 0;
  const rows: { egi: number; opex: number; noi: number }[] = [];
  for (let y = 1; y <= n + 1; y++) {
    const egi = (grossRent + mgmtNet) * (1 - pct(i.vacancyPct)) * Math.pow(1 + g, y - 1) + i.otherIncome + depositIncome;
    const opex = opex1 * Math.pow(1 + pct(i.opexGrowthPct), y - 1);
    const v = direct ? i.noiDirect * Math.pow(1 + g, y - 1) : egi - opex;
    if (y === 1) egi1 = direct ? v + opex : egi;
    rows.push({ egi: direct ? v + opex : egi, opex, noi: v });
    noi.push(v);
  }
  if (direct) warnings.push("NOI를 직접 입력했습니다. 임대료·공실·운영비 입력은 계산에 쓰이지 않습니다.");
  const checks: Check[] = [{
    label: "연도별 NOI 항등식", pass: rows.every((r) => Math.abs(r.egi - r.opex - r.noi) < 1e-6 * Math.max(1, Math.abs(r.egi))),
    detail: "EGI − 운영비 = NOI (전 연도)",
  }];
  return {
    price, acqCost, deposits: depositTot, noi,
    otherFixed: price * pct(i.aumFeePct) + i.fixedCost,
    warnings, checks, nla, egi1, opex1,
  };
}
