import { NextResponse, type NextRequest } from "next/server";
import { computeMarket } from "@/lib/connectors/market";
import { loadRegion } from "@/lib/connectors/source";
import { BANDS_BY_ASSET, isAsset, type AreaBand } from "@/lib/connectors/types";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const asset = q.get("asset") ?? "offi";
  const code = q.get("code") ?? "";
  if (!isAsset(asset)) return NextResponse.json({ error: "asset은 offi 또는 apt 입니다." }, { status: 400 });
  if (!/^\d{5}$/.test(code)) return NextResponse.json({ error: "시군구 코드는 숫자 5자리입니다." }, { status: 400 });
  const bandParam = q.get("band") ?? "all";
  const band = (BANDS_BY_ASSET[asset].some((b) => b.id === bandParam) ? bandParam : "all") as AreaBand;
  try {
    const data = await loadRegion(asset, code);
    return NextResponse.json(computeMarket(data, band), { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회에 실패했습니다." }, { status: 502 });
  }
}
