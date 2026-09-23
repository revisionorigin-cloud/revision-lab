import { describe, expect, it } from "vitest";
import { debtSchedule } from "@/lib/engine/core";
import { PRO_DEFAULT, proLimits, runPro, type ProInput } from "@/lib/engine/pro";
import { RENTAL_DEFAULT } from "@/lib/engine/models/rental";
import { OFFICE_DEFAULT } from "@/lib/engine/models/office";

// RENTCAP에서 검증한 입력. 공통 엔진으로 옮긴 뒤에도 같은 값이 나와야 한다
const rentalCase: ProInput = {
  asset: "rental",
  rental: { units: 100, areaPy: 8, pricePerPy: 3000, acqTaxPct: 4.6, acqCostPct: 1.0, effRentPerPy: 14, depositPerUnit: 1000, convRatePct: 5.5, vacancyPct: 5, opexPct: 15, capexPct: 2, holdTaxPct: 0.25, rentGrowthPct: 2 },
  office: OFFICE_DEFAULT,
  cap: { ltvPct: 50, baseRatePct: 3.2, spreadBp: 180, amortType: "bullet", amortYears: 30, prefAmt: 0, prefRatePct: 6, holdYears: 5, exitCapPct: 4.5, saleCostPct: 1.5, taxMode: "conduit", corpTaxPct: 22, buildingRatioPct: 40, deprYears: 40 },
};

describe("공통 엔진 · 임대주택 (RENTCAP 회귀)", () => {
  const r = runPro(rentalCase);
  it("손계산: 매입가·조달·1년차 NOI", () => {
    expect(r.price).toBe(2_400_000);
    expect(r.deposits).toBeCloseTo(95_000, 6);
    expect(r.loan).toBe(1_200_000);
    expect(r.loan + r.deposits + r.equity).toBeCloseTo(r.uses, 6);
    const cash = 14 * 8 - (1000 * 0.055) / 12;
    const noi = cash * 12 * 100 * 0.95 * (1 - 0.17) - 2_400_000 * 0.0025;
    expect(r.years[0].noi).toBeCloseTo(noi, 6);
    expect(r.goingInCap).toBeCloseTo(noi / (r.price - r.deposits), 10);
  });
  it("검산 전부 PASS", () => {
    expect(r.checks.every((c) => c.pass === true)).toBe(true);
  });
  it("한계선: 원금 보전선 EM=1 · 상환 한계선 잔여=0 · 목표 IRR 최대 단가", () => {
    const L = proLimits(rentalCase, 8);
    expect(runPro(rentalCase, { exitCapPct: L.capitalPreserve!.exitCapPct }).equityMultiple!).toBeCloseTo(1, 5);
    expect(Math.abs(runPro(rentalCase, { exitCapPct: L.debtCover!.exitCapPct }).saleNetToEquity)).toBeLessThan(1);
    expect(runPro(rentalCase, { price: L.maxPrice! }).leveredIrr! * 100).toBeCloseTo(8, 4);
    expect(L.debtCover!.exitCapPct).toBeGreaterThan(L.capitalPreserve!.exitCapPct);
  });
  it("일반법인이면 세후 IRR이 낮다", () => {
    expect(runPro({ ...rentalCase, cap: { ...rentalCase.cap, taxMode: "corp" } }).leveredIrr!).toBeLessThan(r.leveredIrr!);
  });
});

describe("상환 스케줄", () => {
  it("원리금균등: 매기 원리금이 같고 만기에 0", () => {
    const s = debtSchedule(10000, 0.05, "annuity", 10, 10);
    const pays = s.map((d) => d.interest + d.principal);
    expect(Math.max(...pays) - Math.min(...pays)).toBeLessThan(1e-6);
    expect(s[9].close).toBeCloseTo(0, 6);
  });
  it("원금균등: 원금 일정", () => {
    const s = debtSchedule(10000, 0.05, "straight", 10, 5);
    expect(s.every((d) => Math.abs(d.principal - 1000) < 1e-9)).toBe(true);
    expect(s[4].close).toBeCloseTo(5000, 6);
  });
  it("만기일시: 원금 0, 잔액 유지", () => {
    const s = debtSchedule(10000, 0.05, "bullet", 30, 5);
    expect(s.every((d) => d.principal === 0 && d.close === 10000)).toBe(true);
  });
});

describe("오피스 모델 (Model Desk 이식)", () => {
  const i: ProInput = { ...PRO_DEFAULT, asset: "office", cap: { ...PRO_DEFAULT.cap, ltvPct: 55, baseRatePct: 4.3, spreadBp: 0, exitCapPct: 4.25, saleCostPct: 0.5 } };
  const r = runPro(i);
  it("임대면적·EGI·NOI 손계산", () => {
    const nla = 3300 * 0.88;
    expect(r.gla).toBeCloseTo(nla, 6);
    const dep = 120 * nla;
    const egi = (13 + 1.8) * nla * 12 * 0.97 + dep * 0.03;
    const noi = egi - 2.6 * 3300 * 12;
    expect(r.years[0].noi).toBeCloseTo(noi, 4);
    expect(r.deposits).toBeCloseTo(dep, 6);
  });
  it("Model Desk 기본값에서 IRR이 상식 범위 (3~25%)", () => {
    // 보증금 운용수익이 NOI에 들어 있으므로 매각가에 보증금을 다시 더하지 않는다 (2026-09-23 수정). 진입 4.25% 근처 Exit Cap이면 4% 대가 정상
    expect(r.leveredIrr! * 100).toBeGreaterThan(3);
    expect(r.leveredIrr! * 100).toBeLessThan(25);
    expect(r.checks.every((c) => c.pass === true)).toBe(true);
  });
  it("우선주가 있으면 보통주 IRR이 달라지고 조달 항등식은 유지", () => {
    const p = runPro({ ...i, cap: { ...i.cap, prefAmt: 200_000, prefRatePct: 6 } });
    expect(p.checks.find((c) => c.label.startsWith("조달"))!.pass).toBe(true);
    expect(p.equity).toBeCloseTo(r.equity - 200_000, 6);
  });
  it("NOI 직접 입력이면 그 값을 쓴다", () => {
    const d = runPro({ ...i, office: { ...i.office, noiDirect: 50_000 } });
    expect(d.years[0].noi).toBeCloseTo(50_000, 6);
  });
});

describe("기본값 자체 정합", () => {
  it("임대주택 기본값", () => { expect(runPro({ ...PRO_DEFAULT, rental: RENTAL_DEFAULT }).ok).toBe(true); });
  it("물류 기본값", () => { expect(runPro({ ...PRO_DEFAULT, asset: "logistics" }).ok).toBe(true); });
});
