// 앱 진입점
import { $, $$, h, toast, openModal, confirmModal, promptModal, download, pickFile, readAs, stamp } from './ui.js';
import { FontManager } from './fonts.js';
import { Editor } from './editor.js';
import { TemplateStore } from './templates.js';
import { validateTemplate } from './schema.js';
import { runChecks, autoFix } from './checker.js';
import { exportPNG, ledPreview } from './export.js';
import { renderProps, renderLayers, renderChecks, renderManual, renderElements } from './panels.js';
import { openAiSettings, aiReview, renderAiDesignPanel, updateAiDot } from './ai/ai-ui.js';
import { keyStatus } from './ai/keystore.js';
import { showHelp } from './help.js';

const app = {};
window.__signageApp = app; // 디버깅용

async function boot() {
  const guide = await (await fetch('data/guide.json')).json();
  const fonts = new FontManager();
  await fonts.init();
  const editor = new Editor({
    canvasEl: $('#signageCanvas'), holder: $('#canvasHolder'), stage: $('#stage'), overlay: $('#overlay'), guide, fonts
  });
  const templates = new TemplateStore(guide, fonts);
  await templates.init();
  Object.assign(app, { guide, fonts, editor, templates });
  $('#guideVersion').textContent = `가이드 V${guide.version} 기준`;

  // ---------- 갱신 함수 ----------
  let checkTimer;
  app.scheduleCheck = (ms = 450) => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      try { app.lastCheck = runChecks(editor); renderChecks(app.lastCheck, editor, app); }
      catch (e) { console.error(e); }
    }, ms);
  };
  app.refreshProps = () => renderProps(editor, app);
  app.refreshLayers = () => renderLayers(editor, app);
  app.refreshAll = () => { app.refreshProps(); app.refreshLayers(); app.scheduleCheck(); };
  app.replaceImageFlow = async (target) => {
    const f = await pickFile('#fileImage');
    if (!f) return;
    try { await editor.replaceImage(target, await readAs(f)); app.refreshAll(); }
    catch (e) { toast(e.message, 'err'); }
  };

  editor.addEventListener('changed', () => { app.refreshLayers(); app.scheduleCheck(); });
  editor.addEventListener('selection', () => { app.refreshProps(); app.refreshLayers(); });
  editor.addEventListener('history', () => { $('#btnUndo').disabled = editor.history.length < 2; $('#btnRedo').disabled = !editor.future.length; });
  editor.addEventListener('zoom', e => { $('#zoomLabel').textContent = Math.round(e.detail.zoom * 100) + '%'; });
  editor.addEventListener('quota', () => toast('브라우저 자동 저장 공간이 부족합니다(큰 이미지). ‘저장’으로 프로젝트 파일을 내려받아 두세요.', 'err'));
  editor.addEventListener('warn', e => toast(e.detail.message, 'err'));
  editor.addEventListener('request-image', e => app.replaceImageFlow(e.detail.target));
  editor.addEventListener('signage', e => {
    $$('.sg-btn').forEach(b => { const on = b.dataset.signage === e.detail.id; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    const s = editor.spec;
    $('#stageInfo').innerHTML = `<b>${s.name}</b> · ${s.width}×${s.height}px · ${s.physical}`;
    renderTemplatePanel();
    renderManual(editor);
    renderAiDesignPanel(app);
    app.refreshAll();
    try { localStorage.setItem('mirim.lastSignage', e.detail.id); } catch {}
  });

  // ---------- 사이니지 선택 ----------
  async function seedIfEmpty() {
    const key = 'mirim.seeded.' + editor.signage;
    if (editor.c.getObjects().length > 1 || localStorage.getItem(key)) return;
    const t = templates.list(editor.signage)[0];
    if (t) { await editor.applyTemplate(t); editor.pushHistory(true); app.refreshAll(); }
    try { localStorage.setItem(key, '1'); } catch {}
  }
  app.seedIfEmpty = seedIfEmpty;
  $$('.sg-btn').forEach(b => b.addEventListener('click', async () => { if (b.dataset.signage !== editor.signage) { await editor.setSignage(b.dataset.signage); await seedIfEmpty(); } }));

  // ---------- 탭 ----------
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
  }));

  // ---------- 상단 ----------
  $('#btnUndo').onclick = () => editor.undo();
  $('#btnRedo').onclick = () => editor.redo();
  $('#btnNew').onclick = async () => {
    if (await confirmModal('새로 만들기', '현재 화면의 디자인을 지우고 빈 화면으로 시작할까요? (필요하면 먼저 ‘저장’하세요)', '새로 만들기')) {
      await editor.blank(); editor.pushHistory(); app.refreshAll();
    }
  };
  $('#btnSave').onclick = () => saveProject();
  $('#btnOpen').onclick = async () => {
    const f = await pickFile('#fileProject');
    if (!f) return;
    try {
      const p = JSON.parse(await readAs(f, 'text'));
      if (p.app !== 'mirim-signage' || !p.canvas) throw new Error('미림 사이니지 프로젝트 파일이 아닙니다.');
      if (p.signage !== editor.signage) await editor.setSignage(p.signage);
      await editor.loadJSON(p.canvas, { aiUsed: p.aiUsed });
      editor.pushHistory(); app.refreshAll();
      toast('프로젝트를 열었습니다.', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#btnLed').onclick = () => ledPreview(editor);
  const menu = $('#exportMenu');
  $('#btnExport').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', () => { menu.hidden = true; });
  $$('#exportMenu button').forEach(b => b.addEventListener('click', async () => {
    menu.hidden = true;
    const r = runChecks(editor);
    renderChecks(r, editor, app);
    if (r.fails) {
      const ok = await confirmModal('가이드 점검에서 문제가 있습니다', `실패 항목 ${r.fails}건이 있습니다(예: ${r.items.find(i => i.level === 'fail')?.title}). 그래도 내보낼까요?`, '그래도 내보내기');
      if (!ok) return;
    }
    try {
      const names = await exportPNG(editor, b.dataset.export);
      toast(`${names.join(', ')} 저장 (${editor.W}×${editor.H}px)`, 'ok');
    } catch (e) { toast('내보내기 실패: ' + e.message, 'err'); }
  }));
  $('#btnAiSettings').onclick = () => openAiSettings(() => renderAiDesignPanel(app));
  $('#btnHelp').onclick = () => showHelp(app);

  // ---------- 스테이지 ----------
  $('#zoomIn').onclick = () => editor.setZoom(editor.zoom * 1.2);
  $('#zoomOut').onclick = () => editor.setZoom(editor.zoom / 1.2);
  $('#zoomFit').onclick = () => editor.fit();
  $('#optSafe').onchange = e => editor.setOption('safe', e.target.checked);
  $('#optGrid').onchange = e => editor.setOption('grid', e.target.checked);
  $('#optRows').onchange = e => editor.setOption('rows', e.target.checked);

  // ---------- 요소 ----------
  $$('[data-add-text]').forEach(b => b.addEventListener('click', () => editor.addText(b.dataset.addText)));
  $$('[data-add-shape]').forEach(b => b.addEventListener('click', () => editor.addShape(b.dataset.addShape)));
  $('#btnAddImage').onclick = async () => { const f = await pickFile('#fileImage'); if (f) { try { await editor.addImage(await readAs(f), { name: f.name.replace(/\.\w+$/, '') }); } catch (e) { toast(e.message, 'err'); } } };
  $('#btnAddBgImage').onclick = async () => { const f = await pickFile('#fileImage'); if (f) { try { await editor.addImage(await readAs(f), { asBackground: true }); app.refreshAll(); } catch (e) { toast(e.message, 'err'); } } };
  $('#btnBgSettings').onclick = () => { editor.c.discardActiveObject(); editor.c.requestRenderAll(); app.refreshProps(); };
  $('#btnAddAiLabel').onclick = () => { editor.addAiLabel(); };
  $('#btnUserFont').onclick = async () => {
    const f = await pickFile('#fileFont');
    if (!f) return;
    try { const e = await fonts.addUserFont(f); renderElements(editor, app); toast(`글꼴 “${e.label}”을 불러왔습니다(이 탭에서만).`, 'ok'); app.refreshProps(); }
    catch (e) { toast('글꼴을 불러오지 못했습니다: ' + e.message, 'err'); }
  };

  // ---------- 점검 ----------
  $('#btnAutoFix').onclick = async () => {
    const ch = await autoFix(editor);
    app.refreshAll();
    if (!ch.length) toast('자동 보정할 항목이 없습니다.', 'ok');
    else openModal({ title: `자동 보정 ${ch.length}건`, body: h('ul', {}, ...ch.map(c => h('li', {}, c))), buttons: [{ label: '되돌리기', cls: 'ghost', onClick: () => editor.undo() }, { label: '확인', cls: 'primary' }] });
  };
  $('#btnAiReview').onclick = () => {
    const st = keyStatus();
    if (st === 'none' || st === 'locked') { toast(st === 'locked' ? 'API 키 잠금을 해제하세요.' : '먼저 AI 설정에서 API 키를 등록하세요.', 'err'); openAiSettings(); return; }
    aiReview(app);
  };

  // ---------- 템플릿 ----------
  $('#tplCategory').onchange = () => renderTemplateGrid();
  $('#btnSaveTpl').onclick = async () => {
    const name = await promptModal('내 템플릿으로 저장', '템플릿 이름', '');
    if (!name) return;
    const tpl = editor.toTemplate({ name, category: '내 템플릿' });
    try { templates.addUser(tpl); renderUserTemplates(); toast('이 브라우저에 템플릿을 저장했습니다.', 'ok'); }
    catch { toast('저장 공간이 부족합니다. ‘템플릿 파일로 내보내기’를 사용하세요.', 'err'); }
  };
  $('#btnExportTpl').onclick = async () => {
    const name = await promptModal('템플릿 파일로 내보내기', '템플릿 이름', '새 템플릿');
    if (!name) return;
    const id = (editor.signage + '-' + name).replace(/[^\w가-힣-]+/g, '-').toLowerCase();
    const tpl = editor.toTemplate({ id, name, category: '학교 행사 공지', description: '' });
    download(`${id}.json`, JSON.stringify(tpl, null, 2), 'application/json');
    toast('templates/ 폴더에 넣고 index.json 에 파일명을 추가하면 기본 템플릿이 됩니다.', 'ok');
  };
  $('#btnImportTpl').onclick = async () => {
    const f = await pickFile('#fileTemplate');
    if (!f) return;
    try {
      const t = JSON.parse(await readAs(f, 'text'));
      const errs = validateTemplate(t);
      if (errs.length) throw new Error(errs.join(', '));
      t.id = t.id || 'import-' + Date.now().toString(36);
      templates.addUser(t); renderUserTemplates();
      toast(`템플릿 “${t.name}”을 가져왔습니다.`, 'ok');
    } catch (e) { toast('템플릿 오류: ' + e.message, 'err'); }
  };

  async function useTemplate(t) {
    if (t.signage !== editor.signage) { toast('다른 사이니지용 템플릿입니다.', 'err'); return; }
    const hasContent = editor.c.getObjects().length > 1;
    if (hasContent && !(await confirmModal('템플릿 적용', `“${t.name}” 템플릿으로 현재 디자인을 바꿀까요? (실행 취소 가능)`, '적용'))) return;
    await editor.applyTemplate(t);
    app.refreshAll();
    if (t.notes) toast(t.notes);
  }

  function renderTemplatePanel() {
    const sel = $('#tplCategory');
    const cats = templates.categoriesFor(editor.signage);
    sel.innerHTML = '';
    sel.append(h('option', { value: '전체' }, `전체 (${templates.list(editor.signage).length})`));
    cats.forEach(c => sel.append(h('option', { value: c }, `${c} (${templates.list(editor.signage, c).length})`)));
    renderTemplateGrid();
    renderUserTemplates();
  }

  function tplCard(t, key, { del } = {}) {
    const sp = guide.signages[t.signage];
    const ph = h('div', { class: 'thumb-ph', style: { '--ar': `${sp.width}/${sp.height}` } }, '미리보기 생성 중…');
    const card = h('button', { class: 'tpl', title: t.description || t.name, onclick: () => useTemplate(t) },
      ph, h('div', { class: 'meta' }, h('b', {}, t.name), h('span', {}, [t.category, t.description].filter(Boolean).join(' · '))));
    if (del) {
      const d = h('button', { class: 'del', title: '삭제', onclick: async e => { e.stopPropagation(); if (await confirmModal('템플릿 삭제', `“${t.name}”을 삭제할까요?`, '삭제')) { templates.removeUser(t.id); renderUserTemplates(); } } }, '✕');
      card.append(d);
    }
    templates.thumbnail(t, key).then(url => ph.replaceWith(h('img', { src: url, alt: t.name, style: { aspectRatio: `${sp.width}/${sp.height}` } }))).catch(() => { ph.textContent = '미리보기 없음'; });
    return card;
  }

  function renderTemplateGrid() {
    const grid = $('#tplGrid');
    grid.innerHTML = '';
    const list = templates.list(editor.signage, $('#tplCategory').value);
    list.forEach(t => grid.append(tplCard(t, 'b:' + t.id)));
    if (templates.errors?.length) grid.append(h('p', { class: 'hint' }, '불러오지 못한 템플릿: ' + templates.errors.join(' / ')));
  }

  function renderUserTemplates() {
    const grid = $('#userTplGrid');
    grid.innerHTML = '';
    const list = templates.user().filter(t => t.signage === editor.signage);
    if (!list.length) grid.append(h('p', { class: 'hint' }, '저장한 템플릿이 없습니다.'));
    list.forEach(t => grid.append(tplCard(t, 'u:' + t.id, { del: true })));
  }

  function saveProject() {
    download(`미림사이니지_${editor.signage === 'left' ? '좌측' : '우측'}_${stamp()}.json`, JSON.stringify(editor.exportProject()), 'application/json');
    toast('프로젝트 파일을 저장했습니다. ‘열기’로 이어서 편집할 수 있어요.', 'ok');
  }

  // ---------- 키보드 ----------
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || $('#modal').open) return;
    const a = editor.active();
    if (a?.isEditing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); editor.duplicate(); }
    else if (mod && e.key.toLowerCase() === 'c') { editor.copy(); }
    else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); editor.paste(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (a) { e.preventDefault(); editor.removeActive(); } }
    else if (e.key.startsWith('Arrow') && a) {
      e.preventDefault();
      const s = e.shiftKey ? 10 : 1;
      editor.nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
    } else if (e.key === 'Escape') { editor.c.discardActiveObject(); editor.c.requestRenderAll(); }
  });

  // ---------- 시작 ----------
  renderElements(editor, app);
  updateAiDot();
  const last = localStorage.getItem('mirim.lastSignage');
  const first = new URLSearchParams(location.search).get('signage') || last || 'right';
  await editor.setSignage(guide.signages[first] ? first : 'right');
  // 처음 방문 시 기본 템플릿을 하나 보여줌
  await seedIfEmpty();
  document.body.dataset.ready = '1';
}

boot().catch(e => {
  console.error(e);
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#eee"><h2>시작하지 못했습니다</h2><p>${String(e.message || e)}</p><p>파일을 직접 열었다면(file://) 웹 서버나 GitHub Pages 주소로 접속하세요.</p></div>`;
});
