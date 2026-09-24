"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CfBars, Heat, HeatLegendMarks, StackBar } from "./charts";
import { fmtRo, Kpi, Memo, neg, Notice, NumField, scrollMode, SectionHead, Seg, Term, tidy, type MemoFigure } from "./fields";
import { SubNav, type SubNavTone } from "./Header";
import { MarketPanel } from "./MarketPanel";
import { rateOf, useMarket } from "./useMarket";
import { positions, suggestRental, verdict, type Provenance } from "@/lib/engine/assumptions";
import { axis, type AmortType, type CapitalInput, type YearRow } from "@/lib/engine/core";
import { CAP_DEFAULT, officeDefaultFor, PRO_ASSET_LABEL, PRO_DEFAULT, proGrid, proLimits, runPro, type GridSpec, type ProAsset, type ProInput } from "@/lib/engine/pro";
import type { ComplexStat, Market } from "@/lib/connectors/market";
import { RULES } from "@/lib/rules";
import { DASH, eok, mult, num, pct, pctv } from "@/lib/format";
import { BANDS_BY_ASSET, PY, type AreaBand } from "@/lib/connectors/types";

/* ─────────────────────────────────────────────────────────────────────────
   Model Desk Pro (DESIGN_SPEC §5.3 · §7 묶음 B)
   결론(memo)이 히어로 바로 아래에 오고 01 시장 · 02 언더라이팅 · 03 한계선 · 04 검증이 근거를 편다.
   같은 네 수치(IRR · EM · CoC · DSCR)가 memo(정본) · uw-summary · 서브내비 readout · 모바일 바에 나타나되 모두 같은 state를 읽는다.
   ───────────────────────────────────────────────────────────────────────── */

type Bench = "cd91" | "ktb3" | "base" | "corpAA" | "manual";
type AcqTaxMode = "offi" | "corp" | "custom";
type Group = "rental" | "office" | "cap";
type Basis = { label: string; complexKey: string | null; key: string };

/** Pro의 01 시장 절은 오피스텔 실거래가만 쓴다 (Home 교차 링크도 같은 자산으로 넘긴다) */
const MK_ASSET = "offi" as const;
const BENCH_LABEL: Record<string, string> = { base: "기준금리", cd91: "CD 91일", ktb3: "국고채 3년", corpAA: "회사채 AA-" };
const AMORT_LABEL: Record<AmortType, string> = { bullet: "만기일시", annuity: "원리금균등", straight: "원금균등" };
const TAB_KEYS = Object.keys(PRO_ASSET_LABEL) as ProAsset[];
const NAV_BASE = [
  { id: "underwrite", no: "02", label: "언더라이팅" },
  { id: "limits", no: "03", label: "한계선" },
  { id: "audit", no: "04", label: "검증" },
];
/** 접힌 고급 그룹과 그 안의 키. 시장 채우기로 값이 바뀌면 그룹을 연다 (§4.5) */
const ADV_GROUPS: Record<string, string[]> = {
  cost: ["rental.opexPct", "rental.capexPct", "rental.holdTaxPct"],
  ocost: ["office.opexPerPy", "office.opexGrowthPct", "office.aumFeePct", "office.fixedCost"],
  pref: ["cap.prefAmt", "cap.prefRatePct"],
  sale: ["cap.saleCostPct", "cap.taxMode", "cap.corpTaxPct", "cap.buildingRatioPct", "cap.deprYears"],
};

const mkKey = (code: string, band: AreaBand, key: string | null) => `${MK_ASSET}|${code}|${band}|${key ?? ""}`;
const bandOf = (s: string | null): AreaBand => (BANDS_BY_ASSET[MK_ASSET].some((b) => b.id === s) ? (s as AreaBand) : "all");
const ymOf = (s: string) => s.slice(0, 7);
/** 요약용 % 표기: 15 → 15% · 0.25 → 0.25% · 4.6 → 4.6% */
const pcs = (v: number) => `${num(v, Number.isInteger(v) ? 0 : Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2)}%`;
const signedP = (v: number) => neg(`${v > 0 ? "+" : ""}${num(v, 2)}%p`);
const getPath = (i: ProInput, key: string): unknown => { const [g, f] = key.split(".") as [Group, string]; return (i[g] as unknown as Record<string, unknown>)[f]; };

function Sep() { return <span className="sep" aria-hidden="true">·</span>; }
/** 파생값 문장. ≤600에서 한 줄 말줄임되므로 전문을 title로 (§4.5) */
const dv = (s: string) => <span title={s}>{s}</span>;

export default function ProApp() {
  const params = useSearchParams();
  const [code, setCode] = useState(() => { const c = params.get("code"); return c && /^\d{5}$/.test(c) ? c : "11560"; });
  const [band, setBand] = useState<AreaBand>(() => bandOf(params.get("band")));
  const [selectedKey, setSelectedKey] = useState<string | null>(() => params.get("key") || null);
  const seedKey = useRef(params.get("key") || null);
  const [raw, setRaw] = useState<ProInput>(PRO_DEFAULT);
  const [from, setFrom] = useState<Provenance>({});
  const [basis, setBasis] = useState<Basis | null>(null);
  const [fillSnap, setFillSnap] = useState<ProInput | null>(null);
  const [editedKeys, setEditedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [confirm, setConfirm] = useState<{ c: ComplexStat | null } | null>(null);
  const [bench, setBench] = useState<Bench>("cd91");
  const [target, setTarget] = useState(8);
  const [acqTaxMode, setAcqTaxMode] = useState<AcqTaxMode>(() => (PRO_DEFAULT.rental.acqTaxPct === 12.4 ? "corp" : PRO_DEFAULT.rental.acqTaxPct === 4.6 ? "offi" : "custom"));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inputsVisible, setInputsVisible] = useState(false);
  const [live, setLive] = useState("");
  const autofilled = useRef(false);
  const inputRef = useRef(raw);
  const snapRef = useRef<ProInput | null>(null);
  /** 자본구조·매각 가정은 탭별로 따로 둔다. 임대주택의 시장 채우기(LTV·Exit Cap)가 오피스·물류로 새지 않는다 (§4.5 출처) */
  const capByAsset = useRef<{ rental: CapitalInput | null; office: CapitalInput | null }>({ rental: null, office: null });
  const advRefs = useRef<Record<string, HTMLDetailsElement | null>>({});
  const mainRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => { inputRef.current = raw; }, [raw]);

  const go = useCallback((id: string) => {
    setSheetOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: scrollMode(), block: "start" });
  }, []);

  const fill = useCallback((m: Market, c: ComplexStat | null) => {
    const prev = inputRef.current;
    const s = suggestRental(prev, m, c);
    setRaw(s.input);
    setFrom(s.from);
    snapRef.current = s.input;
    setFillSnap(s.input);
    setEditedKeys(new Set());
    setConfirm(null);
    const gu = m.meta.name.split(" ").pop() ?? m.meta.name;
    setBasis({ label: c ? `${gu} ${c.name} 단지값` : `${gu} 오피스텔 시장값`, complexKey: c?.key ?? null, key: mkKey(m.meta.code, m.band, c?.key ?? null) });
    // 접힌 그룹 안 값이 바뀌었으면 연다
    for (const [g, keys] of Object.entries(ADV_GROUPS)) {
      if (keys.some((k) => getPath(prev, k) !== getPath(s.input, k))) { const el = advRefs.current[g]; if (el) el.open = true; }
    }
  }, []);

  const onLoaded = useCallback((m: Market) => {
    if (autofilled.current) return;
    autofilled.current = true;
    const c = seedKey.current ? m.complexes.find((x) => x.key === seedKey.current) ?? null : null;
    fill(m, c);
  }, [fill]);

  const { regions, regionsError, rates, market, loading, error, detail, detailError, retry } = useMarket(MK_ASSET, code, band, selectedKey, onLoaded);

  const benchRate = bench === "manual" ? null : rateOf(rates, bench);
  const corpAA = rateOf(rates, "corpAA");
  const baseRate = rateOf(rates, "base");
  const legalCapPct = baseRate === null ? null : Math.min(10, baseRate + 2);
  const input = useMemo<ProInput>(() => (benchRate === null ? raw : { ...raw, cap: { ...raw.cap, baseRatePct: benchRate } }), [raw, benchRate]);

  const set = useCallback(<G extends Group, K extends keyof ProInput[G]>(g: G, k: K, v: ProInput[G][K]) => {
    setRaw((p) => ({ ...p, [g]: { ...p[g], [k]: v } }));
    const snap = snapRef.current;
    if (!snap || inputRef.current.asset !== "rental") return;
    const key = `${g}.${String(k)}`;
    const same = getPath(snap, key) === v;
    setEditedKeys((s) => { if (same ? !s.has(key) : s.has(key)) return s; const n = new Set(s); if (same) n.delete(key); else n.add(key); return n; });
  }, []);
  const restore = useCallback((key: string) => {
    const snap = snapRef.current;
    if (!snap) return;
    const [g, f] = key.split(".") as [Group, string];
    setRaw((p) => ({ ...p, [g]: { ...p[g], [f]: getPath(snap, key) } }));
    setEditedKeys((s) => { if (!s.has(key)) return s; const n = new Set(s); n.delete(key); return n; });
  }, []);
  const restoreAll = () => { const snap = snapRef.current; if (!snap) return; setRaw(snap); setEditedKeys(new Set()); };
  const setAsset = (a: ProAsset) => {
    setRaw((p) => {
      if (p.asset === a) return p;
      const wasRental = p.asset === "rental";
      const toRental = a === "rental";
      let cap = p.cap;
      if (wasRental !== toRental) {
        capByAsset.current[wasRental ? "rental" : "office"] = p.cap;
        cap = capByAsset.current[toRental ? "rental" : "office"] ?? (toRental ? p.cap : CAP_DEFAULT);
      }
      return { ...p, asset: a, cap, office: toRental ? p.office : (p.office.kind === (a === "logistics" ? "logistics" : "office") ? p.office : officeDefaultFor(a)) };
    });
  };

  const r = useMemo(() => runPro(input), [input]);
  const L = useMemo(() => proLimits(input, target), [input, target]);
  const pos = useMemo(() => positions(input, r, market, corpAA), [input, r, market, corpAA]);
  const V = useMemo(() => verdict(input, r, L, target, pos), [input, r, L, target, pos]);
  const asset = input.asset;
  const isRental = asset === "rental";
  const allIn = r.rate * 100;
  const irr = r.leveredIrr;
  const irrPct = irr === null ? null : irr * 100;
  const computable = r.ok && irrPct !== null;
  const priceGap = L.maxPrice === null ? null : (L.maxPrice / r.price0 - 1) * 100;
  const maxPriceTxt = L.maxPrice === null ? DASH : isRental ? `${num(L.maxPrice, 0)}만원/평` : eok(L.maxPrice);
  // 단가 옆에 총액(임대주택) 또는 평당가(오피스)를 병기해 규모를 바로 가늠하게 한다
  const maxTotalTxt = L.maxPrice === null ? "" : isRental ? (r.gla ? `총 ${eok(L.maxPrice * r.gla)} · ` : "") : `연면적 평당 ${num(L.maxPrice / input.office.gfaPy, 0)}만원 · `;
  // 「수정됨」과 시장값 되돌리기는 시장값이 채워지는 임대주택 탭에서만 뜻이 있다
  const edited = isRental && editedKeys.size > 0;
  const editedMarket = useMemo(() => [...editedKeys].filter((k) => from[k] !== undefined).length, [editedKeys, from]);
  const idle = isRental && loading && basis === null;
  const tone: SubNavTone = idle ? null : V.tone === "bad" ? "neg" : V.tone;
  const toneLabel = !computable ? "계산 불가" : (irrPct as number) < 0 ? "원금 손실" : (irrPct as number) >= target ? "목표 충족" : "목표 미달";
  const bandLabel = BANDS_BY_ASSET[MK_ASSET].find((b) => b.id === band)?.label ?? "전체";

  /* ── 결론 문장 (엔진 값 그대로 · 토큰형) ── */
  const targetField = <NumField compact id="target-irr" label="목표" unit="%" value={target} min={0} max={40} step={0.5} onChange={setTarget} />;
  const headTokens: string[] = [];
  let headNode: ReactNode;
  if (!computable) {
    headTokens.push("수익률을 계산할 수 없는 구조", "대출·우선주·승계 보증금의 합이 총 취득원가를 넘거나 현금흐름이 성립하지 않습니다");
    headNode = <>{headTokens[0]}<Sep />{headTokens[1]}</>;
  } else {
    const ip = irrPct as number;
    const diff = signedP(ip - target);
    headTokens.push(`Levered IRR ${neg(pct(irr))}`, `목표 ${pctv(target, 1)} 대비 ${diff}`);
    if (L.maxPrice !== null && priceGap !== null) headTokens.push(`목표 충족 ${isRental ? "매입 단가" : "매입가"} ${maxPriceTxt} (${maxTotalTxt}현재 대비 ${neg(pctv(priceGap, 1, true))})`);
    const agg = ip >= target && V.tally.aggressive > 0;
    if (agg) headTokens.push(`공격적 가정 ${V.tally.aggressive}개에 의존`);
    headNode = (
      <>
        Levered IRR {neg(pct(irr))}<Sep />
        <span className="memo-target">{targetField}</span> 대비 {diff}
        {L.maxPrice !== null && priceGap !== null ? <><Sep /><span className="nowrap">목표 충족 {isRental ? "매입 단가" : "매입가"}</span> {maxPriceTxt} ({maxTotalTxt}현재 대비 {neg(pctv(priceGap, 1, true))})</> : null}
        {agg ? <><Sep />공격적 가정 {V.tally.aggressive}개에 의존</> : null}
      </>
    );
  }
  const headText = headTokens.join(" · ");

  const figures: MemoFigure[] = [
    { label: `Levered IRR${input.cap.taxMode === "corp" ? " · 세후" : ""}`, term: "Levered IRR", value: pct(irr), tone: irr !== null && irr < 0 ? "neg" : undefined, xl: true, sub: `보통주 현금흐름 NPV = 0 할인율 · Unlevered ${neg(pct(r.unleveredIrr))}` },
    { label: "Equity Multiple", term: "Equity Multiple", value: mult(r.equityMultiple), sub: `총 회수 ÷ 보통주 자기자본 ${eok(r.equity)}` },
    { label: "Cash-on-Cash", term: "Cash-on-Cash", value: pct(r.avgCoC), tone: r.avgCoC !== null && r.avgCoC < 0 ? "neg" : undefined, sub: "보유기간 배당가능 현금 ÷ 자기자본 · 연평균" },
    { label: "최소 DSCR", term: "DSCR", value: mult(r.minDscr), tone: r.minDscr !== null && r.minDscr < 1 ? "neg" : undefined, sub: "NOI ÷ 연 원리금 · 보유기간 최소 연도" },
  ];
  // 대주가 실제로 보는 세 지표(실질 LTV · Debt Yield · DSCR)와 매각가 하락 한계를 한 줄로
  const minDscrYear = r.minDscr === null ? 0 : r.years.findIndex((y) => y.dscr !== null && Math.abs(y.dscr - (r.minDscr as number)) < 1e-12) + 1;
  const lender = r.loan === 0
    ? "대출 없이 자기자본과 승계 보증금만으로 취득하는 구조입니다."
    : [
      "대주 기준",
      `실질 LTV ${pct(r.effLtv, 1)} (대출 ${pcs(input.cap.ltvPct)}${r.deposits > 0 ? ` + 보증금 ${pct(r.deposits / r.price, 1)}` : ""})`,
      r.debtYield !== null ? `Debt Yield ${pct(r.debtYield)}` : null,
      r.minDscr !== null ? `최소 DSCR ${mult(r.minDscr)}${minDscrYear > 0 ? ` (${minDscrYear}년차)` : ""}${r.minDscr < 1.2 ? " · 1.2x 미달" : ""}` : null,
      L.debtCover ? `매각가가 매입가 대비 ${neg(pctv(L.debtCover.saleVsPrice * 100, 1, true))}까지 내려가도 원리금·보증금 전액 상환` : "매각가 하락 한계를 탐색 구간 안에서 찾지 못했습니다",
    ].filter(Boolean).join(" · ");
  /** 검산 항목별 실제 판정 허용치 (lib/engine/core.ts checks의 pass 조건과 같은 식) */
  const tolTxt = (label: string) => {
    const t = label.startsWith("조달") ? [1e-6 * Math.max(1, r.uses), 2] : label.startsWith("IRR") ? [1e-4 * Math.max(1, r.equity), 0] : label.startsWith("매각가") ? [1e-6 * Math.max(1, Math.abs(r.fwdNoi)), 4] : label.startsWith("대출 상환") ? [1e-6 * Math.max(1, r.loan), 2] : null;
    return t ? ` · 허용 ±${num(t[0], t[1])}만원` : "";
  };
  /** IC 메모 첫 장의 딜 규모·자본구조 한 줄 (§4.7 결론 블록 완결성) */
  const dealLine = neg(isRental
    ? `매입가 ${eok(r.price)} (${num(input.rental.pricePerPy, 0)}만원/평 · 전용 ${num(r.gla, 0)}평) · 총 취득원가 ${eok(r.uses)} = 대출 ${eok(r.loan)} (LTV ${pcs(input.cap.ltvPct)})${r.pref > 0 ? ` + 우선주 ${eok(r.pref)}` : ""} + 보증금 ${eok(r.deposits)} + 자기자본 ${eok(r.equity)} · 보유 ${input.cap.holdYears}년 · 진입 Cap ${pct(r.goingInCap)} → Exit ${pctv(input.cap.exitCapPct, 2)} · 매각가 ${eok(r.saleValue)}`
    : `매입가 ${eok(r.price)} (연면적 평당 ${num(input.office.price / input.office.gfaPy, 0)}만원 · ${num(input.office.gfaPy, 0)}평) · 총 취득원가 ${eok(r.uses)} = 대출 ${eok(r.loan)} (LTV ${pcs(input.cap.ltvPct)})${r.pref > 0 ? ` + 우선주 ${eok(r.pref)}` : ""} + 보증금 ${eok(r.deposits)} + 자기자본 ${eok(r.equity)} · 보유 ${input.cap.holdYears}년 · 진입 Cap ${pct(r.goingInCap)} → Exit ${pctv(input.cap.exitCapPct, 2)} · 매각가 ${eok(r.saleValue)}`);
  const snapTxt = market ? (market.meta.mode === "live" ? `실거래가 OpenAPI ${market.meta.fetchedAt}` : `실거래가 ${ymOf(market.meta.to)} 스냅샷`) : "실거래가 불러오는 중";
  const ratesTxt = rates ? `금리 ECOS ${rates.fetchedAt}${rates.live ? "" : " (마지막 확인값)"}` : "금리 불러오는 중";
  const objectTxt = isRental ? `${num(input.rental.units)}세대 ${basis?.complexKey ? "물건" : "가상 물건"}` : PRO_ASSET_LABEL[asset];
  /** 오피스·물류는 실거래가를 쓰지 않으므로 근거 줄·CSV 머리·인쇄 머리줄에 스냅샷을 인용하지 않는다 (§4.7(5) · §4.14) */
  const dataTxt = isRental ? snapTxt : "렌트롤·관리비 수지";
  const basisText = `가정 기준 · ${isRental ? basis?.label ?? "직접 입력" : "직접 입력"} · ${objectTxt} · ${dataTxt} · ${ratesTxt}`;
  const navBasis = isRental ? (basis ? `${basis.label} · ${num(input.rental.units)}세대${edited ? " · 수정됨" : ""}` : "시장값 불러오는 중") : `${PRO_ASSET_LABEL[asset]} · 직접 입력${edited ? " · 수정됨" : ""}`;
  const readouts = [
    { label: "Levered IRR", value: idle ? "" : fmtRo(irr, "pct"), href: "#memo" },
    { label: "최소 DSCR", value: idle ? "" : fmtRo(r.minDscr, "mult"), href: "#results" },
    { label: isRental ? "최대 매입 단가" : "최대 매입가", value: idle ? "" : fmtRo(L.maxPrice, isRental ? "py" : "eok"), href: "#limits" },
  ];
  const kpi4 = (extra?: { compact?: boolean }) => figures.map((f, k) => <Kpi key={k} label={f.label} value={f.value} tone={f.tone} compact={extra?.compact} />);

  // sr-only 방송: 결론 문장을 1초 디바운스로 (role="status" 없음)
  useEffect(() => {
    if (idle) return;
    const t = setTimeout(() => setLive(headText), 1000);
    return () => clearTimeout(t);
  }, [headText, idle]);

  // 모바일 바 우측 버튼: #inputs가 보이면 「결론 보기」, 아니면 「가정 고치기 ↓」
  useEffect(() => {
    const el = document.getElementById("inputs");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInputsVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 인쇄: 접힌 details 전부 열고 afterprint에 복원 (차트 폭 재측정은 charts.tsx가 beforeprint에서 한다)
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      const root = mainRef.current;
      if (!root) return;
      opened = Array.from(root.querySelectorAll<HTMLDetailsElement>("details:not([open])"));
      opened.forEach((d) => { d.open = true; });
    };
    const after = () => { opened.forEach((d) => { d.open = false; }); opened = []; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);

  // 주소에 지역·면적·단지를 남긴다 (공유·교차 링크용, 스크롤 없음)
  useEffect(() => {
    const q = new URLSearchParams();
    q.set("asset", MK_ASSET); q.set("code", code); q.set("band", band);
    if (selectedKey) q.set("key", selectedKey);
    const next = `${window.location.pathname}?${q.toString()}${window.location.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
  }, [code, band, selectedKey]);

  /* ── 민감도 표 ── */
  const grids = useMemo<{ spec: GridSpec; v: (number | null)[][] }[]>(() => {
    const g1: GridSpec = { rowKey: "cap.exitCapPct", rowVals: axis(input.cap.exitCapPct, 0.25, 7, 0.5), colKey: isRental ? "rental.rentGrowthPct" : "office.rentGrowthPct", colVals: axis(isRental ? input.rental.rentGrowthPct : input.office.rentGrowthPct, 0.5, 5, -5), metric: "leveredIrr", title: "Exit Cap × 임대료 성장률 → Levered IRR", rowLabel: "Exit Cap", colLabel: "성장률", fmtRow: (v) => pctv(v, 2), fmtCol: (v) => pctv(v, 1), threshold: target / 100, scale: 0.08, floor: 0 };
    const g2: GridSpec = { rowKey: "cap.spreadBp", rowVals: axis(input.cap.spreadBp, 50, 7, 0), colKey: isRental ? "rental.vacancyPct" : "office.vacancyPct", colVals: axis(isRental ? input.rental.vacancyPct : input.office.vacancyPct, 2.5, 5, 0), metric: "minDscr", title: "가산금리 × 공실률 → 최소 DSCR", rowLabel: "가산금리", colLabel: "공실률", fmtRow: (v) => `${num(v)}bp`, fmtCol: (v) => pctv(v, 1), threshold: 1.2, scale: 0.6, floor: 1 };
    // 심사역이 가장 먼저 찾는 표: 단가를 얼마까지 깎으면 목표가 되고, Exit Cap이 25bp 움직이면 그 여유가 얼마나 남는가.
    // 최대 매입 단가(목표를 딱 맞추는 단가)를 행 하나로 끼워 넣어 그 행이 현재 Exit Cap 열에서 목표와 만나는 것을 눈으로 확인한다.
    const g3: GridSpec = (() => {
      const cur = isRental ? input.rental.pricePerPy : input.office.price;
      const step = isRental ? Math.max(10, Math.round((cur * 0.04) / 10) * 10) : Math.max(10000, Math.round((cur * 0.04) / 10000) * 10000);
      const base = axis(cur, step, 7, step);
      const mp = L.maxPrice === null || L.maxPrice <= 0 ? null : isRental ? Math.round(L.maxPrice) : Math.round(L.maxPrice / 1000) * 1000;
      const rowVals = mp !== null && !base.includes(mp) ? [...base, mp].sort((a, b) => a - b) : base;
      const fmtP = (v: number) => (isRental ? num(v) : eok(v));
      return { rowKey: isRental ? "rental.pricePerPy" : "office.price", rowVals, colKey: "cap.exitCapPct", colVals: axis(input.cap.exitCapPct, 0.25, 5, 0.25), metric: "leveredIrr", title: `${isRental ? "매입 단가" : "매입가"} × Exit Cap → Levered IRR`, rowLabel: isRental ? "단가" : "매입가", colLabel: "Exit Cap", fmtRow: (v) => (v === mp ? `${fmtP(v)} 목표` : fmtP(v)), fmtCol: (v) => pctv(v, 2), threshold: target / 100, scale: 0.08, floor: 0 };
    })();
    // 보증금 행 축은 step ≤ 현재값/2 로 잡아 lib axis()가 시작점을 0으로 클램프하지 않게 한다. 그래야 현재값이 중앙 행에 오고 기준칸이 KPI와 같은 값이 된다 (§4.9)
    const depStep = (() => { const half = input.rental.depositPerUnit / 2; const u = half >= 100 ? 100 : 10; return Math.max(10, Math.min(1500, Math.floor(half / u) * u)); })();
    const g4: GridSpec = isRental
      ? { rowKey: "rental.depositPerUnit", rowVals: axis(input.rental.depositPerUnit, depStep, 5, 0), colKey: "cap.ltvPct", colVals: axis(input.cap.ltvPct, 5, 5, 0), metric: "leveredIrr", title: "세대당 보증금 × LTV → Levered IRR", rowLabel: "보증금", colLabel: "LTV", fmtRow: (v) => `${num(v)}만원`, fmtCol: (v) => pctv(v, 0), threshold: target / 100, scale: 0.08, floor: 0 }
      : { rowKey: "office.rentPerPy", rowVals: axis(input.office.rentPerPy, Math.max(0.25, Math.round(input.office.rentPerPy * 0.05 * 4) / 4), 5, 0.25), colKey: "cap.ltvPct", colVals: axis(input.cap.ltvPct, 5, 5, 0), metric: "leveredIrr", title: "임대료 × LTV → Levered IRR", rowLabel: "임대료/평", colLabel: "LTV", fmtRow: (v) => `${num(v, 2)}만`, fmtCol: (v) => pctv(v, 0), threshold: target / 100, scale: 0.08, floor: 0 };
    return [g1, g2, g3, g4].map((spec) => ({ spec, v: proGrid(input, spec) }));
  }, [input, isRental, target, L.maxPrice]);
  const idx = (xs: number[], v: number) => xs.reduce((best, x, k) => (Math.abs(x - v) < Math.abs(xs[best] - v) ? k : best), 0);
  const gridVal = (key: string) => getPath(input, key) as number;
  const heatFigure = ({ spec, v }: (typeof grids)[number]) => {
    const isDscr = spec.metric === "minDscr";
    const rows = spec.rowVals.map(spec.fmtRow);
    const cols = spec.colVals.map(spec.fmtCol);
    const cr = idx(spec.rowVals, gridVal(spec.rowKey));
    const cc = idx(spec.colVals, gridVal(spec.colKey));
    const fmt = (x: number | null) => (x === null ? DASH : isDscr ? mult(x) : pctv(x * 100, 1));
    const fmtBase = (x: number | null) => (x === null ? DASH : isDscr ? mult(x) : pctv(x * 100, 2));
    const base = v[cr]?.[cc] ?? null;
    return (
      <figure key={spec.title}>
        <figcaption>{spec.title} <HeatLegendMarks pos={isDscr ? "DSCR 1.2x 이상" : `목표 ${pctv(target, 1)} 이상`} neg="미만" note={`굵은 테두리 현재 가정 · 붉은 테두리 ${isDscr ? "DSCR 1.0x 미만" : "원금 손실"}`} /></figcaption>
        <Heat rowLabel={spec.rowLabel} colLabel={spec.colLabel} rows={rows} cols={cols} values={v} fmt={fmt} fmtBase={fmtBase}
          threshold={spec.threshold} thresholdLabel={isDscr ? "DSCR 1.2x" : `목표 IRR ${pctv(target, 1)}`} scale={spec.scale} centerRow={cr} centerCol={cc} floor={spec.floor} title={spec.title}
          readLabel={(ri, ci, x) => `${spec.rowLabel} ${rows[ri]} × ${spec.colLabel} ${cols[ci]} → ${isDscr ? "DSCR" : "IRR"} ${fmtBase(x)} (현재 ${fmtBase(base)})`} />
        {spec.rowKey === "rental.depositPerUnit" && legalCapPct !== null ? <p className="fine">전환율 {pctv(input.rental.convRatePct, 2)}는 보증금의 실질 조달비용입니다. 기존 임차인의 보증금을 월세로 돌릴 때는 법정 상한 {pctv(legalCapPct, 2)}(기준금리 + 2%p, {RULES.rent.basis})가 적용됩니다.</p> : null}
      </figure>
    );
  };

  /* ── 결과열 주석 ── */
  const notes: { tone: "warn" | "ok" | "info"; text: string }[] = r.warnings.map((w) => ({ tone: "warn" as const, text: w }));
  if (r.ok) {
    if (Number.isFinite(r.goingInCap) && r.loan > 0) notes.push(r.goingInCap < r.rate
      ? { tone: "warn", text: `역레버리지. 진입 Cap ${pct(r.goingInCap)}가 대출금리 ${pctv(allIn, 2)}보다 낮습니다. 대출을 늘릴수록 보유기간 현금수익률이 떨어지고 수익은 매각차익에 의존합니다.` }
      : { tone: "ok", text: `정(+)의 레버리지. 진입 Cap ${pct(r.goingInCap)}가 대출금리 ${pctv(allIn, 2)}보다 높습니다.` });
    if (r.minDscr !== null) notes.push({ tone: r.minDscr < 1.2 ? "warn" : "ok", text: `최소 DSCR ${mult(r.minDscr)}. 통상 요구 수준 1.2x ${r.minDscr < 1.2 ? "미달" : "충족"}${r.breakevenOcc !== null ? ` · 1년차 손익분기 입주율 ${pct(r.breakevenOcc, 1)}` : ""}.` });
    if (r.effLtv > 0.7) notes.push({ tone: "warn", text: r.loan > 0 ? `보증금을 포함한 실질 LTV ${pct(r.effLtv, 1)}. 대주는 선순위 임차보증금을 한도에서 차감하므로 LTV ${pctv(input.cap.ltvPct, 0)} 조달이 어려울 수 있습니다.` : `승계 보증금만으로 매입가의 ${pct(r.effLtv, 1)}입니다. 추가 대출 여력이 없고 역전세 유동성을 따로 확보해야 합니다.` });
    if (V.tally.aggressive > 0) notes.push({ tone: "warn", text: `시장 대비 공격적인 가정 ${V.tally.aggressive}개. 입력란의 표시를 확인하십시오. 이 수익률은 그 가정이 실현될 때만 성립합니다.` });
  }

  /* ── 채우기 · 되돌리기 (§4.5 · §4.6) ── */
  const regionStale = basis?.key !== mkKey(code, band, null);
  const fillLabel = !regionStale && editedMarket === 0 ? "언더라이팅으로 이동" : "이 지역 시장값으로 가정 채우기";
  const requestFill = (c: ComplexStat | null) => {
    if (!market) return;
    if (editedMarket > 0) { setConfirm({ c }); return; }
    fill(market, c);
    go("inputs");
  };
  const onFillRegion = () => {
    if (!market) return;
    if (!regionStale && editedMarket === 0) { go("inputs"); return; }
    requestFill(null);
  };
  const fillConfirm = confirm ? (
    <Notice tone="warn" className="fill-confirm">
      고친 값 {editedMarket}개를 시장값으로 바꿉니다
      <button type="button" className="link" onClick={() => { if (market) { fill(market, confirm.c); go("inputs"); } }}>바꾸기</button>
      <button type="button" className="link" onClick={() => setConfirm(null)}>취소</button>
    </Notice>
  ) : undefined;
  const homeHref = `/home?asset=${MK_ASSET}&code=${code}&band=${band}${selectedKey ? `&key=${encodeURIComponent(selectedKey)}` : ""}`;

  /** 필드별 출처·위치·되돌리기 props. 편집된 키는 「직접 입력 · 시장값 X [되돌리기]」 */
  const fp = (key: string) => {
    if (!isRental) return { position: pos[key] };
    const src = from[key];
    const ed = editedKeys.has(key);
    const mv = fillSnap ? (getPath(fillSnap, key) as number) : undefined;
    return { position: pos[key], source: ed ? undefined : src, ...(ed && src !== undefined && mv !== undefined ? { marketValue: mv, onRestore: () => restore(key) } : {}) };
  };

  const onCsv = () => {
    // 메모를 대신할 수 있게 3블록: (1) 머리 + 가정(값·단위·출처·시장 대비 위치) (2) 결과 KPI·한계선·조달과 사용 (3) 연도별 현금흐름 + 매각 분해.
    // 금액은 만원 정수, 음수는 ASCII 하이픈(스프레드시트가 숫자로 읽도록), 쉼표·따옴표가 든 문구는 따옴표로 감싼다.
    const q = (s: string | number | null | undefined) => { const t = s === null || s === undefined ? "" : String(s); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, "\"\"")}"` : t; };
    const n0 = (v: number) => String(Math.round(v));
    const fx = (v: number | null | undefined, d: number) => (v === null || v === undefined || !Number.isFinite(v) ? "" : v.toFixed(d));
    const rows: string[][] = [];
    const P = (...cells: (string | number | null | undefined)[]) => { rows.push(cells.map(q)); };
    // 출처(from)는 임대주택 채우기의 provenance라 오피스·물류 탭에서는 쓰지 않는다 (화면 fp()와 같은 규칙)
    const A = (label: string, v: string | number, unit: string, key?: string) => P(label, v, unit, key && isRental ? from[key] ?? "" : "", key ? pos[key]?.text ?? "" : "");
    const c = input.cap;
    P("RE:LAB Model Desk Pro", navBasis, dataTxt, ratesTxt, `결론 · ${toneLabel}`);
    P();
    P("가정", "값", "단위", "출처", "시장 대비 위치");
    if (isRental) {
      A("지역", market ? `${market.meta.name} ${bandLabel}` : "", "");
      A("자산", "오피스텔 · 임대주택 통매입", "");
      A("세대수", input.rental.units, "세대", "rental.units");
      A("세대당 전용면적", input.rental.areaPy, "평", "rental.areaPy");
      A("매입 단가", input.rental.pricePerPy, "만원/전용평", "rental.pricePerPy");
      A("매입가", n0(r.price), "만원");
      A("취득세", input.rental.acqTaxPct, "% (매입가 대비)");
      A("기타 취득부대비", input.rental.acqCostPct, "% (매입가 대비)");
      A("환산월세", input.rental.effRentPerPy, "만원/전용평·월", "rental.effRentPerPy");
      A("세대당 보증금", input.rental.depositPerUnit, "만원", "rental.depositPerUnit");
      A("전월세전환율", input.rental.convRatePct, "%", "rental.convRatePct");
      A("안정화 공실률", input.rental.vacancyPct, "%", "rental.vacancyPct");
      A("임대료 성장률", input.rental.rentGrowthPct, "%/년", "rental.rentGrowthPct");
      A("운영비", input.rental.opexPct, "% (EGI 대비)", "rental.opexPct");
      A("수선·교체 적립", input.rental.capexPct, "% (EGI 대비)");
      A("보유세", input.rental.holdTaxPct, "%/년 (매입가 대비)");
    } else {
      A("자산", PRO_ASSET_LABEL[asset], "");
      A("매입가", input.office.price, "만원", "office.price");
      A("연면적", input.office.gfaPy, "평");
      A("전용률", input.office.effRatioPct, "%");
      A("취득세", input.office.acqTaxPct, "% (매입가 대비)");
      A("기타 취득부대비", input.office.acqCostPct, "% (매입가 대비)");
      A("NOI 직접 입력", input.office.noiDirect, "만원/년 (0이면 임대료로 계산)");
      A("임대료", input.office.rentPerPy, "만원/임대평·월", "office.rentPerPy");
      A("관리비 순수입", input.office.mgmtNetPerPy, "만원/임대평·월");
      A("공실률", input.office.vacancyPct, "%", "office.vacancyPct");
      A("기타 수입", input.office.otherIncome, "만원/년");
      A("보증금", input.office.depositPerPy, "만원/임대평");
      A("보증금 운용수익률", input.office.depositRatePct, "%");
      A("임대료 성장률", input.office.rentGrowthPct, "%/년");
      A("운영비", input.office.opexPerPy, "만원/연면적평·월");
      A("운영비 상승률", input.office.opexGrowthPct, "%/년");
      A("운용보수", input.office.aumFeePct, "%/년 (매입가 대비)");
      A("기타 고정비", input.office.fixedCost, "만원/년");
    }
    A("선순위 대출 LTV", c.ltvPct, "% (매입가 대비)", "cap.ltvPct");
    P("기준금리 지표", bench === "manual" ? "직접 입력" : BENCH_LABEL[bench] ?? bench, "", benchMeta, "");
    A("기준금리", c.baseRatePct, "%");
    A("가산금리", c.spreadBp, "bp", "cap.spreadBp");
    A("대출금리", fx(allIn, 2), "%");
    A("상환 방식", AMORT_LABEL[c.amortType], "");
    if (c.amortType !== "bullet") A("상환 기간", c.amortYears, "년");
    A("우선주", c.prefAmt, "만원");
    if (c.prefAmt > 0) A("우선주 배당률", c.prefRatePct, "%");
    A("보유기간", c.holdYears, "년");
    A("Exit Cap", c.exitCapPct, "%", "cap.exitCapPct");
    A("매각 비용", c.saleCostPct, "% (매각가 대비)");
    A("과세 구조", c.taxMode === "conduit" ? "도관 (리츠·펀드)" : "일반법인", "");
    if (c.taxMode === "corp") { A("법인세 실효세율", c.corpTaxPct, "%"); A("취득원가 중 건물분", c.buildingRatioPct, "%"); A("건물 내용연수", c.deprYears, "년"); }
    A("목표 Levered IRR", target, "%");
    P();
    P("결과", "값", "단위", "산식");
    P("Levered IRR", fx(irrPct, 2), "%", "보통주 현금흐름 NPV = 0 할인율");
    P("Unlevered IRR", fx(r.unleveredIrr === null ? null : r.unleveredIrr * 100, 2), "%", "대출 없이 본 자산 전체 현금흐름의 할인율");
    P("Equity Multiple", fx(r.equityMultiple, 2), "x", "보유기간 총 회수 ÷ 보통주 자기자본");
    P("Cash-on-Cash", fx(r.avgCoC === null ? null : r.avgCoC * 100, 2), "%", "보유기간 배당가능 현금 ÷ 자기자본 · 연평균");
    P("최소 DSCR", fx(r.minDscr, 2), "x", `NOI ÷ 연 원리금 · 보유기간 최소 연도${minDscrYear > 0 ? ` (${minDscrYear}년차)` : ""}`);
    P("진입 Cap", fx(r.goingInCap * 100, 2), "%", isRental ? "1년차 NOI ÷ (매입가 − 승계 보증금)" : "1년차 NOI ÷ 매입가");
    P("Yield on Cost", fx(r.yieldOnCost * 100, 2), "%", isRental ? "1년차 NOI ÷ (매입가 + 취득부대비 − 승계 보증금)" : "1년차 NOI ÷ (매입가 + 취득부대비)");
    P("Debt Yield", fx(r.debtYield === null ? null : r.debtYield * 100, 2), "%", "1년차 NOI ÷ 선순위 대출");
    P("실질 LTV", fx(r.effLtv * 100, 1), "%", "(대출 + 승계 보증금) ÷ 매입가");
    P(isRental ? "최대 매입 단가" : "최대 매입가", L.maxPrice === null ? "" : n0(L.maxPrice), isRental ? "만원/전용평" : "만원", `목표 Levered IRR ${target}%를 맞추는 ${isRental ? "단가" : "매입가"}`);
    P("자기자본 원금 보전선 Exit Cap", fx(L.capitalPreserve?.exitCapPct, 2), "%", "Equity Multiple = 1.0x가 되는 Exit Cap");
    P("대주 상환 한계선 Exit Cap", fx(L.debtCover?.exitCapPct, 2), "%", "매각대금으로 대출·보증금을 전액 상환하는 마지막 Exit Cap");
    P("원금 보전선 매각가 대비", fx(L.capitalPreserve ? L.capitalPreserve.saleVsPrice * 100 : null, 1), "%", "Equity Multiple = 1.0x가 되는 매각가의 매입가 대비 변화율");
    P("대주 한계선 매각가 대비", fx(L.debtCover ? L.debtCover.saleVsPrice * 100 : null, 1), "%", "대출·보증금을 전액 상환하는 마지막 매각가의 매입가 대비 변화율");
    P("DSCR 1.2x 대출금리", fx(L.rateAtDscr, 2), "%", c.amortType === "bullet" ? "1년차 DSCR이 1.2x가 되는 대출금리" : "만기일시상환에서만 산출");
    if (r.breakevenOcc !== null) P("1년차 손익분기 입주율", fx(r.breakevenOcc * 100, 1), "%", "1년차 원리금을 딱 갚는 입주율");
    P("매입가", n0(r.price), "만원", "");
    P("취득부대비", n0(r.acqCost), "만원", "취득세 + 기타 취득부대비");
    P("총 취득원가 (사용)", n0(r.uses), "만원", "매입가 + 취득부대비");
    P("선순위 대출", n0(r.loan), "만원", "매입가 × LTV");
    P("우선주", n0(r.pref), "만원", "");
    P("승계 보증금", n0(r.deposits), "만원", "");
    P("보통주 자기자본", n0(r.equity), "만원", "총 취득원가 − 대출 − 우선주 − 승계 보증금");
    P();
    P("연도별 현금흐름 (만원)", "취득", ...r.years.map((y) => `${y.year}년`));
    const Y = (label: string, t0: string, f: (y: YearRow, k: number) => string) => P(label, t0, ...r.years.map(f));
    Y("NOI", "", (y) => n0(y.noi));
    Y("이자", "", (y) => n0(-y.interest));
    Y("원금", "", (y) => n0(-y.principal));
    Y("고정비·보수", "", (y) => n0(-y.fixed));
    Y("법인세", "", (y) => n0(-y.tax));
    Y("우선주 배당", "", (y) => n0(-y.prefPaid));
    Y("보통주 배당가능 현금", "", (y) => n0(y.cf));
    Y("DSCR", "", (y) => fx(y.dscr, 2));
    Y("대출 잔액 (기말)", n0(r.loan), (_, k) => n0(r.debt[k]?.close ?? 0));
    Y("매각 순수령", "", (_, k) => (k === r.years.length - 1 ? n0(r.saleNetToEquity) : ""));
    Y("보통주 현금흐름 (매각 포함)", n0(r.leveredCfs[0]), (_, k) => n0(r.leveredCfs[k + 1]));
    P();
    P(`매각 분해 (만원 · ${c.holdYears}년 말)`, "값");
    P(`${c.holdYears + 1}년차 NOI`, n0(r.fwdNoi));
    P("Exit Cap (%)", fx(c.exitCapPct, 2));
    P("매각가", n0(r.saleValue));
    P("매각비용", n0(-r.saleCost));
    P("승계 보증금", n0(-r.deposits));
    P("대출 잔액", n0(-r.loanAtExit));
    if (c.taxMode === "corp") P("양도 법인세", n0(-r.exitTax));
    if (r.pref > 0) P("우선주 정산", n0(-r.prefBack));
    P("매각 순수령", n0(r.saleNetToEquity));
    // (4) 03 한계선의 민감도 표 4개. 첫 열이 행 가정, 머리 행이 열 가정. IRR은 %, DSCR은 배수 2자리 (IC 메모 부록용)
    for (const { spec, v } of grids) {
      const isDscr = spec.metric === "minDscr";
      P();
      P(`민감도 · ${spec.title} (${isDscr ? "x" : "%"})`, ...spec.colVals.map(spec.fmtCol));
      spec.rowVals.forEach((rv, ri) => P(spec.fmtRow(rv), ...spec.colVals.map((_, ci) => { const x = v[ri]?.[ci] ?? null; return x === null ? "" : fx(isDscr ? x : x * 100, 2); })));
    }
    const stamp = market ? ymOf(market.meta.to) : new Date().toISOString().slice(0, 10);
    const csv = "﻿" + rows.map((x) => x.join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `relab-pro-${isRental ? `${code}-` : ""}${asset}-${stamp}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, k: number) => {
    const n = TAB_KEYS.length;
    let j = k;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (k + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (k - 1 + n) % n;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = n - 1;
    else return;
    e.preventDefault();
    setAsset(TAB_KEYS[j]);
    tabRefs.current[TAB_KEYS[j]]?.focus();
  };

  const benchAsOf = rates?.rates.find((x) => x.id === bench)?.asOf;
  const benchMeta = !rates ? "금리를 불러오는 중입니다" : bench === "manual" ? "직접 입력한 기준금리로 계산합니다" : `ECOS ${benchAsOf ?? rates.fetchedAt} · ${rates.live ? `조회 ${rates.fetchedAt}` : "마지막 확인값"}`;
  const printHead = `RE:LAB · Model Desk Pro · ${isRental && market ? `${market.meta.name} ${market.meta.asset} ${bandLabel}` : PRO_ASSET_LABEL[asset]} · 조회 ${(isRental ? market?.meta.fetchedAt : undefined) ?? rates?.fetchedAt ?? ""}`;
  const summaryCost = `운영비 ${pcs(input.rental.opexPct)} · 적립 ${pcs(input.rental.capexPct)} · 보유세 ${pcs(input.rental.holdTaxPct)}`;
  const summaryOfficeCost = `운영비 ${num(input.office.opexPerPy, 2)}만원/평 · 상승률 ${pcs(input.office.opexGrowthPct)} · 운용보수 ${pcs(input.office.aumFeePct)}`;
  const summaryPref = input.cap.prefAmt > 0 ? `${eok(input.cap.prefAmt)} · ${pcs(input.cap.prefRatePct)}` : "우선주 없음";
  const summarySale = `매각비용 ${pcs(input.cap.saleCostPct)} · ${input.cap.taxMode === "conduit" ? "도관" : `일반법인 ${pcs(input.cap.corpTaxPct)}`}`;
  const cfRows = [["NOI", "noi", 1], ["(−) 이자", "interest", -1], ["(−) 원금", "principal", -1], ["(−) 고정비·보수", "fixed", -1], ["(−) 법인세", "tax", -1], ["(−) 우선주 배당", "prefPaid", -1], ["보통주 배당가능 현금", "cf", 1]] as const;

  return (
    <main id="main" className="pro" tabIndex={-1} ref={mainRef}>
      <p className="print-only">{printHead}<br />공개 데이터에 기반한 정보 제공 도구이며 투자 권유가 아닙니다. 결과는 입력한 가정을 계산한 값입니다.</p>
      <SubNav items={[{ id: "market", no: "01", label: isRental ? "시장" : "자료" }, ...NAV_BASE]} basis={navBasis} readouts={readouts} tone={tone} />

      <section className="intro">
        <p className="eyebrow">Model Desk · Pro</p>
        <h1>기관투자자의 사업성 분석</h1>
        <p className="intro-lead">{isRental
          ? "오피스텔·도시형생활주택 통매입입니다. 국토교통부 실거래가가 매입 단가·임대료·보증금·전환율을 채우고, 그 가정이 시장의 어디에 있는지 판정합니다."
          : `${PRO_ASSET_LABEL[asset]}입니다. 임대료·관리비·운영비는 렌트롤과 관리비 수지에서 직접 입력합니다. 공개 실거래가에는 이 자산의 임대료가 없어 시장 대비 위치는 표시하지 않고, 금리만 한국은행에서 받아 옵니다.`}</p>
        <div className="asset-tabs intro-tabs" role="tablist" aria-label="자산 유형">
          {TAB_KEYS.map((a, k) => (
            <button key={a} id={`tab-${a}`} type="button" role="tab" aria-selected={a === asset} aria-controls="underwrite" tabIndex={a === asset ? 0 : -1}
              className={a === asset ? "on" : ""} ref={(el) => { tabRefs.current[a] = el; }} onClick={() => setAsset(a)} onKeyDown={(e) => onTabKey(e, k)}>{PRO_ASSET_LABEL[a]}</button>
          ))}
        </div>
        <p className="status">
          {isRental ? (market
            ? <span><b className={`kicker${market.meta.mode === "live" ? " live" : ""}`}>{market.meta.mode === "live" ? "LIVE" : "SNAPSHOT"}</b> 실거래가 · {market.meta.mode === "live" ? `국토교통부 OpenAPI ${market.meta.fetchedAt}` : `국토부 공개 CSV ${ymOf(market.meta.to)}`}</span>
            : <span>실거래가 · {error ? "불러오지 못함" : "불러오는 중"}</span>)
            : <span>임대료·공실 · 렌트롤 직접 입력</span>}
          {rates
            ? <span><b className={`kicker${rates.live ? " live" : ""}`}>{rates.live ? "LIVE" : "SNAPSHOT"}</b> 금리 · ECOS {rates.fetchedAt}{rates.live ? "" : " · 마지막 확인값"}</span>
            : <span>금리 · 불러오는 중</span>}
        </p>
      </section>

      <Memo variant="pro" tone={idle ? null : V.tone} toneLabel={toneLabel} kicker="결론 · Memo Summary"
        headline={headNode} figures={figures} lender={lender} basis={basisText} edited={edited} tally={V.tally}
        idle={idle ? "시장값을 불러오면 가정 6개가 채워지고 결론이 여기 나옵니다 · 기다리지 않으려면 아래에 직접 입력" : undefined}
        actions={[{ label: "가정 고치기 ↓", href: "#inputs" }, { label: "한계선 보기", href: "#limits" }, { label: "검산 보기", href: "#audit" }]}>
        <p className="memo-deal">{dealLine}</p>
      </Memo>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{live}</p>

      {isRental ? (
        <MarketPanel compact audience="pro" asset={MK_ASSET} regions={regions} regionsError={regionsError} code={code} band={band} market={market} loading={loading} error={error}
          selectedKey={selectedKey} detail={detail} detailError={detailError} legalCapPct={legalCapPct}
          onCode={(c) => { setSelectedKey(null); setConfirm(null); setCode(c); }} onBand={(b) => { setConfirm(null); setBand(b); }} onPick={setSelectedKey}
          fillLabel={fillLabel} fillConfirm={fillConfirm} links={{ home: homeHref }} onRetry={retry}
          onFillRegion={onFillRegion} onFillComplex={(c) => requestFill(c)} />
      ) : (
        <section id="market" className="sec">
          <SectionHead no="01" title="자료" lead="이 자산은 공개 실거래가로 임대료를 확인할 수 없습니다. 무엇을 어디서 가져와 넣는지 먼저 정리합니다." />
          <dl className="src-grid">
            <div><dt>임대료 · 관리비 · 보증금</dt><dd>매도자 렌트롤과 관리비 수지. 계약별 만기와 인상 조건을 함께 봅니다.</dd></div>
            <div><dt>공실률</dt><dd>권역 임대 시장 조사(분기 보고서). 계약 만기 집중 연도에는 가정을 따로 둡니다.</dd></div>
            <div><dt>운영비</dt><dd>직전 2년 실적 수지. 관리비 수입과 상계한 순액으로 넣습니다.</dd></div>
            <div><dt>금리</dt><dd>{rates ? `한국은행 ECOS ${rates.live ? `조회 ${rates.fetchedAt}` : "마지막 확인값"} · 기준금리 ${num(rateOf(rates, "base") ?? 0, 2)}% · CD 91일 ${num(rateOf(rates, "cd91") ?? 0, 2)}%` : "한국은행 ECOS · 불러오는 중"}</dd></div>
          </dl>
        </section>
      )}

      <section id="underwrite" className="sec" role="tabpanel" aria-labelledby={`tab-${asset}`}>
        <SectionHead no="02" title="언더라이팅" lead={isRental ? "입력값은 서버로 가지 않습니다. 시장에서 온 값에는 출처가, 비교 가능한 가정에는 시장 대비 위치가 붙습니다." : "입력값은 서버로 가지 않습니다. 렌트롤 값을 그대로 넣으면 결론과 한계선이 바로 갱신됩니다."} />

        <div className="uw">
          <div className="uw-inputs" id="inputs">
            {isRental ? (
              <>
                <div className="basis">
                  <div><span className="basis-label">가정 기준</span><b>{basis?.label ?? "직접 입력"}</b>{edited ? <b className="basis-edited">수정됨</b> : null}</div>
                  <button type="button" className="link" onClick={restoreAll} disabled={!edited}>시장값으로 되돌리기</button>
                </div>
                <p className="basis-note">
                  {basis === null
                    ? <>시장값을 아직 불러오지 않았습니다. 아래 값은 기본 가정이며, 01 시장 절의 「이 지역 시장값으로 가정 채우기」를 누르면 실거래가로 바뀝니다.</>
                    : basis.complexKey
                      ? <>검토 물건 · <b>{basis.label.replace(" 단지값", "")}</b> 단지와 같은 조건의 오피스텔 <b>{num(input.rental.units)}세대</b>. 세대수는 실거래가에 없으므로 실제 세대수로 고쳐 넣으십시오.</>
                      : <>검토 물건 · 이 지역의 평균적인 오피스텔 <b>{num(input.rental.units)}세대</b>를 가정한 가상 물건입니다. 특정 단지를 검토하려면 01 시장 절에서 단지를 고르고 「이 단지 값으로 가정 채우기」를 누르십시오.</>}
                </p>
                <fieldset><legend>자산</legend>
                  <NumField label="세대수" unit="세대" value={input.rental.units} step={1} min={1} onChange={(v) => set("rental", "units", Math.round(v))} {...fp("rental.units")} />
                  <NumField label="세대당 전용면적" unit="평" value={input.rental.areaPy} step={0.1} min={1} onChange={(v) => set("rental", "areaPy", v)} {...fp("rental.areaPy")} derived={dv(`= ${num(input.rental.areaPy * PY, 1)}㎡ · 총 전용 ${num(r.gla, 0)}평`)} />
                  <NumField label="매입 단가" unit="만원/평" value={input.rental.pricePerPy} step={10} min={1} onChange={(v) => set("rental", "pricePerPy", v)} {...fp("rental.pricePerPy")} derived={dv(`전용평당 · 매입가 ${eok(r.price)} · 세대당 ${num(r.price / input.rental.units / 10000, 2)}억`)} />
                </fieldset>
                <fieldset><legend>취득</legend>
                  <Seg id="acq-tax" label="취득세" term="취득세" value={acqTaxMode} options={[{ id: "offi", label: "오피스텔 4.6%" }, { id: "corp", label: "법인 중과 12.4%" }, { id: "custom", label: "직접 입력" }]}
                    onChange={(m) => { setAcqTaxMode(m); if (m === "offi") set("rental", "acqTaxPct", 4.6); else if (m === "corp") set("rental", "acqTaxPct", 12.4); }}
                    derived={acqTaxMode === "custom" ? undefined : `매입가 대비 ${pcs(input.rental.acqTaxPct)} · ${eok(r.price * input.rental.acqTaxPct / 100)}`} />
                  {acqTaxMode === "custom" ? <NumField label="취득세 직접 입력" unit="%" value={input.rental.acqTaxPct} step={0.1} min={0} max={20} onChange={(v) => set("rental", "acqTaxPct", v)} derived={dv(`매입가 대비 · ${eok(r.price * input.rental.acqTaxPct / 100)}`)} /> : null}
                  <NumField label="기타 취득부대비" unit="%" value={input.rental.acqCostPct} step={0.1} min={0} max={20} onChange={(v) => set("rental", "acqCostPct", v)} derived={dv(`매입가 대비 · 취득부대비 합계 ${eok(r.acqCost)}`)} />
                </fieldset>
                <fieldset><legend>임대</legend>
                  <NumField label="환산월세" term="환산월세" unit="만원" value={input.rental.effRentPerPy} step={0.1} min={0} onChange={(v) => set("rental", "effRentPerPy", v)} {...fp("rental.effRentPerPy")} derived={dv(`전용평당 월 · 세대당 환산월세 ${num(input.rental.effRentPerPy * input.rental.areaPy, 1)}만원`)} />
                  <NumField label="세대당 보증금" unit="만원" value={input.rental.depositPerUnit} step={100} min={0} onChange={(v) => set("rental", "depositPerUnit", v)} {...fp("rental.depositPerUnit")} derived={<>월세 현금 {num(r.cashRentPerUnit, 1)}만원/세대 · <Term k="승계 보증금" /> {eok(r.deposits)}</>} />
                  <NumField label="전월세전환율" term="전월세전환율" unit="%" value={input.rental.convRatePct} step={0.05} min={0} max={20} onChange={(v) => set("rental", "convRatePct", v)} {...fp("rental.convRatePct")} />
                  <NumField label="안정화 공실률" unit="%" value={input.rental.vacancyPct} step={0.5} min={0} max={100} onChange={(v) => set("rental", "vacancyPct", v)} {...fp("rental.vacancyPct")} />
                  <NumField label="임대료 성장률 (연)" unit="%" sign value={input.rental.rentGrowthPct} step={0.1} min={-10} max={20} onChange={(v) => set("rental", "rentGrowthPct", v)} {...fp("rental.rentGrowthPct")} />
                </fieldset>
                <details className="adv" ref={(el) => { advRefs.current.cost = el; }}>
                  <summary>비용 <span>{summaryCost}</span></summary>
                  <NumField label="운영비 (EGI 대비)" unit="%" value={input.rental.opexPct} step={0.5} min={0} max={100} onChange={(v) => set("rental", "opexPct", v)} {...fp("rental.opexPct")} />
                  <NumField label="수선 · 교체 적립 (EGI 대비)" unit="%" value={input.rental.capexPct} step={0.5} min={0} max={100} onChange={(v) => set("rental", "capexPct", v)} />
                  <NumField label="보유세" term="보유세" unit="%" value={input.rental.holdTaxPct} step={0.05} min={0} max={10} onChange={(v) => set("rental", "holdTaxPct", v)} derived={dv("매입가 대비 연 · 재산세·도시지역분·지방교육세 합계. 주거용 과세 시 종부세 추가")} />
                </details>
              </>
            ) : (
              <>
                <p className="basis-note">임대료·관리비·운영비는 렌트롤과 관리비 수지에서 직접 입력합니다. 공개 실거래가에 이 자산의 임대료가 없어 시장 대비 위치 표시는 없습니다. 자본구조·매각 가정은 임대주택 탭의 시장값을 물려받지 않고 기본값 LTV {pcs(CAP_DEFAULT.ltvPct)} · Exit Cap {pcs(CAP_DEFAULT.exitCapPct)}에서 출발합니다.</p>
                <fieldset><legend>자산</legend>
                  <NumField label="매입가" unit="만원" value={input.office.price} step={10000} min={1} onChange={(v) => set("office", "price", v)} position={pos["office.price"]} derived={dv(`연면적 평당 ${num(input.office.price / input.office.gfaPy, 0)}만원`)} />
                  <NumField label="연면적" unit="평" value={input.office.gfaPy} step={10} min={1} onChange={(v) => set("office", "gfaPy", v)} />
                  <NumField label="전용률" unit="%" value={input.office.effRatioPct} step={1} min={1} max={100} onChange={(v) => set("office", "effRatioPct", v)} derived={dv(`임대면적 ${num(r.gla, 0)}평`)} />
                </fieldset>
                <fieldset><legend>취득</legend>
                  <NumField label="취득세" term="취득세" unit="%" value={input.office.acqTaxPct} step={0.1} min={0} max={20} onChange={(v) => set("office", "acqTaxPct", v)} derived={dv(`매입가 대비 · ${eok(input.office.price * input.office.acqTaxPct / 100)}`)} />
                  <NumField label="기타 취득부대비" unit="%" value={input.office.acqCostPct} step={0.1} min={0} max={20} onChange={(v) => set("office", "acqCostPct", v)} derived={dv(`매입가 대비 · 취득부대비 합계 ${eok(r.acqCost)}`)} />
                </fieldset>
                <fieldset><legend>운영 수입</legend>
                  <NumField label="NOI 직접 입력 (연, 선택)" unit="만원" value={input.office.noiDirect} step={1000} min={0} onChange={(v) => set("office", "noiDirect", v)} derived={dv("IM의 안정화 NOI를 그대로 쓸 때. 0이면 아래 임대료로 계산합니다")} />
                  <NumField label="임대료 (임대면적 평당 월)" unit="만원" value={input.office.rentPerPy} step={0.1} min={0} onChange={(v) => set("office", "rentPerPy", v)} position={pos["office.rentPerPy"]} />
                  <NumField label="관리비 순수입 (평당 월)" unit="만원" value={input.office.mgmtNetPerPy} step={0.1} min={0} onChange={(v) => set("office", "mgmtNetPerPy", v)} derived={dv("관리비 수입에서 실비를 뺀 마진")} />
                  <NumField label="공실률" unit="%" value={input.office.vacancyPct} step={0.5} min={0} max={100} onChange={(v) => set("office", "vacancyPct", v)} position={pos["office.vacancyPct"]} />
                  <NumField label="기타 수입 (연)" unit="만원" value={input.office.otherIncome} step={100} min={0} onChange={(v) => set("office", "otherIncome", v)} />
                  <NumField label="보증금 (임대면적 평당)" unit="만원" value={input.office.depositPerPy} step={5} min={0} onChange={(v) => set("office", "depositPerPy", v)} derived={<><Term k="승계 보증금" /> {eok(r.deposits)} · 운용수익률 {pctv(input.office.depositRatePct, 1)}</>} />
                  <NumField label="보증금 운용수익률" unit="%" value={input.office.depositRatePct} step={0.1} min={0} max={20} onChange={(v) => set("office", "depositRatePct", v)} />
                  <NumField label="임대료 성장률 (연)" unit="%" sign value={input.office.rentGrowthPct} step={0.1} min={-10} max={20} onChange={(v) => set("office", "rentGrowthPct", v)} />
                </fieldset>
                <details className="adv" ref={(el) => { advRefs.current.ocost = el; }}>
                  <summary>운영 비용 <span>{summaryOfficeCost}</span></summary>
                  <NumField label="운영비 (연면적 평당 월)" unit="만원" value={input.office.opexPerPy} step={0.05} min={0} onChange={(v) => set("office", "opexPerPy", v)} />
                  <NumField label="운영비 상승률 (연)" unit="%" sign value={input.office.opexGrowthPct} step={0.1} min={-10} max={20} onChange={(v) => set("office", "opexGrowthPct", v)} />
                  <NumField label="운용보수 (매입가 대비, 연)" unit="%" value={input.office.aumFeePct} step={0.05} min={0} max={5} onChange={(v) => set("office", "aumFeePct", v)} />
                  <NumField label="기타 고정비 (연)" unit="만원" value={input.office.fixedCost} step={100} min={0} onChange={(v) => set("office", "fixedCost", v)} />
                </details>
              </>
            )}

            <fieldset><legend>자본구조</legend>
              <NumField label="선순위 대출 (매입가 대비)" unit="%" value={input.cap.ltvPct} step={1} min={0} max={95} onChange={(v) => set("cap", "ltvPct", v)} {...fp("cap.ltvPct")} derived={<>대출 {eok(r.loan)} · 보증금 포함 <Term k="실질 LTV" /> {pct(r.effLtv, 1)}</>} />
              {bench === "manual" ? (
                <NumField id="bench-manual" label="기준금리 (직접 입력)" unit="%" value={raw.cap.baseRatePct} step={0.05} min={0} max={20} onChange={(v) => set("cap", "baseRatePct", v)}
                  derived={<>{benchMeta} · <button type="button" className="link" onClick={() => setBench("cd91")}>지표로 되돌리기</button></>} />
              ) : (
                <div className="field">
                  <label htmlFor="bench">기준금리 지표</label>
                  <select id="bench" value={bench} onChange={(e) => setBench(e.target.value as Bench)}>
                    {rates ? rates.rates.map((x) => <option key={x.id} value={x.id}>{BENCH_LABEL[x.id] ?? x.label} {x.value.toFixed(2)}%</option>) : <option value={bench} disabled>금리 불러오는 중</option>}
                    <option value="manual">직접 입력</option>
                  </select>
                  <div className="field-meta"><span className="src" title={benchMeta}>{benchMeta}</span></div>
                </div>
              )}
              <NumField label="가산금리 (bp)" term="가산금리 (bp)" unit="bp" value={input.cap.spreadBp} step={10} min={0} max={1000} onChange={(v) => set("cap", "spreadBp", v)} {...fp("cap.spreadBp")} derived={dv(`대출금리 ${pctv(allIn, 2)} · 1년차 이자 ${eok(r.years[0]?.interest ?? 0)}`)} />
              <Seg id="amort" label="상환 방식" term="상환 방식" value={input.cap.amortType} options={[{ id: "bullet", label: "만기일시" }, { id: "annuity", label: "원리금균등" }, { id: "straight", label: "원금균등" }]} onChange={(v) => set("cap", "amortType", v as AmortType)} />
              {input.cap.amortType !== "bullet" ? <NumField label="상환 기간" unit="년" value={input.cap.amortYears} step={1} min={1} max={40} onChange={(v) => set("cap", "amortYears", Math.round(v))} /> : null}
              <details className="adv" ref={(el) => { advRefs.current.pref = el; }}>
                <summary>우선주 <span>{summaryPref}</span></summary>
                <NumField label="우선주" term="우선주" unit="만원" value={input.cap.prefAmt} step={10000} min={0} onChange={(v) => set("cap", "prefAmt", v)} derived={input.cap.prefAmt > 0 ? "누적 우선배당 · 매각 시 원금과 미지급 배당을 먼저 정산" : "0이면 없음"} />
                {input.cap.prefAmt > 0 ? <NumField label="우선주 배당률" unit="%" value={input.cap.prefRatePct} step={0.1} min={0} max={30} onChange={(v) => set("cap", "prefRatePct", v)} /> : null}
              </details>
            </fieldset>
            <fieldset><legend>매각</legend>
              <NumField label="보유기간" unit="년" value={input.cap.holdYears} step={1} min={1} max={15} onChange={(v) => set("cap", "holdYears", Math.round(v))} />
              <NumField label="Exit Cap" term="Exit Cap" unit="%" value={input.cap.exitCapPct} step={0.05} min={0.5} max={20} onChange={(v) => set("cap", "exitCapPct", v)} {...fp("cap.exitCapPct")} derived={dv(`매각가 ${eok(r.saleValue)} · 매입가 대비 ${neg(pctv((r.saleValue / r.price - 1) * 100, 1, true))}`)} />
              <details className="adv" ref={(el) => { advRefs.current.sale = el; }}>
                <summary>매각 비용 · 과세 <span>{summarySale}</span></summary>
                <NumField label="매각 비용 (매각가 대비)" unit="%" value={input.cap.saleCostPct} step={0.1} min={0} max={10} onChange={(v) => set("cap", "saleCostPct", v)} />
                <Seg id="tax-mode" label="과세 구조" term="도관 (리츠·펀드)" value={input.cap.taxMode} options={[{ id: "conduit", label: "도관 (리츠·펀드)" }, { id: "corp", label: "일반법인" }]} onChange={(v) => set("cap", "taxMode", v)} />
                {input.cap.taxMode === "corp" ? (<>
                  <NumField label="법인세 실효세율" unit="%" value={input.cap.corpTaxPct} step={0.1} min={0} max={50} onChange={(v) => set("cap", "corpTaxPct", v)} />
                  <NumField label="취득원가 중 건물분" unit="%" value={input.cap.buildingRatioPct} step={1} min={0} max={100} onChange={(v) => set("cap", "buildingRatioPct", v)} />
                  <NumField label="건물 내용연수" unit="년" value={input.cap.deprYears} step={1} min={1} max={60} onChange={(v) => set("cap", "deprYears", v)} last />
                </>) : null}
              </details>
            </fieldset>
            <p className="fine">단축키: 위아래 방향키 ±step · Shift ×10 · Alt ×0.1 · Enter 다음 칸 · Esc 되돌리기</p>
          </div>

          <div className="uw-results">
            <div className="uw-summary">
              <p className="headline" title={headText}>{headText}</p>
              <div className="kpis four">{kpi4({ compact: true })}</div>
              <p className="sum-links"><a className="to-top link" href="#memo">요약으로 ↑</a><a className="to-inputs link" href="#inputs">가정 고치기 ↓</a></p>
            </div>
            <div className="uw-body" id="results">
            <dl className="facts">
              <div><dt><Term k="진입 Cap" /></dt><dd>{neg(pct(r.goingInCap))}<span>{isRental ? "NOI ÷ (매입가 − 보증금)" : "NOI ÷ 매입가"}</span></dd></div>
              <div><dt><Term k="Yield on Cost" /></dt><dd>{neg(pct(r.yieldOnCost))}<span>{isRental ? "NOI ÷ (취득원가 − 보증금)" : "NOI ÷ 취득원가"}</span></dd></div>
              <div><dt><Term k="Debt Yield" /></dt><dd>{neg(pct(r.debtYield))}<span>NOI ÷ 대출</span></dd></div>
              <div><dt>1년차 NOI</dt><dd>{neg(eok(r.years[0]?.noi, 2))}<span>{isRental ? "EGI − 운영비·적립 − 보유세" : "EGI − 운영비"}</span></dd></div>
            </dl>
            {notes.length > 0 ? <ul className="notes">{notes.map((n, k) => <li key={k} className={`note-${n.tone}`}>{n.text}</li>)}</ul> : null}
            <h3>조달과 사용</h3>
            <StackBar parts={[
              { label: "선순위 대출", value: r.loan, tone: "debt", note: `${eok(r.loan)} · ${pctv(allIn, 2)}` },
              ...(r.pref > 0 ? [{ label: "우선주", value: r.pref, tone: "pref", note: `${eok(r.pref)} · ${pctv(input.cap.prefRatePct, 1)}` }] : []),
              { label: "승계 보증금", value: r.deposits, tone: "dep", note: `${eok(r.deposits)} · 무이자, 매각 시 승계` },
              { label: "보통주 자기자본", value: r.equity, tone: "eq", note: eok(r.equity) },
            ]} />
            <p className="fine">사용 = 매입가 {eok(r.price)} + 취득부대비 {eok(r.acqCost)} = {eok(r.uses)}</p>
            <h3>보통주 현금흐름 <span>억원 · <Term k="매각 순수령" /> {neg(eok(r.saleNetToEquity))}</span></h3>
            <CfBars op={r.years.map((y) => y.cf)} acq={r.leveredCfs[0]} sale={r.saleNetToEquity} />
            <details>
              <summary>연도별 현금흐름표</summary>
              <div className="table-wrap"><table className="data tight">
                <caption className="sr-only">연도별 현금흐름표 · 억원 · (−) 행은 크기만 표기 · 취득 열은 자기자본 투입, 마지막 두 행이 IRR·Equity Multiple의 현금흐름</caption>
                <thead><tr><th scope="col">항목 (억원)</th><th scope="col" className="num">취득</th>{r.years.map((y) => <th key={y.year} scope="col" className="num">{y.year}년</th>)}</tr></thead>
                <tbody>
                  {cfRows.map(([label, key, sign]) => (
                    <tr key={key} className={key === "noi" || key === "cf" ? "total" : ""}>
                      <th scope="row">{label}</th>
                      <td className="num">{DASH}</td>
                      {r.years.map((y) => <td key={y.year} className="num">{neg(num(sign < 0 ? Math.abs(y[key]) / 10000 : y[key] / 10000, 2))}</td>)}
                    </tr>
                  ))}
                  <tr><th scope="row">DSCR</th><td className="num">{DASH}</td>{r.years.map((y) => <td key={y.year} className="num">{mult(y.dscr)}</td>)}</tr>
                  <tr><th scope="row">대출 잔액 (기말)</th><td className="num">{num(r.loan / 10000, 2)}</td>{r.debt.map((d, k) => <td key={k} className="num">{num(d.close / 10000, 2)}</td>)}</tr>
                  <tr><th scope="row">매각 순수령</th><td className="num">{DASH}</td>{r.years.map((y, k) => <td key={y.year} className="num">{k === r.years.length - 1 ? neg(num(r.saleNetToEquity / 10000, 2)) : DASH}</td>)}</tr>
                  <tr className="total"><th scope="row">보통주 현금흐름 (매각 포함)</th><td className="num">{neg(num(r.leveredCfs[0] / 10000, 2))}</td>{r.years.map((y, k) => <td key={y.year} className="num">{neg(num(r.leveredCfs[k + 1] / 10000, 2))}</td>)}</tr>
                </tbody>
              </table></div>
              <p className="fine">매각 ({input.cap.holdYears}년 말) · 매각가 {eok(r.saleValue)} = {input.cap.holdYears + 1}년차 NOI {eok(r.fwdNoi, 2)} ÷ Exit Cap {pctv(input.cap.exitCapPct, 2)}{isRental ? ` + 보증금 ${eok(r.deposits)}` : ""} · 매각가 − 매각비용 {eok(r.saleCost)} − 보증금 {eok(r.deposits)} − 대출 잔액 {eok(r.loanAtExit)}{input.cap.taxMode === "corp" ? ` − 양도 법인세 ${eok(r.exitTax)}` : ""}{r.pref > 0 ? ` − 우선주 정산 ${eok(r.prefBack)}` : ""} = 매각 순수령 {neg(eok(r.saleNetToEquity))}</p>
            </details>
            <div className="btn-row"><button type="button" className="btn" onClick={onCsv}>현금흐름 CSV</button><button type="button" className="btn print-hide" onClick={() => window.print()}>인쇄 · PDF</button></div>
            </div>
          </div>
        </div>
      </section>

      <section id="limits" className="sec">
        <SectionHead no="03" title="한계선과 민감도" lead="결론은 된다 안 된다가 아니라 어디까지 나빠져도 버티는가입니다. 손익분기는 투자자의 원금과 대주의 원리금, 두 개를 따로 봅니다." />
        <div className="limits">
          <div className="limit">
            <div className="limit-key"><Term k="원금 보전선">자기자본 원금 보전선</Term> · Exit Cap</div>
            <div className="limit-value">{L.capitalPreserve ? <>{num(L.capitalPreserve.exitCapPct, 2)}<small className="u">%</small></> : DASH}</div>
            <p>{L.capitalPreserve ? <>매각가가 매입가 대비 <b>{neg(pctv(L.capitalPreserve.saleVsPrice * 100, 1, true))}</b>일 때 Equity Multiple이 1.0x가 됩니다. 현재 가정 {pctv(input.cap.exitCapPct, 2)}에서 <b>{neg(String(Math.round((L.capitalPreserve.exitCapPct - input.cap.exitCapPct) * 100)))}bp</b>의 여유입니다.</> : "탐색 구간 안에서 원금 보전 지점을 찾지 못했습니다."}</p>
          </div>
          <div className="limit">
            <div className="limit-key"><Term k="대주 상환 한계선" /> · Exit Cap</div>
            <div className="limit-value">{L.debtCover ? <>{num(L.debtCover.exitCapPct, 2)}<small className="u">%</small></> : DASH}</div>
            <p>{L.debtCover ? <>매각가가 매입가 대비 <b>{neg(pctv(L.debtCover.saleVsPrice * 100, 1, true))}</b>까지 내려가도 매각대금으로 대출 {eok(r.loanAtExit)}과 보증금 {eok(r.deposits)}을 전액 상환합니다. 그 아래에서는 자기자본이 전액 손실되고 대주 원금이 침해됩니다.</> : "대출이 없거나 한계 지점을 찾지 못했습니다."}</p>
          </div>
          <div className="limit">
            <div className="limit-key"><Term k="최대 매입 단가">{isRental ? "최대 매입 단가" : "최대 매입가"}</Term> · 목표 Levered IRR {pctv(target, 1)}</div>
            <div className="limit-value">{L.maxPrice === null ? DASH : isRental ? <>{num(L.maxPrice, 0)}<small className="u">만원/평</small></> : <>{num(L.maxPrice / 10000, 1)}<small className="u">억</small></>}</div>
            <p>{priceGap === null ? "탐색 구간 안에서 목표를 맞추는 단가를 찾지 못했습니다." : <>현재 {isRental ? `${num(r.price0, 0)}만원/평` : eok(r.price0)} 대비 <b>{neg(pctv(priceGap, 1, true))}</b>. 목표 IRR은 결론 블록에서 고칩니다.</>}</p>
            <dl className="facts col">
              <div><dt>DSCR 1.2x가 되는 대출금리</dt><dd>{L.rateAtDscr === null ? (input.cap.amortType === "bullet" ? DASH : "만기일시상환에서만 산출") : pctv(L.rateAtDscr, 2)} <span>현재 {pct(r.rate)}</span></dd></div>
              {r.breakevenOcc !== null ? <div><dt><Term k="손익분기 입주율">1년차 손익분기 입주율</Term></dt><dd>{pct(r.breakevenOcc, 1)} <span>가정 {pctv(100 - input.rental.vacancyPct, 1)}</span></dd></div> : null}
            </dl>
          </div>
        </div>
        <div className="grid2 heats">
          {grids.slice(0, 3).map(heatFigure)}
          <div className="howto">
            <h3>읽는 법</h3>
            <p>각 칸은 행과 열의 가정 두 개만 바꿔 전체를 다시 계산한 값입니다. 색이 짙을수록 기준선(목표 IRR {pctv(target, 1)} · DSCR 1.2x)에서 멀고, 점선 밑줄은 기준 미만입니다.</p>
            <p>굵은 테두리는 지금 입력한 가정, 붉은 테두리는 원금 손실(DSCR 표는 1.0x 미만)입니다. {isRental ? "단가" : "매입가"} 표의 「목표」 행은 목표 IRR을 딱 맞추는 {isRental ? "최대 매입 단가" : "최대 매입가"}입니다. 칸 위에 마우스를 올리거나 방향키로 움직이면 표 위 읽기 줄에 조합과 값이 나옵니다. 칸 사이 값은 선형이 아니므로 보간하지 않습니다.</p>
            <details className="adv heat-more">
              <summary>{grids[3].spec.title} <span>보조 표</span></summary>
              {heatFigure(grids[3])}
            </details>
          </div>
        </div>
      </section>

      <section id="audit" className="sec">
        <SectionHead no="04" title="검증과 출처" lead="데이터가 어디서 왔고, 무엇을 뺐고, 계산이 맞는지 여기서 확인합니다." />
        <div className="audit">
          <div>
            <h3>데이터 계보</h3>
            <table className="data tight kv"><tbody>
              {isRental ? (<>
                <tr><td>임대 · 매매</td><td>{market?.meta.source ?? DASH}</td></tr>
                <tr><td>수집 방식</td><td>{market ? (market.meta.mode === "live" ? "OpenAPI 호출 · 서버에서 하루 캐시" : "국토교통부 공개 CSV로 만든 스냅샷") : DASH}</td></tr>
                <tr><td>대상 · 기간</td><td>{market ? `${market.meta.name} · ${market.meta.asset} · ${market.meta.from} ~ ${market.meta.to} (계약일 기준)` : DASH}</td></tr>
                <tr><td>임대 계약</td><td>{market ? `전체 ${num(market.counts.rentTotal)}건 → 최근 12개월 ${num(market.counts.rentRecent)}건 (월세 ${num(market.counts.wolseRecent)}건)` : DASH}</td></tr>
                <tr><td>매매</td><td>{market ? `전체 ${num(market.counts.tradeTotal)}건 − 해제 ${num(market.counts.tradeCanceled)}건 → 최근 12개월 ${num(market.counts.tradeRecent)}건` : DASH}</td></tr>
              </>) : (
                <tr><td>임대 · 매매</td><td>렌트롤 · 관리비 수지 · 감정평가 (직접 입력)</td></tr>
              )}
              <tr><td>금리</td><td>{rates ? `한국은행 ECOS (722Y001 · 817Y002) · ${rates.live ? `조회 ${rates.fetchedAt}` : "마지막 확인값"}` : DASH}</td></tr>
            </tbody></table>
            <h3>산식</h3>
            <table className="data tight kv"><tbody>
              {isRental ? (<>
                <tr><td>전월세전환율</td><td>같은 단지·같은 면적에서 r = 월세 × 12 ÷ (전세 보증금 중앙값 − 월세 보증금), 지역 중앙값</td></tr>
                <tr><td>환산월세</td><td>(월세 + 보증금 × 전환율 ÷ 12) ÷ 전용평</td></tr>
                <tr><td>NOI</td><td>월세 현금 × 12 × 세대수 × (1 − 공실률) × (1 − 운영비율 − 수선적립률) − 보유세</td></tr>
              </>) : (<>
                <tr><td>임대면적</td><td>연면적 × 전용률</td></tr>
                <tr><td>EGI</td><td>(임대료 + 관리비 순수입) × 임대면적 × 12 × (1 − 공실률) + 기타수입 + 보증금 운용수익</td></tr>
                <tr><td>NOI</td><td>EGI − 운영비(연면적 × 평당 운영비 × 12). 운용보수·고정비는 NOI 아래에서 차감</td></tr>
              </>)}
              <tr><td>진입 Cap</td><td>{isRental ? "1년차 NOI ÷ (매입가 − 승계 보증금). 보증금 차감 기준" : "1년차 NOI ÷ 매입가. NOI에 보증금 운용수익이 들어 있으므로 보증금을 차감하지 않음"}</td></tr>
              <tr><td>Yield on Cost</td><td>{isRental ? "1년차 NOI ÷ (매입가 + 취득부대비 − 승계 보증금)" : "1년차 NOI ÷ (매입가 + 취득부대비)"}</td></tr>
              <tr><td>Debt Yield</td><td>1년차 NOI ÷ 선순위 대출</td></tr>
              <tr><td>매각가</td><td>{isRental ? "매각 다음 해 NOI ÷ Exit Cap + 보증금" : "매각 다음 해 NOI ÷ Exit Cap. NOI에 보증금 운용수익이 들어 있으므로 보증금을 다시 더하지 않고, 매수인이 승계하는 보증금만 매각대금에서 뺍니다"}</td></tr>
              <tr><td>자기자본</td><td>매입가 + 취득부대비 − 대출 − 우선주 − 승계 보증금</td></tr>
              <tr><td>DSCR</td><td>NOI ÷ (이자 + 원금)</td></tr>
              <tr><td>우선주</td><td>매기 우선배당(미지급 이월) 후 잔여가 보통주. 매각 시 우선주 원금과 미지급 배당을 먼저 정산</td></tr>
              <tr><td>Equity Multiple</td><td>보유기간 총 회수액 ÷ 보통주 자기자본</td></tr>
              <tr><td>IRR</td><td>이분법으로 NPV = 0 인 할인율</td></tr>
            </tbody></table>
          </div>
          <div>
            <h3>모델 검증 <span>지금 화면의 입력값으로 실행</span></h3>
            <ul className="checks">{r.checks.map((k) => (
              <li key={k.label} className={k.pass === null ? "na" : k.pass ? "pass" : "fail"}>
                <b>{k.pass === null ? "N/A" : k.pass ? "PASS" : "FAIL"}</b>
                <span>{k.label}<small>{tidy(k.detail)}{/= [-−]?\d/.test(k.detail) ? tolTxt(k.label) : ""}</small></span>
              </li>
            ))}</ul>
            <h3>이 검토가 확인하지 못한 것</h3>
            <ul className="plain">
              {isRental ? (<>
                <li>공실률 · 운영비 · 수선비는 공공데이터에 없습니다. 현장 실사와 임대관리 견적으로 대체하십시오.</li>
                <li>세대수와 호실 구성은 건축물대장으로 확인하십시오. 매매 단가는 개별 호실 거래라 통매입 할인이 반영되지 않았습니다.</li>
              </>) : (<>
                <li>임대료·공실·관리비 수지는 렌트롤과 부동산원 상업용부동산 임대동향조사(분기)로 대조해야 합니다. 이 화면은 입력값을 그대로 씁니다.</li>
                <li>리스별 만기·렌트프리·갱신은 반영하지 않았습니다. 연 단위 균등 모델입니다.</li>
              </>)}
              <li>보증금은 보유기간 내내 일정하다고 가정했고, 현금흐름은 연 단위입니다.</li>
              <li>세무는 단순화했습니다. 결손금 이월, 대도시 중과, 종합부동산세, 부가가치세는 별도 검토가 필요합니다.</li>
            </ul>
            <p className="fine">공개 데이터에 기반한 정보 제공 도구이며 투자 권유가 아닙니다. 실제 의사결정에는 실사와 전문가 검토가 필요합니다.</p>
          </div>
        </div>
      </section>

      <div className={`mbar${tone ? ` v-${tone}` : ""}`}>
        <button type="button" className="mbar-ro" aria-expanded={sheetOpen} aria-controls="mbar-sheet" onClick={() => setSheetOpen((o) => !o)}>
          {!idle ? <span className={`mbar-tone${tone ? ` ${tone}` : ""}`}>{toneLabel}</span> : null}
          <span title="Levered IRR"><i>IRR</i><b aria-busy={idle ? true : undefined}>{idle ? DASH : fmtRo(irr, "pct")}</b></span>
          <span title="최소 DSCR"><i>DSCR</i><b aria-busy={idle ? true : undefined}>{idle ? DASH : fmtRo(r.minDscr, "mult")}</b></span>
        </button>
        <button type="button" className="mbar-go" onClick={() => go(inputsVisible ? "results" : "inputs")}
          aria-label={`${inputsVisible ? "결론 보기" : "가정 고치기"} · IRR ${idle ? DASH : fmtRo(irr, "pct")} · DSCR ${idle ? DASH : fmtRo(r.minDscr, "mult")}`}>{inputsVisible ? "결론 보기" : "가정 고치기 ↓"}</button>
      </div>
      <div className="mbar-sheet" id="mbar-sheet" hidden={!sheetOpen}>
        <p className="headline">{idle ? "시장값을 불러오는 중입니다" : headText}</p>
        <div className="kpis four">{kpi4({ compact: true })}</div>
        <span className="subnav-basis">{navBasis}</span>
        <nav aria-label="절 (하단 바)">
          <a href="#market" onClick={() => setSheetOpen(false)}>01 {isRental ? "시장" : "자료"}</a>
          <a href="#underwrite" onClick={() => setSheetOpen(false)}>02 언더라이팅</a>
          <a href="#limits" onClick={() => setSheetOpen(false)}>03 한계선</a>
          <a href="#audit" onClick={() => setSheetOpen(false)}>04 검증</a>
        </nav>
        <p><a className="link" href="#inputs" onClick={() => setSheetOpen(false)}>가정 고치기 ↓</a></p>
      </div>
    </main>
  );
}
