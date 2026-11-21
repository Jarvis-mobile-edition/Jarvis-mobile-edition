// ===== 1. API KEY & SMART MODELS =====
let API_KEY = localStorage.getItem('jarvis_key');

function requestApiKey(force = false) {
  if (!API_KEY || force) {
    const key = prompt('Enter your Gemini API Key:');
    if (key && key.trim()) {
      API_KEY = key.trim();
      localStorage.setItem('jarvis_key', API_KEY);
    }
  }
}
requestApiKey();

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

const SYSTEM_PROMPT = {
  parts: [{
    text: "You are J.A.R.V.I.S, a witty, hyper-competent personal AI assistant. Keep answers concise, sharp, and conversational. Do not use markdown formatting like asterisks or hashtags since your responses are spoken aloud."
  }]
};

// ===== 2. MEMORY & DOM ELEMENTS =====
let MEMORY = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
function saveMemory() {
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
}

const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const keyBtn = document.getElementById('key-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');
const coreText = document.querySelector('.core-text');
const engineStatus = document.getElementById('engine-status');

MEMORY.forEach(m => add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai'));

function setStatus(text, isOnline = true) {
  if (coreText) coreText.innerText = text;
  if (engineStatus) {
    engineStatus.innerText = isOnline ? '• OPERATIONAL' : '• ERROR';
    engineStatus.className = isOnline ? 'on' : 'off';
  }
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// ===== 3. UNIFIED GEMINI FETCH WITH RETRY & FALLBACK =====
async function fetchGemini(contents, retries = 2) {
  if (!API_KEY) {
    requestApiKey(true);
    if (!API_KEY) throw new Error("API Key required. Tap 🔑 to enter your key.");
  }

  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const m of MODELS) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: SYSTEM_PROMPT,
            contents: contents
          })
        });
        const data = await res.json();

        if (data.error) {
          lastErr = new Error(data.error.message);
          if (/high demand|temporar|quota|rate|unavailable|overloaded/i.test(data.error.message)) {
            continue;
          }
          throw lastErr;
        }

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
          throw new Error("Empty response from neural core.");
        }

        return data.candidates[0].content.parts[0].text;
      } catch (e) {
        lastErr = e;
        if (/API key not valid/i.test(e.message)) throw e;
      }
    }
    if (attempt < retries) {
      setStatus(`RETRYING (${attempt + 1}/${retries})...`, true);
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr;
}

// ===== 4. TEXT & MEMORY ENGINE =====
async function askGemini(p) {
  setStatus('PROCESSING...', true);
  add('J.A.R.V.I.S: Thinking...', 'ai');

  const contents = MEMORY.slice(-12).map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));
  contents.push({ role: 'user', parts: [{ text: p }] });

  try {
    const reply = await fetchGemini(contents);
    MEMORY.push({ role: 'user', text: p });
    MEMORY.push({ role: 'model', text: reply });
    saveMemory();

    chat.lastChild.innerText = 'J.A.R.V.I.S: ' + reply;
    chat.scrollTop = chat.scrollHeight;
    setStatus('SYSTEM READY', true);
    speak(reply);
  } catch (e) {
    chat.lastChild.innerText = 'J.A.R.V.I.S: ERROR - ' + e.message;
    chat.scrollTop = chat.scrollHeight;
    setStatus('CORE OFFLINE', false);
  }
}

// ===== 5. VISION ENGINE (EYES) =====
if (camBtn && imgInput) {
  camBtn.onclick = () => imgInput.click();
  imgInput.onchange = () => {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const q = input.value.trim() || 'What do you see? Describe briefly.';
      add('YOU: [IMAGE] ' + q, 'user');
      input.value = '';
      askVision(base64, file.type, q);
    };
    reader.readAsDataURL(file);
    imgInput.value = '';
  };
}

async function askVision(base64, mime, q) {
  setStatus('ANALYZING VISUALS...', true);
  add('J.A.R.V.I.S: Analyzing image...', 'ai');

  const contents = [{
    parts: [
      { text: q },
      { inline_data: { mime_type: mime, data: base64 } }
    ]
  }];

  try {
    const reply = await fetchGemini(contents);
    chat.lastChild.innerText = 'J.A.R.V.I.S: ' + reply;
    chat.scrollTop = chat.scrollHeight;
    setStatus('SYSTEM READY', true);
    speak(reply);
  } catch (e) {
    chat.lastChild.innerText = 'J.A.R.V.I.S: ERROR - ' + e.message;
    chat.scrollTop = chat.scrollHeight;
    setStatus('CORE OFFLINE', false);
  }
}

// ===== 6. VOICE & UTILS =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR && micBtn) {
  const rec = new SR();
  rec.lang = 'en-US';
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    add('YOU: ' + t, 'user');
    askGemini(t);
  };
  rec.onerror = () => {
    micBtn.innerText = '🎙️';
    setStatus('SYSTEM READY', true);
  };
  micBtn.onclick = () => {
    speechSynthesis.cancel();
    rec.start();
    micBtn.innerText = '...';
    setStatus('LISTENING...', true);
  };
  rec.onend = () => {
    micBtn.innerText = '🎙️';
  };
}

let voices = [];
function loadVoices() {
  voices = speechSynthesis.getVoices();
}
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function speak(t) {
  speechSynthesis.cancel();
  const cleanText = t.replace(/[*#_`]/g, '');
  const u = new SpeechSynthesisUtterance(cleanText);
  u.rate = 1.05;
  u.pitch = 0.85;
  const v = voices.find(v => v.lang.includes('en-GB')) || voices.find(v => v.lang.startsWith('en'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function handleSend() {
  const t = input.value.trim();
  if (!t) return;
  add('YOU: ' + t, 'user');
  input.value = '';
  askGemini(t);
}

sendBtn.onclick = handleSend;
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSend();
});

if (clearBtn) {
  clearBtn.onclick = () => {
    MEMORY = [];
    saveMemory();
    chat.innerHTML = '';
    speechSynthesis.cancel();
    setStatus('SYSTEM READY', true);
    add('SYSTEM: Memory cleared.', 'ai');
  };
}

if (keyBtn) {
  keyBtn.onclick = () => {
    requestApiKey(true);
    setStatus('SYSTEM READY', true);
    add('SYSTEM: API key updated.', 'ai');
  };
}

function add(t, w) {
  const d = document.createElement('div');
  d.className = 'msg ' + w;
  d.innerText = t;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}
