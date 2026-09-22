"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Kpi, NumField, SectionHead, Seg } from "./fields";
import { MarketPanel } from "./MarketPanel";
import { rateOf, useMarket } from "./useMarket";
import { HOME_DEFAULT, homeModel, type HomeInput } from "@/lib/engine/models/home";
import type { ComplexStat, Market } from "@/lib/connectors/market";
import { PY, type AreaBand, type Asset } from "@/lib/connectors/types";
import { RULES, type HouseCount, type Zone } from "@/lib/rules";
import { eok, num, pct, pctv } from "@/lib/format";

const won = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "–" : `${num(v, d)}만원`);
const signedEok = (v: number) => `${v >= 0 ? "+" : "−"}${eok(Math.abs(v))}`;

export default function HomeApp() {
  const [asset, setAsset] = useState<Asset>("apt");
  const [code, setCode] = useState("11440");
  const [band, setBand] = useState<AreaBand>("m");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [raw, setRaw] = useState<HomeInput>(HOME_DEFAULT);
  const [basis, setBasis] = useState<string | null>(null);
  const [useCap, setUseCap] = useState(true); // 대출을 한도까지 자동으로
  const inputRef = useRef(raw);
  useEffect(() => { inputRef.current = raw; }, [raw]);
  const autofilled = useRef(false);

  const fill = useCallback((m: Market, c: ComplexStat | null) => {
    const kind = m.meta.assetId;
    const areaM2 = c ? c.medArea : (m.kpi.medAreaM2 ?? inputRef.current.areaM2);
    const pricePy = c?.pricePerPy ?? m.kpi.pricePerPy;
    const rentPy = c?.effRentPerPy ?? m.kpi.effRentPerPy;
    const next: HomeInput = { ...inputRef.current, kind, areaM2: Math.round(areaM2 * 10) / 10 };
    if (pricePy) next.price = Math.round((pricePy * areaM2) / PY / 100) * 100;
    if (c?.medDeposit != null && c.medRent != null) { next.deposit = c.medDeposit; next.monthlyRent = c.medRent; }
    else if (rentPy) { next.deposit = Math.round((next.price * (m.kpi.depositToPricePct ?? 10)) / 100 / 100) * 100; next.monthlyRent = Math.round(rentPy * (areaM2 / PY) - (next.deposit * m.conv.ratePct) / 100 / 12); }
    if (m.kpi.priceYoYPct != null) next.priceGrowthPct = Math.round(Math.min(6, Math.max(-3, m.kpi.priceYoYPct)) * 10) / 10;
    if (m.kpi.rentYoYPct != null) next.rentGrowthPct = Math.round(Math.min(5, Math.max(0, m.kpi.rentYoYPct)) * 10) / 10;
    setRaw(next);
    setBasis(c ? `${c.name} ${Math.round(areaM2)}㎡ (${m.meta.name.split(" ").pop()})` : `${m.meta.name} ${m.meta.asset} 시세`);
  }, []);
  const onLoaded = useCallback((m: Market) => { if (!autofilled.current) { autofilled.current = true; fill(m, null); } }, [fill]);
  const { regions, rates, market, loading, error, detail } = useMarket(asset, code, band, selectedKey, onLoaded);
  const baseRate = rateOf(rates, "base");
  const legalCapPct = baseRate === null ? null : Math.min(10, baseRate + 2);

  const set = useCallback(<K extends keyof HomeInput>(k: K, v: HomeInput[K]) => setRaw((p) => ({ ...p, [k]: v })), []);
  const pre = useMemo(() => homeModel(raw), [raw]);
  const input = useMemo<HomeInput>(() => (useCap && raw.purpose !== "jeonse" ? { ...raw, loan: Math.min(raw.loan > 0 ? Math.max(raw.loan, pre.cap.max) : pre.cap.max, pre.cap.max) } : raw.purpose === "jeonse" ? { ...raw, loan: 0 } : raw), [raw, useCap, pre.cap.max]);
  const r = useMemo(() => homeModel(input), [input]);
  const yrs = input.holdYears;

  const q1 = r.cap.binding === "불가" ? "대출 불가" : eok(r.cap.max);
  const canAfford = r.cashNeeded > 0;
  const answers = [
    { q: "살 수 있나 · 대출 한도", a: q1, s: `${r.cap.note} · ${r.cap.binding} 기준${r.dsrPct !== null ? ` · 이 대출로 DSR ${pctv(r.dsrPct, 0)}` : ""}`, neg: r.cap.binding === "불가" },
    { q: input.purpose === "live" ? "매달 얼마가 나가나" : "매달 얼마가 남나", a: `${r.monthlyNet >= 0 ? "+" : "−"}${num(Math.abs(r.monthlyNet), 0)}만원`, s: `원리금 ${num(r.payment, 0)} + 보유세·관리·수선 ${num(r.monthlyOut - r.payment, 0)}${input.purpose === "rent" ? ` − 월세 ${num(r.monthlyIn, 0)}` : ""} · 원금 상환분 제외 시 ${r.monthlyNetCashOnly >= 0 ? "+" : "−"}${num(Math.abs(r.monthlyNetCashOnly), 0)}만원`, neg: r.monthlyNet < 0 && input.purpose !== "live" },
    { q: `${yrs}년 뒤 얼마가 남나`, a: signedEok(r.totalNet), s: `자기자본 ${eok(r.cashNeeded)} 투입 · 매각 ${eok(r.salePrice)} · 양도세 ${eok(r.cgt.tax)} · 내 돈 기준 연 ${pct(r.irr)}`, neg: r.totalNet < 0 },
    { q: "본전이 되는 집값 상승률", a: r.breakevenGrowthPct === null ? "–" : pctv(r.breakevenGrowthPct, 1, true) + "/년", s: `${input.altReturnPct}% 기회수익률을 넘으려면 연 ${r.breakevenGrowthAltPct === null ? "–" : pctv(r.breakevenGrowthAltPct, 1)} 이상 · 현재 가정 ${pctv(input.priceGrowthPct, 1)}`, neg: false },
  ];

  const R = (id: keyof typeof RULES) => <div className="rule-meta">{RULES[id].basis} · 기준 {RULES[id].asOf} · {RULES[id].verified ? "검증됨" : <b>세무 검토 전</b>}{RULES[id].note ? ` · ${RULES[id].note}` : ""}</div>;

  return (
    <main>
      <section className="intro">
        <p className="eyebrow">Model Desk · Home</p>
        <h1>집 한 채, 사면 내 통장이 어떻게 되나</h1>
        <p className="intro-lead">아파트나 오피스텔 한 채를 실거주, 월세 임대, 전세 끼고 매입 중 어떤 방식으로 사는지에 따라 대출 한도, 세금, 매달 현금, 팔 때 남는 돈을 계산합니다. 시세는 국토교통부 실거래가에서, 금리는 한국은행에서 가져오고 세금과 대출 규제는 시행일과 근거를 함께 적습니다.</p>
        <div className="status">
          <span className={`chip ${market?.meta.mode === "live" ? "live" : ""}`}>{market ? (market.meta.mode === "live" ? "실거래가 · OpenAPI 실시간" : "실거래가 · 국토부 공개 CSV 스냅샷") : "실거래가 · 불러오는 중"}</span>
          <span className={`chip ${rates?.live ? "live" : ""}`}>{rates ? (rates.live ? `금리 · ECOS 실시간 ${rates.fetchedAt}` : "금리 · 마지막 확인값") : "금리 · 불러오는 중"}</span>
          <span className="chip">계산은 브라우저 안에서 · 입력값은 저장하지 않습니다</span>
        </div>
      </section>

      <MarketPanel asset={asset} onAsset={(a) => { setAsset(a); setSelectedKey(null); setBand(a === "apt" ? "m" : "all"); }} regions={regions} code={code} band={band} market={market} loading={loading} error={error}
        selectedKey={selectedKey} detail={detail} legalCapPct={legalCapPct} onCode={(c) => { setSelectedKey(null); setCode(c); }} onBand={setBand} onPick={setSelectedKey}
        fillLabel="이 지역 시세로 채우기" onFillRegion={() => { if (market) { fill(market, null); document.getElementById("home")?.scrollIntoView({ behavior: "smooth" }); } }}
        onFillComplex={(c) => { if (market) { fill(market, c); document.getElementById("home")?.scrollIntoView({ behavior: "smooth" }); } }} />

      <section id="home" className="sec">
        <SectionHead no="02" title="내 조건" lead={basis ? `시세 기준: ${basis}. 아래 값은 전부 고칠 수 있습니다.` : "값을 넣으면 오른쪽 답이 바로 바뀝니다."} />
        <div className="uw">
          <div className="uw-inputs">
            <fieldset><legend>어떻게 살 건가</legend>
              <Seg label="용도" value={input.purpose} options={[{ id: "live", label: "실거주" }, { id: "rent", label: "월세 임대" }, { id: "jeonse", label: "전세 끼고 매입" }]} onChange={(v) => set("purpose", v)} />
              <Seg label="종류" value={input.kind} options={[{ id: "apt", label: "아파트 (주택)" }, { id: "offi", label: "오피스텔" }]} onChange={(v) => set("kind", v)} />
              <NumField label="매입가" unit="만원" value={input.price} step={1000} min={1000} onChange={(v) => set("price", v)} derived={`${eok(input.price)} · 전용 ${num(input.areaM2, 1)}㎡ (${num(input.areaM2 / PY, 1)}평) · 평당 ${num(input.price / (input.areaM2 / PY), 0)}만원`} />
              <NumField label="전용면적" unit="㎡" value={input.areaM2} step={1} min={10} onChange={(v) => set("areaM2", v)} derived={input.areaM2 > 85 ? "85㎡ 초과: 취득 시 농어촌특별세가 붙습니다" : "85㎡ 이하: 농어촌특별세 없음"} />
              <Seg label="지역 규제" value={input.zone} options={[{ id: "regulated", label: "조정대상지역" }, { id: "capital", label: "수도권 (비규제)" }, { id: "other", label: "비수도권" }]} onChange={(v) => set("zone", v as Zone)} />
              <Seg label="지금 보유 주택" value={String(input.houses)} options={[{ id: "0", label: "무주택" }, { id: "1", label: "1채" }, { id: "2", label: "2채" }, { id: "3", label: "3채 이상" }]} onChange={(v) => set("houses", Number(v) as HouseCount)} />
              {input.kind === "apt" && input.houses === 0 && <Seg label="1세대1주택 요건" value={input.singleHousehold ? "y" : "n"} options={[{ id: "y", label: "충족 (2년 보유·거주)" }, { id: "n", label: "미충족" }]} onChange={(v) => set("singleHousehold", v === "y")} />}
            </fieldset>
            <fieldset><legend>대출</legend>
              <NumField label="연소득 (세전)" unit="만원" value={input.incomeAnnual} step={100} min={0} onChange={(v) => set("incomeAnnual", v)} derived={r.cap.dsrCap !== null ? `DSR 40% 기준 한도 ${eok(r.cap.dsrCap)}` : "소득이 없으면 DSR을 계산하지 않습니다"} />
              <NumField label="기존 대출 연 상환액" unit="만원" value={input.existingDebtService} step={100} min={0} onChange={(v) => set("existingDebtService", v)} />
              <Seg label="대출 금액" value={useCap ? "cap" : "manual"} options={[{ id: "cap", label: "한도까지" }, { id: "manual", label: "직접 입력" }]} onChange={(v) => setUseCap(v === "cap")} />
              {!useCap && <NumField label="대출" unit="만원" value={input.loan} step={1000} min={0} onChange={(v) => set("loan", v)} />}
              <div className="field-derived">한도 {eok(r.cap.max)} ({r.cap.binding} 기준) · LTV {r.cap.ltvPct}% = {eok(r.cap.ltvCap)}{r.cap.dsrCap !== null ? ` · DSR = ${eok(r.cap.dsrCap)}` : ""}{r.cap.capitalCap !== null ? ` · 수도권 한도 ${eok(r.cap.capitalCap)}` : ""}</div>
              {R("loan")}
              <NumField label="대출 금리" unit="%" value={input.ratePct} step={0.05} min={0} max={20} onChange={(v) => set("ratePct", v)} derived={rates ? `참고: 기준금리 ${rateOf(rates, "base")?.toFixed(2)}% · CD ${rateOf(rates, "cd91")?.toFixed(2)}% (ECOS ${rates.fetchedAt})` : undefined} />
              <NumField label="만기" unit="년" value={input.termYears} step={1} min={1} max={40} onChange={(v) => set("termYears", Math.round(v))} derived={`원리금균등 월 ${num(r.payment, 0)}만원 · 첫 달 이자 ${num(r.interest1, 0)}만원`} />
            </fieldset>
            {input.purpose !== "live" && (
              <fieldset><legend>{input.purpose === "rent" ? "임대 조건" : "전세 조건"}</legend>
                <NumField label={input.purpose === "rent" ? "보증금" : "전세금"} unit="만원" value={input.deposit} step={500} min={0} onChange={(v) => set("deposit", v)} derived={input.purpose === "jeonse" ? `전세가율 ${pctv(r.jeonseRatioPct, 1)} · 이 돈은 내 돈이 아니라 세입자에게 돌려줄 빚입니다` : undefined} />
                {input.purpose === "rent" && <NumField label="월세" unit="만원" value={input.monthlyRent} step={5} min={0} onChange={(v) => set("monthlyRent", v)} derived={`총수익률 ${pctv(r.grossYieldPct, 2)} (연 월세 ÷ (매입가 − 보증금))`} />}
                <NumField label={input.purpose === "rent" ? "월세 상승률" : "전세금 상승률"} unit="%/년" value={input.rentGrowthPct} step={0.5} min={-10} max={20} onChange={(v) => set("rentGrowthPct", v)} derived="갱신 시 5% 상한이 적용됩니다" />
                {input.purpose === "jeonse" && <NumField label="역전세 스트레스" unit="% 하락" value={input.jeonseDropPct} step={5} min={0} max={60} onChange={(v) => set("jeonseDropPct", v)} derived={`만기에 전세가가 이만큼 빠지면 ${eok(r.jeonseStress?.drop ?? 0)}을 내 돈으로 돌려줘야 합니다`} />}
              </fieldset>
            )}
            <fieldset><legend>보유 · 매각</legend>
              <NumField label="보유 기간" unit="년" value={input.holdYears} step={1} min={1} max={30} onChange={(v) => set("holdYears", Math.round(v))} />
              <NumField label="집값 상승률" unit="%/년" value={input.priceGrowthPct} step={0.5} min={-20} max={20} onChange={(v) => set("priceGrowthPct", v)} derived={market?.kpi.priceYoYPct != null ? `참고: 이 지역 동일 단지 매매가 전년비 ${pctv(market.kpi.priceYoYPct, 1, true)} (${market.kpi.priceYoYN}개 단지)` : undefined} />
              <NumField label="관리비 등 월 지출" unit="만원" value={input.mgmtMonthly} step={5} min={0} onChange={(v) => set("mgmtMonthly", v)} derived={input.purpose === "live" ? "실거주 시 본인 부담" : "임대인 부담분 (공실 시 관리비 등)"} />
              <NumField label="수선 · 공실 준비금" unit="% 매입가/년" value={input.repairPct} step={0.1} min={0} max={5} onChange={(v) => set("repairPct", v)} />
              <NumField label="중개보수" unit="% (매수·매도 각)" value={input.brokeragePct} step={0.1} min={0} max={1} onChange={(v) => set("brokeragePct", v)} />
              <NumField label="공시가격 현실화율" unit="%" value={input.realizationPct} step={1} min={30} max={100} onChange={(v) => set("realizationPct", v)} derived={`공시가격 추정 ${eok(r.hold.assessed)} · 실제 공시가격이 있으면 그 비율로 고치십시오`} />
              <NumField label="기회수익률" unit="%" value={input.altReturnPct} step={0.5} min={0} max={20} onChange={(v) => set("altReturnPct", v)} derived="이 돈을 집 대신 다른 데 두면 벌 수 있는 수익률 (예금·채권)" />
            </fieldset>
          </div>

          <div className="uw-results" id="results">
            <div className="answers">
              {answers.map((x) => <div key={x.q}><div className="q">{x.q}</div><div className={`a${x.neg ? " neg" : ""}`}>{x.a}</div><div className="s">{x.s}</div></div>)}
            </div>
            {!canAfford && <div className="notice warn" role="alert">대출과 보증금이 매입 비용을 넘습니다. 자기자본 없이 사는 구조는 계산하지 않습니다.</div>}
            <ul className="notes">{r.warnings.map((w, k) => <li key={k} className="note-warn">{w}</li>)}
              {r.acq.ratePct >= 8 && <li className="note-warn">취득세 중과 {pctv(r.acq.totalPct, 1)}가 적용됩니다 ({r.acq.label}). 무주택으로 살 때보다 {eok(r.acq.amount - input.price * 0.011)}이 더 듭니다.</li>}
              {input.purpose === "jeonse" && r.jeonseStress && <li className="note-warn">역전세: 전세가 {pctv(input.jeonseDropPct, 0)} 하락 시 {eok(r.jeonseStress.drop)}을 만기에 현금으로 돌려줘야 합니다. 이 돈이 없으면 집을 팔거나 대출을 받아야 합니다.</li>}
              {input.purpose === "live" && r.irr !== null && r.breakevenGrowthAltPct !== null && <li className={input.priceGrowthPct >= r.breakevenGrowthAltPct ? "note-ok" : "note-warn"}>지금 가정({pctv(input.priceGrowthPct, 1)}/년)으로는 {yrs}년 뒤 내 돈 기준 연 {pct(r.irr)}입니다. 기회수익률 {pctv(input.altReturnPct, 1)}보다 {input.priceGrowthPct >= r.breakevenGrowthAltPct ? "높습니다" : "낮습니다. 실거주 만족을 빼면 숫자만으로는 임대가 유리합니다"}.</li>}
            </ul>

            <h3>처음에 드는 돈</h3>
            <div className="kpis four">
              <Kpi label="자기자본" value={eok(r.cashNeeded)} sub="매입가 + 취득세 + 중개보수 − 대출 − 보증금" />
              <Kpi label="취득세 등" value={eok(r.acq.amount)} sub={`${r.acq.label} ${pctv(r.acq.totalPct, 2)}`} />
              <Kpi label="대출" value={eok(r.loan)} sub={`${r.cap.binding} 기준 한도 ${eok(r.cap.max)}`} />
              <Kpi label={input.purpose === "live" ? "중개보수" : "보증금 (세입자 돈)"} value={eok(input.purpose === "live" ? input.price * input.brokeragePct / 100 : input.deposit)} sub={input.purpose === "live" ? `${pctv(input.brokeragePct, 1)} 가정` : "만기에 돌려줘야 합니다"} />
            </div>
            {R("acq")}

            <h3>매달 · 매년</h3>
            <div className="table-wrap"><table className="data tight">
              <thead><tr><th>만원</th>{r.years.map((y) => <th key={y.year} className="num">{y.year}년</th>)}</tr></thead>
              <tbody>
                {input.purpose === "rent" && <tr><td>월세 수입</td>{r.years.map((y) => <td key={y.year} className="num">{num(y.income, 0)}</td>)}</tr>}
                <tr><td>(−) 이자</td>{r.years.map((y) => <td key={y.year} className="num">{num(y.interest, 0)}</td>)}</tr>
                <tr><td>(−) 원금 상환</td>{r.years.map((y) => <td key={y.year} className="num">{num(y.principal, 0)}</td>)}</tr>
                <tr><td>(−) 보유세</td>{r.years.map((y) => <td key={y.year} className="num">{num(y.holdTax, 0)}</td>)}</tr>
                <tr><td>(−) 관리 · 수선</td>{r.years.map((y) => <td key={y.year} className="num">{num(y.other, 0)}</td>)}</tr>
                <tr className="total"><td>순현금</td>{r.years.map((y) => <td key={y.year} className="num">{num(y.net, 0)}</td>)}</tr>
                <tr><td>대출 잔액</td>{r.years.map((y) => <td key={y.year} className="num">{num(y.balance, 0)}</td>)}</tr>
              </tbody>
            </table></div>
            <p className="fine">보유세 1년차 {won(r.hold.total, 0)} = 재산세 {won(r.hold.propertyTax, 0)} + 도시지역분 {won(r.hold.urbanTax, 0)} + 지방교육세 {won(r.hold.eduTax, 0)}{r.hold.compTax > 0 ? ` + 종부세 ${won(r.hold.compTax, 0)}` : ""} · {r.hold.note}</p>
            {R("hold")}

            <h3>{yrs}년 뒤 팔면</h3>
            <div className="kpis four">
              <Kpi label="매각가" value={eok(r.salePrice)} sub={`연 ${pctv(input.priceGrowthPct, 1)} 가정`} />
              <Kpi label="양도세" value={eok(r.cgt.tax)} sub={r.cgt.label} tone={r.cgt.tax > 0 ? undefined : undefined} />
              <Kpi label="손에 남는 돈" value={eok(r.saleNet)} sub="매각가 − 중개보수 − 양도세 − 대출잔액 − 보증금 반환" />
              <Kpi label="내 돈 기준 연 수익률" value={pct(r.irr)} sub={`배수 ${r.multiple === null ? "–" : `${num(r.multiple, 2)}x`} · 기회수익률 ${pctv(input.altReturnPct, 1)}`} tone={r.irr !== null && r.irr < 0 ? "neg" : undefined} />
            </div>
            {R("cgt")}
            <p className="fine">양도차익 {eok(r.cgt.gain)} 중 비과세 {eok(r.cgt.exempt)} · 장기보유특별공제 {pctv(r.cgt.ltDeductPct, 0)} · 실효세율 {pctv(r.cgt.taxRatePct, 1)}</p>

            <h3>검산</h3>
            <ul className="checks">{r.checks.map((k) => <li key={k.label} className={k.pass === null ? "na" : k.pass ? "pass" : "fail"}><b>{k.pass === null ? "N/A" : k.pass ? "PASS" : "FAIL"}</b><span>{k.label}<small>{k.detail}</small></span></li>)}</ul>
            <p className="fine">세율과 대출 규제는 자주 바뀝니다. 각 항목의 기준일과 근거를 확인하고, 실제 신고와 대출 심사는 과세관청과 금융기관의 확정값을 따르십시오. 이 도구는 특정 주택의 매수를 권하지 않으며, 입력한 가정에서의 계산 결과만 보여줍니다.</p>
          </div>
        </div>
      </section>
      <a className={`mbar${r.totalNet < 0 ? " v-bad" : ""}`} href="#results" aria-label="결과로 이동"><span><i>월</i>{r.monthlyNet >= 0 ? "+" : "−"}{num(Math.abs(r.monthlyNet), 0)}</span><span><i>{yrs}년</i>{signedEok(r.totalNet)}</span><span className="mbar-go">결과 ↑</span></a>
    </main>
  );
}
