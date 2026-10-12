// 공통 UI 도우미
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  if (tag === 'button' && !('type' in (attrs || {}))) el.type = 'button';
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, type = '') {
  const t = h('div', { class: 'toast ' + type }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), type === 'err' ? 6500 : 3200);
}

// 모달: openModal({title, body: Node|string, buttons:[{label, cls, onClick, close}] , wide})
export function openModal({ title, body, buttons = [], wide = false, onClose }) {
  const dlg = $('#modal');
  $('#modalTitle').textContent = title;
  const mb = $('#modalBody');
  mb.innerHTML = '';
  if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.append(body);
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  for (const b of buttons) {
    const btn = h('button', { class: 'btn ' + (b.cls || '') }, b.label);
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const r = b.onClick ? await b.onClick(btn) : undefined;
      if (b.close !== false && r !== false) dlg.close();
    });
    foot.append(btn);
  }
  dlg.classList.toggle('wide', !!wide);
  dlg.onclose = () => { onClose && onClose(); };
  if (!dlg.open) dlg.showModal();
  return { dlg, body: mb, foot, close: () => dlg.close() };
}
export function closeModal() { const d = $('#modal'); if (d.open) d.close(); }

export function confirmModal(title, message, okLabel = '확인') {
  return new Promise(res => {
    let done = false;
    openModal({
      title, body: h('p', {}, message),
      buttons: [
        { label: '취소', cls: 'ghost', onClick: () => { done = true; res(false); } },
        { label: okLabel, cls: 'primary', onClick: () => { done = true; res(true); } }
      ],
      onClose: () => { if (!done) res(false); }
    });
  });
}

export function promptModal(title, label, value = '', { type = 'text', placeholder = '' } = {}) {
  return new Promise(res => {
    let done = false;
    const input = h('input', { type, value, placeholder });
    const body = h('div', { class: 'form-grid' }, h('label', {}, label), input);
    openModal({
      title, body,
      buttons: [
        { label: '취소', cls: 'ghost', onClick: () => { done = true; res(null); } },
        { label: '확인', cls: 'primary', onClick: () => { done = true; res(input.value); } }
      ],
      onClose: () => { if (!done) res(null); }
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done = true; res(input.value); closeModal(); } });
    setTimeout(() => input.focus(), 30);
  });
}

export function download(filename, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function dataURLtoBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function pickFile(inputSel) {
  return new Promise(res => {
    const inp = $(inputSel);
    inp.value = '';
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
}

export function readAs(file, kind = 'dataURL') {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    if (kind === 'text') r.readAsText(file);
    else if (kind === 'buffer') r.readAsArrayBuffer(file);
    else r.readAsDataURL(file);
  });
}

export function stamp() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function colorInput(value, onChange, swatches = []) {
  const wrap = h('div', { class: 'color-row' });
  const picker = h('input', { type: 'color', value: normalizeHex(value) });
  const text = h('input', { type: 'text', value: normalizeHex(value), maxlength: 7, spellcheck: 'false' });
  picker.addEventListener('input', () => { text.value = picker.value.toUpperCase(); onChange(text.value); });
  text.addEventListener('change', () => {
    const v = normalizeHex(text.value);
    text.value = v; picker.value = v; onChange(v);
  });
  wrap.append(picker, text);
  if (swatches.length) {
    const sw = h('div', { class: 'row gap', style: { marginTop: '6px', width: '100%' } });
    for (const s of swatches) {
      sw.append(h('button', {
        class: 'swatch small', title: `${s.name} ${s.hex}`, style: { background: s.hex },
        onclick: () => { picker.value = s.hex; text.value = s.hex; onChange(s.hex); }
      }));
    }
    const outer = h('div', {}, wrap, sw);
    return outer;
  }
  return wrap;
}

export function normalizeHex(v) {
  if (!v || typeof v !== 'string') return '#000000';
  v = v.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map(c => c + c).join('');
  if (/^#[0-9a-f]{8}$/i.test(v)) v = v.slice(0, 7);
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : '#000000';
}
