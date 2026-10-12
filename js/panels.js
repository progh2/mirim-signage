// 속성·레이어·요소·점검 패널
import { $, h, colorInput, normalizeHex, toast, pickFile, readAs } from './ui.js';
import { getImageFx, setImageFx, setRadius, openCropper, applyCrop } from './imagetools.js';
import { oklchOfHex, lightnessLevel } from './color.js';

const isText = o => o && (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text');

// ===================== 속성 패널 =====================
export function renderProps(editor, app) {
  const body = $('#propsBody');
  const title = $('#propsTitle');
  body.innerHTML = '';
  const list = editor.activeList();
  const g = editor.guide;

  const commitSoon = debounce(() => editor.commit(), 350);
  const apply = (o, props, { now = false } = {}) => {
    o.set(props); o.setCoords && o.setCoords();
    editor.c.requestRenderAll();
    now ? editor.commit() : commitSoon();
    app.scheduleCheck();
  };

  if (!list.length) {
    title.textContent = '배경 · 화면 설정';
    body.append(backgroundEditor(editor, app));
    return;
  }
  if (list.length > 1) {
    title.textContent = `${list.length}개 선택됨`;
    body.append(group('정렬 (안전 여백 기준)', alignButtons(editor)), group('', h('div', { class: 'row gap' },
      h('button', { class: 'btn small', onclick: () => editor.duplicate() }, '복제'),
      h('button', { class: 'btn small danger', onclick: () => editor.removeActive() }, '삭제'))));
    return;
  }

  const o = list[0];
  if (isText(o)) {
    title.textContent = o.role === 'ai-label' ? 'AI 활용 표시' : '글자';
    body.append(textProps(editor, app, o, apply));
  } else if (o.type === 'image') {
    title.textContent = o.role === 'background-image' ? '배경 이미지' : '이미지';
    body.append(imageProps(editor, app, o, apply));
  } else if (o.role === 'image-slot') {
    title.textContent = '이미지 자리';
    body.append(group('', h('p', { class: 'hint' }, '이미지를 넣으면 이 영역 안에 자르지 않고 맞춰집니다.'),
      h('button', { class: 'btn small primary', onclick: () => app.replaceImageFlow(o) }, '이미지 넣기')));
  } else {
    title.textContent = { rect: '사각형', circle: '원', triangle: '삼각형', line: '선' }[o.type] || '도형';
    body.append(shapeProps(editor, app, o, apply));
  }
  body.append(geometry(editor, app, o, apply));
  body.append(group('정렬 (안전 여백 기준)', alignButtons(editor)));
  body.append(group('순서 · 편집', h('div', { class: 'grid4' },
    h('button', { class: 'btn small ghost', title: '맨 앞으로', onclick: () => { editor.bringToFront(); app.refreshLayers(); } }, '맨 앞'),
    h('button', { class: 'btn small ghost', title: '앞으로', onclick: () => { editor.bringForward(); app.refreshLayers(); } }, '앞으로'),
    h('button', { class: 'btn small ghost', title: '뒤로', onclick: () => { editor.sendBackward(); app.refreshLayers(); } }, '뒤로'),
    h('button', { class: 'btn small ghost', title: '맨 뒤로', onclick: () => { editor.sendToBack(); app.refreshLayers(); } }, '맨 뒤')),
  h('div', { class: 'row gap', style: { marginTop: '6px' } },
    h('button', { class: 'btn small', onclick: () => editor.duplicate() }, '복제'),
    h('button', { class: 'btn small', onclick: () => { editor.setLocked(o, true); app.refreshLayers(); } }, '잠금'),
    h('button', { class: 'btn small danger', onclick: () => editor.removeActive() }, '삭제'))));
}

function group(label, ...children) {
  return h('div', { class: 'prop-group' }, label ? h('label', { class: 'title' }, label) : null, ...children);
}
function field(label, control, cls = '') { return h('div', { class: 'field ' + cls }, h('span', {}, label), control); }

function numInput(value, onChange, { min, max, step = 1 } = {}) {
  const i = h('input', { type: 'number', value: Math.round(value * 10) / 10, min, max, step });
  i.addEventListener('change', () => { const v = parseFloat(i.value); if (!isNaN(v)) onChange(v); });
  return i;
}
function range(value, onInput, { min, max, step }) {
  const out = h('span', { style: { minWidth: '38px', textAlign: 'right', fontSize: '12px', color: 'var(--muted)' } });
  const fmt = v => (Math.abs(step) < 1 ? Number(v).toFixed(2) : v);
  const i = h('input', { type: 'range', value, min, max, step });
  out.textContent = fmt(value);
  i.addEventListener('input', () => { out.textContent = fmt(i.value); onInput(parseFloat(i.value)); });
  return h('div', { class: 'row gap', style: { flexWrap: 'nowrap' } }, i, out);
}

function alignButtons(editor) {
  const b = (k, label, t) => h('button', { class: 'btn small ghost', title: t, onclick: () => editor.align(k) }, label);
  return h('div', {},
    h('div', { class: 'grid4', style: { gridTemplateColumns: 'repeat(3,1fr)' } }, b('left', '⇤ 왼쪽', '왼쪽 여백에 맞춤'), b('hcenter', '↔ 가운데', '가로 가운데'), b('right', '오른쪽 ⇥', '오른쪽 여백에 맞춤')),
    h('div', { class: 'grid4', style: { gridTemplateColumns: 'repeat(3,1fr)', marginTop: '6px' } }, b('top', '⤒ 위', '위 여백'), b('vcenter', '↕ 가운데', '세로 가운데'), b('bottom', '⤓ 아래', '아래 여백')));
}

function textProps(editor, app, o, apply) {
  const g = editor.guide, fonts = editor.fonts, T = g.typography;
  const wrap = h('div');
  // 내용
  const ta = h('textarea', { rows: 3 }, o.text);
  ta.addEventListener('input', () => { o.set('text', ta.value); o.initDimensions(); fonts.load(o.fontFamily, o.fontWeight, ta.value).then(() => { o.initDimensions(); editor.c.requestRenderAll(); }); apply(o, {}); app.refreshLayers(); });
  wrap.append(group('내용', ta));

  // 크기 프리셋
  const sizeIn = numInput(o.fontSize * (o.scaleY || 1), v => { apply(o, { fontSize: v, scaleX: 1, scaleY: 1 }, { now: true }); updHint(); });
  const hint = h('div', { class: 'size-hint' });
  const updHint = () => {
    const px = o.fontSize * (o.scaleY || 1);
    const pt = Math.round(px / g.pxPerPt);
    const bad = px < T.minPx && o.role !== 'ai-label';
    hint.className = 'size-hint' + (bad ? ' bad' : '');
    hint.textContent = `≈ ${pt}pt (파워포인트 34×17cm 기준)` + (bad ? ` · ${T.minPx}px(32pt) 미만은 LED에서 깨집니다` : '');
  };
  updHint();
  const presets = h('div', { class: 'preset-row' }, ...T.presets.map(p =>
    h('button', { class: 'btn small ' + (o.role === p.role ? 'primary' : 'ghost'), title: p.desc, onclick: () => {
      apply(o, { fontSize: p.px, scaleX: 1, scaleY: 1, role: p.role }, { now: true });
      sizeIn.value = p.px; updHint(); app.refreshProps();
    } }, `${p.label} ${p.px}`)));

  // 글꼴
  const famSel = h('select');
  const groups = [
    ['제목 · 본문용 (굵은 고딕)', f => f.use.includes('body') && !f.user],
    ['제목 전용', f => !f.use.includes('body') && !f.user],
    ['불러온 글꼴', f => f.user]
  ];
  for (const [label, pred] of groups) {
    const fs = fonts.fonts.filter(pred);
    if (!fs.length) continue;
    const og = h('optgroup', { label });
    fs.forEach(f => og.append(h('option', { value: f.family, selected: f.family === o.fontFamily }, f.label)));
    famSel.append(og);
  }
  if (!fonts.get(o.fontFamily)) famSel.prepend(h('option', { value: o.fontFamily, selected: true }, o.fontFamily + ' (미등록)'));
  const wSel = h('select');
  const fillW = () => {
    wSel.innerHTML = '';
    const f = fonts.get(o.fontFamily);
    (f?.weights || [400, 700]).forEach(w => wSel.append(h('option', { value: w, selected: Number(o.fontWeight) === w }, String(w))));
  };
  fillW();
  famSel.addEventListener('change', async () => {
    const fam = famSel.value;
    const w = fonts.snapWeight(fam, o.fontWeight);
    await fonts.load(fam, w, o.text);
    fabric.util.clearFabricFontCache(fam);
    o.set({ fontFamily: fam, fontWeight: w }); o.initDimensions();
    apply(o, {}, { now: true }); fillW(); fontNote.textContent = fonts.get(fam)?.note || '';
  });
  wSel.addEventListener('change', async () => {
    const w = Number(wSel.value);
    await fonts.load(o.fontFamily, w, o.text);
    fabric.util.clearFabricFontCache(o.fontFamily);
    o.set({ fontWeight: w }); o.initDimensions(); apply(o, {}, { now: true });
  });
  const fontNote = h('div', { class: 'size-hint' }, fonts.get(o.fontFamily)?.note || '');

  const alignSeg = h('div', { class: 'seg' }, ...[['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']].map(([v, l]) =>
    h('button', { class: o.textAlign === v ? 'on' : '', onclick: e => { apply(o, { textAlign: v }, { now: true }); [...e.target.parentNode.children].forEach(b => b.classList.toggle('on', b === e.target)); } }, l)));

  wrap.append(group('글자 크기 (가이드 03-4)', presets, field('크기(px)', sizeIn), hint));
  wrap.append(group('글꼴 (가이드 03-2)', field('글꼴', famSel), field('굵기', wSel), fontNote));
  wrap.append(group('문단', field('정렬', alignSeg),
    field('줄 간격', range(o.lineHeight, v => { o.set('lineHeight', v); o.initDimensions(); apply(o, {}); }, { min: 0.8, max: 2, step: 0.05 })),
    field('자간', range(o.charSpacing || 0, v => { o.set('charSpacing', v); o.initDimensions(); apply(o, {}); }, { min: -100, max: 400, step: 10 }))));

  wrap.append(group('색 (어두운 배경 + 밝은 글씨)',
    field('글자색', colorInput(typeof o.fill === 'string' ? toHexSafe(o.fill) : '#FFFFFF', v => apply(o, { fill: v }, { now: true }), g.color.texts)),
    field('외곽선', h('div', { class: 'row gap' },
      colorInput(o.stroke || '#000000', v => apply(o, { stroke: v, strokeWidth: o.strokeWidth || 3, paintFirst: 'stroke' }, { now: true })),
      numInput(o.strokeWidth || 0, v => apply(o, { strokeWidth: v, stroke: o.stroke || '#000000', paintFirst: 'stroke' }, { now: true }), { min: 0, max: 20 }))),
    field('그림자', h('label', { class: 'chk' }, (() => {
      const c = h('input', { type: 'checkbox', checked: !!o.shadow });
      c.addEventListener('change', () => apply(o, { shadow: c.checked ? new fabric.Shadow({ color: 'rgba(0,0,0,0.55)', blur: 10, offsetX: 0, offsetY: 3 }) : null }, { now: true }));
      return c;
    })(), '은은한 그림자')),
    field('불투명도', range(o.opacity ?? 1, v => apply(o, { opacity: v }), { min: 0.1, max: 1, step: 0.05 }))));
  return wrap;
}

function shapeProps(editor, app, o, apply) {
  const g = editor.guide;
  const wrap = h('div');
  const shapeSw = g.color.backgrounds.concat(g.color.texts).concat([{ name: '반투명 검정', hex: '#000000' }]);
  if (o.type !== 'line') {
    if (o.gradSpec) {
      wrap.append(group('채우기', h('p', { class: 'hint' }, '그라데이션 채우기입니다.'),
        h('button', { class: 'btn small ghost', onclick: () => { const first = o.gradSpec?.stops?.[0]?.color || '#2B4A6F'; o.gradSpec = null; apply(o, { fill: first }, { now: true }); app.refreshProps(); } }, '단색으로 바꾸기')));
    } else {
      const fill = typeof o.fill === 'string' ? o.fill : '#2B4A6F';
      const alpha = parseAlpha(fill);
      wrap.append(group('채우기',
        field('색', colorInput(toHexSafe(fill), v => apply(o, { fill: withAlpha(v, alphaNow()) }, { now: true }), shapeSw)),
        field('투명도', range(alpha, v => { apply(o, { fill: withAlpha(toHexSafe(o.fill), v) }); }, { min: 0, max: 1, step: 0.05 }))));
      var alphaNow = () => parseAlpha(o.fill);
    }
  }
  wrap.append(group('선',
    field('선 색', colorInput(toHexSafe(o.stroke || '#FFFFFF'), v => apply(o, { stroke: v, strokeWidth: o.strokeWidth || 4 }, { now: true }))),
    field('선 굵기', numInput(o.strokeWidth || 0, v => apply(o, { strokeWidth: v, stroke: o.stroke || '#FFFFFF' }, { now: true }), { min: 0, max: 60 }))));
  if (o.type === 'rect') wrap.append(group('모서리', field('둥글기', range(o.rx || 0, v => apply(o, { rx: v, ry: v }), { min: 0, max: Math.round(Math.min(o.width, o.height) / 2), step: 1 }))));
  wrap.append(group('', field('불투명도', range(o.opacity ?? 1, v => apply(o, { opacity: v }), { min: 0.05, max: 1, step: 0.05 }))));
  return wrap;
}

function imageProps(editor, app, o, apply) {
  const wrap = h('div');
  const fx = getImageFx(o);
  let raf = 0;
  const setFx = patch => {
    Object.assign(fx, patch);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { setImageFx(o, fx); apply(o, {}); });
  };
  const el = o._originalElement || o._element;
  const natW = el?.naturalWidth || el?.width || o.width, natH = el?.naturalHeight || el?.height || o.height;
  const cropped = (o.cropX || o.cropY || o.width !== natW || o.height !== natH);

  // 자르기 · 회전 · 반전
  wrap.append(group('자르기 · 회전 · 반전',
    h('div', { class: 'row gap' },
      h('button', { class: 'btn small primary', onclick: () => openCropper(o, {
        signageRatio: editor.W / editor.H,
        onApply: c => { applyCrop(o, c); apply(o, {}, { now: true }); app.refreshProps(); }
      }) }, '✂ 자르기'),
      cropped ? h('button', { class: 'btn small ghost', onclick: () => { applyCrop(o, { x: 0, y: 0, w: natW, h: natH }); apply(o, {}, { now: true }); app.refreshProps(); } }, '자르기 취소') : null),
    h('div', { class: 'grid4', style: { marginTop: '6px' } },
      h('button', { class: 'btn small ghost', title: '왼쪽으로 90° 회전', onclick: () => { o.rotate(((o.angle || 0) - 90 + 360) % 360); apply(o, {}, { now: true }); } }, '⟲ 90°'),
      h('button', { class: 'btn small ghost', title: '오른쪽으로 90° 회전', onclick: () => { o.rotate(((o.angle || 0) + 90) % 360); apply(o, {}, { now: true }); } }, '⟳ 90°'),
      h('button', { class: 'btn small ghost', title: '좌우 뒤집기', onclick: () => apply(o, { flipX: !o.flipX }, { now: true }) }, '⇋ 좌우'),
      h('button', { class: 'btn small ghost', title: '상하 뒤집기', onclick: () => apply(o, { flipY: !o.flipY }, { now: true }) }, '⇵ 상하'))));

  // 보정
  const gray = h('input', { type: 'checkbox', checked: !!fx.grayscale });
  gray.addEventListener('change', () => setFx({ grayscale: gray.checked }));
  wrap.append(group('색 보정 (빛 공해 고려)',
    field('밝기', range(fx.brightness, v => setFx({ brightness: v }), { min: -0.8, max: 0.4, step: 0.05 })),
    field('대비', range(fx.contrast, v => setFx({ contrast: v }), { min: -0.6, max: 0.6, step: 0.05 })),
    field('채도', range(fx.saturation, v => setFx({ saturation: v }), { min: -1, max: 0.6, step: 0.05 })),
    field('흐림', range(fx.blur, v => setFx({ blur: v }), { min: 0, max: 0.6, step: 0.02 })),
    field('흑백', h('label', { class: 'chk' }, gray, '흑백으로')),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn small ghost', title: '글자를 올릴 배경용: 어둡게 + 채도 낮춤 + 살짝 흐림', onclick: () => { setFx({ brightness: -0.3, saturation: -0.3, blur: 0.06, contrast: -0.05 }); setTimeout(() => app.refreshProps(), 60); } }, '배경용 프리셋'),
      h('button', { class: 'btn small ghost', onclick: () => { setFx({ brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: false }); setTimeout(() => app.refreshProps(), 60); } }, '보정 초기화')),
    h('p', { class: 'hint' }, '사진이 밝으면 밝기를 낮추세요. 글자를 올릴 배경은 ‘배경용 프리셋’을 권장합니다.')));

  // 모양
  wrap.append(group('모양',
    field('모서리', range(o.radius || 0, v => { setRadius(o, v); apply(o, {}); }, { min: 0, max: Math.round(Math.min(o.getScaledWidth(), o.getScaledHeight()) / 2), step: 2 })),
    field('테두리', h('div', { class: 'row gap' },
      colorInput(toHexSafe(o.stroke || '#FFFFFF'), v => apply(o, { stroke: v, strokeWidth: o.strokeWidth || 6, strokeUniform: true }, { now: true })),
      numInput(o.stroke ? o.strokeWidth : 0, v => apply(o, { strokeWidth: v, stroke: v ? (o.stroke || '#FFFFFF') : null, strokeUniform: true }, { now: true }), { min: 0, max: 40 }))),
    field('그림자', h('label', { class: 'chk' }, (() => {
      const c = h('input', { type: 'checkbox', checked: !!o.shadow });
      c.addEventListener('change', () => apply(o, { shadow: c.checked ? new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 24, offsetX: 0, offsetY: 8 }) : null }, { now: true }));
      return c;
    })(), '그림자')),
    field('불투명도', range(o.opacity ?? 1, v => apply(o, { opacity: v }), { min: 0.05, max: 1, step: 0.05 }))));

  // 배치
  wrap.append(group('배치', h('div', { class: 'row gap' },
    h('button', { class: 'btn small', onclick: () => app.replaceImageFlow(o) }, '이미지 교체'),
    h('button', { class: 'btn small ghost', title: '가로세로 비율을 원본대로', onclick: () => apply(o, { scaleY: o.scaleX }, { now: true }) }, '비율 원래대로'),
    h('button', { class: 'btn small ghost', onclick: () => {
      o.clipPath = null; o.radius = 0;
      const s = Math.max(editor.W / o.width, editor.H / o.height);
      o.set({ scaleX: s, scaleY: s, left: (editor.W - o.width * s) / 2, top: (editor.H - o.height * s) / 2, angle: 0, role: 'background-image', name: '배경 이미지' });
      o.moveTo(1); apply(o, {}, { now: true }); app.refreshLayers(); app.refreshProps();
    } }, '화면 가득 채우기'),
    h('button', { class: 'btn small ghost', onclick: () => {
      o.clipPath = null;
      const s = Math.min(editor.W / o.width, editor.H / o.height);
      o.set({ scaleX: s, scaleY: s, left: (editor.W - o.width * s) / 2, top: (editor.H - o.height * s) / 2, angle: 0 });
      if (o.radius) setRadius(o, o.radius);
      apply(o, {}, { now: true });
    } }, '화면에 맞추기'))));
  return wrap;
}

function geometry(editor, app, o, apply) {
  const r = o.getBoundingRect(true, true);
  const x = numInput(o.left, v => apply(o, { left: v }, { now: true }));
  const y = numInput(o.top, v => apply(o, { top: v }, { now: true }));
  let w, hh;
  if (isText(o)) {
    w = numInput(o.width * (o.scaleX || 1), v => { o.set({ width: v / (o.scaleX || 1) }); o.initDimensions(); apply(o, {}, { now: true }); });
    hh = h('input', { type: 'number', value: Math.round(r.height), disabled: true, title: '글상자 높이는 내용에 따라 자동' });
  } else if (o.type === 'line') {
    w = numInput(o.getScaledWidth(), v => apply(o, { scaleX: v / o.width }, { now: true }));
    hh = h('input', { type: 'number', value: Math.round(o.strokeWidth), disabled: true });
  } else {
    w = numInput(o.getScaledWidth(), v => apply(o, { scaleX: v / o.width }, { now: true }));
    hh = numInput(o.getScaledHeight(), v => apply(o, { scaleY: v / o.height }, { now: true }));
  }
  const ang = numInput(o.angle || 0, v => apply(o, { angle: v }, { now: true }), { min: -360, max: 360 });
  return group('위치 · 크기 (px)',
    h('div', { class: 'grid2' }, h('label', { class: 'mini' }, 'X', x), h('label', { class: 'mini' }, 'Y', y), h('label', { class: 'mini' }, 'W', w), h('label', { class: 'mini' }, 'H', hh)),
    h('div', { class: 'grid2', style: { marginTop: '6px' } }, h('label', { class: 'mini' }, '∠', ang)));
}

function backgroundEditor(editor, app) {
  const g = editor.guide;
  const wrap = h('div');
  const spec = JSON.parse(JSON.stringify(editor.bg?.bgSpec || { type: 'solid', color: '#156082' }));
  const info = h('div', { class: 'size-hint' });
  const updInfo = () => {
    const col = spec.type === 'solid' ? spec.color : spec.stops?.[0]?.color;
    const ok = oklchOfHex(col);
    if (!ok) return;
    const lvl = lightnessLevel(ok.L, g.color.lightnessLevels);
    const good = ok.L >= g.color.bgL.warnBelow && ok.L <= g.color.bgL.recommendedMax && ok.C <= g.color.bgChroma.max;
    info.className = 'size-hint' + (good ? '' : ' bad');
    info.textContent = `명도 약 ${lvl}단계 · 채도 ${ok.C.toFixed(2)} — ` + (good ? '가이드 범위' : '가이드 범위(5~8단계, 중간~저채도) 밖');
  };
  const set = () => { editor.setBackground(JSON.parse(JSON.stringify(spec))); updInfo(); app.scheduleCheck(); };

  const typeSeg = h('div', { class: 'seg' },
    h('button', { class: spec.type === 'solid' ? 'on' : '', onclick: () => { spec.type = 'solid'; spec.color = spec.color || spec.stops?.[0]?.color || '#156082'; set(); app.refreshProps(); } }, '단색'),
    h('button', { class: spec.type === 'linear' ? 'on' : '', onclick: () => {
      const c = spec.color || '#156082';
      Object.assign(spec, { type: 'linear', angle: 90, stops: spec.stops || [{ offset: 0, color: c }, { offset: 1, color: '#2B4A6F' }] });
      set(); app.refreshProps();
    } }, '그라데이션'));
  wrap.append(group('배경 (가이드 03-3)', field('종류', typeSeg)));
  if (spec.type === 'solid') {
    wrap.append(group('', field('색', colorInput(spec.color, v => { spec.color = v; set(); }, g.color.backgrounds)), info));
  } else {
    wrap.append(group('',
      field('시작 색', colorInput(spec.stops[0].color, v => { spec.stops[0].color = v; set(); }, g.color.backgrounds.slice(0, 5))),
      field('끝 색', colorInput(spec.stops[spec.stops.length - 1].color, v => { spec.stops[spec.stops.length - 1].color = v; set(); }, g.color.backgrounds.slice(5))),
      field('방향', range(spec.angle ?? 90, v => { spec.angle = v; set(); }, { min: 0, max: 360, step: 15 })), info));
  }
  updInfo();
  const s = editor.spec;
  wrap.append(group('현재 화면', h('p', { class: 'hint', style: { margin: 0 } },
    `${s.name}\n`, h('br'), `${s.width}×${s.height}px · ${s.physical}`, h('br'),
    `안전 여백 ${s.safeMargin}px · 권장 ${s.maxTextLines}줄 / ${s.maxChars}자 이내`)));
  wrap.append(group('', h('p', { class: 'hint', style: { margin: 0 } }, '객체를 클릭하면 해당 속성이 이곳에 나타납니다.')));
  return wrap;
}

function toHexSafe(c) {
  if (!c || typeof c !== 'string') return '#000000';
  if (c.startsWith('#')) return normalizeHex(c);
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(Number); return '#' + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(); }
  return '#000000';
}
function parseAlpha(c) { const m = String(c).match(/rgba\([^)]*,\s*([\d.]+)\)/); return m ? parseFloat(m[1]) : 1; }
function withAlpha(hex, a) {
  if (a >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ===================== 레이어 패널 =====================
export function renderLayers(editor, app) {
  const ul = $('#layerList');
  ul.innerHTML = '';
  const objs = editor.c.getObjects();
  const active = new Set(editor.activeList());
  const icon = o => o.role === 'background' ? '▦' : o.type === 'textbox' ? 'T' : o.type === 'image' ? '🖼' : o.role === 'image-slot' ? '⬚' : o.type === 'circle' ? '●' : o.type === 'line' ? '╱' : '■';
  let dragUid = null;
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    const isBg = o.role === 'background';
    const name = h('span', { class: 'lname', title: editor.layerName(o) }, editor.layerName(o));
    const li = h('li', {
      class: 'layer' + (active.has(o) ? ' selected' : '') + (o.visible === false ? ' hidden-layer' : '') + (o.locked ? ' locked-layer' : '') + (isBg ? ' bg-layer' : ''),
      draggable: isBg ? 'false' : 'true'
    },
    h('span', { class: 'ico' }, icon(o)), name,
    isBg ? h('span', { class: 'lbtns' }, h('button', { title: '배경 설정', onclick: e => { e.stopPropagation(); editor.c.discardActiveObject(); editor.c.requestRenderAll(); app.refreshProps(); } }, '설정'))
      : h('span', { class: 'lbtns' },
        h('button', { title: o.visible === false ? '보이기' : '숨기기', onclick: e => { e.stopPropagation(); editor.setVisible(o, o.visible === false); app.refreshLayers(); } }, o.visible === false ? '◌' : '◉'),
        h('button', { title: o.locked ? '잠금 해제' : '잠금', onclick: e => { e.stopPropagation(); editor.setLocked(o, !o.locked); app.refreshLayers(); } }, o.locked ? '🔒' : '🔓'),
        h('button', { title: '삭제', onclick: e => { e.stopPropagation(); editor.c.remove(o); editor.commit(); app.refreshLayers(); } }, '✕')));
    li.addEventListener('click', () => { if (isBg) { editor.c.discardActiveObject(); editor.c.requestRenderAll(); app.refreshProps(); } else editor.select(o); });
    name.addEventListener('dblclick', e => {
      if (isBg) return;
      e.stopPropagation();
      const inp = h('input', { type: 'text', value: o.name || editor.layerName(o) });
      name.innerHTML = ''; name.append(inp); inp.focus(); inp.select();
      const done = () => { o.name = inp.value.trim() || undefined; editor.commit(); app.refreshLayers(); };
      inp.addEventListener('blur', done);
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') { inp.value = o.name || ''; inp.blur(); } });
    });
    li.addEventListener('dragstart', e => { dragUid = o.uid; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', o.uid); });
    li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('dragover'); });
    li.addEventListener('dragleave', () => li.classList.remove('dragover'));
    li.addEventListener('drop', e => {
      e.preventDefault(); li.classList.remove('dragover');
      const uid = dragUid || e.dataTransfer.getData('text/plain');
      const src = objs.find(x => x.uid === uid);
      if (!src || src === o) return;
      // 목록 위쪽 = 앞쪽. 대상 바로 앞(위)으로 이동
      const targetIdx = editor.c.getObjects().indexOf(o);
      const srcIdx = editor.c.getObjects().indexOf(src);
      editor.reorder(src, srcIdx < targetIdx ? targetIdx : targetIdx + 1);
      app.refreshLayers();
    });
    ul.append(li);
  }
}

// ===================== 점검 패널 =====================
export function renderChecks(result, editor, app) {
  const ul = $('#checkList');
  ul.innerHTML = '';
  const sc = $('#checkScore');
  sc.textContent = result.score + '점';
  sc.className = 'score ' + (result.score >= 85 ? 'good' : result.score >= 60 ? 'mid' : 'bad');
  for (const it of result.items) {
    const li = h('li', { class: `check ${it.level}` + (it.obj ? ' clickable' : ''), title: it.obj ? '클릭하면 해당 요소를 선택합니다' : '' },
      h('span', { class: 'dot' }),
      h('div', {}, h('b', {}, it.title, it.ref ? h('span', { class: 'ref' }, '가이드 ' + it.ref) : null), h('small', {}, it.detail)));
    if (it.obj) li.addEventListener('click', () => editor.select(it.obj));
    ul.append(li);
  }
}

export function renderManual(editor) {
  const ul = $('#manualList');
  ul.innerHTML = '';
  const key = 'mirim.manual.' + editor.signage;
  let state = {};
  try { state = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
  for (const m of editor.guide.manualChecklist) {
    const c = h('input', { type: 'checkbox', checked: !!state[m.id] });
    c.addEventListener('change', () => { state[m.id] = c.checked; localStorage.setItem(key, JSON.stringify(state)); });
    ul.append(h('li', {}, h('label', {}, c, h('span', {}, m.text))));
  }
}

// ===================== 요소 패널 =====================
export function renderElements(editor, app) {
  const sw = $('#bgSwatches');
  sw.innerHTML = '';
  for (const b of editor.guide.color.backgrounds) {
    sw.append(h('button', { class: 'swatch', title: `${b.name} ${b.hex}`, style: { background: b.hex }, onclick: () => {
      const cur = editor.bg?.bgSpec;
      if (cur?.type === 'linear') { const sp = JSON.parse(JSON.stringify(cur)); sp.stops[0].color = b.hex; editor.setBackground(sp); }
      else editor.setBackground({ type: 'solid', color: b.hex });
      app.refreshProps(); app.scheduleCheck();
    } }));
  }
  const fl = $('#fontList');
  fl.innerHTML = '';
  for (const f of editor.fonts.fonts) {
    fl.append(h('li', {},
      h('span', { class: 'fname', style: { fontFamily: `"${f.family}"`, fontWeight: f.weights[f.weights.length - 1] } }, f.label.replace(/\(.*\)/, '').trim()),
      h('small', {}, f.use.includes('body') ? '제목·본문' : '제목 전용', h('br'), f.license.split('(')[0].trim())));
  }
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export { pickFile, readAs, toast };
