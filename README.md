# RE:LAB · 부동산 사업성 분석

RE:VISION의 실무 도구. 국토교통부 실거래가와 한국은행 금리를 실시간으로 불러와 가정을 채우고, 그 가정이 시장의 어디에 있는지 표시합니다. 같은 계산 엔진 위에서 **기관투자자의 통매입 검토(Pro)** 와 **개인의 집 한 채 검토(Home)** 를 각각의 언어로 냅니다.

- `/market` Market Desk: 시군구·자산별 시세, 전환율, 총수익률, 갱신 행태
- `/pro` Model Desk · Pro: 임대주택 통매입 · 오피스 · 물류센터. 자본구조·우선주·도관 과세·두 개의 손익분기·민감도·검산
- `/home` Model Desk · Home: 아파트·오피스텔 한 채. 대출 규제(LTV·DSR)·취득세·보유세·양도세·갭투자·역전세
- `/api/desk` 홈페이지 `data/market.json` 과 같은 형식의 실시간 시세 요약

## 구조

```
lib/engine/core.ts          공통 엔진: 자본구조(선순위·우선주·보증금)·상환 스케줄·세무·매각·IRR·한계선 역산·검산
lib/engine/models/rental.ts 임대주택 통매입 (RENTCAP 이식)
lib/engine/models/office.ts 오피스·물류 (RE:VISION Model Desk acqEngine 이식)
lib/engine/models/home.ts   개인 매입: 월 단위 상환, 개인 세제, 갭투자, 역전세
lib/engine/pro.ts           기관용 입력 묶음 · 한계선 · 민감도 격자
lib/engine/assumptions.ts   시장값으로 가정 채우기 · 시장 대비 위치 · 결론 문장
lib/rules/index.ts          취득세·보유세·양도세·LTV·DSR 규칙 표 (시행일·근거·검증 상태)
lib/connectors/             국토부 실거래가(OpenAPI·스냅샷) · ECOS · 시장 통계
components/                 화면 (순수 CSS · SVG). 브랜드 토큰은 app/globals.css :root
data/snapshot/{offi,apt}/   국토부 공개 CSV로 만든 스냅샷 (키 없이도 동작)
tests/                      엔진 회귀 · 손계산 대조 · 규칙 표 · 실데이터 상식 범위
```

홈페이지(`revision-web`)와는 별도 프로젝트입니다. 합칠 때는 `app/globals.css`의 `:root` 토큰과 `components/Header.tsx`의 NAV만 홈페이지 것으로 바꾸면 됩니다. 도구 경로(`/market`, `/pro`, `/home`)와 API 경로는 그대로 옮겨 붙습니다.

## 실행

```bash
npm install
cp .env.example .env.local   # DATA_GO_KR_KEY 를 넣으면 전국 실시간, 비워 두면 스냅샷(서울 마포·영등포·강남)
npm run dev
npm test && npm run typecheck && npm run lint && npm run build
```

공공데이터포털에서 활용신청이 필요한 API: 오피스텔 매매·전월세, 아파트 매매·전월세 실거래가. 신청되지 않은 API는 자동으로 스냅샷으로 대체되고 화면에 그 사실을 표시합니다.

## 규칙 표에 대해

`lib/rules/index.ts`의 세율·대출 규제는 2025~2026년 공표 기준을 정리한 것이며 **세무 검토 전 상태(`verified: false`)** 입니다. 화면은 각 항목의 근거 조문과 기준일, 검증 상태를 그대로 보여줍니다. 실제 신고와 대출 심사는 과세관청과 금융기관의 확정값을 따릅니다.

## 면책

공개 데이터에 기반한 정보 제공 도구이며 투자 권유가 아닙니다. 특정 자산의 매수를 권하지 않으며, 입력한 가정에서의 계산 결과만 보여줍니다.
