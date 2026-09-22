import { describe, expect, it } from "vitest";
import { HOME_DEFAULT, homeModel } from "@/lib/engine/models/home";
import { acquisitionTax, capitalGainsTax, holdingTax, loanCap, monthlyPayment } from "@/lib/rules";

describe("취득세", () => {
  it("1주택 6억 이하 1% + 교육세 0.1%", () => {
    const t = acquisitionTax(50000, 84, "apt", 0, "capital");
    expect(t.ratePct).toBe(1); expect(t.eduPct).toBeCloseTo(0.1, 6); expect(t.ruralPct).toBe(0);
    expect(t.totalPct).toBeCloseTo(1.1, 6);
  });
  it("1주택 7.5억은 1~3% 선형 보간 = 2%", () => {
    expect(acquisitionTax(75000, 84, "apt", 0, "capital").ratePct).toBeCloseTo(2, 6);
  });
  it("2주택 조정지역 8% · 3주택 조정 12% · 85㎡ 초과 농특세", () => {
    expect(acquisitionTax(90000, 84, "apt", 1, "regulated").ratePct).toBe(8);
    const t = acquisitionTax(90000, 100, "apt", 2, "regulated");
    expect(t.ratePct).toBe(12); expect(t.ruralPct).toBe(1.0);
  });
  it("오피스텔 4.6%", () => { expect(acquisitionTax(30000, 30, "offi", 0, "regulated").totalPct).toBe(4.6); });
});

describe("보유세", () => {
  it("공시 9억 이하 1주택은 종부세 0", () => {
    const h = holdingTax(90000, "apt", 1, true); // 공시 6.21억
    expect(h.compTax).toBe(0); expect(h.propertyTax).toBeGreaterThan(0);
  });
  it("공시 12억 초과 1세대1주택은 종부세 발생", () => {
    const h = holdingTax(200000, "apt", 1, true); // 공시 13.8억
    expect(h.compTax).toBeGreaterThan(0);
  });
});

describe("양도세", () => {
  it("1세대1주택 12억 이하 비과세", () => {
    expect(capitalGainsTax(110000, 80000, 5, "apt", true, 5).tax).toBe(0);
  });
  it("1년 미만 단기 70% (지방소득세 포함 77%)", () => {
    const c = capitalGainsTax(100000, 90000, 0.5, "apt", false);
    expect(c.tax).toBeCloseTo(10000 * 0.77, 6);
  });
  it("장기보유공제: 5년 보유 10%", () => {
    expect(capitalGainsTax(100000, 80000, 5, "apt", false).ltDeductPct).toBe(10);
  });
});

describe("대출 한도", () => {
  it("규제지역 무주택 LTV 40%", () => {
    const c = loanCap(100000, "regulated", "apt", 0, 0, 0, 4, 30);
    expect(c.ltvPct).toBe(40); expect(c.ltvCap).toBe(40000);
  });
  it("DSR 40%가 더 빡빡하면 DSR이 구속", () => {
    const c = loanCap(100000, "other", "apt", 0, 3000, 0, 4, 30); // 연소득 3천만
    expect(c.binding).toBe("DSR");
    expect(c.dsrCap!).toBeLessThan(c.ltvCap);
  });
  it("수도권 6억 한도", () => {
    const c = loanCap(200000, "capital", "apt", 0, 100000, 0, 4, 30);
    expect(c.max).toBe(60000); expect(c.binding).toBe("한도");
  });
  it("규제지역 다주택 불가", () => { expect(loanCap(100000, "regulated", "apt", 1, 10000, 0, 4, 30).binding).toBe("불가"); });
  it("원리금균등 월 상환액 (3.6억 · 4.2% · 30년 ≈ 176만원)", () => {
    expect(monthlyPayment(36000, 4.2, 30)).toBeCloseTo(176.06, 0);
  });
});

describe("개인 매입 모델", () => {
  const r = homeModel(HOME_DEFAULT);
  it("항등식·검산 PASS", () => {
    expect(r.ok).toBe(true);
    expect(r.checks.every((c) => c.pass === true)).toBe(true);
  });
  it("실거주: 월 순현금은 지출 (음수)", () => { expect(r.monthlyNet).toBeLessThan(0); });
  it("손익분기 상승률: 그 상승률로 다시 돌리면 IRR ≈ 0", () => {
    expect(r.breakevenGrowthPct).not.toBeNull();
    expect(Math.abs(homeModel({ ...HOME_DEFAULT, priceGrowthPct: r.breakevenGrowthPct! }).irr!)).toBeLessThan(1e-3);
  });
  it("월세 임대: 총수익률과 수입 반영", () => {
    const m = homeModel({ ...HOME_DEFAULT, purpose: "rent", deposit: 5000, monthlyRent: 150, loan: 30000, singleHousehold: false });
    expect(m.grossYieldPct).toBeCloseTo((150 * 12) / (90000 - 5000) * 100, 6);
    expect(m.monthlyIn).toBeCloseTo(150, 6);
  });
  it("갭투자: 전세가율과 역전세 스트레스", () => {
    const g = homeModel({ ...HOME_DEFAULT, purpose: "jeonse", deposit: 60000, loan: 0, singleHousehold: false });
    expect(g.jeonseRatioPct).toBeCloseTo(66.67, 1);
    expect(g.cashNeeded).toBeCloseTo(90000 + g.acq.amount + 90000 * 0.004 - 60000, 4);
    expect(g.jeonseStress!.drop).toBeCloseTo(9000, 6);
  });
  it("시세 상승률을 올리면 IRR이 오른다", () => {
    expect(homeModel({ ...HOME_DEFAULT, priceGrowthPct: 5 }).irr!).toBeGreaterThan(r.irr!);
  });
});
