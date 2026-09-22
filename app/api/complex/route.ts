import { NextResponse, type NextRequest } from "next/server";
import { complexDetail } from "@/lib/connectors/market";
import { loadRegion } from "@/lib/connectors/source";
import { isAsset } from "@/lib/connectors/types";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const asset = q.get("asset") ?? "offi";
  const code = q.get("code") ?? "";
  const key = q.get("key") ?? "";
  if (!isAsset(asset) || !/^\d{5}$/.test(code) || !key) return NextResponse.json({ error: "asset, code, key가 필요합니다." }, { status: 400 });
  try {
    const detail = complexDetail(await loadRegion(asset, code), key);
    if (!detail) return NextResponse.json({ error: "단지를 찾지 못했습니다." }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "조회에 실패했습니다." }, { status: 502 });
  }
}
