"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CfBars, Heat, StackBar } from "./charts";
import { Kpi, NumField, SectionHead, Seg } from "./fields";
import { MarketPanel } from "./MarketPanel";
import { rateOf, useMarket } from "./useMarket";
import { positions, suggestRental, verdict, type Provenance } from "@/lib/engine/assumptions";
import { axis, type AmortType } from "@/lib/engine/core";
import { officeDefaultFor, PRO_ASSET_LABEL, PRO_DEFAULT, proGrid, proLimits, runPro, type GridSpec, type ProAsset, type ProInput } from "@/lib/engine/pro";
import type { ComplexStat, Market } from "@/lib/connectors/market";
import { RULES } from "@/lib/rules";
import { eok, mult, num, pct, pctv } from "@/lib/format";
import { PY, type AreaBand } from "@/lib/connectors/types";

type Bench = "cd91" | "ktb3" | "base" | "corpAA" | "manual";

export default function ProApp() {
  const [code, setCode] = useState("11560");
  const [band, setBand] = useState<AreaBand>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [raw, setRaw] = useState<ProInput>(PRO_DEFAULT);
  const [from, setFrom] = useState<Provenance>({});
  const [basis, setBasis] = useState<{ label: string; complexKey: string | null } | null>(null);
  const [edited, setEdited] = useState(false);
  const [bench, setBench] = useState<Bench>("cd91");
  const [target, setTarget] = useState(8);
  const autofilled = useRef(false);
  const inputRef = useRef(raw);
  useEffect(() => { inputRef.current = raw; }, [raw]);

  const fill = useCallback((m: Market, c: ComplexStat | null) => {
    const s = suggestRental(inputRef.current, m, c);
    setRaw(s.input);
    setFrom(s.from);
    setBasis({ label: c ? `${c.name} (${m.meta.name.split(" ").pop()})` : `${m.meta.name} 시장값`, complexKey: c?.key ?? null });
    setEdited(false);
  }, []);

  const onLoaded = useCallback((m: Market) => {
    if (autofilled.current) return;
    autofilled.current = true;
    fill(m, null);
  }, [fill]);

  const { regions, rates, market, loading, error, detail } = useMarket("offi", code, band, selectedKey, onLoaded);

  const benchRate = bench === "manual" ? null : rateOf(rates, bench);
  const corpAA = rateOf(rates, "corpAA");
  const baseRate = rateOf(rates, "base");
  const legalCapPct = baseRate === null ? null : Math.min(10, baseRate + 2);
  const input = useMemo<ProInput>(() => (benchRate === null ? raw : { ...raw, cap: { ...raw.cap, baseRatePct: benchRate } }), [raw, benchRate]);

  const set = useCallback(<G extends "rental" | "office" | "cap", K extends keyof ProInput[G]>(g: G, k: K, v: ProInput[G][K]) => {
    setRaw((p) => ({ ...p, [g]: { ...p[g], [k]: v } }));
    setFrom((f) => { const key = `${g}.${String(k)}`; return key in f ? { ...f, [key]: undefined } : f; });
    setEdited(true);
  }, []);
  const setAsset = (a: ProAsset) => {
    setRaw((p) => ({ ...p, asset: a, office: a === "rental" ? p.office : (p.office.kind === (a === "logistics" ? "logistics" : "office") ? p.office : officeDefaultFor(a)) }));
  };

  const r = useMemo(() => runPro(input), [input]);
  const L = useMemo(() => proLimits(input, target), [input, target]);
  const pos = useMemo(() => positions(input, r, market, corpAA), [input, r, market, corpAA]);
  const V = useMemo(() => verdict(input, r, L, target, pos), [input, r, L, target, pos]);
  const isRental = input.asset === "rental";
  const allIn = r.rate * 100;

  const grids = useMemo<{ spec: GridSpec; v: (number | null)[][] }[]>(() => {
    const g1: GridSpec = { rowKey: "cap.exitCapPct", rowVals: axis(input.cap.exitCapPct, 0.25, 7, 0.5), colKey: isRental ? "rental.rentGrowthPct" : "office.rentGrowthPct", colVals: axis(isRental ? input.rental.rentGrowthPct : input.office.rentGrowthPct, 0.5, 5, -5), metric: "leveredIrr", title: "Exit Cap × 임대료 성장률 → Levered IRR", rowLabel: "Exit Cap", colLabel: "성장률", fmtRow: (v) => pctv(v, 2), fmtCol: (v) => pctv(v, 1), threshold: target / 100, scale: 0.08, floor: 0 };
    const g2: GridSpec = { rowKey: "cap.spreadBp", rowVals: axis(input.cap.spreadBp, 50, 7, 0), colKey: isRental ? "rental.vacancyPct" : "office.vacancyPct", colVals: axis(isRental ? input.rental.vacancyPct : input.office.vacancyPct, 2.5, 5, 0), metric: "minDscr", title: "가산금리 × 공실률 → 최소 DSCR", rowLabel: "가산금리", colLabel: "공실률", fmtRow: (v) => `${num(v)}bp`, fmtCol: (v) => pctv(v, 1), threshold: 1.2, scale: 0.6, floor: 1 };
    const g3: GridSpec = isRental
      ? { rowKey: "rental.depositPerUnit", rowVals: axis(input.rental.depositPerUnit, Math.max(500, Math.round(input.rental.depositPerUnit / 2 / 500) * 500), 5, 0), colKey: "cap.ltvPct", colVals: axis(input.cap.ltvPct, 5, 5, 0), metric: "leveredIrr", title: "세대당 보증금 × LTV → Levered IRR", rowLabel: "보증금", colLabel: "LTV", fmtRow: (v) => `${num(v)}만원`, fmtCol: (v) => pctv(v, 0), threshold: target / 100, scale: 0.08, floor: 0 }
      : { rowKey: "office.rentPerPy", rowVals: axis(input.office.rentPerPy, Math.max(0.25, Math.round(input.office.rentPerPy * 0.05 * 4) / 4), 5, 0.25), colKey: "cap.ltvPct", colVals: axis(input.cap.ltvPct, 5, 5, 0), metric: "leveredIrr", title: "임대료 × LTV → Levered IRR", rowLabel: "임대료/평", colLabel: "LTV", fmtRow: (v) => `${num(v, 2)}만`, fmtCol: (v) => pctv(v, 0), threshold: target / 100, scale: 0.08, floor: 0 };
    return [g1, g2, g3].map((spec) => ({ spec, v: proGrid(input, spec) }));
  }, [input, isRental, target]);
  const idx = (xs: number[], v: number) => xs.reduce((best, x, k) => (Math.abs(x - v) < Math.abs(xs[best] - v) ? k : best), 0);
  const gridVal = (spec: GridSpec, key: string) => {
    const [g, f] = key.split(".") as ["rental" | "office" | "cap", string];
    return (input[g] as unknown as Record<string, number>)[f];
  };

  const notes: { tone: "warn" | "ok" | "info"; text: string }[] = r.warnings.map((w) => ({ tone: "warn" as const, text: w }));
  if (r.ok) {
    if (Number.isFinite(r.goingInCap) && r.loan > 0) notes.push(r.goingInCap < r.rate
      ? { tone: "warn", text: `역레버리지. 진입 Cap ${pct(r.goingInCap)}가 대출금리 ${pctv(allIn, 2)}보다 낮습니다. 대출을 늘릴수록 보유기간 현금수익률이 떨어지고 수익은 매각차익에 의존합니다.` }
      : { tone: "ok", text: `정(+)의 레버리지. 진입 Cap ${pct(r.goingInCap)}가 대출금리 ${pctv(allIn, 2)}보다 높습니다.` });
    if (r.minDscr !== null) notes.push({ tone: r.minDscr < 1.2 ? "warn" : "ok", text: `최소 DSCR ${mult(r.minDscr)}. 통상 요구 수준 1.2x ${r.minDscr < 1.2 ? "미달" : "충족"}${r.breakevenOcc !== null ? ` · 1년차 손익분기 입주율 ${pct(r.breakevenOcc, 1)}` : ""}.` });
    if (r.effLtv > 0.7) notes.push({ tone: "warn", text: r.loan > 0 ? `보증금을 포함한 실질 LTV ${pct(r.effLtv, 1)}. 대주는 선순위 임차보증금을 한도에서 차감하므로 LTV ${pctv(input.cap.ltvPct, 0)} 조달이 어려울 수 있습니다.` : `승계 보증금만으로 매입가의 ${pct(r.effLtv, 1)}입니다. 추가 대출 여력이 없고 역전세 유동성을 따로 확보해야 합니다.` });
    const agg = Object.values(pos).filter((p) => p.stance === "aggressive").length;
    if (agg > 0) notes.push({ tone: "warn", text: `시장 대비 공격적인 가정 ${agg}개. 입력란의 표시를 확인하십시오. 이 수익률은 그 가정이 실현될 때만 성립합니다.` });
  }

  const onReset = () => { if (market) fill(market, basis?.complexKey ? market.complexes.find((x) => x.key === basis.complexKey) ?? null : null); };
  const onCsv = () => {
    const rows = [["단위: 만원", "취득", ...r.years.map((y) => `${y.year}년`)],
      ["NOI", "", ...r.years.map((y) => Math.round(y.noi))], ["이자", "", ...r.years.map((y) => -Math.round(y.interest))], ["원금", "", ...r.years.map((y) => -Math.round(y.principal))],
      ["고정비", "", ...r.years.map((y) => -Math.round(y.fixed))], ["법인세", "", ...r.years.map((y) => -Math.round(y.tax))], ["우선주 배당", "", ...r.years.map((y) => -Math.round(y.prefPaid))],
      ["보통주 현금흐름 (매각 포함)", Math.round(r.leveredCfs[0]), ...r.years.map((_, k) => Math.round(r.leveredCfs[k + 1]))]];
    const csv = "﻿" + rows.map((x) => x.join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "relab-pro-cashflow.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  const P = (k: string) => pos[k];
  const F = (k: string) => from[k];

  return (
    <main>
      <section className="intro">
        <p className="eyebrow">Model Desk · Pro</p>
        <h1>기관투자자의 사업성 분석</h1>
        <p className="intro-lead">{isRental
          ? "오피스텔·도시형생활주택 통매입입니다. 국토교통부 실거래가가 매입 단가·임대료·보증금·전환율을 채우고, 그 가정이 시장의 어디에 있는지 판정합니다."
          : `${PRO_ASSET_LABEL[input.asset]}입니다. 임대료·관리비·운영비는 렌트롤과 관리비 수지에서 직접 입력합니다. 공개 실거래가에는 이 자산의 임대료가 없어 시장 대비 위치는 표시하지 않고, 금리만 한국은행에서 받아 옵니다.`}</p>
        <div className="asset-tabs intro-tabs" role="tablist" aria-label="자산 유형">
          {(Object.keys(PRO_ASSET_LABEL) as ProAsset[]).map((a) => <button key={a} type="button" role="tab" aria-selected={a === input.asset} className={a === input.asset ? "on" : ""} onClick={() => setAsset(a)}>{PRO_ASSET_LABEL[a]}</button>)}
        </div>
        <div className="status">
          {isRental && <span className={`chip ${market?.meta.mode === "live" ? "live" : ""}`}>{market ? (market.meta.mode === "live" ? "실거래가 · OpenAPI 실시간" : "실거래가 · 국토부 공개 CSV 스냅샷") : "실거래가 · 불러오는 중"}</span>}
          {!isRental && <span className="chip">임대료·공실 · 렌트롤 직접 입력</span>}
          <span className={`chip ${rates?.live ? "live" : ""}`}>{rates ? (rates.live ? `금리 · ECOS 실시간 ${rates.fetchedAt}` : "금리 · 마지막 확인값") : "금리 · 불러오는 중"}</span>
        </div>
      </section>

      {isRental ? (
        <MarketPanel asset="offi" regions={regions} code={code} band={band} market={market} loading={loading} error={error} selectedKey={selectedKey} detail={detail} legalCapPct={legalCapPct}
          onCode={(c) => { setSelectedKey(null); setCode(c); }} onBand={setBand} onPick={setSelectedKey}
          onFillRegion={() => { if (market) { fill(market, null); document.getElementById("underwrite")?.scrollIntoView({ behavior: "smooth" }); } }}
          onFillComplex={(c) => { if (market) { fill(market, c); document.getElementById("underwrite")?.scrollIntoView({ behavior: "smooth" }); } }} />
      ) : (
        <section className="sec">
          <SectionHead no="01" title="자료" lead="이 자산은 공개 실거래가로 임대료를 확인할 수 없습니다. 무엇을 어디서 가져와 넣는지 먼저 정리합니다." />
          <dl className="src-grid">
            <div><dt>임대료 · 관리비 · 보증금</dt><dd>매도자 렌트롤과 관리비 수지. 계약별 만기와 인상 조건을 함께 봅니다.</dd></div>
            <div><dt>공실률</dt><dd>권역 임대 시장 조사(분기 보고서). 계약 만기 집중 연도에는 가정을 따로 둡니다.</dd></div>
            <div><dt>운영비</dt><dd>직전 2년 실적 수지. 관리비 수입과 상계한 순액으로 넣습니다.</dd></div>
            <div><dt>금리</dt><dd>{rates ? `한국은행 ECOS ${rates.live ? "실시간" : "마지막 확인값"} · 기준금리 ${num(rateOf(rates, "base") ?? 0, 2)}% · CD 91일 ${num(rateOf(rates, "cd91") ?? 0, 2)}%` : "한국은행 ECOS · 불러오는 중"}</dd></div>
          </dl>
        </section>
      )}

      <section id="underwrite" className="sec">
        <SectionHead no="02" title="언더라이팅" lead={isRental ? "입력값은 서버로 가지 않습니다. 시장에서 온 값에는 출처가, 비교 가능한 가정에는 시장 대비 위치가 붙습니다." : "입력값은 서버로 가지 않습니다. 렌트롤 값을 그대로 넣으면 아래 결론과 한계선이 바로 갱신됩니다."}
          aside={<div className="btn-row"><button type="button" className="btn" onClick={onCsv}>현금흐름 CSV</button><button type="button" className="btn" onClick={() => window.print()}>인쇄 · PDF</button></div>} />

        <div className="uw">
          <div className="uw-inputs">
            {isRental && (
              <>
                <div className="basis">
                  <div><span className="basis-label">가정 기준</span><b>{basis?.label ?? "직접 입력"}</b>{edited && <span className="basis-edited">수정됨</span>}</div>
                  <button type="button" className="link" onClick={onReset} disabled={!edited}>시장값으로 되돌리기</button>
                </div>
                <p className="basis-note">
                  {basis?.complexKey
                    ? <>검토 중인 물건: <b>{basis.label}</b>와 같은 조건의 오피스텔 <b>{input.rental.units}세대</b>. 세대수는 실거래가에 없으므로 실제 세대수로 고쳐 넣으십시오.</>
                    : <>검토 중인 물건: 이 지역의 <b>평균적인 오피스텔 {input.rental.units}세대</b>를 가정한 가상의 물건입니다. 특정 단지를 검토하려면 위 표에서 단지를 고르고 「이 단지 값으로 가정 채우기」를 누르십시오.</>}
                </p>
                <fieldset><legend>자산</legend>
                  <NumField label="세대수" unit="세대" value={input.rental.units} step={1} min={1} onChange={(v) => set("rental", "units", Math.round(v))} position={P("rental.units")} />
                  <NumField label="세대당 전용면적" unit="평" value={input.rental.areaPy} step={0.1} min={1} onChange={(v) => set("rental", "areaPy", v)} source={F("rental.areaPy")} derived={`= ${num(input.rental.areaPy * PY, 1)}㎡ · 총 전용 ${num(r.gla, 0)}평`} />
                  <NumField label="매입 단가" unit="만원/전용평" value={input.rental.pricePerPy} step={10} min={1} onChange={(v) => set("rental", "pricePerPy", v)} position={P("rental.pricePerPy")} source={F("rental.pricePerPy")} derived={`매입가 ${eok(r.price)} · 세대당 ${num(r.price / input.rental.units / 10000, 2)}억`} />
                </fieldset>
                <fieldset><legend>임대</legend>
                  <NumField label="환산월세" unit="만원/평·월" value={input.rental.effRentPerPy} step={0.1} min={0} onChange={(v) => set("rental", "effRentPerPy", v)} position={P("rental.effRentPerPy")} source={F("rental.effRentPerPy")} derived={`세대당 완전월세 ${num(input.rental.effRentPerPy * input.rental.areaPy, 1)}만원`} />
                  <NumField label="세대당 보증금" unit="만원" value={input.rental.depositPerUnit} step={100} min={0} onChange={(v) => set("rental", "depositPerUnit", v)} source={F("rental.depositPerUnit")} derived={`월세 현금 ${num(r.cashRentPerUnit, 1)}만원/세대 · 승계 보증금 ${eok(r.deposits)}`} />
                  <NumField label="전월세전환율" unit="%" value={input.rental.convRatePct} step={0.05} min={0} max={20} onChange={(v) => set("rental", "convRatePct", v)} position={P("rental.convRatePct")} source={F("rental.convRatePct")} />
                  <NumField label="안정화 공실률" unit="%" value={input.rental.vacancyPct} step={0.5} min={0} max={100} onChange={(v) => set("rental", "vacancyPct", v)} position={P("rental.vacancyPct")} />
                  <NumField label="임대료 성장률" unit="%/년" value={input.rental.rentGrowthPct} step={0.1} min={-10} max={20} onChange={(v) => set("rental", "rentGrowthPct", v)} position={P("rental.rentGrowthPct")} source={F("rental.rentGrowthPct")} />
                </fieldset>
                <fieldset><legend>비용</legend>
                  <NumField label="운영비" unit="% EGI" value={input.rental.opexPct} step={0.5} min={0} max={100} onChange={(v) => set("rental", "opexPct", v)} position={P("rental.opexPct")} />
                  <NumField label="수선 · 교체 적립" unit="% EGI" value={input.rental.capexPct} step={0.5} min={0} max={100} onChange={(v) => set("rental", "capexPct", v)} />
                  <NumField label="보유세" unit="% 매입가/년" value={input.rental.holdTaxPct} step={0.05} min={0} max={10} onChange={(v) => set("rental", "holdTaxPct", v)} derived="재산세·도시지역분·지방교육세 합계 가정. 주거용으로 과세되면 종합부동산세가 추가됩니다" />
                  <Seg label="취득세 등" value={input.rental.acqTaxPct === 4.6 ? "4.6" : input.rental.acqTaxPct === 12.4 ? "12.4" : "custom"} options={[{ id: "4.6", label: "오피스텔 4.6%" }, { id: "12.4", label: "법인 주택 중과 12.4%" }, { id: "custom", label: "직접 입력" }]} onChange={(v) => set("rental", "acqTaxPct", v === "custom" ? 5 : Number(v))} />
                  {![4.6, 12.4].includes(input.rental.acqTaxPct) && <NumField label="취득세 등 직접 입력" unit="% 매입가" value={input.rental.acqTaxPct} step={0.1} min={0} max={20} onChange={(v) => set("rental", "acqTaxPct", v)} />}
                  <NumField label="기타 취득부대비" unit="% 매입가" value={input.rental.acqCostPct} step={0.1} min={0} max={20} onChange={(v) => set("rental", "acqCostPct", v)} derived={`취득부대비 합계 ${eok(r.acqCost)}`} />
                </fieldset>
              </>
            )}
            {!isRental && (
              <>
                <p className="basis-note">{PRO_ASSET_LABEL[input.asset]} 모델은 RE:VISION Model Desk의 산식을 옮긴 것입니다. 시장 대비 위치 표시는 없습니다.</p>
                <fieldset><legend>자산</legend>
                  <NumField label="매입가" unit="만원" value={input.office.price} step={10000} min={1} onChange={(v) => set("office", "price", v)} position={P("office.price")} derived={`${eok(input.office.price)} · 연면적 평당 ${num(input.office.price / input.office.gfaPy, 0)}만원`} />
                  <NumField label="연면적" unit="평" value={input.office.gfaPy} step={10} min={1} onChange={(v) => set("office", "gfaPy", v)} />
                  <NumField label="전용률" unit="%" value={input.office.effRatioPct} step={1} min={1} max={100} onChange={(v) => set("office", "effRatioPct", v)} derived={`임대면적 ${num(r.gla, 0)}평`} />
                  <NumField label="취득세 등" unit="% 매입가" value={input.office.acqTaxPct} step={0.1} min={0} max={20} onChange={(v) => set("office", "acqTaxPct", v)} />
                  <NumField label="기타 취득부대비" unit="% 매입가" value={input.office.acqCostPct} step={0.1} min={0} max={20} onChange={(v) => set("office", "acqCostPct", v)} derived={`취득부대비 합계 ${eok(r.acqCost)}`} />
                </fieldset>
                <fieldset><legend>운영 수입</legend>
                  <NumField label="NOI 직접 입력 (선택)" unit="만원/년" value={input.office.noiDirect} step={1000} min={0} onChange={(v) => set("office", "noiDirect", v)} derived="IM의 안정화 NOI를 그대로 쓸 때. 0이면 아래 임대료로 계산합니다" />
                  <NumField label="임대료" unit="만원/평·월" value={input.office.rentPerPy} step={0.1} min={0} onChange={(v) => set("office", "rentPerPy", v)} position={P("office.rentPerPy")} />
                  <NumField label="관리비 순수입" unit="만원/평·월" value={input.office.mgmtNetPerPy} step={0.1} min={0} onChange={(v) => set("office", "mgmtNetPerPy", v)} derived="관리비 수입에서 실비를 뺀 마진" />
                  <NumField label="공실률" unit="%" value={input.office.vacancyPct} step={0.5} min={0} max={100} onChange={(v) => set("office", "vacancyPct", v)} position={P("office.vacancyPct")} />
                  <NumField label="기타 수입" unit="만원/년" value={input.office.otherIncome} step={100} min={0} onChange={(v) => set("office", "otherIncome", v)} />
                  <NumField label="보증금" unit="만원/평" value={input.office.depositPerPy} step={5} min={0} onChange={(v) => set("office", "depositPerPy", v)} derived={`승계 보증금 ${eok(r.deposits)} · 운용수익률 ${pctv(input.office.depositRatePct, 1)}`} />
                  <NumField label="보증금 운용수익률" unit="%" value={input.office.depositRatePct} step={0.1} min={0} max={20} onChange={(v) => set("office", "depositRatePct", v)} />
                  <NumField label="임대료 성장률" unit="%/년" value={input.office.rentGrowthPct} step={0.1} min={-10} max={20} onChange={(v) => set("office", "rentGrowthPct", v)} />
                </fieldset>
                <fieldset><legend>운영 비용</legend>
                  <NumField label="운영비" unit="만원/평·월 (연면적)" value={input.office.opexPerPy} step={0.05} min={0} onChange={(v) => set("office", "opexPerPy", v)} />
                  <NumField label="운영비 상승률" unit="%/년" value={input.office.opexGrowthPct} step={0.1} min={-10} max={20} onChange={(v) => set("office", "opexGrowthPct", v)} />
                  <NumField label="운용보수" unit="% 매입가/년" value={input.office.aumFeePct} step={0.05} min={0} max={5} onChange={(v) => set("office", "aumFeePct", v)} />
                  <NumField label="기타 고정비" unit="만원/년" value={input.office.fixedCost} step={100} min={0} onChange={(v) => set("office", "fixedCost", v)} />
                </fieldset>
              </>
            )}

            <fieldset><legend>자본구조</legend>
              <NumField label="선순위 대출" unit="% 매입가" value={input.cap.ltvPct} step={1} min={0} max={95} onChange={(v) => set("cap", "ltvPct", v)} source={F("cap.ltvPct")} derived={`대출 ${eok(r.loan)} · 보증금 포함 실질 LTV ${pct(r.effLtv, 1)}`} />
              <div className="field">
                <label htmlFor="bench">기준금리 지표</label>
                <select id="bench" value={bench} onChange={(e) => setBench(e.target.value as Bench)}>
                  {rates?.rates.map((x) => <option key={x.id} value={x.id}>{x.label} {x.value.toFixed(2)}% ({x.asOf})</option>)}
                  <option value="manual">직접 입력</option>
                </select>
                <div className="field-src">{rates ? (rates.live ? `한국은행 ECOS OpenAPI · 조회 ${rates.fetchedAt}` : rates.note) : "금리를 불러오는 중"}</div>
              </div>
              {bench === "manual" && <NumField label="기준금리 직접 입력" unit="%" value={input.cap.baseRatePct} step={0.05} min={0} max={20} onChange={(v) => set("cap", "baseRatePct", v)} />}
              <NumField label="가산금리" unit="bp" value={input.cap.spreadBp} step={10} min={0} max={1000} onChange={(v) => set("cap", "spreadBp", v)} position={P("cap.spreadBp")} derived={`대출금리 ${pctv(allIn, 2)} · 1년차 이자 ${eok(r.years[0]?.interest ?? 0)}`} />
              <Seg label="상환 방식" value={input.cap.amortType} options={[{ id: "bullet", label: "만기일시" }, { id: "annuity", label: "원리금균등" }, { id: "straight", label: "원금균등" }]} onChange={(v) => set("cap", "amortType", v as AmortType)} />
              {input.cap.amortType !== "bullet" && <NumField label="상환 기간" unit="년" value={input.cap.amortYears} step={1} min={1} max={40} onChange={(v) => set("cap", "amortYears", Math.round(v))} />}
              <NumField label="우선주" unit="만원" value={input.cap.prefAmt} step={10000} min={0} onChange={(v) => set("cap", "prefAmt", v)} derived={input.cap.prefAmt > 0 ? `${eok(input.cap.prefAmt)} · 누적 우선배당, 매각 시 원금·미지급 배당 우선 정산` : "0이면 없음"} />
              {input.cap.prefAmt > 0 && <NumField label="우선주 배당률" unit="%" value={input.cap.prefRatePct} step={0.1} min={0} max={30} onChange={(v) => set("cap", "prefRatePct", v)} />}
            </fieldset>
            <fieldset><legend>매각 · 세무</legend>
              <NumField label="보유기간" unit="년" value={input.cap.holdYears} step={1} min={1} max={15} onChange={(v) => set("cap", "holdYears", Math.round(v))} />
              <NumField label="Exit Cap" unit="%" value={input.cap.exitCapPct} step={0.05} min={0.5} max={20} onChange={(v) => set("cap", "exitCapPct", v)} position={P("cap.exitCapPct")} source={F("cap.exitCapPct")} derived={`매각가 ${eok(r.saleValue)} · 매입가 대비 ${pctv((r.saleValue / r.price - 1) * 100, 1, true)}`} />
              <NumField label="매각 비용" unit="% 매각가" value={input.cap.saleCostPct} step={0.1} min={0} max={10} onChange={(v) => set("cap", "saleCostPct", v)} />
              <Seg label="과세 구조" value={input.cap.taxMode} options={[{ id: "conduit", label: "도관 (리츠·펀드)" }, { id: "corp", label: "일반법인" }]} onChange={(v) => set("cap", "taxMode", v)} />
              {input.cap.taxMode === "corp" && (<>
                <NumField label="법인세 실효세율" unit="%" value={input.cap.corpTaxPct} step={0.1} min={0} max={50} onChange={(v) => set("cap", "corpTaxPct", v)} />
                <NumField label="취득원가 중 건물분" unit="%" value={input.cap.buildingRatioPct} step={1} min={0} max={100} onChange={(v) => set("cap", "buildingRatioPct", v)} />
                <NumField label="건물 내용연수" unit="년" value={input.cap.deprYears} step={1} min={1} max={60} onChange={(v) => set("cap", "deprYears", v)} />
              </>)}
            </fieldset>
          </div>

          <div className="uw-results" id="results">
            <div className={`verdict v-${V.tone}`} role="status">
              <div className="verdict-label">결론</div>
              <p className="verdict-head">{V.headline}</p>
              {V.lender && <p className="verdict-sub">{V.lender}</p>}
              <div className="tally"><span className="t-agg">공격적 {V.tally.aggressive}</span><span className="t-neu">중립 {V.tally.neutral}</span><span className="t-con">보수적 {V.tally.conservative}</span><span className="t-na">자료 없음 {V.tally.na}</span></div>
            </div>
            <div className="kpis four">
              <Kpi label={`Levered IRR${input.cap.taxMode === "corp" ? " · 세후" : ""}`} value={pct(r.leveredIrr)} tone={r.leveredIrr !== null && r.leveredIrr < 0 ? "neg" : undefined} sub={`Unlevered ${pct(r.unleveredIrr)}`} />
              <Kpi label="Equity Multiple" value={mult(r.equityMultiple)} sub={`보통주 자기자본 ${eok(r.equity)}`} />
              <Kpi label="평균 Cash-on-Cash" value={pct(r.avgCoC)} sub="보유기간 배당가능 현금 ÷ 자기자본" tone={r.avgCoC !== null && r.avgCoC < 0 ? "neg" : undefined} />
              <Kpi label="최소 DSCR" value={mult(r.minDscr)} sub="NOI ÷ 원리금" tone={r.minDscr !== null && r.minDscr < 1 ? "neg" : undefined} />
            </div>
            <dl className="facts">
              <div><dt>진입 Cap (보증금 차감)</dt><dd>{pct(r.goingInCap)}</dd></div>
              <div><dt>Yield on Cost</dt><dd>{pct(r.yieldOnCost)}</dd></div>
              <div><dt>Debt Yield</dt><dd>{pct(r.debtYield)}</dd></div>
              <div><dt>1년차 NOI</dt><dd>{eok(r.years[0]?.noi, 2)}</dd></div>
              <div><dt>매각 순수령 (보통주)</dt><dd>{eok(r.saleNetToEquity)}</dd></div>
            </dl>
            <ul className="notes">{notes.map((n, k) => <li key={k} className={`note-${n.tone}`}>{n.text}</li>)}</ul>
            <h3>조달과 사용</h3>
            <StackBar parts={[
              { label: "선순위 대출", value: r.loan, tone: "debt", note: `${eok(r.loan)} · ${pctv(allIn, 2)}` },
              ...(r.pref > 0 ? [{ label: "우선주", value: r.pref, tone: "pref", note: `${eok(r.pref)} · ${pctv(input.cap.prefRatePct, 1)}` }] : []),
              { label: "승계 보증금", value: r.deposits, tone: "dep", note: `${eok(r.deposits)} · 무이자, 매각 시 승계` },
              { label: "보통주 자기자본", value: r.equity, tone: "eq", note: eok(r.equity) },
            ]} />
            <p className="fine">사용 = 매입가 {eok(r.price)} + 취득부대비 {eok(r.acqCost)} = {eok(r.uses)}</p>
            <h3>보통주 현금흐름 <span>억원</span></h3>
            <CfBars cfs={r.leveredCfs} />
            <details>
              <summary>연도별 현금흐름표</summary>
              <div className="table-wrap"><table className="data tight">
                <thead><tr><th>억원</th>{r.years.map((y) => <th key={y.year} className="num">{y.year}년</th>)}</tr></thead>
                <tbody>
                  {([["NOI", "noi", 1], ["(−) 이자", "interest", -1], ["(−) 원금", "principal", -1], ["(−) 고정비·보수", "fixed", -1], ["(−) 법인세", "tax", -1], ["(−) 우선주 배당", "prefPaid", -1], ["보통주 배당가능 현금", "cf", 1]] as const).map(([label, key, sign]) => (
                    <tr key={key} className={key === "noi" || key === "cf" ? "total" : ""}><td>{label}</td>{r.years.map((y) => <td key={y.year} className="num">{num((sign * y[key]) / 10000, 2)}</td>)}</tr>
                  ))}
                  <tr><td>DSCR</td>{r.years.map((y) => <td key={y.year} className="num">{mult(y.dscr)}</td>)}</tr>
                  <tr><td>대출 잔액</td>{r.debt.map((d, k) => <td key={k} className="num">{num(d.close / 10000, 1)}</td>)}</tr>
                </tbody>
              </table></div>
              <p className="fine">매각 ({input.cap.holdYears}년 말): 매각가 {eok(r.saleValue)} − 매각비용 {eok(r.saleCost)} − 보증금 {eok(r.deposits)} − 대출 잔액 {eok(r.loanAtExit)}{input.cap.taxMode === "corp" ? ` − 양도 법인세 ${eok(r.exitTax)}` : ""}{r.pref > 0 ? ` − 우선주 정산 ${eok(r.prefBack)}` : ""} = {eok(r.saleNetToEquity)}</p>
            </details>
          </div>
        </div>
      </section>

      <section id="limits" className="sec">
        <SectionHead no="03" title="한계선과 민감도" lead="결론은 된다 안 된다가 아니라 어디까지 나빠져도 버티는가입니다. 손익분기는 투자자의 원금과 대주의 원리금, 두 개를 따로 봅니다." />
        <div className="limits">
          <div className="limit"><div className="limit-no">①</div><h3>자기자본 원금 보전선</h3>
            <div className="limit-value">{L.capitalPreserve ? `Exit Cap ${pctv(L.capitalPreserve.exitCapPct, 2)}` : "–"}</div>
            <p>{L.capitalPreserve ? <>매각가가 매입가 대비 <b>{pctv(L.capitalPreserve.saleVsPrice * 100, 1, true)}</b>일 때 Equity Multiple이 1.0x가 됩니다. 현재 가정 {pctv(input.cap.exitCapPct, 2)}에서 <b>{Math.round((L.capitalPreserve.exitCapPct - input.cap.exitCapPct) * 100)}bp</b>의 여유입니다.</> : "탐색 구간 안에서 원금 보전 지점을 찾지 못했습니다."}</p></div>
          <div className="limit"><div className="limit-no">②</div><h3>대주 상환 한계선</h3>
            <div className="limit-value">{L.debtCover ? `Exit Cap ${pctv(L.debtCover.exitCapPct, 2)}` : "–"}</div>
            <p>{L.debtCover ? <>매각가가 매입가 대비 <b>{pctv(L.debtCover.saleVsPrice * 100, 1, true)}</b>까지 내려가도 매각대금으로 대출 {eok(r.loanAtExit)}과 보증금 {eok(r.deposits)}을 전액 상환합니다. 그 아래에서는 자기자본이 전액 손실되고 대주 원금이 침해됩니다.</> : "대출이 없거나 한계 지점을 찾지 못했습니다."}</p></div>
          <div className="limit"><div className="limit-no">역산</div><h3>목표 수익률 기준</h3>
            <NumField label="목표 Levered IRR" unit="%" value={target} step={0.5} min={0} max={40} onChange={setTarget} />
            <dl className="facts col">
              <div><dt>최대 매입 {isRental ? "단가" : "가"}</dt><dd>{L.maxPrice === null ? "–" : isRental ? `${num(L.maxPrice, 0)}만원/평` : eok(L.maxPrice)} {L.maxPrice !== null && <span>현재 대비 {pctv((L.maxPrice / r.price0 - 1) * 100, 1, true)}</span>}</dd></div>
              <div><dt>DSCR 1.2x가 되는 대출금리</dt><dd>{L.rateAtDscr === null ? (input.cap.amortType === "bullet" ? "–" : "만기일시상환에서만 산출") : pctv(L.rateAtDscr, 2)} <span>현재 {pct(r.rate)}</span></dd></div>
              {r.breakevenOcc !== null && <div><dt>1년차 손익분기 입주율</dt><dd>{pct(r.breakevenOcc, 1)} <span>가정 {pctv(100 - input.rental.vacancyPct, 1)}</span></dd></div>}
            </dl></div>
        </div>
        <div className="grid2 heats">
          {grids.slice(0, 2).map(({ spec, v }) => (
            <figure key={spec.title}><figcaption>{spec.title} <span>굵은 테두리 = 현재 가정 · 붉은 테두리 = {spec.metric === "minDscr" ? "1.0x 미만" : "원금 손실"}</span></figcaption>
              <Heat rowLabel={spec.rowLabel} colLabel={spec.colLabel} rows={spec.rowVals.map(spec.fmtRow)} cols={spec.colVals.map(spec.fmtCol)} values={v}
                fmt={(x) => (x === null ? "–" : spec.metric === "minDscr" ? mult(x) : pctv(x * 100, 1))} threshold={spec.threshold} scale={spec.scale}
                centerRow={idx(spec.rowVals, gridVal(spec, spec.rowKey))} centerCol={idx(spec.colVals, gridVal(spec, spec.colKey))} floor={spec.floor} /></figure>
          ))}
        </div>
        {grids.slice(2).map(({ spec, v }) => (
          <figure key={spec.title}><figcaption>{spec.title} <span>{isRental ? "보증금은 무이자 조달이지만 월세를 전환율만큼 깎습니다" : "임대료 가정이 IM 대비 어디까지 버티는지"}</span></figcaption>
            <Heat rowLabel={spec.rowLabel} colLabel={spec.colLabel} rows={spec.rowVals.map(spec.fmtRow)} cols={spec.colVals.map(spec.fmtCol)} values={v}
              fmt={(x) => (x === null ? "–" : pctv(x * 100, 1))} threshold={spec.threshold} scale={spec.scale} centerRow={idx(spec.rowVals, gridVal(spec, spec.rowKey))} centerCol={idx(spec.colVals, gridVal(spec, spec.colKey))} floor={spec.floor} />
            {isRental && legalCapPct !== null && <p className="fine">전환율 {pctv(input.rental.convRatePct, 2)}는 보증금의 실질 조달비용입니다. 기존 임차인의 보증금을 월세로 돌릴 때는 법정 상한 {pctv(legalCapPct, 2)}(기준금리 + 2%p, {RULES.rent.basis})가 적용됩니다.</p>}
          </figure>
        ))}
      </section>

      <section id="audit" className="sec">
        <SectionHead no="04" title="검증과 출처" lead="데이터가 어디서 왔고, 무엇을 뺐고, 계산이 맞는지 여기서 확인합니다." />
        <div className="audit">
          <div>
            <h3>데이터 계보</h3>
            <table className="data tight kv"><tbody>
              <tr><td>임대 · 매매</td><td>{market?.meta.source ?? "–"}</td></tr>
              <tr><td>수집 방식</td><td>{market ? (market.meta.mode === "live" ? "OpenAPI 실시간 호출 · 서버에서 하루 캐시" : "국토교통부 공개 CSV로 만든 스냅샷") : "–"}</td></tr>
              <tr><td>대상 · 기간</td><td>{market ? `${market.meta.name} · ${market.meta.asset} · ${market.meta.from} ~ ${market.meta.to} (계약일 기준)` : "–"}</td></tr>
              <tr><td>임대 계약</td><td>{market ? `전체 ${num(market.counts.rentTotal)}건 → 최근 12개월 ${num(market.counts.rentRecent)}건 (월세 ${num(market.counts.wolseRecent)}건)` : "–"}</td></tr>
              <tr><td>매매</td><td>{market ? `전체 ${num(market.counts.tradeTotal)}건 − 해제 ${num(market.counts.tradeCanceled)}건 → 최근 12개월 ${num(market.counts.tradeRecent)}건` : "–"}</td></tr>
              <tr><td>금리</td><td>{rates ? `한국은행 ECOS (722Y001 · 817Y002) · ${rates.live ? `조회 ${rates.fetchedAt}` : "마지막 확인값"}` : "–"}</td></tr>
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
              <tr><td>Cap rate</td><td>NOI ÷ (가격 − 보증금). 보증금 차감 기준</td></tr>
              <tr><td>매각가</td><td>{isRental ? "매각 다음 해 NOI ÷ Exit Cap + 보증금" : "매각 다음 해 NOI ÷ Exit Cap. NOI에 보증금 운용수익이 들어 있으므로 보증금을 다시 더하지 않고, 매수인이 승계하는 보증금만 매각대금에서 뺍니다"}</td></tr>
              <tr><td>자기자본</td><td>매입가 + 취득부대비 − 대출 − 우선주 − 승계 보증금</td></tr>
              <tr><td>DSCR</td><td>NOI ÷ (이자 + 원금)</td></tr>
              <tr><td>우선주</td><td>매기 우선배당(미지급 이월) 후 잔여가 보통주. 매각 시 우선주 원금과 미지급 배당을 먼저 정산</td></tr>
              <tr><td>IRR</td><td>이분법으로 NPV = 0 인 할인율</td></tr>
            </tbody></table>
          </div>
          <div>
            <h3>모델 검증 <span>지금 화면의 입력값으로 실행</span></h3>
            <ul className="checks">{r.checks.map((k) => <li key={k.label} className={k.pass === null ? "na" : k.pass ? "pass" : "fail"}><b>{k.pass === null ? "N/A" : k.pass ? "PASS" : "FAIL"}</b><span>{k.label}<small>{k.detail}</small></span></li>)}</ul>
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
      <a className={`mbar v-${V.tone}`} href="#results" aria-label="결과로 이동"><span><i>IRR</i>{pct(r.leveredIrr)}</span><span><i>EM</i>{mult(r.equityMultiple)}</span><span><i>DSCR</i>{mult(r.minDscr)}</span><span className="mbar-go">결과 ↑</span></a>
    </main>
  );
}
