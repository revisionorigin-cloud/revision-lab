"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("@/components/ProApp"), { ssr: false, loading: () => <div className="boot">RE:LAB</div> });

export default function Page() {
  return <App />;
}
