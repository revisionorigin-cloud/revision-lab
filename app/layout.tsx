import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { snapshotMonth } from "@/components/DeskStrip";
import { getRates } from "@/lib/connectors/ecos";

export const metadata: Metadata = {
  title: { default: "RE:LAB · 부동산 사업성 분석", template: "%s · RE:LAB" },
  description: "RE:VISION의 사업성 분석 도구. 국토교통부 실거래가와 한국은행 금리에서 출발해 기관투자자의 통매입 검토와 개인의 집 한 채 검토를 각자의 언어로 계산합니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#070C17" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const rates = await getRates().catch(() => null);
  const snap = snapshotMonth();
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,100..700;1,100..700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a className="skip" href="#main">본문으로</a>
        <Header rates={rates} />
        {children}
        <footer className="foot">
          <div className="sig">
            <span className="sig-mark"><span className="wm-re">RE</span><span className="wm-colon">:</span><span className="wm-vision">VISION</span></span>
            <span className="sig-rule" aria-hidden="true" />
            <span className="sig-rule-2" aria-hidden="true" />
            <span className="sig-tag">REAL ESTATE, RE-VISIONED</span>
          </div>
          <div className="foot-cols">
            <span>주식회사 리비전</span>
            <span>데이터 · 국토교통부 실거래가{snap ? ` ${snap}` : ""} · 한국은행 ECOS{rates ? ` ${rates.fetchedAt}` : ""}</span>
            <span>정보 제공 도구이며 투자 권유가 아닙니다</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
