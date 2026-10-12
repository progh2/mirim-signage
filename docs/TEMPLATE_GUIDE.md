# 템플릿 작성 가이드

템플릿은 JSON 파일 하나입니다. `templates/index.json`의 `templates` 배열에 파일 경로를 추가하면 앱의 템플릿 목록에 나타납니다.
분류(`category`)가 새 이름이면 목록에 자동으로 추가되며, `index.json`의 `categories` 배열 순서대로 정렬됩니다.

## 가장 쉬운 방법

1. 앱에서 디자인을 만든다(기존 템플릿을 고쳐도 됨).
2. 템플릿 탭 → **템플릿 파일로 내보내기** → `.json` 저장
3. 파일을 열어 `name`, `category`, `description`을 다듬는다.
4. `templates/right/` 또는 `templates/left/`에 넣고 `templates/index.json`에 경로 추가 → 커밋

> 이미지가 들어간 디자인을 내보내면 이미지가 data URL로 파일 안에 들어가 커집니다. 기본 템플릿에는 이미지 대신 `imageSlot`(이미지 자리)을 쓰는 것을 권장합니다.

## 형식

```json
{
  "id": "right-event-basic",          // 고유 ID (영문·숫자·-)
  "name": "행사 공지 · 기본",          // 목록에 보일 이름
  "category": "학교 행사 공지",         // 분류
  "signage": "right",                 // "right"(1280×640) 또는 "left"(1664×256)
  "description": "라벨 + 큰 제목 + 일시·장소 2줄",
  "notes": "적용할 때 안내 문구로 잠깐 표시됨 (선택)",
  "background": { "type": "solid", "color": "#156082" },
  "objects": [ ... ]                  // 뒤 → 앞 순서
}
```

### background

```json
{ "type": "solid", "color": "#156082" }
{ "type": "linear", "angle": 135, "stops": [ { "offset": 0, "color": "#2B4A6F" }, { "offset": 1, "color": "#156082" } ] }
```
`angle`: 0 = 왼쪽→오른쪽, 90 = 위→아래.

### objects

공통 선택 속성: `name`(레이어 이름), `role`, `opacity`(0~1), `angle`(회전), `visible`

| type | 필수 속성 | 선택 속성 |
|---|---|---|
| `text` | `text`, `left`, `top`, `width`, `fontSize` | `role`(title·body·caption·ai-label), `fontFamily`, `fontWeight`, `fill`, `textAlign`(left·center·right), `lineHeight`, `charSpacing`, `stroke`, `strokeWidth`, `shadow` |
| `rect` | `left`, `top`, `width`, `height` | `fill`(색 또는 그라데이션 객체), `rx`(둥글기), `stroke`, `strokeWidth`, `shadow` |
| `circle` | `left`, `top`, `radius` | `fill`, `stroke`, `strokeWidth` |
| `triangle` | `left`, `top`, `width`, `height` | `fill` |
| `line` | `x1`, `y1`, `x2`, `y2` | `stroke`, `strokeWidth` |
| `image` | `src`, `left`, `top`, `width`, `height` | `fit`(cover·contain·stretch), `brightness`(-1~1) |
| `imageSlot` | `left`, `top`, `width`, `height` | `label` (두 번 클릭해 이미지 넣는 자리) |

- `left`, `top`은 객체 왼쪽 위 좌표(px)입니다. `circle`도 원을 감싸는 사각형의 왼쪽 위입니다.
- 줄바꿈은 `\n`.
- `fontFamily`는 `data/fonts.json`의 `family` 값을 그대로 씁니다 (예: `"Cafe24 Dangdanghae"`, `"Pretendard Variable"`).
- `image.src`는 저장소 안 경로(예: `assets/monet.jpg`) 또는 data URL. 외부 URL은 CORS 때문에 PNG 내보내기가 막힐 수 있습니다.

## 가이드에 맞게 만들기 (체크리스트)

- 글자 크기: 제목 `fontSize` 72~96 (기본 80), 본문 64, 보조설명 42 이상
- 우측 와이드: 안전 여백 48px 안 (x 48~1232, y 48~592), 글자 8줄·90자 이내
- 좌측 배너: 안전 여백 28px 안 (x 28~1636, y 28~228), 글자 3줄·40자 이내
- 배경: `data/guide.json`의 `color.backgrounds` 중에서, 또는 명도 5~8단계·저채도
- 글자색: 흰색·웜화이트·소프트 옐로 등 밝은 색
- 장식 도형: 반투명(`rgba(...)`)·저채도
- 템플릿을 넣은 뒤 앱에서 열어 **가이드 점검**이 통과하는지 확인

## 글꼴 추가

1. 재배포 가능한 라이선스(OFL 등)인지 확인
2. `fonts/<이름>/` 폴더에 woff2(또는 woff)와 `font.css`(@font-face) 추가, 라이선스는 `fonts/licenses/`
3. `data/fonts.json`의 `fonts` 배열에 항목 추가

```json
{
  "family": "글꼴 CSS 이름", "label": "화면에 보일 이름", "css": "fonts/<이름>/font.css",
  "weights": [700, 800], "heavy": false, "style": "gothic", "use": ["title", "body"],
  "note": "설명", "license": "SIL OFL 1.1", "licenseFile": "fonts/licenses/<이름>-OFL.txt"
}
```
- `heavy`: 굵기 하나뿐인 두꺼운 글꼴이면 `true` (굵기 점검 제외)
- `style`: `gothic` · `slab` · `display` · `serif`(serif는 큰 제목 전용으로 점검됨)
- `use`: 본문에도 써도 되면 `"body"` 포함
