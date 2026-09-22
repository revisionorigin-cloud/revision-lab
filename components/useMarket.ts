"use client";

import { useEffect, useState } from "react";
import type { RegionsPayload } from "./MarketPanel";
import type { Rates } from "@/lib/connectors/ecos";
import type { ComplexDetail, Market } from "@/lib/connectors/market";
import type { AreaBand, Asset } from "@/lib/connectors/types";

const API_V = "1";

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `요청 실패 (${res.status})`);
  return body;
}

type Loaded<T> = { key: string; data: T | null; error: string | null };

/** 지역·자산·면적 구간에 따라 시장 데이터를 가져온다. 응답이 왔을 때만 상태를 바꾸고 로딩은 키 비교로 파생한다 */
export function useMarket(asset: Asset, code: string, band: AreaBand, selectedKey: string | null, onLoaded?: (m: Market) => void) {
  const [regions, setRegions] = useState<RegionsPayload | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [mk, setMk] = useState<Loaded<Market>>({ key: "", data: null, error: null });
  const [dt, setDt] = useState<Loaded<ComplexDetail>>({ key: "", data: null, error: null });

  useEffect(() => {
    getJson<RegionsPayload>("/api/regions").then(setRegions).catch(() => setRegions(null));
    getJson<Rates>("/api/rates").then(setRates).catch(() => setRates(null));
  }, []);

  const marketKey = `${asset}|${code}|${band}`;
  useEffect(() => {
    const ac = new AbortController();
    getJson<Market>(`/api/market?v=${API_V}&asset=${asset}&code=${code}&band=${band}`, ac.signal)
      .then((m) => { setMk({ key: `${asset}|${code}|${band}`, data: m, error: null }); onLoaded?.(m); })
      .catch((e: unknown) => { if (!ac.signal.aborted) setMk({ key: `${asset}|${code}|${band}`, data: null, error: e instanceof Error ? e.message : "조회에 실패했습니다." }); });
    return () => ac.abort();
    // onLoaded는 최신 클로저를 쓰되 재조회 조건에서는 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, code, band]);

  const detailKey = selectedKey ? `${asset}|${code}|${selectedKey}` : "";
  useEffect(() => {
    if (!selectedKey) return;
    const ac = new AbortController();
    getJson<ComplexDetail>(`/api/complex?v=${API_V}&asset=${asset}&code=${code}&key=${encodeURIComponent(selectedKey)}`, ac.signal)
      .then((d) => setDt({ key: `${asset}|${code}|${selectedKey}`, data: d, error: null }))
      .catch(() => { if (!ac.signal.aborted) setDt({ key: `${asset}|${code}|${selectedKey}`, data: null, error: "단지를 찾지 못했습니다." }); });
    return () => ac.abort();
  }, [asset, code, selectedKey]);

  const loading = mk.key !== marketKey;
  return {
    regions, rates,
    market: mk.data, loading, error: loading ? null : mk.error,
    detail: detailKey !== "" && dt.key === detailKey ? dt.data : null,
  };
}

export const rateOf = (rates: Rates | null, id: string) => rates?.rates.find((r) => r.id === id)?.value ?? null;
