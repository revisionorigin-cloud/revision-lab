import "server-only";
import regionsJson from "@/data/regions.json";
import offiIndex from "@/data/snapshot/offi/index.json";
import aptIndex from "@/data/snapshot/apt/index.json";
import { fetchLiveRegion, hasDataGoKey } from "./datago";
import type { Asset, Complex, RegionData, RentDeal, TradeDeal } from "./types";

export type Sido = { code: string; name: string; sgg: { code: string; name: string }[] };
export const REGIONS = regionsJson as Sido[];

type SnapshotFile = {
  meta: { code: string; name: string; asset: string; source: string; from: string; to: string; fetchedAt: string };
  complexes: [string, string, string, string, number][];
  rent: number[][];
  trade: number[][];
};
type SnapshotMeta = { code: string; name: string; from: string; to: string; fetchedAt: string; rentCount: number; tradeCount: number };

// 정적 import 맵. 배포 번들에 확실히 포함되도록 경로를 문자열 리터럴로 둔다
const SNAPSHOTS: Record<Asset, Record<string, () => Promise<unknown>>> = {
  offi: {
    "11440": () => import("@/data/snapshot/offi/11440.json"),
    "11560": () => import("@/data/snapshot/offi/11560.json"),
    "11680": () => import("@/data/snapshot/offi/11680.json"),
  },
  apt: {
    "11440": () => import("@/data/snapshot/apt/11440.json"),
    "11560": () => import("@/data/snapshot/apt/11560.json"),
    "11680": () => import("@/data/snapshot/apt/11680.json"),
  },
};

export const snapshotCodes = (asset: Asset) => Object.keys(SNAPSHOTS[asset]);
export const snapshotMeta = (asset: Asset) => (asset === "apt" ? aptIndex : offiIndex) as SnapshotMeta[];

export function regionName(code: string): string | null {
  for (const s of REGIONS) {
    const g = s.sgg.find((x) => x.code === code);
    if (g) return `${s.name} ${g.name}`;
  }
  return null;
}

async function loadSnapshot(asset: Asset, code: string, note?: string): Promise<RegionData | null> {
  const loader = SNAPSHOTS[asset][code];
  if (!loader) return null;
  const mod = (await loader()) as { default?: SnapshotFile } & SnapshotFile;
  const f = mod.default ?? mod;
  const complexes: Complex[] = f.complexes.map(([name, dong, jibun, road, buildYear]) => ({
    key: `${dong}|${jibun}|${name}`, name, dong, jibun, road, buildYear,
  }));
  const rent: RentDeal[] = f.rent.map((r) => ({
    cx: r[0], area: r[1], ymd: r[2], deposit: r[3], rent: r[4], floor: r[5],
    ctype: r[6] as 0 | 1 | 2, rrr: r[7] as 0 | 1, prevDeposit: r[8], prevRent: r[9],
  }));
  const trade: TradeDeal[] = f.trade.map((t) => ({
    cx: t[0], area: t[1], ymd: t[2], price: t[3], floor: t[4], canceled: t[5] as 0 | 1,
  }));
  return { meta: { ...f.meta, assetId: asset, mode: "snapshot", note }, complexes, rent, trade };
}

/**
 * 인증키가 있으면 OpenAPI를 직접 호출한다. 키가 없거나 호출이 실패하면(활용신청이 안 된 API 포함)
 * 같은 기관의 공개 CSV로 만든 스냅샷으로 대체하고, 그 사실을 meta.note 에 남긴다.
 */
export async function loadRegion(asset: Asset, code: string): Promise<RegionData> {
  const name = regionName(code);
  if (!name) throw new Error("알 수 없는 시군구 코드입니다.");
  if (hasDataGoKey()) {
    try {
      return await fetchLiveRegion(asset, code, name);
    } catch (e) {
      const snap = await loadSnapshot(asset, code, `OpenAPI 호출 실패로 스냅샷을 표시합니다 (${e instanceof Error ? e.message : "오류"}).`);
      if (snap) return snap;
      throw e;
    }
  }
  const snap = await loadSnapshot(asset, code, "공공데이터포털 인증키가 설정되지 않아 스냅샷을 표시합니다.");
  if (snap) return snap;
  throw new Error("이 지역은 실시간 조회 전용입니다. 서버에 공공데이터포털 인증키(DATA_GO_KR_KEY)를 설정하면 전국 시군구를 조회할 수 있습니다.");
}
