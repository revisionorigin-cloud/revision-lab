"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { num } from "@/lib/format";
import { neg } from "./fields";

/**
 * 컨테이너 실제 폭(px)으로 그린다. 모바일에서 글자가 같이 줄어들지 않게 한다.
 * 첫 폭은 레이아웃 직후 동기적으로 읽는다. ResizeObserver 알림은 렌더 프레임에 실려 오므로
 * 프레임이 멈춘 탭(백그라운드·미리보기 패널·인쇄)에서는 늦게 오거나 오지 않는다.
 * beforeprint·afterprint·orientationchange·resize 에서 다시 잰다. beforeprint는 인쇄 레이아웃이
 * 적용되기 전에 오므로 화면 폭을 읽는다. 인쇄 미디어가 실제로 켜진 뒤(matchMedia("print") change)
 * 한 번 더 재고, 그래도 재측정이 늦는 경우(Page.printToPDF처럼 스크립트가 끼어들 틈이 없는 인쇄)는
 * svg viewBox + width 100%(SVG_FIT)가 컨테이너 폭에 비율대로 맞춘다.
 */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setW(Math.round(el.getBoundingClientRect().width));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(Math.round(el.getBoundingClientRect().width));
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
      ro.observe(el);
    }
    const evs = ["beforeprint", "afterprint", "orientationchange", "resize"] as const;
    evs.forEach((ev) => window.addEventListener(ev, measure));
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    mq?.addEventListener("change", measure);
    return () => { ro?.disconnect(); evs.forEach((ev) => window.removeEventListener(ev, measure)); mq?.removeEventListener("change", measure); };
  }, []);
  return [ref, w];
}

/**
 * svg는 잰 폭(w) 좌표계로 그리고 viewBox로 컨테이너에 맞춘다. 화면에서는 컨테이너 폭 = w 이므로 1:1이고,
 * 인쇄처럼 재측정이 레이아웃 뒤에 오지 못하는 경우에만 비율대로 줄거나 늘어 잘리지 않는다.
 */
const SVG_FIT: CSSProperties = { width: "100%", height: "auto", touchAction: "pan-y" };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** (hover: none) 미디어 쿼리를 외부 스토어로 읽는다 (SSR은 false) */
const hoverMq = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(hover: none)") : null);
const subscribeHover = (cb: () => void) => {
  const mq = hoverMq();
  if (!mq) return () => {};
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getNoHover = () => hoverMq()?.matches ?? false;

function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!(hi > lo)) return [lo];
  const t = ticksFor(lo, hi, count);
  return t.length >= 2 || count >= 12 ? t : niceTicks(lo, hi, count * 2); // 눈금이 1개뿐이면 더 촘촘히
}

function ticksFor(lo: number, hi: number, count: number): number[] {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const tick = (v: number, d: number) => neg(num(v, d));

/* ─────────────────────────────────────────────────────────────────────────
   LineChart · 월별 추이 (§4.10)
   ───────────────────────────────────────────────────────────────────────── */

export type LinePoint = { label: string; y: number | null; n: number };

export function LineChart({ points, digits = 1, unit, height = 180, title, thin = 5 }: {
  points: LinePoint[]; digits?: number; unit: string; height?: number; title?: string;
  /** 이 건수 미만 구간은 점선 */
  thin?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hoverState, setHover] = useState<number | null>(null);
  const noHover = useSyncExternalStore(subscribeHover, getNoHover, () => false);
  const validIdx = points.map((p, k) => (p.y === null ? -1 : k)).filter((k) => k >= 0);
  const lastIdx = validIdx.length ? validIdx[validIdx.length - 1] : null;
  const agoIdx = lastIdx !== null && lastIdx - 12 >= 0 && points[lastIdx - 12].y !== null ? lastIdx - 12 : null;
  // 호버가 없는 기기는 마지막 값을 기본으로 읽어 준다
  const hover = hoverState ?? (noHover ? lastIdx : null);

  const pad = { l: 44, r: 52, t: 12, b: 22 };
  let body: ReactNode = null;
  const n = points.length;
  if (w > 0 && validIdx.length >= 2) {
    const ys = validIdx.map((k) => points[k].y as number);
    const span = Math.max(...ys) - Math.min(...ys) || 1;
    const lo = Math.min(...ys) - span * 0.15;
    const hi = Math.max(...ys) + span * 0.15;
    const X = (k: number) => pad.l + ((w - pad.l - pad.r) * k) / Math.max(1, n - 1);
    const Y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    const solid: string[] = [];
    const dashed: string[] = [];
    for (let i = 1; i < n; i++) {
      const a = points[i - 1], b = points[i];
      if (a.y === null || b.y === null) continue;
      (a.n < thin || b.n < thin ? dashed : solid).push(`M${X(i - 1).toFixed(1)},${Y(a.y).toFixed(1)} L${X(i).toFixed(1)},${Y(b.y).toFixed(1)}`);
    }
    const every = Math.ceil(n / (w < 480 ? 4 : 8));
    const h = hover !== null ? points[hover] : null;
    const idxAt = (clientX: number, el: SVGSVGElement) => {
      const r = el.getBoundingClientRect();
      const x = (clientX - r.left) * (r.width > 0 ? w / r.width : 1); // 스케일된 svg면 좌표계로 환산
      return clamp(Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (n - 1)), 0, n - 1);
    };
    const move = (e: PointerEvent<SVGSVGElement>) => setHover(idxAt(e.clientX, e.currentTarget));
    const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
      const cur = hover ?? lastIdx ?? 0;
      let k = cur;
      if (e.key === "ArrowLeft") k = cur - 1; else if (e.key === "ArrowRight") k = cur + 1; else if (e.key === "Home") k = 0; else if (e.key === "End") k = n - 1; else return;
      e.preventDefault();
      setHover(clamp(k, 0, n - 1));
    };
    const last = lastIdx !== null ? points[lastIdx] : null;
    const ago = agoIdx !== null ? points[agoIdx] : null;
    body = (
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={SVG_FIT} role="group" tabIndex={0} aria-label={title ?? `${unit} 월별 추이`}
        onPointerMove={move} onPointerDown={move} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }} onKeyDown={onKey}>
        <title>{title ?? `${unit} 월별 추이`}</title>
        <desc>{`${validIdx.length}개월 · 최근 ${last?.label ?? ""} ${last && last.y !== null ? tick(last.y, digits) : ""} ${unit} · 점선은 표본 ${thin}건 미만 · 좌우 방향키로 이동`}</desc>
        {niceTicks(lo, hi, 3).map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={pad.l - 8} y={Y(t) + 3.5} textAnchor="end" className="tick">{tick(t, digits)}</text>
          </g>
        ))}
        {points.map((p, k) => (k % every === 0 ? <text key={k} x={X(k)} y={height - 6} textAnchor="middle" className="tick">{p.label}</text> : null))}
        {solid.length > 0 && <path d={solid.join(" ")} className="line" />}
        {dashed.length > 0 && <path d={dashed.join(" ")} className="line thin" strokeDasharray="2 3" />}
        {points.map((p, k) => (p.y !== null && p.n < thin ? <circle key={`t${k}`} cx={X(k)} cy={Y(p.y)} r={2} className="dot-thin" /> : null))}
        {ago && ago.y !== null && agoIdx !== null && (
          <text x={X(agoIdx)} y={Y(ago.y) - 8} textAnchor="middle" className="tick strong">{tick(ago.y, digits)}</text>
        )}
        {last && last.y !== null && lastIdx !== null && (
          <text x={X(lastIdx) + 6} y={Y(last.y) + 3.5} textAnchor="start" className="tick strong">{tick(last.y, digits)}</text>
        )}
        {h && h.y !== null && hover !== null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={height - pad.b} className="cross" />
            <circle cx={X(hover)} cy={Y(h.y)} r={3.5} className="dot" />
          </g>
        )}
      </svg>
    );
  }
  const h = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} className="chart">
      <div className="chart-read" aria-live="polite">
        {h && h.y !== null
          ? <><b>{tick(h.y, digits)}</b> {unit} · {h.label} · {h.n}건{h.n < thin ? ` · 표본 ${thin}건 미만` : ""}</>
          : <span className="muted">{unit} · 월별 중앙값 · 점선 = 표본 {thin}건 미만</span>}
      </div>
      {body ?? <div className="empty" style={{ height }}>표본이 부족합니다</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Scatter · 단지별 산점도 (§4.10)
   ───────────────────────────────────────────────────────────────────────── */

export type ScatterItem = { key: string; x: number; y: number; size: number; label: string; sub: string };

export function Scatter({ items, selected, onPick, xLabel, yLabel, height = 300, fmtItem, axes = true }: {
  items: ScatterItem[]; selected: string | null; onPick: (key: string) => void; xLabel: string; yLabel: string; height?: number;
  /** 히트 원의 aria-label. 기본 「{단지} · 단가 2,875만원/평 · 수익률 5.94%」 */
  fmtItem?: (i: ScatterItem) => string;
  /** 축 라벨 줄(.chart-axes)을 차트 아래에 렌더. figcaption에 직접 쓰면 false */
  axes?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const hits = useRef(new Map<string, SVGCircleElement>());
  const pad = { l: 44, r: 14, t: 12, b: 22 };
  const H = w > 0 && w <= 560 ? Math.min(height, 240) : height;
  const byX = [...items].sort((a, b) => a.x - b.x || a.key.localeCompare(b.key));
  const tabKey = selected !== null && items.some((i) => i.key === selected) ? selected : byX[0]?.key ?? null;
  const aria = fmtItem ?? ((i: ScatterItem) => `${i.label} · 단가 ${num(i.x, 0)}만원/평 · 수익률 ${num(i.y, 2)}%`);
  let body: ReactNode = null;
  if (w > 0 && items.length > 0) {
    const xs = items.map((i) => i.x);
    const ys = items.map((i) => i.y);
    const xr = [Math.min(...xs), Math.max(...xs)];
    const yr = [Math.min(...ys), Math.max(...ys)];
    const xl = xr[0] - (xr[1] - xr[0]) * 0.06, xh = xr[1] + (xr[1] - xr[0]) * 0.06 || xr[1] + 1;
    const yl = yr[0] - (yr[1] - yr[0]) * 0.1, yh = yr[1] + (yr[1] - yr[0]) * 0.1 || yr[1] + 1;
    const X = (v: number) => pad.l + ((w - pad.l - pad.r) * (v - xl)) / (xh - xl);
    const Y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - yl) / (yh - yl));
    const maxS = Math.max(...items.map((i) => i.size));
    const R = (s: number) => 3 + 9 * Math.sqrt(s / maxS);
    const ordered = [...items].sort((a, b) => b.size - a.size);
    const onKey = (e: KeyboardEvent<SVGCircleElement>, key: string) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(key); return; }
      const k = byX.findIndex((i) => i.key === key);
      let j = k;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") j = k + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") j = k - 1;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = byX.length - 1;
      else return;
      e.preventDefault();
      const t = byX[clamp(j, 0, byX.length - 1)];
      if (t) { setHover(t.key); hits.current.get(t.key)?.focus(); }
    };
    body = (
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} style={SVG_FIT} role="group" aria-label={`${xLabel} 대 ${yLabel} 산점도 · ${items.length}곳`}>
        <title>{`${xLabel} 대 ${yLabel} 산점도`}</title>
        <desc>{`원 하나가 단지 하나 · ${items.length}곳 · 방향키로 이동, Enter로 선택`}</desc>
        {niceTicks(yl, yh, 4).map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={pad.l - 8} y={Y(t) + 3.5} textAnchor="end" className="tick">{tick(t, 1)}</text>
          </g>
        ))}
        {niceTicks(xl, xh, w < 480 ? 3 : 6).map((t) => (
          <text key={`x${t}`} x={X(t)} y={H - 6} textAnchor="middle" className="tick">{tick(t, 0)}</text>
        ))}
        {ordered.map((i) => {
          const on = i.key === selected;
          return <circle key={i.key} cx={X(i.x)} cy={Y(i.y)} r={R(i.size)} className={`bubble${on ? " on" : ""}${hover === i.key ? " hover" : ""}`} pointerEvents="none" />;
        })}
        {ordered.map((i) => {
          const on = i.key === selected;
          const focusable = i.key === (hover ?? tabKey);
          return (
            <circle key={`h${i.key}`} cx={X(i.x)} cy={Y(i.y)} r={Math.max(14, R(i.size))} className="bubble-hit" fill="transparent" stroke="none"
              ref={(el) => { if (el) hits.current.set(i.key, el); else hits.current.delete(i.key); }}
              tabIndex={focusable ? 0 : -1} role="button" aria-pressed={on} aria-label={aria(i)}
              onPointerEnter={() => setHover(i.key)} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover((h) => (h === i.key ? null : h)); }}
              onFocus={() => setHover(i.key)} onBlur={() => setHover((h) => (h === i.key ? null : h))}
              onClick={() => onPick(i.key)} onKeyDown={(e) => onKey(e, i.key)} />
          );
        })}
      </svg>
    );
  }
  const h = items.find((i) => i.key === (hover ?? selected));
  return (
    <div ref={ref} className="chart">
      <div className="chart-read" aria-live="polite">{h ? <><b>{h.label}</b> · {h.sub}</> : <span className="muted">원 하나가 단지 하나 · 표에서도 고를 수 있습니다</span>}</div>
      {body ?? <div className="empty" style={{ height: H }}>매매와 임대가 모두 3건 이상인 단지가 없습니다</div>}
      {axes ? <div className="chart-axes">x {xLabel} · y {yLabel}</div> : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TimeScatter · 계약일별 분포 (단지 상세)
   ───────────────────────────────────────────────────────────────────────── */

export type TimePoint = { t: number; v: number; tone: "a" | "b" | "c"; tip: string };

/** 표식: a 채운 원(--ink) · b 빈 원(#7E8AA3 1.4) · c 3px 사각. 범례도 같은 형태 */
function Mark({ tone, x, y }: { tone: "a" | "b" | "c"; x: number; y: number }) {
  if (tone === "c") return <rect x={x - 1.5} y={y - 1.5} width={3} height={3} className="pt pt-c" />;
  if (tone === "b") return <circle cx={x} cy={y} r={2.6} className="pt pt-b" fill="none" strokeWidth={1.4} />;
  return <circle cx={x} cy={y} r={2.6} className="pt pt-a" />;
}

export function TimeScatter({ points, legend, digits = 1, height = 200 }: { points: TimePoint[]; legend: { tone: "a" | "b" | "c"; label: string }[]; digits?: number; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<string | null>(null);
  const pad = { l: 44, r: 12, t: 10, b: 22 };
  const toTime = (ymd: number) => Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100);
  let body: ReactNode = null;
  if (w > 0 && points.length > 0) {
    const ts = points.map((p) => toTime(p.t));
    const vs = points.map((p) => p.v);
    const t0 = Math.min(...ts), t1 = Math.max(...ts) || t0 + 1;
    const span = Math.max(...vs) - Math.min(...vs) || 1;
    const lo = Math.min(...vs) - span * 0.1, hi = Math.max(...vs) + span * 0.1;
    const X = (t: number) => pad.l + ((w - pad.l - pad.r) * (t - t0)) / Math.max(1, t1 - t0);
    const Y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    const d0 = new Date(t0), d1 = new Date(t1);
    const lab = (d: Date) => `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const pos = points.map((p, k) => ({ x: X(ts[k]), y: Y(p.v), tip: p.tip }));
    // svg 좌표에서 가장 가까운 점 (20px 안)
    const nearest = (e: PointerEvent<SVGSVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const s = r.width > 0 ? w / r.width : 1; // 스케일된 svg면 좌표계로 환산
      const px = (e.clientX - r.left) * s, py = (e.clientY - r.top) * s;
      let best = -1, bd = 20 * 20;
      for (let k = 0; k < pos.length; k++) {
        const d = (pos[k].x - px) ** 2 + (pos[k].y - py) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      setTip(best >= 0 ? pos[best].tip : null);
    };
    body = (
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={SVG_FIT} role="img" aria-label={`계약일별 분포 · ${points.length}건`}
        onPointerMove={nearest} onPointerDown={nearest} onPointerLeave={(e) => { if (e.pointerType === "mouse") setTip(null); }}>
        <title>계약일별 분포</title>
        {niceTicks(lo, hi, 3).map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={pad.l - 8} y={Y(t) + 3.5} textAnchor="end" className="tick">{tick(t, digits)}</text>
          </g>
        ))}
        <text x={pad.l} y={height - 6} className="tick">{lab(d0)}</text>
        <text x={w - pad.r} y={height - 6} textAnchor="end" className="tick">{lab(d1)}</text>
        {points.map((p, k) => <Mark key={k} tone={p.tone} x={pos[k].x} y={pos[k].y} />)}
      </svg>
    );
  }
  return (
    <div ref={ref} className="chart">
      <div className="chart-read" aria-live="polite">
        {tip ? <b>{tip}</b> : (
          <span className="legend">
            {legend.map((l) => (
              <span key={l.tone}>
                <svg className="sw" width={10} height={10} viewBox="0 0 10 10" aria-hidden="true"><Mark tone={l.tone} x={5} y={5} /></svg>
                {l.label}
              </span>
            ))}
          </span>
        )}
      </div>
      {body ?? <div className="empty" style={{ height }}>거래가 없습니다</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Heat · 민감도 표 (§4.9)
   ───────────────────────────────────────────────────────────────────────── */

export type HeatLegend = { pos: string; neg: string; note?: string };

/** figcaption 안에 두는 범례 (사각 스와치 2개 + 설명) */
export function HeatLegendMarks({ pos, neg: negLabel, note }: HeatLegend) {
  return (
    <span className="heat-legend">
      <i className="sw heat-pos" aria-hidden="true" />{pos} <i className="sw heat-neg" aria-hidden="true" />{negLabel}{note ? ` · ${note}` : ""}
    </span>
  );
}

/** 기준선(threshold)을 경계로 색이 갈리는 민감도 표. 색은 --heat-pos-rgb / --heat-neg-rgb 에 인라인 --a 알파 */
export function Heat({ rowLabel, colLabel, rows, cols, values, fmt, threshold, scale, centerRow, centerCol, floor, title, legend, fmtBase, readLabel, centerBase = true, thresholdLabel }: {
  rowLabel: string; colLabel: string; rows: string[]; cols: string[]; values: (number | null)[][];
  fmt: (v: number | null) => string; threshold: number; scale: number; centerRow: number; centerCol: number;
  /** 이 값 미만이면 "위험" 테두리 (예: IRR 0%, DSCR 1.0) */
  floor?: number;
  /** sr-only caption 제목. 기본 「{rowLabel} × {colLabel}」 */
  title?: string;
  /** 표 아래 범례. figcaption에 HeatLegendMarks를 직접 두면 생략 */
  legend?: HeatLegend;
  /** 기준칸 표기 (KPI와 같은 자릿수) */
  fmtBase?: (v: number | null) => string;
  /** 읽기 줄 문구. 기본 「{행} × {열} → {값} (현재 {기준값})」 */
  readLabel?: (r: number, c: number, v: number | null) => string;
  /** 마운트 시 가로 넘침이면 기준칸을 중앙으로 */
  centerBase?: boolean;
  /** caption의 「기준」 표기. 기본 fmt(threshold) */
  thresholdLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [read, setRead] = useState<[number, number] | null>(null);
  const at = (r: number, c: number) => values[r]?.[c] ?? null;
  const base = at(centerRow, centerCol);
  const cur = sel ?? [centerRow, centerCol];
  const alpha = (v: number) => (0.08 + Math.abs(clamp((v - threshold) / scale, -1, 1)) * 0.42).toFixed(3);
  const label = (r: number, c: number) => {
    const v = at(r, c);
    return readLabel ? readLabel(r, c, v) : `${rowLabel} ${rows[r]} × ${colLabel} ${cols[c]} → ${fmt(v)} (현재 ${(fmtBase ?? fmt)(base)})`;
  };
  const focusCell = (r: number, c: number) => {
    setSel([r, c]);
    tableRef.current?.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLTableCellElement>, r: number, c: number) => {
    let nr = r, nc = c;
    if (e.key === "ArrowUp") nr = r - 1; else if (e.key === "ArrowDown") nr = r + 1;
    else if (e.key === "ArrowLeft") nc = c - 1; else if (e.key === "ArrowRight") nc = c + 1;
    else if (e.key === "Home") nc = 0; else if (e.key === "End") nc = cols.length - 1;
    else return;
    e.preventDefault();
    focusCell(clamp(nr, 0, rows.length - 1), clamp(nc, 0, cols.length - 1));
  };

  useLayoutEffect(() => {
    if (!centerBase) return;
    const wrap = wrapRef.current;
    const td = tableRef.current?.querySelector<HTMLElement>("td.base");
    if (!wrap || !td || wrap.scrollWidth <= wrap.clientWidth) return;
    wrap.scrollLeft = td.offsetLeft + td.offsetWidth / 2 - wrap.clientWidth / 2;
  }, [centerBase, centerRow, centerCol]);

  const readText = read ? label(read[0], read[1]) : `현재 가정 ${rows[centerRow]} × ${cols[centerCol]} → ${(fmtBase ?? fmt)(base)}`;
  return (
    <div className="heat-wrap" ref={wrapRef}>
      <div className="heat-read" aria-live="polite">{neg(readText)}</div>
      <table className="heat" ref={tableRef} onMouseLeave={() => setRead(null)}>
        <caption className="sr-only">{title ?? `${rowLabel} × ${colLabel}`} · 기준 {thresholdLabel ?? neg(fmt(threshold))}</caption>
        <thead>
          <tr>
            <th scope="col" className="corner">{rowLabel} ＼ {colLabel}</th>
            {cols.map((c, k) => <th key={c} scope="col" className={k === centerCol ? "ctr" : undefined}>{neg(c)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <th scope="row" className={ri === centerRow ? "ctr" : undefined}>{neg(r)}</th>
              {cols.map((c, ci) => {
                const v = at(ri, ci);
                const isBase = ri === centerRow && ci === centerCol;
                const below = v !== null && v < threshold;
                const risk = floor !== undefined && v !== null && v < floor;
                const cls = [below ? "below" : "", isBase ? "base" : "", risk ? "risk" : ""].filter(Boolean).join(" ") || undefined;
                const style = v === null ? undefined : ({ "--a": alpha(v), background: `rgba(var(--heat-${below ? "neg" : "pos"}-rgb), var(--a))` } as CSSProperties);
                return (
                  <td key={c} data-r={ri} data-c={ci} className={cls} style={style} tabIndex={cur[0] === ri && cur[1] === ci ? 0 : -1}
                    onMouseEnter={() => setRead([ri, ci])} onFocus={() => { setSel([ri, ci]); setRead([ri, ci]); }} onBlur={() => setRead(null)}
                    onKeyDown={(e) => onKey(e, ri, ci)}>
                    {neg(isBase && fmtBase ? fmtBase(v) : fmt(v))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {legend ? <div className="heat-legend-row"><HeatLegendMarks {...legend} /></div> : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   StackBar · 조달 구조 (§4.10)
   ───────────────────────────────────────────────────────────────────────── */

export function StackBar({ parts, label = "조달 구조" }: { parts: { label: string; value: number; tone: string; note: string }[]; label?: string }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  const pctOf = (v: number) => (Math.max(0, v) / total) * 100;
  const desc = parts.map((p) => `${p.label} ${Math.round(pctOf(p.value))}%`).join(" · ");
  return (
    <div className="stack">
      <div className="stack-bar" role="img" aria-label={`${label} · ${desc}`}>
        {parts.map((p) => {
          const wd = pctOf(p.value);
          return <span key={p.label} className={`seg seg-${p.tone}`} style={{ width: `${wd}%` }}>{wd >= 12 ? <b>{Math.round(wd)}%</b> : null}</span>;
        })}
      </div>
      <dl className="stack-legend">
        {parts.map((p) => (
          <div key={p.label}>
            <dt><i className={`sw seg-${p.tone}`} aria-hidden="true" />{p.label}</dt>
            <dd><b>{num(pctOf(p.value), 1)}%</b> · {p.note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   CfBars · 보통주 현금흐름 (§4.10)
   ───────────────────────────────────────────────────────────────────────── */

/**
 * 2계열: 운영 배당(op, 자기 최대값 기준)과 취득(acq)·매각(sale)은 첫·마지막 열에 별도 톤으로 100% 클립.
 * 구 호출 { cfs } 도 받는다(cfs[0] 취득, 나머지 운영, 매각 분리 없음).
 */
export function CfBars({ op, acq, sale, labels, cfs }: { op?: number[]; acq?: number; sale?: number; labels?: string[]; cfs?: number[] }) {
  const ops = op ?? (cfs ? cfs.slice(1) : []);
  const acq0 = acq ?? (cfs ? cfs[0] ?? 0 : 0);
  const sale0 = sale ?? 0;
  const n = ops.length;
  const max = Math.max(0, ...ops.map((c) => Math.abs(c))) || 1;
  const fmtE = (v: number) => neg(num(v / 10000, 1));
  const lab = (k: number) => labels?.[k] ?? (k === 0 ? "취득" : `${k}년`);
  return (
    <div className={`cfbars${n + 1 > 7 ? " many" : ""}`} role="list" aria-label="보통주 현금흐름 (억원)">
      <div className="cfcol" role="listitem" aria-label={`${lab(0)} ${fmtE(acq0)}억`}>
        <div className="cfarea" aria-hidden="true">
          <span className={`acq clip ${acq0 < 0 ? "neg" : "pos"}`} style={{ height: "50%", [acq0 < 0 ? "top" : "bottom"]: "50%" }} />
        </div>
        <div className="cflab">{lab(0)}</div>
        <div className={`cfval${acq0 < 0 ? " negtext" : ""}`}>{fmtE(acq0)}</div>
      </div>
      {ops.map((c, i) => {
        const k = i + 1;
        const isLast = i === n - 1 && sale0 !== 0;
        const total = c + (isLast ? sale0 : 0);
        return (
          <div key={k} className="cfcol" role="listitem" aria-label={`${lab(k)} ${fmtE(total)}억${isLast ? " · 매각 포함" : ""}`}>
            <div className="cfarea" aria-hidden="true">
              {isLast ? <span className={`sale clip ${sale0 < 0 ? "neg" : "pos"}`} style={{ height: "50%", [sale0 < 0 ? "top" : "bottom"]: "50%", left: "54%", right: "12%" }} /> : null}
              <span className={c >= 0 ? "pos" : "neg"} style={{ height: `${(Math.abs(c) / max) * 50}%`, [c >= 0 ? "bottom" : "top"]: "50%", ...(isLast ? { left: "12%", right: "54%" } : {}) }} />
            </div>
            <div className="cflab">{lab(k)}{isLast ? <small>매각 포함</small> : null}</div>
            <div className={`cfval${total < 0 ? " negtext" : ""}`}>{fmtE(total)}</div>
          </div>
        );
      })}
    </div>
  );
}
