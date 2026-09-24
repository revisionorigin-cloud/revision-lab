# RE:LAB 디자인 구현 보고 (DESIGN_SPEC v1.1 기준)

작성 2026-09-24 · 최종 통합 검증. 기준 문서는 docs/DESIGN_SPEC.md(§0 v1.1 우선). lib/ 미수정, npm 의존성 추가 없음, git 커밋 없음.

## 1. 검증 결과

- `npx tsc --noEmit -p .` 오류 0 · `npx eslint .` 오류·경고 0
- `npx vitest run` 5 파일 · 54/54 통과
- `npx next build` 컴파일 성공
- em-dash(U+2014) grep: app·components 0건. lib 안 2건(market.ts:27, types.ts:10)은 주석이며 화면에 나오지 않음. useMarket이 lib 오류 문구의 「실시간」·환경변수명을 걸러 냄
- 화면 문자열(body innerText, /·/pro·/home): U+2014 0 · 느낌표 0 · 하이픈 음수 0(음수는 전부 U+2212)
- 콘솔 오류: 4 라우트 0건(오프라인 강제 시의 net::ERR 1건은 의도된 오류 상태)
- /market: 308 → /pro, 쿼리 유지 확인. 「Market Desk」·「/market」 링크 0건
- 캡처: 4 페이지 × 1440/390(scratchpad/shots/final) + 인터랙션·인쇄·탭 순서 캡처 약 25장
- 캡처 도구 메모: verify.sh의 390 캡처(Edge --window-size)는 브라우저 최소 창 폭 때문에 더 넓게 렌더된 뒤 잘린다. 390 판정은 scripts/qa/shot.mjs(퍼펫티어 뷰포트) 캡처 m390_*.png 기준

## 2. 묶음별 구현

### 묶음 A · 디자인 시스템과 공통 컴포넌트
- app/globals.css(783행): :root 토큰 전면(§2), 타입·간격 토큰, 반 픽셀 0건, 반경 0·그림자 0, 포커스 링(gold-hi 2px + navy 2px), reduced-motion, 인쇄 토큰, `.mast`/`.subnav`/`.ro-group`/`.tone`, `.memo`(v-ok/warn/neg/idle, ::before 골드 헤어라인), `.uw-summary` sticky, `.field*`, `.term`/`.def`/`.flip`, `.skel`/`.empty`/`.notice`, `.mbar`/`.mbar-sheet`, 표 모바일(첫 열 sticky·열 숨김·44px 정렬 버튼), 히트맵 6열, 푸터 시그니처
- app/layout.tsx: 핸드오프 §1 폰트 링크, getRates SSR → Header, skip 링크, 푸터 2단(시그니처 + 3열), title.template
- components/Header.tsx: brand-lock(BRAND_HOME) · dl 티커(%·title asOf·stale·asof) · 제품 nav 2개(2층 라벨·aria-current) · `SubNav`(절 내비 IntersectionObserver·basis·readout 3·tone)
- components/fields.tsx(530행): 헬퍼 neg/tidy/splitUnit/wonKr/scrollMode/fmtRo, `Kpi`(unit 분리·sub 상시), `SectionHead`(no 없으면 미렌더), `Memo`(pro/home/idle), `NumField`(text·천단위·±step/Shift/Alt/Enter/Esc·onWheel·검증·메타 한 줄·되돌리기·sign Seg·오류 문구), `Seg`(radiogroup·로빙·방향키), `Term` + components/glossary.ts(§6 전체), `Notice`, `Skel`
- components/charts.tsx: `Heat`(토큰 색·below·risk·base·heat-read·로빙·caption), `CfBars`({op, acq, sale}·role list), `StackBar`(18px·해치), `LineChart`(저표본 점선·끝값 라벨·포인터·키보드·aria-live), `Scatter`(히트 원·로빙·aria-pressed), `TimeScatter`, beforeprint·orientationchange 재측정
- app/page.tsx 랜딩(§5.1) + components/DeskStrip.tsx(서버 컴포넌트, 4열 자산별 /pro·/home 링크) · app/icon.svg RE: 서브마크
- P2 미착수: 랜딩 예시 결과 2단(정적 스냅샷), OG 타이포 이미지

### 묶음 B · components/ProApp.tsx + app/pro.css + app/pro/page.tsx
- 히어로 아래 `Memo`: 토큰형 headline, 목표 IRR 인라인 NumField, figures 4(산식 sub), lender, basis + 「수정됨」 + tally, actions 3, sr-only 1초 방송
- `SubNav` 01~04 · readout(Levered IRR · 최소 DSCR · 최대 매입 단가) · tone. 결과열 `.uw-summary`(sticky, 헤더 96 + 요약 145 = 241px)
- 입력열: 취득 Seg(acqTaxMode) · adv 4(비용·우선주·매각 비용·과세·보조 표) · 자본구조 펼침 · 기준금리 select + 직접 입력 · sign 필드 · 단축키 fine
- fillSnap·editedKeys · 필드별 「직접 입력 · 시장값 X [되돌리기]」 · 채우기 라벨 분기 · 인라인 확인 notice
- 03 한계선 `.limit-key/.limit-value` · heats 3 + 읽는 법 · 04 산식표(Yield on Cost·Debt Yield) + checks
- 현금흐름표(「항목 (억원)」·부호 크기만·전 행 2자리·scope=row·caption) · CfBars 2계열 · CSV·인쇄 버튼 결과 하단
- `.mbar` 2버튼 + 시트(IntersectionObserver 토글) · useSearchParams 시드(Suspense) · print-only 머리줄 · beforeprint details open · 자산 탭 방향키

### 묶음 C · components/HomeApp.tsx + app/home.css + app/home/page.tsx
- 네 가지 답 `Memo`(질문 13px·답 num-lg·설명 2줄, 실거주는 크기만, tone은 자기자본 부족·대출 불가만) · `SubNav` 01~02 · readout(월 현금·5년 뒤·본전 상승률)
- 핵심 6 + adv 4(현재값 summary, 용도에 따라 임대·전세 조건 자동 open) · 종류 `.field-derived` · 상승률 기본 2% + sign + 참고 · 규제 안내 · 한도 풀이 `.field` 행
- snap 기반 되돌리기·채우기 라벨 분기·확인 notice · 표(「항목 (만원)」·wonKr·합계행) · 계산 확인(맞음/불일치/해당 없음) · lib 문구 치환(전세 담보대출 안내)
- `.mbar`(「월 290만원 · 5년 −0.4억」) · useSearchParams 시드 · print-only

### 묶음 D · MarketPanel.tsx · useMarket.ts · api/desk/route.ts · next.config.ts
- props compact/audience/sectionNo/fillLabel/fillConfirm/links/onRetry · `details.mk-detail`(단지 선택 시 open) · 교차 링크(절 머리 1 + 단지 상세 1)
- KPI unit 분리 · Pro 산식 sub · Home 라벨 맵 · facts 분모 span · 자릿수(비중 0·변화율 1)
- 표 caption·scope·aria-sort·같은 열 재클릭 토글·↕ ↓ ↑·단위 2행·그룹 열·`.row-act` 「선택」·table-foot·빈 표 문구·모바일 열 클래스
- `.skel`(KPI 6·표 6·차트 180) · `.dim`+aria-busy · 오류 notice + [다시 시도] + small 원문 · detailError · regions null · `.empty`(band=all 링크)
- /market 폐지: MarketApp.tsx·app/market 삭제, redirects 308(쿼리 유지) · api/desk delta 크기만 + dir

### 최종 통합에서 고친 것
- app/globals.css: `.field-meta > span:has(> .link)`, `.field-derived:has(> .link)`에 padding 5px + margin −5px. overflow hidden 상자 안의 「되돌리기」 포커스 링이 왼쪽 1px만 보이던 문제(§8-24). 배치 변화 없음
- app/globals.css: `.field-meta .link, .field-derived .link { font-size: inherit }`. 12px 줄 안의 13px 링크가 390px 수정 상태 행을 91px로 키우던 것(§8-13)

## 3. 수용 기준 §8 상태

| 번호 | 상태 | 근거 |
|---|---|---|
| 1 | 충족 | pro 1440 첫 화면(900px 안)에 kicker·토큰형 headline·목표 입력·36px IRR |
| 2 | 충족 | home 1440 답 4칸 y 380~560 · 「매달 얼마가 나가나 290만원」 부호 없음 |
| 3 | 충족 | h1 40px/600 · 절 h2 26px/500 · 390에서 h1 32px·h2 22px |
| 4 | 충족 | `\d\.5px` 0건 · 예외 9px 태그라인, 14px 워드마크(§4.1·핸드오프 §3, CSS 주석에 명시) |
| 5 | 충족 | 입력 rgb(237,234,224) Mono 16px · memo 테두리·배경·왼쪽 띠 0 · `.memo::before` 골드 헤어라인 1줄 |
| 6 | 충족 | `.u` 16.56px/36px(.46em) · Pretendard · --ink-2 |
| 7 | 충족 | scrollY 2600에서 sticky는 header 96 + uw-summary 145뿐(241px), pro_scroll2600.png |
| 8 | 충족 | readout 0.35% · 1.32x · 2,582만원/평 = memo·KPI · `.on` 1개(01→02 전환 확인) · 러닝헤드 없음 |
| 9 | 충족 | 390 scrollWidth 390 · 워드마크·LAB·기준금리 1·nav 2(pro390_header.png) |
| 10 | 충족 | mbar surface-2 + 골드 헤어라인 52px · 시트에 headline·KPI 4·기준·절 내비·가정 고치기 · go 「가정 고치기 ↓」↔「결론 보기」 · 입력 포커스 시 숨김 |
| 11 | 충족 | ↕/↓/↑ · aria-sort · 같은 열 재클릭 descending→ascending · 단위 2행 · hover 「선택」 opacity 1 |
| 12 | 충족 | 「항목 (억원)」 · (−) 행 크기만 · 2자리 · scope=row 11 · 하이픈 0 |
| 13 | 부분 | Pro 390 입력 행 최대 90 · 입력 44px/16px · Home 입력 행 ≤ 90. 단 Home 「대출 세부」 안 한도 풀이 행(입력 없는 설명 행)이 107px |
| 14 | 충족 | 「직접 입력 · 시장값 13.26 [되돌리기]」 · 다른 필드 메타 불변 · 공실률 150 → aria-invalid·붉은 밑줄·「0~100% 사이 값만 계산합니다 (100%로 계산 중)」 |
| 15 | 충족 | 「고친 값 1개를 시장값으로 바꿉니다 [바꾸기] [취소]」 · 미수정 시 「언더라이팅으로 이동」/「내 조건으로 이동」 · Pro·Home 모두 |
| 16 | 충족 | below 점선 밑줄 · base gold-hi 2px 인셋 · 범례 사각 2개 + 문구 · heat-read 「Exit Cap 3.65% × 성장률 1.2% → IRR 4.42% (현재 0.35%)」 · 세이지/로즈 · 청록 0건 |
| 17 | 충족 | term 29 · def navy-2 불투명·1px·그림자 없음 · 물음표·아이콘 0 |
| 18 | 부분 | 지역 전환 즉시 `.skel` 3 · 오프라인 강제 시 오류 notice + [다시 시도] + small 원문 · 표본 부족 링크는 코드 확인만(현 스냅샷 3개 구 × 전 면적 구간에서 재현 데이터 없음) |
| 19 | 충족 | Home 펼친 컨트롤 6 + adv 4 현재값 문장 · Pro 자본구조 펼침 |
| 20 | 충족 | 교차 링크 양방향 · 클릭 후 /pro?asset=offi&code=11440&band=all, basis 「마포구 오피스텔 시장값」 · /market 308 · Market Desk 0건 |
| 21 | 충족 | 랜딩 요소 전부 · 900 뷰포트에서 문서 1504px(빈 공간 없음) · 금칙 문장 0 |
| 22 | 충족 | border-radius 0 · 원형 마크·아이콘 0 · U+2014 0 · 느낌표 0 · 음수 U+2212 |
| 23 | 충족 | print 에뮬레이션 + beforeprint: 흰 바탕·#111 · 머리줄(지역·자산·조회일) · details 전부 open · mast/subnav/mbar/btn/controls 숨김 |
| 24 | 충족 | Tab 130회: 산점도 1회 정지 · Seg 그룹당 1회 · 히트맵 표당 1회 · 링 gold-hi 2px + navy 2px, 아이보리 `.btn.primary` 위에서도 동일 |
| 25 | 충족 | icon.svg 네이비 + RE 아이보리 + 콜론 골드 · SSR HTML에 티커 % · 「ECOS 2026-09-24」 |

## 4. 남은 낮은 우선순위 항목

- Home 「대출 세부」 한도 풀이 행 107px(390). 문구가 스펙 지정 문장이라 3줄. 접힌 그룹 안이므로 첫 화면에는 영향 없음
- 표본 부족 `.empty` 상태를 재현할 데이터가 없음(마포·영등포·강남 × 전 구간 모두 표본 충분). 코드 경로만 확인
- Home은 지역·면적 변경 시 URL 쿼리를 갱신하지 않음(Pro는 갱신). 시드 읽기는 양쪽 동작
- Pro 인쇄 머리줄 조회일은 시장 스냅샷 fetchedAt(2026-09-23), Home은 오늘 날짜. 통일 여부 결정 필요
- 랜딩 390 desk-index Pro 행이 714~958px(폴드 812 안에서 시작, 전체 수납은 아님)
- 워드마크 14px는 §2 목록 밖이나 §4.1·핸드오프 규격. 스펙 내부 상충으로 기록
- lib 주석 em-dash 2건(market.ts:27, types.ts:10)은 lib 미수정 원칙으로 둠
- 묶음 A P2(랜딩 예시 결과 2단, OG 이미지) 미착수
