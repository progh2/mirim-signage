// AI 설정과 API 키 보관 — 모든 정보는 이 브라우저 안에만 저장된다(서버 없음).
// storage 모드
//   memory : 저장하지 않음. 새로고침하면 사라짐(가장 안전)
//   session: sessionStorage. 탭을 닫으면 삭제
//   local  : localStorage. 이 브라우저에 계속 보관 (암호 잠금 선택 가능)

const CFG = 'mirim.ai.config';
const K_PLAIN = 'mirim.ai.key';
const K_ENC = 'mirim.ai.keyEnc';

export const PROVIDERS = {
  openai: {
    label: 'OpenAI (ChatGPT API)', baseUrl: 'https://api.openai.com/v1', needsKey: true,
    model: 'gpt-4.1-mini', imageModel: 'gpt-image-1', imageSupported: true,
    help: 'platform.openai.com → API keys 에서 발급. 프로젝트 키를 만들고 사용 한도(Usage limit)를 꼭 설정하세요.'
  },
  'ollama-local': {
    label: 'Ollama (이 컴퓨터)', baseUrl: 'http://localhost:11434/v1', needsKey: false,
    model: 'gemma3:12b', imageModel: '', imageSupported: false,
    help: '이 PC에서 Ollama 실행. GitHub Pages 주소에서 부르려면 OLLAMA_ORIGINS 환경변수에 사이트 주소를 넣어야 합니다(도움말 참고). 점검·디자인에는 비전 모델(gemma3, qwen2.5vl, llama3.2-vision 등)을 쓰세요.'
  },
  'ollama-cloud': {
    label: 'Ollama Cloud (API 키)', baseUrl: 'https://ollama.com/v1', needsKey: true,
    model: '', imageModel: '', imageSupported: false,
    help: 'ollama.com 설정 → API Keys 에서 발급. ‘모델 목록 불러오기’로 사용할 모델을 고르세요. 브라우저 직접 호출이 CORS로 막히면 호환 게이트웨이를 사용하세요.'
  },
  compatible: {
    label: 'OpenAI 호환 (LiteLLM·vLLM·OpenRouter 등)', baseUrl: '', needsKey: true,
    model: '', imageModel: '', imageSupported: true,
    help: '/v1/chat/completions 형식을 지원하는 주소. 예) https://내게이트웨이/v1 . 게이트웨이에서 이 사이트 주소의 CORS 를 허용해야 합니다.'
  }
};

const DEFAULT = {
  provider: 'openai', baseUrl: PROVIDERS.openai.baseUrl, model: PROVIDERS.openai.model,
  imageModel: PROVIDERS.openai.imageModel, imageSize: '1536x1024', imageEnabled: true,
  storage: 'session', encrypted: false, jsonMode: true
};

let memKey = null;

export function getConfig() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(CFG) || '{}') }; } catch { return { ...DEFAULT }; }
}
export function setConfig(cfg) {
  const { provider, baseUrl, model, imageModel, imageSize, imageEnabled, storage, encrypted, jsonMode } = cfg;
  localStorage.setItem(CFG, JSON.stringify({ provider, baseUrl, model, imageModel, imageSize, imageEnabled, storage, encrypted, jsonMode }));
}

export function keyStatus() {
  const cfg = getConfig();
  if (memKey) return 'ready';
  if (sessionStorage.getItem(K_PLAIN)) return 'ready';
  if (localStorage.getItem(K_PLAIN)) return 'ready';
  if (localStorage.getItem(K_ENC)) return 'locked';
  if (!PROVIDERS[cfg.provider]?.needsKey && cfg.baseUrl) return 'nokey';
  return 'none';
}

export function getKey() {
  return memKey || sessionStorage.getItem(K_PLAIN) || localStorage.getItem(K_PLAIN) || '';
}

export function clearKey() {
  memKey = null;
  sessionStorage.removeItem(K_PLAIN);
  localStorage.removeItem(K_PLAIN);
  localStorage.removeItem(K_ENC);
}

export async function saveKey(key, storage, passphrase) {
  clearKey();
  key = (key || '').trim();
  if (!key) return;
  memKey = key;
  if (storage === 'session') sessionStorage.setItem(K_PLAIN, key);
  else if (storage === 'local') {
    if (passphrase) localStorage.setItem(K_ENC, JSON.stringify(await encrypt(key, passphrase)));
    else localStorage.setItem(K_PLAIN, key);
  }
}

export async function unlock(passphrase) {
  const raw = localStorage.getItem(K_ENC);
  if (!raw) return false;
  try { memKey = await decrypt(JSON.parse(raw), passphrase); return true; } catch { return false; }
}

export function maskKey(k) { if (!k) return ''; return k.length <= 10 ? '••••' : k.slice(0, 5) + '…' + k.slice(-4); }

// ---- WebCrypto: PBKDF2(SHA-256, 250,000회) + AES-GCM 256 ----
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encrypt(text, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await deriveKey(pass, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(text));
  return { v: 1, salt: b64(salt), iv: b64(iv), data: b64(data) };
}
async function decrypt(o, pass) {
  const k = await deriveKey(pass, unb64(o.salt));
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, k, unb64(o.data));
  return dec.decode(data);
}
