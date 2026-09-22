import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeMarket } from "@/lib/connectors/market";
import { loadRegion, snapshotCodes } from "@/lib/connectors/source";

// 스냅샷 실데이터로 지표가 상식 범위에 드는지 확인한다 (회귀 방지용 넓은 범위)
describe("스냅샷 시장 지표", () => {
  for (const asset of ["offi", "apt"] as const) for (const code of snapshotCodes(asset)) {
    it(`${asset} ${code} 상식 범위`, async () => {
      delete process.env.DATA_GO_KR_KEY;
      const m = computeMarket(await loadRegion(asset, code));
      if (process.env.PROFILE) appendFileSync(process.env.PROFILE, JSON.stringify({ code, name: m.meta.name, conv: m.conv, kpi: m.kpi, counts: m.counts }) + "\n");
      expect(m.conv.ratePct).toBeGreaterThan(3);
      expect(m.conv.ratePct).toBeLessThan(9);
      expect(m.kpi.grossYieldPct!).toBeGreaterThan(2);
      expect(m.kpi.grossYieldPct!).toBeLessThan(10);
      expect(m.series.length).toBeGreaterThanOrEqual(20);
      expect(m.complexes.length).toBeGreaterThan(20);
    });
  }
});
