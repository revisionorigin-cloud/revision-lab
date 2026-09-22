"use client";

import { useState } from "react";
import { MarketPanel } from "./MarketPanel";
import { useMarket } from "./useMarket";
import type { AreaBand, Asset } from "@/lib/connectors/types";
import { rateOf } from "./useMarket";

export default function MarketApp() {
  const [asset, setAsset] = useState<Asset>("offi");
  const [code, setCode] = useState("11560");
  const [band, setBand] = useState<AreaBand>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { regions, rates, market, loading, error, detail } = useMarket(asset, code, band, selectedKey);
  const baseRate = rateOf(rates, "base");
  return (
    <main>
      <section className="intro">
        <p className="eyebrow">Market Desk</p>
        <h1>시장을 숫자로 읽습니다</h1>
        <p className="intro-lead">국토교통부 실거래가에서 임대료, 매매가, 전월세전환율, 총수익률, 갱신 행태를 계산합니다. 모든 지표에 표본 수와 제외 기준, 조회일이 붙습니다. 이 화면의 요약은 <code>/api/desk</code>로도 나가며, RE:VISION 홈페이지의 시세 ticker가 그대로 읽을 수 있는 형식입니다.</p>
      </section>
      <MarketPanel asset={asset} onAsset={(a) => { setAsset(a); setSelectedKey(null); setBand("all"); }} regions={regions} code={code} band={band} market={market} loading={loading} error={error}
        selectedKey={selectedKey} detail={detail} legalCapPct={baseRate === null ? null : Math.min(10, baseRate + 2)}
        onCode={(c) => { setSelectedKey(null); setCode(c); }} onBand={setBand} onPick={setSelectedKey} />
    </main>
  );
}
