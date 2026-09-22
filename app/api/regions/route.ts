import { NextResponse, type NextRequest } from "next/server";
import { hasDataGoKey } from "@/lib/connectors/datago";
import { REGIONS, snapshotMeta } from "@/lib/connectors/source";

export async function GET(req: NextRequest) {
  void req.nextUrl.search; // 요청 시점에 평가한다. 빌드 때 환경변수 상태가 굳지 않게
  return NextResponse.json(
    { live: hasDataGoKey(), regions: REGIONS, snapshots: { offi: snapshotMeta("offi"), apt: snapshotMeta("apt") } },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
