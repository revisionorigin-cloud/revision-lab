import { irr, solveScan } from "../finance";
import { acquisitionTax, capitalGainsTax, holdingTax, loanCap, monthlyPayment, type HouseCount, type PropertyKind, type Zone } from "../../rules";

/**
 * 개인 매입 (아파트 · 오피스텔 한 호실). 월 단위 현금흐름, 개인 세제, 대출 규제.
 * 세 가지 용도: 실거주(live) · 월세 임대(rent) · 전세 끼고 매입(jeonse, 갭투자).
 * 금액 단위: 만원.
 */
export type HomeInput = {
  kind: PropertyKind;
  purpose: "live" | "rent" | "jeonse";
  price: number;
  areaM2: number;
  zone: Zone;
  houses: HouseCount; // 매입 전 보유 주택 수
  singleHousehold: boolean; // 1세대1주택 요건 충족 가정 (비과세·공제)
  incomeAnnual: number; // 연소득
  existingDebtService: number; // 기존 대출 연 원리금
  loan: number; // 실제 받을 대출 (한도 이내)
  ratePct: number;
  termYears: number;
  deposit: number; // 임대 보증금 (rent) 또는 전세금 (jeonse)
  monthlyRent: number; // rent일 때 월세
  mgmtMonthly: number; // 실거주 시 관리비 등 월 지출, 임대 시 임대인 부담 비용
  repairPct: number; // 수선·공실 준비금 (연, 매입가 대비)
  holdYears: number;
  priceGrowthPct: number; // 연 시세 상승률 가정
  rentGrowthPct: number;
  realizationPct: number; // 공시가격 현실화율
  brokeragePct: number; // 매수·매도 중개보수 (각각, 매매가 대비)
  altReturnPct: number; // 자기자본의 기회수익률 (실거주 비교용)
  jeonseDropPct: number; // 역전세 스트레스: 만기 시 전세가 하락률
};

export const HOME_DEFAULT: HomeInput = {
  kind: "apt", purpose: "live", price: 90000, areaM2: 84, zone: "capital", houses: 0, singleHousehold: true,
  incomeAnnual: 8000, existingDebtService: 0, loan: 36000, ratePct: 4.2, termYears: 30,
  deposit: 0, monthlyRent: 0, mgmtMonthly: 25, repairPct: 0.2, holdYears: 5,
  priceGrowthPct: 2, rentGrowthPct: 2, realizationPct: 69, brokeragePct: 0.4, altReturnPct: 3.5, jeonseDropPct: 15,
};

export type HomeResult = {
  ok: boolean;
  warnings: string[];
  acq: ReturnType<typeof acquisitionTax>;
  hold: ReturnType<typeof holdingTax>;
  cap: ReturnType<typeof loanCap>;
  loan: number;
  cashNeeded: number; // 초기 자기자본 = 매입가 + 취득세 + 중개보수 − 대출 − 보증금
  payment: number; // 월 원리금
  interest1: number; // 1년차 월 평균 이자
  monthlyIn: number;
  monthlyOut: number; // 원리금 + 보유세/12 + 관리·수선
  monthlyNet: number; // 세전 월 순현금 (실거주는 주거비 지출)
  monthlyNetCashOnly: number; // 원금 상환 제외 (실질 비용)
  years: { year: number; income: number; interest: number; principal: number; holdTax: number; other: number; net: number; balance: number }[];
  salePrice: number;
  cgt: ReturnType<typeof capitalGainsTax>;
  saleNet: number; // 매각가 − 중개보수 − 양도세 − 대출잔액 − 보증금 반환
  totalNet: number; // 보유기간 순현금 합계 + 매각 순수령 − 초기 자기자본
  cfs: number[];
  irr: number | null;
  multiple: number | null;
  breakevenGrowthPct: number | null; // IRR = 0 이 되는 연 시세 상승률
  breakevenGrowthAltPct: number | null; // IRR = 기회수익률 이 되는 상승률
  maxPriceForAlt: number | null; // 기회수익률을 맞추는 최대 매입가 (현 상승률 가정)
  grossYieldPct: number | null; // rent: 연 월세 ÷ (매입가 − 보증금)
  jeonseRatioPct: number | null; // jeonse: 전세금 ÷ 매입가
  jeonseStress: { drop: number; shortfall: number; coverable: boolean } | null;
  dsrPct: number | null;
  checks: { label: string; pass: boolean | null; detail: string }[];
};

const pct = (x: number) => x / 100;

type HomeCore = Omit<HomeResult, "breakevenGrowthPct" | "breakevenGrowthAltPct" | "maxPriceForAlt">;

/** 역산이 필요 없는 본체. 한계선 탐색은 이 함수만 반복 호출한다 (재귀 방지) */
function homeCore(i: HomeInput): HomeCore {
  const warnings: string[] = [];
  const cap = loanCap(i.price, i.zone, i.kind, i.houses, i.incomeAnnual, i.existingDebtService, i.ratePct, i.termYears);
  const loan = Math.max(0, i.loan);
  if (loan > cap.max + 1) warnings.push(`대출 ${Math.round(loan / 10000 * 10) / 10}억은 규제 한도 ${Math.round(cap.max / 10000 * 10) / 10}억(${cap.binding} 기준)을 넘습니다.`);
  const acq = acquisitionTax(i.price, i.areaM2, i.kind, i.houses, i.zone);
  const housesAfter = i.houses + 1;
  const hold = holdingTax(i.price, i.kind, housesAfter, i.singleHousehold);
  const brokerBuy = i.price * pct(i.brokeragePct);
  const deposit = i.purpose === "live" ? 0 : i.deposit;
  const cashNeeded = i.price + acq.amount + brokerBuy - loan - deposit;
  if (i.purpose === "jeonse" && loan > 0) warnings.push("전세를 낀 매입에는 통상 담보대출이 나오지 않습니다(선순위 임차인). 대출 0을 권합니다.");
  if (cashNeeded <= 0) warnings.push("대출과 보증금이 매입 비용을 넘습니다. 자기자본 없이 사는 구조는 계산하지 않습니다.");

  const n = Math.max(1, Math.round(i.holdYears));
  const pay = monthlyPayment(loan, i.ratePct, i.termYears);
  const r = pct(i.ratePct) / 12;
  let bal = loan;
  const years: HomeResult["years"] = [];
  const cfs: number[] = [-cashNeeded];
  let interest1 = 0;
  let income1 = 0;
  const gRent = pct(i.rentGrowthPct);
  for (let y = 1; y <= n; y++) {
    let interest = 0;
    let principal = 0;
    for (let m = 0; m < 12; m++) {
      const it = bal * r;
      const pr = Math.min(bal, pay - it);
      interest += it;
      principal += Math.max(0, pr);
      bal = Math.max(0, bal - pr);
    }
    const income = i.purpose === "rent" ? i.monthlyRent * 12 * Math.pow(1 + gRent, y - 1) : 0;
    const other = i.mgmtMonthly * 12 + i.price * pct(i.repairPct);
    const holdTax = hold.total * Math.pow(1 + pct(i.priceGrowthPct), y - 1);
    const net = income - interest - principal - holdTax - other;
    if (y === 1) { interest1 = interest / 12; income1 = income; }
    years.push({ year: y, income, interest, principal, holdTax, other, net, balance: bal });
    cfs.push(net);
  }
  const salePrice = i.price * Math.pow(1 + pct(i.priceGrowthPct), n);
  const brokerSell = salePrice * pct(i.brokeragePct);
  const cgt = capitalGainsTax(salePrice - brokerSell, i.price + acq.amount + brokerBuy, n, i.kind, i.singleHousehold && i.purpose === "live", i.purpose === "live" ? n : 0);
  const depositBack = i.purpose === "jeonse" ? i.deposit * Math.pow(1 + gRent, n) : deposit; // 전세는 갱신되며 오른다고 보고 만기 반환
  const depositIn = i.purpose === "jeonse" ? depositBack - i.deposit : 0; // 전세금 상승분은 보유 중 유입
  const saleNet = salePrice - brokerSell - cgt.tax - bal - depositBack;
  cfs[n] += saleNet + depositIn;
  const ok = cashNeeded > 0;
  const rr = ok ? irr(cfs) : null;
  const inflow = cfs.slice(1).reduce((a, b) => a + b, 0);
  const totalNet = inflow - cashNeeded;

  const monthlyIn = income1 / 12;
  const monthlyOut = pay + hold.total / 12 + i.mgmtMonthly + (i.price * pct(i.repairPct)) / 12;
  const jeonseStress = i.purpose === "jeonse"
    ? (() => { const drop = i.deposit * pct(i.jeonseDropPct); return { drop, shortfall: drop, coverable: false }; })()
    : null;
  const dsrPct = i.incomeAnnual > 0 ? ((pay * 12 + i.existingDebtService) / i.incomeAnnual) * 100 : null;

  const checks = [
    { label: "자기자본 항등식", pass: Math.abs(cashNeeded + loan + deposit - (i.price + acq.amount + brokerBuy)) < 1e-6 * i.price, detail: "자기자본 + 대출 + 보증금 = 매입가 + 취득세 + 중개보수" },
    { label: "대출 상환 정합", pass: Math.abs(years.reduce((a, y) => a + y.principal, 0) + bal - loan) < 1e-4 * Math.max(1, loan), detail: `원금 상환 합계 + 잔액 − 대출 = ${(years.reduce((a, y) => a + y.principal, 0) + bal - loan).toFixed(3)}` },
    { label: "IRR 역산", pass: rr === null ? null : Math.abs(cfs.reduce((a, c, t) => a + c / Math.pow(1 + rr, t), 0)) < 1e-3 * Math.max(1, cashNeeded), detail: rr === null ? "산출 불가" : "NPV(IRR) ≈ 0" },
  ];

  return {
    ok, warnings, acq, hold, cap, loan, cashNeeded, payment: pay, interest1, monthlyIn, monthlyOut,
    monthlyNet: monthlyIn - monthlyOut, monthlyNetCashOnly: monthlyIn - monthlyOut + (years[0]?.principal ?? 0) / 12,
    years, salePrice, cgt, saleNet, totalNet, cfs, irr: rr,
    multiple: ok ? inflow / cashNeeded : null,
    grossYieldPct: i.purpose === "rent" && i.price - deposit > 0 ? ((i.monthlyRent * 12) / (i.price - deposit)) * 100 : null,
    jeonseRatioPct: i.purpose === "jeonse" && i.price > 0 ? (i.deposit / i.price) * 100 : null,
    jeonseStress, dsrPct, checks,
  };
}

export function homeModel(i: HomeInput): HomeResult {
  const core = homeCore(i);
  const run = (g: number, price = i.price) => homeCore({ ...i, priceGrowthPct: g, price, loan: Math.min(i.loan, price) }).irr ?? NaN;
  const ok = core.ok;
  return {
    ...core,
    breakevenGrowthPct: ok ? solveScan((g) => run(g), 0, -10, 15, 100) : null,
    breakevenGrowthAltPct: ok ? solveScan((g) => run(g), pct(i.altReturnPct), -10, 15, 100) : null,
    maxPriceForAlt: ok ? solveScan((p) => run(i.priceGrowthPct, p), pct(i.altReturnPct), i.price * 0.4, i.price * 1.6, 120) : null,
  };
}
