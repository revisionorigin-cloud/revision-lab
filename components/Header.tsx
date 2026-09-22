"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Rates } from "@/lib/connectors/ecos";

const NAV = [
  { href: "/", label: "RE:LAB" },
  { href: "/market", label: "Market" },
  { href: "/pro", label: "Pro" },
  { href: "/home", label: "Home" },
];

/**
 * RE:VISION 헤더. 로고 마크업은 brand-handoff §3 스니펫 그대로.
 * 홈페이지와 합칠 때 NAV 앞에 사이트 5축(Academy · Insight …)을 끼우면 된다.
 */
export function Header() {
  const path = usePathname();
  const [rates, setRates] = useState<Rates | null>(null);
  useEffect(() => {
    fetch("/api/rates").then((r) => r.json()).then(setRates).catch(() => setRates(null));
  }, []);
  return (
    <header className="mast">
      <div className="mast-in">
        <Link className="brand-logo" href="/"><span className="re">RE</span><span className="colon">:</span><span className="vision">VISION</span></Link>
        <span className="brand-sub">Lab</span>
        <nav aria-label="RE:LAB">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={(n.href === "/" ? path === "/" : path.startsWith(n.href)) ? "on" : ""}>{n.label}</Link>
          ))}
        </nav>
        <div className="ticker" aria-label="금리">
          {rates?.rates.map((r) => <span key={r.id}><i>{r.label.replace("한국은행 ", "").replace(" 3년 AA-", " AA-")}</i>{r.value.toFixed(2)}</span>)}
        </div>
      </div>
    </header>
  );
}
