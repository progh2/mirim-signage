// 템플릿 레지스트리: templates/index.json 에 파일만 추가하면 목록에 나타난다.
import { fromSchemaObject, makeGradient, validateTemplate } from './schema.js';

const USER_KEY = 'mirim.userTemplates';

export class TemplateStore {
  constructor(guide, fonts) {
    this.guide = guide; this.fonts = fonts;
    this.builtin = []; this.categories = [];
    this.thumbs = new Map();
  }

  async init(url = 'templates/index.json') {
    const idx = await (await fetch(url, { cache: 'no-cache' })).json();
    this.categories = idx.categories || [];
    const base = url.replace(/[^/]+$/, '');
    const results = await Promise.allSettled(idx.templates.map(async f => {
      const t = await (await fetch(base + f, { cache: 'no-cache' })).json();
      const errs = validateTemplate(t);
      if (errs.length) throw new Error(`${f}: ${errs.join(', ')}`);
      t._file = f;
      return t;
    }));
    this.builtin = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    results.filter(r => r.status === 'rejected').forEach(r => console.warn('템플릿 오류', r.reason));
    this.errors = results.filter(r => r.status === 'rejected').map(r => String(r.reason?.message || r.reason));
  }

  user() { try { return JSON.parse(localStorage.getItem(USER_KEY) || '[]'); } catch { return []; } }
  saveUser(list) { localStorage.setItem(USER_KEY, JSON.stringify(list)); }
  addUser(tpl) {
    const list = this.user().filter(t => t.id !== tpl.id);
    list.unshift(tpl);
    this.saveUser(list);
  }
  removeUser(id) { this.saveUser(this.user().filter(t => t.id !== id)); this.thumbs.delete('u:' + id); }

  list(signage, category) {
    return this.builtin.filter(t => t.signage === signage && (!category || category === '전체' || t.category === category));
  }

  categoriesFor(signage) {
    const set = new Set(this.builtin.filter(t => t.signage === signage).map(t => t.category));
    const ordered = this.categories.filter(c => set.has(c));
    for (const c of set) if (!ordered.includes(c)) ordered.push(c);
    return ordered;
  }

  async thumbnail(tpl, key) {
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    const sp = this.guide.signages[tpl.signage];
    const el = document.createElement('canvas');
    const sc = new fabric.StaticCanvas(el, { width: sp.width, height: sp.height, enableRetinaScaling: false, renderOnAddRemove: false });
    const bg = tpl.background || { type: 'solid', color: '#156082' };
    const r = new fabric.Rect({ left: 0, top: 0, width: sp.width, height: sp.height, strokeWidth: 0 });
    r.set('fill', bg.type === 'linear' ? makeGradient(bg, sp.width, sp.height) : bg.color);
    sc.add(r);
    for (const o of tpl.objects || []) {
      try {
        const f = await fromSchemaObject(o, this.fonts);
        if (f) {
          if (f.type === 'textbox') await this.fonts.load(f.fontFamily, f.fontWeight, f.text);
          sc.add(f);
        }
      } catch (e) { /* 이미지 실패 등 무시 */ }
    }
    fabric.util.clearFabricFontCache();
    sc.getObjects().forEach(o => { if (o.initDimensions) { o.initDimensions(); o.setCoords(); } });
    sc.renderAll();
    const url = sc.toDataURL({ format: 'png', multiplier: 280 / sp.width });
    sc.dispose();
    this.thumbs.set(key, url);
    return url;
  }
}
