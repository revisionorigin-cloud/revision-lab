"use client";

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { STANCE_LABEL, type Position, type Stance } from "@/lib/engine/assumptions";
import { DASH, eok, num } from "@/lib/format";
import { GLOSSARY, type GlossaryKey } from "./glossary";

/* ─────────────────────────────────────────────────────────────────────────
   헬퍼 (DESIGN_SPEC §7 A-5)
   ───────────────────────────────────────────────────────────────────────── */

const MINUS = "−";
const nfDisp = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 6 });
const cleanId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");

/** 숫자 앞의 ASCII 하이픈을 U+2212로 바꾼다. 날짜(2026-09)나 식별자 속 하이픈은 건드리지 않는다. */
export function neg(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return DASH;
  const t = typeof s === "number" ? String(s) : s;
  return t.replace(/(^|[^\w−])-(?=[\d.(])/g, `$1${MINUS}`);
}

/** 검산 상세 문자열 정리: 소수 3자리 이상은 2자리로 절단, −0.00 → 0.00, 부호는 U+2212 */
export function tidy(s: string): string {
  const t = s
    .replace(/[-−]?\d+\.\d{3,}/g, (m) => { const [i, f] = m.split("."); return `${i}.${f.slice(0, 2)}`; })
    .replace(/(^|[^\d.])[-−]0(\.0+)?(?![\d])/g, (_m, p: string, d: string | undefined) => `${p}0${d ?? ""}`);
  return neg(t);
}

/** "13.26만원" → { value: "13.26", unit: "만원" }. 단위가 없거나 뒤에 숫자가 더 오면(12억 8,800만원) 통째로 value */
export function splitUnit(s: string): { value: string; unit: string } {
  const m = /^([+\-−]?\d[\d,]*(?:\.\d+)?)\s*(.*)$/.exec(s.trim());
  if (!m || /\d/.test(m[2])) return { value: s, unit: "" };
  return { value: m[1], unit: m[2] };
}

/** 만원 → 「14억 8,800만원」 억·만원 혼합 표기. 1억 미만은 만원만, 딱 떨어지면 억만 */
export function wonKr(manwon: number | null | undefined): string {
  if (manwon === null || manwon === undefined || !Number.isFinite(manwon)) return DASH;
  const sign = manwon < 0 ? MINUS : "";
  const abs = Math.round(Math.abs(manwon));
  const e = Math.floor(abs / 10000);
  const m = abs % 10000;
  if (e === 0) return `${sign}${num(m)}만원`;
  if (m === 0) return `${sign}${num(e)}억`;
  return `${sign}${num(e)}억 ${num(m)}만원`;
}

/** scrollIntoView behavior. 사용자가 모션 축소를 켰으면 auto */
export function scrollMode(): ScrollBehavior {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export type RoKind = "pct" | "pctv" | "pctv+" | "mult" | "won" | "won+" | "eok" | "eok+" | "py";

/** 서브내비·하단 바 readout 서식. 지표별 고정 자릿수(수익률 2 · 변화율 1 · 배수 2), 부호 U+2212 */
export function fmtRo(v: number | null | undefined, kind: RoKind): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const sg = (plus: boolean) => (v < 0 ? MINUS : plus && v > 0 ? "+" : "");
  const a = Math.abs(v);
  switch (kind) {
    case "pct": return `${sg(false)}${num(a * 100, 2)}%`;
    case "pctv": return `${sg(false)}${num(a, 1)}%`;
    case "pctv+": return `${sg(true)}${num(a, 1)}%`;
    case "mult": return `${sg(false)}${num(a, 2)}x`;
    case "won": return `${sg(false)}${num(a, 0)}만원`;
    case "won+": return `${sg(true)}${num(a, 0)}만원`;
    case "eok": return `${sg(false)}${num(a / 10000, 1)}억`;
    case "eok+": return `${sg(true)}${num(a / 10000, 1)}억`;
    case "py": return `${sg(false)}${num(a, 0)}만원/평`;
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Term · 용어 정의 (§4.11)
   ───────────────────────────────────────────────────────────────────────── */

const TERM_OPEN_EVT = "relab:term-open";

export function Term({ k, children, static: isStatic, className }: { k: GlossaryKey; children?: ReactNode; static?: boolean; className?: string }) {
  const def = GLOSSARY[k];
  const uid = useId();
  const id = `def-${cleanId(uid)}`;
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const pinned = useRef(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const defRef = useRef<HTMLSpanElement | null>(null);

  const show = useCallback(() => {
    setOpen(true);
    document.dispatchEvent(new CustomEvent<string>(TERM_OPEN_EVT, { detail: id }));
  }, [id]);
  const hide = useCallback(() => { pinned.current = false; setOpen(false); }, []);

  useEffect(() => {
    if (!open) return;
    const onOther = (e: Event) => { if ((e as CustomEvent<string>).detail !== id) hide(); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") hide(); };
    const onDoc = (e: globalThis.MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) hide(); };
    document.addEventListener(TERM_OPEN_EVT, onOther);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onDoc);
    return () => {
      document.removeEventListener(TERM_OPEN_EVT, onOther);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDoc);
    };
  }, [open, id, hide]);

  // 우측으로 넘치면 .flip (열릴 때 한 번 측정)
  useLayoutEffect(() => {
    const el = defRef.current;
    if (!open || !el) return;
    el.classList.remove("flip");
    const r = el.getBoundingClientRect();
    setFlip(r.width > 0 && r.right > window.innerWidth - 8);
  }, [open]);

  if (isStatic) return <dfn className={`term-static${className ? ` ${className}` : ""}`} title={def}>{children ?? k}</dfn>;

  return (
    <span className={`term-wrap${open ? " open" : ""}${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button type="button" className="term" aria-expanded={open} aria-describedby={id}
        onClick={() => { if (open && pinned.current) hide(); else { pinned.current = true; show(); } }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse" && !open) show(); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse" && !pinned.current) hide(); }}
        onFocus={() => { if (!open) show(); }}
        onBlur={() => { if (!pinned.current) hide(); }}>
        {children ?? k}
      </button>
      <span role="tooltip" id={id} ref={defRef} className={`def${flip ? " flip" : ""}`} style={open ? undefined : { display: "none" }}>{def}</span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Kpi (§4.3) · SectionHead (§4.2)
   ───────────────────────────────────────────────────────────────────────── */

export type KpiTone = "neg" | "pos" | "ok" | "warn";

/** 값 문자열의 단위는 자동으로 <small class="u">로 분리한다("13.26만원" → 13.26 + 만원). unit을 주면 그대로 쓴다 */
export function Kpi({ label, value, unit, sub, tone, term, compact, xl, id }: {
  label: ReactNode; value: string; unit?: string; sub?: ReactNode; tone?: KpiTone; term?: GlossaryKey; compact?: boolean; xl?: boolean; id?: string;
}) {
  const sp = unit === undefined ? splitUnit(value) : { value, unit };
  return (
    <div className={`kpi${compact ? " compact" : ""}`} id={id}>
      <div className="kpi-label">{term ? <Term k={term}>{label}</Term> : label}</div>
      <div className={`kpi-value${tone ? ` ${tone}` : ""}${xl ? " xl" : ""}`}>{neg(sp.value)}{sp.unit && <small className="u">{sp.unit}</small>}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

export function SectionHead({ no, title, lead, aside }: { no?: string; title: ReactNode; lead?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="sec-head">
      <div>
        {no ? <div className="sec-no">{no}</div> : null}
        <h2>{title}</h2>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {aside ? <div className="sec-aside">{aside}</div> : null}
    </header>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Memo · 결론 블록 (§4.7)
   ───────────────────────────────────────────────────────────────────────── */

export type MemoTone = "ok" | "warn" | "neg";
export type MemoFigure = { label: ReactNode; value: string; unit?: string; sub?: ReactNode; term?: GlossaryKey; tone?: KpiTone; xl?: boolean };
export type MemoAnswer = { q: ReactNode; a: string; unit?: string; s?: ReactNode; tone?: "neg" | null; term?: GlossaryKey };
export type MemoAction = { label: string; href?: string; onClick?: (e: MouseEvent<HTMLElement>) => void };
export type MemoTally = { aggressive: number; neutral: number; conservative: number; na: number };

const isTally = (t: unknown): t is MemoTally => typeof t === "object" && t !== null && "aggressive" in t && "neutral" in t;

export function Memo({ variant, tone, toneLabel, kicker, headline, target, figures, answers, lender, basis, edited, tally, actions, idle, id = "memo", children }: {
  variant: "pro" | "home";
  /** 판정 톤. 엔진의 "bad"도 받아 neg로 표기 */
  tone?: MemoTone | "bad" | null;
  /** 「목표 충족 / 목표 미달 / 원금 손실」 · Home은 「자기자본 부족 / 대출 불가」일 때만 */
  toneLabel?: string;
  kicker: string;
  headline?: ReactNode;
  /** 「목표」 토큰 옆 인라인 입력(NumField compact) */
  target?: ReactNode;
  figures?: MemoFigure[];
  answers?: MemoAnswer[];
  lender?: ReactNode;
  basis: ReactNode;
  edited?: boolean;
  tally?: MemoTally | ReactNode;
  actions: MemoAction[];
  /** 입력 전 문구. 있으면 v-idle 상태로 kicker + 문구 + actions만 렌더 */
  idle?: ReactNode;
  id?: string;
  children?: ReactNode;
}) {
  const t: MemoTone | null = tone === "bad" ? "neg" : tone ?? null;
  const state = idle ? "idle" : t ?? "none";
  const hid = `${id}-h`;
  return (
    <section className={`memo memo-${variant} v-${state}`} id={id} aria-labelledby={hid}>
      <div className="memo-top">
        <p className="memo-kicker" id={hid}>{kicker}</p>
        {!idle && toneLabel && t ? <span className={`memo-tone ${t}`}>{toneLabel}</span> : null}
      </div>
      {idle ? <p className="memo-idle">{idle}</p> : (
        <>
          {headline ? <h2 className="memo-head">{headline}{target ? <span className="memo-target">{target}</span> : null}</h2> : null}
          {figures && figures.length > 0 ? (
            <div className="memo-figures">
              {figures.map((f, k) => <Kpi key={k} label={f.label} value={f.value} unit={f.unit} sub={f.sub} tone={f.tone} term={f.term} xl={f.xl ?? k === 0} />)}
            </div>
          ) : null}
          {answers && answers.length > 0 ? (
            <div className="answers">
              {answers.map((x, k) => {
                const sp = x.unit === undefined ? splitUnit(x.a) : { value: x.a, unit: x.unit };
                return (
                  <div key={k}>
                    <div className="q">{x.term ? <Term k={x.term}>{x.q}</Term> : x.q}</div>
                    <div className={`a${x.tone === "neg" ? " neg" : ""}`}>{neg(sp.value)}{sp.unit && <small className="u">{sp.unit}</small>}</div>
                    {x.s ? <div className="s">{x.s}</div> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {lender ? <p className="memo-lender">{lender}</p> : null}
          {children}
          <p className="memo-basis">
            {basis}
            {edited ? <b className="basis-edited">수정됨</b> : null}
            {isTally(tally) ? (
              <span className="tally">가정 {tally.aggressive + tally.neutral + tally.conservative + tally.na}개: 공격적 <b>{tally.aggressive}</b> · 중립 <b>{tally.neutral}</b> · 보수적 <b>{tally.conservative}</b> · 자료 없음 <b>{tally.na}</b></span>
            ) : tally ? <span className="tally">{tally as ReactNode}</span> : null}
          </p>
        </>
      )}
      {actions.length > 0 ? (
        <p className="memo-actions">
          <span className="memo-next">다음</span>
          {actions.map((a, k) => (
            <Fragment key={k}>
              {" · "}
              {a.href ? <a className="link" href={a.href} onClick={a.onClick}>{a.label}</a> : <button type="button" className="link" onClick={a.onClick}>{a.label}</button>}
            </Fragment>
          ))}
        </p>
      ) : null}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Seg · 라디오그룹 세그먼트 (§4.5)
   ───────────────────────────────────────────────────────────────────────── */

export type SegOption<T extends string> = { id: T; label: string; disabled?: boolean };

/** 세그먼트 컨트롤만 (필드 래퍼 없음). MarketPanel 컨트롤·NumField 부호용 */
export function SegCtl<T extends string>({ id, label, labelId, value, options, onChange, className }: {
  id?: string; label?: string; labelId?: string; value: T; options: SegOption<T>[]; onChange: (v: T) => void; className?: string;
}) {
  const uid = useId();
  const gid = id ?? `seg-${cleanId(uid)}`;
  const sel = Math.max(0, options.findIndex((o) => o.id === value));
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, k: number) => {
    const n = options.length;
    let j = k;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (k + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (k - 1 + n) % n;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = n - 1;
    else return;
    e.preventDefault();
    for (let g = 0; g < n && options[j].disabled; g++) j = (j + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + n) % n;
    onChange(options[j].id);
    (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
  };
  return (
    <div id={gid} className={`seg-ctl${className ? ` ${className}` : ""}`} role="radiogroup" aria-labelledby={labelId} aria-label={labelId ? undefined : label}>
      {options.map((o, k) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} tabIndex={k === sel ? 0 : -1} disabled={o.disabled}
          className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)} onKeyDown={(e) => onKey(e, k)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ id, label, value, options, onChange, term, derived }: {
  id?: string; label: string; value: T; options: SegOption<T>[]; onChange: (v: T) => void; term?: GlossaryKey; derived?: ReactNode;
}) {
  const uid = useId();
  const gid = id ?? `seg-${cleanId(uid)}`;
  const lid = `${gid}-l`;
  // NumField와 같은 구조 (§4.5 「Term은 label 형제로」). aria-labelledby는 순수 라벨 요소만 가리키고 Term 버튼·role=tooltip 정의는
  // 그 형제로 두어 radiogroup 접근성 이름에 정의문이 붙지 않게 한다. 라벨이 곧 용어 키면 라벨을 트리거로 쓰고 순수 라벨은 sr-only,
  // 아니면 보이는 라벨 옆에 용어 키 트리거를 둔다. 요소는 globals.css의 `.field-label > label + .term-wrap` 간격 규칙에 맞춰 label
  const labelIsTerm = term !== undefined && label === term;
  return (
    <div className="field">
      <span className="field-label">
        <label id={lid} className={labelIsTerm ? "sr-only" : undefined}>{label}</label>
        {term ? (labelIsTerm ? <Term k={term}>{label}</Term> : <Term k={term} />) : null}
      </span>
      <SegCtl id={gid} labelId={lid} value={value} options={options} onChange={onChange} />
      {derived ? <div className="field-derived">{derived}</div> : null}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   NumField (§4.5)
   ───────────────────────────────────────────────────────────────────────── */

const decimalsOf = (x: number) => { const s = String(x); const i = s.indexOf("."); return i < 0 ? 0 : Math.min(6, s.length - i - 1); };
const parseNum = (t: string) => { const s = t.replace(/,/g, "").replace(/−/g, "-").trim(); return s === "" ? NaN : Number(s); };
const rawText = (v: number) => String(v);
const dispText = (v: number) => neg(nfDisp.format(v));
const shortUnit = (u?: string) => (u ? u.split(/[\s/]/)[0] : "");

function focusNext(el: HTMLElement, last?: boolean) {
  if (last) { el.blur(); return; }
  const scope = el.closest(".uw-inputs") ?? el.closest("main") ?? document.body;
  const all = Array.from(scope.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), [role="radio"][tabindex="0"]:not([disabled])'));
  const nx = all[all.indexOf(el) + 1];
  if (!nx) { el.blur(); return; }
  nx.focus();
  if (nx instanceof HTMLInputElement) nx.select();
}

export type NumFieldProps = {
  id?: string;
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
  /** 짧은 단위 토큰(%, 만원, 평, bp, 년). "만원"이고 1억 이상이면 「만원 · 14.9억」 병기 */
  unit?: string;
  derived?: ReactNode;
  /** 시장 대비 위치. lib의 Position 객체 또는 문구 문자열(stance와 함께) */
  position?: Position | string;
  stance?: Stance;
  /** 출처 문구 (「출처 ·」 접두 없이 --faint) */
  source?: string;
  /** 수정된 필드의 채우기 시점 값. onRestore가 있으면 「직접 입력 · 시장값 X [되돌리기]」 */
  marketValue?: number | string;
  onRestore?: () => void;
  /** 음수 허용 필드: 왼쪽에 상승/하락 Seg, 입력은 절대값 */
  sign?: boolean;
  term?: GlossaryKey;
  /** 입력열의 마지막 컨트롤이면 enterKeyHint done */
  last?: boolean;
  /** memo 인라인용: 라벨·입력만, 메타 없음 */
  compact?: boolean;
  disabled?: boolean;
  name?: string;
};

export function NumField({ id: idProp, label, value, onChange, min = 0, max, step = 1, unit, derived, position, stance, source, marketValue, onRestore, sign, term, last, compact, disabled, name }: NumFieldProps) {
  const uid = useId();
  const id = idProp ?? (typeof label === "string" ? `f-${label.replace(/\s+/g, "-")}` : `f-${cleanId(uid)}`);
  const shown = sign ? Math.abs(value) : value;
  const [text, setText] = useState(dispText(shown));
  const [seen, setSeen] = useState(value);
  const [focused, setFocused] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [down, setDown] = useState(value < 0);
  const [committed, setCommitted] = useState<number | null>(null); // 이 필드가 마지막으로 올려 보낸 값 (내부 변경 판별)
  const editStart = useRef(value);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 바깥에서 값이 바뀌면(시장값 채우기·되돌리기) 입력칸도 따라간다. 이 필드가 방금 올려 보낸 값(범위 보정 포함)은 건드리지 않는다
  if (seen !== value) {
    setSeen(value);
    if (committed !== value) {
      const cur = parseNum(text);
      const want = sign ? Math.abs(value) : value;
      if (!focused || cur !== want) setText(focused ? rawText(want) : dispText(want));
      if (value !== 0) setDown(value < 0);
      if (err) setErr(null);
    }
  }
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current); }, []);

  const u = shortUnit(unit);
  const commit = useCallback((v: number) => {
    let c = v;
    let e: string | null = null;
    if (v < min) { c = min; e = max === undefined ? `${dispText(min)}${u} 이상 값만 계산합니다 (${dispText(min)}${u}로 계산 중)` : `${dispText(min)}~${dispText(max)}${u} 사이 값만 계산합니다 (${dispText(min)}${u}로 계산 중)`; }
    else if (max !== undefined && v > max) { c = max; e = `${dispText(min)}~${dispText(max)}${u} 사이 값만 계산합니다 (${dispText(max)}${u}로 계산 중)`; }
    setErr(e);
    setCommitted(c);
    onChange(c);
  }, [min, max, u, onChange]);
  const signed = (abs: number) => (sign ? (down ? -Math.abs(abs) : Math.abs(abs)) : abs);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? 1 : -1;
      const mul = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const dec = decimalsOf(step) + (e.altKey ? 1 : 0);
      let next = Number((shown + dir * step * mul).toFixed(dec));
      if (sign && next < 0) next = 0;
      setText(rawText(next));
      commit(signed(next));
    } else if (e.key === "Enter") {
      e.preventDefault();
      focusNext(e.currentTarget, last);
    } else if (e.key === "Escape") {
      e.preventDefault();
      const v0 = editStart.current;
      setText(rawText(sign ? Math.abs(v0) : v0));
      setErr(null);
      setCommitted(v0);
      onChange(v0);
    }
  };

  const unitAlt = unit === "만원" && Math.abs(value) >= 10000 ? neg(eok(value)) : null;
  const unitText = unitAlt ? `만원 · ${unitAlt}` : unit;
  const posObj = typeof position === "object" ? position : undefined;
  const posText = typeof position === "string" ? position : posObj?.text;
  const st: Stance | undefined = stance ?? posObj?.stance;
  const restore = onRestore !== undefined || marketValue !== undefined;
  const hasMeta = !compact && (st !== undefined || !!posText || !!source || restore);
  const mv = typeof marketValue === "number" ? dispText(marketValue) : marketValue;
  const labelIsTerm = term !== undefined && label === term;
  // compact(메모 인라인)는 h2 안에 들어가므로 phrasing 요소만 쓴다
  const Root: "div" | "span" = compact ? "span" : "div";

  return (
    <Root className={`field${compact ? " compact" : ""}${sign ? " signed" : ""}`}>
      {term ? (
        <span className="field-label">
          <label htmlFor={id} className={labelIsTerm ? "sr-only" : undefined}>{label}</label>
          {labelIsTerm ? <Term k={term}>{label}</Term> : <Term k={term} />}
        </span>
      ) : <label htmlFor={id}>{label}</label>}
      <Root className="field-input">
        {sign ? (
          <SegCtl className="sign" label={`${typeof label === "string" ? label : ""} 방향`} value={down ? "down" : "up"}
            options={[{ id: "up", label: "상승" }, { id: "down", label: "하락" }]}
            onChange={(v) => { const d = v === "down"; setDown(d); if (value !== 0) commit(d ? -Math.abs(value) : Math.abs(value)); }} />
        ) : null}
        <input id={id} name={name} type="text" inputMode="decimal" pattern={min >= 0 || sign ? "[0-9.,]*" : "-?[0-9.,]*"} value={text} step="any" disabled={disabled}
          enterKeyHint={last ? "done" : "next"} autoComplete="off" spellCheck={false}
          aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-err` : undefined}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const v = parseNum(t);
            if (!Number.isFinite(v)) return;
            commit(signed(v));
          }}
          onFocus={(e) => { editStart.current = value; setFocused(true); setText(rawText(shown)); e.currentTarget.select(); }}
          onBlur={() => {
            setFocused(false);
            const v = parseNum(text);
            if (!Number.isFinite(v)) {
              setNote(`이전 값 ${dispText(shown)}${u}로 되돌렸습니다`);
              if (noteTimer.current) clearTimeout(noteTimer.current);
              noteTimer.current = setTimeout(() => setNote(null), 1500);
            }
            // 범위 밖 값은 입력한 그대로 두어 오류 문구와 함께 보이게 한다
            if (!err) setText(dispText(shown));
          }}
          onKeyDown={onKeyDown}
          onWheel={(e) => e.currentTarget.blur()} />
        {unitText ? <span className="unit" title={unitText}>{unitAlt ? <>만원<small className="unit-alt"> · {unitAlt}</small></> : unitText}</span> : null}
      </Root>
      {derived && !compact ? <div className="field-derived">{derived}</div> : null}
      {hasMeta ? (
        <div className="field-meta">
          {st && st !== "na" ? <b className={`tag st-${st}`}>{STANCE_LABEL[st]}</b> : null}
          {posText ? <span className="pos" title={posText}>{posText}</span> : st === "na" ? <span className="pos">공공데이터 없음 · 실사값 입력</span> : null}
          {restore ? (
            <span className="src">{onRestore ? "직접 입력 · " : ""}시장값 {mv ?? DASH}{onRestore ? <> <button type="button" className="link" onClick={onRestore}>되돌리기</button></> : null}</span>
          ) : source ? <span className="src" title={source}>{source}</span> : null}
        </div>
      ) : null}
      {err ? <Root className="field-err" id={`${id}-err`}>{err}</Root> : note ? <Root className="field-err note" role="status">{note}</Root> : null}
    </Root>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Notice · Skel (§4.13)
   ───────────────────────────────────────────────────────────────────────── */

export function Notice({ tone, role, children, className, id }: { tone?: "warn" | "ok" | "info"; role?: "alert" | "status"; children: ReactNode; className?: string; id?: string }) {
  return <div className={`notice${tone && tone !== "info" ? ` ${tone}` : ""}${className ? ` ${className}` : ""}`} role={role} id={id}>{children}</div>;
}

const skelBlock = (w: string, h: number) => ({ display: "block", width: w, height: h, background: "var(--surface-1)" } as const);

/** 로딩 자리. kpi: 칸 n개(기본 6) · rows: 표 n행(기본 6) · chart: 높이 n(기본 180) */
export function Skel({ kind, n }: { kind: "kpi" | "rows" | "chart"; n?: number }) {
  if (kind === "chart") return <div className="skel skel-chart" aria-hidden="true" style={{ height: n ?? 180, background: "var(--surface-1)" }} />;
  if (kind === "rows") {
    const rows = n ?? 6;
    return (
      <div className="skel skel-rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, k) => <span key={k} className="skel-b" style={{ ...skelBlock("100%", 20), margin: "10px 0" }} />)}
      </div>
    );
  }
  const cells = n ?? 6;
  return (
    <div className={`kpis skel skel-kpi${cells === 4 ? " four" : cells === 6 ? " six" : ""}`} aria-hidden="true">
      {Array.from({ length: cells }, (_, k) => (
        <div key={k} className="kpi">
          <span className="skel-b" style={{ ...skelBlock("60%", 12), marginBottom: 10 }} />
          <span className="skel-b" style={skelBlock("40%", 28)} />
        </div>
      ))}
    </div>
  );
}
