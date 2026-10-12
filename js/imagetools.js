// 이미지 도구: 크기 줄이기, 필터, 자르기 창
import { h, openModal } from './ui.js';

// 큰 사진은 편집·저장에 부담이 크므로 긴 변 기준으로 줄인다 (사이니지 최대 1664px → 2배 여유)
export function prepareImage(src, maxSide = 2400) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const isPng = /^data:image\/(png|gif|webp)/i.test(src);
      if (s === 1 && src.length < 6e6) { res(src); return; }
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      res(isPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => rej(new Error('이미지를 읽지 못했습니다.'));
    img.src = src;
  });
}

export function blobToDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

// ---------- 필터 ----------
export const FX_DEFAULT = { brightness: 0, contrast: 0, saturation: 0, blur: 0, grayscale: false };

export function setImageFx(img, fx) {
  const F = fabric.Image.filters;
  img.fx = { ...getImageFx(img), ...fx };
  img.brightness = img.fx.brightness; // 이전 버전 호환
  const f = img.fx, list = [];
  if (f.brightness) list.push(new F.Brightness({ brightness: f.brightness }));
  if (f.contrast) list.push(new F.Contrast({ contrast: f.contrast }));
  if (f.saturation) list.push(new F.Saturation({ saturation: f.saturation }));
  if (f.grayscale) list.push(new F.Grayscale());
  if (f.blur) list.push(new F.Blur({ blur: f.blur }));
  img.filters = list;
  img.applyFilters();
  img.dirty = true;
}

export function getImageFx(img) {
  return { ...FX_DEFAULT, ...(img.fx || {}), brightness: img.fx ? img.fx.brightness : (img.brightness || 0) };
}

// 모서리 둥글게 (객체 기준 clipPath)
export function setRadius(img, r) {
  img.radius = r;
  if (!r) { if (img.clipPath && !img.clipPath.absolutePositioned) img.clipPath = null; img.dirty = true; return; }
  img.clipPath = new fabric.Rect({
    width: img.width, height: img.height, rx: r / (img.scaleX || 1), ry: r / (img.scaleY || 1),
    originX: 'center', originY: 'center', left: 0, top: 0
  });
  img.dirty = true;
}

// ---------- 자르기 창 ----------
export function openCropper(img, { signageRatio, onApply }) {
  const el = img._originalElement || img._element;
  const W = el.naturalWidth || el.width, H = el.naturalHeight || el.height;
  const view = 760, viewH = 440;
  const s = Math.min(view / W, viewH / H);
  const cw = Math.round(W * s), ch = Math.round(H * s);
  const cv = h('canvas', { width: cw, height: ch, style: { cursor: 'crosshair', display: 'block', margin: '0 auto', touchAction: 'none' } });
  const ctx = cv.getContext('2d');
  // 현재 자르기 영역 (원본 픽셀 단위)
  let r = { x: img.cropX || 0, y: img.cropY || 0, w: img.width, h: img.height };
  let ratio = null;
  const info = h('div', { class: 'hint', style: { textAlign: 'center' } });

  const draw = () => {
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(el, 0, 0, cw, ch);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const x = r.x * s, y = r.y * s, w = r.w * s, hh = r.h * s;
    ctx.fillRect(0, 0, cw, y); ctx.fillRect(0, y + hh, cw, ch - y - hh); ctx.fillRect(0, y, x, hh); ctx.fillRect(x + w, y, cw - x - w, hh);
    ctx.strokeStyle = '#3fa7c9'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, hh - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + w * i / 3, y); ctx.lineTo(x + w * i / 3, y + hh); ctx.moveTo(x, y + hh * i / 3); ctx.lineTo(x + w, y + hh * i / 3); ctx.stroke(); }
    ctx.fillStyle = '#fff';
    for (const [hx, hy] of handles()) ctx.fillRect(hx - 6, hy - 6, 12, 12);
    info.textContent = `선택 영역 ${Math.round(r.w)} × ${Math.round(r.h)}px (원본 ${W} × ${H}px)`;
  };
  const handles = () => { const x = r.x * s, y = r.y * s, w = r.w * s, hh = r.h * s; return [[x, y], [x + w, y], [x, y + hh], [x + w, y + hh]]; };
  const clamp = () => {
    r.w = Math.max(16, Math.min(r.w, W)); r.h = Math.max(16, Math.min(r.h, H));
    r.x = Math.max(0, Math.min(r.x, W - r.w)); r.y = Math.max(0, Math.min(r.y, H - r.h));
  };
  const applyRatio = () => {
    if (!ratio) return;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let w = r.w, hh = w / ratio;
    if (hh > H) { hh = H; w = hh * ratio; }
    if (w > W) { w = W; hh = w / ratio; }
    r = { x: cx - w / 2, y: cy - hh / 2, w, h: hh }; clamp();
  };

  let drag = null;
  const pos = e => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * (cw / b.width) / s, y: (e.clientY - b.top) * (ch / b.height) / s }; };
  cv.addEventListener('pointerdown', e => {
    const p = pos(e);
    const hs = handles().map(([hx, hy]) => ({ x: hx / s, y: hy / s }));
    const hit = hs.findIndex(q => Math.abs(q.x - p.x) * s < 12 && Math.abs(q.y - p.y) * s < 12);
    if (hit >= 0) drag = { mode: 'corner', i: hit, start: { ...r } };
    else if (p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h) drag = { mode: 'move', p0: p, start: { ...r } };
    else drag = { mode: 'new', p0: p };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = pos(e);
    if (drag.mode === 'move') { r.x = drag.start.x + p.x - drag.p0.x; r.y = drag.start.y + p.y - drag.p0.y; clamp(); }
    else {
      // 고정점(반대쪽 모서리) 기준으로 영역 계산
      let ax, ay;
      if (drag.mode === 'new') { ax = drag.p0.x; ay = drag.p0.y; }
      else { const st = drag.start; ax = drag.i % 2 === 0 ? st.x + st.w : st.x; ay = drag.i < 2 ? st.y + st.h : st.y; }
      let w = Math.abs(p.x - ax), hh = Math.abs(p.y - ay);
      if (ratio) { if (w / hh > ratio) hh = w / ratio; else w = hh * ratio; }
      r = { x: p.x < ax ? ax - w : ax, y: p.y < ay ? ay - hh : ay, w, h: hh };
      clamp();
    }
    draw();
  });
  cv.addEventListener('pointerup', () => { drag = null; });

  const presets = [['자유', null], ['사이니지 화면', signageRatio], ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9]];
  const seg = h('div', { class: 'seg', style: { marginBottom: '10px' } }, ...presets.map(([label, v], i) =>
    h('button', { class: i === 0 ? 'on' : '', onclick: e => { ratio = v; applyRatio(); draw(); [...seg.children].forEach(b => b.classList.toggle('on', b === e.target)); } }, label)));

  openModal({
    title: '이미지 자르기', wide: true,
    body: h('div', {}, seg, h('div', { style: { background: '#0b0d10', borderRadius: '8px', padding: '10px' } }, cv), info,
      h('p', { class: 'hint' }, '모서리를 끌어 크기를, 안쪽을 끌어 위치를 바꿉니다. 바깥을 끌면 새로 선택합니다.')),
    buttons: [
      { label: '전체 선택', cls: 'ghost', close: false, onClick: () => { r = { x: 0, y: 0, w: W, h: H }; applyRatio(); draw(); } },
      { label: '취소', cls: 'ghost' },
      { label: '자르기 적용', cls: 'primary', onClick: () => onApply({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }) }
    ]
  });
  draw();
}

// 자르기 적용: 화면상 위치(왼쪽 위)와 배율 유지
export function applyCrop(img, c) {
  const sx = img.scaleX || 1, sy = img.scaleY || 1;
  const dx = (c.x - (img.cropX || 0)) * sx * (img.flipX ? -1 : 1);
  const dy = (c.y - (img.cropY || 0)) * sy * (img.flipY ? -1 : 1);
  const ang = (img.angle || 0) * Math.PI / 180;
  img.set({
    cropX: c.x, cropY: c.y, width: c.w, height: c.h,
    left: img.left + (img.flipX ? 0 : dx * Math.cos(ang) - dy * Math.sin(ang)),
    top: img.top + (img.flipY ? 0 : dx * Math.sin(ang) + dy * Math.cos(ang))
  });
  if (img.clipPath?.absolutePositioned) img.clipPath = null;
  if (img.radius) setRadius(img, img.radius);
  img.setCoords();
  img.dirty = true;
}
