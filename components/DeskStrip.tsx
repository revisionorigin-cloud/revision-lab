import "server-only";
import Link from "next/link";
import { computeMarket, type Market } from "@/lib/connectors/market";
import { loadRegion, snapshotMeta } from "@/lib/connectors/source";
import { ASSET_LABEL, type Asset } from "@/lib/connectors/types";

/**
 * 랜딩 시세 띠(DESIGN_SPEC §5.1). /api/desk 와 같은 4지역을 lib에서 직접 계산한다(자기 서버로 fetch하지 않음).
 * 열마다 매매 단가·환산월세·총수익률. 오피스텔 열은 /pro, 아파트 열은 /home 으로 링크(§0).
 * 홈페이지에 합칠 때 ticker로 재사용할 수 있도록 경계를 독립시켰다.
 */
const WATCH: { asset: Asset; code: string; label: string }[] = [
  { asset: "offi", code: "11560", label: "영등포구" },
  { asset: "offi", code: "11680", label: "강남구" },
  { asset: "apt", code: "11440", label: "마포구" },
  { asset: "apt", code: "11680", label: "강남구" },
];

const DASH = "–";
const num = (v: number | null | undefined, d: number) =>
  v == null || !Number.isFinite(v) ? DASH : v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** 스냅샷 최신 월(YYYY-MM). 랜딩 기준일·푸터 데이터 줄에 쓴다. */
export function snapshotMonth(): string {
  const tos = [...snapshotMeta("offi"), ...snapshotMeta("apt")].map((m) => m.to).filter(Boolean).sort();
  const last = tos[tos.length - 1];
  return last ? last.slice(0, 7) : "";
}

export async function DeskStrip() {
  const cols = await Promise.all(
    WATCH.map(async (w): Promise<{ w: typeof w; m: Market | null }> => {
      try {
        return { w, m: computeMarket(await loadRegion(w.asset, w.code)) };
      } catch {
        return { w, m: null };
      }
    }),
  );
  const month = snapshotMonth();
  return (
    <section className="desk-strip" aria-labelledby="desk-strip-h">
      <h2 id="desk-strip-h" className="sr-only">표본 지역 시세</h2>
      <div className="kpis four">
        {cols.map(({ w, m }) => {
          const href = w.asset === "offi" ? `/pro?asset=offi&code=${w.code}` : `/home?asset=apt&code=${w.code}`;
          return (
            <Link key={`${w.asset}-${w.code}`} href={href} className="kpi">
              <span className="kpi-label">{ASSET_LABEL[w.asset]} · {w.label}</span>
              <span className="kpi-value">{num(m?.kpi.pricePerPy, 0)}<small className="u">만원/평</small></span>
              <dl>
                <dt>환산월세</dt>
                <dd>{num(m?.kpi.effRentPerPy, 1)}<small className="u">만원/평·월</small></dd>
                <dt>총수익률</dt>
                <dd>{num(m?.kpi.grossYieldPct, 2)}<small className="u">%</small></dd>
              </dl>
              <span className="desk-go">{w.asset === "offi" ? "Pro 열기" : "Home 열기"}</span>
            </Link>
          );
        })}
      </div>
      <p className="desk-cap">표본 지역 4곳 · 국토교통부 실거래가{month ? ` ${month}` : ""} · 매매 단가는 전용평당 중앙값</p>
    </section>
  );
}
