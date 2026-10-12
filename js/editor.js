// 캔버스 편집기 — Fabric.js 5 기반
import { prepareImage } from './imagetools.js';
import { CUSTOM_PROPS, newUid, fromSchemaObject, toSchemaObject, makeGradient, makeSlot, loadImage, setBrightness, roleName } from './schema.js';

const LS_PREFIX = 'mirim.project.';

export class Editor extends EventTarget {
  constructor({ canvasEl, holder, stage, overlay, guide, fonts }) {
    super();
    this.guide = guide;
    this.fonts = fonts;
    this.holder = holder;
    this.stage = stage;
    this.overlay = overlay;
    this.zoom = 1;
    this.fitMode = true;
    this.history = [];
    this.future = [];
    this.muted = 0;
    this.clipboard = null;
    this.opts = { safe: true, grid: false, rows: false };
    this.aiUsed = false;

    fabric.Object.prototype.set({
      transparentCorners: false, cornerColor: '#3fa7c9', cornerStrokeColor: '#ffffff', borderColor: '#3fa7c9',
      cornerStyle: 'circle', cornerSize: 14, borderScaleFactor: 2, padding: 4
    });
    fabric.Textbox.prototype.set({ lockScalingFlip: true });
    // Fabric 5.3.0 의 잘못된 기본값('alphabetical') 경고 제거
    fabric.Text.prototype.textBaseline = 'alphabetic';

    this.c = new fabric.Canvas(canvasEl, {
      preserveObjectStacking: true, enableRetinaScaling: false, stopContextMenu: true,
      backgroundColor: null, selectionColor: 'rgba(63,167,201,0.12)', selectionBorderColor: '#3fa7c9'
    });

    this._bindCanvasEvents();
    window.addEventListener('resize', () => this.fitMode && this.fit());
  }

  get spec() { return this.guide.signages[this.signage]; }
  get W() { return this.spec.width; }
  get H() { return this.spec.height; }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  // ---------------- 사이니지 전환 ----------------
  async setSignage(id, { fresh = false } = {}) {
    if (this.signage && !fresh) this.saveLocal();
    this.signage = id;
    this.c.setDimensions({ width: this.W, height: this.H });
    this.history = []; this.future = [];
    const saved = fresh ? null : this.loadLocal(id);
    if (saved) await this.loadJSON(saved.canvas, { aiUsed: saved.aiUsed });
    else await this.blank();
    this.fit();
    this.drawOverlay();
    this.pushHistory(true);
    this.emit('signage', { id });
  }

  async blank(bgSpec) {
    this.muted++;
    this.c.clear();
    this.c.setBackgroundColor(null);
    this.aiUsed = false;
    this.addBackground(bgSpec || { type: 'solid', color: this.guide.color.backgrounds[0].hex });
    this.muted--;
    this.c.requestRenderAll();
    this.emit('changed');
  }

  // 배경 = 맨 아래에 고정된 사각형
  addBackground(spec) {
    const r = new fabric.Rect({
      left: 0, top: 0, width: this.W, height: this.H, strokeWidth: 0,
      selectable: false, evented: false, hasControls: false, lockMovementX: true, lockMovementY: true,
      uid: 'background', name: '배경', role: 'background', hoverCursor: 'default', objectCaching: false
    });
    this.c.insertAt(r, 0);
    this.setBackground(spec, r);
    return r;
  }

  get bg() { return this.c.getObjects().find(o => o.role === 'background'); }

  setBackground(spec, rect = this.bg) {
    if (!rect) rect = this.addBackground(spec);
    rect.bgSpec = spec;
    rect.set({ width: this.W, height: this.H, left: 0, top: 0 });
    if (spec.type === 'linear') rect.set('fill', makeGradient(spec, this.W, this.H));
    else rect.set('fill', spec.color);
    rect.dirty = true;
    this.c.requestRenderAll();
    this.commit();
  }

  // ---------------- 표시 크기 ----------------
  fit() {
    const pad = 60;
    const sw = this.stage.clientWidth - pad, sh = this.stage.clientHeight - pad;
    this.fitMode = true;
    this.setZoom(Math.min(sw / this.W, sh / this.H, 1.5), true);
  }

  setZoom(z, keepFit = false) {
    this.zoom = Math.max(0.1, Math.min(3, z));
    if (!keepFit) this.fitMode = false;
    const w = Math.round(this.W * this.zoom), h = Math.round(this.H * this.zoom);
    this.c.setDimensions({ width: w + 'px', height: h + 'px' }, { cssOnly: true });
    this.holder.style.width = w + 'px';
    this.holder.style.height = h + 'px';
    this.c.calcOffset();
    this.emit('zoom', { zoom: this.zoom });
  }

  // ---------------- 오버레이(내보내기에 포함되지 않음) ----------------
  setOption(k, v) { this.opts[k] = v; this.drawOverlay(); }

  drawOverlay(guides = []) {
    const svg = this.overlay;
    svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const m = this.spec.safeMargin;
    let s = '';
    if (this.opts.grid) {
      const step = this.signage === 'right' ? 80 : 64;
      for (let x = step; x < this.W; x += step) s += `<line x1="${x}" y1="0" x2="${x}" y2="${this.H}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
      for (let y = step; y < this.H; y += step) s += `<line x1="0" y1="${y}" x2="${this.W}" y2="${y}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
    }
    if (this.opts.rows) {
      // 본문 48pt(64px) 기준 8줄 / 보조설명 기준선
      const n = this.spec.maxTextLines;
      const lh = (this.H - 2 * m) / n;
      for (let i = 1; i < n; i++) s += `<line x1="${m}" y1="${m + i * lh}" x2="${this.W - m}" y2="${m + i * lh}" stroke="rgba(240,180,90,0.35)" stroke-dasharray="6 6" stroke-width="1.5"/>`;
    }
    if (this.opts.safe) {
      s += `<rect x="${m}" y="${m}" width="${this.W - 2 * m}" height="${this.H - 2 * m}" fill="none" stroke="rgba(63,167,201,0.7)" stroke-dasharray="10 8" stroke-width="2"/>`;
    }
    for (const g of guides) {
      s += g.v
        ? `<line x1="${g.v}" y1="0" x2="${g.v}" y2="${this.H}" stroke="#f05aa8" stroke-width="2"/>`
        : `<line x1="0" y1="${g.h}" x2="${this.W}" y2="${g.h}" stroke="#f05aa8" stroke-width="2"/>`;
    }
    svg.innerHTML = s;
  }

  // ---------------- 이벤트 ----------------
  _bindCanvasEvents() {
    const c = this.c;
    const changed = () => this.commit();
    c.on('object:modified', changed);
    c.on('text:changed', () => { this.emit('changed'); this._debouncedCommit(); });
    c.on('selection:created', () => this.emit('selection'));
    c.on('selection:updated', () => this.emit('selection'));
    c.on('selection:cleared', () => this.emit('selection'));
    c.on('mouse:down', e => {
      const t = e.target;
      if (t) { t._lastLeft = t.left; t._lastTop = t.top; }
    });
    c.on('object:moving', e => this._snap(e.target));
    c.on('object:scaling', e => {
      const t = e.target;
      // 글상자는 크기 조절 시 글자 크기는 그대로, 너비만 변경
      if (t.type === 'textbox' && (e.transform?.corner === 'ml' || e.transform?.corner === 'mr')) return;
      if (t.type === 'image' && t.clipPath) t.clipPath = null;
    });
    c.on('mouse:up', () => this.drawOverlay());
    c.on('mouse:dblclick', e => {
      if (e.target?.role === 'image-slot') this.emit('request-image', { target: e.target });
    });
    this._debouncedCommit = debounce(() => this.commit(), 600);
  }

  _snap(t) {
    const tol = 8 / this.zoom;
    const guides = [];
    const r = t.getBoundingRect(true, true);
    const m = this.spec.safeMargin;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const xTargets = [this.W / 2, m, this.W - m];
    const yTargets = [this.H / 2, m, this.H - m];
    let dx = 0, dy = 0;
    // 가운데
    if (Math.abs(cx - this.W / 2) < tol) { dx = this.W / 2 - cx; guides.push({ v: this.W / 2 }); }
    else if (Math.abs(r.left - m) < tol) { dx = m - r.left; guides.push({ v: m }); }
    else if (Math.abs(r.left + r.width - (this.W - m)) < tol) { dx = this.W - m - (r.left + r.width); guides.push({ v: this.W - m }); }
    if (Math.abs(cy - this.H / 2) < tol) { dy = this.H / 2 - cy; guides.push({ h: this.H / 2 }); }
    else if (Math.abs(r.top - m) < tol) { dy = m - r.top; guides.push({ h: m }); }
    else if (Math.abs(r.top + r.height - (this.H - m)) < tol) { dy = this.H - m - (r.top + r.height); guides.push({ h: this.H - m }); }
    void xTargets; void yTargets;
    t.set({ left: t.left + dx, top: t.top + dy });
    if (t.clipPath?.absolutePositioned && t._lastLeft !== undefined) {
      t.clipPath.left += t.left - t._lastLeft;
      t.clipPath.top += t.top - t._lastTop;
      t._lastLeft = t.left; t._lastTop = t.top;
    }
    this.drawOverlay(guides);
  }

  // ---------------- 기록(실행 취소) ----------------
  serialize() {
    return this.c.toJSON(CUSTOM_PROPS);
  }

  commit() {
    if (this.muted) return;
    this.pushHistory();
    this.emit('changed');
  }

  pushHistory(reset = false) {
    const snap = JSON.stringify(this.serialize());
    if (reset) { this.history = [snap]; this.future = []; }
    else {
      if (this.history[this.history.length - 1] === snap) return;
      this.history.push(snap);
      if (this.history.length > 60) this.history.shift();
      this.future = [];
    }
    this.saveLocal();
    this.emit('history');
  }

  async undo() {
    if (this.history.length < 2) return;
    this.future.push(this.history.pop());
    await this.loadJSON(JSON.parse(this.history[this.history.length - 1]), { keepAi: true });
    this.saveLocal(); this.emit('history'); this.emit('changed');
  }

  async redo() {
    if (!this.future.length) return;
    const s = this.future.pop();
    this.history.push(s);
    await this.loadJSON(JSON.parse(s), { keepAi: true });
    this.saveLocal(); this.emit('history'); this.emit('changed');
  }

  loadJSON(json, { aiUsed, keepAi } = {}) {
    return new Promise(res => {
      this.muted++;
      this.c.loadFromJSON(json, async () => {
        // 배경 사각형 속성 복원
        const bg = this.bg;
        if (bg) bg.set({ selectable: false, evented: false, hoverCursor: 'default' });
        else this.addBackground({ type: 'solid', color: this.guide.color.backgrounds[0].hex });
        this.c.getObjects().forEach(o => { if (!o.uid) o.uid = newUid(); if (o.locked) o.set({ selectable: false, evented: false }); });
        if (!keepAi) this.aiUsed = !!aiUsed;
        await this.fonts.ensureCanvas(this.c);
        this.muted--;
        this.c.renderAll();
        this.emit('changed');
        this.emit('selection');
        res();
      });
    });
  }

  // ---------------- 자동 저장 ----------------
  saveLocal() {
    if (!this.signage) return;
    try {
      localStorage.setItem(LS_PREFIX + this.signage, JSON.stringify({ v: 1, savedAt: Date.now(), aiUsed: this.aiUsed, canvas: this.serialize() }));
      this._quotaWarned = false;
    } catch (e) {
      if (!this._quotaWarned) { this._quotaWarned = true; this.emit('quota'); }
    }
  }
  loadLocal(id) {
    try { const s = localStorage.getItem(LS_PREFIX + id); return s ? JSON.parse(s) : null; } catch { return null; }
  }

  // ---------------- 프로젝트 파일 ----------------
  exportProject() {
    return { app: 'mirim-signage', version: 1, signage: this.signage, aiUsed: this.aiUsed, savedAt: new Date().toISOString(), canvas: this.serialize() };
  }

  // ---------------- 템플릿 ----------------
  async applyTemplate(tpl) {
    this.muted++;
    this.c.discardActiveObject();
    this.c.clear();
    this.addBackground(tpl.background || { type: 'solid', color: this.guide.color.backgrounds[0].hex });
    const objs = [];
    for (const o of tpl.objects || []) {
      try { const f = await fromSchemaObject(o, this.fonts); if (f) objs.push(f); }
      catch (e) { console.warn(e); this.emit('warn', { message: e.message }); }
    }
    objs.forEach(o => this.c.add(o));
    this.aiUsed = !!tpl.aiGenerated;
    await this.fonts.ensureCanvas(this.c);
    this.muted--;
    this.c.renderAll();
    this.commit();
    this.emit('selection');
  }

  toTemplate(meta = {}) {
    const bg = this.bg;
    const objects = this.c.getObjects().filter(o => o.role !== 'background').map(toSchemaObject).filter(Boolean);
    return {
      id: meta.id || 'user-' + Date.now().toString(36),
      name: meta.name || '내 템플릿',
      category: meta.category || '내 템플릿',
      signage: this.signage,
      description: meta.description || '',
      background: bg?.bgSpec || { type: 'solid', color: typeof bg?.fill === 'string' ? bg.fill : '#156082' },
      aiGenerated: this.aiUsed || undefined,
      objects
    };
  }

  // ---------------- 객체 추가 ----------------
  _place(obj, { select = true } = {}) {
    if (!obj.uid) obj.uid = newUid();
    this.c.add(obj);
    if (select) this.c.setActiveObject(obj);
    this.c.requestRenderAll();
    this.commit();
    return obj;
  }

  _center(w, h) { return { left: (this.W - w) / 2, top: (this.H - h) / 2 }; }

  async addText(role = 'body', text) {
    const p = this.guide.typography.presets.find(x => x.role === role) || this.guide.typography.presets[1];
    const fam = role === 'title' ? this.fonts.defaults.title : this.fonts.defaults.body;
    const width = Math.min(this.W - this.spec.safeMargin * 2, role === 'title' ? 1000 : 900);
    const o = await fromSchemaObject({
      type: 'text', role, text: text || (role === 'title' ? '제목을 입력하세요' : role === 'body' ? '본문 내용' : '보조 설명'),
      fontFamily: fam, fontSize: p.px, fontWeight: 800, fill: '#FFFFFF', width,
      ...this._center(width, p.px * 1.2), lineHeight: 1.2
    }, this.fonts);
    await this.fonts.load(o.fontFamily, o.fontWeight, o.text);
    o.initDimensions();
    this._place(o);
    return o;
  }

  async addShape(kind) {
    const pal = this.guide.color;
    let o;
    const W = this.W, H = this.H;
    if (kind === 'rect' || kind === 'round') o = await fromSchemaObject({ type: 'rect', ...this._center(300, 160), width: 300, height: 160, rx: kind === 'round' ? 24 : 0, fill: '#1F3550' }, this.fonts);
    else if (kind === 'circle') o = await fromSchemaObject({ type: 'circle', ...this._center(160, 160), radius: 80, fill: pal.texts[2].hex }, this.fonts);
    else if (kind === 'triangle') o = await fromSchemaObject({ type: 'triangle', ...this._center(160, 140), width: 160, height: 140, fill: pal.texts[2].hex }, this.fonts);
    else if (kind === 'line') o = await fromSchemaObject({ type: 'line', x1: W / 2 - 200, y1: H / 2, x2: W / 2 + 200, y2: H / 2, stroke: '#FFFFFF', strokeWidth: 6 }, this.fonts);
    else if (kind === 'band') { const bh = Math.round(H * 0.22); o = await fromSchemaObject({ type: 'rect', name: '가로 띠', left: 0, top: (H - bh) / 2, width: W, height: bh, fill: 'rgba(0,0,0,0.25)' }, this.fonts); }
    else if (kind === 'pill') o = await fromSchemaObject({ type: 'rect', name: '라벨', ...this._center(260, 64), width: 260, height: 64, rx: 32, fill: pal.texts[2].hex }, this.fonts);
    else if (kind === 'slot') { const sh = Math.round(H * 0.7), sw = Math.round(sh * 1.3); o = makeSlot({ ...this._center(sw, sh), width: sw, height: sh }); }
    if (o) this._place(o);
  }

  async addImage(dataURL, { asBackground = false, name, at } = {}) {
    const img = await loadImage(await prepareImage(dataURL));
    img.uid = newUid();
    if (asBackground) {
      const s = Math.max(this.W / img.width, this.H / img.height);
      img.set({ scaleX: s, scaleY: s, left: (this.W - img.width * s) / 2, top: (this.H - img.height * s) / 2, role: 'background-image', name: name || '배경 이미지' });
      this.c.insertAt(img, 1);
      setBrightness(img, -0.25); // 밝은 사진 대비: 기본으로 조금 어둡게
      this.c.setActiveObject(img);
      this.c.requestRenderAll();
      this.commit();
      return img;
    }
    const s = Math.min((this.W * 0.6) / img.width, (this.H * 0.7) / img.height, 1);
    const pos = at
      ? { left: Math.max(0, Math.min(this.W - img.width * s, at.x - img.width * s / 2)), top: Math.max(0, Math.min(this.H - img.height * s, at.y - img.height * s / 2)) }
      : this._center(img.width * s, img.height * s);
    img.set({ scaleX: s, scaleY: s, name: name || '이미지', ...pos });
    return this._place(img);
  }

  // 이미지 자리(슬롯) 또는 이미지를 새 이미지로 교체 — 작품은 자르지 않고 영역 안에 맞춤
  async replaceImage(target, dataURL) {
    const img = await loadImage(await prepareImage(dataURL));
    const r = target.getBoundingRect(true, true);
    const s = Math.min(r.width / img.width, r.height / img.height);
    img.set({
      uid: newUid(), name: target.name && target.role === 'image-slot' ? target.name.replace('자리', '') || '이미지' : (target.name || '이미지'),
      scaleX: s, scaleY: s, left: r.left + (r.width - img.width * s) / 2, top: r.top + (r.height - img.height * s) / 2
    });
    const idx = this.c.getObjects().indexOf(target);
    this.muted++;
    this.c.remove(target);
    this.c.insertAt(img, idx);
    this.muted--;
    this.c.setActiveObject(img);
    this.c.requestRenderAll();
    this.commit();
    return img;
  }

  async addAiLabel() {
    const exists = this.c.getObjects().find(o => o.role === 'ai-label');
    if (exists) { this.c.setActiveObject(exists); this.c.requestRenderAll(); return exists; }
    const a = this.guide.aiLabel;
    const m = this.spec.safeMargin;
    const w = 260;
    const o = await fromSchemaObject({
      type: 'text', role: 'ai-label', name: 'AI 활용 표시', text: a.text, fontFamily: 'Pretendard Variable', fontWeight: 700,
      fontSize: a.fontSize, fill: 'rgba(255,255,255,0.85)', textAlign: 'right', width: w,
      left: this.W - m - w, top: this.H - m - a.fontSize * 1.1 + Math.round(m * 0.5)
    }, this.fonts);
    await this.fonts.load(o.fontFamily, o.fontWeight, o.text);
    o.initDimensions();
    // 표시 위치의 배경이 밝으면 어두운 글자로
    try {
      const cv = this.renderToCanvas();
      const r = o.getBoundingRect(true, true);
      const d = cv.getContext('2d').getImageData(Math.max(0, r.left), Math.max(0, r.top), Math.max(1, Math.min(r.width, this.W - r.left)), Math.max(1, Math.min(r.height, this.H - r.top))).data;
      let sum = 0; for (let i = 0; i < d.length; i += 16) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (sum / (d.length / 16) > 0.6) o.set('fill', 'rgba(32,33,36,0.8)');
    } catch {}
    return this._place(o, { select: false });
  }

  // 화면(클라이언트) 좌표 → 캔버스 좌표
  clientToCanvas(clientX, clientY) {
    const b = this.c.upperCanvasEl.getBoundingClientRect();
    return { x: (clientX - b.left) * (this.W / b.width), y: (clientY - b.top) * (this.H / b.height) };
  }
  objectAt(pt) {
    const objs = this.c.getObjects();
    for (let i = objs.length - 1; i >= 1; i--) {
      const o = objs[i];
      if (!o.visible || o.locked) continue;
      const r = o.getBoundingRect(true, true);
      if (pt.x >= r.left && pt.x <= r.left + r.width && pt.y >= r.top && pt.y <= r.top + r.height) return o;
    }
    return null;
  }

  // ---------------- 편집 동작 ----------------
  active() { return this.c.getActiveObject(); }
  activeList() { const a = this.active(); if (!a) return []; return a.type === 'activeSelection' ? a.getObjects() : [a]; }

  removeActive() {
    const list = this.activeList().filter(o => o.role !== 'background');
    if (!list.length) return;
    this.muted++;
    list.forEach(o => this.c.remove(o));
    this.c.discardActiveObject();
    this.muted--;
    this.c.requestRenderAll();
    this.commit();
  }

  async duplicate() {
    const a = this.active();
    if (!a) return;
    const cloned = await new Promise(r => a.clone(r, CUSTOM_PROPS));
    this.c.discardActiveObject();
    const offset = 24;
    if (cloned.type === 'activeSelection') {
      cloned.canvas = this.c;
      cloned.forEachObject(o => { o.uid = newUid(); this.c.add(o); });
      cloned.set({ left: cloned.left + offset, top: cloned.top + offset });
      cloned.setCoords();
    } else {
      cloned.set({ left: cloned.left + offset, top: cloned.top + offset, uid: newUid(), name: (a.name || '') + ' 사본' });
      this.c.add(cloned);
    }
    this.c.setActiveObject(cloned);
    this.c.requestRenderAll();
    this.commit();
  }

  copy() { const a = this.active(); if (a) a.clone(c => { this.clipboard = c; }, CUSTOM_PROPS); }
  async paste() {
    if (!this.clipboard) return;
    const c = await new Promise(r => this.clipboard.clone(r, CUSTOM_PROPS));
    this.c.discardActiveObject();
    c.set({ left: c.left + 24, top: c.top + 24 });
    if (c.type === 'activeSelection') { c.canvas = this.c; c.forEachObject(o => { o.uid = newUid(); this.c.add(o); }); c.setCoords(); }
    else { c.uid = newUid(); this.c.add(c); }
    this.clipboard.left += 24; this.clipboard.top += 24;
    this.c.setActiveObject(c);
    this.c.requestRenderAll();
    this.commit();
  }

  nudge(dx, dy) {
    const a = this.active();
    if (!a) return;
    a.set({ left: a.left + dx, top: a.top + dy });
    if (a.clipPath?.absolutePositioned) { a.clipPath.left += dx; a.clipPath.top += dy; }
    a.setCoords();
    this.c.requestRenderAll();
    this._debouncedCommit();
    this.emit('selection');
  }

  align(where) {
    const a = this.active();
    if (!a) return;
    const m = this.spec.safeMargin;
    const r = a.getBoundingRect(true, true);
    let dx = 0, dy = 0;
    if (where === 'left') dx = m - r.left;
    if (where === 'hcenter') dx = (this.W - r.width) / 2 - r.left;
    if (where === 'right') dx = this.W - m - r.width - r.left;
    if (where === 'top') dy = m - r.top;
    if (where === 'vcenter') dy = (this.H - r.height) / 2 - r.top;
    if (where === 'bottom') dy = this.H - m - r.height - r.top;
    a.set({ left: a.left + dx, top: a.top + dy });
    if (a.clipPath?.absolutePositioned) { a.clipPath.left += dx; a.clipPath.top += dy; }
    a.setCoords();
    this.c.requestRenderAll();
    this.commit();
    this.emit('selection');
  }

  // 레이어 순서: 배경(0)은 항상 맨 아래
  reorder(obj, toIndex) {
    const n = this.c.getObjects().length;
    toIndex = Math.max(1, Math.min(n - 1, toIndex));
    obj.moveTo(toIndex);
    this.c.requestRenderAll();
    this.commit();
  }
  bringForward(o = this.active()) { if (o) { this.c.bringForward(o); this.commit(); } }
  sendBackward(o = this.active()) {
    if (!o) return;
    const idx = this.c.getObjects().indexOf(o);
    if (idx > 1) { this.c.sendBackwards(o); this.commit(); }
  }
  bringToFront(o = this.active()) { if (o) { this.c.bringToFront(o); this.commit(); } }
  sendToBack(o = this.active()) { if (o) { o.moveTo(1); this.commit(); } }

  setLocked(o, locked) {
    o.locked = locked;
    o.set({ selectable: !locked, evented: !locked });
    if (locked && this.activeList().includes(o)) this.c.discardActiveObject();
    this.c.requestRenderAll();
    this.commit();
  }
  setVisible(o, v) { o.visible = v; if (!v && this.activeList().includes(o)) this.c.discardActiveObject(); this.c.requestRenderAll(); this.commit(); }

  select(o) {
    if (!o || o.role === 'background' || o.locked || !o.visible) return;
    this.c.setActiveObject(o);
    this.c.requestRenderAll();
  }

  layerName(o) {
    if (o.name) return o.name;
    if (o.type === 'textbox') return (roleName(o.role) || '글자') + ': ' + (o.text || '').split('\n')[0].slice(0, 16);
    return o.type;
  }

  // ---------------- 렌더링(점검·내보내기용) ----------------
  // 편집 보조 표시 없이 원본 해상도로 렌더링
  renderToCanvas({ hide = () => false } = {}) {
    const objs = this.c.getObjects();
    const hidden = [];
    objs.forEach(o => { if (o.visible && hide(o)) { o.visible = false; hidden.push(o); } });
    const active = this.c.getActiveObject();
    // 선택 테두리는 별도 캔버스(upper)에 그려지므로 영향 없음
    const el = this.c.toCanvasElement(1);
    hidden.forEach(o => { o.visible = true; });
    void active;
    return el;
  }

  toPNG() { return this.renderToCanvas().toDataURL('image/png'); }
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
