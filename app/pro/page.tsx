import { Suspense } from "react";
import type { Metadata } from "next";
import ProApp from "@/components/ProApp";
import "../pro.css";

export const metadata: Metadata = {
  title: "Model Desk Pro",
  description: "기관투자자의 통매입 사업성 분석. 국토교통부 실거래가와 한국은행 금리로 가정을 채우고 Levered IRR · DSCR · 한계선 · 검산을 계산합니다.",
};

// ProApp은 useSearchParams()로 asset·code·band·key를 읽으므로 Suspense 안에 둔다 (§5.3 URL 시드).
export default function Page() {
  return (
    <Suspense fallback={<div className="boot">RE:LAB</div>}>
      <ProApp />
    </Suspense>
  );
}
