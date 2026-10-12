// OpenAI 호환 API 호출 (OpenAI / Ollama / LiteLLM 등)
import { getConfig, getKey, keyStatus, PROVIDERS } from './keystore.js';

export class AIError extends Error {}

function base() {
  const cfg = getConfig();
  let b = (cfg.baseUrl || '').trim().replace(/\/+$/, '');
  if (!b) throw new AIError('AI 설정에서 API 주소(Base URL)를 입력하세요.');
  return { cfg, base: b };
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const k = getKey();
  if (k) h.Authorization = 'Bearer ' + k;
  return h;
}

export function ensureReady() {
  const st = keyStatus();
  const cfg = getConfig();
  if (st === 'locked') throw new AIError('API 키가 잠겨 있습니다. AI 설정에서 암호로 잠금을 해제하세요.');
  if (st === 'none' && PROVIDERS[cfg.provider]?.needsKey) throw new AIError('AI 설정에서 API 키를 등록하세요.');
  if (!cfg.model) throw new AIError('AI 설정에서 모델을 선택하세요.');
}

async function request(path, body, { method = 'POST', timeout = 180000 } = {}) {
  const { base: b } = base();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(b + path, {
      method, headers: headers(), body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit'
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new AIError('응답 시간이 초과되었습니다.');
    throw new AIError(`연결 실패: ${b}\n· 주소가 맞는지, 서버가 켜져 있는지 확인하세요.\n· 브라우저가 CORS 로 막았을 수 있습니다(Ollama는 OLLAMA_ORIGINS 설정, 게이트웨이는 CORS 허용 필요).\n· https 사이트에서 http 주소는 localhost/127.0.0.1 만 호출할 수 있습니다.`);
  }
  clearTimeout(timer);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || json?.message || text.slice(0, 300);
    const err = new AIError(`API 오류 ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    err.status = res.status; err.raw = msg;
    throw err;
  }
  return json ?? text;
}

export async function listModels() {
  const r = await request('/models', null, { method: 'GET', timeout: 20000 });
  const arr = r?.data || r?.models || [];
  return arr.map(m => m.id || m.name).filter(Boolean).sort();
}

// messages: [{role, content}] (content 는 문자열 또는 [{type:'text'},{type:'image_url'}])
export async function chat(messages, { json = true, temperature = 0.4, model } = {}) {
  ensureReady();
  const cfg = getConfig();
  const body = { model: model || cfg.model, messages, temperature };
  if (json && cfg.jsonMode !== false) body.response_format = { type: 'json_object' };
  let r;
  try {
    r = await request('/chat/completions', body);
  } catch (e) {
    // 일부 모델은 temperature / response_format 을 지원하지 않음 → 빼고 재시도
    if (e.status === 400 && /response_format|json|temperature|unsupported/i.test(String(e.raw || e.message))) {
      delete body.response_format; delete body.temperature;
      r = await request('/chat/completions', body);
    } else throw e;
  }
  const content = r?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map(p => p.text || '').join('') : (content || '');
  if (!text) throw new AIError('모델 응답이 비어 있습니다.');
  return json ? extractJSON(text) : text;
}

export function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(text.slice(s, e + 1)); } catch {} }
  throw new AIError('모델 응답을 JSON 으로 해석하지 못했습니다:\n' + text.slice(0, 400));
}

export function imageMessage(text, dataURLs = []) {
  return [{ type: 'text', text }, ...dataURLs.map(url => ({ type: 'image_url', image_url: { url } }))];
}

// 이미지 생성 (OpenAI images API 호환)
export async function generateImage(prompt) {
  ensureReady();
  const cfg = getConfig();
  if (!cfg.imageModel) throw new AIError('AI 설정에서 이미지 생성 모델을 입력하세요.');
  const body = { model: cfg.imageModel, prompt, n: 1, size: cfg.imageSize || '1536x1024' };
  if (/^dall-e/i.test(cfg.imageModel)) { body.response_format = 'b64_json'; body.size = '1792x1024'; }
  const r = await request('/images/generations', body, { timeout: 240000 });
  const d = r?.data?.[0];
  if (d?.b64_json) return 'data:image/png;base64,' + d.b64_json;
  if (d?.url) {
    try {
      const blob = await (await fetch(d.url)).blob();
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    } catch { throw new AIError('생성된 이미지를 내려받지 못했습니다(CORS). b64_json 응답을 지원하는 모델을 사용하세요.'); }
  }
  throw new AIError('이미지 생성 응답 형식을 알 수 없습니다.');
}
