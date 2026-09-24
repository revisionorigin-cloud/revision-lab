import type { Metadata } from "next";
import { Suspense } from "react";
import HomeApp from "@/components/HomeApp";
import "../home.css";

export const metadata: Metadata = {
  title: "Model Desk Home",
  description: "집 한 채 매입 검토. 대출 한도, 매달 나가는 돈, 팔 때 남는 돈, 본전이 되는 상승률을 실거래가와 금리로 계산합니다.",
};

/** /home (DESIGN_SPEC §5.4). HomeApp은 useSearchParams로 asset·code·band·key를 읽으므로 Suspense 안에 둔다. */
export default function Page() {
  return (
    <Suspense fallback={<div className="boot">RE:LAB</div>}>
      <HomeApp />
    </Suspense>
  );
}
