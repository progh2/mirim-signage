# AI 키 등록 · 안전 가이드

## 어떻게 동작하나요

```
[내 브라우저] ──(API 키 포함 요청)──▶ [내가 설정한 AI 주소: OpenAI / Ollama / 게이트웨이]
      ▲
      └─ GitHub Pages는 HTML·JS 파일만 내려줌 (키를 받지도, 저장하지도 않음)
```

- 이 사이트에는 서버가 없습니다. 키는 **지금 쓰는 브라우저 안**에만 저장됩니다.
- 요청은 브라우저에서 **설정한 API 주소로 직접** 갑니다. 저장소·다른 사용자·사이트 운영자에게 전달되지 않습니다.
- 프로젝트 파일(.json)·템플릿 파일·자동 저장 데이터에는 키가 들어가지 않습니다.

## 키 보관 방식

| 방식 | 저장 위치 | 언제 지워지나 | 추천 |
|---|---|---|---|
| 저장 안 함 | 메모리 | 새로고침·탭 닫기 | 공용 PC, 교실 PC |
| 탭 동안만 (기본) | sessionStorage | 탭 닫기 | 일반 사용 |
| 이 브라우저에 보관 | localStorage | ‘키 삭제’를 누를 때까지 | 개인 PC만 |
| 이 브라우저에 보관 + 잠금 암호 | localStorage(암호화) | ‘키 삭제’를 누를 때까지 | 개인 PC에서 오래 쓸 때 |

잠금 암호를 넣으면 키를 PBKDF2(SHA-256, 25만 회)로 만든 키로 AES-GCM 256 암호화해 저장합니다. 새 탭을 열 때마다 AI 설정에서 암호를 넣어 잠금을 풉니다(풀린 키는 그 탭 메모리에만 있음). 암호는 어디에도 저장되지 않으므로 잊으면 키를 다시 등록하세요.

## 지켜 주세요

1. **공용 PC**에서는 ‘저장 안 함’ 또는 ‘탭 동안만’ + 사용 후 **AI 설정 → 키 삭제**.
2. **OpenAI**: 이 용도 전용 **프로젝트 키**를 만들고, 프로젝트에 **월 사용 한도(Usage limits)** 를 설정하세요. 유출이 의심되면 바로 Revoke.
3. **게이트웨이(LiteLLM 등)**: 예산·허용 모델·만료일이 정해진 **가상 키**를 발급해 쓰세요.
4. 키를 메신저·문서·저장소에 붙여 넣지 마세요. 이 사이트의 코드에도 키를 넣지 마세요.
5. 키를 쓰는 브라우저 프로필에는 믿을 수 있는 확장 프로그램만 두세요(확장 프로그램은 페이지 내용을 읽을 수 있음).
6. AI에 보내는 이미지에 학생 개인정보(이름·얼굴 등)가 없도록 하세요.

## 서비스별 설정

### OpenAI
- API 주소: `https://api.openai.com/v1`
- 점검·디자인 모델: 이미지 입력을 지원하는 모델 (AI 설정의 **모델 목록 불러오기**로 확인)
- 배경 이미지 생성: 이미지 모델(예: `gpt-image-1`)

### Ollama (이 컴퓨터)
- API 주소: `http://localhost:11434/v1`, 키 비움
- 비전 모델 설치 예: `ollama pull gemma3:12b` (또는 `qwen2.5vl`, `llama3.2-vision`)
- GitHub Pages 주소에서 호출하려면 Ollama에 사이트 주소를 허용해야 합니다.

```bash
# macOS
launchctl setenv OLLAMA_ORIGINS "https://<아이디>.github.io"
# Windows PowerShell (설정 후 Ollama 재시작)
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS","https://<아이디>.github.io","User")
# Linux (systemd) : sudo systemctl edit ollama
[Service]
Environment="OLLAMA_ORIGINS=https://<아이디>.github.io"
```
- 브라우저가 ‘로컬 네트워크 기기 접근’ 허용을 물으면 허용합니다.
- 같은 네트워크의 다른 PC(`http://192.168.x.x`)는 https 페이지에서 직접 호출할 수 없습니다(혼합 콘텐츠 차단). https 게이트웨이를 앞에 두세요.

### Ollama Cloud
- API 주소: `https://ollama.com/v1`, ollama.com에서 발급한 API 키
- 브라우저 직접 호출이 CORS로 막히면 OpenAI 호환 게이트웨이를 거치세요.

### OpenAI 호환 (LiteLLM · vLLM · OpenRouter 등)
- `/v1/chat/completions`를 지원하는 https 주소
- 게이트웨이에서 사이트 Origin(`https://<아이디>.github.io`) CORS 허용 필요
- 이미지 생성은 게이트웨이가 `/v1/images/generations`를 지원할 때만 사용

## AI에 보내는 내용

| 기능 | 보내는 것 |
|---|---|
| 연결 테스트 | 짧은 텍스트 1건 |
| AI 점검 | 현재 화면 PNG 1장 + 가이드 규칙 + 로컬 점검 수치 |
| AI 디자인 | 입력한 용도·내용·분위기, 가이드 규칙·예시 템플릿, (선택) 참고 이미지, (다듬기 선택 시) 결과 PNG 1장 |
| 배경 이미지 생성 | AI가 만든 배경 설명(영문 프롬프트) |
