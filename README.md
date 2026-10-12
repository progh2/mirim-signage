# 미림 사이니지 메이커

미림마이스터고 정문 디지털 사이니지 2대(좌측 가로배너 6.5:1, 우측 와이드 2:1)에 송출할 PNG 이미지를
**「미림 디지털 사이니지 활용 가이드 V0.9 (2026.10.11)」** 기준에 맞춰 만드는 웹 편집기입니다.
서버 없이 GitHub Pages(정적 호스팅)로 동작합니다.

| 사이니지 | 위치 | 비율 | 해상도 | 실제 크기 |
|---|---|---|---|---|
| 가로배너형 | 정문 기준 좌측 | 6.5:1 | 1664 × 256 px | 6.5m × 1m |
| 2:1 와이드형 | 정문 기준 우측 | 2:1 | 1280 × 640 px | 5m × 2.5m |

## 주요 기능

- **좌/우 사이니지 선택** — 각 화면 정확한 해상도로 편집·PNG 저장, 화면별 자동 저장
- **편집기** — 글자(제목 80px≈60pt / 본문 64px≈48pt / 보조설명 42px≈32pt 프리셋), 도형, 이미지, 이미지 자리, 배경(단색·그라데이션), 레이어(순서 끌기·숨김·잠금·이름), 정렬·스냅, 실행 취소, 복제·복사, 단축키
- **템플릿** — 사례별 기본 템플릿 13종(행사 공지·입학설명회·기념일·계절 인사·연말연시·명화 갤러리·방문 환영·서행 캠페인), 내 템플릿 저장/파일 내보내기/가져오기. JSON 파일 추가만으로 확장
- **가이드 자동 점검** — 규격, 글자 크기, 글꼴(굵기·삐침), 배경 명도(1~10단계)·채도, 글자 대비, 정보량, 평균 밝기(빛 공해), 흰 면적, 안전 여백, 빈 이미지 자리, AI 활용 표시 → **자동 보정**
- **야간용 PNG** — 밝기를 낮춘 파일을 함께 저장 (서울시 옥외전광판 밝기 권고 고려)
- **LED 미리보기** — 3.9mm 픽셀 점 확대, 도로 시점 주간/야간 미리보기
- **AI 점검** — 멀티모달 모델이 완성 이미지를 보고 가이드 기준으로 평가
- **AI 디자인** — 내용·분위기를 입력하면 가이드에 맞는 레이아웃 생성 → 자동 점검·보정 → ‘AI 활용 제작’ 표시 자동 추가 (선택: 배경 이미지 생성, 결과를 보고 1회 다듬기)
- **AI 연결** — OpenAI / Ollama(로컬) / Ollama Cloud / OpenAI 호환(LiteLLM·vLLM·OpenRouter 등). 키는 브라우저에만 저장(저장 안 함·탭 동안·브라우저 보관 + 선택적 AES 암호 잠금)

## GitHub Pages 배포

1. 이 폴더 전체를 새 저장소에 올립니다 (예: `mirim-signage`).
2. 저장소 **Settings → Pages → Build and deployment**에서 Source를 **Deploy from a branch**, Branch를 `main` / `/(root)`로 저장합니다.
3. 1~2분 뒤 `https://<아이디>.github.io/mirim-signage/` 로 접속합니다.

빌드 과정이 없습니다. 파일을 고치고 커밋하면 바로 반영됩니다.

로컬에서 확인할 때는 파일을 더블클릭하지 말고 웹 서버로 엽니다.

```bash
cd mirim-signage
python3 -m http.server 8000   # → http://localhost:8000
```

## 폴더 구조

```
index.html            앱 화면
css/app.css           스타일
js/                   앱 코드 (ES 모듈, 빌드 불필요)
  main.js             진입점·화면 연결
  editor.js           캔버스 편집기 (Fabric.js)
  schema.js           템플릿 JSON ↔ 캔버스 변환
  checker.js          가이드 점검·자동 보정
  export.js           PNG/야간 PNG, LED 미리보기
  ai/                 AI 설정·키 보관·API 호출·AI 점검/디자인
data/guide.json       가이드 수치(규격·글자 크기·명도/채도·밝기·규칙) ← 가이드 개정 시 여기만 수정
data/fonts.json       사용 가능한 글꼴 목록
templates/index.json  템플릿 목록  ← 새 템플릿 파일명을 여기에 추가
templates/left|right/ 템플릿 JSON
fonts/                배포 가능한 글꼴 + 라이선스(fonts/licenses)
vendor/               Fabric.js 5.3.0 (MIT)
docs/                 템플릿 작성 가이드, AI 키 안전 가이드
```

## 가이드가 바뀌면

`data/guide.json`의 값만 바꾸면 점검·자동 보정·AI 프롬프트에 모두 반영됩니다.

- `signages` — 해상도, 안전 여백, 권장 줄 수·글자 수
- `typography` — 제목/본문/보조설명 px, 최소 크기, 최소 굵기
- `color.bgL` — 배경 명도(OKLCH L) 범위. 명도 5단계≈0.85, 8단계≈0.51, 9단계≈0.39
- `color.backgrounds`, `color.texts` — 추천 팔레트
- `brightness` — 평균 밝기 경고 기준, 야간용 밝기 비율(기본 70%)
- `rules`, `manualChecklist` — 규칙 문구, 게시 전 확인 목록

## 템플릿 추가

[docs/TEMPLATE_GUIDE.md](docs/TEMPLATE_GUIDE.md) 참고. 요약: 앱에서 디자인 → **템플릿 파일로 내보내기** → `templates/`에 넣고 `templates/index.json`에 파일명 추가.

## AI 키 안전

[docs/AI_KEY_GUIDE.md](docs/AI_KEY_GUIDE.md) 참고. 키는 저장소나 서버로 가지 않고 브라우저에서 API 주소로 직접 전송됩니다.

## 글꼴과 라이선스

| 글꼴 | 라이선스 | 용도 |
|---|---|---|
| 카페24 당당해 · 단정해 | Cafe24 폰트 라이선스(무료·상업·웹 탑재·재배포 허용, 판매 금지) | 가이드 기준 제목/본문 |
| Pretendard | SIL OFL 1.1 | 본문 기본 |
| Noto Sans KR, Gothic A1, 나눔고딕, IBM Plex Sans KR | SIL OFL 1.1 | 굵은 고딕 |
| Black Han Sans, 도현 | SIL OFL 1.1 | 제목용 |
| Noto Serif KR (Black) | SIL OFL 1.1 | 큰 제목·명화 캡션 전용 |

글꼴 파일은 필요한 굵기만 포함했고(약 19MB, 대부분 한글 유니코드 구간별 분할 파일이라 실제로는 쓰는 글자만 내려받음), 원문 라이선스는 `fonts/licenses/`에 있습니다.
G마켓 산스는 재배포 조건이 공개 문서로 확인되지 않아 포함하지 않았습니다. 필요하면 **요소 → 내 글꼴 파일 불러오기**로 그 브라우저에서만 사용하세요.

편집 엔진: [Fabric.js](https://github.com/fabricjs/fabric.js) 5.3.0 (MIT).

## 보안 메모

- `index.html`에 CSP를 걸어 외부 스크립트 실행을 막았습니다. 외부 CDN 스크립트를 추가하지 마세요.
- API 호출 허용 대상: `https:` 전체, `http://localhost`, `http://127.0.0.1` (로컬 Ollama).
