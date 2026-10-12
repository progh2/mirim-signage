// PNG 내보내기(주간/야간) 및 LED 미리보기
import { h, openModal, download, dataURLtoBlob, stamp } from './ui.js';

export function nightCanvas(src, factor) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // 감마를 고려해 선형 밝기에 factor 를 곱함
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    const l = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const o = l * factor;
    lut[i] = Math.round(255 * (o <= 0.0031308 ? 12.92 * o : 1.055 * Math.pow(o, 1 / 2.4) - 0.055));
  }
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function fileBase(editor) {
  return `미림사이니지_${editor.signage === 'left' ? '좌측배너_1664x256' : '우측와이드_1280x640'}_${stamp()}`;
}

export async function exportPNG(editor, mode = 'day') {
  editor.c.discardActiveObject();
  editor.c.renderAll();
  const src = editor.renderToCanvas();
  if (src.width !== editor.W || src.height !== editor.H) throw new Error(`해상도 불일치: ${src.width}x${src.height}`);
  const base = fileBase(editor);
  const out = [];
  if (mode === 'day' || mode === 'both') out.push([base + '.png', src]);
  if (mode === 'night' || mode === 'both') out.push([base + '_야간.png', nightCanvas(src, editor.guide.brightness.nightFactor)]);
  for (const [name, cv] of out) {
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    download(name, blob || dataURLtoBlob(cv.toDataURL('image/png')));
    await new Promise(r => setTimeout(r, 250));
  }
  return out.map(o => o[0]);
}

export function ledPreview(editor) {
  editor.c.discardActiveObject();
  editor.c.renderAll();
  const src = editor.renderToCanvas();
  const W = src.width, H = src.height;
  const sctx = src.getContext('2d');
  const d = sctx.getImageData(0, 0, W, H).data;

  // 1) 확대 LED 점 표현 (화면 일부를 크게)
  const cell = 6;
  const cropW = Math.min(W, 300), cropH = Math.min(H, 100);
  // 가장 큰 글자(제목) 주변을 확대
  const texts = editor.c.getObjects().filter(o => o.type === 'textbox' && o.visible !== false && o.role !== 'ai-label');
  const big = texts.sort((a, b) => b.fontSize - a.fontSize)[0];
  let ox = Math.floor((W - cropW) / 2), oy = Math.floor((H - cropH) / 2);
  if (big) {
    // 첫 줄의 실제 글자 시작 위치(정렬 반영) 주변
    const lw = big.getLineWidth ? big.getLineWidth(0) : big.width;
    const shift = big.textAlign === 'center' ? (big.width - lw) / 2 : big.textAlign === 'right' ? big.width - lw : 0;
    const gx = big.left + shift, gy = big.top + (big.fontSize * big.lineHeight) / 2;
    ox = Math.max(0, Math.min(W - cropW, Math.floor(gx - 10)));
    oy = Math.max(0, Math.min(H - cropH, Math.floor(gy - cropH / 2)));
  }
  const small = texts.sort((a, b) => a.fontSize - b.fontSize)[0];
  const led = h('canvas', { width: cropW * cell, height: cropH * cell });
  const lc = led.getContext('2d');
  lc.fillStyle = '#000'; lc.fillRect(0, 0, led.width, led.height);
  for (let y = 0; y < cropH; y++) for (let x = 0; x < cropW; x++) {
    const i = ((y + oy) * W + (x + ox)) * 4;
    lc.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
    lc.beginPath(); lc.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.36, 0, Math.PI * 2); lc.fill();
  }

  // 2) 원거리(도로) 시점: 축소 후 확대
  const dataURL = src.toDataURL('image/png');
  const night = nightCanvas(src, editor.guide.brightness.nightFactor).toDataURL('image/png');

  const body = h('div', { class: 'led-wrap' },
    h('div', {}, h('h3', {}, `LED 픽셀 확대 (가장 큰 글자 주변 ${cropW}×${cropH}px)`),
      h('p', { class: 'hint' }, `실제 사이니지는 픽셀 하나가 약 3.9mm인 LED입니다. 가는 획·작은 글자는 이 점들 사이에서 뭉개집니다.` + (small ? ` 가장 작은 글자는 ${Math.round(small.fontSize)}px(실제 높이 약 ${Math.round(small.fontSize * 0.39)}cm)입니다.` : '')),
      h('div', { class: 'led-view' }, led)),
    h('div', { class: 'led-row' },
      h('div', {}, h('div', { class: 'led-scene' }, h('img', { src: dataURL, alt: '주간 미리보기' })), h('div', { class: 'caption' }, '주간 · 도로에서 본 모습')),
      h('div', {}, h('div', { class: 'led-scene night' }, h('img', { src: night, alt: '야간 미리보기', style: { filter: 'none' } })), h('div', { class: 'caption' }, `야간용(밝기 ${Math.round(editor.guide.brightness.nightFactor * 100)}%) · 해진 후 송출 권장`))
    )
  );
  openModal({ title: 'LED 미리보기', body, wide: true, buttons: [{ label: '닫기', cls: 'ghost' }] });
}
