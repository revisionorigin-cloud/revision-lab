/**
 * 개인 주택 취득·보유·양도 세제와 대출 규제.
 * 규정은 자주 바뀐다. 각 규칙에 기준일·근거·검증 상태를 붙이고, 화면은 이 메타를 그대로 보여준다.
 * 금액 단위: 만원.
 *
 * ※ 아래 값은 2025~2026년 공표 기준을 정리한 것이며 세무사 검토 전 상태다(verified:false).
 *   실제 신고·대출 심사는 과세관청과 금융기관의 확정값을 따른다.
 */
export type RuleMeta = { id: string; title: string; basis: string; asOf: string; verified: boolean; note?: string };

export type HouseCount = 0 | 1 | 2 | 3; // 매입 전 보유 주택 수 (3 = 3채 이상)
export type Zone = "regulated" | "capital" | "other"; // 조정대상지역·투기과열지구 / 그 외 수도권 / 비수도권
export type PropertyKind = "apt" | "offi"; // 아파트(주택) / 오피스텔(건축물 취득)

export const RULES: Record<string, RuleMeta> = {
  acq: { id: "acq", title: "취득세", basis: "지방세법 제11조·제13조의2, 지방세법 시행령", asOf: "2025-01-01", verified: false,
    note: "다주택 중과 완화 논의가 있었으나 확정 전 기준으로 계산합니다. 85㎡ 초과분에 농어촌특별세가 붙습니다." },
  hold: { id: "hold", title: "보유세 (재산세·종합부동산세)", basis: "지방세법 제111조, 종합부동산세법 제8조·제9조", asOf: "2025-01-01", verified: false,
    note: "공시가격은 시세 × 현실화율로 추정합니다. 실제 공시가격은 부동산공시가격알리미에서 확인하십시오." },
  cgt: { id: "cgt", title: "양도소득세", basis: "소득세법 제89조·제95조·제104조, 지방소득세", asOf: "2025-01-01", verified: false,
    note: "다주택 중과는 한시 배제 기간을 전제로 기본세율을 적용합니다. 배제 종료 시 최대 30%p가 가산됩니다." },
  loan: { id: "loan", title: "주택담보대출 한도 (LTV·DSR)", basis: "은행업감독규정 · 금융위 가계부채 관리방안(2025.6.27) · 스트레스 DSR 3단계(2025.7)", asOf: "2025-07-01", verified: false,
    note: "규제지역·주택수·소득에 따라 달라지며 은행별 내규가 추가됩니다. 수도권 주담대 한도 6억원을 반영합니다." },
  rent: { id: "rent", title: "임대차 규제", basis: "주택임대차보호법 제6조의3·제7조·제7조의2", asOf: "2020-07-31", verified: true },
};

// ── 취득세 ───────────────────────────────────────────────────────────
export type AcqTax = { ratePct: number; eduPct: number; ruralPct: number; totalPct: number; amount: number; label: string };

/**
 * 주택 취득세. 1주택(신규 취득 후 1주택) 6억 이하 1% · 6~9억 1~3% 선형 · 9억 초과 3%.
 * 2주택 조정 8% · 3주택 이상 조정 12% · 비조정은 한 단계씩 낮음. 오피스텔은 건축물 4%.
 */
export function acquisitionTax(price: number, areaM2: number, kind: PropertyKind, houses: HouseCount, zone: Zone): AcqTax {
  if (kind === "offi") {
    const t = { ratePct: 4, eduPct: 0.4, ruralPct: 0.2, label: "오피스텔 (건축물)" };
    return { ...t, totalPct: 4.6, amount: price * 0.046 };
  }
  const after = houses + 1; // 취득 후 주택 수
  const reg = zone === "regulated";
  let rate: number;
  let label: string;
  if (after === 1 || (after === 2 && !reg)) {
    rate = price <= 60000 ? 1 : price >= 90000 ? 3 : ((price * 2) / 30000 - 3);
    label = after === 1 ? "1주택 표준세율" : "2주택 · 비조정 표준세율";
  } else if (after === 2 && reg) { rate = 8; label = "2주택 · 조정대상지역 중과"; }
  else if (after === 3 && !reg) { rate = 8; label = "3주택 · 비조정 중과"; }
  else { rate = 12; label = after >= 4 ? "4주택 이상 중과" : "3주택 · 조정대상지역 중과"; }
  const edu = rate >= 8 ? 0.4 : rate / 10;
  const rural = areaM2 > 85 ? (rate >= 12 ? 1.0 : rate >= 8 ? 0.6 : 0.2) : 0;
  const total = rate + edu + rural;
  return { ratePct: rate, eduPct: edu, ruralPct: rural, totalPct: total, amount: (price * total) / 100, label };
}

// ── 보유세 ───────────────────────────────────────────────────────────
export type HoldTax = { assessed: number; propertyTax: number; urbanTax: number; eduTax: number; compTax: number; total: number; note: string };

const bracket = (base: number, table: [number, number][], baseRate: number) => {
  // table: [상한, 세율%] 누진
  let tax = 0;
  let prev = 0;
  let rate = baseRate;
  for (const [cap, r] of table) {
    if (base > prev) tax += (Math.min(base, cap) - prev) * (r / 100);
    prev = cap;
    rate = r;
  }
  if (base > prev) tax += (base - prev) * (rate / 100);
  return tax;
};

/**
 * 연 보유세. 공시가격 = 시세 × 현실화율. 재산세 과표 = 공시가격 × 공정시장가액비율(1주택 45% · 다주택 60%).
 * 재산세 누진 0.1~0.4% + 도시지역분 0.14% + 지방교육세(재산세의 20%).
 * 종부세: 개인 합산 공시가격 − 9억(1세대1주택 12억) 초과분 × 60% → 0.5~2.7% (2주택 이하 기본세율).
 * 오피스텔은 주거용 과세 여부에 따라 달라지므로 건축물 기준 재산세(0.25%)로 계산한다.
 */
export function holdingTax(price: number, kind: PropertyKind, housesAfter: number, singleHousehold: boolean, realizationPct = 69, otherAssessed = 0): HoldTax {
  const assessed = price * (realizationPct / 100);
  if (kind === "offi") {
    const bld = assessed * 0.7 * 0.0025; // 건축물 과표(공정시장가액 70%) × 0.25%
    const urban = assessed * 0.7 * 0.0014;
    const edu = bld * 0.2;
    return { assessed, propertyTax: bld, urbanTax: urban, eduTax: edu, compTax: 0, total: bld + urban + edu, note: "건축물 기준. 주거용으로 과세되면 주택 세율과 종부세가 적용될 수 있습니다." };
  }
  const fmv = housesAfter <= 1 ? 0.45 : 0.6;
  const base = assessed * fmv;
  const propertyTax = bracket(base, [[6000, 0.1], [15000, 0.15], [30000, 0.25]], 0.4);
  const urbanTax = base * 0.0014;
  const eduTax = propertyTax * 0.2;
  const deduction = singleHousehold && housesAfter === 1 ? 120000 : 90000;
  const compBase = Math.max(0, assessed + otherAssessed - deduction) * 0.6;
  const compTax = compBase > 0 ? bracket(compBase, [[30000, 0.5], [60000, 0.7], [120000, 1.0], [250000, 1.3], [500000, 1.5], [940000, 2.0]], 2.7) * 1.2 : 0; // 농특세 20% 포함
  return { assessed, propertyTax, urbanTax, eduTax, compTax, total: propertyTax + urbanTax + eduTax + compTax, note: compTax > 0 ? "종합부동산세 포함 (기본세율 · 세부담 상한 미반영)" : "종합부동산세 과세 기준 미달" };
}

// ── 양도소득세 ───────────────────────────────────────────────────────
export type CapGainTax = { gain: number; exempt: number; taxable: number; ltDeductPct: number; taxRatePct: number; tax: number; label: string };

const INCOME_TABLE: [number, number][] = [[1400, 6], [5000, 15], [8800, 24], [15000, 35], [30000, 38], [50000, 40], [100000, 42]];

/**
 * 개인 주택 양도세 (지방소득세 10% 포함).
 * 보유 1년 미만 70% · 1~2년 60% (주택). 2년 이상 기본세율 6~45% 누진, 장기보유특별공제 3년~ 연 2%(최대 30%).
 * 1세대1주택 비과세: 2년 보유(조정지역 취득 시 2년 거주) 시 12억 이하 비과세, 초과분은 안분 과세하고 거주·보유 각 연 4%(최대 80%) 공제.
 */
export function capitalGainsTax(salePrice: number, costBasis: number, holdYears: number, kind: PropertyKind, singleExempt: boolean, livedYears = 0): CapGainTax {
  const gain = Math.max(0, salePrice - costBasis);
  if (gain === 0) return { gain, exempt: 0, taxable: 0, ltDeductPct: 0, taxRatePct: 0, tax: 0, label: "양도차익 없음" };
  const isHouse = kind === "apt";
  if (holdYears < 2) {
    const r = holdYears < 1 ? 70 : isHouse ? 60 : 40;
    return { gain, exempt: 0, taxable: gain, ltDeductPct: 0, taxRatePct: r * 1.1, tax: gain * (r / 100) * 1.1, label: `단기 보유 ${r}% (지방소득세 포함 ${(r * 1.1).toFixed(0)}%)` };
  }
  let exempt = 0;
  let taxable = gain;
  let ltDeductPct = Math.min(30, holdYears >= 3 ? holdYears * 2 : 0);
  let label = "기본세율 · 장기보유특별공제";
  if (isHouse && singleExempt) {
    if (salePrice <= 120000) return { gain, exempt: gain, taxable: 0, ltDeductPct: 0, taxRatePct: 0, tax: 0, label: "1세대1주택 비과세 (12억 이하)" };
    exempt = gain * (120000 / salePrice);
    taxable = gain - exempt;
    ltDeductPct = Math.min(80, (holdYears >= 3 ? Math.min(40, holdYears * 4) : 0) + (livedYears >= 2 ? Math.min(40, livedYears * 4) : 0));
    label = "1세대1주택 12억 초과분 과세 · 거주·보유 공제";
  }
  const afterDeduct = taxable * (1 - ltDeductPct / 100) - 250; // 기본공제 250만원
  const base = Math.max(0, afterDeduct);
  const tax = bracket(base, INCOME_TABLE, 45) * 1.1;
  const taxRatePct = base > 0 ? (tax / base) * 100 : 0;
  return { gain, exempt, taxable, ltDeductPct, taxRatePct, tax, label };
}

// ── 대출 한도 ─────────────────────────────────────────────────────────
export type LoanCap = { ltvPct: number; ltvCap: number; dsrCap: number | null; capitalCap: number | null; max: number; binding: "LTV" | "DSR" | "한도" | "불가"; note: string };

/**
 * 주택담보대출 한도. LTV: 규제지역 40% (다주택자 0) · 비규제 70% (다주택 60%).
 * DSR 40%: 연 원리금 상환액(기존 대출 포함) ≤ 연소득 × 40%. 스트레스 금리 가산(수도권 1.5%p · 지방 0.75%p)으로 한도를 계산.
 * 수도권 주담대 한도 6억원(2025.6.27). 오피스텔은 비주택 대출로 LTV 70%·DSR 적용.
 */
export function loanCap(price: number, zone: Zone, kind: PropertyKind, houses: HouseCount, incomeAnnual: number, existingDebtService: number, ratePct: number, termYears: number): LoanCap {
  let ltv: number;
  let note = "";
  if (kind === "offi") { ltv = 70; note = "비주택(오피스텔) 담보대출 기준"; }
  else if (zone === "regulated") { ltv = houses >= 1 ? 0 : 40; note = houses >= 1 ? "규제지역 다주택자 주담대 불가" : "규제지역 LTV 40%"; }
  else { ltv = houses >= 1 ? 60 : 70; note = houses >= 1 ? "비규제 · 다주택 LTV 60%" : "비규제 LTV 70%"; }
  const ltvCap = price * (ltv / 100);
  const capital = zone !== "other" && kind === "apt" ? 60000 : null;
  let dsrCap: number | null = null;
  if (incomeAnnual > 0) {
    const stress = (ratePct + (zone === "other" ? 0.75 : 1.5)) / 100 / 12;
    const nMon = Math.max(1, termYears) * 12;
    const room = Math.max(0, incomeAnnual * 0.4 - existingDebtService) / 12; // 월 상환 여력
    const annuityFactor = stress > 0 ? (stress * Math.pow(1 + stress, nMon)) / (Math.pow(1 + stress, nMon) - 1) : 1 / nMon;
    dsrCap = room / annuityFactor;
  }
  const cands: [number, LoanCap["binding"]][] = [[ltvCap, "LTV"]];
  if (dsrCap !== null) cands.push([dsrCap, "DSR"]);
  if (capital !== null) cands.push([capital, "한도"]);
  const [max, binding] = cands.reduce((a, b) => (b[0] < a[0] ? b : a));
  return { ltvPct: ltv, ltvCap, dsrCap, capitalCap: capital, max: Math.max(0, max), binding: max <= 0 ? "불가" : binding, note };
}

/** 원리금균등 월 상환액 */
export function monthlyPayment(loan: number, ratePct: number, termYears: number): number {
  const r = ratePct / 100 / 12;
  const n = Math.max(1, termYears) * 12;
  return r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : loan / n;
}
