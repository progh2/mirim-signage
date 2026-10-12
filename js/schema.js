// 템플릿 스키마(사람이 쓰기 쉬운 JSON) <-> Fabric 객체 변환
import { setImageFx, setRadius } from './imagetools.js';
// 스키마 형식은 docs/TEMPLATE_GUIDE.md 참고

export const CUSTOM_PROPS = [
  'uid', 'name', 'role', 'gradSpec', 'bgSpec', 'brightness', 'fx', 'radius', 'slotLabel', 'locked',
  'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'hasControls', 'aiGenerated'
];

let _seq = 0;
export const newUid = () => 'o' + Date.now().toString(36) + (++_seq).toString(36);

export function makeGradient(spec, w, h) {
  const ang = ((spec.angle ?? 90) * Math.PI) / 180;
  const cx = w / 2, cy = h / 2;
  // 각도 방향으로 박스를 덮는 길이
  const len = Math.abs(w * Math.cos(ang)) / 2 + Math.abs(h * Math.sin(ang)) / 2;
  const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
  return new fabric.Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy },
    colorStops: (spec.stops || []).map(s => ({ offset: s.offset, color: s.color }))
  });
}

function applyFill(obj, fill) {
  if (fill && typeof fill === 'object' && fill.type === 'linear') {
    obj.gradSpec = fill;
    obj.set('fill', makeGradient(fill, obj.width, obj.height));
  } else {
    obj.gradSpec = null;
    obj.set('fill', fill ?? '#FFFFFF');
  }
}

function common(o) {
  return {
    uid: o.uid || newUid(),
    name: o.name,
    role: o.role,
    left: o.left ?? 0,
    top: o.top ?? 0,
    angle: o.angle || 0,
    opacity: o.opacity ?? 1,
    visible: o.visible !== false
  };
}

function shadowOf(s) {
  if (!s) return null;
  return new fabric.Shadow({ color: s.color || 'rgba(0,0,0,0.5)', blur: s.blur ?? 8, offsetX: s.offsetX ?? 0, offsetY: s.offsetY ?? 3 });
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    fabric.Image.fromURL(src, img => {
      if (!img || !img.width) rej(new Error('이미지를 불러오지 못했습니다: ' + String(src).slice(0, 60)));
      else res(img);
    }, { crossOrigin: 'anonymous' });
  });
}

export function makeSlot(o) {
  const rect = new fabric.Rect({
    left: 0, top: 0, width: o.width, height: o.height,
    fill: 'rgba(255,255,255,0.06)', stroke: 'rgba(255,255,255,0.55)', strokeWidth: 3, strokeDashArray: [14, 10],
    originX: 'left', originY: 'top'
  });
  const label = new fabric.Text(o.label || '이미지 자리\n(선택 후 ‘이미지 넣기’)', {
    fontFamily: 'Pretendard Variable', fontWeight: 700, fontSize: Math.max(20, Math.min(36, o.height / 8)),
    fill: 'rgba(255,255,255,0.7)', textAlign: 'center', originX: 'center', originY: 'center',
    left: o.width / 2, top: o.height / 2
  });
  const g = new fabric.Group([rect, label], {
    ...common(o), role: 'image-slot', name: o.name || '이미지 자리', slotLabel: o.label || ''
  });
  return g;
}

// 스키마 객체 하나 -> fabric 객체
export async function fromSchemaObject(o, fonts) {
  switch (o.type) {
    case 'text': {
      const fam = o.fontFamily || fonts?.defaults.body || 'Pretendard Variable';
      const t = new fabric.Textbox(o.text ?? '', {
        ...common(o),
        width: o.width || 600,
        fontFamily: fam,
        fontSize: o.fontSize || 64,
        fontWeight: fonts ? fonts.snapWeight(fam, o.fontWeight || 700) : (o.fontWeight || 700),
        fill: o.fill || '#FFFFFF',
        textAlign: o.textAlign || 'left',
        lineHeight: o.lineHeight || 1.2,
        charSpacing: o.charSpacing || 0,
        stroke: o.stroke || null,
        strokeWidth: o.strokeWidth || 0,
        paintFirst: 'stroke',
        shadow: shadowOf(o.shadow),
        splitByGrapheme: !!o.splitByGrapheme,
        name: o.name || roleName(o.role) || '글자'
      });
      return t;
    }
    case 'rect': {
      const r = new fabric.Rect({
        ...common(o), width: o.width || 100, height: o.height || 100, rx: o.rx || 0, ry: o.rx || 0,
        stroke: o.stroke || null, strokeWidth: o.strokeWidth || 0, strokeUniform: true,
        name: o.name || '사각형'
      });
      applyFill(r, o.fill ?? '#2B4A6F');
      r.shadow = shadowOf(o.shadow);
      return r;
    }
    case 'circle': {
      const c = new fabric.Circle({
        ...common(o), radius: o.radius || 50, stroke: o.stroke || null, strokeWidth: o.strokeWidth || 0, strokeUniform: true,
        name: o.name || '원'
      });
      applyFill(c, o.fill ?? '#FFE38A');
      return c;
    }
    case 'triangle': {
      const t = new fabric.Triangle({
        ...common(o), width: o.width || 100, height: o.height || 90, stroke: o.stroke || null, strokeWidth: o.strokeWidth || 0,
        name: o.name || '삼각형'
      });
      applyFill(t, o.fill ?? '#FFE38A');
      return t;
    }
    case 'line': {
      const l = new fabric.Line([o.x1 ?? 0, o.y1 ?? 0, o.x2 ?? 200, o.y2 ?? 0], {
        uid: o.uid || newUid(), name: o.name || '선', role: o.role,
        stroke: o.stroke || '#FFFFFF', strokeWidth: o.strokeWidth || 4, opacity: o.opacity ?? 1,
        strokeLineCap: 'round', visible: o.visible !== false
      });
      return l;
    }
    case 'image': {
      const img = await loadImage(o.src);
      img.set({ ...common(o), name: o.name || (o.role === 'background-image' ? '배경 이미지' : '이미지'), flipX: !!o.flipX, flipY: !!o.flipY });
      if (o.crop) img.set({ cropX: o.crop.x, cropY: o.crop.y, width: o.crop.w, height: o.crop.h });
      if (o.stroke) img.set({ stroke: o.stroke, strokeWidth: o.strokeWidth || 4 });
      if (o.width && o.height) {
        const fit = o.fit || 'cover';
        const sx = o.width / img.width, sy = o.height / img.height;
        const s = fit === 'contain' ? Math.min(sx, sy) : fit === 'stretch' ? null : Math.max(sx, sy);
        if (s === null) img.set({ scaleX: sx, scaleY: sy });
        else {
          img.set({ scaleX: s, scaleY: s });
          // 영역 가운데 정렬
          img.set({ left: (o.left || 0) + (o.width - img.width * s) / 2, top: (o.top || 0) + (o.height - img.height * s) / 2 });
          if (fit === 'cover') {
            // 영역 밖은 잘라냄
            img.clipPath = new fabric.Rect({
              left: o.left || 0, top: o.top || 0, width: o.width, height: o.height, absolutePositioned: true
            });
          }
        }
      }
      if (o.fx) setImageFx(img, o.fx); else if (o.brightness) setBrightness(img, o.brightness);
      if (o.radius) setRadius(img, o.radius);
      return img;
    }
    case 'imageSlot':
      return makeSlot(o);
    default:
      console.warn('알 수 없는 객체 형식', o.type);
      return null;
  }
}

export function setBrightness(img, v) { setImageFx(img, { brightness: v }); }

export function roleName(role) {
  return { title: '제목', body: '본문', caption: '보조설명', 'ai-label': 'AI 활용 표시' }[role];
}

// fabric 객체 -> 스키마 객체
export function toSchemaObject(obj) {
  const base = {
    name: obj.name, role: obj.role || undefined,
    left: round(obj.left), top: round(obj.top),
    angle: obj.angle ? round(obj.angle) : undefined,
    opacity: obj.opacity !== 1 ? obj.opacity : undefined,
    visible: obj.visible === false ? false : undefined
  };
  const fill = obj.gradSpec || (typeof obj.fill === 'string' ? obj.fill : undefined);
  const sh = obj.shadow ? { color: obj.shadow.color, blur: obj.shadow.blur, offsetX: obj.shadow.offsetX, offsetY: obj.shadow.offsetY } : undefined;
  switch (obj.type) {
    case 'textbox': case 'i-text': case 'text':
      return clean({
        type: 'text', ...base, text: obj.text,
        width: round(obj.width * (obj.scaleX || 1)),
        fontFamily: obj.fontFamily, fontSize: round(obj.fontSize * (obj.scaleY || 1)), fontWeight: Number(obj.fontWeight) || 400,
        fill, textAlign: obj.textAlign, lineHeight: obj.lineHeight, charSpacing: obj.charSpacing || undefined,
        stroke: obj.stroke || undefined, strokeWidth: obj.strokeWidth || undefined, shadow: sh
      });
    case 'rect':
      return clean({ type: 'rect', ...base, width: round(obj.getScaledWidth() - (obj.strokeWidth || 0)), height: round(obj.getScaledHeight() - (obj.strokeWidth || 0)), rx: obj.rx || undefined, fill, stroke: obj.stroke || undefined, strokeWidth: obj.strokeWidth || undefined, shadow: sh });
    case 'circle':
      return clean({ type: 'circle', ...base, radius: round(obj.radius * (obj.scaleX || 1)), fill, stroke: obj.stroke || undefined, strokeWidth: obj.strokeWidth || undefined });
    case 'triangle':
      return clean({ type: 'triangle', ...base, width: round(obj.getScaledWidth()), height: round(obj.getScaledHeight()), fill, stroke: obj.stroke || undefined, strokeWidth: obj.strokeWidth || undefined });
    case 'line': {
      const p = obj.calcLinePoints();
      const m = obj.calcTransformMatrix();
      const a = fabric.util.transformPoint({ x: p.x1, y: p.y1 }, m);
      const b = fabric.util.transformPoint({ x: p.x2, y: p.y2 }, m);
      return clean({ type: 'line', name: obj.name, role: obj.role, x1: round(a.x), y1: round(a.y), x2: round(b.x), y2: round(b.y), stroke: obj.stroke, strokeWidth: obj.strokeWidth, opacity: obj.opacity !== 1 ? obj.opacity : undefined });
    }
    case 'image': {
      const src = obj.getSrc ? obj.getSrc() : obj._element?.src;
      const el = obj._originalElement || obj._element;
      const full = el && (obj.cropX || obj.cropY || obj.width !== (el.naturalWidth || el.width) || obj.height !== (el.naturalHeight || el.height));
      const extra = { crop: full ? { x: obj.cropX || 0, y: obj.cropY || 0, w: obj.width, h: obj.height } : undefined, flipX: obj.flipX || undefined, flipY: obj.flipY || undefined, fx: obj.fx || undefined, radius: obj.radius || undefined, stroke: obj.stroke || undefined, strokeWidth: obj.stroke ? obj.strokeWidth : undefined };
      const cp = obj.clipPath;
      if (cp && cp.absolutePositioned) {
        return clean({ type: 'image', ...base, ...extra, left: round(cp.left), top: round(cp.top), src, width: round(cp.width * (cp.scaleX || 1)), height: round(cp.height * (cp.scaleY || 1)), fit: 'cover', brightness: obj.brightness || undefined });
      }
      return clean({ type: 'image', ...base, ...extra, src, width: round(obj.width * obj.scaleX), height: round(obj.height * obj.scaleY), fit: 'stretch', brightness: obj.brightness || undefined });
    }
    case 'group':
      if (obj.role === 'image-slot') return clean({ type: 'imageSlot', ...base, width: round(obj.getScaledWidth()), height: round(obj.getScaledHeight()), label: obj.slotLabel || undefined });
      return null;
    default:
      return null;
  }
}

const round = v => Math.round((v || 0) * 10) / 10;
function clean(o) { for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k]; return o; }

// 스키마 템플릿 검증(최소한)
export function validateTemplate(t) {
  const errs = [];
  if (!t || typeof t !== 'object') errs.push('템플릿이 객체가 아닙니다');
  else {
    if (!t.name) errs.push('name 이 없습니다');
    if (!['left', 'right'].includes(t.signage)) errs.push('signage 는 "left" 또는 "right" 여야 합니다');
    if (!Array.isArray(t.objects)) errs.push('objects 배열이 없습니다');
  }
  return errs;
}
