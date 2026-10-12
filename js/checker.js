// 가이드 규칙 점검(로컬) + 자동 보정
import { parseColor, relLum, contrastLum, rgbToOklch, rgbToOklab, oklchOfHex, oklchToRgb, lightnessLevel, clampOklchHex, toHex } from './color.js';

const isText = o => o.type === 'textbox' || o.type === 'i-text' || o.type === 'text';

function lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const LIN = new Float32Array(256).map((_, i) => lin(i));

// 픽셀 통계
function pixelStats(canvas, step = 3) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width: W, height: H } = canvas;
  const d = ctx.getImageData(0, 0, W, H).data;
  let sumY = 0, white = 0, n = 0;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      const Y = 0.2126 * LIN[d[i]] + 0.7152 * LIN[d[i + 1]] + 0.0722 * LIN[d[i + 2]];
      sumY += Y; n++;
      if (Y > 0.8) white++;
    }
  }
  return { apl: sumY / n, whiteFrac: white / n, data: d, W, H };
}

function regionLum(stats, r) {
  const { data: d, W, H } = stats;
  const x0 = Math.max(0, Math.floor(r.left)), y0 = Math.max(0, Math.floor(r.top));
  const x1 = Math.min(W, Math.ceil(r.left + r.width)), y1 = Math.min(H, Math.ceil(r.top + r.height));
  let s = 0, n = 0, mx = 0;
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 30));
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * W + x) * 4;
    const Y = 0.2126 * LIN[d[i]] + 0.7152 * LIN[d[i + 1]] + 0.0722 * LIN[d[i + 2]];
    s += Y; n++; if (Y > mx) mx = Y;
  }
  return n ? { mean: s / n, max: mx } : null;
}

function bgColorStats(stats) {
  // 텍스트를 숨긴 렌더링에서 평균 OKLab -> 대표 배경색
  const { data: d, W, H } = stats;
  let L = 0, a = 0, b = 0, n = 0, Cs = [];
  for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) {
    const i = (y * W + x) * 4;
    const lab = rgbToOklab({ r: d[i], g: d[i + 1], b: d[i + 2] });
    L += lab.L; a += lab.a; b += lab.b; n++;
    Cs.push(Math.hypot(lab.a, lab.b));
  }
  Cs.sort((x, y) => x - y);
  return { L: L / n, C: Math.hypot(a / n, b / n), C90: Cs[Math.floor(Cs.length * 0.9)] || 0 };
}

function fillHex(o) {
  if (typeof o.fill === 'string') {
    const p = parseColor(o.fill);
    return p ? toHex(p) : null;
  }
  return null;
}

export function runChecks(editor) {
  const g = editor.guide;
  const spec = editor.spec;
  const fonts = editor.fonts;
  const T = g.typography;
  const items = [];
  const add = (level, title, detail, extra = {}) => items.push({ level, title, detail, ...extra });
  const objs = editor.c.getObjects().filter(o => o.visible !== false);
  const texts = objs.filter(isText);
  const infoTexts = texts.filter(t => t.role !== 'ai-label');

  // 1) 규격
  const W = editor.c.getWidth ? editor.c.width : spec.width;
  add('pass', `규격 ${spec.width}×${spec.height}px (${spec.ratio})`, `${spec.name} · ${spec.physical}. 내보내기는 항상 이 해상도로 저장됩니다.`, { ref: spec.ref });
  void W;

  // 렌더링 통계
  const full = pixelStats(editor.renderToCanvas());
  const bare = pixelStats(editor.renderToCanvas({ hide: o => isText(o) }), 2);
  const bgc = bgColorStats(bare);

  // 2) 글자 크기·글꼴
  let sizeBad = 0;
  for (const t of infoTexts) {
    const px = t.fontSize * (t.scaleY || 1);
    const pt = Math.round(px / g.pxPerPt);
    const label = editor.layerName(t);
    if (px < T.hardMinPx) { sizeBad++; add('fail', `글자가 너무 작음: ${Math.round(px)}px(≈${pt}pt)`, `“${label}” — 저해상도 LED에서 깨집니다. 최소 ${T.minPx}px(32pt) 이상.`, { obj: t, ref: '03-4', fix: 'size' }); }
    else if (px < T.minPx - 0.5) { sizeBad++; add('warn', `작은 글자: ${Math.round(px)}px(≈${pt}pt)`, `“${label}” — 보조설명도 32pt(${T.minPx}px) 이상 권장.`, { obj: t, ref: '03-4', fix: 'size' }); }

    const f = fonts.get(t.fontFamily);
    if (!f) add('warn', '등록되지 않은 글꼴', `“${label}” — ${t.fontFamily}. 무료·배포 가능한 등록 글꼴 사용을 권장합니다.`, { obj: t, ref: '03-2', fix: 'font' });
    else {
      if (f.style === 'serif' && px < 72) add('warn', '삐침 글꼴을 본문 크기로 사용', `“${label}” — ${f.label}은(는) 큰 제목 전용. 본문은 굵은 고딕 권장.`, { obj: t, ref: '03-2', fix: 'font' });
      if (!f.heavy && Number(t.fontWeight) < T.minWeightVariable) add('warn', `얇은 굵기(${t.fontWeight})`, `“${label}” — ${T.minWeightVariable} 이상 굵기 권장.`, { obj: t, ref: '03-2', fix: 'weight' });
      if (f.user) add('info', '불러온 글꼴 사용 중', `“${label}” — 라이선스를 직접 확인하세요. 프로젝트 파일에 글꼴은 포함되지 않습니다.`, { obj: t });
    }
  }
  if (infoTexts.length && !sizeBad) add('pass', '글자 크기 적정', `모든 글자가 ${T.minPx}px(32pt) 이상입니다.`, { ref: '03-4' });

  // 3) 정보량
  let lines = 0, chars = 0;
  for (const t of infoTexts) {
    const px = t.fontSize * (t.scaleY || 1);
    const n = (t._textLines?.length || String(t.text).split('\n').length);
    // 본문(64px) 한 줄 기준으로 환산
    lines += n;
    chars += String(t.text).replace(/\s/g, '').length;
  }
  lines = Math.round(lines * 10) / 10;
  if (!infoTexts.length) add('info', '글자가 없습니다', '공공PR(명화 등)이 아니라면 핵심 문구를 넣으세요.');
  else if (lines > spec.maxTextLines || chars > spec.maxChars * 1.3) add('warn', '정보가 많음', `글자 ${lines}줄 · ${chars}자 (권장 ${spec.maxTextLines}줄 · ${spec.maxChars}자 이내). 인쇄물 수준의 정보는 피하고 핵심만.`, { ref: '03-4' });
  else if (chars > spec.maxChars) add('info', '정보량 많은 편', `${chars}자 — 지나가는 차량에서 읽기엔 많을 수 있어요(권장 ${spec.maxChars}자).`, { ref: '03-4' });
  else add('pass', '정보량 적정', `${lines}줄 · ${chars}자`, { ref: '03-4' });

  // 4) 배경 명도·채도
  const B = g.color.bgL;
  const lvl = lightnessLevel(bgc.L, g.color.lightnessLevels);
  const bgTxt = `대표 배경 명도 약 ${lvl}단계 (L ${bgc.L.toFixed(2)}), 채도 C ${bgc.C.toFixed(3)}`;
  if (bgc.L < B.failBelow) add('fail', '배경이 너무 어두움(검정 계열)', `${bgTxt}. 9단계·검정 배경은 주간에 반사로 탁하게 보입니다. 5~8단계 권장.`, { ref: '03-3', fix: 'bg' });
  else if (bgc.L < B.warnBelow) add('warn', '배경이 어두운 편(9단계 부근)', `${bgTxt}. 8단계 정도로 조금 밝히길 권장.`, { ref: '03-3', fix: 'bg' });
  else if (bgc.L > B.warnAbove) add('warn', '배경이 밝음(빛 공해 우려)', `${bgTxt}. 어두운 배경 + 밝은 글씨 구성이 권장됩니다.`, { ref: '03-3', fix: 'bg' });
  else if (bgc.L > B.recommendedMax) add('info', '배경이 다소 밝음', `${bgTxt}. 가능하면 8단계 쪽 어두운 배경 권장.`, { ref: '03-3', fix: 'bg' });
  else add('pass', '배경 명도 적정', bgTxt, { ref: '03-3' });
  if (bgc.C > g.color.bgChroma.max) add('warn', '배경 채도가 높음(원색 계열)', `C ${bgc.C.toFixed(3)} — 중간~저채도 권장(≤ ${g.color.bgChroma.recommendedMax}).`, { ref: '03-3', fix: 'bg' });

  // 도형 원색
  for (const o of objs) {
    if (isText(o) || o.role === 'background' || o.type === 'image' || o.type === 'group') continue;
    const hex = fillHex(o) || (o.type === 'line' ? (parseColor(o.stroke) && toHex(parseColor(o.stroke))) : null);
    if (!hex) continue;
    const ok = oklchOfHex(hex);
    const area = (o.getScaledWidth() * o.getScaledHeight()) / (spec.width * spec.height);
    if (ok && ok.C > g.color.shapeChromaMax && area > 0.02) add('warn', '원색·고채도 도형', `“${editor.layerName(o)}” ${hex} (C ${ok.C.toFixed(2)}). 채도를 낮추세요.`, { obj: o, ref: '02-2', fix: 'shape' });
  }

  // 5) 글자 대비
  let contrastBad = 0;
  for (const t of infoTexts) {
    const hex = fillHex(t);
    if (!hex) continue;
    const r = t.getBoundingRect(true, true);
    const reg = regionLum(bare, r);
    if (!reg) continue;
    const ty = relLum(parseColor(hex)) * (t.opacity ?? 1) + reg.mean * (1 - (t.opacity ?? 1));
    const cr = contrastLum(ty, reg.mean);
    const label = editor.layerName(t);
    if (cr < 3) { contrastBad++; add('fail', `글자 대비 부족 ${cr.toFixed(1)}:1`, `“${label}” — 배경과 구분이 어렵습니다(최소 ${g.color.minContrast}:1).`, { obj: t, ref: '03-3', fix: 'contrast' }); }
    else if (cr < g.color.minContrast) { contrastBad++; add('warn', `글자 대비 낮음 ${cr.toFixed(1)}:1`, `“${label}” — ${g.color.minContrast}:1 이상 권장.`, { obj: t, ref: '03-3', fix: 'contrast' }); }
    if (ty < reg.mean && cr >= 3) add('info', '밝은 배경에 어두운 글씨', `“${label}” — 가이드는 어두운 배경 + 밝은 글씨를 권장합니다.`, { obj: t, ref: '03-3' });
  }
  if (infoTexts.length && !contrastBad) add('pass', '글자 대비 적정', `모든 글자가 ${g.color.minContrast}:1 이상`, { ref: '03-3' });

  // 6) 밝기(빛 공해)
  const Bt = g.brightness;
  const aplPct = Math.round(full.apl * 100), whitePct = Math.round(full.whiteFrac * 100);
  if (full.apl > Bt.aplWarn) add('warn', `화면이 밝음 (평균 밝기 ${aplPct}%)`, `야간 빛 공해 민원 우려. 배경을 어둡게 하거나 야간용 PNG를 따로 내보내세요.`, { ref: '02-2' });
  else if (full.apl > Bt.aplGood) add('info', `평균 밝기 ${aplPct}%`, '야간에는 ‘야간용 PNG’(밝기 낮춤) 사용을 권장합니다.', { ref: '03-1' });
  else add('pass', `평균 밝기 ${aplPct}% (낮음)`, '야간 송출에 무리가 적은 밝기입니다.', { ref: '03-1' });
  if (full.whiteFrac > Bt.whiteAreaWarn) add('warn', `흰색 면적 ${whitePct}%`, '넓은 흰 면은 눈부심을 유발합니다.', { ref: '02-2' });

  // 7) 여백·영역 밖
  const m = spec.safeMargin;
  for (const o of objs) {
    if (o.role === 'background' || o.role === 'background-image' || o.role === 'ai-label') continue;
    if (!isText(o)) continue;
    const r = o.getBoundingRect(true, true);
    const label = editor.layerName(o);
    if (r.left < -1 || r.top < -1 || r.left + r.width > spec.width + 1 || r.top + r.height > spec.height + 1) add('fail', '글자가 화면 밖으로 나감', `“${label}”`, { obj: o, fix: 'margin' });
    else if (r.left < m - 2 || r.top < m - 2 || r.left + r.width > spec.width - m + 2 || r.top + r.height > spec.height - m + 2) add('warn', '안전 여백 침범', `“${label}” — 가장자리 ${m}px 안쪽에 두면 LED 테두리에서 잘리지 않습니다.`, { obj: o, fix: 'margin' });
  }

  // 8) 빈 이미지 자리
  for (const o of objs) if (o.role === 'image-slot') add('warn', '빈 이미지 자리', `“${editor.layerName(o)}” — 이미지를 넣거나 지우세요(두 번 클릭).`, { obj: o });

  // 9) AI 표시
  const hasLabel = objs.some(o => o.role === 'ai-label');
  if (editor.aiUsed && !hasLabel) add('fail', 'AI 활용 표시 없음', 'AI로 만든 디자인·이미지는 ‘AI 활용 제작’ 표시가 필요합니다.', { ref: '03-1', fix: 'ailabel' });
  else if (editor.aiUsed) add('pass', 'AI 활용 표시 있음', '인공지능 투명성 확보 가이드라인 준수', { ref: '03-1' });

  // 점수
  const order = { fail: 0, warn: 1, info: 2, pass: 3 };
  items.sort((a, b) => order[a.level] - order[b.level]);
  const fails = items.filter(i => i.level === 'fail').length;
  const warns = items.filter(i => i.level === 'warn').length;
  const score = Math.max(0, 100 - fails * 18 - warns * 6);
  return {
    items, score, fails, warns,
    stats: { apl: full.apl, whiteFrac: full.whiteFrac, bgL: bgc.L, bgC: bgc.C, bgLevel: lvl, lines, chars, textCount: infoTexts.length }
  };
}

// ---------------- 자동 보정 ----------------
export async function autoFix(editor, { colors = true } = {}) {
  const g = editor.guide, spec = editor.spec, fonts = editor.fonts, T = g.typography;
  const changes = [];
  editor.muted++;
  const objs = editor.c.getObjects();
  const texts = objs.filter(o => isText(o) && o.role !== 'ai-label');

  // 배경: 명도·채도 범위로
  const bg = editor.bg;
  const B = g.color.bgL;
  const clampOpts = { Lmin: B.recommendedMin, Lmax: B.autoFixMax ?? B.recommendedMax, Cmax: g.color.bgChroma.recommendedMax };
  if (colors && bg?.bgSpec) {
    const sp = JSON.parse(JSON.stringify(bg.bgSpec));
    if (sp.type === 'solid') {
      const nc = clampOklchHex(sp.color, clampOpts);
      if (nc !== sp.color.toUpperCase()) { changes.push(`배경색 ${sp.color} → ${nc}`); sp.color = nc; }
    } else if (sp.stops) {
      sp.stops.forEach(s => { const nc = clampOklchHex(s.color, clampOpts); if (nc !== s.color.toUpperCase()) { changes.push(`배경 그라데이션 ${s.color} → ${nc}`); s.color = nc; } });
    }
    editor.muted--; editor.setBackground(sp); editor.muted++;
  }
  // 배경 이미지가 밝으면 어둡게
  for (const o of colors ? objs.filter(o => o.type === 'image' && o.role === 'background-image') : []) {
    const st = pixelStats(editor.renderToCanvas({ hide: x => isText(x) }), 6);
    if (st.apl > g.brightness.aplGood) {
      const { setBrightness } = await import('./schema.js');
      const nb = Math.max(-0.6, (o.brightness || 0) - 0.15);
      setBrightness(o, nb); changes.push(`배경 이미지 밝기 ${Math.round(nb * 100)}%`);
    }
  }
  // 도형 채도
  for (const o of colors ? objs : []) {
    if (isText(o) || o.role === 'background' || o.type === 'image' || o.type === 'group') continue;
    if (typeof o.fill === 'string') {
      const hx = parseColor(o.fill) && toHex(parseColor(o.fill));
      const ok = hx && oklchOfHex(hx);
      if (ok && ok.C > g.color.shapeChromaMax) {
        const nc = clampOklchHex(hx, { Lmin: 0, Lmax: 1, Cmax: g.color.shapeChromaMax - 0.03 });
        const alpha = /rgba/.test(o.fill) ? o.fill : null;
        if (!alpha) { o.set('fill', nc); changes.push(`도형 색 ${hx} → ${nc}`); }
      }
    }
  }

  for (const t of texts) {
    const label = editor.layerName(t);
    // 글꼴
    let f = fonts.get(t.fontFamily);
    const px = t.fontSize * (t.scaleY || 1);
    if (!f || (f.style === 'serif' && px < 72)) {
      t.set({ fontFamily: fonts.defaults.body, fontWeight: 800 }); f = fonts.get(fonts.defaults.body);
      changes.push(`“${label}” 글꼴 → ${f?.label}`);
    }
    if (f && !f.heavy && Number(t.fontWeight) < T.minWeightVariable) { t.set('fontWeight', fonts.snapWeight(t.fontFamily, 700)); changes.push(`“${label}” 굵기 → 700`); }
    if (f && f.heavy) t.set('fontWeight', fonts.snapWeight(t.fontFamily, t.fontWeight));
    // 크기(스케일 반영 후 정규화)
    if (t.scaleX !== 1 || t.scaleY !== 1) {
      t.set({ fontSize: t.fontSize * t.scaleY, width: t.width * t.scaleX, scaleX: 1, scaleY: 1 });
    }
    if (t.fontSize < T.minPx) { changes.push(`“${label}” ${Math.round(t.fontSize)}px → ${T.minPx}px`); t.set('fontSize', T.minPx); }
    await fonts.load(t.fontFamily, t.fontWeight, t.text);
    t.initDimensions(); t.setCoords();
  }

  editor.c.renderAll();
  // 대비: 텍스트 아래 배경을 다시 측정해서 흰색 계열로
  const bare = pixelStats(editor.renderToCanvas({ hide: o => isText(o) }), 2);
  for (const t of texts) {
    const hex = fillHex(t);
    const reg = regionLum(bare, t.getBoundingRect(true, true));
    if (!hex || !reg) continue;
    const cr = contrastLum(relLum(parseColor(hex)), reg.mean);
    if (cr < g.color.minContrast) {
      // 밝은 배경이면 어두운 글자도 후보로 (사용자가 밝은 배경을 지정한 경우)
      // 1순위: 같은 색 계열(색상 유지)에서 명도만 조절해 대비 확보 — 예) 초록 글자 → 진한 초록
      let best = null, bestCr = 0;
      const o0 = oklchOfHex(hex);
      if (o0) {
        const dir = reg.mean > 0.18 ? -1 : 1; // 밝은 배경 → 어둡게, 어두운 배경 → 밝게
        for (let L = o0.L; L >= 0.05 && L <= 0.99; L += dir * 0.03) {
          const c = toHex(oklchToRgb({ L, C: o0.C, h: o0.h }));
          const v = contrastLum(relLum(parseColor(c)), reg.mean);
          if (v >= g.color.minContrast + 0.2) { best = c; bestCr = v; break; }
        }
      }
      // 2순위: 팔레트·흑백 중 대비가 가장 큰 색
      if (!best) {
        const candidates = g.color.texts.map(c => c.hex).concat(['#FFFFFF', '#202124', '#111111']);
        for (const c of candidates) { const v = contrastLum(relLum(parseColor(c)), reg.mean); if (v > bestCr) { bestCr = v; best = c; } }
      }
      t.set({ fill: best, opacity: 1 });
      changes.push(`“${editor.layerName(t)}” 글자색 → ${best} (${bestCr.toFixed(1)}:1)`);
      if (bestCr < g.color.minContrast) {
        // 밝은 배경 위 글자 → 반투명 어두운 판 추가는 사용자 판단에 맡기고 그림자로 보강
        t.set('shadow', new fabric.Shadow({ color: 'rgba(0,0,0,0.65)', blur: 12, offsetX: 0, offsetY: 3 }));
        changes.push(`“${editor.layerName(t)}” 그림자 추가(배경이 밝음)`);
      }
    }
  }

  // 배경 이미지 위 글자 대비가 여전히 부족하면 배경 이미지를 단계적으로 어둡게
  const bgImgs = objs.filter(o => o.type === 'image' && o.role === 'background-image' && o.visible !== false);
  if (bgImgs.length) {
    const { setBrightness } = await import('./schema.js');
    for (let k = 0; k < 5; k++) {
      editor.c.renderAll();
      const st = pixelStats(editor.renderToCanvas({ hide: o => isText(o) }), 2);
      const worst = Math.min(...texts.filter(t => fillHex(t)).map(t => {
        const reg = regionLum(st, t.getBoundingRect(true, true));
        return reg ? contrastLum(relLum(parseColor(fillHex(t))), reg.mean) : 99;
      }), 99);
      if (worst >= g.color.minContrast) break;
      let moved = false;
      for (const im of bgImgs) {
        const nb = Math.max(-0.75, (im.brightness || 0) - 0.12);
        if (nb !== im.brightness) { setBrightness(im, nb); moved = true; }
      }
      if (!moved) break;
      if (k === 0) changes.push('글자 대비를 위해 배경 이미지를 어둡게');
    }
  }

  // 여백 안으로
  const m = spec.safeMargin;
  for (const t of texts) {
    let r = t.getBoundingRect(true, true);
    const maxW = spec.width - 2 * m;
    if (r.width > maxW + 1 && t.type === 'textbox') { t.set('width', maxW - 4); t.initDimensions(); t.setCoords(); r = t.getBoundingRect(true, true); }
    let dx = 0, dy = 0;
    if (r.left < m) dx = m - r.left;
    if (r.left + r.width > spec.width - m) dx = spec.width - m - r.width - r.left;
    if (r.top < m) dy = m - r.top;
    if (r.top + r.height > spec.height - m) dy = spec.height - m - r.height - r.top;
    if (dx || dy) { t.set({ left: t.left + dx, top: t.top + dy }); t.setCoords(); changes.push(`“${editor.layerName(t)}” 여백 안으로 이동`); }
  }
  editor.muted--;

  if (editor.aiUsed && !objs.some(o => o.role === 'ai-label')) { await editor.addAiLabel(); changes.push('AI 활용 표시 추가'); }

  editor.c.requestRenderAll();
  editor.commit();
  return changes;
}

export function guideRulesText(guide, signageId) {
  const s = guide.signages[signageId];
  const T = guide.typography;
  const lines = [
    `[대상 화면] ${s.name}, ${s.width}x${s.height}px, 비율 ${s.ratio}, 실제 ${s.physical}. 학교 정문 앞 공용도로를 향한 저해상도 LED(픽셀 간격 약 3.9mm).`,
    `[글자 크기] 제목 ${T.presets[0].px}px(60~54pt) 이상, 본문 ${T.presets[1].px}px(48pt, 세로 8줄 정도), 보조설명 ${T.presets[2].px}px(32pt) 이상. ${T.minPx}px 미만 금지(‘AI 활용 제작’ 표시는 예외).`,
    `[정보량] 이 화면은 글자 최대 ${s.maxTextLines}줄, 글자 ${s.maxChars}자 이내 권장. 핵심 내용 위주, 인쇄물 수준의 많은 정보 금지.`,
    `[글꼴] 두꺼운 고딕 계열 권장. 얇은 글꼴, 캐주얼한 글꼴, 삐침 있는 글꼴(명조)의 본문 사용 지양.`,
    `[배색] 어두운 배경 + 밝은 글씨. 배경은 명도 5~8단계(중간~어두운 명도), 중간~저채도. 9단계·검정 배경 지양(주간 반사로 탁해 보임). 원색·고채도 지양. 글자 대비 ${guide.color.minContrast}:1 이상.`,
    `[빛 공해] 밝은 화면은 야간 빛 공해 민원 유발. 넓은 흰 면 지양, 야간용 밝기 낮춘 버전 별도 운영.`,
    `[영상] 빠른 화면 전환·깜빡임 금지, 슬라이드 전환 수준 모션만(옥외광고물 영상은 구청 심의 대상).`,
    `[광고성] 상업 광고·학교 직접 홍보 성격 유의. 공공PR은 공익형(명화 갤러리, 기념일, 계절 인사 등)으로 신뢰감 형성.`,
    `[저작권] 명화는 저작권 만료 작품, 글꼴은 무료 사용 가능한 글꼴.`,
    `[AI 표시] AI 활용 제작 시 ‘AI 활용 제작’ 등 AI 활용 사실 표시 필요(인공지능 투명성 확보 가이드라인 2026).`
  ];
  return lines.join('\n');
}
