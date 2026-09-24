"use client";

import { useCallback, useEffect, useState } from "react";
import type { RegionsPayload } from "./MarketPanel";
import type { Rates } from "@/lib/connectors/ecos";
import type { ComplexDetail, Market } from "@/lib/connectors/market";
import type { AreaBand, Asset } from "@/lib/connectors/types";

const API_V = "1";

/** API가 거절한 응답. status와 서버 원문(message)을 함께 든다 */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "HttpError";
    this.status = status;
  }
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  let body: (T & { error?: string }) | null = null;
  try { body = (await res.json()) as T & { error?: string }; } catch { body = null; }
  if (!res.ok) throw new HttpError(res.status, body?.error ?? `요청 실패 (${res.status})`);
  if (body === null) throw new HttpError(res.status, "응답을 해석하지 못했습니다.");
  return body;
}

/** 서버 원문 중 「스냅샷에 없는 지역」을 뜻하는 lib/connectors/source.ts 문구 */
const SNAPSHOT_ONLY = /실시간 조회 전용|DATA_GO_KR_KEY/;

/**
 * 오류를 화면 문구로 바꾼다. lib 원문에는 개발 메타(환경변수명)와 「실시간」 같은 금칙어가 있으므로 그대로 내보내지 않는다(§8.21).
 * text: 사용자 문구(스냅샷에 없는 지역 · 그 외는 상태코드만) · raw: 원문(오류 notice small의 title 속성에만 둔다).
 */
export function describeError(e: unknown): { text: string; raw: string } {
  if (e instanceof HttpError) {
    if (SNAPSHOT_ONLY.test(e.message)) return { text: "이 지역은 공개 스냅샷에 없습니다. 목록의 시군구를 고르십시오.", raw: e.message };
    return { text: e.status >= 400 ? `서버 응답 ${e.status}` : "응답을 해석하지 못했습니다.", raw: e.message };
  }
  return { text: "네트워크 연결을 확인하십시오.", raw: e instanceof Error ? e.message : String(e) };
}

type Loaded<T> = { key: string; data: T | null; error: string | null; raw: string | null };

/**
 * 지역·자산·면적 구간에 따라 시장 데이터를 가져온다. 응답이 왔을 때만 상태를 바꾸고 로딩은 키 비교로 파생한다.
 * 반환: regions(null이면 아직·실패) · regionsError · rates · market · loading · error · errorRaw · detail · detailError · detailErrorRaw · retry(다시 시도).
 * error·detailError는 describeError를 거친 화면 문구, errorRaw·detailErrorRaw는 서버 원문(small title 전용).
 * retry는 조회 키에 시도 횟수를 섞어 같은 조건을 다시 요청한다(§4.13 오류 notice [다시 시도]).
 */
export function useMarket(asset: Asset, code: string, band: AreaBand, selectedKey: string | null, onLoaded?: (m: Market) => void) {
  const [regions, setRegions] = useState<RegionsPayload | null>(null);
  const [regionsError, setRegionsError] = useState(false);
  const [rates, setRates] = useState<Rates | null>(null);
  const [mk, setMk] = useState<Loaded<Market>>({ key: "", data: null, error: null, raw: null });
  const [dt, setDt] = useState<Loaded<ComplexDetail>>({ key: "", data: null, error: null, raw: null });
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
      .then((m) => { setMk({ key, data: m, error: null, raw: null }); onLoaded?.(m); })
      .catch((e: unknown) => { if (!ac.signal.aborted) { const d = describeError(e); setMk({ key, data: null, error: d.text, raw: d.raw }); } });
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
      .then((d) => setDt({ key, data: d, error: null, raw: null }))
      .catch((e: unknown) => { if (!ac.signal.aborted) { const d = describeError(e); setDt({ key, data: null, error: d.text, raw: d.raw }); } });
    return () => ac.abort();
  }, [asset, code, selectedKey, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const loading = mk.key !== marketKey;
  const detailReady = detailKey !== "" && dt.key === detailKey;
  return {
    regions, regionsError, rates,
    market: mk.data, loading,
    error: loading ? null : mk.error,
    errorRaw: loading ? null : mk.raw,
    detail: detailReady ? dt.data : null,
    detailError: detailReady ? dt.error : null,
    detailErrorRaw: detailReady ? dt.raw : null,
    retry,
  };
}

export const rateOf = (rates: Rates | null, id: string) => rates?.rates.find((r) => r.id === id)?.value ?? null;
