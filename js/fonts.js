// 글꼴 레지스트리: data/fonts.json 에 등록된 글꼴을 불러오고, 캔버스 글자를 다시 측정한다.
export class FontManager {
  constructor() {
    this.fonts = [];
    this.defaults = { title: 'Cafe24 Dangdanghae', body: 'Pretendard Variable' };
    this.loaded = new Set();
  }

  async init(url = 'data/fonts.json') {
    const data = await (await fetch(url)).json();
    this.fonts = data.fonts;
    this.defaults = data.default || this.defaults;
    for (const f of this.fonts) {
      if (f.css && !document.querySelector(`link[data-font="${f.family}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = f.css;
        link.dataset.font = f.family;
        document.head.append(link);
      }
    }
    // 스타일시트가 적용될 때까지 잠깐 대기
    await Promise.all(Array.from(document.querySelectorAll('link[data-font]')).map(l =>
      l.sheet ? null : new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 4000); })));
  }

  get(family) { return this.fonts.find(f => f.family === family); }
  families() { return this.fonts.map(f => f.family); }

  // 굵기를 글꼴이 가진 값 중 가장 가까운 것으로 맞춘다
  snapWeight(family, weight) {
    const f = this.get(family);
    if (!f) return weight;
    const w = Number(weight) || 400;
    return f.weights.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a, f.weights[0]);
  }

  async load(family, weight = 400, text = '가나다ABC123') {
    try {
      await document.fonts.load(`${weight} 64px "${family}"`, text || ' ');
    } catch (e) { /* 무시 */ }
  }

  // 캔버스의 모든 글자 객체에 대해 글꼴을 내려받고 크기를 다시 계산
  async ensureCanvas(canvas) {
    const texts = [];
    const walk = objs => objs.forEach(o => {
      if (o.type === 'group') walk(o.getObjects());
      else if (o.type === 'textbox' || o.type === 'i-text' || o.type === 'text') texts.push(o);
    });
    walk(canvas.getObjects());
    await Promise.all(texts.map(t => this.load(t.fontFamily, t.fontWeight, t.text)));
    await document.fonts.ready;
    if (window.fabric?.util?.clearFabricFontCache) fabric.util.clearFabricFontCache();
    for (const t of texts) {
      t.initDimensions && t.initDimensions();
      t.dirty = true;
      t.setCoords();
      if (t.group) { t.group.dirty = true; }
    }
    canvas.requestRenderAll();
  }

  async addUserFont(file) {
    const buf = await file.arrayBuffer();
    const name = file.name.replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[^\w가-힣 -]/g, '').trim() || '내 글꼴';
    const family = '사용자 ' + name;
    const face = new FontFace(family, buf);
    await face.load();
    document.fonts.add(face);
    const entry = {
      family, label: name + ' (불러온 글꼴)', weights: [400], heavy: true, style: 'user', use: ['title', 'body'],
      note: '이 브라우저 세션에서만 사용됩니다. 라이선스를 직접 확인하세요.', license: '사용자 확인 필요', user: true
    };
    this.fonts.push(entry);
    return entry;
  }
}
