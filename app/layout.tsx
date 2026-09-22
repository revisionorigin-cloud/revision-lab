import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "RE:LAB · 부동산 사업성 분석",
  description: "RE:VISION의 실무 도구. 국토교통부 실거래가와 한국은행 금리를 실시간으로 불러와 기관투자자용 사업성 분석과 개인 매입 검토를 한 화면에서 합니다.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#070C17" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Jost:wght@250;300;400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Header />
        {children}
        <footer className="foot">
          <div><span className="brand-logo"><span className="re">RE</span><span className="colon">:</span><span className="vision">VISION</span></span> · RE:LAB · 실무 도구</div>
          <div>데이터: 국토교통부 실거래가 · 한국은행 ECOS · 공개 데이터에 기반한 정보 제공 도구이며 투자 권유가 아닙니다</div>
        </footer>
      </body>
    </html>
  );
}
