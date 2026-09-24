"use client";

import { useCallback, useEffect, useState } from "react";
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

/**
 * 지역·자산·면적 구간에 따라 시장 데이터를 가져온다. 응답이 왔을 때만 상태를 바꾸고 로딩은 키 비교로 파생한다.
 * 반환: regions(null이면 아직·실패) · regionsError · rates · market · loading · error · detail · detailError · retry(다시 시도).
 * retry는 조회 키에 시도 횟수를 섞어 같은 조건을 다시 요청한다(§4.13 오류 notice [다시 시도]).
 */
export function useMarket(asset: Asset, code: string, band: AreaBand, selectedKey: string | null, onLoaded?: (m: Market) => void) {
  const [regions, setRegions] = useState<RegionsPayload | null>(null);
  const [regionsError, setRegionsError] = useState(false);
  const [rates, setRates] = useState<Rates | null>(null);
  const [mk, setMk] = useState<Loaded<Market>>({ key: "", data: null, error: null });
  const [dt, setDt] = useState<Loaded<ComplexDetail>>({ key: "", data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    getJson<RegionsPayload>("/api/regions").then((r) => { setRegions(r); setRegionsError(false); }).catch(() => { setRegions(null); setRegionsError(true); });
    getJson<Rates>("/api/rates").then(setRates).catch(() => setRates(null));
  }, [attempt]);

  const marketKey = `${asset}|${code}|${band}|${attempt}`;
  useEffect(() => {
    const ac = new AbortController();
    const key = `${asset}|${code}|${band}|${attempt}`;
    getJson<Market>(`/api/market?v=${API_V}&asset=${asset}&code=${code}&band=${band}`, ac.signal)
      .then((m) => { setMk({ key, data: m, error: null }); onLoaded?.(m); })
      .catch((e: unknown) => { if (!ac.signal.aborted) setMk({ key, data: null, error: e instanceof Error ? e.message : "조회에 실패했습니다." }); });
    return () => ac.abort();
    // onLoaded는 최신 클로저를 쓰되 재조회 조건에서는 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, code, band, attempt]);

  const detailKey = selectedKey ? `${asset}|${code}|${selectedKey}|${attempt}` : "";
  useEffect(() => {
    if (!selectedKey) return;
    const ac = new AbortController();
    const key = `${asset}|${code}|${selectedKey}|${attempt}`;
    getJson<ComplexDetail>(`/api/complex?v=${API_V}&asset=${asset}&code=${code}&key=${encodeURIComponent(selectedKey)}`, ac.signal)
      .then((d) => setDt({ key, data: d, error: null }))
      .catch((e: unknown) => { if (!ac.signal.aborted) setDt({ key, data: null, error: e instanceof Error ? e.message : "단지를 찾지 못했습니다." }); });
    return () => ac.abort();
  }, [asset, code, selectedKey, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const loading = mk.key !== marketKey;
  const detailReady = detailKey !== "" && dt.key === detailKey;
  return {
    regions, regionsError, rates,
    market: mk.data, loading, error: loading ? null : mk.error,
    detail: detailReady ? dt.data : null,
    detailError: detailReady ? dt.error : null,
    retry,
  };
}

export const rateOf = (rates: Rates | null, id: string) => rates?.rates.find((r) => r.id === id)?.value ?? null;
