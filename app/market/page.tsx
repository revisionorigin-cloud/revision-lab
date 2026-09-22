"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("@/components/MarketApp"), { ssr: false, loading: () => <div className="boot">RE:LAB</div> });

export default function Page() {
  return <App />;
}
