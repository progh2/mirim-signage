// AI 설정 화면, AI 점검, AI 디자인 생성
import { h, $, openModal, toast, pickFile, readAs, esc } from '../ui.js';
import { PROVIDERS, getConfig, setConfig, keyStatus, getKey, saveKey, clearKey, unlock, maskKey } from './keystore.js';
import { chat, listModels, imageMessage, generateImage, AIError } from './client.js';
import { runChecks, autoFix, guideRulesText } from '../checker.js';

export function updateAiDot() {
  const st = keyStatus();
  const dot = $('#aiDot');
  dot.className = 'ai-dot' + (st === 'ready' || st === 'nokey' ? ' on' : st === 'locked' ? ' locked' : '');
  $('#btnAiSettings').title = { ready: 'AI 연결됨', nokey: 'AI 연결됨(키 없음)', locked: 'API 키 잠김 — 클릭해서 해제', none: 'AI 미설정' }[st];
}

// ======================= 설정 =======================
export function openAiSettings(onSaved) {
  const cfg = getConfig();
  const st = keyStatus();
  const provSel = h('select', {}, ...Object.entries(PROVIDERS).map(([k, p]) => h('option', { value: k, selected: k === cfg.provider }, p.label)));
  const baseIn = h('input', { type: 'url', value: cfg.baseUrl, placeholder: 'https://.../v1' });
  const keyIn = h('input', { type: 'password', placeholder: st === 'ready' ? `저장된 키 ${maskKey(getKey())} (바꾸려면 새로 입력)` : st === 'locked' ? '암호로 잠긴 키가 있습니다' : 'sk-... 또는 발급받은 키', autocomplete: 'off' });
  const modelIn = h('input', { type: 'text', value: cfg.model, placeholder: '예) gpt-4.1-mini, gemma3:12b', list: 'aiModelList' });
  const dl = h('datalist', { id: 'aiModelList' });
  const imgOn = h('input', { type: 'checkbox', checked: cfg.imageEnabled });
  const imgModelIn = h('input', { type: 'text', value: cfg.imageModel, placeholder: '예) gpt-image-1 (없으면 비워두기)', list: 'aiModelList' });
  const imgSize = h('select', {}, ...['1536x1024', '1024x1024', '1792x1024'].map(s => h('option', { value: s, selected: s === cfg.imageSize }, s)));
  const jsonOn = h('input', { type: 'checkbox', checked: cfg.jsonMode !== false });
  const help = h('div', { class: 'notice' });
  const stor = h('div', { class: 'radio-cards' },
    ...[['memory', '저장 안 함', '새로고침하면 지워짐. 가장 안전'], ['session', '탭 동안만', '탭을 닫으면 삭제 (권장)'], ['local', '이 브라우저에 보관', '개인 PC에서만. 암호 잠금 권장']].map(([v, t, d]) =>
      h('label', {}, h('input', { type: 'radio', name: 'aistor', value: v, checked: cfg.storage === v }), h('b', {}, t), d)));
  const passIn = h('input', { type: 'password', placeholder: '선택: 키를 암호로 잠그기 (이 브라우저 보관 시)', autocomplete: 'new-password' });
  const unlockRow = st === 'locked' ? h('div', { class: 'notice warn full' }, '암호로 잠긴 키가 있습니다. ',
    (() => { const p = h('input', { type: 'password', placeholder: '잠금 암호', style: { width: '180px', marginLeft: '6px' } }); const b = h('button', { class: 'btn small', style: { marginLeft: '6px' }, onclick: async () => { if (await unlock(p.value)) { toast('키 잠금을 해제했습니다(이 탭에서만).', 'ok'); updateAiDot(); openAiSettings(onSaved); } else toast('암호가 맞지 않습니다.', 'err'); } }, '잠금 해제'); return h('span', {}, p, b); })()) : null;
  const status = h('div', { class: 'hint full' });

  const syncProvider = (reset) => {
    const p = PROVIDERS[provSel.value];
    help.textContent = p.help;
    if (reset) {
      baseIn.value = p.baseUrl; modelIn.value = p.model; imgModelIn.value = p.imageModel;
      imgOn.checked = p.imageSupported && !!p.imageModel;
    }
  };
  provSel.addEventListener('change', () => syncProvider(true));
  syncProvider(false);

  const body = h('div', {},
    h('div', { class: 'form-grid' },
      h('label', {}, '서비스'), provSel,
      h('div', { class: 'full' }, help),
      h('label', {}, 'API 주소'), baseIn,
      h('label', {}, 'API 키'), keyIn,
      unlockRow,
      h('label', {}, '키 보관 방식'), stor,
      h('label', {}, '키 잠금 암호'), passIn,
      h('label', {}, '점검·디자인 모델'), h('div', { class: 'row gap', style: { flexWrap: 'nowrap' } }, modelIn,
        h('button', { class: 'btn small ghost', onclick: async () => {
          await applyTemp();
          status.textContent = '모델 목록을 불러오는 중…';
          try { const ms = await listModels(); dl.innerHTML = ''; ms.forEach(m => dl.append(h('option', { value: m }))); status.textContent = `모델 ${ms.length}개 — 입력칸을 눌러 선택하세요. 이미지 점검·디자인에는 비전(이미지 입력) 지원 모델이 필요합니다.`; }
          catch (e) { status.textContent = e.message; }
        } }, '모델 목록 불러오기')),
      h('label', {}, ''), h('label', { class: 'chk' }, jsonOn, ' JSON 모드 사용(response_format) — 오류 시 자동으로 끔'),
      h('label', {}, 'AI 배경 이미지'), h('label', { class: 'chk' }, imgOn, ' AI 디자인 시 배경 이미지도 생성 (이미지 API 지원 시)'),
      h('label', {}, '이미지 모델 · 크기'), h('div', { class: 'row gap', style: { flexWrap: 'nowrap' } }, imgModelIn, imgSize),
      status, dl),
    h('div', { class: 'notice', style: { marginTop: '14px' } },
      h('b', {}, '키는 어디에 저장되나요? '),
      '이 사이트는 서버가 없는 정적 페이지(GitHub Pages)입니다. 키는 이 브라우저에만 저장되고, 요청은 브라우저에서 위 API 주소로 직접 전송됩니다. 저장소 코드·다른 사용자에게 노출되지 않습니다.',
      h('ul', {},
        h('li', {}, '공용 PC에서는 ‘저장 안 함’ 또는 ‘탭 동안만’을 선택하고, 사용 후 ‘키 삭제’를 누르세요.'),
        h('li', {}, 'OpenAI는 프로젝트 키 + 월 사용 한도를, 게이트웨이는 예산이 정해진 가상 키를 쓰세요.'),
        h('li', {}, '자세한 내용은 상단 ? → ‘AI 키 안전 가이드’.'))));

  async function applyTemp() {
    const c = collect();
    setConfig(c);
    if (keyIn.value.trim()) await saveKey(keyIn.value, c.storage, c.storage === 'local' ? passIn.value : '');
  }
  function collect() {
    return {
      provider: provSel.value, baseUrl: baseIn.value.trim(), model: modelIn.value.trim(), imageModel: imgModelIn.value.trim(),
      imageSize: imgSize.value, imageEnabled: imgOn.checked, storage: (body.querySelector('input[name=aistor]:checked') || {}).value || 'session',
      encrypted: !!passIn.value, jsonMode: jsonOn.checked
    };
  }

  openModal({
    title: 'AI 연결 설정', body,
    buttons: [
      { label: '키 삭제', cls: 'danger', close: false, onClick: () => { clearKey(); updateAiDot(); keyIn.placeholder = '키가 삭제되었습니다'; toast('이 브라우저에서 API 키를 삭제했습니다.', 'ok'); } },
      { label: '연결 테스트', cls: 'ghost', close: false, onClick: async (btn) => {
        await applyTemp(); updateAiDot();
        btn.disabled = true; status.innerHTML = '<span class="spinner"></span>테스트 중…';
        try {
          const r = await chat([{ role: 'user', content: 'Reply with JSON {"ok":true,"model":"<your model name>"}' }], { json: true, temperature: 0 });
          status.textContent = '연결 성공 ✓ ' + (r.model ? `(${r.model})` : '');
        } catch (e) { status.textContent = e.message; }
        btn.disabled = false;
      } },
      { label: '저장', cls: 'primary', onClick: async () => {
        const c = collect();
        if (keyIn.value.trim() && c.storage === 'local' && !passIn.value) {
          if (!confirm('키를 암호 없이 이 브라우저에 보관합니다. 개인 PC가 맞나요?')) return false;
        }
        setConfig(c);
        if (keyIn.value.trim()) await saveKey(keyIn.value, c.storage, c.storage === 'local' ? passIn.value : '');
        else if (keyStatus() === 'ready' && c.storage !== getConfig().storage) { /* 기존 키 유지 */ }
        updateAiDot();
        toast('AI 설정을 저장했습니다.', 'ok');
        onSaved && onSaved();
      } }
    ]
  });
}

// ======================= AI 점검 =======================
export async function aiReview(app) {
  const editor = app.editor;
  editor.c.discardActiveObject(); editor.c.renderAll();
  const local = runChecks(editor);
  const png = editor.toPNG();
  const resultBox = h('div', { class: 'ai-result' }, h('img', { class: 'ai-thumb', src: png, alt: '점검 대상' }), h('p', {}, h('span', { class: 'spinner' }), 'AI가 가이드 기준으로 점검하는 중입니다…'));
  openModal({ title: 'AI 가이드 점검', body: resultBox, wide: true, buttons: [{ label: '닫기', cls: 'ghost' }] });

  const sys = `당신은 학교 정문 옥외 LED 디지털 사이니지 콘텐츠 검수자입니다. 아래 '미림 디지털 사이니지 활용 가이드' 기준으로만 이미지를 평가하세요. 한국어로 답하세요.\n\n${guideRulesText(editor.guide, editor.signage)}`;
  const localSummary = local.items.filter(i => i.level !== 'pass').map(i => `- [${i.level}] ${i.title}: ${i.detail}`).join('\n') || '- 로컬 자동 점검에서 문제 없음';
  const user = `첨부 이미지는 실제 송출할 ${editor.spec.width}x${editor.spec.height}px PNG 입니다.
로컬 수치 점검 결과(참고): 평균 밝기 ${(local.stats.apl * 100).toFixed(0)}%, 배경 명도 ${local.stats.bgLevel}단계, 정보량 글자 ${local.stats.lines}줄/${local.stats.chars}자.
${localSummary}
AI 활용 제작 여부: ${editor.aiUsed ? '예' : '아니오(사용자 제작)'}

다음을 사람의 눈으로 확인하세요: 도로를 지나는 차량에서 3초 안에 핵심이 읽히는지, 글자 가독성(작은 글씨·얇은 획), 배색(어두운 배경/밝은 글씨, 원색·고채도), 빛 공해(밝은 면적), 정보량, 광고·학교 직접 홍보 성격 여부, 저작권 우려(명화·캐릭터·로고), AI 활용 표시, 맞춤법·오탈자.
아래 JSON 형식으로만 답하세요:
{"overall":"적합|보완 필요|부적합","score":0-100,"summary":"두세 문장 요약","items":[{"category":"가독성|배색|빛공해|정보량|레이아웃|공익성·광고성|저작권|AI 표시|맞춤법|기타","status":"pass|warn|fail","finding":"발견 내용","fix":"구체적인 수정 방법"}]}`;
  try {
    const r = await chat([{ role: 'system', content: sys }, { role: 'user', content: imageMessage(user, [png]) }], { json: true, temperature: 0.2 });
    renderReview(resultBox, png, r, app);
  } catch (e) {
    resultBox.innerHTML = '';
    resultBox.append(h('img', { class: 'ai-thumb', src: png }), h('div', { class: 'notice warn' }, e.message, h('br'),
      e instanceof AIError && /image|vision|multimodal|content/i.test(e.message) ? '선택한 모델이 이미지 입력(멀티모달)을 지원하는지 확인하세요.' : ''));
  }
}

function renderReview(box, png, r, app) {
  box.innerHTML = '';
  const map = { pass: 'pass', warn: 'warn', fail: 'fail', '적합': 'pass', '보완 필요': 'warn', '부적합': 'fail' };
  const ov = map[r.overall] || 'warn';
  box.append(
    h('div', { class: 'verdict' }, h('span', { class: 'big', style: { color: `var(--${ov === 'pass' ? 'ok' : ov})` } }, r.overall || '결과'), h('span', { class: 'score' }, (r.score ?? '–') + '점')),
    h('p', {}, r.summary || ''),
    h('div', { class: 'led-row' },
      h('img', { class: 'ai-thumb', src: png }),
      h('ul', { class: 'ai-items' }, ...(r.items || []).map(it => h('li', { class: 'check ' + (map[it.status] || 'info') },
        h('span', { class: 'dot' }),
        h('div', {}, h('div', { class: 'cat' }, it.category || ''), h('b', {}, it.finding || ''), it.fix ? h('div', { class: 'fix' }, '→ ' + it.fix) : null))))),
    h('p', { class: 'hint' }, 'AI 판단은 참고용입니다. 최종 확인은 담당자가 해 주세요.'),
    h('button', { class: 'btn small', onclick: async () => { const ch = await autoFix(app.editor); toast(ch.length ? `자동 보정 ${ch.length}건 적용` : '보정할 항목이 없습니다', 'ok'); app.scheduleCheck(0); } }, '가이드 자동 보정 실행'));
}

// ======================= AI 디자인 =======================
export function renderAiDesignPanel(app) {
  const root = $('#aiDesignPanel');
  root.innerHTML = '';
  root.className = 'ai-panel';
  const purpose = h('select', {}, ...['학교 행사 공지', '기념일·법정기념일', '계절 인사', '연말연시 인사', '공공PR(명화·예술 갤러리)', '방문·환영', '캠페인·안전', '기타'].map(v => h('option', { value: v }, v)));
  const content = h('textarea', { placeholder: '예)\n2027학년도 신입생 입학설명회\n일시: 11월 8일(토) 오후 2시\n장소: 미림마이스터고 대강당\n대상: 중학교 3학년 학생·학부모' });
  const style = h('input', { type: 'text', placeholder: '예) 가을 느낌, 차분한 네이비, 단정하게' });
  const useCurrent = h('input', { type: 'checkbox' });
  const genBg = h('input', { type: 'checkbox', checked: getConfig().imageEnabled });
  const refine = h('input', { type: 'checkbox', checked: true });
  let refImg = null;
  const refLabel = h('span', { class: 'hint' }, '');
  const status = h('div', { class: 'status' });
  const btn = h('button', { class: 'btn primary', style: { width: '100%', marginTop: '10px' } }, 'AI로 디자인 만들기');

  root.append(
    h('p', { class: 'hint' }, '내용을 넣으면 AI가 가이드(글자 크기·배색·정보량)에 맞춘 레이아웃을 만들고, 자동 점검·보정 후 ‘AI 활용 제작’ 표시를 붙입니다.'),
    h('div', { class: 'field' }, h('span', {}, '용도'), purpose),
    h('div', { class: 'field' }, h('span', {}, '들어갈 내용 (핵심만)'), content),
    h('div', { class: 'field' }, h('span', {}, '원하는 분위기·디자인'), style),
    h('div', { class: 'field' }, h('span', {}, '참고 이미지 (선택, 멀티모달)'), h('div', { class: 'row gap' },
      h('button', { class: 'btn small ghost', onclick: async () => { const f = await pickFile('#fileImage'); if (f) { refImg = await downscale(await readAs(f), 1024); refLabel.textContent = f.name; } } }, '이미지 선택'),
      h('button', { class: 'btn small ghost', onclick: () => { refImg = null; refLabel.textContent = ''; } }, '지우기'), refLabel)),
    h('label', { class: 'chk' }, useCurrent, ' 현재 디자인을 바탕으로 수정'),
    h('label', { class: 'chk' }, genBg, ' 배경 이미지도 AI로 생성 (이미지 API 필요)'),
    h('label', { class: 'chk' }, refine, ' 결과를 AI가 보고 1회 더 다듬기 (비전 모델 필요)'),
    btn, status);

  btn.addEventListener('click', async () => {
    if (!content.value.trim()) { toast('들어갈 내용을 입력하세요.', 'err'); content.focus(); return; }
    btn.disabled = true;
    const log = m => { status.innerHTML = `<span class="spinner"></span>${esc(m)}`; };
    try {
      await aiDesign(app, { purpose: purpose.value, content: content.value, style: style.value, useCurrent: useCurrent.checked, genBg: genBg.checked, refine: refine.checked, refImg }, log);
      status.textContent = '완료 — 오른쪽 ‘가이드 점검’ 결과를 확인하고 필요한 부분을 직접 다듬으세요.';
    } catch (e) {
      status.textContent = e.message;
    }
    btn.disabled = false;
  });
}

function downscale(dataURL, max) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataURL;
  });
}

function designSystemPrompt(editor, exampleTpl) {
  const g = editor.guide, s = editor.spec, fonts = editor.fonts;
  const fontLines = fonts.fonts.filter(f => !f.user).map(f => `- "${f.family}" (${f.label}) 굵기 ${f.weights.join('/')} · ${f.use.includes('body') ? '제목·본문' : '제목 전용'}`).join('\n');
  const T = g.typography;
  return `당신은 학교 정문 옥외 LED 사이니지 디자이너입니다. 요청 내용을 가이드에 맞는 레이아웃 JSON 으로 만듭니다.

${guideRulesText(g, editor.signage)}

[캔버스] 너비 ${s.width}px, 높이 ${s.height}px. 안전 여백 ${s.safeMargin}px — 모든 글자는 x ${s.safeMargin}~${s.width - s.safeMargin}, y ${s.safeMargin}~${s.height - s.safeMargin} 안에.
[글자 크기 px] 제목 ${T.presets[0].px}~96, 본문 ${T.presets[1].px}, 보조설명 ${T.presets[2].px}. ${T.minPx} 미만 금지. 줄 높이는 fontSize×lineHeight(1.15~1.3).
[사용 가능한 글꼴 — 이 목록만]
${fontLines}
[권장 배경색] ${g.color.backgrounds.map(b => b.hex).join(', ')} (또는 명도 5~8단계·저채도 색)
[권장 글자색] ${g.color.texts.map(b => b.hex).join(', ')}

[출력 JSON 형식]
{
  "name": "디자인 이름",
  "intent": "디자인 의도 한 문장",
  "background": {"type":"solid","color":"#RRGGBB"} 또는 {"type":"linear","angle":0-360,"stops":[{"offset":0,"color":"#.."},{"offset":1,"color":"#.."}]},
  "backgroundImagePrompt": "배경 이미지가 필요할 때 영어 프롬프트(글자 없는, 어둡고 차분한, 저채도 사진/일러스트). 필요 없으면 빈 문자열",
  "objects": [
    {"type":"text","role":"title|body|caption","text":"줄바꿈은 \\n","left":숫자,"top":숫자,"width":숫자,"fontFamily":"목록의 글꼴","fontSize":숫자,"fontWeight":숫자,"fill":"#RRGGBB","textAlign":"left|center|right","lineHeight":1.2},
    {"type":"rect","left":..,"top":..,"width":..,"height":..,"fill":"#RRGGBB 또는 rgba(0,0,0,0.3)","rx":0},
    {"type":"circle","left":..,"top":..,"radius":..,"fill":".."},
    {"type":"line","x1":..,"y1":..,"x2":..,"y2":..,"stroke":"#..","strokeWidth":4}
  ]
}
규칙: objects 는 뒤에서 앞 순서. 글자 객체는 3~6개 이내, 핵심만. 장식 도형은 저채도·반투명으로 절제. 글자끼리 겹치지 않게 top 을 (이전 top + fontSize×lineHeight×줄수 + 간격)으로 계산. 한국어 문구는 사용자가 준 사실(날짜·장소)을 바꾸지 말 것. 학교 이름 홍보·광고 문구를 과하게 넣지 말 것. JSON 만 출력.

[참고 예시 — 같은 화면의 템플릿]
${JSON.stringify(exampleTpl ? { background: exampleTpl.background, objects: exampleTpl.objects } : {})}`;
}

const ALLOWED = new Set(['text', 'rect', 'circle', 'line', 'triangle']);
function sanitizeDesign(d, editor) {
  const s = editor.spec, fonts = editor.fonts;
  const num = (v, def) => (typeof v === 'number' && isFinite(v) ? v : (parseFloat(v) || def));
  const hex = v => (typeof v === 'string' && /^(#[0-9a-f]{6}|#[0-9a-f]{3}|rgba?\([^)]+\))$/i.test(v.trim()) ? v.trim() : null);
  const objs = (Array.isArray(d.objects) ? d.objects : []).filter(o => o && ALLOWED.has(o.type)).slice(0, 24).map(o => {
    const r = { ...o };
    ['left', 'top', 'width', 'height', 'radius', 'x1', 'y1', 'x2', 'y2', 'fontSize', 'rx', 'strokeWidth', 'lineHeight'].forEach(k => { if (k in r) r[k] = num(r[k], 0); });
    if (r.type === 'text') {
      r.text = String(r.text ?? '').slice(0, 200);
      if (!fonts.get(r.fontFamily)) r.fontFamily = r.role === 'title' ? fonts.defaults.title : fonts.defaults.body;
      r.fontWeight = fonts.snapWeight(r.fontFamily, num(r.fontWeight, 800));
      const rp = editor.guide.typography.presets.find(x => x.role === r.role);
      if (!rp) r.role = 'body';
      r.fontSize = Math.max(rp ? rp.minPx : editor.guide.typography.minPx, Math.min(200, r.fontSize || 64));
      r.width = Math.min(s.width - 2 * s.safeMargin, Math.max(120, r.width || s.width - 2 * s.safeMargin));
      r.fill = hex(r.fill) || '#FFFFFF';
      r.lineHeight = Math.min(1.6, Math.max(1.05, r.lineHeight || 1.2));
      if (!['left', 'center', 'right'].includes(r.textAlign)) r.textAlign = 'left';
    } else {
      if (r.fill !== undefined) r.fill = hex(r.fill) || 'rgba(0,0,0,0.25)';
      if (r.stroke !== undefined) r.stroke = hex(r.stroke) || '#FFFFFF';
    }
    delete r.src;
    return r;
  });
  let bg = d.background;
  if (!bg || (bg.type !== 'solid' && bg.type !== 'linear')) bg = { type: 'solid', color: editor.guide.color.backgrounds[0].hex };
  if (bg.type === 'solid') bg = { type: 'solid', color: hex(bg.color) || '#156082' };
  else bg = { type: 'linear', angle: num(bg.angle, 90), stops: (bg.stops || []).slice(0, 4).map((st, i, a) => ({ offset: num(st.offset, i / Math.max(1, a.length - 1)), color: hex(st.color) || '#156082' })) };
  if (bg.type === 'linear' && bg.stops.length < 2) bg = { type: 'solid', color: bg.stops[0]?.color || '#156082' };
  return { name: String(d.name || 'AI 디자인').slice(0, 40), intent: d.intent, background: bg, backgroundImagePrompt: typeof d.backgroundImagePrompt === 'string' ? d.backgroundImagePrompt : '', objects: objs };
}

async function aiDesign(app, req, log) {
  const editor = app.editor;
  const example = req.useCurrent ? editor.toTemplate() : app.templates.list(editor.signage)[0];
  const sys = designSystemPrompt(editor, example);
  const userText = `용도: ${req.purpose}\n화면: ${editor.spec.name}\n들어갈 내용:\n${req.content}\n원하는 분위기·디자인: ${req.style || '가이드에 맞게 깔끔하게'}\n${req.useCurrent ? '※ 참고 예시는 현재 디자인입니다. 이를 바탕으로 요청 내용에 맞게 수정하세요.' : ''}${req.refImg ? '\n※ 첨부 이미지는 분위기 참고용입니다. 그대로 베끼지 말고 색감·구성만 참고하세요.' : ''}\n배경 이미지 생성: ${req.genBg ? '가능(backgroundImagePrompt 작성)' : '사용 안 함(빈 문자열)'}`;
  log('AI가 레이아웃을 구성하는 중…');
  const raw = await chat([{ role: 'system', content: sys }, { role: 'user', content: req.refImg ? imageMessage(userText, [req.refImg]) : userText }], { json: true, temperature: 0.6 });
  let design = sanitizeDesign(raw, editor);
  if (!design.objects.length) throw new AIError('AI가 유효한 디자인 요소를 만들지 못했습니다. 내용을 조금 더 구체적으로 적어 보세요.');

  let bgImage = null;
  if (req.genBg && design.backgroundImagePrompt) {
    log('배경 이미지를 생성하는 중… (30초~1분)');
    try {
      bgImage = await generateImage(`${design.backgroundImagePrompt}. Wide banner background for an outdoor LED sign, no text, no letters, no logos, calm, dark, low saturation, soft, uncluttered center area for text.`);
    } catch (e) { toast('배경 이미지 생성 실패 — 단색 배경으로 진행합니다. ' + e.message, 'err'); }
  }

  const apply = async (d) => {
    await editor.applyTemplate({ signage: editor.signage, name: d.name, background: d.background, objects: d.objects, aiGenerated: true });
    if (bgImage) { const img = await editor.addImage(bgImage, { asBackground: true, name: 'AI 배경 이미지' }); img.aiGenerated = true; editor.c.discardActiveObject(); }
    editor.aiUsed = true;
    log('가이드 자동 점검·보정 중…');
    await autoFix(editor);
    await editor.addAiLabel();
    app.refreshAll();
  };
  await apply(design);

  if (req.refine) {
    log('AI가 결과 이미지를 보고 다듬는 중…');
    try {
      const local = runChecks(editor);
      const png = editor.toPNG();
      const issues = local.items.filter(i => i.level === 'fail' || i.level === 'warn').map(i => `- ${i.title}: ${i.detail}`).join('\n') || '- 없음';
      const t2 = `첨부는 방금 만든 디자인을 실제 해상도로 렌더링한 결과입니다(배경 이미지 포함).\n자동 점검 지적사항:\n${issues}\n\n겹침·잘림·가독성·여백·정보량 문제를 고친 JSON 전체를 같은 형식으로 다시 출력하세요. 내용(사실)은 바꾸지 마세요. backgroundImagePrompt 는 빈 문자열로.\n현재 JSON:\n${JSON.stringify({ background: design.background, objects: design.objects })}`;
      const raw2 = await chat([{ role: 'system', content: sys }, { role: 'user', content: imageMessage(t2, [png]) }], { json: true, temperature: 0.3 });
      const d2 = sanitizeDesign(raw2, editor);
      if (d2.objects.length) { design = { ...d2, name: design.name }; await apply(design); }
    } catch (e) {
      toast('다듬기 단계는 건너뛰었습니다: ' + e.message.split('\n')[0], 'err');
    }
  }
  editor.c.discardActiveObject();
  editor.c.requestRenderAll();
  editor.pushHistory();
  app.refreshAll();
  toast(`AI 디자인 “${design.name}” 적용 완료`, 'ok');
}
