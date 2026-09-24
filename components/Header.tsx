"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { Rates } from "@/lib/connectors/ecos";

/** RE:VISION 홈페이지 주소. 홈페이지에 합칠 때 절대 주소로 바꾼다. 지금은 RE:LAB 랜딩. */
export const BRAND_HOME = "/";

/** readout 로딩 전 자리표시(U+2013). 값이 비거나 이 문자면 aria-busy. */
const DASH = "–";

const SHORT_LABEL: Record<string, string> = { base: "기준금리", cd91: "CD 91일", ktb3: "국고채 3년", corpAA: "회사채 AA-" };

const PRODUCTS = [
  { href: "/pro", latin: "MODEL DESK PRO", ko: "기관" },
  { href: "/home", latin: "MODEL DESK HOME", ko: "개인" },
] as const;

/**
 * 2단 마스트헤드(DESIGN_SPEC §4.1). 1단 .mast: 브랜드 락업 + 금리 티커(dl, 링크 아님).
 * 2단 .subnav: 제품 nav 2개 + 페이지가 <SubNav>로 채우는 슬롯(#subnav-slot).
 * rates는 layout.tsx가 서버에서 getRates()로 받아 넘긴다. null이면 「금리 불러오는 중」.
 */
export function Header({ rates }: { rates: Rates | null }) {
  const path = usePathname() ?? "";
  return (
    <header className="head">
      <div className="mast">
        <div className="mast-in">
          <Link className="brand-lock" href={BRAND_HOME}>
            <span className="wordmark"><span className="wm-re">RE</span><span className="wm-colon">:</span><span className="wm-vision">VISION</span></span>
            <i className="brand-bar" aria-hidden="true" />
            <span className="brand-sub">LAB</span>
          </Link>
          <Ticker rates={rates} />
        </div>
      </div>
      <div className="subnav">
        <div className="subnav-in">
          <nav className="prod-nav" aria-label="제품">
            {PRODUCTS.map((p) => {
              const on = path === p.href || path.startsWith(`${p.href}/`);
              return (
                <Link key={p.href} href={p.href} aria-current={on ? "page" : undefined}>
                  <b>{p.latin}</b>
                  <span>{p.ko}</span>
                </Link>
              );
            })}
          </nav>
          <div id="subnav-slot" className="subnav-page" />
        </div>
      </div>
    </header>
  );
}

function Ticker({ rates }: { rates: Rates | null }) {
  if (!rates) return <p className="ticker-empty">금리 불러오는 중</p>;
  return (
    <dl className={rates.live ? "ticker" : "ticker stale"} aria-label="금리">
      {rates.rates.map((r) => (
        <div key={r.id} title={`${r.label} · ${r.asOf}`}>
          <dt>{SHORT_LABEL[r.id] ?? r.label}</dt>
          <dd>{r.value.toFixed(2)}<small>%</small></dd>
        </div>
      ))}
      <div>
        <dt className="sr-only">출처</dt>
        <dd className="ticker-asof">ECOS {rates.fetchedAt}</dd>
      </div>
    </dl>
  );
}

export type SubNavItem = { id: string; no: string; label: string };
export type SubNavReadout = { label: string; value: string; href: string };
export type SubNavTone = "ok" | "warn" | "neg" | null;
export type SubNavProps = { items: SubNavItem[]; basis?: string; readouts?: SubNavReadout[]; tone?: SubNavTone };

const noSubscribe = () => () => {};
const getSlot = () => document.getElementById("subnav-slot");
const getServerSlot = () => null;

/**
 * 서브내비 채움(§4.1). 헤더 2단의 #subnav-slot 에 포털로 들어간다(같은 sticky 컨테이너).
 * items: 절 id·번호·제목. IntersectionObserver(rootMargin -40% 0px -55% 0px)로 현재 절에 .on.
 * readouts: 3개 readout(값이 DASH면 aria-busy). tone: 판정 막대(null이면 --rule-2).
 * ≤860에서는 CSS가 절 내비·readout을 숨기고 하단 바(.mbar)가 대신한다.
 */
export function SubNav({ items, basis, readouts, tone }: SubNavProps) {
  // 헤더 슬롯은 마운트 뒤에만 존재한다(SSR에서는 null → 렌더 없음).
  const slot = useSyncExternalStore(noSubscribe, getSlot, getServerSlot);
  const [active, setActive] = useState("");
  const key = items.map((i) => i.id).join("|");

  useEffect(() => {
    const ids = key ? key.split("|") : [];
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).id, e.isIntersecting);
        const first = ids.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]);

  if (!slot) return null;
  return createPortal(
    <>
      <nav className="subnav-sec" aria-label="절">
        {items.map((i) => {
          const on = i.id === active;
          return (
            <a key={i.id} href={`#${i.id}`} className={on ? "on" : undefined} aria-current={on ? "location" : undefined}>
              {i.no ? `${i.no} ${i.label}` : i.label}
            </a>
          );
        })}
      </nav>
      {basis ? <span className="subnav-basis" title={basis}>{basis}</span> : null}
      {readouts && readouts.length > 0 ? (
        <div className="ro-group">
          <i className={tone ? `tone ${tone}` : "tone"} aria-hidden="true" />
          {readouts.map((r) => {
            const busy = !r.value || r.value === DASH;
            return (
              <a key={r.label} className="ro" href={r.href}>
                <i>{r.label}</i>
                <b aria-busy={busy ? true : undefined}>{busy ? DASH : r.value}</b>
              </a>
            );
          })}
        </div>
      ) : null}
    </>,
    slot,
  );
}
