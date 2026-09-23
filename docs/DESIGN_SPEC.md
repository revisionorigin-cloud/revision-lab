# RE:LAB 디자인 스펙 v1

기준: 2026-09-23 베이스라인(1440/390 캡처, globals.css 429행, 컴포넌트 10개). 채택 방향은 「에디토리얼 IC 메모」다. 여기에 「정밀 계기」의 상시 readout·키보드 모델·히트맵 읽기 줄·표 행 동작을, 「안내형」의 로딩·빈 상태·오류·덮어쓰기 확인·Home 핵심 6개·용어 사전·Market 인계 띠를 이식했다. lib/와 계산 로직은 손대지 않는다. 새 npm 의존성 없음. 토큰은 전부 :root. 사용자 노출 문구에 em-dash·느낌표·슬로건·최상급·권유 어투·아이콘·이모지·사진 금지.

## 1. 원칙

1. 화면은 메모다. 결론이 첫 장에 온다. Pro와 Home 모두 히어로 바로 아래에 결론 블록(.memo)을 두고, 그 아래 01~04 절이 근거를 편다. 랜딩과 Market은 기준일과 시세가 첫 화면에 온다.
2. 위계는 활자와 여백이 만든다. 상자·그림자·반경은 쓰지 않는다. 크기 4단(40/26/16/15)·굵기 3단(600/500/400)·4px 격자·헤어라인 하나로 층을 나눈다. 아이보리 100% 실선은 h2 아래 48px 룰과 푸터 시그니처에만 쓴다.
3. 결론 수치는 어느 스크롤 위치에서도 보인다. 2단 헤더의 서브내비 우측에 tone 막대와 Mono readout 3개를 두고, 결과열은 요약(headline 1줄 + KPI 4)만 sticky로 둔다. 세 번째 sticky 층(러닝헤드)은 두지 않는다. 모바일의 sticky는 헤더와 하단 바뿐이다.
4. 골드는 5% 이하. 눈썹·절 번호, 페이지당 골드 헤어라인 1줄(Pro·Home은 결론 위, 랜딩·Market은 히어로 아래), 활성 nav 밑줄, 선택 상태(표 선택행·히트맵 기준칸·포커스 링), 워드마크 콜론, 푸터 시그니처에만 쓴다. 입력값·막대·카드 키워드·상태 바의 골드는 아이보리로 돌린다.
5. 숫자는 표 조판 규칙을 따른다. 단독 수치는 IBM Plex Mono 400 tabular, 단위는 Pretendard 소형 별도 요소, 음수 부호는 U+2212 하나, 자릿수는 지표별 고정(비중 0, 변화율 1, 수익률 2). 문장 속 수치만 Pretendard tnum.
6. 용어는 정의를 달고 나온다. 절마다 첫 등장 지표명에만 점선 밑줄 Term을 붙이고 정의는 components/glossary.ts 한 곳에 둔다. 물음표 버튼·아이콘은 쓰지 않는다.
7. 빈 화면도 화면이다. 로딩·오류·표본 부족·입력 전 상태마다 문구와 다음 행동 링크가 있고, 사용자가 고친 값을 덮어쓰기 전에는 반드시 인라인으로 확인한다.
8. 독자별 언어. Pro는 원어(Levered IRR, Equity Multiple, DSCR)를 유지하고 KPI 산식을 항상 보여 준다. Home은 라벨을 질문 문장으로 풀고 「배수」 같은 치환은 Home에만 적용한다. 결과는 「사용자의 가정을 계산한 값」이며 종목·물건 추천이나 권유 어투를 쓰지 않는다.

## 2. 토큰 (globals.css :root)

```css
:root {
  /* 서체 · 한글 폴백을 Pretendard로 고정 */
  --font: "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
  --latin: "Jost", var(--font);
  --mono: "IBM Plex Mono", "Pretendard Variable", Pretendard, ui-monospace, Menlo, Consolas, monospace;
  /* 색 · body 바탕은 수평 그라데이션(navy → navy-2) fixed 유지. 단색 --ink-bg 삭제, --bg는 투명 */
  --navy: #070C17; --navy-2: #101B31; --bg: transparent;
  --ink: #EDEAE0; --ink-2: #C9CDD6; --muted: #97A0B1; --faint: #828C9F; --faint-deco: #66718B;
  --gold: #B99C64; --gold-hi: #F2E2BC; --gold-colon: #D9C08C; --gold-dim: #8A6F3E;
  --accent-soft: rgba(185,156,100,.12);
  --surface-1: rgba(235,231,220,.035); --surface-2: rgba(7,12,23,.88); --surface-pop: var(--navy-2);
  --rule: rgba(235,231,220,.10); --rule-2: rgba(235,231,220,.22); --rule-ink: var(--ink); --ctl-line: rgba(235,231,220,.38);
  --gold-hair: linear-gradient(90deg, transparent, #C9AF7F 20%, #F2E2BC 50%, #C9AF7F 80%, transparent);
  --ok: #9DBB9A; --ok-soft: rgba(157,187,154,.14);
  --warn: #D3A06E; --warn-soft: rgba(211,160,110,.12);
  --neg: #C98A7D; --neg-soft: rgba(201,138,125,.14); --neg-text: #F2D6CF;
  --heat-pos-rgb: 157,187,154; --heat-neg-rgb: 120,52,58;
  --seg-debt: #7E8AA3; --seg-pref: repeating-linear-gradient(45deg, var(--ink-2) 0 3px, transparent 3px 6px);
  --seg-dep: rgba(185,156,100,.45); --seg-eq: var(--ink);
  /* 대비(navy-2 #101B31 위, 소수 1자리): ink 14.3 · ink-2 10.8 · muted 6.5 · faint 5.1 · gold 6.5 · warn 7.4 · neg 6.1 · ok 8.2 · ctl-line 3.1 · gold-hi 포커스 링은 navy 띠 위 15.2 */
  /* 타입 토큰(px). 이 목록 밖의 글자 크기는 쓰지 않는다: 11 12 13 15 16 17 22 26 28 36 40 48 */
  --t-display: 48px; --t-h1: clamp(32px, 3.6vw, 40px); --t-h2: 26px; --t-h3: 16px; --t-lead: 17px;
  --t-body: 15px; --t-ui: 13px; --t-sm: 12px; --t-xs: 11px;
  --m-xs: 11px; --m-sm: 13px; --m-ro: 15px; --m-md: 16px; --m-lg: 28px; --m-xl: 36px;
  /* 간격(4px 격자) · 폭 · 고정 높이 */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px; --s7: 48px; --s8: 64px; --s9: 96px;
  --w: 1240px; --measure: 40em; --measure-fine: 46em;
  --mast-h: 56px; --subnav-h: 40px; --head-h: 96px; --mbar-h: 52px;
  --radius: 0; --dur: 120ms;
}
@media (max-width: 600px) { :root { --t-display: 34px; --t-h2: 22px; --m-lg: 22px; --m-xl: 28px; } }
@media print { :root { --navy: #fff; --navy-2: #fff; --bg: #fff; --ink: #111; --ink-2: #333; --muted: #555; --faint: #6B7280;
  --gold: #8A6F3E; --gold-hi: #8A6F3E; --rule: rgba(0,0,0,.15); --rule-2: rgba(0,0,0,.35);
  --surface-1: rgba(0,0,0,.04); --surface-2: #fff; --surface-pop: #fff; } }
```

사용 규칙
- 글자색: 본문 --ink, 보조 --ink-2, 라벨·캡션 --muted, 출처·분모 --faint(텍스트 하한). --faint-deco는 선·비활성 option·장식에만. --gold-dim은 print 토큰 값으로만 쓰고 다크 지면에서 참조하지 않는다.
- 괘선 3단: --rule(행 구분·필드·KPI 칸 사이), --rule-2(절 상단·표 머리·legend·select·버튼 테두리·시트 상단), --rule-ink(h2 아래 .sec-head::after 48×1px, 푸터 시그니처 룰). --ctl-line은 입력 밑줄·세그먼트·탭·검색창 경계 전용.
- 골드 헤어라인 --gold-hair는 .gold-line(페이지당 1곳)과 .mbar border-image에만. 골드 채움면은 없다. 선택행은 좌측 2px --gold + --accent-soft, 기준칸은 2px --gold-hi 인셋.
- 상태색: 의미 3색(ok/warn/neg)은 결론 tone·배지·오류에만. --warn은 골드 축과 분리된 살구빛이며 워드마크 콜론(--gold-colon)과 값이 다르다. 히트맵은 --heat-*-rgb에 알파를 곱해 쓴다(청록 계열 금지).
- 반경 0, 그림자 0. 배지·버튼·팝오버·시트 모두 직각이고 경계는 1px 괘선뿐이다.
- 모션: color·background·border-color 120ms만. 위치·크기 애니메이션과 값 변경 flash는 없다. `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto } *, ::before, ::after { transition-duration: .01ms !important } }`, scrollIntoView behavior는 `scrollMode()` 헬퍼로 분기.
- 포커스: `:focus-visible { outline: 2px solid var(--gold-hi); outline-offset: 2px; box-shadow: 0 0 0 2px var(--navy) }`, `.field-input:focus-within { border-bottom: 2px solid var(--gold-hi) }`, `.bubble:focus-visible { stroke: var(--gold-hi); stroke-width: 3 }`.
- sticky 기준: `html { scroll-padding-top: calc(var(--head-h) + 8px) }`, ≤860 `scroll-padding-bottom: calc(var(--mbar-h) + 12px)`, `main { padding-bottom: 72px }`. `.uw-summary { top: calc(var(--head-h) + 8px) }`.
- 반 픽셀 글자 크기(10.5·11.5·12.5·13.5·14.5)는 0건. 9px은 푸터 시그니처 태그라인(핸드오프 §4 규격) 한 곳만 예외.

## 3. 타입 스케일 표

| 역할 | font | size | line-height | weight | letter-spacing | 용도 |
|---|---|---|---|---|---|---|
| display | Pretendard | 48px (≤600: 34) | 1.12 | 500 | -0.025em | 랜딩 h1 |
| h1 | Pretendard | clamp(32px, 3.6vw, 40px) | 1.2 | 600 | -0.02em | 페이지 제목 |
| h2 | Pretendard | 26px (≤600: 22) | 1.3 | 500 | -0.015em | 절 제목, .memo-head(22px/1.45) |
| h3 | Pretendard | 16px | 1.4 | 600 | -0.005em | 블록 소제목(margin 40px 0 12px), .limit h3, figcaption, .detail h3는 20px 500 |
| lead | Pretendard | 17px | 1.6 | 400 | 0 | .intro-lead, .lead, color --ink-2, max-width 40em |
| body | Pretendard | 15px | 1.65 | 400 | 0 | 본문, .limit p, .notes li, .memo-lender, 랜딩 라우팅 문장 |
| ui | Pretendard | 13px | 1.5 | 400 | 0 | 표 본문, 필드 라벨, 버튼, 세그먼트, notice, .checks li, .answers .q |
| caption | Pretendard | 12px | 1.45 | 400 | 0 | .fine, .kpi-sub(산식), .field-meta, .table-foot, .rule-meta, .memo-basis, .subnav-basis, color --muted, max-width 46em |
| kicker-latin | Jost | 11px | 1 | 500 | .3em uppercase | .eyebrow, .sec-no, .kicker(SNAPSHOT·LIVE), .memo-kicker, legend, 제품 nav b(.26em), 절 내비(.22em) |
| kicker-ko | Pretendard | 11px | 1 | 500 | .12em | 국문 소형 라벨(.memo-tone, .limit-key, 배지 맞음/불일치, 제품 nav span은 자간 0) |
| badge | Jost | 11px | 1 | 500 | .12em | PASS/FAIL/N/A, [중립] stance 태그(Pretendard 11px), 「수정됨」 |
| num-xs | IBM Plex Mono | 11px | 1 | 400 | 0 | 차트 tick, 히트맵 corner |
| num-cell | IBM Plex Mono | 12px | 1 | 400 | 0 | 히트맵 td, .cfval, .checks small, .heat-read, .ticker dd |
| num-sm | IBM Plex Mono | 13px | 1 | 400 | 0 | 표 .num, .stack-legend dd, .tally b, 합계행은 500 |
| num-ro | IBM Plex Mono | 15px | 1 | 400 | 0 | 서브내비 readout, 모바일 바 readout |
| num-md | IBM Plex Mono | 16px | 1 | 400 | 0 | 입력값, .facts dd, .field-derived 수치, .memo-target 입력 |
| num-lg | IBM Plex Mono | 28px (≤600: 22) | 1.1 | 400 | -0.02em | .kpi-value, .answers .a, .limit-value, .memo-figures 2~4칸; .uw-summary compact는 22px |
| num-xl | IBM Plex Mono | 36px (≤600: 28) | 1.05 | 400 | -0.025em | 결론 블록 첫 수치(Levered IRR, 대출 한도) |
| unit | Pretendard | .46em of parent | 1 | 500 | 0 | `.u` 단위 소형(만원·억·%·x·/년·bp), color --ink-2, margin-left 3px |

규칙: 단독 수치는 Mono, 문장 속 수치는 Pretendard `font-variant-numeric: tabular-nums`. Mono 18px 이상은 letter-spacing 음수. Jost 대문자는 라틴 라벨에만 쓰고 readout 라벨·국문 라벨은 Pretendard 11px.

## 4. 공통 컴포넌트 규격

### 4.1 Header (2단 마스트헤드, sticky top 0, z 20, --surface-2 + backdrop-filter blur 14px)
- 1단 `.mast` 56px. 좌 `<Link class="brand-lock" href={BRAND_HOME}>` = 워드마크(Jost 14px .3em, RE 600 / 콜론 --gold-colon 600 / VISION 250) + `<i class="brand-bar">`(1×12px --rule-2, margin 0 12px) + `<span class="brand-sub">LAB</span>`(Jost 11px .3em --gold). 우 `<a href="/market"><dl class="ticker" aria-label="금리">` 항목 `<div><dt>기준금리</dt><dd>3.00<small>%</small></dd></div>`, dt Pretendard 11px --muted, dd Mono 12px, `title="{label} · {asOf}"`, 끝에 `<i class="ticker-asof">ECOS 2026-09-22</i>`(11px --faint). rates는 layout.tsx 서버 fetch로 SSR. live=false면 `.ticker.stale::before { content: "마지막 확인값" }` --warn. rates null이면 「금리 불러오는 중」.
- 2단 `.subnav` 40px, 같은 sticky 컨테이너, border-bottom 1px --rule. 좌 제품 nav 3개 `<a><b>MARKET DESK</b><span>시세</span></a>` / `MODEL DESK PRO · 기관` / `MODEL DESK HOME · 개인`, b Jost 11px .26em --ink-2, span Pretendard 11px --muted, 가로 나란히 gap 6px. 활성 `aria-current="page"`, b --ink, 밑줄 1px --gold. 중앙 `.subnav-sec`(Pro 01~04, Home 01~02, Market 없음): Jost 11px .22em --muted, IntersectionObserver(rootMargin -40% 0px -55% 0px)로 `.on`은 --gold-hi. 그 옆 `.subnav-basis`(12px --muted, max-width 22em ellipsis, title 전문) 「영등포구 오피스텔 시장값 · 120세대 · 수정됨」(Market은 「영등포구 · 오피스텔 · 전체 면적 · 선택 없음」). 우 `.ro-group`(Pro·Home만): `.tone`(2×16px, ok/warn/neg, 판정 전 --rule-2) + `.ro` 3개 `<a href="#..."><i>Levered IRR</i><b>0.35%</b></a>`, i Pretendard 11px --muted, b Mono 15px --ink tnum, min-width 88px 우정렬. Pro: Levered IRR · 최소 DSCR · 최대 매입 단가. Home: 월 현금 · 5년 뒤 · 본전 상승률. 시장값 로딩 전 b는 DASH + `aria-busy`. Market에는 readout을 두지 않는다(바로 아래 KPI 6칸과 중복).
- ≤1080: `.subnav-basis` 숨김(같은 문구가 .memo-basis에 있음). ≤860: 절 내비·readout 숨김(하단 바가 대체), 제품 nav 가로 스크롤(scrollbar-width none), 항목 padding 10px 0(44px 탭). ≤600: 티커는 기준금리 1항목만. 「RE:LAB」 nav 항목과 「Lab」 중복 표기 제거, 죽은 `.brand*` 규칙 삭제. 인쇄에서 `.mast`·`.subnav` 숨김.
- body 첫 자식 `<a class="skip" href="#main">본문으로</a>`, 각 페이지 `<main id="main" tabIndex={-1}>`.

### 4.2 SectionHead
- `.sec { padding: var(--s6) 0 var(--s8); border-top: 1px solid var(--rule-2) }`. `.sec-head`: `.sec-no`(Jost 11px .3em --gold) → h2 → `.sec-head::after`(48×1px --rule-ink) → `.lead`. aside는 h2와 baseline 정렬, ≤600에서는 lead 아래(order 99), 버튼은 밑줄 링크형.
- `no`가 빈 문자열이거나 없으면 번호 미렌더(Market Desk). 러닝헤드 없음. `.sec-head` 아래 --s6, figure 사이 --s6, `.controls`·`.status` 아래 --s5.

### 4.3 KPI 타일 `.kpi` · facts
- border-top/bottom --rule, 칸 사이 세로 --rule, padding 16px 16px 16px 0. 라벨 12px --muted 한 줄(min-height 제거, 첫 등장에 Term) → 값 num-lg 400 + `<small class="u">` → sub 12px --muted. Pro의 sub는 항상 산식이다: 「총 회수 ÷ 보통주 자기자본 126.0억」「1년차 NOI ÷ 총 취득원가」「1년차 NOI ÷ 선순위 대출」「신규 ÷ 갱신 − 1 · 양수면 신규가 더 비쌈」. hover 전용 산식은 없다(터치·인쇄에서도 보인다).
- `audience="home"` 라벨 맵: 「전세를 월세로 바꾸는 이율 (전월세전환율)」「평당 월세 (보증금까지 월세로 환산)」「연 월세 수익률 (매입가 대비)」「새 계약과 갱신 계약의 월세 차이」「갱신 때 2년 더 살 권리를 쓴 비율」. 값·표본 sub는 동일.
- `.facts`는 인라인 정의 목록: `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`, `.facts > div { display: flex; gap: 8px; align-items: baseline; padding: 10px 16px 10px 0 }`, dt 12px --faint nowrap, dd num-md, dd `<span>`(12px --muted) 분모 「갱신 3,182건 중」. 라벨 끝에 측정 대상: 「인상률 4.5% 이상 비중」「갱신요구권 사용 비중」「월세 비중 (전세 제외)」. 자릿수 비중 0, 변화율 1.
- `.skel`: 로딩 중 KPI 6칸(라벨 60% 폭 12px, 값 40% 폭 28px)·표 6행·차트 180px 자리를 --surface-1 블록으로 채운다. 애니메이션 없음.

### 4.4 표 `.data`
- `<caption class="sr-only">`, th `scope="col"` 12px --muted 500 border-bottom --rule-2, 행 제목 `<th scope="row">`(13px --ink 500 좌정렬). td 13px, `.num` Mono 13px, `vertical-align: baseline`. 그룹 시작 열(준공·환산월세·수익률) `border-left: 1px solid var(--rule); padding-left: 18px`. 단위는 헤더 2행 `<small>`(11px --faint block): 「만원/평·월」「만원/평」.
- 정렬: `.sortable button::after { content: " ↕"; opacity: .35; display: inline-block; width: .8em }`, `.on::after { content: " ↓"; opacity: 1 }`, `.on.asc::after { content: " ↑" }`, `aria-sort`, 같은 키 재클릭 시 방향 토글. ≤600에서 button은 th 전체를 덮는 44px 목표. 정렬 th 안의 용어는 Term 버튼이 아니라 정적 `<dfn title>`.
- 행 hover --surface-1 + 마지막 열 `.row-act` 「선택」(opacity 0→1, `(hover: none)`과 print는 항상 1). 선택행 좌측 2px --gold + --accent-soft. 합계행 `.total` 500 border-top --rule-2. 첫 열 헤더 「항목 (억원)」「항목 (만원)」.
- 부호 규약: 라벨에 (−)가 있으면 값은 크기만. 소수 자릿수는 열 단위로 동일(Pro 현금흐름표 전 행 2자리). 음수는 `neg()`로 U+2212.
- ≤860: 첫 열 sticky(left 0, background var(--navy), box-shadow 1px 0 0 var(--rule)), 좌우 스크롤 그림자(background-attachment local), table-foot 「옆으로 밀면 나머지 열」. ≤600: 시장 표 동·준공·전용㎡·신규−갱신 열 숨김, 동·준공은 단지명 아래 `<small>`, 6열이 358px에 수납. 빈 표 「일치하는 단지가 없습니다 · 검색어를 줄이십시오」. table-foot 안내 「단지명을 누르면 상세와 「이 단지 값으로 가정 채우기」 · 열 제목을 누르면 정렬」.

### 4.5 필드 NumField · Seg · 배지
- `.field { display: grid; grid-template-columns: minmax(0,1fr) 176px; gap: 4px 12px; padding: 12px 0; border-bottom: 1px solid var(--rule) }` ≤600 2열 150px. 라벨 13px --ink-2(Term은 label 형제로, label 안에 중첩 금지). `.field-input { background: var(--surface-1); border-bottom: 1px solid var(--ctl-line); padding: 0 6px }` focus-within 2px --gold-hi. 입력 `type="text" inputMode="decimal" pattern="[0-9.,]*"`, Mono 16px 400 --ink 우정렬, padding 6px 0(≤860 9px 0, min-height 44px). blur 상태 천단위 구분(148,800), focus 시 원시값. `step="any"`, onWheel blur, enterKeyHint next(마지막 done).
- 키: ArrowUp/Down ±step(step 소수 자릿수로 toFixed), Shift ×10, Alt ×0.1, Enter 다음 컨트롤, Escape 편집 전 값 복원. 입력열 끝 `.fine` 「단축키: 위아래 방향키 ±step · Shift ×10 · Alt ×0.1 · Enter 다음 칸 · Esc 되돌리기」.
- 음수 허용 필드(임대료 성장률, 집값 상승률 등)는 `sign` prop으로 입력 왼쪽에 Seg 2칸 「상승 / 하락」을 붙이고 입력은 절대값만 받는다. inputMode는 decimal 유지.
- 단위 `.unit` 12px --muted max-width 5.5em ellipsis, 짧은 토큰만(%, 만원, 평, bp, 년, 억, ㎡). 기준은 라벨 괄호로: 「중개보수 (매수·매도 각)」「운영비 (연면적 평당 월)」. 1억 이상 금액 필드는 같은 줄 `.unit`에 「만원 · 14.9억」 환산 병기.
- 메타 한 줄 `.field-meta`(grid-column 1/-1, 12px, flex-wrap, gap 4px 10px): `[중립]` 태그(11px, 1px currentColor, 직각; 공격적 --neg, 중립 --ink-2, 보수적 --ok) + 위치 문구(--muted) + 출처(--faint, 「출처 ·」 접두 제거). 파생값 `.field-derived`(12px --ink-2, 수치 tnum) 별도 줄. 넘치면 ellipsis + title. stance na는 태그 없이 「공공데이터 없음 · 실사값 입력」. 행 높이 390px에서 90px 이하.
- 출처·되돌리기: lib의 Provenance는 문자열 그대로 두고, 채우기 시점 입력 스냅샷(suggestRental이 돌려준 input, Home fill의 값)을 컴포넌트 state `fillSnap`에 보관한다. 편집된 키는 `editedKeys`. 메타는 「직접 입력 · 시장값 2,947 [되돌리기]」(인라인 `.link`)로 바뀌고 되돌리기는 그 키만 `fillSnap`에서 복원. Home도 같은 경로.
- 오류: 범위 밖이면 `aria-invalid`, 밑줄 --neg, `.field-err`(12px --neg, grid-column 1/-1) 「0~100% 사이 값만 계산합니다 (100%로 계산 중)」. 빈 값 blur 시 「이전 값 5%로 되돌렸습니다」 1.5초.
- Seg: `role="radiogroup" aria-labelledby`, 버튼 `role="radio" aria-checked`, 선택만 tabIndex 0, ArrowLeft/Right/Home/End. 바탕 투명, 테두리 --ctl-line, `.on`은 아이보리 채움 + 네이비 글자. ≤860 min-height 40px, flex 1.
- select는 grid-column 2, border-bottom --ctl-line, 화살표 stroke %23EDEAE0, 옵션 「CD 91일 3.21%」(날짜는 메타 1회). 직접 입력 선택 시 select 자리에 NumField, 메타에 「지표로 되돌리기」.
- 고급 그룹 `<details class="adv"><summary>비용 <span>운영비 15% · 적립 2% · 보유세 0.25% · 취득세 4.6%</span></summary>`: summary 13px 600 padding 12px 0, span 400 --muted margin-left 8px, 마커 「+ / −」 텍스트. 시장 채우기로 접힌 그룹 안 값이 바뀌면 open. Pro는 비용·매각 비용·과세·우선주만 접고 자본구조(지표·가산금리·상환 방식·LTV)는 펼친다. Home은 핵심 6개만 펼치고 4그룹을 접는다(§5.4).
- 취득세 Seg는 `acqTaxMode`("offi"|"corp"|"custom") 상태로 분리, custom일 때만 NumField 렌더.

### 4.6 버튼 · 링크 · 상태 표기
- `.btn`: 투명 바탕, 1px --rule-2, 13px, padding 8px 14px, min-height 36px(≤860 44px), hover --surface-1. `.btn.primary`: 아이보리 채움, 네이비 글자, hover --gold-hi. 직각.
- `.link`: 밑줄 offset 3px, --ink-2, ≤860 padding 10px 0 inline-block.
- 상태 칩 폐지. `.status` 12px 한 줄: `<b class="kicker">SNAPSHOT</b> 실거래가 · 국토부 공개 CSV 2026-09 <b class="kicker">LIVE</b> 금리 · ECOS 2026-09-22`. kicker Jost 11px .3em, live만 --gold, 그 외 --muted. 원형 점(.chip::before, .tally span::before, 원형 .sw)은 전부 제거.
- 채우기 버튼 라벨 분기: `stale = basisKey !== \`${asset}|${code}|${band}|${selectedKey}\``. !stale && !edited → 「언더라이팅으로 이동」(Home 「내 조건으로 이동」), 클릭은 스크롤만. stale && !edited → 「이 지역 시장값으로 가정 채우기」. edited → 버튼 대신 인라인 `.notice` 「고친 값 4개를 시장값으로 바꿉니다 [바꾸기] [취소]」.

### 4.7 결론 블록 `.memo` (Pro) · 네 가지 답 (Home)
- 위치: 히어로 status 줄 바로 아래, 전폭. 위에 `.gold-line` 1px(페이지의 유일한 골드 헤어라인), 아래 border-bottom 1px --rule-2, padding var(--s6) 0. 테두리·배경·왼쪽 띠 없음.
- Pro `<section class="memo v-{tone}" aria-labelledby="memo-h">`: (1) `.memo-kicker` 「결론 · MEMO SUMMARY」(Jost 11px .3em --gold) + 우측 `.memo-tone`(kicker-ko, ok/warn/neg) 「목표 충족 / 목표 미달 / 원금 손실」. (2) `.memo-head` 22px/1.45/500 max-width 36em 토큰형 「Levered IRR 0.35% · 목표 8.0% 대비 −7.65%p · 목표 충족 매입 단가 2,582만원/평 (현재 대비 −12.4%)」, 「목표」 토큰 옆에 인라인 `.memo-target`(NumField compact, 폭 90px, 라벨 「목표」, 단위 %)을 두어 목표를 고치면 결론이 즉시 바뀐다. 03 한계선의 목표 IRR은 읽기 전용. (3) `.memo-figures` 4열(border-top/bottom --rule): IRR num-xl, EM·CoC·DSCR num-lg, 라벨 12px --muted, 산식 sub 12px, 단위 `.u`. (4) `.memo-lender` 15px --ink-2 「대주 기준: 매각가 −37.8%까지 원리금·보증금 전액 상환 · 최소 DSCR 1.32x」. (5) `.memo-basis` 12px --muted 「가정 기준 · 영등포구 오피스텔 시장값 · 120세대 가상 물건 · 실거래가 2026-09 스냅샷 · 금리 ECOS 2026-09-22」 + `<b class="basis-edited">수정됨</b>`(--warn 1px 테두리) + 「가정 9개: 공격적 0 · 중립 6 · 보수적 0 · 자료 없음 3」(숫자 Mono). (6) `.memo-actions` 「다음 · 가정 고치기 ↓ · 한계선 보기 · 검산 보기」(.link, #inputs·#limits·#audit). CSV·인쇄는 결과열 하단 `.btn-row`.
- Home: kicker 「네 가지 답 · SUMMARY」, (3) 대신 `.answers` 4칸(질문 13px --ink-2 / 답 num-lg + `.u` / 설명 12px 2줄 clamp, 두 문장: 산식 줄 + 「원금 상환 X만원은 내 자산으로 남습니다」), tone 단어는 「자기자본 부족」「대출 불가」일 때만, basis 「시세 기준 · 마포구 아파트 60~85㎡ 매매 중앙값 · 2026-09」, actions 「다음 · 내 조건 고치기 ↓ · 계산 확인 보기」. 실거주 「매달 나가는 돈」은 크기만, 임대 「매달 남는 돈」만 부호와 --neg.
- 입력 전 `.memo.v-idle`: kicker + 「시장값을 불러오면 가정 6개가 채워지고 결론이 여기 나옵니다 · 기다리지 않으려면 아래에 직접 입력」, 높이 예약 160px. `role="status"` 제거, 별도 `<p class="sr-only" aria-live="polite" aria-atomic="true">`에 1초 디바운스로 headline(Home은 답 4개 문자열) 방송.
- 결과열 `.uw-summary`(sticky, top calc(var(--head-h) + 8px), z 5, background --surface-2, backdrop-filter blur 14px, border-bottom --rule): headline 16px 1줄 + KPI 4 compact(22px) + 「요약으로 ↑」. 데스크톱에서 sticky는 이 블록뿐이며 높이 160px 이하. 같은 4개 수치는 memo(정본)·uw-summary·subnav readout·mbar에 나타나되 모두 같은 state를 읽는다.

### 4.8 검산 리스트 `.checks`
- li 13px flex gap 12px: 배지 + 라벨 + 상세. Pro 배지 PASS/FAIL/N/A(Jost 11px .12em, 1px currentColor, ok/neg/faint). Home 배지 「맞음 / 불일치 / 해당 없음」(Pretendard 11px)과 풀어 쓴 라벨 맵(「돈의 출처와 쓰임이 일치 (내 돈 + 대출 + 보증금 = 집값 + 세금 + 중개보수)」「대출 상환 합계가 원금과 일치」「연 수익률 계산이 스스로 맞아떨어짐」), 제목 「계산 확인」. 상세 `<small>` Mono 12px, `tidy()`로 −0.000000 → 0, 소수 2자리 절단, 「허용 ±0.01만원」 병기. 04 산식표에 Yield on Cost·Debt Yield 행 추가.

### 4.9 히트맵 `.heat`
- td Mono 12px, padding 9px 4px, border 2px --navy, min-width 56px, 바탕 `rgba(var(--heat-pos-rgb), var(--a))`(td 인라인 `--a`), 목표 미만 `td.below { background: rgba(var(--heat-neg-rgb), var(--a)); text-decoration: underline dotted; text-underline-offset: 3px; color: var(--ink-2) }`. 기준칸 `.base` 2px --gold-hi 인셋 + 700, 값은 `fmtBase`로 KPI와 같은 자릿수. 위험 `td.risk { box-shadow: inset 0 0 0 2px var(--neg); color: var(--neg-text) }`. th scope, `<caption class="sr-only">{title} · 기준 {threshold}</caption>`.
- `.heat { min-width: 420px; max-width: 640px }`, 세 표는 `.grid2.heats` 안, 4번째 칸은 「읽는 법」 텍스트 블록. figcaption span 범례: `<i class="sw heat-pos">`(12×6 사각) 「목표 8.0% 이상」 `<i class="sw heat-neg">` 「미만」 「굵은 테두리 현재 가정 · 붉은 테두리 원금 손실」.
- figure 상단 `.heat-read`(Mono 12px --ink-2, min-height 22px): hover/focus/방향키 시 「가산금리 250bp × 공실 7% → IRR 1.20% (현재 0.35%)」, td 로빙 tabIndex(기준칸 0), 방향키 이동. ≤600: `.heat { min-width: 0; width: 100% }` th·td padding 8px 2px 11px, tbody th sticky left 0 background --navy-2, 마운트 시 기준칸이 중앙에 오도록 scrollLeft.

### 4.10 차트 (charts.tsx)
- `.chart { overflow: hidden } .chart svg { max-width: 100% }`, beforeprint·orientationchange 재측정. tick 11px Mono --muted. 축 라벨은 SVG에서 빼고 figcaption span 「x 매매 단가 만원/전용평 · y 총수익률 %」.
- LineChart: 선 1.5px --ink, 표본 5건 미만 구간 별도 path `stroke-dasharray 2 3` + `.dot-thin`, 마지막 값·12개월 전 값 우측 `tick strong` 고정 라벨, onPointerMove/Down + `touch-action: pan-y`, `(hover: none)`이면 기본 hover 마지막 index, svg tabIndex 0 role="group" + ArrowLeft/Right + `<title><desc>`, `.chart-read aria-live="polite"` 기본 문구에 「점선 = 표본 5건 미만」.
- Scatter: 표시 원 뒤 투명 히트 원 r ≥ 14, 로빙 tabIndex(선택 원 또는 x 최소만 0), 방향키 x순 이동, Enter/Space 선택, `aria-pressed`, aria-label 「{단지} · 단가 2,875만원/평 · 수익률 5.94%」, 선택 원 stroke 2.5 --gold, `.pt-a` --ink. ≤600 높이 240. 기본 문구 「원 하나가 단지 하나 · 표에서도 고를 수 있습니다」.
- TimeScatter: 신규 채운 원 --ink, 갱신 빈 원 stroke #7E8AA3 1.4, 미표기 3px 사각 rect, 범례 .sw 같은 형태, svg 단위 최근접 점 탐색.
- CfBars props `{ op: number[], acq: number, sale: number }`: 운영 배당은 자기 최대값 기준(.pos --ink-2, .neg --neg), 취득·매각은 첫·마지막 열 별도 톤(취득 --neg, 매각 --seg-dep) 100% 클립 + `.clip::after` 점선, 마지막 열 라벨 「매각 포함」. `.cfval` Mono 12px. role="list", `.cfcol` role="listitem", `.cfarea` aria-hidden. ≤600 cfs.length > 7이면 `.many`: overflow-x auto, `.cfcol` flex 0 0 48px, scroll-snap.
- StackBar: 높이 18px, 톤 --seg-debt / --seg-pref(해치) / --seg-dep / --seg-eq, 폭 12% 이상 세그 안 `<b>47%</b>` Mono 11px 네이비, `.stack-legend dd` Mono 13px.

### 4.11 툴팁 · 정의 `Term`
- 마크업 `<span class="term-wrap"><button type="button" class="term" aria-expanded aria-describedby="def-ltv">LTV</button><span role="tooltip" id="def-ltv" class="def">…</span></span>`. 정의는 components/glossary.ts 상수(§6)에서 키로 찾는다.
- `.term { border: 0; background: none; padding: 0; font: inherit; color: inherit; text-decoration: underline dotted var(--faint); text-underline-offset: 3px }` hover/focus/open 시 밑줄 --gold. `.def { position: absolute; left: 0; top: calc(100% + 6px); z-index: 25; max-width: 28em; padding: 10px 12px; font: 400 13px/1.5 var(--font); color: var(--ink-2); background: var(--surface-pop); border: 1px solid var(--rule-2) }` 그림자 없음, 텍스트만. 우측 넘침은 `.flip`(마운트 시 getBoundingClientRect). hover/focus/탭 토글, 한 번에 하나, 문서 클릭·Escape로 닫힘. ≤860은 인라인 펼침(`.def { position: static; display: block; margin-top: 4px }`).
- 배치: 절마다 첫 등장 1회만. KPI 라벨, memo 지표명, facts dt, limits key, 필드 라벨 형제. 결론 문장 안·정렬 가능한 th 안에는 버튼을 두지 않고 정적 `<dfn title>`. `.table-wrap` 안에서는 title만(overflow 클립 회피). 인쇄에서 밑줄 제거.

### 4.12 모바일 하단 바 `.mbar` (≤860, fixed bottom, min-height 52px)
- `background: var(--surface-2); backdrop-filter: blur(14px); color: var(--ink); border-top: 1px solid transparent; border-image: var(--gold-hair) 1`. v-bad `inset 0 2px 0 var(--neg)`, v-ok `inset 0 2px 0 var(--ok)`. 골드 채움 없음.
- 좌 `<button class="mbar-ro">`: tone 단어(kicker-ko, ok/warn/neg) + readout 2개(Mono 15px 400, 라벨 `<i>` 11px --muted, 단위 포함 「IRR 0.35%」「DSCR 1.32x」 / 「월 −290만원」「5년 +2.9억」, title 전체명). 탭하면 `.mbar-sheet`(fixed bottom var(--mbar-h), max-height 60vh, overflow auto, background --navy-2, border-top --rule-2, padding 16px, 스크롤 위치 유지): 결론 headline + KPI 4 + 기준 문구(subnav-basis와 동일) + 절 내비 01~04 + 「가정 고치기 ↓」(#inputs).
- 우 `<button class="mbar-go">`: IntersectionObserver로 #inputs가 뷰포트에 있으면 「결론 보기」(#results), 아니면 「가정 고치기 ↓」(#inputs). aria-label에 readout 값 포함. `body:has(.field-input input:focus) .mbar { display: none }`.

### 4.13 로딩 · 빈 상태 · 오류
- 문구 2패턴 고정: 칩 「{대상} · 불러오는 중」, 본문 `.notice` 「{대상}을 불러오는 중입니다」(말줄임표 없음). `.notice { border-left: 2px solid var(--rule-2); background: var(--surface-1); font-size: 13px; padding: 10px 14px }`, `.notice.warn` 좌측 --warn, `role="alert"`는 오류에만.
- 지역·자산 전환: KPI 6칸·표 6행·차트 180px 자리에 `.skel`. 기존 데이터 갱신 중은 `.dim { opacity: .6 }` + `aria-busy` + `<span role="status">갱신 중</span>`.
- 오류: 「실거래가를 불러오지 못했습니다. 시군구를 바꾸거나 잠시 후 다시 시도하십시오. [다시 시도] <small>{error}</small>」. 단지 상세 실패(useMarket `detailError`): 「단지 거래를 불러오지 못했습니다. 다른 단지를 고르거나 잠시 후 다시 시도하십시오.」 regions null: 「지역 목록을 불러오지 못했습니다. 새로고침하십시오.」
- 표본 부족 `.empty`(13px --muted --surface-1, 차트 높이 유지): 「표본이 부족합니다 · 면적 구간을 전체로 [바꾸기]」(링크가 band=all). 결과열 입력 전은 `.memo.v-idle`(§4.7).

### 4.14 인쇄
- `@media print`에서 :root 토큰만 재정의(§2). body 흰 바탕 11px. `print-color-adjust: exact`는 `.heat td`, `.stack-bar`, `.cfarea span`에만. `.chart .line { stroke: #111 }`.
- 숨김: `.mast`, `.subnav`, `.mbar`, `.mbar-sheet`, `.btn`, `.controls`, `.term` 밑줄, `.row-act`. `.print-only` 머리줄 「RE:LAB · Model Desk Pro · 서울 영등포구 오피스텔 전체 · 조회 2026-09-23」 + 면책 한 줄. beforeprint에 details 전부 open + 차트 폭 재측정, afterprint 복원. 메모 블록은 1쪽 상단, `figure, .kpi, .limit, table { break-inside: avoid }`.

## 5. 페이지 레이아웃

### 5.1 / (랜딩)
- 데스크톱 1440: [헤더 96] → 히어로(padding 64px 0 40px): 눈썹 「RE:LAB · MODELLING」 → display h1 「부동산 사업성 분석 도구」 → lead 「기관의 통매입 검토와 개인의 집 한 채 검토. 같은 실거래가와 금리에서 출발해 각자의 언어로 답합니다.」 → 라우팅 문장 15px 「펀드·리츠·법인의 통매입 검토는 Pro, 내 집 한 채는 Home, 시세만 보려면 Market.」 → `.gold-line` 330px → 기준일 12px 「실거래가 2026-09 스냅샷 · 금리 ECOS 2026-09-22」 → `.desk-strip`(서버 컴포넌트 DeskStrip, /api/desk 4지역 × 매매 단가·환산월세·총수익률, 4열 .kpi, 각 열 `/market?asset&code` 링크, 캡션 「표본 지역 4곳 · 국토교통부 실거래가」, 홈페이지 병합 시 ticker로 재사용하도록 경계 독립) → `.desk-index`(border-top --rule-2, 행 2: 「01 | Model Desk Pro · 기관투자자 · 운용역 | 설명 15px --ink-2 | Levered IRR · DSCR · 한계선 역산 · 검산 | 열기」, 「02 | Model Desk Home · 개인 · 집 한 채 | … | 대출 한도 · 월 현금 · 5년 뒤 · 본전 상승률 | 열기」, 행 전체 링크, hover/active/focus --surface-1; 3행 얇은 띠 「Market Desk · 시세만 볼 때 · 오피스텔·아파트 · 열기」) → `.steps` 3단(01 지역을 고른다 / 02 가정을 고친다 / 03 결론과 검산을 본다, /pro#market 등 링크) → 예시 결과 2단(좌 Home .answers 4칸, 우 Pro .memo 축약, 정적 스냅샷, 캡션 「예시 · 기본 가정 · 2026-09 시세 · 가정을 바꾸면 결과가 바뀝니다」, P2) → `.fine` 「세 도구는 같은 실거래가·금리 데이터와 같은 계산식을 씁니다. 결과는 입력한 가정을 계산한 값이며 투자 권유가 아닙니다.」 → 푸터. `main { min-height: calc(100vh - 96px - 200px) }`.
- 첫 화면 1440×900: 헤더, 히어로 전체, 골드 라인, 기준일, desk-strip, desk-index 첫 행(Pro). sticky는 헤더뿐, 접힘 없음.
- 모바일 390: 히어로 padding 40px 0 24px, h1 34px, lead 4줄 이내, desk-strip 2×2, desk-index 세로 스택(번호·제목·대상·설명·열기), Pro 행이 812px 폴드 안. 예시 결과 세로.
- 푸터(전 페이지 공통): 중앙 핸드오프 §4 풀 시그니처(워드마크 28px, 룰 210/1.5px + 130/1px, 태그라인 9px .52em 골드 그라데이션, 라디얼 글로우 rgba(201,175,127,.11) 60% 이내) → 3열 12px --muted 「주식회사 리비전」 / 「데이터 · 국토교통부 실거래가 2026-09 · 한국은행 ECOS 2026-09-22」 / 「정보 제공 도구이며 투자 권유가 아닙니다」. `.foot { border-top: 0 }`.

### 5.2 /market
- 데스크톱: 헤더(subnav: 제품 nav + basis 「영등포구 · 오피스텔 · 전체 면적 · 선택 없음」, readout 없음) → 히어로: 눈썹 「MARKET DESK」, h1 「실거래가 시세 · 시군구와 단지」, lead 「국토교통부 실거래가에서 임대료, 매매가, 전월세전환율, 총수익률, 갱신 행태를 계산합니다. 모든 지표에 표본 수와 제외 기준, 조회일이 붙습니다.」, `.gold-line`, status 줄 → 절(번호 없음) h2 「지역 시세」 + aside 링크 2개 「이 조건으로 Pro 검토」「Home 검토」(`/pro?asset&code&band&key`) → 자산 세그먼트(role group, 아파트·오피스텔 순) → controls(시도·시군구 select, 면적 seg) → KPI 6 + facts 인라인 → 추이 차트 2단(펼침) → 산점도 → `#complexes` 단지 찾기 + 표 → 단지 상세(`.detail` 테두리 제거, border-top --rule-2, h3 20px, head 우측 「이 단지로 Pro 검토 / Home 검토」) → `#handoff` 띠(border-top --rule-2, padding 32px 0): 「이 조건으로 검토」 13px + 버튼 「이 조건으로 Pro 검토」「Home 검토」(asset·code·band·key 전달) → 푸터.
- 첫 화면: 헤더, 히어로, 절 제목, 컨트롤, KPI 6칸 상단. sticky는 헤더뿐. 접힘 없음.
- 모바일: controls 2열 grid(시도·시군구 한 줄, 면적 전폭), KPI 2열, 차트 세로, 표 6열 우선 + 첫 열 sticky, handoff 버튼 전폭 2개. mbar 없음.

### 5.3 /pro
- 데스크톱: 헤더(subnav: 01 시장 · 02 언더라이팅 · 03 한계선 · 04 검증, basis, tone + Levered IRR · 최소 DSCR · 최대 매입 단가) → 히어로(눈썹 「MODEL DESK · PRO」, h1 「기관투자자의 사업성 분석」, lead 1문장, 자산 탭 role tablist + 방향키 + aria-controls="underwrite", status 줄) → **결론 memo**(§4.7) → 01 시장 SectionHead(aside 채우기 버튼, 라벨 분기 §4.6) + controls + KPI 6(sub 산식) + facts + `<details class="mk-detail"><summary>시장 상세 <span>추이 · 단지별 비교 · 단지를 고르려면 펼치기</span></summary>`(추이 2·산점도·표, 단지 선택 시 open) + 단지 상세(details 밖) → 02 언더라이팅 SectionHead(aside 비움, lead 「입력값은 서버로 가지 않습니다…」) + `.uw`(400px | minmax(0,1fr), gap 48): 좌 `#inputs`(basis 행 → 자산(세대수·전용면적·매입 단가) → 취득(취득세 Seg + custom + 부대비, 두 탭 모두 자산 뒤) → 임대 5 → `.adv` 비용 「운영비 15% · 적립 2% · 보유세 0.25%」 → 자본구조(LTV·지표 select·가산금리·상환 방식·상환 기간 펼침, `.adv` 우선주 「우선주 없음」) → 매각(보유기간·Exit Cap 펼침, `.adv` 매각 비용·과세 「매각비용 1% · 도관」) → `.fine` 단축키), 우 `.uw-results`(static): `.uw-summary`(sticky) → facts 4(매각 순수령은 현금흐름 h3 옆) → notes → h3 조달과 사용(StackBar) → h3 보통주 현금흐름(CfBars) → details 연도별 현금흐름표(「항목 (억원)」, 부호는 크기만, 전 행 2자리) → `.btn-row`(현금흐름 CSV · 인쇄 · PDF) → 03 한계선(읽기 전용): limits 3열(`.limit-key` 12px --muted + `.limit-value` num-lg, 3열은 「최대 매입 단가 2,582만원/평」, 목표 IRR은 표시만) + `.grid2.heats`(히트맵 3 + 읽는 법) → 04 검증(산식표 + checks 2열) → 푸터.
- 첫 화면 1440×900: 헤더 96, 히어로 약 280, 결론 memo의 kicker·headline·figures 첫 행까지. IRR·EM·DSCR가 스크롤 없이 보인다. sticky: 헤더(2단)·uw-summary. 접힘: mk-detail, 비용, 우선주, 매각 비용·과세, 연도표.
- URL 시드: `useSearchParams()`(app/pro/page.tsx `<Suspense>` 안)로 asset·code·band·key 초기값, key가 있으면 onLoaded에서 fill(market, complex).
- 모바일 390: 헤더 2단(제품 nav 스크롤) → 히어로 → memo(figures 2×2) → 01(KPI 2열, mk-detail 접힘, 스켈레톤) → 02: `.uw-summary` static(order -1) + 「가정 고치기 ↓」 → 입력(legend는 sticky 아님, 입력 44px·16px) → 나머지 결과(인쇄 버튼 ≤600 숨김) → 03 limits 세로 → 히트맵 6열 수납 → 04. `.mbar` 「IRR 0.35% · DSCR 1.32x」 + 「결론 보기 / 가정 고치기 ↓」.

### 5.4 /home
- 데스크톱: 헤더(subnav: 01 시장 · 02 내 조건, basis 「마포구 아파트 60~85㎡ 시세」, tone + 월 현금 · 5년 뒤 · 본전 상승률) → 히어로(눈썹 「MODEL DESK · HOME」, h1 「집 한 채 매입 검토」, lead 「대출 한도, 매달 나가는 돈, 팔 때 남는 돈, 본전이 되는 상승률. 네 가지를 실거래가와 금리로 계산합니다.」, status) → **네 가지 답 memo**(§4.7 Home형) → 01 시장(자산 세그먼트 아파트·오피스텔 순이 종류를 겸함, `audience="home"` 라벨 맵, mk-detail 접힘) → 02 내 조건(lead 「값을 고치면 답이 바로 바뀝니다.」) + `.uw`: 좌 핵심 6개(용도 Seg, 매입가(만원 · 억 병기), 연소득, 지금 보유 주택, 대출 금리, 집값 상승률(sign Seg, 기본 2%, derived 「참고: 최근 1년 +17.0% · 장기 평균은 보통 2~3%」)) + 종류는 `.field-derived` 「종류 · 아파트 (시장 탭에서 변경)」 + `.adv` 4그룹: 「집과 규제 · 84.9㎡ · 수도권 (비규제) · 1주택 요건 충족」(지역 규제 아래 안내 「조정대상지역은 정부가 지정한 규제 지역입니다. 지정 현황은 국토교통부 고시에서 확인하십시오. 모르면 '수도권 (비규제)'로 두고 비교하십시오.」), 「대출 세부 · 기존 상환액 0 · 빌릴 수 있는 만큼 · 30년」(한도 풀이 「빌릴 수 있는 돈 4.6억 = 집값 기준(LTV 70%) 10.4억, 소득 기준(DSR 40%) 4.6억, 수도권 상한 6.0억 중 작은 값」을 .field 행으로), 「임대 조건 / 전세 조건」(용도가 실거주가 아니면 자동 open, 전세가율·역전세 풀이), 「보유·매각 세부 · 5년 · 관리비 20만원 · 준비금 0.3% · 중개 0.4% · 현실화율 69% · 기회수익률 3.5%」. 우 `.uw-summary`(답 4칸 compact sticky) → notes → h3 처음에 드는 돈(KPI 4) → h3 매달·매년(표 「항목 (만원)」, 억·만원 혼합 `wonKr`, 합계행 「연간 지출 합계」/「연간 순현금」) → h3 5년 뒤 팔면(KPI 4, 양도세 fine 풀이) → h3 계산 확인(checks 라벨 맵).
- 첫 화면: 헤더, 히어로, 네 가지 답 4칸 전체. sticky: 헤더·uw-summary. 접힘: mk-detail, adv 4.
- 모바일: memo 답 2×2 → 01 → 02 요약 → 「내 조건 고치기 ↓」 → 입력 → 결과. `.mbar` 「월 −290만원 · 5년 +2.9억」 + 토글 버튼.

## 6. 용어 정의 목록 (components/glossary.ts, 키: 한 줄 정의)

- LTV: 집값(감정가) 대비 대출 비율. 지역 규제와 보유 주택 수로 상한이 정해짐
- DSR: 연소득 대비 모든 대출의 연간 원리금 비율. 40%를 넘지 않는 선까지 빌릴 수 있음
- 스트레스 DSR: 금리가 오를 경우를 가정해 가산금리를 얹어 다시 계산한 DSR. 실제 한도가 더 줄어듦
- 실질 LTV: (대출 + 승계 보증금) ÷ 매입가. 보증금까지 빚으로 본 부담 비율
- 전월세전환율: 전세 보증금을 월세로 바꿀 때 쓰는 연 이율. 같은 단지 전세·월세 쌍에서 역산
- 환산월세: 보증금을 전환율로 월세로 바꿔 더한 값. 전용평당 월 단위
- 총수익률 (Gross): 연 환산월세 ÷ (매매가 − 보증금). 비용 차감 전
- 갭 (전세 끼고 매입): 매입가와 전세금의 차액만 내 돈으로 내고 사는 방식. 전세금은 돌려줄 빚
- 전세가율: 전세금 ÷ 매입가. 이 돈은 세입자에게 돌려줄 빚
- 역전세: 만기 때 전세 시세가 내려가 차액을 집주인이 현금으로 돌려주는 상황
- Cap rate: 연 NOI ÷ 자산 가격. 부동산의 수익률 잣대
- 진입 Cap: 1년차 NOI ÷ (매입가 − 승계 보증금). 살 때의 수익률
- Exit Cap: 매각 다음 해 NOI를 매각가로 바꾸는 수익률. 높을수록 매각가가 낮음
- Yield on Cost: 1년차 NOI ÷ 총 취득원가(매입가 + 취득부대비)
- NOI: 임대수입에서 공실·운영비·보유세를 뺀 순영업이익. 이자·원금 전
- EGI: 공실을 뺀 실제 임대수입
- DSCR: NOI ÷ 연 원리금. 1.2x면 원리금의 1.2배를 벌고 있다는 뜻. 1.2x 아래면 대주가 보통 거절
- Debt Yield: 1년차 NOI ÷ 선순위 대출. 대주가 보는 안전 여유
- Levered IRR: 대출을 낀 뒤 보통주 자기자본이 얻는 연 수익률. NPV가 0이 되는 할인율
- Unlevered IRR: 대출이 없다고 보았을 때 자산 전체의 연 수익률
- Equity Multiple: 보유기간 총 회수액 ÷ 투입 자기자본. 1.0x면 본전 (Home 표기 「배수」)
- Cash-on-Cash: 보유기간 배당가능 현금 ÷ 자기자본, 연평균
- 우선주: 보통주보다 먼저 정해진 배당과 원금을 받는 출자분. 매각 시 미지급 배당을 먼저 정산
- 도관 (리츠·펀드): 배당하면 법인세를 내지 않는 구조. 일반법인은 법인세 차감
- 원금 보전선: Levered IRR이 0이 되는 매각가 하락 폭. 그 아래면 보통주 원금 손실
- 대주 상환 한계선: 매각가가 이만큼 내려가도 대출과 보증금을 전액 상환하는 하락 폭
- 손익분기 입주율: 원리금을 딱 갚을 수 있는 입주율
- 최대 매입 단가: 목표 IRR을 딱 맞추는 매입 단가를 역산한 값
- 역레버리지: 대출금리가 진입 Cap보다 높아 대출을 늘릴수록 수익률이 떨어지는 상태
- 승계 보증금: 매입하면서 넘겨받는 세입자 보증금. 무이자 조달이지만 만기에 돌려줄 돈
- 매각 순수령: 매각가에서 매각비용·보증금·대출 잔액·세금을 뺀 뒤 보통주에 남는 돈
- 상환 방식: 만기일시(이자만 내다 만기에 원금) · 원리금균등(매달 같은 금액) · 원금균등(원금은 같고 이자는 줄어듦)
- 가산금리 (bp): 기준 지표 위에 얹는 금리. 100bp = 1%p
- 취득세: 살 때 한 번 내는 세금. 주택은 1~3%, 오피스텔·법인은 4.6%
- 취득세 중과: 보유 주택 수와 지역에 따라 취득세율이 8~12%로 오르는 규정
- 보유세: 재산세 + 도시지역분 + 지방교육세. 주거용은 종부세가 붙을 수 있음
- 종부세: 공시가격 합계가 기준을 넘는 주택 보유자에게 재산세 위에 더 매기는 세금
- 양도세: 팔 때 양도차익에 매기는 세금. 보유 기간·주택 수·거주 여부로 세율이 달라짐
- 장기보유특별공제: 오래 보유한 만큼 양도차익에서 빼 주는 공제
- 1세대1주택 비과세 요건: 2년 보유(조정대상지역은 거주)한 한 채는 12억까지 양도세 비과세
- 실효세율: 실제 낸 세금 ÷ 과세 차익
- 공시가격 현실화율: 정부 공시가격이 시세의 몇 %인지. 보유세 계산 기준
- 기회수익률: 이 돈을 집 대신 예금·채권에 두면 벌 수 있는 수익률
- 조정대상지역: 정부가 지정한 규제 지역. LTV와 취득세가 달라짐. 국토교통부 고시에서 확인
- 계약갱신요구권: 임차인이 한 번 2년 더 살겠다고 요구할 수 있는 권리
- 갱신 5% 상한: 갱신요구권을 쓴 계약은 임대료 인상이 5%를 넘지 못하는 규정
- 신규 − 갱신 격차: 신규 계약 임대료 ÷ 갱신 계약 임대료 − 1. 양수면 신규가 더 비쌈
- 갱신 인상률: 같은 집의 갱신 계약에서 임대료가 오른 비율의 중앙값
- 중앙값 (P50): 표본을 크기순으로 세웠을 때 가운데 값. 극단값에 덜 흔들림
- 표본: 계산에 쓴 실거래 건수. 적을수록 값이 흔들림
- 스냅샷: 국토교통부 공개 자료로 만든 고정 시점 데이터. 조회일이 붙음

## 7. 구현 계획

공통 규칙: 묶음 A가 먼저 끝난다. B·C·D는 A가 만든 토큰과 컴포넌트 API만 쓰고 globals.css를 수정하지 않는다(페이지 전용 규칙은 app/pro.css, app/home.css, app/market.css). lib/ 수정 없음, npm 의존성 추가 없음.

### 묶음 A · 디자인 시스템과 공통 컴포넌트
파일: app/globals.css, app/layout.tsx, app/page.tsx, components/Header.tsx, components/fields.tsx, components/charts.tsx. 신규 허용: components/glossary.ts, components/DeskStrip.tsx(서버 컴포넌트), app/icon.svg.
- P0
  1. globals.css :root 토큰 전면 교체(§2), 타입·간격 토큰으로 반 픽셀 전부 치환, 반경 0·그림자 0, `.sec`·legend·th·select·btn 괘선 하향, `.sec-head::after`, `.kicker`·`.u`·`.sr-only`·`.skip`·`.print-only` 신설, 포커스 링·reduced-motion, --faint 상향, --warn 분리, 입력 글자색 --ink, `.cfarea .pos`·`.seg-eq`·`.pt-a`·nav 활성·카드 키워드 골드 제거, 죽은 `.brand*`·중복 `.on`·`.chip::before`·`.tally::before`·원형 `.sw` 삭제, 인쇄 토큰 블록.
  2. globals.css 신설 블록: `.mast`·`.subnav`(2단, 모바일 2행·가로 스크롤), `.ro-group`·`.ro`·`.tone`, `.memo`(v-ok/warn/neg/idle)·`.memo-*`·`.answers`, `.uw-summary`(sticky)·`.uw-results` static, `.field-meta`·`.field-err`·`.field-input` surface, `.adv summary span`, `.desk-index`·`.desk-strip`·`.steps`, `.term`·`.def`·`.flip`, `.skel`·`.empty`·`.notice`, `.mbar`·`.mbar-ro`·`.mbar-go`·`.mbar-sheet`, `.row-act`, `.heat-read`·`td.below`·`td.risk`, `.checks` 배지, 푸터 시그니처, 모바일 44px 탭 타겟·입력 16px·controls 2열·scroll-padding-bottom.
  3. layout.tsx: 폰트 링크를 핸드오프 §1 문자열로(Jost 가변 100..700, Plex Mono 400;500), `getRates()` 서버 fetch → `<Header rates>`, skip 링크, 푸터 2단(시그니처 + 3열), `title.template "%s · RE:LAB"`, description에서 「실시간」 제거.
  4. Header.tsx: `Header({ rates })` 2단 마스트(brand-lock + BRAND_HOME 상수, dl 티커 + % + title + asof + stale + /market 링크, 제품 nav 3개 2층 라벨 + aria-current). `export SubNav({ items: {id, no, label}[], basis?: string, readouts?: {label, value, href}[], tone?: "ok"|"warn"|"neg"|null })` 절 내비 IntersectionObserver 포함. NAV에서 "/" 항목 제거.
  5. fields.tsx 헬퍼: `neg(s)`, `tidy(s)`, `splitUnit(s) → {value, unit}`, `wonKr(manwon)`, `scrollMode()`, `fmtRo(v, kind)`.
  6. fields.tsx `Kpi({ label, value, unit?, sub?, tone?, term?, compact? })`: 단위 `.u` 분리, sub는 항상 렌더.
  7. fields.tsx `SectionHead({ no?, title, lead?, aside? })`: no 없으면 번호 미렌더.
  8. fields.tsx `Memo({ variant: "pro"|"home", tone?, toneLabel?, kicker, headline?, target?, figures?, answers?, lender?, basis, edited?, tally?, actions, idle? })`: §4.7 구조, sr-only live 방송은 호출부.
  9. fields.tsx `NumField({ id, label, value, onChange, min?, max?, step?, unit?, derived?, stance?, position?, source?, marketValue?, onRestore?, sign?, term?, last?, compact? })`: text 입력·천단위 포맷·키보드(±step, Shift, Alt, Enter, Esc)·onWheel·검증·`.field-meta` 한 줄·되돌리기 링크·sign Seg·오류 문구.
  10. fields.tsx `Seg({ id, label, value, options, onChange })` radiogroup + 로빙 tabIndex + 방향키. `Term({ k, children?, static? })` + components/glossary.ts(§6 전체, `GlossaryKey` 타입). `Notice({ tone?, role?, children })`, `Skel({ kind: "kpi"|"rows"|"chart", n? })`.
  11. page.tsx 랜딩 재작성(§5.1): 눈썹·display h1·lead·라우팅 문장·gold-line·기준일(서버 fetch)·desk-index(h2 마크업)·steps·fine·개발 메타 문장 삭제·「갭투자」→「전세 끼고 매입」.
  12. charts.tsx P0: `Heat({ ..., legend: {pos, neg}, threshold, fmtBase, readLabel(r, c, v), centerBase? })` 토큰 색·below·risk·scope·caption·heat-read·로빙 tabIndex, tick 11px Mono, 축 라벨 제거, `.chart` overflow 안전망.
- P1
  13. charts.tsx `CfBars({ op, acq, sale, labels })` 2계열 + role list, `StackBar` 18px·라벨·해치 톤, LineChart 점선 저표본·마지막 값 라벨·포인터·키보드·aria-live, Scatter 히트 원·로빙 tabIndex·aria-pressed, TimeScatter 형태 분리·최근접 탐색, beforeprint·orientationchange 재측정.
  14. DeskStrip.tsx 서버 컴포넌트(/api/desk 4지역, 각 열 /market 링크, 캡션) + page.tsx 삽입.
  15. globals.css 모바일 표: 열 우선순위·첫 열 sticky·스크롤 그림자, 히트맵 6열, cfbars `.many`, `.def` 인라인 모드.
- P2
  16. app/icon.svg를 RE: 서브마크(배경 #070C17, RE 아이보리, 콜론 골드)로 교체, 청록 색 저장소 제거.
  17. page.tsx 예시 결과 2단(정적 스냅샷 값, 「예시」 라벨), OG 타이포 이미지.

### 묶음 B · components/ProApp.tsx (+ app/pro.css, app/pro/page.tsx Suspense 래퍼)
- P0
  1. 히어로 아래 `<Memo variant="pro">`: 토큰형 headline 조립(엔진 값 그대로, `neg()`), `target`에 목표 IRR NumField compact, figures 4(산식 sub), lender, basis + 「수정됨」 + tally, actions 3개. `role="status"` 제거, sr-only 1초 디바운스 방송.
  2. `<SubNav>` 삽입: items 01~04, basis 문구, readouts(Levered IRR · 최소 DSCR · 최대 매입 단가), tone. 시장값 전 DASH.
  3. 결과열 `.uw-summary`(headline + KPI 4 compact) / 나머지 static. `.btn-row`(CSV·인쇄)를 결과열 하단으로, SectionHead aside 비움. `id="inputs"`, `id="results"`.
  4. 입력열 재편: 취득 fieldset을 두 탭 모두 자산 뒤로, `acqTaxMode` 상태, `.adv` 비용·우선주·매각 비용·과세(summary 현재값), 자본구조 펼침, 기준금리 select 옵션 축약 + 직접 입력 전환, `sign` 필드(임대료 성장률), `.fine` 단축키, 라벨 괄호·단위 토큰 정리.
  5. Provenance: `fillSnap`·`editedKeys` state, 필드별 「직접 입력 · 시장값 X [되돌리기]」, 채우기 라벨 분기(stale 판정)와 edited 시 인라인 확인 notice.
  6. MarketPanel `compact audience="pro" fillLabel` 사용, mk-detail 접힘.
  7. 03 한계선: `.limit-key/.limit-value` 분리, 3열 「최대 매입 단가」 값, 목표 IRR 읽기 전용, 히트맵 3개 `.grid2.heats` + 읽는 법, Heat legend·threshold·fmtBase·readLabel 전달, ≤600 기준칸 중앙.
  8. 현금흐름표: 부호 크기만, 전 행 2자리, 「항목 (억원)」, `<th scope="row">`, caption. CfBars 2계열 props. KPI sub 산식 4개, 산식표 Yield on Cost·Debt Yield 행, 「Cap rate」→「진입 Cap」, 「완전월세」→「환산월세」, 「매입가를 X만원/평」→「매입 단가」. Equity Multiple·EM 표기 유지.
  9. `.mbar` 2버튼(readout 버튼 + 시트, IntersectionObserver 토글, aria-label 값), 로딩 문구 2패턴, 개발 메타 문장(184행) 교체.
- P1
  10. `useSearchParams` 시드(asset·code·band·key, key 있으면 onLoaded fill), 인쇄 `.print-only` 머리줄 + beforeprint details open, 자산 탭 방향키 + tabpanel.
- P2
  11. app/pro/page.tsx metadata, Term 배치 전수 점검(절당 첫 등장 1회).

### 묶음 C · components/HomeApp.tsx (+ app/home.css, app/home/page.tsx Suspense 래퍼)
- P0
  1. 히어로 아래 `<Memo variant="home">`: 답 4칸(질문 13px, 답 num-lg + `.u`, 설명 두 문장 2줄 clamp), 실거주 크기만 + 「매달 지출」, tone 「자기자본 부족 / 대출 불가」만, basis 줄, actions. sr-only 방송(답 4개 문자열).
  2. `<SubNav>`: 01 시장 · 02 내 조건, basis, readouts(월 현금 · 5년 뒤 · 본전 상승률), tone.
  3. 입력 재편: 핵심 6개(용도·매입가·연소득·보유 주택·대출 금리·집값 상승률) + `.adv` 4그룹(summary 현재값 문자열, 임대/전세 조건은 용도≠실거주 시 open, 채우기로 값 바뀌면 open). 종류 Seg 제거(asset 연동, 탭 순서 아파트·오피스텔, `.field-derived` 표기). 집값 상승률 기본 2% + 참고 derived + sign Seg. 지역 규제 안내 derived. 대출 한도 풀이를 `.field` 행으로, 옵션 「빌릴 수 있는 만큼」.
  4. 출처·되돌리기: NumField `source·marketValue·onRestore`로 「마포구 아파트 매매 중앙값」 표기, `fillSnap`, basis 행, 채우기 라벨 분기 + edited 확인 notice.
  5. 표: 헤더 「항목 (만원)」, `wonKr` 억·만 혼합, 합계행 「연간 지출 합계 / 연간 순현금」, `<th scope="row">`, caption. KPI unit 분리. 검산 「계산 확인」 + 라벨 맵(맞음/불일치/해당 없음). 양도세·전세가율·역전세·1세대1주택 비과세 요건 풀이 문구, LTV·DSR 첫 등장 풀이, lead 「값을 고치면 답이 바로 바뀝니다.」, h1·lead 교체.
  6. lib 문구 치환 맵(표시 계층): 「대출 0을 권합니다」 → 「전세 세입자가 먼저 돌려받을 권리가 있어 은행은 보통 담보대출을 내주지 않습니다. 이 계산은 대출 0으로 봅니다.」
  7. `.mbar` 2버튼(「월 −290만원 · 5년 +2.9억」), 로딩 문구 2패턴.
- P1
  8. `useSearchParams` 시드, MarketPanel `audience="home"`·compact·fillLabel, 인쇄 머리줄.
- P2
  9. app/home/page.tsx metadata, Term 배치 점검, 기준금리 참고 링크.

### 묶음 D · components/MarketPanel.tsx + components/MarketApp.tsx (+ app/market.css, components/useMarket.ts, app/api/desk/route.ts, app/market/page.tsx)
- P0
  1. MarketPanel props 추가: `compact?: boolean`, `audience?: "pro"|"home"`, `sectionNo?: string`(빈 값이면 미렌더), `fillLabel?: string`, `fillConfirm?: ReactNode`, `links?: {pro: string, home: string}`, `onRetry`. compact면 추이·산점도·표를 `details.mk-detail`로, selectedKey면 open, 단지 상세는 밖.
  2. KPI `unit` 분리, Pro sub 산식·Home 라벨 맵, facts 라벨 측정 대상 + 분모 span, 자릿수 규칙(비중 0, 변화율 1).
  3. 표: caption·scope·`aria-sort`·`{key, dir}` 토글·↕ 글리프·단위 2행 small·그룹 열 border-left·`.row-act` 「선택」·table-foot 안내·빈 표 문구·모바일 열 클래스. 상태 칩 → `.status` 텍스트. 자산 스위치 role=group + aria-pressed, 순서 아파트·오피스텔.
  4. 로딩·오류: `.skel`(KPI 6·표 6행·차트 180), 갱신 중 `.dim` + aria-busy + status, 오류 notice + [다시 시도] + small 원문, `detailError`(useMarket 반환 추가), regions null 문구, 표본 부족 `.empty` + band=all 링크, 문구 2패턴.
  5. MarketApp: h1·lead 교체(개발 메타 삭제), `sectionNo=""`, h2 「지역 시세」, aside 링크 2개 + 단지 상세 head 링크 2개 + `#handoff` 띠(asset·code·band·key), `.gold-line`.
- P1
  6. app/api/desk/route.ts: delta null → 빈 문자열, 0 → 「0.0%p」, 방향은 dir 필드만, em-dash(U+2014)·「▲▼」 글리프 제거.
  7. 산점도 figcaption 축 라벨, 「신규 − 갱신」 sub 정의, 열 title 산식.
- P2
  8. app/market/page.tsx metadata, Term 배치 점검.

## 8. 수용 기준 (스크린샷 검증)

1. /pro 1440×900 첫 화면에 「결론 · MEMO SUMMARY」 kicker, 토큰형 headline, 목표 IRR 인라인 입력, Levered IRR 36px 수치가 스크롤 없이 보인다.
2. /home 1440×900 첫 화면에 네 가지 답 4칸 전체가 보이고, 실거주 모드 「매달 나가는 돈」에 음수 부호가 없다.
3. 어느 페이지든 h1이 h2보다 크고 굵다(40/600 대 26/500). 390px에서 h1 32px 이상, h2 22px.
4. 전체 CSS에 소수점 px 글자 크기가 없다(grep `\d\.5px` 0건). 글자 크기는 11·12·13·15·16·17·22·26·28·36·40·48 안에서만(푸터 태그라인 9px 1곳 제외).
5. /pro 입력열 숫자 30여 개가 아이보리(#EDEAE0)이고, 골드 계열은 눈썹·절 번호·헤어라인 1줄·활성 nav 밑줄·선택 상태·포커스에만 나타난다. 결론 블록에 테두리·배경·왼쪽 띠가 없고 위에 골드 헤어라인 1줄이 있다.
6. KPI 「13.26만원」 확대 캡처에서 「만원」이 숫자의 절반 이하 크기, Pretendard, --ink-2로 렌더된다.
7. /pro 결과열을 1,000px 스크롤한 캡처에서 상단 고정은 헤더 2단과 요약(headline 1줄 + KPI 4)뿐이고, 조달과 사용·현금흐름은 흐름대로 지나가 있다. 고정 영역 합계 260px 이하.
8. /pro 어느 스크롤 위치 캡처에도 서브내비 우측에 tone 막대와 Levered IRR · 최소 DSCR · 최대 매입 단가 3개 값이 있고, 그 값이 memo·KPI와 같은 숫자다. 현재 절만 --gold-hi다. 러닝헤드는 없다.
9. 390px 헤더 캡처에 워드마크·LAB·기준금리 1항목·제품 nav 3개(2층 라벨)가 모두 보이고 scrollWidth = 390이다.
10. 390px /pro 하단 바가 네이비 반투명에 골드 헤어라인 상단 1줄, 아이보리 Mono 수치이며, 좌측 readout 탭 시 시트에 headline·KPI 4·기준 문구·절 내비·「가정 고치기」가 나타난다. #inputs가 보이는 동안 우측 버튼이 「결론 보기」, 아니면 「가정 고치기 ↓」다.
11. 표 헤더에 정렬 가능 열마다 「↕」가 보이고 활성 열은 「↓」 또는 「↑」다. 환산월세·매매단가 헤더 아래 단위 2행이 있다. 행 hover 시 마지막 열에 「선택」이 나타난다.
12. 연도별 현금흐름표의 (−) 행에 음수 부호가 없고 전 행 소수 2자리, 첫 열 헤더가 「항목 (억원)」이다.
13. 필드 한 행이 라벨·값·파생·메타 한 줄로 4줄 이내이며 390px 행 높이 90px 이하. 입력칸에 옅은 면과 밑줄이 있고 ≤860에서 높이 44px·글자 16px이다.
14. 값을 고친 필드 메타에 「직접 입력 · 시장값 2,947 [되돌리기]」가 나타나고 다른 필드의 메타는 그대로다. 공실률에 150 입력 시 붉은 밑줄과 「0~100% 사이 값만 계산합니다」가 보인다.
15. 값을 고친 상태에서 채우기 버튼을 누르면 「고친 값 N개를 시장값으로 바꿉니다 [바꾸기] [취소]」 notice가 나타나고, 조건 불변·미수정 상태에서는 버튼 라벨이 「언더라이팅으로 이동」(Home 「내 조건으로 이동」)이다.
16. 히트맵 캡처에서 목표 미만 셀은 점선 밑줄, 기준칸은 골드 2px 테두리, figcaption에 사각 범례 2개와 「목표 8.0% 이상 / 미만」이 있다. 셀 hover 캡처에 「가산금리 250bp × 공실 7% → IRR 1.20% (현재 0.35%)」 줄이 있다. 흑백 변환에서 두 면의 명도가 갈리고 청록(#159E5F·rgb 21,94,99 계열) 픽셀이 저장소에 없다.
17. 지표명(예: Levered IRR, 전월세전환율)에 절당 1회 점선 밑줄이 있고, hover 캡처에 --navy-2 불투명 바탕·1px 테두리·그림자 없는 한 줄 정의가 나타난다. 물음표·아이콘이 없다.
18. 지역을 바꾸는 순간 캡처에 KPI 6칸·표 6행 자리 스켈레톤이 보이고, 오류 강제 시 「실거래가를 불러오지 못했습니다 … [다시 시도]」와 원문 small이 보인다. 표본 부족 시 「면적 구간을 전체로 [바꾸기]」 링크가 있다.
19. /home 02 입력열에 펼쳐진 컨트롤이 6개이고 `details.adv` summary 4개가 각각 현재값 문장(「집과 규제 · 84.9㎡ · 수도권 (비규제) · 1주택 요건 충족」 등)을 보여 준다. /pro는 자본구조 필드가 펼쳐져 있다.
20. /market 하단에 「이 조건으로 Pro 검토 / Home 검토」 버튼 2개가 있고, 누른 뒤 /pro URL에 asset·code·band가 붙으며 서브내비 basis가 같은 지역을 표시한다.
21. 랜딩 1440 캡처에 눈썹·display h1·골드 라인·기준일·desk-strip 4열·Pro/Home 두 행·Market 띠·3단계·푸터 시그니처가 모두 있고 하단 40% 빈 공간이 없다. 「브랜드 토큰」「/api/desk」「실시간」「권합니다」 문장이 어느 페이지에도 없다.
22. 화면 어디에도 원형 점 마크(상태 칩·집계·범례)와 아이콘이 없고, 사용자 노출 문자열에 em-dash(U+2014)·느낌표가 없다(grep 0건). 음수 부호는 전부 U+2212다.
23. 인쇄 미리보기(Chrome, 배경 그래픽 끔)에서 흰 바탕에 검정 글자로 메모 블록·KPI·표·히트맵이 읽히고, 접힌 현금흐름표가 펼쳐져 있으며, 머리줄에 지역·자산·조회일이 있고 헤더·하단 바·버튼이 없다.
24. Tab 키만으로 /pro를 진행한 캡처 시퀀스에서 산점도가 원 하나에서만 멈추고, 세그먼트는 그룹당 한 번만 멈추며, 포커스 링이 아이보리 채움 버튼 위에서도 골드 링 + 네이비 띠로 보인다.
25. 브라우저 탭 파비콘이 네이비 바탕의 「RE:」 서브마크다. 헤더 티커에 % 단위와 「ECOS 2026-09-22」가 있고 SSR HTML에 값이 포함되어 있다.

## 9. 감사 항목 처리표

| 번호 | 처리 |
|---|---|
| 1, 2, 7, 8, 9, 13, 15, 19, 69, 86, 102 | A-P0-1 (타입·간격·괘선·Mono 규칙, 반 픽셀 제거) |
| 3, 62, 93 | A-P0-5·6 (`Kpi unit`, `splitUnit`, `.u`, Mono 스택) + B/C/D 호출부 |
| 4, 20, 27, 113, 136 | A-P0-8 `Memo` + B-P0-1 (히어로 아래 결론, 토큰형 문장, basis, sr-only 방송) |
| 5, 37, 38, 42, 44, 45, 49, 50, 51, 74, 126 | A-P0-9 `NumField` 재작성 (text 입력·포맷·키보드·검증·메타 한 줄·터치 크기) |
| 6, 30, 80 | B-P0-3 (`.uw-summary` 분리, btn-row 결과 하단 이동) |
| 10, 18, 70, 139 | A-P0-8 Home 답 규격 + C-P0-1 |
| 11 | B-P0-7 (`.limit-key/.limit-value`, 3열 최대 매입 단가) |
| 12, 59, 119 | A-P0-2 표 CSS + D-P0-3 (baseline·그룹 열·정렬 방향·aria-sort·scope) |
| 14, 61, 66 | A-P0-2 `.facts` 인라인 + D-P0-2 (측정 대상 라벨·분모) |
| 16, 67, 77, 82, 121 | A-P1-13 charts (축 라벨 이동·점선·포인터·키보드·overflow 안전망) |
| 17, 24, 85, 148, 161, 165, 167 | A-P0-11 랜딩 desk-index (Pro·Home 2행 + Market 띠, 「열기」, h2 마크업) |
| 21 | B-P0-3, C-P0-1 (sticky는 요약만) |
| 22, 97, 149, 155, 156 | A-P0-4 Header 2단 (brand-lock, 「RE:LAB」 항목 제거, 2층 라벨) |
| 23, 71, 112, 150 | A-P0-2·4 (≤860 제품 nav 2행 유지, aria-current) |
| 25, 33, 132 | D-P0-5·3 (Pro/Home 링크·handoff·표 안내) + B-P1-10, C-P1-8 (useSearchParams 시드) |
| 26 | A-P0-4 `SubNav` (절 내비는 서브내비에 병합, 러닝헤드 없음) |
| 28, 46, 52 | B-P0-4 (Pro `.adv` 4곳·취득 fieldset·acqTaxMode), C-P0-3 (Home 핵심 6 + adv 4) |
| 29 | D-P0-1 `compact` + `mk-detail` |
| 31 | A-P0-2 라벨 분기 규칙 + B-P0-5, C-P0-4, D-P0-1 `fillLabel·fillConfirm` |
| 32 | A-P0-7 `SectionHead no` + D-P0-5 |
| 34, 141 | C-P0-5 |
| 35, 39, 73, 83, 124 | B-P0-9, C-P0-7 (`.mbar` 2버튼·시트·IO 토글·단위·aria-label) + B-P0-1 목표 IRR memo 인라인 |
| 36, 95, 129, 151 | A-P0-11 (page.tsx), B-P0-9 (ProApp 184행), D-P0-5 (MarketApp lead) |
| 40 | A-P0-9 `sign` prop (상승/하락 Seg, 절대값 입력) |
| 41 | B-P0-5, C-P0-4 (`fillSnap`·`editedKeys`·필드별 되돌리기; lib Provenance는 문자열 유지) |
| 43, 87, 140, 130 | C-P0-3 (상승률 기본 2%, 한도 풀이 행, 규제 안내, LTV·DSR 풀이) |
| 47 | C-P0-3 (종류 Seg 제거, asset 연동) |
| 48, 75 | A-P0-10 `Seg` radiogroup + A-P0-2 탭 타겟 44px |
| 53 | B-P0-4 (select 옵션 축약, grid-column 2, 직접 입력 전환) |
| 54, 117 | A-P1-13 `CfBars {op, acq, sale}` + B-P0-8 |
| 55, 64, 68, 99, 116 | A-P0-12 `Heat` 토큰 색(세이지/로즈, 청록 채택 안 함)·범례·below·risk + B-P0-7 heats grid |
| 56, 143 | B-P0-8 (부호·자릿수·헤더, KPI 산식 sub, 산식표 2행) |
| 57 | A-P0-5 `neg()` + B/C/D 표시 계층 적용 (lib/format 미수정) |
| 58, 147 | A-P0-5 `wonKr` + C-P0-5 |
| 60, 72, 88 | A-P1-15 모바일 표·controls CSS + D-P0-3 열 클래스 |
| 63 | A-P1-13 `StackBar` (해치 우선주, 라벨, 18px) |
| 65 | A-P0-5 `tidy()` + B-P0-8, C-P0-5 |
| 76, 111 | A-P1-13 Scatter 히트 원·로빙 tabIndex |
| 78 | A-P1-15 히트맵 6열 + B-P0-7 기준칸 중앙 scrollLeft |
| 79 | A-P1-15 `.cfbars.many` |
| 81, 114, 115, 104 | A-P0-1 (--faint 상향, `.sec-no` --gold, --faint-deco 분리) |
| 84, 122, 127, 110, 120 | A-P0-1 (scroll-padding-bottom, reduced-motion, skip 링크, 포커스 링, --ctl-line) |
| 89, 98, 100, 107, 166 | A-P0-1 (골드 4장치, 괘선 하향, 투명 버튼, 죽은 선택자·중복 `.on` 삭제) |
| 90 | A-P2-16 (icon.svg 서브마크) |
| 91, 103 | A-P0-1 (골드 → 아이보리 환원, 점·원형 스와치 제거, `.status` 텍스트) + D-P0-3 |
| 92 | A-P0-1 (--gold-colon 분리, --warn 살구빛) |
| 94, 162 | A-P0-3·11 (푸터 시그니처 2단, 랜딩 gold-line) |
| 96, 152, 163 | A-P0-11 (랜딩 h1·lead·「실시간」 제거), C-P0-5 (Home h1·lead), D-P0-5 (Market h1·lead) |
| 101 | A-P0-2 `.mbar` 네이비 스크림 + 골드 헤어라인 |
| 105, 142 | D-P1-6 (/api/desk em-dash·삼각 글리프 제거) |
| 106 | A-P0-3 (폰트 링크 핸드오프 §1) |
| 108 | A-P1-13 `.chart` overflow 안전망; 캡처 방식 문제였다면 수용 기준 9로 닫는다 |
| 109 | A-P0-1 인쇄 토큰 + B-P1-10, C-P1-8 (beforeprint, print-only) |
| 118 | D-P0-3 (Market 자산 스위치 group), B-P1-10 (Pro 탭 방향키 + tabpanel) |
| 123, 128, 137, 146 | D-P0-4 (`.dim` .6·status·detailError·오류 문구·로딩 2패턴) + B/C 로딩 문구 |
| 125, 145, 153, 154 | A-P0-3·4 (dl 티커 SSR·%·asof·stale·/market 링크) |
| 131 | D-P0-2 `audience="home"` 라벨 맵 + C-P1-8 |
| 133 | C-P0-5 (검산 라벨 맵) |
| 134, 135 | A-P0-11 (「전세 끼고 매입」), C-P0-5 (전세가율·역전세·양도세·1세대1주택 풀이) |
| 138 | B-P0-8 (매매 단가/매입 단가/매입가, 환산월세, 진입 Cap). 「EM → 배수」는 Home에만 적용(Pro는 Equity Multiple 유지, 감사 원안 일부 보류) |
| 144 | C-P0-6 (표시 계층 문구 치환 맵; lib 문자열은 수정하지 않음) |
| 157, 158, 160 | A-P0-11 steps + A-P1-14 DeskStrip (P2 → P1 상향) |
| 159 | A-P2-17 (예시 결과 정적 스냅샷, 보류 사유: 값 생성 스크립트가 필요해 마감 단계로) |
| 164 | B-P2-11, C-P2-9, D-P2-8 (라우트별 metadata·Suspense 래퍼) |
| 38의 「억 단위 입력 전환」 부분 | 보류: 엔진 단위(만원)와 어긋나 오류 위험. 같은 줄 「만원 · 14.9억」 병기로 대체 |
| 20의 verdict-strip, 26·Spec 1의 러닝헤드 | 보류: 메모 블록이 히어로 아래로 오고 서브내비 readout이 상시 표시되므로 중복. 도입하지 않음 |
