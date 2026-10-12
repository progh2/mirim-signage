// 색상 유틸: sRGB ↔ OKLab/OKLCH, 상대휘도, 대비비
export function parseColor(c) {
  if (!c || typeof c !== 'string') return null;
  c = c.trim();
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map(s => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2] };
  }
  return null;
}

export function toHex({ r, g, b }) {
  const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return ('#' + h(r) + h(g) + h(b)).toUpperCase();
}

const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const unlin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function relLum(rgb) {
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function contrast(a, b) {
  const la = relLum(a), lb = relLum(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastLum(la, lb) {
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToOklab({ r, g, b }) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  };
}

export function oklabToRgb({ L, a, b }) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return {
    r: unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: unlin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
  };
}

export function rgbToOklch(rgb) {
  const { L, a, b } = rgbToOklab(rgb);
  return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}

function inGamut({ r, g, b }) { return [r, g, b].every(v => v >= -0.5 && v <= 255.5); }

export function oklchToRgb({ L, C, h }) {
  // 범위를 벗어나면 채도를 줄여 맞춤
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rad = h * Math.PI / 180;
    const rgb = oklabToRgb({ L, a: c * Math.cos(rad), b: c * Math.sin(rad) });
    if (inGamut(rgb)) return rgb;
    c *= 0.9;
  }
  return oklabToRgb({ L, a: 0, b: 0 });
}

export function oklchOfHex(hex) { const p = parseColor(hex); return p ? rgbToOklch(p) : null; }

// 명도 단계(1 흰색 ~ 10 검정) 추정 — guide.json 의 lightnessLevels 를 OKLCH L 로 보간 (소수 1자리)
export function lightnessLevel(L, levels) {
  const pts = levels.map(lv => ({ level: lv.level, L: rgbToOklch(parseColor(lv.hex)).L })).sort((a, b) => b.L - a.L);
  if (L >= pts[0].L) return pts[0].level;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (L <= a.L && L >= b.L) {
      const t = (a.L - L) / ((a.L - b.L) || 1);
      return Math.round((a.level + t * (b.level - a.level)) * 10) / 10;
    }
  }
  return pts[pts.length - 1].level;
}

export function clampOklchHex(hex, { Lmin, Lmax, Cmax }) {
  const o = oklchOfHex(hex);
  if (!o) return hex;
  const L = Math.min(Lmax, Math.max(Lmin, o.L));
  const C = Math.min(Cmax, o.C);
  return toHex(oklchToRgb({ L, C, h: o.h }));
}
