import { irr, npv, solveScan } from "./finance";

/**
 * 공통 엔진. 자산이 무엇이든 수익 모델은 아래 RevenueResult 하나를 넘기고,
 * 자본구조·세무·매각·수익률·한계선·검산은 여기서 한 번만 계산한다.
 * 금액 단위: 만원. 비율은 % (4.6 = 4.6%), spreadBp만 bp.
 */
export type RevenueResult = {
  price: number; // 매입가
  acqCost: number; // 취득세 등 부대비
  deposits: number; // 승계 보증금 (없으면 0). 매각 시 매수인이 승계
  /** true면 NOI에 보증금 운용수익이 이미 들어 있다 (오피스 관행). 이때 가치 = NOI ÷ Cap 이고 보증금을 다시 더하지 않는다 */
  depositsInNoi?: boolean;
  noi: number[]; // 1년차 ~ (보유기간+1)년차 NOI. 마지막 원소가 매각 다음 해
  otherFixed: number; // 자산운용보수 등 연 고정비 (NOI 아래에서 차감)
  warnings: string[];
  /** 검산용: 수익 모델 자체의 항등식 */
  checks: Check[];
};

export type Check = { label: string; pass: boolean | null; detail: string };

export type AmortType = "bullet" | "annuity" | "straight";

export type CapitalInput = {
  ltvPct: number; // 선순위 대출 (매입가 대비)
  baseRatePct: number;
  spreadBp: number;
  amortType: AmortType;
  amortYears: number;
  prefAmt: number; // 우선주 (만원). 0이면 없음
  prefRatePct: number; // 우선주 배당률
  holdYears: number;
  exitCapPct: number; // 보증금 차감 기준 Exit Cap
  saleCostPct: number;
  taxMode: "conduit" | "corp";
  corpTaxPct: number;
  buildingRatioPct: number;
  deprYears: number;
};

export type DebtRow = { open: number; interest: number; principal: number; close: number };

export type YearRow = {
  year: number;
  noi: number;
  interest: number;
  principal: number;
  fixed: number;
  tax: number;
  prefPaid: number;
  cf: number; // 보통주 배당가능 현금 (매각 제외)
  dscr: number | null;
  debtYield: number | null;
};

export type CoreResult = {
  ok: boolean;
  warnings: string[];
  price: number;
  acqCost: number;
  uses: number;
  loan: number;
  pref: number;
  deposits: number;
  equity: number;
  rate: number; // 소수
  years: YearRow[];
  debt: DebtRow[];
  fwdNoi: number;
  saleValue: number;
  saleCost: number;
  exitTax: number;
  loanAtExit: number;
  prefBack: number;
  saleNetToEquity: number;
  leveredCfs: number[];
  unleveredCfs: number[];
  leveredIrr: number | null;
  unleveredIrr: number | null;
  equityMultiple: number | null;
  avgCoC: number | null;
  minDscr: number | null;
  goingInCap: number;
  yieldOnCost: number;
  debtYield: number | null;
  effLtv: number;
  checks: Check[];
};

const pct = (x: number) => x / 100;

export function debtSchedule(L: number, rate: number, type: AmortType, amortYears: number, n: number): DebtRow[] {
  const rows: DebtRow[] = [];
  let bal = L;
  const ny = Math.max(1, amortYears);
  const pay = type === "annuity" ? (rate > 0 ? (L * rate) / (1 - Math.pow(1 + rate, -ny)) : L / ny) : 0;
  for (let t = 1; t <= n; t++) {
    const open = bal;
    const interest = open * rate;
    let principal = 0;
    if (type === "annuity") principal = Math.min(open, Math.max(0, pay - interest));
    else if (type === "straight") principal = Math.min(open, L / ny);
    bal = open - principal;
    rows.push({ open, interest, principal, close: bal });
  }
  return rows;
}

export function runCore(rev: RevenueResult, c: CapitalInput): CoreResult {
  const warnings = [...rev.warnings];
  const n = Math.max(1, Math.round(c.holdYears));
  const price = rev.price;
  const uses = price + rev.acqCost;
  const loan = price * pct(c.ltvPct);
  const pref = Math.max(0, c.prefAmt);
  const equity = uses - loan - pref - rev.deposits;
  const rate = pct(c.baseRatePct) + c.spreadBp / 10000;
  if (equity <= 0) warnings.push("대출·우선주·승계 보증금의 합이 총 취득원가를 넘습니다. 자기자본이 0 이하라 수익률을 계산할 수 없습니다.");

  const debt = debtSchedule(loan, rate, c.amortType, c.amortYears, n);
  const corp = c.taxMode === "corp";
  const depr = c.deprYears > 0 ? (uses * pct(c.buildingRatioPct)) / c.deprYears : 0;

  const years: YearRow[] = [];
  let owed = 0; // 우선주 미지급 배당 누적
  let sumOp = 0;
  for (let y = 1; y <= n; y++) {
    const noi = rev.noi[y - 1] ?? 0;
    const d = debt[y - 1];
    const taxable = noi - d.interest - depr - rev.otherFixed;
    const tax = corp ? Math.max(0, taxable) * pct(c.corpTaxPct) : 0;
    const avail = noi - d.interest - d.principal - rev.otherFixed - tax;
    let prefPaid = 0;
    if (pref > 0) {
      owed += pref * pct(c.prefRatePct);
      prefPaid = Math.min(Math.max(avail, 0), owed);
      owed -= prefPaid;
    }
    const cf = avail - prefPaid;
    sumOp += cf;
    const ds = d.interest + d.principal;
    years.push({
      year: y, noi, interest: d.interest, principal: d.principal, fixed: rev.otherFixed, tax, prefPaid, cf,
      dscr: ds > 0 ? noi / ds : null,
      debtYield: d.close > 0 ? noi / d.close : null,
    });
  }

  const fwdNoi = rev.noi[n] ?? rev.noi[rev.noi.length - 1] ?? 0;
  const exitCap = pct(c.exitCapPct);
  const depAdd = rev.depositsInNoi ? 0 : rev.deposits; // 보증금 차감 Cap 관행에서만 가치에 보증금을 더한다
  const saleValue = exitCap > 0 ? fwdNoi / exitCap + depAdd : 0;
  const saleCost = saleValue * pct(c.saleCostPct);
  const book = uses - depr * n;
  const exitTax = corp ? Math.max(0, saleValue - saleCost - book) * pct(c.corpTaxPct) : 0;
  const loanAtExit = debt[n - 1]?.close ?? 0;
  const proceeds = saleValue - saleCost - rev.deposits - loanAtExit - exitTax;
  const prefBack = pref > 0 ? Math.min(Math.max(proceeds, 0), pref + owed) : 0;
  const saleNetToEquity = proceeds - prefBack;

  const ok = equity > 0 && price > 0;
  const leveredCfs = [-equity, ...years.map((y, k) => y.cf + (k === n - 1 ? saleNetToEquity : 0))];
  const unlevEquity = uses - rev.deposits;
  const unleveredCfs = [
    -unlevEquity,
    ...years.map((y, k) => {
      const taxU = corp ? Math.max(0, y.noi - depr - rev.otherFixed) * pct(c.corpTaxPct) : 0;
      return y.noi - rev.otherFixed - taxU + (k === n - 1 ? saleValue - saleCost - rev.deposits - exitTax : 0);
    }),
  ];
  const leveredIrr = ok ? irr(leveredCfs) : null;
  const unleveredIrr = unlevEquity > 0 ? irr(unleveredCfs) : null;
  const inflow = leveredCfs.slice(1).reduce((a, b) => a + b, 0);
  const dscrs = years.map((y) => y.dscr).filter((d): d is number => d !== null);
  const noi1 = years[0]?.noi ?? 0;

  const sources = loan + pref + rev.deposits + equity;
  const checks: Check[] = [
    ...rev.checks,
    { label: "조달 = 사용 (Sources = Uses)", pass: Math.abs(sources - uses) < 1e-6 * Math.max(1, uses), detail: `대출 + 우선주 + 승계 보증금 + 자기자본 − 총 취득원가 = ${(sources - uses).toFixed(4)}` },
    { label: "IRR 역산 (NPV@IRR = 0)", pass: leveredIrr === null ? null : Math.abs(npv(leveredIrr, leveredCfs)) < 1e-4 * Math.max(1, equity), detail: leveredIrr === null ? "IRR을 산출할 수 없는 입력입니다" : `NPV(IRR) = ${npv(leveredIrr, leveredCfs).toFixed(6)} 만원` },
    { label: rev.depositsInNoi ? "매각가 = 차년도 NOI ÷ Exit Cap" : "매각가 = 차년도 NOI ÷ Exit Cap + 보증금", pass: exitCap > 0 && Math.abs((saleValue - depAdd) * exitCap - fwdNoi) < 1e-6 * Math.max(1, Math.abs(fwdNoi)), detail: `(매각가${rev.depositsInNoi ? "" : " − 보증금"}) × Exit Cap − 차년도 NOI = ${((saleValue - depAdd) * exitCap - fwdNoi).toFixed(4)}` },
    { label: "대출 상환 스케줄 정합", pass: Math.abs(debt.reduce((a, d) => a + d.principal, 0) + loanAtExit - loan) < 1e-6 * Math.max(1, loan), detail: `원금 상환 합계 + 만기 잔액 − 대출 = ${(debt.reduce((a, d) => a + d.principal, 0) + loanAtExit - loan).toFixed(4)}` },
  ];

  return {
    ok, warnings, price, acqCost: rev.acqCost, uses, loan, pref, deposits: rev.deposits, equity, rate,
    years, debt, fwdNoi, saleValue, saleCost, exitTax, loanAtExit, prefBack, saleNetToEquity,
    leveredCfs, unleveredCfs, leveredIrr, unleveredIrr,
    equityMultiple: ok ? inflow / equity : null,
    avgCoC: ok ? sumOp / n / equity : null,
    minDscr: dscrs.length ? Math.min(...dscrs) : null,
    goingInCap: price - depAdd > 0 ? noi1 / (price - depAdd) : NaN,
    yieldOnCost: uses - depAdd > 0 ? noi1 / (uses - depAdd) : NaN,
    debtYield: loan > 0 ? noi1 / loan : null,
    effLtv: price > 0 ? (loan + rev.deposits) / price : NaN,
    checks,
  };
}

// ── 한계선 역산 (모델 무관)

export type Limits = {
  capitalPreserve: { exitCapPct: number; saleVsPrice: number } | null;
  debtCover: { exitCapPct: number; saleVsPrice: number } | null;
  maxPrice: number | null; // 목표 IRR을 맞추는 최대 매입 단가 (모델의 단가 단위)
  rateAtDscr: number | null; // 1년차 DSCR이 기준이 되는 대출금리 %
};

/**
 * run(price, exitCap) 으로 결과를 다시 계산할 수 있는 함수를 받아 한계선을 찾는다.
 * price는 모델이 쓰는 단가(만원/평 등) 그대로.
 */
export function findLimits(
  base: CoreResult,
  price0: number,
  cap0: number,
  run: (o: { price?: number; exitCapPct?: number }) => CoreResult,
  targetIrrPct: number,
  dscrFloor = 1.2,
): Limits {
  const pack = (cap: number | null) => {
    if (cap === null) return null;
    const r = run({ exitCapPct: cap });
    return { exitCapPct: cap, saleVsPrice: r.saleValue / r.price - 1 };
  };
  const capEm = solveScan((c) => run({ exitCapPct: c }).equityMultiple ?? NaN, 1, 0.5, 40, 160);
  const capDebt = base.loan > 0 ? solveScan((c) => run({ exitCapPct: c }).saleNetToEquity + run({ exitCapPct: c }).prefBack, 0, 0.5, 80, 320) : null;
  const maxPrice = solveScan((p) => run({ price: p }).leveredIrr ?? NaN, targetIrrPct / 100, price0 * 0.3, price0 * 2.5);
  const y1 = base.years[0];
  const ds1 = y1 ? y1.interest + y1.principal : 0;
  // 만기일시상환일 때만 닫힌 해가 있다. 그 외에는 탐색으로 푼다
  let rateAtDscr: number | null = null;
  if (base.loan > 0 && y1 && y1.noi > 0) {
    if (ds1 > 0 && y1.principal === 0) rateAtDscr = (y1.noi / dscrFloor / base.loan) * 100;
  }
  void cap0;
  return { capitalPreserve: pack(capEm), debtCover: pack(capDebt), maxPrice, rateAtDscr };
}

export function axis(center: number, step: number, count: number, min = 0): number[] {
  const half = Math.floor(count / 2);
  let start = center - half * step;
  if (start < min) start = min;
  return Array.from({ length: count }, (_, k) => Math.round((start + k * step) * 1000) / 1000);
}
