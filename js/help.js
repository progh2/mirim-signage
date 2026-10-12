// 도움말
import { h, openModal } from './ui.js';

const SECTIONS = {
  '사용법': `
<h3>1. 사이니지 고르기</h3>
<p>위쪽에서 <b>좌측 가로배너(6.5:1, 1664×256)</b> 또는 <b>우측 와이드(2:1, 1280×640)</b>를 고릅니다. 두 화면은 따로 자동 저장됩니다.</p>
<h3>2. 템플릿에서 시작</h3>
<p>왼쪽 <b>템플릿</b> 탭에서 용도(행사 공지·기념일·계절·공공PR 등)를 고르면 가이드 규격이 미리 맞춰진 디자인이 열립니다. 글자는 두 번 클릭하거나 오른쪽 속성의 ‘내용’에서 고칩니다.</p>
<h3>3. 요소 추가 · 레이어</h3>
<ul>
<li><b>요소</b> 탭: 제목(80px≈60pt)·본문(64px≈48pt)·보조설명(42px≈32pt) 글자, 도형, 이미지, 배경색, ‘AI 활용 제작’ 표시</li>
<li><b>레이어</b> 탭: 끌어서 순서 변경, 숨기기·잠금, 이름 바꾸기(두 번 클릭)</li>
<li>점선 테두리는 <b>안전 여백</b>, ‘줄 기준선’은 본문 기준 줄 수를 보여 줍니다. 둘 다 PNG에는 포함되지 않습니다.</li>
</ul>
<h3>4. 가이드 점검 → PNG 내보내기</h3>
<p>오른쪽 <b>가이드 점검</b>이 글자 크기·글꼴·배경 명도/채도·대비·정보량·밝기·여백·AI 표시를 계속 확인합니다. <b>자동 보정</b>은 고칠 수 있는 항목을 한 번에 맞춥니다. <b>PNG 내보내기</b>는 항상 사이니지 원본 해상도로 저장되며, <b>야간용 PNG</b>는 밝기를 낮춘 파일을 함께 만듭니다(해진 후 송출용).</p>
<h3>5. 저장</h3>
<p>작업은 이 브라우저에 자동 저장됩니다. 다른 PC로 옮기거나 보관하려면 <b>저장</b>(프로젝트 .json)을 눌러 두고 <b>열기</b>로 불러옵니다.</p>
<h3>단축키</h3>
<p><code>Del</code> 삭제 · <code>Ctrl+D</code> 복제 · <code>Ctrl+C/V</code> 복사/붙여넣기 · <code>Ctrl+Z</code> 취소 · <code>Ctrl+Shift+Z</code> 다시 · 방향키 1px(Shift 10px) · <code>Ctrl+S</code> 저장</p>`,

  '가이드 요약': (app) => {
    const g = app.guide;
    return `<p class="hint">${g.source} 을 기준으로 이 도구의 규칙이 정해져 있습니다. 수치는 <code>data/guide.json</code>에서 바꿀 수 있습니다.</p>
<h3>규격 (01-1)</h3>
<ul>${Object.values(g.signages).map(s => `<li>${s.name}: ${s.width}×${s.height}px, ${s.physical}</li>`).join('')}</ul>
<h3>규칙</h3>
<ul>${g.rules.map(r => `<li><b>[${r.ref}]</b> ${r.text}</li>`).join('')}</ul>
<h3>환산 기준</h3>
<p>${g.ptNote}</p>
<p>${g.color.bgLNote}</p>
<p>${g.brightness.note}</p>`;
  },

  'AI 키 안전 가이드': `
<h3>키는 어디에 있나요?</h3>
<p>이 사이트는 GitHub Pages에 올라간 <b>정적 파일</b>뿐이며 서버가 없습니다. API 키는 <b>지금 쓰는 브라우저 안</b>에만 저장되고, AI 요청은 브라우저에서 설정한 API 주소로 <b>직접</b> 전송됩니다. 저장소(GitHub)·다른 사용자·이 사이트 운영자에게 키가 전달되지 않습니다.</p>
<h3>보관 방식 고르기</h3>
<ul>
<li><b>저장 안 함</b> — 메모리에만. 새로고침하면 다시 입력. 공용 PC 권장</li>
<li><b>탭 동안만</b> (sessionStorage) — 탭을 닫으면 삭제. 기본값</li>
<li><b>이 브라우저에 보관</b> (localStorage) — 개인 PC에서만. <b>키 잠금 암호</b>를 넣으면 키가 AES-GCM(PBKDF2 25만 회)으로 암호화되어 저장되고, 새 탭마다 암호로 잠금을 풀어야 합니다.</li>
</ul>
<h3>꼭 지켜 주세요</h3>
<ul>
<li>공용·교실 PC에서는 사용 후 <b>AI 설정 → 키 삭제</b>.</li>
<li>OpenAI: 학교용 <b>프로젝트 키</b>를 따로 만들고 <b>월 사용 한도</b>를 설정하세요. 유출이 의심되면 즉시 키를 폐기(Revoke)합니다.</li>
<li>LiteLLM 같은 게이트웨이: 예산·모델이 제한된 <b>가상 키</b>를 발급해 쓰세요.</li>
<li>프로젝트 파일(.json)·템플릿 파일에는 키가 <b>포함되지 않습니다</b>.</li>
<li>모르는 브라우저 확장 프로그램은 페이지 내용을 읽을 수 있습니다. 키를 쓰는 브라우저 프로필은 깨끗하게 유지하세요.</li>
<li>사이트에는 외부 스크립트를 쓰지 않도록 콘텐츠 보안 정책(CSP)이 걸려 있습니다. 저장소를 고칠 때 외부 CDN 스크립트를 추가하지 마세요.</li>
</ul>
<h3>AI에 보내는 것</h3>
<p>‘AI 점검’은 현재 화면 PNG 1장과 가이드 규칙·로컬 점검 결과를, ‘AI 디자인’은 입력한 내용·분위기와(선택 시) 참고 이미지를 보냅니다. 학생 개인정보가 들어간 이미지는 보내지 마세요.</p>`,

  '연결 설정 (OpenAI·Ollama)': `
<h3>OpenAI</h3>
<p>API 주소 <code>https://api.openai.com/v1</code>. 점검·디자인 모델은 <b>이미지 입력을 지원하는 모델</b>이어야 합니다. ‘모델 목록 불러오기’로 계정에서 쓸 수 있는 모델을 확인하세요. 배경 이미지 생성은 이미지 모델(예: <code>gpt-image-1</code>)이 필요합니다.</p>
<h3>Ollama (이 컴퓨터)</h3>
<p>API 주소 <code>http://localhost:11434/v1</code>, 키는 비워 둡니다. https 사이트(GitHub Pages)에서 로컬 Ollama를 부르려면 Ollama에 사이트 주소를 허용해야 합니다.</p>
<pre># macOS
launchctl setenv OLLAMA_ORIGINS "https://아이디.github.io"
# Windows (PowerShell, 설정 후 Ollama 재시작)
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS","https://아이디.github.io","User")
# Linux (systemd)
sudo systemctl edit ollama   →   [Service]
Environment="OLLAMA_ORIGINS=https://아이디.github.io"</pre>
<p>크롬·엣지가 ‘이 사이트가 로컬 네트워크의 기기에 접근하려 합니다’라고 물으면 <b>허용</b>을 눌러야 연결됩니다.</p>
<p>비전 모델 예: <code>ollama pull gemma3:12b</code>, <code>qwen2.5vl</code>, <code>llama3.2-vision</code>. 같은 네트워크의 다른 PC(예: http://192.168.x.x)는 브라우저 보안(혼합 콘텐츠) 때문에 직접 호출할 수 없습니다 → https 게이트웨이를 쓰세요.</p>
<h3>Ollama Cloud</h3>
<p>API 주소 <code>https://ollama.com/v1</code>, ollama.com에서 발급한 API 키. 브라우저에서 직접 호출이 CORS로 막히면 아래 호환 게이트웨이를 거치세요.</p>
<h3>OpenAI 호환 (LiteLLM · vLLM · OpenRouter 등)</h3>
<p><code>/v1/chat/completions</code>를 지원하는 주소를 넣습니다. 게이트웨이에서 이 사이트의 Origin(예: https://아이디.github.io)에 대해 CORS를 허용해야 합니다.</p>`,

  '템플릿 추가': `
<h3>방법 1 — 화면에서 (코딩 없이)</h3>
<ol>
<li>디자인을 만든 뒤 템플릿 탭 → <b>템플릿 파일로 내보내기</b></li>
<li>받은 .json 파일을 저장소의 <code>templates/</code> 폴더에 넣기</li>
<li><code>templates/index.json</code>의 <code>"templates"</code> 목록에 파일 이름 추가 → 커밋하면 모두에게 보입니다.</li>
</ol>
<p>나만 쓸 템플릿은 <b>현재 디자인을 템플릿으로 저장</b>(이 브라우저에 보관)하면 됩니다.</p>
<h3>방법 2 — JSON 직접 작성</h3>
<pre>{
  "id": "right-my-event",
  "name": "행사 공지 - 내 양식",
  "category": "학교 행사 공지",
  "signage": "right",            // "left" 또는 "right"
  "description": "짧은 설명",
  "background": { "type": "solid", "color": "#156082" },
  "objects": [
    { "type": "text", "role": "title", "text": "제목", "left": 64, "top": 60,
      "width": 1152, "fontFamily": "Cafe24 Dangdanghae", "fontSize": 80, "fill": "#FFFFFF" },
    { "type": "rect", "left": 64, "top": 200, "width": 300, "height": 6, "fill": "#FFE38A" }
  ]
}</pre>
<p>지원 형식: <code>text</code>, <code>rect</code>, <code>circle</code>, <code>triangle</code>, <code>line</code>, <code>image</code>, <code>imageSlot</code>. 자세한 내용은 저장소의 <code>docs/TEMPLATE_GUIDE.md</code>.</p>`,

  '글꼴 · 라이선스': (app) => `
<p>함께 배포되는 글꼴은 모두 무료로 쓰고 재배포할 수 있는 라이선스입니다. 라이선스 원문은 <code>fonts/licenses/</code>에 있습니다.</p>
<ul>${app.fonts.fonts.filter(f => !f.user).map(f => `<li><b>${f.label}</b> — ${f.license}${f.note ? ` · ${f.note}` : ''}</li>`).join('')}</ul>
<p>G마켓 산스는 배포 조건이 명확히 공개돼 있지 않아 포함하지 않았습니다. 필요하면 공식 사이트에서 받아 <b>요소 → 내 글꼴 파일 불러오기</b>로 이 브라우저에서만 사용하세요.</p>
<p>편집 도구: Fabric.js 5.3.0 (MIT) — <code>vendor/fabric-LICENSE.txt</code></p>`
};

export function showHelp(app, start = '사용법') {
  const nav = h('div', { class: 'seg', style: { marginBottom: '14px', flexWrap: 'wrap' } });
  const content = h('div');
  const show = key => {
    const s = SECTIONS[key];
    content.innerHTML = typeof s === 'function' ? s(app) : s;
    [...nav.children].forEach(b => b.classList.toggle('on', b.dataset.k === key));
  };
  for (const k of Object.keys(SECTIONS)) nav.append(h('button', { 'data-k': k, onclick: () => show(k) }, k));
  openModal({ title: '도움말', body: h('div', {}, nav, content), wide: true, buttons: [{ label: '닫기', cls: 'ghost' }] });
  show(start);
}
