"use client";

import { useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { SubNav, type SubNavTone } from "./Header";
import { Kpi, Memo, Notice, NumField, SectionHead, Seg, Term, fmtRo, neg, scrollMode, splitUnit, tidy, wonKr, type MemoAnswer } from "./fields";
import { MarketPanel } from "./MarketPanel";
import { rateOf, useMarket } from "./useMarket";
import { HOME_DEFAULT, homeModel, type HomeInput, type HomeResult } from "@/lib/engine/models/home";
import type { ComplexStat, Market } from "@/lib/connectors/market";
import { ASSET_LABEL, BANDS_BY_ASSET, PY, isAsset, type AreaBand, type Asset } from "@/lib/connectors/types";
import { RULES, loanCap, monthlyPayment, type HouseCount, type Zone } from "@/lib/rules";
import { DASH, eok, num, pct, pctv } from "@/lib/format";

/* ─────────────────────────────────────────────────────────────────────────
   표시 헬퍼 (부호는 U+2212, lib/format은 손대지 않는다)
   ───────────────────────────────────────────────────────────────────────── */

const nm = (v: number | null | undefined, d = 0) => neg(num(v, d));
const ek = (v: number | null | undefined, d = 1) => neg(eok(v, d));
const pv = (v: number | null | undefined, d = 1, signed = false) => neg(pctv(v, d, signed));
const pc = (v: number | null | undefined, d = 2) => neg(pct(v, d));
/** 1억 미만은 만원, 그 이상은 억 (KPI·문장용) */
const won = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? DASH : Math.abs(v) < 10000 ? `${neg(num(v, 0))}만원` : neg(eok(v, 1)));
const signedEok = (v: number) => (Number.isFinite(v) ? `${v < 0 ? "−" : "+"}${eok(Math.abs(v))}` : DASH);
const signedWon = (v: number) => (Number.isFinite(v) ? `${v < 0 ? "−" : "+"}${num(Math.abs(v), 0)}` : DASH);

type Purpose = HomeInput["purpose"];
type FillKey = "price" | "areaM2" | "deposit" | "monthlyRent" | "rentGrowthPct";
const FILL_KEYS: FillKey[] = ["price", "areaM2", "deposit", "monthlyRent", "rentGrowthPct"];
/** 채우기 시점 스냅샷(§4.5). 되돌리기는 이 값으로, 출처 문구는 src로 */
type Snap = { values: Pick<HomeInput, FillKey>; src: Partial<Record<FillKey, string>>; key: string; basis: string; short: string; month: string; n: number;
  /** 전세 끼고 매입용 전세금 추정(환산월세 × 12 ÷ 전환율). deposit 칸이 용도에 따라 보증금·전세금을 겸하므로 따로 둔다 */
  jeonse: number | null; jeonseSrc: string };
type HomeAnswer = MemoAnswer & { qs: string };
type AdvGroup = "house" | "loan" | "rent" | "hold";

const ZONE_LABEL: Record<Zone, string> = { regulated: "조정대상지역", capital: "수도권 (비규제)", other: "비수도권" };
const CHECK_LABEL: Record<string, string> = {
  "자기자본 항등식": "돈의 출처와 쓰임이 일치 (내 돈 + 대출 + 보증금 = 집값 + 세금 + 중개보수)",
  "대출 상환 정합": "대출 상환 합계가 원금과 일치",
  "IRR 역산": "연 수익률 계산이 스스로 맞아떨어짐",
};
const CHECK_TOL: Record<string, string> = { "자기자본 항등식": "허용 ±0.01만원", "대출 상환 정합": "허용 ±0.01만원" };
const JEONSE_NO_LOAN = "전세 세입자가 먼저 돌려받을 권리가 있어 은행은 보통 담보대출을 내주지 않습니다. 이 계산은 대출 0으로 봅니다.";
/** lib 경고 문구의 표시 계층 치환 맵(§7 C-P0-6): 앞부분이 일치하면 문장 전체를 바꾼다. lib 문자열은 그대로 둔다 */
const COPY_MAP: [string, string][] = [
  ["전세를 낀 매입에는 통상 담보대출이 나오지 않습니다", JEONSE_NO_LOAN],
];
const homeCopy = (s: string) => neg(COPY_MAP.reduce((t, [a, b]) => (t.startsWith(a) ? b : t), s));

function readSeed(sp: { get(k: string): string | null }) {
  const a = sp.get("asset");
  const asset: Asset = isAsset(a) ? a : "apt";
  const c = sp.get("code") ?? "";
  const code = /^\d{5}$/.test(c) ? c : "11440";
  const b = sp.get("band");
  const band: AreaBand = BANDS_BY_ASSET[asset].some((x) => x.id === b) ? (b as AreaBand) : asset === "apt" ? "m" : "all";
  const key = sp.get("key");
  return { asset, code, band, key: key ? key : null };
}

const go = (sel: string) => document.querySelector(sel)?.scrollIntoView({ behavior: scrollMode(), block: "start" });

/** 답 한 칸(요약·시트용). Memo 안의 정본은 Memo가 그린다 */
function Ans({ x, short }: { x: HomeAnswer; short?: boolean }) {
  const sp = x.unit === undefined ? splitUnit(x.a) : { value: x.a, unit: x.unit };
  return (
    <div>
      <div className="q">{short ? x.qs : x.q}</div>
      <div className={`a${x.tone === "neg" ? " neg" : ""}`}>{neg(sp.value)}{sp.unit ? <small className="u">{sp.unit}</small> : null}</div>
      {!short && x.s ? <div className="s">{x.s}</div> : null}
    </div>
  );
}

export default function HomeApp() {
  const params = useSearchParams();
  const [seed] = useState(() => readSeed(params));
  const [asset, setAsset] = useState<Asset>(seed.asset);
  const [code, setCode] = useState(seed.code);
  const [band, setBand] = useState<AreaBand>(seed.band);
  const [selectedKey, setSelectedKey] = useState<string | null>(seed.key);
  const [raw, setRaw] = useState<HomeInput>({ ...HOME_DEFAULT, kind: seed.asset });
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loanMode, setLoanMode] = useState<"cap" | "manual">("cap");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState<{ c: ComplexStat | null } | null>(null);
  const [openAdv, setOpenAdv] = useState<Record<AdvGroup, boolean>>({ house: false, loan: false, rent: false, hold: false });
  const [sheet, setSheet] = useState(false);
  const [inputsSeen, setInputsSeen] = useState(false);
  const [today, setToday] = useState("");
  const [live, setLive] = useState("");
  const rawRef = useRef(raw);
  useEffect(() => { rawRef.current = raw; }, [raw]);
  const autofilled = useRef(false);

  /* ── 채우기: 값·출처·기준을 스냅샷으로 남긴다. auto(첫 로드)는 그룹을 펼치지 않는다 */
  const fill = useCallback((m: Market, c: ComplexStat | null, key: string, auto: boolean) => {
    const prev = rawRef.current;
    const areaM2 = Math.round((c ? c.medArea : (m.kpi.medAreaM2 ?? prev.areaM2)) * 10) / 10;
    const py = areaM2 / PY;
    const pricePy = c?.pricePerPy ?? m.kpi.pricePerPy;
    const rentPy = c?.effRentPerPy ?? m.kpi.effRentPerPy;
    const region = m.meta.name.split(" ").pop() ?? m.meta.name;
    const assetLabel = ASSET_LABEL[m.meta.assetId];
    const bandLabel = BANDS_BY_ASSET[m.meta.assetId].find((b) => b.id === m.band)?.label ?? "";
    const scope = c ? c.name : `${region} ${assetLabel}${bandLabel && bandLabel !== "전체" ? ` ${bandLabel}` : ""}`;
    const values: Pick<HomeInput, FillKey> = { price: prev.price, areaM2, deposit: prev.deposit, monthlyRent: prev.monthlyRent, rentGrowthPct: prev.rentGrowthPct };
    const src: Partial<Record<FillKey, string>> = {};
    src.areaM2 = c ? `${c.name} 임대 계약 전용면적 중앙값` : `${scope} 임대 계약 전용면적 중앙값`;
    let n = 1;
    if (pricePy) {
      values.price = Math.round((pricePy * areaM2) / PY / 100) * 100;
      src.price = c?.pricePerPy
        ? `${c.name} 매매 중앙값 ${num(pricePy, 0)}만원/평 (${c.nTrade}건) × ${num(py, 1)}평`
        : `${scope} 매매 중앙값 ${num(pricePy, 0)}만원/평 (${m.kpi.priceN}건) × ${num(py, 1)}평`;
      n++;
    }
    if (c?.medDeposit != null && c.medRent != null) {
      values.deposit = c.medDeposit; values.monthlyRent = c.medRent;
      src.deposit = `${c.name} 월세 계약 보증금 중앙값 (${c.nWolse}건)`;
      src.monthlyRent = `${c.name} 월세 계약 월세 중앙값 (${c.nWolse}건)`;
      n += 2;
    } else if (rentPy) {
      const share = m.kpi.depositToPricePct ?? 10;
      values.deposit = Math.round((values.price * share) / 100 / 100) * 100;
      values.monthlyRent = Math.max(0, Math.round(rentPy * py - (values.deposit * m.conv.ratePct) / 100 / 12));
      src.deposit = `${scope} 매매가 대비 보증금 ${pctv(share, 1)}`;
      src.monthlyRent = `${scope} 환산월세 ${num(rentPy, 2)}만원/평 · 전환율 ${pctv(m.conv.ratePct, 2)}로 역산`;
      n += 2;
    }
    const jeonse = rentPy && m.conv.ratePct > 0 ? Math.round((rentPy * py * 12) / (m.conv.ratePct / 100) / 100) * 100 : null;
    const jeonseSrc = `${scope} 환산월세 ${num(rentPy, 2)}만원/평 × 12 ÷ 전환율 ${pctv(m.conv.ratePct, 2)}로 추정한 전세금`;
    if (m.kpi.rentYoYPct != null) {
      values.rentGrowthPct = Math.round(Math.min(5, Math.max(0, m.kpi.rentYoYPct)) * 10) / 10;
      src.rentGrowthPct = `동일 단지 임대료 전년비 ${pctv(m.kpi.rentYoYPct, 1, true)} (${m.kpi.rentYoYN}개 단지) · 0~5%로 제한`;
      n++;
    }
    if (!auto) {
      setOpenAdv((o) => ({
        ...o,
        house: o.house || values.areaM2 !== prev.areaM2,
        rent: o.rent || (prev.purpose !== "live" && (values.deposit !== prev.deposit || values.monthlyRent !== prev.monthlyRent || values.rentGrowthPct !== prev.rentGrowthPct)),
      }));
    }
    setRaw({ ...prev, ...values, deposit: prev.purpose === "jeonse" && jeonse !== null ? jeonse : values.deposit });
    setSnap({
      values, src, key, n, jeonse, jeonseSrc,
      basis: c ? `${c.name} ${Math.round(areaM2)}㎡ (${region} ${assetLabel})` : `${scope} 매매 중앙값`,
      short: `${region} ${assetLabel}${bandLabel && bandLabel !== "전체" ? ` ${bandLabel}` : ""} 시세`,
      month: (m.meta.to || m.meta.fetchedAt || "").slice(0, 7),
    });
    setPending(null);
  }, []);

  const onLoaded = useCallback((m: Market) => {
    if (autofilled.current) return;
    autofilled.current = true;
    const c = seed.key ? m.complexes.find((x) => x.key === seed.key) ?? null : null;
    fill(m, c, `${m.meta.assetId}|${m.meta.code}|${m.band}|${seed.key ?? ""}`, true);
  }, [fill, seed.key]);

  const { regions, regionsError, rates, market, loading, error, detail, detailError, retry } = useMarket(asset, code, band, selectedKey, onLoaded);
  const baseRate = rateOf(rates, "base");
  const legalCapPct = baseRate === null ? null : Math.min(10, baseRate + 2);

  /* ── 입력 → 계산. 종류는 시장 탭(asset)이 겸하고, 대출은 「빌릴 수 있는 만큼」이면 한도로 */
  const kind = asset;
  // 1세대1주택 비과세는 아파트·무주택·실거주일 때만 엔진에 넘긴다(lib home.ts는 purpose만 보므로 여기서 닫는다)
  const singleApplies = kind === "apt" && raw.houses === 0 && raw.purpose === "live";
  const cap = useMemo(() => loanCap(raw.price, raw.zone, kind, raw.houses, raw.incomeAnnual, raw.existingDebtService, raw.ratePct, raw.termYears),
    [raw.price, raw.zone, kind, raw.houses, raw.incomeAnnual, raw.existingDebtService, raw.ratePct, raw.termYears]);
  const input = useMemo<HomeInput>(() => ({
    ...raw, kind, singleHousehold: singleApplies && raw.singleHousehold,
    loan: raw.purpose === "jeonse" ? 0 : loanMode === "cap" ? cap.max : Math.max(0, raw.loan),
  }), [raw, kind, loanMode, cap.max, singleApplies]);
  const r = useMemo(() => homeModel(input), [input]);
  const yrs = input.holdYears;
  const purpose = input.purpose;
  /* 금리 +1%p 감응(대출 금리 파생 줄). lib 함수만 호출한다 */
  const rateUp = useMemo(() => {
    const c1 = loanCap(raw.price, raw.zone, kind, raw.houses, raw.incomeAnnual, raw.existingDebtService, raw.ratePct + 1, raw.termYears);
    return { cap: c1.max, payCap: monthlyPayment(c1.max, raw.ratePct + 1, raw.termYears), paySame: monthlyPayment(input.loan, raw.ratePct + 1, raw.termYears) };
  }, [raw.price, raw.zone, kind, raw.houses, raw.incomeAnnual, raw.existingDebtService, raw.ratePct, raw.termYears, input.loan]);
  // lib/rules loanCap의 스트레스 가산(수도권·규제 +1.5%p, 비수도권 +0.75%p)을 표시용으로만 되풀이한다. 계산은 lib가 한다
  const stressAdd = input.zone === "other" ? 0.75 : 1.5;
  const stressRate = input.ratePct + stressAdd;

  const set = useCallback(<K extends keyof HomeInput>(k: K, v: HomeInput[K]) => {
    setRaw((p) => (p[k] === v ? p : { ...p, [k]: v }));
    setTouched(true);
  }, []);
  const setPurpose = (v: Purpose) => {
    setRaw((p) => {
      if (p.purpose === v) return p;
      let deposit = p.deposit;
      // 손대지 않은 시세 값이면 용도에 맞는 값으로 바꿔 준다 (월세 보증금 ↔ 전세금 추정)
      if (snap && snap.jeonse !== null) {
        if (v === "jeonse" && p.deposit === snap.values.deposit) deposit = snap.jeonse;
        else if (v !== "jeonse" && p.deposit === snap.jeonse) deposit = snap.values.deposit;
      }
      return { ...p, purpose: v, deposit };
    });
    setTouched(true);
    if (v !== "live") setOpenAdv((o) => ({ ...o, rent: true }));
  };
  const toggleAdv = (g: AdvGroup) => (e: SyntheticEvent<HTMLDetailsElement>) => { const open = e.currentTarget.open; setOpenAdv((o) => (o[g] === open ? o : { ...o, [g]: open })); };

  /* ── 출처·되돌리기·채우기 라벨 분기(§4.5 · §4.6) */
  const refVal = useCallback((k: FillKey) => (snap ? (k === "deposit" && raw.purpose === "jeonse" && snap.jeonse !== null ? snap.jeonse : snap.values[k]) : undefined), [snap, raw.purpose]);
  const editedKeys = useMemo(() => (snap ? FILL_KEYS.filter((k) => raw[k] !== refVal(k)) : []), [raw, snap, refVal]);
  const edited = editedKeys.length;
  const curKey = `${asset}|${code}|${band}|${selectedKey ?? ""}`;
  const stale = !snap || snap.key !== curKey;
  const fillLabel = edited > 0 || stale ? "이 지역 시세로 가정 채우기" : "내 조건으로 이동";
  const requestFill = (c: ComplexStat | null) => {
    if (!market) return;
    if (c === null && !stale && edited === 0) { go("#inputs"); return; }
    if (edited > 0) { setPending({ c }); go("#market"); return; }
    fill(market, c, curKey, false);
    go("#inputs");
  };
  const confirmFill = () => { if (market && pending) { fill(market, pending.c, curKey, false); go("#inputs"); } };
  const restore = (k: FillKey) => { const v = refVal(k); if (v !== undefined) setRaw((p) => ({ ...p, [k]: v })); };
  const prov = (k: FillKey) => {
    const ref = refVal(k);
    const src = k === "deposit" && raw.purpose === "jeonse" && snap?.jeonse !== null ? snap?.jeonseSrc : snap?.src[k];
    if (ref === undefined || src === undefined) return {};
    return raw[k] !== ref ? { marketValue: ref, onRestore: () => restore(k) } : { source: src };
  };

  /* ── 문구 조각 */
  const regionName = (regions?.regions.flatMap((s) => s.sgg).find((g) => g.code === code)?.name ?? market?.meta.name ?? "").split(" ").pop() ?? "";
  const bandLabel = BANDS_BY_ASSET[asset].find((b) => b.id === band)?.label ?? "";
  const month = snap?.month || (market?.meta.to || "").slice(0, 7);
  const noLoan = r.cap.binding === "불가";
  const short = !r.ok;
  /** 직접 입력한 대출이 규제 한도를 넘는 상태(엔진은 경고만 내고 그대로 계산한다) */
  const over = purpose !== "jeonse" && loanMode === "manual" && r.loan > r.cap.max + 1;
  const idle = !snap && !touched && !error;
  const tone: SubNavTone = idle ? null : short ? "neg" : noLoan || over ? "warn" : "ok";
  const toneLabel = short ? "자기자본 부족" : noLoan ? "대출 불가" : over ? "한도 초과" : undefined;
  const capParts = [`LTV ${r.cap.ltvPct}% ${ek(r.cap.ltvCap)}`]
    .concat(r.cap.dsrCap !== null ? [`DSR 40% ${ek(r.cap.dsrCap)}`] : [])
    .concat(r.cap.capitalCap !== null ? [`수도권 상한 ${ek(r.cap.capitalCap)}`] : []);
  const capLine = `${capParts.join(" · ")} 중 작은 값`;
  const principal1 = (r.years[0]?.principal ?? 0) / 12;
  const other1 = r.monthlyOut - r.payment;
  const lastBalance = r.years[r.years.length - 1]?.balance ?? 0;

  /* ── 네 가지 답 (memo 정본 · uw-summary · subnav readout · mbar가 같은 배열을 읽는다)
        설명(s)은 핵심 수치를 앞에 둔 40자 안팎 산식 줄(2줄 clamp)이고, 전문은 title로 남긴다(§4.7 · §8-6). 지표명은 정적 dfn(§4.11) */
  const answers = useMemo<HomeAnswer[]>(() => {
    const q1 = "얼마까지 빌릴 수 있나";
    const dsrNow = r.dsrPct !== null ? `DSR ${pv(r.dsrPct, 0)}` : null;
    const stressNote = r.cap.dsrCap !== null ? `소득 기준 ${ek(r.cap.dsrCap)}은 스트레스 금리 +${stressAdd}%p(${pv(stressRate, 2)})로 계산한 DSR 40% 한도` : "";
    const a1Full = `${capLine}. ${stressNote ? `${stressNote} · ` : ""}${dsrNow ? `실제 금리 ${pv(input.ratePct, 2)}로는 ${dsrNow}` : "소득이 없어 DSR은 계산하지 않습니다"}${over ? ` · 직접 입력 ${ek(r.loan)}은 한도를 넘습니다` : ""}`;
    const capShort = (
      <><Term k="LTV" static>LTV</Term> {ek(r.cap.ltvCap)}{r.cap.dsrCap !== null ? <> · <Term k="DSR" static>DSR</Term> {ek(r.cap.dsrCap)}</> : null}{r.cap.capitalCap !== null ? <> · 상한 {ek(r.cap.capitalCap)}</> : null} 중 최소</>
    );
    const stressShort = r.cap.dsrCap !== null ? ` · DSR 한도는 스트레스 금리 ${pv(stressRate, 2)} 기준` : "";
    const a1: HomeAnswer = purpose === "jeonse"
      ? { q: q1, qs: "대출 한도", a: "0", unit: "만원", s: JEONSE_NO_LOAN }
      : noLoan
      ? { q: q1, qs: "대출 한도", a: "대출 불가", unit: "", tone: "neg", s: `${r.cap.note}. 이 계산은 대출 0으로 봅니다.` }
      : over
      ? { q: q1, qs: "대출 한도", a: eok(r.cap.max), s: <span title={a1Full}>직접 입력 {ek(r.loan)}은 한도를 넘습니다{dsrNow ? ` · 이 대출이면 ${dsrNow}` : ""} · 한도는 {capShort}</span> }
      : { q: q1, qs: "대출 한도", a: eok(r.cap.max), s: <span title={a1Full}>{capShort}{dsrNow ? ` · 실제 ${dsrNow}` : " · 소득이 없어 DSR은 계산하지 않습니다"}{stressShort}</span> };

    const loanTerms = r.loan > 0 ? `대출 ${ek(r.loan)} · ${pv(input.ratePct, 2)} · ${input.termYears}년` : "대출 없음";
    const a2Live = r.loan > 0
      ? `원리금 ${nm(r.payment)} (${loanTerms}) + 보유세·관리·수선 ${nm(other1)} · 원금 상환 ${nm(principal1)}만원은 내 자산`
      : `보유세·관리·수선 ${nm(other1)} · 대출 없음`;
    const a2LiveFull = `매달 나가는 돈 ${num(Math.abs(r.monthlyNet), 0)}만원 = 원리금 ${nm(r.payment)}만원 (${loanTerms}${r.loan > 0 ? " 원리금균등" : ""}) + 보유세·관리비·수선 준비금 ${nm(other1)}만원. 원금 상환 ${nm(principal1)}만원은 빚을 줄이는 돈이라 내 자산으로 남습니다.`;
    const a2: HomeAnswer = purpose === "rent"
      ? { q: "매달 얼마가 남나", qs: "월 현금", a: signedWon(r.monthlyNet), unit: "만원", tone: r.monthlyNet < 0 ? "neg" : null,
          s: <span title={`매달 남는 돈 ${signedWon(r.monthlyNet)}만원 = 월세 ${nm(r.monthlyIn)} − 원리금 ${nm(r.payment)} (${loanTerms}) − 보유세·관리비·수선 준비금 ${nm(other1)}. 원금 상환 ${nm(principal1)}만원은 빚을 줄이는 돈이라 내 자산으로 남습니다.`}>월세 {nm(r.monthlyIn)} − 원리금 {nm(r.payment)} ({loanTerms}) − 보유세·관리·수선 {nm(other1)} · 원금 상환 {nm(principal1)}만원은 내 자산</span> }
      : purpose === "jeonse"
        ? { q: "매달 얼마가 나가나", qs: "매달 지출", a: num(Math.abs(r.monthlyNet), 0), unit: "만원", s: `보유세·관리·수선 ${nm(r.monthlyOut)} · 대출 없음 · 전세금 ${ek(input.deposit)}은 만기에 돌려줄 돈` }
        : { q: "매달 얼마가 나가나", qs: "매달 지출", a: num(Math.abs(r.monthlyNet), 0), unit: "만원", s: <span title={a2LiveFull}>{a2Live}</span> };

    // lib totalNet = 보유 중 순현금 합계(전세는 전세금 상승분 유입 포함) + 매각 순수령 − 처음 넣은 돈. 산식 줄은 그 세 항을 그대로 보여 준다
    const q3 = `${yrs}년 뒤 팔면 내 돈이 얼마나 늘거나 줄어드나`;
    const flow = r.totalNet - r.saleNet + r.cashNeeded;
    const flowLabel = flow < 0 ? `${yrs}년간 낸 돈` : `${yrs}년간 남은 돈`;
    const brokerSell = (r.salePrice * input.brokeragePct) / 100;
    const a3Full = `팔아서 받는 돈 ${ek(r.saleNet)} = 매각 ${ek(r.salePrice)} − 중개보수 ${won(brokerSell)} − 양도세 ${won(r.cgt.tax)}${lastBalance > 0 ? ` − 대출 잔액 ${ek(lastBalance)}` : ""}${purpose === "jeonse" ? " − 전세금 반환" : purpose === "rent" ? " − 보증금 반환" : ""}. 여기서 ${flowLabel} ${ek(Math.abs(flow))}${flow < 0 ? "을 빼고" : "을 더하고"} 처음 넣은 내 돈 ${ek(r.cashNeeded)}을 빼면 ${signedEok(r.totalNet)}. 내 돈 기준 연 수익률 ${pc(r.irr)}.`;
    const a3: HomeAnswer = short
      ? { q: q3, qs: `${yrs}년 뒤`, a: DASH, unit: "", tone: "neg", s: "대출과 보증금이 매입 비용을 넘어 자기자본이 0 이하입니다. 이 구조는 계산하지 않습니다." }
      : { q: q3, qs: `${yrs}년 뒤`, a: signedEok(r.totalNet), tone: r.totalNet < 0 ? "neg" : null,
          s: <span title={a3Full}>받는 돈 {ek(r.saleNet)} {flow < 0 ? "−" : "+"} {flowLabel} {ek(Math.abs(flow))} − 처음 넣은 {ek(r.cashNeeded)} = {signedEok(r.totalNet)} · 내 돈 기준 연 {pc(r.irr)}</span> };

    const q4 = "본전이 되는 집값 상승률";
    const altDef = "집 대신 예금에 두면 벌 수익률";
    const a4: HomeAnswer = short
      ? { q: q4, qs: "본전 상승률", a: DASH, unit: "", s: "자기자본이 0 이하라 계산하지 않습니다 · 보증금이나 대출을 줄이면 다시 계산합니다" }
      : r.breakevenGrowthPct === null
      ? { q: q4, qs: "본전 상승률", a: DASH, unit: "", s: `연 −10~15% 범위에서 본전이 되는 상승률을 찾지 못했습니다 · 지금 가정 ${pv(input.priceGrowthPct, 1)}` }
      : { q: q4, qs: "본전 상승률", a: `${pv(r.breakevenGrowthPct, 1)}/년`,
          s: <span title={`집값이 연 ${pv(r.breakevenGrowthPct, 1)} 오르면 ${yrs}년 뒤 팔 때 본전입니다. 기회수익률(${altDef}) ${pv(input.altReturnPct, 1)}를 넘으려면 ${r.breakevenGrowthAltPct === null ? "연 −10~15% 범위 밖" : `연 ${pv(r.breakevenGrowthAltPct, 1)} 이상`} · 지금 가정 ${pv(input.priceGrowthPct, 1)}.`}>
            {r.breakevenGrowthAltPct === null ? <>연 −10~15% 범위 안에서는 </> : <>연 {pv(r.breakevenGrowthAltPct, 1)} 이상이면 </>}<Term k="기회수익률" static>기회수익률</Term> {pv(input.altReturnPct, 1)}({altDef}){r.breakevenGrowthAltPct === null ? "을 넘지 못합니다" : "도 넘습니다"} · 지금 가정 {pv(input.priceGrowthPct, 1)}
          </span> };
    return [a1, a2, a3, a4];
  }, [noLoan, short, over, purpose, yrs, r, input.deposit, input.altReturnPct, input.priceGrowthPct, input.ratePct, input.termYears, input.brokeragePct, capLine, principal1, other1, stressAdd, stressRate, lastBalance]);

  const headline = answers.map((x) => `${x.qs} ${x.a}${x.unit ?? ""}`).join(" · ");
  const monthRo = purpose === "rent" ? fmtRo(r.monthlyNet, "won+") : fmtRo(Math.abs(r.monthlyNet), "won");
  const readouts = [
    { label: purpose === "rent" ? "월 현금" : "월 지출", value: idle ? DASH : monthRo, href: "#memo" },
    { label: `${yrs}년 뒤`, value: idle || short ? DASH : fmtRo(r.totalNet, "eok+"), href: "#memo" },
    { label: "본전 상승률", value: idle || r.breakevenGrowthPct === null ? DASH : `${pv(r.breakevenGrowthPct, 1)}/년`, href: "#memo" },
  ];
  /* 시세를 채운 뒤 01 시장 조건(자산·지역·면적·단지)이 바뀌면 가정은 옛 시세 그대로다. 기준 문구마다 표시하고 채우기 링크를 붙인다(§4.6 stale · 원칙 7) */
  const staleBasis = !!snap && stale;
  const staleNote: ReactNode = staleBasis ? (
    <> · 시장 조건이 바뀜 · {market ? <button type="button" className="link" onClick={() => requestFill(null)}>이 지역 시세로 가정 채우기</button> : "시세를 불러오는 중"}</>
  ) : null;
  const subBasis = `${snap?.short ?? `${regionName} ${ASSET_LABEL[asset]}${bandLabel && bandLabel !== "전체" ? ` ${bandLabel}` : ""} 시세`}${edited > 0 ? " · 수정됨" : ""}${staleBasis ? " · 시세 갱신 필요" : ""}`;
  const memoBasis: ReactNode = snap
    ? <span>시세 기준 · {snap.basis} · {snap.month || month || DASH}{staleNote}</span>
    : touched ? "직접 입력 · 기본 가정" : error ? "기본 가정 · 시세를 불러오지 못했습니다" : "기본 가정";

  /* ── sr-only 방송(1초 디바운스) · #inputs 관찰(하단 바) · 인쇄 시 details 펼침 + 조회일(인쇄 머리줄) */
  useEffect(() => {
    if (idle) return;
    const t = setTimeout(() => setLive(answers.map((x) => `${x.q} ${x.a}${x.unit ?? ""}`).join(" · ")), 1000);
    return () => clearTimeout(t);
  }, [answers, idle]);
  useEffect(() => {
    const el = document.getElementById("inputs");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInputsSeen(e.isIntersecting), { rootMargin: "-25% 0px -25% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const before = () => {
      flushSync(() => setToday(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)));
      document.querySelectorAll<HTMLDetailsElement>("main details:not([open])").forEach((d) => { d.open = true; d.dataset.printOpened = "1"; });
    };
    const after = () => document.querySelectorAll<HTMLDetailsElement>("main details[data-print-opened]").forEach((d) => { d.open = false; delete d.dataset.printOpened; });
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);

  const R = (id: keyof typeof RULES) => (
    <div className="rule-meta">{RULES[id].basis} · 기준 {RULES[id].asOf} · {RULES[id].verified ? "검증됨" : <b>세무 검토 전</b>}{RULES[id].note ? ` · ${RULES[id].note}` : ""}</div>
  );
  const advSummary: Record<AdvGroup, string> = {
    house: `${num(input.areaM2, 1)}㎡ · ${ZONE_LABEL[input.zone]} · ${singleApplies ? (input.singleHousehold ? "1주택 요건 충족" : "1주택 요건 미충족") : "1주택 요건 해당 없음"}`,
    loan: `기존 상환액 ${nm(input.existingDebtService)} · ${purpose === "jeonse" ? "대출 없음" : loanMode === "cap" ? "빌릴 수 있는 만큼" : `직접 입력 ${ek(input.loan)}`} · ${input.termYears}년`,
    rent: purpose === "live" ? "실거주에는 해당 없음"
      : purpose === "rent" ? `보증금 ${wonKr(input.deposit)} · 월세 ${nm(input.monthlyRent)}만원 · 상승률 ${pv(input.rentGrowthPct, 1)}`
        : `전세금 ${ek(input.deposit)} · 전세가율 ${pv(r.jeonseRatioPct, 0)} · 역전세 ${pv(input.jeonseDropPct, 0)}`,
    hold: `${yrs}년 · 관리비 ${nm(input.mgmtMonthly)}만원 · 준비금 ${pv(input.repairPct, 1)} · 중개 ${pv(input.brokeragePct, 1)} · 현실화율 ${pv(input.realizationPct, 0)} · 기회수익률 ${pv(input.altReturnPct, 1)}`,
  };
  const fillConfirm: ReactNode = pending ? (
    <Notice tone="warn" role="status" className="fill-confirm">
      고친 값 {edited}개를 시장값으로 바꿉니다
      <button type="button" className="link" onClick={confirmFill}>바꾸기</button>
      <button type="button" className="link" onClick={() => setPending(null)}>취소</button>
    </Notice>
  ) : null;
  const proHref = asset === "offi"
    ? `/pro?asset=offi&code=${code}&band=${band}${selectedKey ? `&key=${encodeURIComponent(selectedKey)}` : ""}`
    : `/pro?asset=offi&code=${code}&band=all`;
  const notes = r.warnings.filter((w) => !w.startsWith("대출과 보증금이 매입 비용을 넘습니다")).map(homeCopy);
  // 출처 줄이 있는 행은 파생 줄을 생략한다(매입가는 출처에 평당 단가 × 평이 이미 있고, 나머지는 390px 행 높이 §8-13)
  const priceProv = prov("price");
  const areaProv = prov("areaM2");
  const depositProv = prov("deposit");
  const rentProv = prov("monthlyRent");
  const rentgProv = prov("rentGrowthPct");
  const yearSpend = (y: HomeResult["years"][number]) => y.interest + y.principal + y.holdTax + y.other;

  return (
    <main id="main" tabIndex={-1}>
      <SubNav items={[{ id: "market", no: "01", label: "시장" }, { id: "conditions", no: "02", label: "내 조건" }]} basis={subBasis} readouts={readouts} tone={tone} />
      <p className="print-only">RE:LAB · Model Desk Home · {regionName} {ASSET_LABEL[asset]} {bandLabel} · 조회 {today} · 정보 제공 도구이며 투자 권유가 아닙니다</p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{live}</p>

      <section className="intro">
        <p className="eyebrow">Model Desk · Home</p>
        <h1>집 한 채 매입 검토</h1>
        <p className="intro-lead">대출 한도, 매달 나가는 돈, 팔 때 남는 돈, 본전이 되는 상승률. 네 가지를 실거래가와 금리로 계산합니다.</p>
        <p className="status home-status">
          <span><b className="kicker">Snapshot</b>{market ? `실거래가 · ${market.meta.mode === "live" ? "국토부 OpenAPI" : "국토부 공개 CSV"}${month ? ` ${month}` : ""}` : loading ? "실거래가 · 불러오는 중" : "실거래가 · 불러오지 못함"}</span>
          <span><b className={`kicker${rates?.live ? " live" : ""}`}>Live</b>{rates ? `금리 · ECOS ${rates.fetchedAt}${rates.live ? "" : " · 마지막 확인값"}` : "금리 · 불러오는 중"}</span>
          <span>계산은 브라우저 안에서 · 입력값은 저장하지 않습니다</span>
        </p>
      </section>

      <Memo variant="home" kicker="네 가지 답 · Summary" tone={tone} toneLabel={toneLabel} answers={answers}
        basis={memoBasis} edited={edited > 0}
        tally={snap ? <span>시세에서 채운 값 <b>{snap.n}</b>개{edited > 0 ? <> · 고친 값 <b>{edited}</b>개</> : null}</span> : undefined}
        actions={[{ label: "내 조건 고치기 ↓", href: "#inputs" }, { label: "계산 확인 보기", href: "#audit" }]}
        idle={idle ? "시세를 불러오면 가정 6개가 채워지고 네 가지 답이 여기 나옵니다 · 기다리지 않으려면 아래에 직접 입력" : undefined} />

      <MarketPanel asset={asset} onAsset={(a) => { setAsset(a); setSelectedKey(null); setBand(a === "apt" ? "m" : "all"); setPending(null); }}
        regions={regions} regionsError={regionsError} code={code} band={band} market={market} loading={loading} error={error}
        selectedKey={selectedKey} detail={detail} detailError={detailError} legalCapPct={legalCapPct}
        onCode={(c) => { setSelectedKey(null); setCode(c); setPending(null); }} onBand={(b) => { setBand(b); setPending(null); }} onPick={setSelectedKey}
        sectionNo="01" compact audience="home" fillLabel={fillLabel} fillConfirm={fillConfirm}
        onFillRegion={() => requestFill(null)} onFillComplex={(c) => requestFill(c)} onRetry={retry}
        links={{ pro: proHref }} />

      <section id="conditions" className="sec">
        <SectionHead no="02" title="내 조건" lead="값을 고치면 답이 바로 바뀝니다. 입력값은 서버로 가지 않습니다." />
        <div className="uw">
          <div className="uw-inputs" id="inputs">
            <div className="basis">
              <span><span className="basis-label">시세 기준</span>{snap ? `${snap.basis} · ${snap.month || DASH}` : "기본 가정 · 시세를 불러오면 채워집니다"}{edited > 0 ? <b className="basis-edited">수정됨</b> : null}{staleNote}</span>
            </div>
            {pending && !market ? fillConfirm : null}

            <Seg id="h-purpose" label="용도" value={purpose} options={[{ id: "live", label: "실거주" }, { id: "rent", label: "월세 임대" }, { id: "jeonse", label: "전세 끼고 매입" }]} onChange={setPurpose}
              derived={purpose === "jeonse" ? <><Term k="갭 (전세 끼고 매입)">전세 끼고 매입</Term>은 매입가와 전세금의 차액만 내 돈으로 내는 방식입니다</> : undefined} />
            <div className="field static">
              <span className="field-label">종류</span>
              <span className="field-static">{ASSET_LABEL[kind]}</span>
              <div className="field-derived"><a className="link" href="#market">01 시장</a>의 자산 탭에서 변경 · 아파트는 주택, 오피스텔은 건축물로 과세</div>
            </div>
            <NumField id="h-price" label="매입가" unit="만원" value={input.price} step={1000} min={1000} onChange={(v) => set("price", v)} {...priceProv}
              derived={priceProv.source ? undefined : `전용 ${num(input.areaM2, 1)}㎡ (${num(input.areaM2 / PY, 1)}평) · 평당 ${nm(input.price / (input.areaM2 / PY))}만원`} />
            <NumField id="h-income" label="연소득 (세전)" unit="만원" value={input.incomeAnnual} step={100} min={0} onChange={(v) => set("incomeAnnual", v)}
              derived={r.cap.dsrCap !== null ? <><Term k="DSR">DSR</Term> 40% 기준 소득 한도 {ek(r.cap.dsrCap)} · 연 원리금이 소득의 40%를 넘지 않는 선</> : <><Term k="DSR">DSR</Term> · 소득이 없으면 소득 한도를 계산하지 않습니다</>} />
            <Seg id="h-houses" label="지금 보유 주택" value={String(input.houses)} options={[{ id: "0", label: "무주택" }, { id: "1", label: "1채" }, { id: "2", label: "2채" }, { id: "3", label: "3채 이상" }]} onChange={(v) => set("houses", Number(v) as HouseCount)}
              derived={input.houses > 0 ? `취득 후 ${input.houses + 1}주택 · ${r.acq.label} ${pv(r.acq.totalPct, 1)}` : undefined} />
            <NumField id="h-rate" label="대출 금리" unit="%" value={input.ratePct} step={0.05} min={0} max={20} onChange={(v) => set("ratePct", v)}
              derived={<>
                <span className="dl">{rates ? <>참고: 기준금리 {pv(rateOf(rates, "base"), 2)} · CD 91일 {pv(rateOf(rates, "cd91"), 2)} (<a className="link" href="https://ecos.bok.or.kr" target="_blank" rel="noreferrer">ECOS</a> {rates.fetchedAt})</> : "참고: 금리 불러오는 중"}</span>
                {purpose !== "jeonse" && !noLoan ? (
                  <span className="dl">
                    {rateUp.cap < r.cap.max - 1
                      ? <>+1%p면 한도 {ek(rateUp.cap)} · 월 원리금 {nm(rateUp.payCap)}만원 · 지금 대출액 {ek(r.loan)} 그대로면 {nm(rateUp.paySame)}만원{loanMode === "cap" ? " · 빌릴 수 있는 만큼이면 한도가 먼저 줄어듭니다" : ""}</>
                      : <>+1%p면 한도는 그대로 {ek(r.cap.max)} ({r.cap.binding} 기준) · 월 원리금 {nm(rateUp.paySame)}만원</>}
                  </span>
                ) : null}
              </>} />
            <NumField id="h-growth" label="집값 상승률" unit="%/년" value={input.priceGrowthPct} step={0.5} min={-20} max={20} sign onChange={(v) => set("priceGrowthPct", v)}
              derived={market?.kpi.priceYoYPct != null
                ? `참고: 최근 1년 ${pv(market.kpi.priceYoYPct, 1, true)} (동일 단지 ${market.kpi.priceYoYN}개) · 장기 평균 보통 2~3%`
                : "참고: 장기 평균은 보통 2~3%"} />

            <details className="adv" open={openAdv.house} onToggle={toggleAdv("house")}>
              <summary>집과 규제 <span>{advSummary.house}</span></summary>
              <NumField id="h-area" label="전용면적" unit="㎡" value={input.areaM2} step={1} min={10} onChange={(v) => set("areaM2", v)} {...areaProv}
                derived={areaProv.source ? undefined : input.areaM2 > 85 ? "85㎡ 초과: 취득 시 농어촌특별세가 붙습니다" : "85㎡ 이하: 농어촌특별세 없음"} />
              <Seg id="h-zone" label="지역 규제" value={input.zone} options={[{ id: "regulated", label: "조정대상지역" }, { id: "capital", label: "수도권 (비규제)" }, { id: "other", label: "비수도권" }]} onChange={(v) => set("zone", v as Zone)}
                derived="조정대상지역은 정부가 지정한 규제 지역입니다" />
              {singleApplies ? (
                <Seg id="h-single" label="1세대1주택 요건" term="1세대1주택 비과세 요건" value={input.singleHousehold ? "y" : "n"} options={[{ id: "y", label: "충족 (2년 보유·거주)" }, { id: "n", label: "미충족" }]} onChange={(v) => set("singleHousehold", v === "y")}
                  derived="무주택이고 이 집에 살 계획이면 충족 · 12억까지 양도세 비과세" />
              ) : (
                <div className="field static">
                  <span className="field-label">1세대1주택 요건</span>
                  <span className="field-static">해당 없음</span>
                  <div className="field-derived">{kind !== "apt" ? "오피스텔은 주택 비과세를 적용하지 않습니다" : input.houses > 0 ? "이미 주택이 있어 1세대1주택 비과세를 적용하지 않습니다" : "실거주가 아니면 1세대1주택 비과세를 적용하지 않습니다"}</div>
                </div>
              )}
              <p className="fine">조정대상지역 지정 현황은 국토교통부 고시 · 모르면 &apos;수도권 (비규제)&apos;로 두고 비교하십시오</p>
            </details>

            <details className="adv" open={openAdv.loan} onToggle={toggleAdv("loan")}>
              <summary>대출 세부 <span>{advSummary.loan}</span></summary>
              <NumField id="h-debt" label="기존 대출 연 상환액" unit="만원" value={input.existingDebtService} step={100} min={0} onChange={(v) => set("existingDebtService", v)}
                derived="이미 갚고 있는 대출의 1년 원리금. DSR 계산에서 소득 한도를 줄입니다" />
              <Seg id="h-loanmode" label="대출 금액" value={purpose === "jeonse" ? "none" : loanMode} options={purpose === "jeonse" ? [{ id: "none", label: "대출 없음" }] : [{ id: "cap", label: "빌릴 수 있는 만큼" }, { id: "manual", label: "직접 입력" }]}
                onChange={(v) => { if (v === "cap" || v === "manual") setLoanMode(v); }}
                derived={purpose === "jeonse" ? JEONSE_NO_LOAN : loanMode === "cap" ? "규제 한도까지 계산" : undefined} />
              {purpose !== "jeonse" && loanMode === "manual" ? <NumField id="h-loan" label="대출" unit="만원" value={raw.loan} step={1000} min={0} onChange={(v) => set("loan", v)} derived={over ? `한도 ${ek(r.cap.max)}을 넘습니다 · 엔진은 입력값 그대로 계산합니다` : undefined} /> : null}
              <div className="field static">
                <span className="field-label">빌릴 수 있는 돈</span>
                <span className={`field-value${noLoan ? " neg" : ""}`}>{noLoan ? "불가" : <>{neg(splitUnit(eok(r.cap.max)).value)}<small className="u">억</small></>}</span>
                <div className="field-derived">
                  {noLoan ? `${r.cap.note} · 이 계산은 대출 0으로 봅니다` : <>
                    <span className="dl">= 집값 기준(<Term k="LTV">LTV</Term> {r.cap.ltvPct}%) {ek(r.cap.ltvCap)}{r.cap.dsrCap !== null ? <>, 소득 기준(DSR 40%) {ek(r.cap.dsrCap)}</> : null}{r.cap.capitalCap !== null ? <>, 수도권 상한 {ek(r.cap.capitalCap)}</> : null} 중 작은 값 · {r.cap.binding} 기준</span>
                    {r.cap.dsrCap !== null ? <span className="dl">소득 기준 {ek(r.cap.dsrCap)}은 <Term k="스트레스 DSR">스트레스 금리</Term> +{stressAdd}%p({pv(stressRate, 2)})로 계산한 DSR 40% 한도{r.loan > 0 && r.dsrPct !== null ? ` · 실제 금리 ${pv(input.ratePct, 2)}로는 DSR ${pv(r.dsrPct, 0)}` : ""}{over ? ` · 직접 입력 ${ek(r.loan)}은 한도 초과` : ""}</span> : null}
                  </>}
                </div>
              </div>
              <NumField id="h-term" label="만기" unit="년" value={input.termYears} step={1} min={1} max={40} onChange={(v) => set("termYears", Math.round(v))}
                derived={`원리금균등 월 ${nm(r.payment)}만원 · 첫 달 이자 ${nm(r.interest1)}만원`} />
              {R("loan")}
            </details>

            <details className="adv" open={openAdv.rent} onToggle={toggleAdv("rent")}>
              <summary>{purpose === "jeonse" ? "전세 조건" : "임대 조건"} <span>{advSummary.rent}</span></summary>
              {purpose === "live" ? (
                <p className="fine">실거주에는 임대 조건을 쓰지 않습니다. 용도를 월세 임대 또는 전세 끼고 매입으로 바꾸면 여기가 열립니다.</p>
              ) : purpose === "rent" ? (
                <>
                  <NumField id="h-deposit" label="보증금" unit="만원" value={input.deposit} step={500} min={0} onChange={(v) => set("deposit", v)} {...depositProv}
                    derived={depositProv.source ? undefined : "세입자에게 받아 두는 돈. 나갈 때 돌려줍니다"} />
                  <NumField id="h-rent" label="월세" unit="만원" value={input.monthlyRent} step={5} min={0} onChange={(v) => set("monthlyRent", v)} {...rentProv}
                    derived={rentProv.source ? undefined : <><Term k="총수익률 (Gross)">총수익률</Term> {pv(r.grossYieldPct, 2)} · 연 월세 ÷ (매입가 − 보증금)</>} />
                  <NumField id="h-rentg" label="월세 상승률" unit="%/년" value={input.rentGrowthPct} step={0.5} min={0} max={20} onChange={(v) => set("rentGrowthPct", v)} {...rentgProv}
                    derived={rentgProv.source ? undefined : <><Term k="갱신 5% 상한">갱신 때는 5% 상한</Term>이 적용됩니다</>} />
                  {R("rent")}
                </>
              ) : (
                <>
                  <NumField id="h-deposit" label="전세금" unit="만원" value={input.deposit} step={500} min={0} onChange={(v) => set("deposit", v)} {...prov("deposit")}
                    derived={<><Term k="전세가율">전세가율</Term> {pv(r.jeonseRatioPct, 1)} · 전세금 ÷ 매입가. 이 돈은 내 돈이 아니라 세입자에게 돌려줄 빚입니다</>} />
                  <NumField id="h-rentg" label="전세금 상승률" unit="%/년" value={input.rentGrowthPct} step={0.5} min={0} max={20} onChange={(v) => set("rentGrowthPct", v)} {...prov("rentGrowthPct")}
                    derived="갱신 때는 5% 상한이 적용됩니다. 오른 만큼은 보유 중에 들어오고 만기에 함께 돌려줍니다" />
                  <NumField id="h-drop" label="역전세 · 만기 전세가 하락" unit="%" term="역전세" value={input.jeonseDropPct} step={5} min={0} max={60} onChange={(v) => set("jeonseDropPct", v)}
                    derived={`만기 때 전세 시세가 이만큼 내려가면 ${ek(r.jeonseStress?.drop ?? 0)}을 내 돈으로 돌려줘야 합니다`} />
                  {R("rent")}
                </>
              )}
            </details>

            <details className="adv" open={openAdv.hold} onToggle={toggleAdv("hold")}>
              <summary>보유·매각 세부 <span>{advSummary.hold}</span></summary>
              <NumField id="h-hold" label="보유 기간" unit="년" value={input.holdYears} step={1} min={1} max={30} onChange={(v) => set("holdYears", Math.round(v))}
                derived={input.holdYears < 2 ? "2년 미만 매각은 단기 양도세율이 붙습니다" : undefined} />
              <NumField id="h-mgmt" label="관리비 등 월 지출" unit="만원" value={input.mgmtMonthly} step={5} min={0} onChange={(v) => set("mgmtMonthly", v)}
                derived={purpose === "live" ? "실거주 시 본인 부담" : "임대인 부담분 (공실 시 관리비 등)"} />
              <NumField id="h-repair" label="수선 · 공실 준비금 (매입가 대비 연)" unit="%" value={input.repairPct} step={0.1} min={0} max={5} onChange={(v) => set("repairPct", v)} />
              <NumField id="h-broker" label="중개보수 (매수·매도 각)" unit="%" value={input.brokeragePct} step={0.1} min={0} max={1} onChange={(v) => set("brokeragePct", v)} />
              <NumField id="h-real" label="공시가격 현실화율" term="공시가격 현실화율" unit="%" value={input.realizationPct} step={1} min={30} max={100} onChange={(v) => set("realizationPct", v)}
                derived={`공시가격 추정 ${ek(r.hold.assessed)} · 실제 공시가격이 있으면 그 비율로 고치십시오`} />
              <NumField id="h-alt" label="기회수익률" term="기회수익률" unit="%" value={input.altReturnPct} step={0.5} min={0} max={20} onChange={(v) => set("altReturnPct", v)} last
                derived="이 돈을 집 대신 예금·채권에 두면 벌 수 있는 수익률" />
            </details>
            <p className="fine">단축키: 위아래 방향키 ±step · Shift ×10 · Alt ×0.1 · Enter 다음 칸 · Esc 되돌리기</p>
          </div>

          <div className="uw-results">
            <div className="uw-summary" aria-label="네 가지 답 요약">
              <p className="headline" title={headline}>{headline}</p>
              <div className="answers">{answers.map((x) => <Ans key={x.qs} x={x} short />)}</div>
              <p className="sum-links"><a className="to-top" href="#memo">요약으로 ↑</a><a className="to-inputs link" href="#inputs">내 조건 고치기 ↓</a></p>
            </div>
            <div className="uw-body" id="results">
              {short ? <Notice tone="warn" role="alert">대출과 보증금이 매입 비용을 넘습니다. 자기자본 없이 사는 구조는 계산하지 않습니다.</Notice> : null}
              <ul className="notes">
                {notes.map((w, k) => <li key={k} className="note-warn">{w}</li>)}
                {r.acq.ratePct >= 8 ? <li className="note-warn">취득세 중과 {pv(r.acq.totalPct, 1)}가 적용됩니다 ({r.acq.label}). 무주택으로 살 때보다 {ek(r.acq.amount - input.price * 0.011)}이 더 듭니다.</li> : null}
                {purpose === "jeonse" && r.jeonseStress ? <li className="note-warn">역전세: 전세가 {pv(input.jeonseDropPct, 0)} 하락 시 {ek(r.jeonseStress.drop)}을 만기에 현금으로 돌려줘야 합니다. 이 돈이 없으면 집을 팔거나 대출을 받아야 합니다.</li> : null}
                {purpose === "live" && r.irr !== null && r.breakevenGrowthAltPct !== null ? (
                  <li className={input.priceGrowthPct >= r.breakevenGrowthAltPct ? "note-ok" : "note-warn"}>지금 가정({pv(input.priceGrowthPct, 1)}/년)으로는 {yrs}년 뒤 내 돈 기준 연 {pc(r.irr)}입니다. 기회수익률 {pv(input.altReturnPct, 1)}보다 {input.priceGrowthPct >= r.breakevenGrowthAltPct ? "높습니다" : `낮습니다. 연 ${pv(r.breakevenGrowthAltPct, 1)} 이상 오르면 기회수익률을 넘습니다`}.</li>
                ) : null}
              </ul>

              <h3>처음에 드는 돈</h3>
              <div className="kpis four">
                <Kpi label="자기자본" value={short ? DASH : eok(r.cashNeeded)} unit={short ? "" : undefined} sub="매입가 + 취득세 + 중개보수 − 대출 − 보증금" tone={short ? "neg" : undefined} />
                <Kpi label="취득세 등" term="취득세" value={won(r.acq.amount)} sub={`${r.acq.label} ${pv(r.acq.totalPct, 2)}`} />
                <Kpi label="대출" value={eok(r.loan)} sub={purpose === "jeonse" ? "전세 끼고 매입 · 담보대출 없음" : noLoan ? `${r.cap.note} · 대출 0` : over ? `한도 ${ek(r.cap.max)} 초과 (직접 입력)` : `${r.cap.binding} 기준 한도 ${ek(r.cap.max)}`} tone={over ? "warn" : undefined} />
                {purpose === "live"
                  ? <Kpi label="중개보수" value={won((input.price * input.brokeragePct) / 100)} sub={`${pv(input.brokeragePct, 1)} 가정`} />
                  : <Kpi label={purpose === "jeonse" ? "전세금 (세입자 돈)" : "보증금 (세입자 돈)"} value={eok(input.deposit)} sub="만기에 돌려줘야 합니다" />}
              </div>
              {R("acq")}

              <h3>매달 · 매년</h3>
              <div className="table-wrap">
                <table className="data tight home-years">
                  <caption className="sr-only">연도별 현금흐름 · 단위 만원 · 대출 잔액은 연말 기준</caption>
                  <thead><tr><th scope="col">항목 (만원)</th>{r.years.map((y) => <th key={y.year} scope="col" className="num">{y.year}년차</th>)}</tr></thead>
                  <tbody>
                    {purpose === "rent" ? <tr><th scope="row">월세 수입</th>{r.years.map((y) => <td key={y.year} className="num">{nm(y.income)}</td>)}</tr> : null}
                    <tr><th scope="row">(−) 이자</th>{r.years.map((y) => <td key={y.year} className="num">{nm(y.interest)}</td>)}</tr>
                    <tr><th scope="row">(−) 원금 상환</th>{r.years.map((y) => <td key={y.year} className="num">{nm(y.principal)}</td>)}</tr>
                    <tr><th scope="row">(−) <Term k="보유세" static>보유세</Term></th>{r.years.map((y) => <td key={y.year} className="num">{nm(y.holdTax)}</td>)}</tr>
                    <tr><th scope="row">(−) 관리 · 수선</th>{r.years.map((y) => <td key={y.year} className="num">{nm(y.other)}</td>)}</tr>
                    <tr className="total"><th scope="row">연간 지출 합계</th>{r.years.map((y) => <td key={y.year} className="num">{nm(yearSpend(y))}</td>)}</tr>
                    <tr className="total"><th scope="row">연간 순현금</th>{r.years.map((y) => <td key={y.year} className={`num${y.net < 0 ? " negtext" : ""}`}>{nm(y.net)}</td>)}</tr>
                    <tr><th scope="row">대출 잔액 <small>연말 · 억·만원</small></th>{r.years.map((y) => <td key={y.year} className="num">{wonKr(y.balance)}</td>)}</tr>
                  </tbody>
                </table>
              </div>
              <p className="fine">보유세 1년차 {nm(r.hold.total)}만원 = 재산세 {nm(r.hold.propertyTax)} + 도시지역분 {nm(r.hold.urbanTax)} + 지방교육세 {nm(r.hold.eduTax)}{r.hold.compTax > 0 ? ` + 종부세 ${nm(r.hold.compTax)}` : ""} · {r.hold.note} · 순현금이 음수면 그만큼 내 돈이 매년 나갑니다</p>
              {R("hold")}

              <h3>{yrs}년 뒤 팔면</h3>
              <div className="kpis four">
                <Kpi label="매각가" value={eok(r.salePrice)} sub={`연 ${pv(input.priceGrowthPct, 1)} 상승 가정 · ${yrs}년`} />
                <Kpi label="양도세" term="양도세" value={won(r.cgt.tax)} sub={r.cgt.label} />
                <Kpi label={purpose === "live" ? "팔아서 받는 돈 (대출 갚은 뒤)" : purpose === "jeonse" ? "팔아서 받는 돈 (전세금 반환 뒤)" : "팔아서 받는 돈 (빚 갚은 뒤)"} value={eok(r.saleNet)} sub={purpose === "live" ? "매각가 − 중개보수 − 양도세 − 대출 잔액" : purpose === "jeonse" ? "매각가 − 중개보수 − 양도세 − 전세금 반환" : "매각가 − 중개보수 − 양도세 − 대출 잔액 − 보증금 반환"} tone={r.saleNet < 0 ? "neg" : undefined} />
                <Kpi label="내 돈 기준 연 수익률" value={short || r.irr === null ? DASH : pct(r.irr)} unit={short || r.irr === null ? "" : undefined} sub={`배수 ${r.multiple === null ? DASH : `${nm(r.multiple, 2)}x`} · 기회수익률 ${pv(input.altReturnPct, 1)}`} tone={r.irr !== null && r.irr < 0 ? "neg" : undefined} />
              </div>
              <p className="fine">
                양도세는 판 값에서 산 값과 비용을 뺀 차익에 매기는 세금입니다. 양도차익 {won(r.cgt.gain)} 중 비과세 {won(r.cgt.exempt)} · <Term k="장기보유특별공제" static>장기보유특별공제</Term> {pv(r.cgt.ltDeductPct, 0)} · <Term k="실효세율" static>실효세율</Term> {pv(r.cgt.taxRatePct, 1)}.
                {singleApplies && input.singleHousehold ? " 1세대1주택 비과세: 2년 보유(조정대상지역은 거주)한 한 채는 12억까지 양도세가 없고, 12억을 넘는 부분만 나눠서 과세합니다." : ""}
                {lastBalance > 0 ? ` 매각 시 대출 잔액 ${ek(lastBalance)}을 먼저 갚습니다.` : ""}
              </p>
              {R("cgt")}

              <h3 id="audit">계산 확인</h3>
              <ul className="checks">
                {r.checks.map((k) => (
                  <li key={k.label} className={k.pass === null ? "na" : k.pass ? "pass" : "fail"}>
                    <b className="ko">{k.pass === null ? "해당 없음" : k.pass ? "맞음" : "불일치"}</b>
                    <span>{CHECK_LABEL[k.label] ?? k.label}</span>
                    <small>{tidy(k.detail)}{CHECK_TOL[k.label] ? ` · ${CHECK_TOL[k.label]}` : ""}</small>
                  </li>
                ))}
              </ul>
              <div className="btn-row">
                <button type="button" className="btn print-hide" onClick={() => window.print()}>인쇄</button>
              </div>
              <p className="fine">세율과 대출 규제는 자주 바뀝니다. 각 항목의 기준일과 근거를 확인하고, 실제 신고와 대출 심사는 과세관청과 금융기관의 확정값을 따르십시오. 결과는 입력한 가정을 계산한 값이며 특정 주택의 매수를 권하는 것이 아닙니다.</p>
            </div>
          </div>
        </div>
      </section>

      <div className={`mbar${idle ? "" : short ? " v-neg" : noLoan || over ? " v-warn" : " v-ok"}`}>
        <button type="button" className="mbar-ro" aria-expanded={sheet} aria-controls="mbar-sheet" onClick={() => setSheet((v) => !v)}>
          {toneLabel ? <span className={`mbar-tone ${tone ?? ""}`}>{toneLabel}</span> : null}
          <span title={purpose === "rent" ? "매달 남는 돈" : "매달 나가는 돈"}><i>월</i><b>{idle ? DASH : monthRo}</b></span>
          <span title={`${yrs}년 뒤 팔면 내 돈의 증감`}><i>{yrs}년</i><b>{idle || short ? DASH : fmtRo(r.totalNet, "eok+")}</b></span>
        </button>
        <button type="button" className="mbar-go" aria-label={`${inputsSeen ? "결론 보기" : "내 조건 고치기"} · 월 ${idle ? DASH : monthRo} · ${yrs}년 ${idle || short ? DASH : fmtRo(r.totalNet, "eok+")}`}
          onClick={() => { setSheet(false); go(inputsSeen ? "#memo" : "#inputs"); }}>{inputsSeen ? "결론 보기" : "내 조건 고치기 ↓"}</button>
      </div>
      <div className="mbar-sheet" id="mbar-sheet" hidden={!sheet}>
        <p className="headline">{headline}</p>
        <div className="answers">{answers.map((x) => <Ans key={x.qs} x={x} />)}</div>
        <span className="subnav-basis">{subBasis}</span>
        <nav aria-label="절">
          <a href="#market" onClick={() => setSheet(false)}>01 시장</a>
          <a href="#conditions" onClick={() => setSheet(false)}>02 내 조건</a>
        </nav>
        <p><a className="link" href="#inputs" onClick={() => setSheet(false)}>내 조건 고치기 ↓</a></p>
      </div>
    </main>
  );
}
