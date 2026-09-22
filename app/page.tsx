import Link from "next/link";

export default function LabHome() {
  return (
    <main>
      <section className="intro lab-home">
        <p className="eyebrow">RE:LAB · Feasibility</p>
        <h1>부동산 사업성 분석, 한 엔진에서 두 갈래로</h1>
        <p className="intro-lead">
          국토교통부 실거래가와 한국은행 금리를 실시간으로 불러와 가정을 채우고, 그 가정이 시장의 어디에 있는지 표시합니다.
          같은 계산 엔진 위에서 기관투자자의 통매입 검토와 개인의 집 한 채 검토를 각각의 언어로 냅니다.
        </p>
        <div className="lab-grid">
          <Link href="/market" className="lab-card">
            <b>Market Desk</b>
            <strong>시장</strong>
            <span>시군구·자산별 임대료, 매매가, 전월세전환율, 총수익률, 갱신 행태. 모든 지표에 표본 수와 조회일이 붙습니다.</span>
            <em>오피스텔 · 아파트 · 전국 256개 시군구</em>
          </Link>
          <Link href="/pro" className="lab-card">
            <b>Model Desk · Pro</b>
            <strong>기관투자자</strong>
            <span>임대주택 통매입, 오피스, 물류센터. 자본구조와 우선주, 도관 과세, 두 개의 손익분기, 민감도, 검산 공개.</span>
            <em>Levered IRR · DSCR · 한계선 역산 · IC 자료</em>
          </Link>
          <Link href="/home" className="lab-card">
            <b>Model Desk · Home</b>
            <strong>개인</strong>
            <span>아파트·오피스텔 한 채. 살 수 있는지, 매달 얼마가 나가는지, 얼마에 사야 하는지, 팔 때 얼마가 남는지.</span>
            <em>대출 규제 · 취득세 · 보유세 · 양도세 · 갭투자</em>
          </Link>
        </div>
        <p className="fine">RE:VISION 홈페이지와 같은 브랜드 토큰을 씁니다. 도구 경로는 /market · /pro · /home 이고, 홈페이지에 합칠 때 그대로 옮겨 붙습니다.</p>
      </section>
    </main>
  );
}
