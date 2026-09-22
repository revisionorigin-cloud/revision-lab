import { NextResponse, type NextRequest } from "next/server";
import { getRates } from "@/lib/connectors/ecos";
import { computeMarket } from "@/lib/connectors/market";
import { loadRegion } from "@/lib/connectors/source";
import { ASSET_LABEL, type Asset } from "@/lib/connectors/types";

export const maxDuration = 60;

/**
 * Market Desk 요약. RE:VISION 홈페이지의 data/market.json 과 같은 모양(groups → items{name,value,delta,dir})으로 내보낸다.
 * 홈페이지 ticker가 이 주소를 읽으면 수동 갱신이 실시간으로 바뀐다.
 */
const WATCH: { asset: Asset; code: string; label: string }[] = [
  { asset: "offi", code: "11560", label: "영등포구" },
  { asset: "offi", code: "11680", label: "강남구" },
  { asset: "apt", code: "11440", label: "마포구" },
  { asset: "apt", code: "11680", label: "강남구" },
];

const fmt = (v: number | null, d: number, unit = "") => (v == null || !Number.isFinite(v) ? "–" : `${v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d })}${unit}`);
const delta = (v: number | null, unit = "%") => (v == null ? { delta: "—" } : { delta: `${v > 0 ? "▲" : v < 0 ? "▼" : "—"} ${Math.abs(v).toFixed(1)}${unit}`, dir: v > 0 ? "up" : v < 0 ? "dn" : undefined });

export async function GET(req: NextRequest) {
  void req.nextUrl.search;
  const rates = await getRates();
  const groups: { label: string; items: Record<string, string | undefined>[] }[] = [];
  for (const w of WATCH) {
    try {
      const m = computeMarket(await loadRegion(w.asset, w.code));
      groups.push({
        label: `${ASSET_LABEL[w.asset]} · ${w.label} · ${m.meta.to.slice(0, 7)}`,
        items: [
          { name: "매매 단가 (전용평)", value: fmt(m.kpi.pricePerPy, 0, "만"), ...delta(m.kpi.priceYoYPct) },
          { name: "환산월세 (전용평·월)", value: fmt(m.kpi.effRentPerPy, 1, "만"), ...delta(m.kpi.rentYoYPct) },
          { name: "총수익률", value: fmt(m.kpi.grossYieldPct, 2, "%"), delta: "—" },
          { name: "전월세전환율", value: fmt(m.conv.ratePct, 2, "%"), delta: "—" },
          { name: "신규−갱신 격차", value: fmt(m.kpi.gapPct, 1, "%"), delta: "—" },
        ],
      });
    } catch { /* 지역 하나가 실패해도 나머지는 낸다 */ }
  }
  groups.push({
    label: `금리 · 한국은행 ECOS ${rates.fetchedAt}`,
    items: rates.rates.map((r) => ({ name: r.label, value: `${r.value.toFixed(2)}%`, delta: r.asOf })),
  });
  return NextResponse.json({ updatedAt: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), source: "RE:LAB Market Desk", groups }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400", "Access-Control-Allow-Origin": "*" },
  });
}
