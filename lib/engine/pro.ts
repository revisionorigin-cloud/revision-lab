import { axis, findLimits, runCore, type CapitalInput, type CoreResult, type Limits } from "./core";
import { breakevenOccupancy, rentalRevenue, RENTAL_DEFAULT, type RentalInput } from "./models/rental";
import { LOGISTICS_DEFAULT, OFFICE_DEFAULT, officeRevenue, type OfficeInput } from "./models/office";

/** 기관용 딜 하나의 전체 입력. 자산 유형에 따라 rental 또는 office 블록을 쓴다 */
export type ProAsset = "rental" | "office" | "logistics";
export const PRO_ASSET_LABEL: Record<ProAsset, string> = { rental: "임대주택 통매입", office: "오피스 매입", logistics: "물류센터 매입" };

export type ProInput = {
  asset: ProAsset;
  rental: RentalInput;
  office: OfficeInput;
  cap: CapitalInput;
};

export const CAP_DEFAULT: CapitalInput = {
  ltvPct: 50, baseRatePct: 3.2, spreadBp: 200, amortType: "bullet", amortYears: 30,
  prefAmt: 0, prefRatePct: 6, holdYears: 5, exitCapPct: 4.75, saleCostPct: 1.0,
  taxMode: "conduit", corpTaxPct: 22, buildingRatioPct: 40, deprYears: 40,
};

export const PRO_DEFAULT: ProInput = { asset: "rental", rental: RENTAL_DEFAULT, office: OFFICE_DEFAULT, cap: CAP_DEFAULT };

export const officeDefaultFor = (a: ProAsset): OfficeInput => (a === "logistics" ? LOGISTICS_DEFAULT : OFFICE_DEFAULT);

export type ProResult = CoreResult & {
  asset: ProAsset;
  /** 단가: 임대주택은 만원/전용평, 오피스·물류는 매입가(만원) */
  price0: number;
  priceLabel: string;
  breakevenOcc: number | null;
  cashRentPerUnit: number | null;
  gla: number | null; // 총 전용평 (임대주택) 또는 임대면적 (오피스)
};

export function runPro(i: ProInput, o: { price?: number; exitCapPct?: number } = {}): ProResult {
  const cap = o.exitCapPct !== undefined ? { ...i.cap, exitCapPct: o.exitCapPct } : i.cap;
  if (i.asset === "rental") {
    const ri = o.price !== undefined ? { ...i.rental, pricePerPy: o.price } : i.rental;
    const rev = rentalRevenue(ri, cap.holdYears);
    const core = runCore(rev, cap);
    const y1 = core.years[0];
    return {
      ...core, asset: i.asset, price0: ri.pricePerPy, priceLabel: "만원/전용평",
      breakevenOcc: y1 ? breakevenOccupancy(ri, rev.pgi1, y1.interest + y1.principal, rev.otherFixed) : null,
      cashRentPerUnit: rev.cashRentPerUnit, gla: rev.gla,
    };
  }
  const oi = { ...i.office, kind: i.asset === "logistics" ? "logistics" as const : "office" as const, ...(o.price !== undefined ? { price: o.price } : {}) };
  const rev = officeRevenue(oi, cap.holdYears);
  const core = runCore(rev, cap);
  return { ...core, asset: i.asset, price0: oi.price, priceLabel: "만원", breakevenOcc: null, cashRentPerUnit: null, gla: rev.nla };
}

export function proLimits(i: ProInput, targetIrrPct: number): Limits {
  const base = runPro(i);
  return findLimits(base, base.price0, i.cap.exitCapPct, (o) => runPro(i, o), targetIrrPct);
}

export type GridMetric = "leveredIrr" | "minDscr" | "avgCoC" | "equityMultiple";
export type GridSpec = { rowKey: string; rowVals: number[]; colKey: string; colVals: number[]; metric: GridMetric; title: string; rowLabel: string; colLabel: string; fmtRow: (v: number) => string; fmtCol: (v: number) => string; threshold: number; scale: number; floor?: number };

function setPath(i: ProInput, key: string, v: number): ProInput {
  const [group, field] = key.split(".");
  if (group === "cap") return { ...i, cap: { ...i.cap, [field]: v } };
  if (group === "rental") return { ...i, rental: { ...i.rental, [field]: v } };
  return { ...i, office: { ...i.office, [field]: v } };
}

export function proGrid(i: ProInput, g: GridSpec): (number | null)[][] {
  return g.rowVals.map((rv) => g.colVals.map((cv) => {
    const r = runPro(setPath(setPath(i, g.rowKey, rv), g.colKey, cv));
    return r.ok ? r[g.metric] : null;
  }));
}

export { axis };
