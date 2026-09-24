import type { Metadata } from "next";
import Link from "next/link";
import { DeskStrip, snapshotMonth } from "@/components/DeskStrip";
import { getRates } from "@/lib/connectors/ecos";

export const metadata: Metadata = { title: { absolute: "RE:LAB · 부동산 사업성 분석 도구" } };

/** 랜딩(DESIGN_SPEC §5.1 · v1.1): 히어로 → 골드 라인 → 기준일 → 시세 띠 → 도구 2행 → 3단계 → 안내. */
export default async function LabHome() {
  const rates = await getRates().catch(() => null);
  const snap = snapshotMonth();
  return (
    <main id="main" tabIndex={-1} className="landing">
      <section className="hero">
        <p className="eyebrow">RE:LAB · MODELLING</p>
        <h1 className="display">부동산 사업성 분석 도구</h1>
        <p className="intro-lead">기관의 통매입 검토와 개인의 집 한 채 검토. 같은 실거래가와 금리에서 출발해 각자의 언어로 답합니다.</p>
        <p className="route">
          펀드·리츠·법인의 통매입 검토는 <Link href="/pro">Pro</Link>, 내 집 한 채는 <Link href="/home">Home</Link>. 시세는 두 도구의 첫 절에 있습니다.
        </p>
        <div className="gold-line" aria-hidden="true" />
        <p className="basis-date">실거래가{snap ? ` ${snap}` : ""} 스냅샷 · 금리 ECOS{rates ? ` ${rates.fetchedAt}` : " 확인 중"}</p>
      </section>

      <DeskStrip />

      <section className="desk-index" aria-label="도구">
        <Link href="/pro" className="desk-row">
          <b className="desk-no">01</b>
          <div>
            <h2>Model Desk Pro</h2>
            <span className="desk-who">기관투자자 · 운용역</span>
          </div>
          <p>임대주택 통매입, 오피스, 물류센터. 자본구조와 우선주, 도관 과세, 원금 보전선과 대주 상환 한계선, 민감도, 검산을 한 화면에 폅니다.</p>
          <span className="desk-keys">Levered IRR · DSCR · 한계선 역산 · 검산</span>
          <span className="desk-open">열기</span>
        </Link>
        <Link href="/home" className="desk-row">
          <b className="desk-no">02</b>
          <div>
            <h2>Model Desk Home</h2>
            <span className="desk-who">개인 · 집 한 채</span>
          </div>
          <p>아파트·오피스텔 한 채. 얼마까지 빌릴 수 있는지, 매달 얼마가 나가는지, 팔 때 얼마가 남는지, 본전이 되는 상승률은 얼마인지를 실거래가와 금리로 계산합니다.</p>
          <span className="desk-keys">대출 한도 · 월 현금 · 5년 뒤 · 본전 상승률</span>
          <span className="desk-open">열기</span>
        </Link>
      </section>

      <ol className="steps" aria-label="사용 순서">
        <li>
          <Link href="/pro#market">
            <b>01</b>
            <strong>지역을 고른다</strong>
            <span>각 도구의 01 시장 절에서 시군구와 면적 구간을 고르면 실거래가로 계산한 시장값이 가정으로 들어갑니다.</span>
          </Link>
        </li>
        <li>
          <Link href="/pro#inputs">
            <b>02</b>
            <strong>가정을 고친다</strong>
            <span>매입 단가, 임대료, 대출 조건을 고칩니다. 고친 값에는 출처와 시장값이 함께 남고 언제든 되돌릴 수 있습니다.</span>
          </Link>
        </li>
        <li>
          <Link href="/pro#audit">
            <b>03</b>
            <strong>결론과 검산을 본다</strong>
            <span>결론 블록이 먼저 바뀌고, 한계선과 민감도, 산식과 검산이 그 아래에 이어집니다.</span>
          </Link>
        </li>
      </ol>

      <p className="fine">두 도구는 같은 실거래가·금리 데이터와 같은 계산식을 씁니다. 결과는 입력한 가정을 계산한 값이며 투자 권유가 아닙니다.</p>
    </main>
  );
}
