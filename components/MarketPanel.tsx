"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LineChart, Scatter, TimeScatter } from "./charts";
import { Kpi, Notice, SectionHead, SegCtl, Skel, Term, neg, scrollMode } from "./fields";
import { DASH, num, ymLabel, ymdLabel } from "@/lib/format";
import type { ComplexDetail, ComplexStat, Market } from "@/lib/connectors/market";
import { ASSET_LABEL, BANDS_BY_ASSET, PY, type AreaBand, type Asset } from "@/lib/connectors/types";

export type RegionsPayload = {
  live: boolean;
  regions: { code: string; name: string; sgg: { code: string; name: string }[] }[];
  snapshots: Record<Asset, { code: string; name: string }[]>;
};

export type MarketAudience = "pro" | "home";
/** 교차 링크 주소. 없으면 audience에 따라 asset·code·band·key 쿼리로 만든다 */
export type MarketLinks = { pro?: string; home?: string };

type SortKey = "nRent" | "nTrade" | "effRentPerPy" | "pricePerPy" | "grossYieldPct" | "gapPct" | "buildYear" | "medArea";
type SortDir = "desc" | "asc";

/* ── 서식 헬퍼: 자릿수는 지표별 고정(비중 0 · 변화율 1 · 수익률 2), 부호는 U+2212, null은 DASH */
const fin = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
const val = (v: number | null | undefined, d: number, signed = false) => (fin(v) ? `${signed && v > 0 ? "+" : ""}${neg(num(v, d))}` : DASH);
const share = (v: number | null | undefined) => (fin(v) ? `${num(v * 100, 0)}%` : DASH);
const kv = (v: number | null | undefined, d: number, unit: string, signed = false) => (fin(v) ? { value: `${signed && v > 0 ? "+" : ""}${num(v, d)}`, unit } : { value: DASH, unit: "" });
const pct0 = (v: number | null | undefined) => (fin(v) ? { value: num(v * 100, 0), unit: "%" } : { value: DASH, unit: "" });
/** 만원 → 「14.9억」(1억 이상) 또는 「8,800만원」. KPI sub 한 줄용 축약 */
const eok = (mw: number) => (mw >= 10000 ? `${num(mw / 10000, 1)}억` : `${num(mw)}만원`);

/**
 * 표 래퍼가 가로로 넘치는지. 넘칠 때만 table-foot에 「옆으로 밀면 나머지 열」을 둔다(§4.4 ≤860).
 * 콜백 ref라 표가 details 안에서 나중에 마운트돼도 잡고, details가 닫히면(폭 0) 안내도 사라진다.
 */
function useOverflowX(): [(el: HTMLElement | null) => void, boolean] {
  const [over, setOver] = useState(false);
  const ro = useRef<ResizeObserver | null>(null);
  const attach = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) { setOver(false); return; }
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver !== "undefined") {
      const obs = new ResizeObserver(check);
      obs.observe(el);
      if (el.firstElementChild) obs.observe(el.firstElementChild);
      ro.current = obs;
    }
  }, []);
  return [attach, over];
}

/**
 * ≤600 여부. 시장 표의 .m-hide 열(준공·전용㎡·신규−갱신)이 숨는 globals.css 구간과 같은 조건이다.
 * 그 구간에서만 단지명 아래 small에 준공을 함께 적는다(§4.4 「동·준공은 단지명 아래 small」). 서버·hydration 스냅샷은 false.
 */
const NARROW_MQ = "(max-width: 600px)";
const hasMq = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
const subscribeNarrow = (cb: () => void) => {
  if (!hasMq()) return () => {};
  const mq = window.matchMedia(NARROW_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getNarrow = () => hasMq() && window.matchMedia(NARROW_MQ).matches;
const getNarrowServer = () => false;
function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, getNarrow, getNarrowServer);
}
/** 단지명 아래 small. 데스크톱은 동만(준공 열이 따로 있다), ≤600은 「동 · 준공년」 */
const rowSub = (c: ComplexStat, narrow: boolean) => (narrow ? [c.dong, c.buildYear ? `${c.buildYear}년` : DASH].filter(Boolean).join(" · ") : c.dong);

/* ── 라벨: Pro는 원어 지표명, Home은 질문형 풀이(§4.3 라벨 맵) */
type KpiId = "conv" | "rent" | "price" | "yield" | "gap" | "yoy" | "priceYoY" | "wolse";
const LABEL: Record<MarketAudience, Record<KpiId | "rrr", string>> = {
  pro: { conv: "전월세전환율", rent: "환산월세 (전용평당 월)", price: "매매 단가 (전용평당)", yield: "총수익률 (Gross)", gap: "신규 − 갱신 격차", yoy: "동일 단지 임대료 전년비", priceYoY: "동일 단지 매매가 전년비", wolse: "월세 계약 비중", rrr: "갱신요구권 사용 비중" },
  // conv: 라벨 맵의 「(전월세전환율)」은 한 줄 규칙(§4.3) 때문에 sub 첫 토큰으로 옮겼다
  home: { conv: "전세를 월세로 바꾸는 이율", rent: "평당 월세 (보증금까지 월세로 환산)", price: "평당 매매가 (전용면적 기준)", yield: "연 월세 수익률 (매입가 대비)", gap: "새 계약과 갱신 계약의 월세 차이", yoy: "같은 단지 월세 · 1년 전과 비교", priceYoY: "매매가 · 1년 전과 비교", wolse: "월세 계약 비중", rrr: "갱신 때 2년 더 살 권리를 쓴 비율" },
};
/** KPI 6칸의 구성과 순서. Pro는 임대 지표 순, Home(실거주 매수자)은 매매가·매매가 변화·월세 비중을 앞에 둔다(§5.4). facts는 공통 */
const KPI_ORDER: Record<MarketAudience, KpiId[]> = {
  pro: ["conv", "rent", "price", "yield", "gap", "yoy"],
  home: ["price", "priceYoY", "wolse", "conv", "rent", "yield"],
};

/* ── 표 열 제목의 산식(title) */
const COL_TITLE = {
  effRentPerPy: "(월세 + 보증금 × 전환율 ÷ 12) ÷ 전용평 · 신규 월세 중앙값 · 만원/평·월",
  pricePerPy: "매매가 ÷ 전용평 · 최근 12개월 중앙값 · 해제 거래 제외 · 만원/평",
  grossYieldPct: "연 환산월세 ÷ (매매가 − 보증금) · 비용 차감 전 · %",
  gapPct: "신규 계약 임대료 ÷ 갱신 계약 임대료 − 1 · 양수면 신규가 더 비쌈 · %",
  buildYear: "사용승인 연도",
  medArea: "최근 12개월 임대 계약 전용면적 중앙값 · ㎡",
  nRent: "최근 12개월 임대 계약 건수",
  nTrade: "최근 12개월 매매 건수 · 해제 제외",
} as const;

export function MarketPanel({
  asset, onAsset, regions, regionsError, code, band, market, loading, error, errorRaw, selectedKey, detail, detailError, detailErrorRaw, legalCapPct,
  onCode, onBand, onPick, onFillRegion, onFillComplex, onRetry,
  compact, audience, sectionNo = "01", fillLabel = "이 지역 시장값으로 가정 채우기", fillConfirm, links,
}: {
  asset: Asset; onAsset?: (a: Asset) => void;
  regions: RegionsPayload | null; regionsError?: boolean; code: string; band: AreaBand; market: Market | null; loading: boolean; error: string | null;
  /** 오류 서버 원문(useMarket().errorRaw · detailErrorRaw). 화면에는 안 내고 오류 notice small의 title에만 둔다 */
  errorRaw?: string | null; detailErrorRaw?: string | null;
  selectedKey: string | null; detail: ComplexDetail | null; detailError?: string | null; legalCapPct: number | null;
  onCode: (c: string) => void; onBand: (b: AreaBand) => void; onPick: (key: string | null) => void;
  onFillRegion?: () => void; onFillComplex?: (c: ComplexStat) => void;
  /** 오류 notice의 [다시 시도]. useMarket().retry. 없으면 새로고침 */
  onRetry?: () => void;
  /** 추이·산점도·단지 찾기·표를 details.mk-detail로 접는다(단지 선택 시 open). 단지 상세는 밖 */
  compact?: boolean;
  /** 라벨 언어. 없으면 pro */
  audience?: MarketAudience;
  /** 절 번호. 빈 문자열이면 미렌더 */
  sectionNo?: string;
  fillLabel?: string;
  /** 고친 값이 있을 때 채우기 버튼 대신 두는 인라인 확인 notice */
  fillConfirm?: ReactNode;
  links?: MarketLinks;
}) {
  const aud: MarketAudience = audience ?? "pro";
  const L = LABEL[aud];
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "nRent", dir: "desc" });
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const pickedByUser = useRef(false);
  const [tableWrapRef, tableOver] = useOverflowX();
  const [detailWrapRef, detailOver] = useOverflowX();
  const narrow = useNarrow();
  const sido = regions?.regions.find((s) => s.sgg.some((g) => g.code === code)) ?? regions?.regions[0];
  const snapSet = useMemo(() => new Set(regions?.snapshots[asset]?.map((s) => s.code) ?? []), [regions, asset]);
  const bands = BANDS_BY_ASSET[asset];

  // 지역·자산이 바뀌면 이전 지역 데이터는 보이지 않는다(스켈레톤). 같은 지역의 면적 구간만 바뀌면 옅게 두고 「갱신 중」
  const shown = market && market.meta.assetId === asset && market.meta.code === code ? market : null;
  const refreshing = loading && shown !== null;
  const booting = loading && shown === null;
  const k = shown?.kpi;

  const sorted = useMemo(() => {
    if (!shown) return [];
    const q = query.trim().replace(/\s+/g, "").toLowerCase();
    const list = q ? shown.complexes.filter((c) => `${c.name}${c.dong}`.replace(/\s+/g, "").toLowerCase().includes(q)) : shown.complexes;
    const get = (c: ComplexStat): number | null => { const v = c[sort.key]; return v === null || (sort.key === "buildYear" && v === 0) ? null : v; };
    return [...list].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort.dir === "desc" ? bv - av : av - bv;
    });
  }, [shown, sort, query]);
  const rows = showAll || query ? sorted.slice(0, 60) : sorted.slice(0, 12);

  // 사용자가 단지를 고르면 상세가 보이는 곳으로 데려간다 (공유 링크로 처음 열릴 때는 움직이지 않는다)
  const pick = (key: string | null) => {
    pickedByUser.current = key !== null;
    onPick(key);
  };
  useEffect(() => {
    if (selectedKey) setOpen(true);
    if (selectedKey && pickedByUser.current) detailRef.current?.scrollIntoView({ behavior: scrollMode(), block: "start" });
  }, [selectedKey]);
  const selected = shown?.complexes.find((c) => c.key === selectedKey) ?? null;

  const scatterItems = useMemo(
    () => (shown?.complexes ?? [])
      .filter((c) => c.pricePerPy !== null && c.grossYieldPct !== null)
      .map((c) => ({
        key: c.key, x: c.pricePerPy as number, y: c.grossYieldPct as number, size: c.nRent, label: c.name,
        sub: `${c.dong} · ${c.buildYear || "?"}년 · 수익률 ${num(c.grossYieldPct, 2)}% · 단가 ${num(c.pricePerPy, 0)}만원/평 · 임대 ${c.nRent}건`,
      })),
    [shown],
  );

  // 교차 링크(§5.2): Pro → Home은 같은 자산, Home → Pro는 오피스텔로 바꾸고 아파트 탭이면 key를 뺀다
  const cross = useMemo(() => {
    const qs = (a: Asset, withKey: boolean) => {
      const p = new URLSearchParams({ asset: a, code, band: a === asset ? band : "all" });
      if (withKey && selectedKey) p.set("key", selectedKey);
      return p.toString();
    };
    if (aud === "home" && audience) return { href: links?.pro ?? `/pro?${qs("offi", asset === "offi")}`, label: "이 조건으로 Pro 검토" };
    if (audience) return { href: links?.home ?? `/home?${qs(asset, true)}`, label: "이 조건으로 Home 검토" };
    if (links?.home) return { href: links.home, label: "이 조건으로 Home 검토" };
    if (links?.pro) return { href: links.pro, label: "이 조건으로 Pro 검토" };
    return null;
  }, [aud, audience, links, asset, code, band, selectedKey]);
  const crossLink = cross ? <Link className="link" href={cross.href}>{cross.label}</Link> : null;

  const retry = onRetry ?? (() => window.location.reload());
  const sparse = shown ? shown.complexes.length === 0 || (shown.kpi.effRentN < 5 && shown.kpi.priceN < 5) : false;
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const th = (key: SortKey, label: ReactNode, opt: { unit?: string; grp?: boolean; mHide?: boolean } = {}) => {
    const on = sort.key === key;
    const cls = ["num", "sortable", on ? "on" : "", on && sort.dir === "asc" ? "asc" : "", opt.grp ? "grp" : "", opt.mHide ? "m-hide" : ""].filter(Boolean).join(" ");
    return (
      <th scope="col" className={cls} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} title={COL_TITLE[key]}>
        <button type="button" onClick={() => toggleSort(key)}>{label}</button>
        {opt.unit ? <small>{opt.unit}</small> : null}
      </th>
    );
  };

  const live = shown?.meta.mode === "live";
  const ym = shown ? shown.meta.to.slice(0, 7) : "";
  const bandLabel = bands.find((b) => b.id === band)?.label ?? "전체";

  /* ── KPI 6칸(순서는 KPI_ORDER). Pro sub는 산식, Home sub는 표본과 풀이(§4.3) */
  const typicalPy = k && fin(k.medAreaM2) ? k.medAreaM2 / PY : null;
  const typicalPrice = k && typicalPy !== null && fin(k.pricePerPy) ? Math.round((k.pricePerPy * typicalPy) / 100) * 100 : null;
  const KPIS: Record<KpiId, ReactNode> = shown && k ? {
    conv: <Kpi key="conv" label={L.conv} term="전월세전환율" {...kv(shown.conv.ratePct, 2, "%")}
      sub={aud === "pro"
        ? <>{shown.conv.method === "implied" ? `월세 × 12 ÷ (전세 보증금 − 월세 보증금) · 전세·월세 쌍 ${num(shown.conv.n)}건` : "표본 부족 · 기본값으로 계산"}{legalCapPct !== null ? ` · 법정 상한 ${num(legalCapPct, 2)}%` : ""}</>
        : <>전월세전환율 · {shown.conv.method === "implied" ? `전세·월세 쌍 ${num(shown.conv.n)}건에서 계산` : "표본 부족 · 기본값으로 계산"}{legalCapPct !== null ? ` · 법정 상한 ${num(legalCapPct, 2)}%` : ""}</>} />,
    rent: <Kpi key="rent" label={L.rent} term="환산월세" {...kv(k.effRentPerPy, 2, "만원")}
      sub={aud === "pro" ? `(월세 + 보증금 × 전환율 ÷ 12) ÷ 전용평 · 신규 월세 ${num(k.effRentN)}건 중앙값` : `신규 월세 ${num(k.effRentN)}건의 중앙값 · 전용평당 월`} />,
    price: <Kpi key="price" label={L.price} {...kv(k.pricePerPy, 0, "만원")}
      sub={aud === "pro"
        ? `매매가 ÷ 전용평 · 매매 ${num(k.priceN)}건 중앙값 · 해제 ${num(shown.counts.tradeCanceled)}건 제외`
        : `매매 ${num(k.priceN)}건의 중앙값${typicalPrice !== null ? ` · 전용 ${num(typicalPy, 1)}평이면 ${eok(typicalPrice)}` : ""}`} />,
    yield: <Kpi key="yield" label={L.yield} term="총수익률 (Gross)" {...kv(k.grossYieldPct, 2, "%")}
      sub={aud === "pro" ? `연 환산월세 ÷ (매매가 − 보증금) · 단지별 중앙값 ${num(k.yieldN)}곳` : `비용 빼기 전 · 단지별 중앙값 ${num(k.yieldN)}곳`} />,
    gap: <Kpi key="gap" label={L.gap} term="신규 − 갱신 격차" {...kv(k.gapPct, 1, "%", true)}
      sub={aud === "pro" ? `신규 ÷ 갱신 − 1 · 양수면 신규가 더 비쌈 · 같은 단지 ${num(k.gapN)}곳` : `양수면 새 계약이 더 비쌈 · 같은 단지 ${num(k.gapN)}곳`} />,
    yoy: <Kpi key="yoy" label={L.yoy} {...kv(k.rentYoYPct, 1, "%", true)}
      sub={aud === "pro" ? `최근 12개월 ÷ 직전 12개월 − 1 · 같은 단지 ${num(k.rentYoYN)}곳 · 매매가 ${val(k.priceYoYPct, 1, true)}${fin(k.priceYoYPct) ? "%" : ""} (${num(k.priceYoYN)}곳)` : `같은 단지 ${num(k.rentYoYN)}곳 · 매매가는 ${val(k.priceYoYPct, 1, true)}${fin(k.priceYoYPct) ? "%" : ""} (${num(k.priceYoYN)}곳)`} />,
    priceYoY: <Kpi key="priceYoY" label={L.priceYoY} {...kv(k.priceYoYPct, 1, "%", true)}
      sub={aud === "pro" ? `최근 12개월 ÷ 직전 12개월 − 1 · 같은 단지 ${num(k.priceYoYN)}곳` : `같은 단지 ${num(k.priceYoYN)}곳 · 최근 12개월과 그 전 12개월의 중앙값 비교`} />,
    wolse: <Kpi key="wolse" label={L.wolse} {...pct0(k.wolseShare)}
      sub={aud === "pro" ? `월세 ÷ 임대 ${num(shown.counts.rentRecent)}건` : `임대 ${num(shown.counts.rentRecent)}건 중 · 나머지는 전세`} />,
  } : { conv: null, rent: null, price: null, yield: null, gap: null, yoy: null, priceYoY: null, wolse: null };

  /* ── 절 머리 aside: 채우기 버튼(또는 확인 notice) + 교차 링크 1개 */
  const aside = (shown || fillConfirm || crossLink) ? (
    <>
      {fillConfirm ?? (shown && onFillRegion ? <button type="button" className="btn" onClick={onFillRegion}>{fillLabel}</button> : null)}
      {crossLink}
    </>
  ) : null;

  /* ── 추이 · 산점도 · 단지 찾기 · 표 (compact면 details.mk-detail 안) */
  const body = shown && k ? (
    sparse ? (
      <figure>
        <figcaption>추이 · 단지별 비교 <span>{shown.meta.name} {ASSET_LABEL[asset]} · {bandLabel}</span></figcaption>
        <div className="empty">
          <span>
            표본이 부족합니다 · {band !== "all"
              ? <>면적 구간을 전체로 <a className="link" href={`?asset=${asset}&code=${code}&band=all`} onClick={(e) => { e.preventDefault(); onBand("all"); }}>바꾸기</a></>
              : "다른 시군구를 고르십시오"}
          </span>
        </div>
      </figure>
    ) : (
      <>
        <div className="grid2">
          <figure>
            <figcaption>환산월세 추이 <span>신규 월세 · 갱신 제외 · 만원/전용평·월</span></figcaption>
            <LineChart unit="만원/전용평·월" digits={2} title="환산월세 월별 추이" points={shown.series.map((s) => ({ label: ymLabel(s.ym), y: s.rent, n: s.rentN }))} />
          </figure>
          <figure>
            <figcaption>매매 단가 추이 <span>해제 거래 제외 · 만원/전용평</span></figcaption>
            <LineChart unit="만원/전용평" digits={0} title="매매 단가 월별 추이" points={shown.series.map((s) => ({ label: ymLabel(s.ym), y: s.price, n: s.priceN }))} />
          </figure>
        </div>

        <figure>
          <figcaption>단지별 매매 단가와 총수익률 <span>x 매매 단가 만원/전용평 · y 총수익률 % · 매매·임대 각 3건 이상 {scatterItems.length}곳</span></figcaption>
          <Scatter items={scatterItems} selected={selectedKey} onPick={pick} xLabel="매매 단가 (만원/전용평)" yLabel="총수익률 (%)" axes={false} />
        </figure>

        <div className="table-tools">
          <label htmlFor="cxq" className="field-label">단지 찾기</label>
          <input id="cxq" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="단지명 또는 동 이름" autoComplete="off" />
          {query && <span className="muted">{sorted.length}개 일치</span>}
        </div>
        <div className="table-wrap tight-top" ref={tableWrapRef}>
          <table className="data pick">
            <caption className="sr-only">{shown.meta.name} {ASSET_LABEL[asset]} 단지별 실거래 요약 · {bandLabel} · 최근 12개월 · 열 제목을 누르면 정렬</caption>
            <thead>
              <tr>
                <th scope="col">단지</th>
                {th("buildYear", "준공", { grp: true, mHide: true })}
                {th("medArea", "전용", { unit: "㎡", mHide: true })}
                {th("nRent", "임대", { unit: "건" })}
                {th("nTrade", "매매", { unit: "건" })}
                {th("effRentPerPy", <Term k="환산월세" static>환산월세</Term>, { unit: "만원/평·월", grp: true })}
                {th("pricePerPy", "매매단가", { unit: "만원/평" })}
                {th("grossYieldPct", <Term k="총수익률 (Gross)" static>수익률</Term>, { unit: "%", grp: true })}
                {th("gapPct", <Term k="신규 − 갱신 격차" static>신규−갱신</Term>, { unit: "%", mHide: true })}
                <th scope="col" className="m-hide"><span className="sr-only">선택</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10} className="muted">일치하는 단지가 없습니다 · 검색어를 줄이십시오</td></tr>}
              {rows.map((c) => {
                const sel = c.key === selectedKey;
                return (
                  <tr key={c.key} className={sel ? "sel" : ""} onClick={() => pick(sel ? null : c.key)}>
                    <th scope="row"><button type="button" className="rowbtn" aria-pressed={sel}>{c.name}<small>{rowSub(c, narrow)}</small></button></th>
                    <td className="num grp m-hide">{c.buildYear || DASH}</td>
                    <td className="num m-hide">{num(c.medArea, 1)}</td>
                    <td className="num">{num(c.nRent)}</td>
                    <td className="num">{num(c.nTrade)}</td>
                    <td className="num grp">{val(c.effRentPerPy, 2)}</td>
                    <td className="num">{val(c.pricePerPy, 0)}</td>
                    <td className="num grp strong">{val(c.grossYieldPct, 2)}</td>
                    <td className="num m-hide">{val(c.gapPct, 1, true)}</td>
                    <td className="row-act m-hide">{sel ? "선택됨" : "선택"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-foot">
          <span>최근 12개월 임대 5건 이상 {num(shown.counts.complexesListed)}개 단지 · 단지명을 누르면 상세와 「이 단지 값으로 가정 채우기」 · 열 제목을 누르면 정렬</span>
          {tableOver && <span className="m-only">옆으로 밀면 나머지 열</span>}
          {!query && sorted.length > 12 && <button type="button" className="link" onClick={() => setShowAll((v) => !v)}>{showAll ? "상위 12개만" : "더 보기 (60개까지 · 나머지는 검색)"}</button>}
        </div>
      </>
    )
  ) : null;

  return (
    <section id="market" className="sec">
      <SectionHead no={sectionNo} title="시장" lead="지역을 고르면 국토교통부 실거래가에서 임대료, 매매가, 전환율, 갱신 행태를 계산합니다. 모든 지표 옆에 표본 수를 적습니다." aside={aside} />

      {onAsset && (
        <div className="asset-tabs" role="group" aria-label="자산 종류">
          {(["apt", "offi"] as Asset[]).map((a) => <button key={a} type="button" aria-pressed={a === asset} className={a === asset ? "on" : ""} onClick={() => onAsset(a)}>{ASSET_LABEL[a]}</button>)}
        </div>
      )}

      <div className="controls">
        <div className="ctl">
          <label htmlFor="sido">시도</label>
          <select id="sido" value={sido?.code ?? ""} disabled={!regions} onChange={(e) => {
            const s = regions?.regions.find((x) => x.code === e.target.value);
            const first = s?.sgg.find((g) => regions?.live || snapSet.has(g.code)) ?? s?.sgg[0];
            if (first) onCode(first.code);
          }}>
            {regions?.regions.map((s) => {
              const ok = regions.live || s.sgg.some((g) => snapSet.has(g.code));
              return <option key={s.code} value={s.code} disabled={!ok}>{s.name}{ok ? "" : " (자료 없음)"}</option>;
            })}
          </select>
        </div>
        <div className="ctl">
          <label htmlFor="sgg">시군구</label>
          <select id="sgg" value={code} disabled={!regions} onChange={(e) => onCode(e.target.value)}>
            {sido?.sgg.map((g) => (
              <option key={g.code} value={g.code} disabled={!regions?.live && !snapSet.has(g.code)}>{g.name}{!regions?.live && !snapSet.has(g.code) ? " (자료 없음)" : ""}</option>
            ))}
          </select>
        </div>
        <div className="ctl">
          {/* 단위 ㎡는 그룹 라벨에 한 번만: 390에서 버튼 5개가 358px를 나눠 쓰므로 「60~85㎡」가 두 줄로 꺾이지 않게 */}
          <span className="field-label" id="band-l">전용면적 (㎡)</span>
          <SegCtl id="band" labelId="band-l" value={band} options={bands.map((b) => ({ id: b.id, label: b.label.replace(/㎡/g, "") }))} onChange={onBand} />
        </div>
      </div>

      {(shown || booting) && (
        <p className="status ctl-note">
          {shown ? (
            <>
              <b className={`kicker${live ? " live" : ""}`}>{live ? "LIVE" : "SNAPSHOT"}</b>
              {`실거래가 · ${live ? "국토교통부 OpenAPI" : "국토부 공개 CSV"} ${ym} · 최근 12개월 임대 ${num(shown.counts.rentRecent)}건 · 매매 ${num(shown.counts.tradeRecent)}건`}
              {refreshing ? <span role="status">갱신 중</span> : null}
            </>
          ) : "실거래가 · 불러오는 중"}
        </p>
      )}
      {regions && !regions.live && (
        <p className="fine ctl-note">국토교통부 공개 스냅샷 {regions.snapshots[asset].length}개 구({regions.snapshots[asset].map((s) => s.name.split(" ").pop()).join(" · ")})를 조회할 수 있습니다.</p>
      )}
      {regionsError && !regions && <Notice role="alert">지역 목록을 불러오지 못했습니다. 새로고침하십시오.</Notice>}

      {error && !booting && (
        <Notice role="alert">
          실거래가를 불러오지 못했습니다. 시군구를 바꾸거나 잠시 후 다시 시도하십시오.
          <button type="button" className="link" onClick={retry}>다시 시도</button>
          <small title={errorRaw ?? undefined}>{error}</small>
        </Notice>
      )}

      {booting && (
        <>
          <Notice>실거래가를 불러오는 중입니다</Notice>
          <Skel kind="kpi" n={6} />
          <figure><Skel kind="chart" n={180} /></figure>
          <div className="table-wrap"><Skel kind="rows" n={6} /></div>
        </>
      )}

      {shown && k && (
        <div className={refreshing ? "dim" : undefined} aria-busy={refreshing || undefined}>
          {shown.meta.note && regions?.live && <Notice>{shown.meta.note}</Notice>}
          <div className="kpis six">
            {KPI_ORDER[aud].map((id) => KPIS[id])}
          </div>

          {/* facts: dt = 측정 대상, dd span = 분모. 1440에서 5칸 모두 한 줄에 들어가도록 문구를 짧게 둔다 */}
          <dl className="facts">
            <div><dt><Term k="갱신 인상률">갱신 인상률</Term></dt><dd>{val(k.renewIncrPct, 1, true)}{fin(k.renewIncrPct) ? "%" : ""} <span>{num(k.renewN)}건 중앙값</span></dd></div>
            <div><dt>인상률 4.5% 이상 비중</dt><dd>{share(k.renewAtCapShare)} <span>{num(k.renewN)}건 중</span></dd></div>
            <div><dt><Term k="계약갱신요구권">{L.rrr}</Term></dt><dd>{share(k.rrrShare)}{aud === "pro" ? <> <span>갱신 계약 중</span></> : null}</dd></div>
            <div><dt>월세 계약 비중</dt><dd>{share(k.wolseShare)} <span>임대 {num(shown.counts.rentRecent)}건 중</span></dd></div>
            <div><dt>보증금 ÷ 매매가</dt><dd>{val(k.depositToPricePct, 1)}{fin(k.depositToPricePct) ? "%" : ""} <span>단지별 중앙값</span></dd></div>
          </dl>

          {compact && body && !sparse ? (
            <details className="mk-detail" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
              <summary>시장 상세 <span>{selected ? `${selected.name} 선택 · 추이 · 단지별 비교` : "추이 · 단지별 비교 · 단지를 고르려면 펼치기"}</span></summary>
              {body}
            </details>
          ) : body}

          {selected && (
            <div className="detail" ref={detailRef}>
              <div className="detail-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="muted">{shown.meta.name} {selected.dong} {detail?.jibun ?? ""}{detail?.road ? ` · ${detail.road}` : ""} · {selected.buildYear || "?"}년 준공 · 전용 {num(selected.medArea, 1)}㎡ 중앙값</p>
                </div>
                {(onFillComplex || crossLink) && (
                  <div className="detail-act" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 16px" }}>
                    {onFillComplex && <button type="button" className="btn primary" onClick={() => onFillComplex(selected)}>이 단지 값으로 가정 채우기</button>}
                    {crossLink}
                  </div>
                )}
              </div>
              {!detail && !detailError && <Notice>단지 거래를 불러오는 중입니다</Notice>}
              {detailError && (
                <Notice role="alert">
                  단지 거래를 불러오지 못했습니다. 다른 단지를 고르거나 잠시 후 다시 시도하십시오.
                  <button type="button" className="link" onClick={retry}>다시 시도</button>
                  <small title={detailErrorRaw ?? undefined}>{detailError}</small>
                </Notice>
              )}
              {detail && (
                <>
                  <div className="grid2">
                    <figure>
                      <figcaption>월세 계약 <span>환산월세 만원/전용평·월 · 24개월</span></figcaption>
                      <TimeScatter digits={1} legend={[{ tone: "a", label: "신규" }, { tone: "b", label: "갱신" }, { tone: "c", label: "미표기" }]}
                        points={detail.rentPoints.map((p) => ({ t: p.ymd, v: p.v, tone: p.ctype === 1 ? "a" : p.ctype === 2 ? "b" : "c", tip: `${ymdLabel(p.ymd)} · ${num(p.v, 2)}만원/평 · ${num(p.area, 1)}㎡` }))} />
                    </figure>
                    <figure>
                      <figcaption>매매 <span>만원/전용평 · 해제 제외</span></figcaption>
                      <TimeScatter digits={0} legend={[{ tone: "a", label: "매매" }]}
                        points={detail.tradePoints.map((p) => ({ t: p.ymd, v: p.v, tone: "a", tip: `${ymdLabel(p.ymd)} · ${num(p.v, 0)}만원/평 · ${num(p.area, 1)}㎡` }))} />
                    </figure>
                  </div>
                  <div className="table-wrap" ref={detailWrapRef}>
                    <table className="data">
                      <caption className="sr-only">{selected.name} 타입별 실거래 · 최근 12개월 · 거래가 많은 타입 8개까지</caption>
                      <thead>
                        <tr>
                          <th scope="col">타입 (전용㎡)</th>
                          <th scope="col" className="num">임대 <small>건</small></th>
                          <th scope="col" className="num">월세 <small>건</small></th>
                          <th scope="col" className="num">보증금 중앙값 <small>만원</small></th>
                          <th scope="col" className="num">월세 중앙값 <small>만원</small></th>
                          <th scope="col" className="num" title={COL_TITLE.effRentPerPy}>환산월세 <small>만원/평·월</small></th>
                          <th scope="col" className="num grp">매매 <small>건</small></th>
                          <th scope="col" className="num">매매가 중앙값 <small>억</small></th>
                          <th scope="col" className="num" title={COL_TITLE.pricePerPy}>매매단가 <small>만원/평</small></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.types.map((t) => (
                          <tr key={t.area}>
                            <th scope="row">{t.area}㎡</th>
                            <td className="num">{num(t.nRent)}</td>
                            <td className="num">{num(t.nWolse)}</td>
                            <td className="num">{val(t.medDeposit, 0)}</td>
                            <td className="num">{val(t.medRent, 0)}</td>
                            <td className="num">{val(t.effRentPerPy, 2)}</td>
                            <td className="num grp">{num(t.nTrade)}</td>
                            <td className="num">{fin(t.medPrice) ? num(t.medPrice / 10000, 2) : DASH}</td>
                            <td className="num">{val(t.pricePerPy, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-foot">
                    <span>최근 12개월 · 거래가 많은 타입 8개까지 · 환산월세는 지역 전환율 {num(detail.convPct, 2)}% 적용</span>
                    {detailOver && <span className="m-only">옆으로 밀면 나머지 열</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
