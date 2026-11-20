// ===== 1. API KEY & MODELS =====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY.trim());
}

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

// ===== 2. MEMORY & DOM ELEMENTS =====
let MEMORY = [];
try {
  const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
  if (Array.isArray(storedMemory)) {
    MEMORY = storedMemory.filter(
      m =>
        m &&
        (m.role === 'user' || m.role === 'model') &&
        typeof m.text === 'string' &&
        !(m.role === 'model' && /^(?:Your strong password:|ಇದಿಗೋ strong password:)/i.test(m.text))
    );
    if (MEMORY.length !== storedMemory.length) {
      localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
    }
  } else {
    localStorage.removeItem('jarvis_memory');
  }
} catch (e) {
  localStorage.removeItem('jarvis_memory');
}

function saveMemory() {
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
}

const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const sendBtn = document.getElementById('send-btn'); // Optional if you have a send button
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');

function add(text, sender = 'ai') {
  if (!chat) {
    console.log(`[${sender}]`, text);
    return;
  }
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

MEMORY.forEach(m =>
  add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai')
);

// ===== 3. NETWORK & TOOLS (THE HANDS) =====
async function fetchToolJson(url, options = {}, timeoutMs = 10000) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${errBody.slice(0, 120)}`);
    }
    return await response.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function handleTools(text) {
  // 1. Reset API Key command
  if (/^\s*(?:reset|change|clear)\s+(?:api\s+)?key\s*$/i.test(text)) {
    localStorage.removeItem('jarvis_key');
    API_KEY = prompt('Enter your new Gemini API Key:');
    if (API_KEY) {
      API_KEY = API_KEY.trim();
      localStorage.setItem('jarvis_key', API_KEY);
      return 'API Key updated, Boss.';
    }
    return 'API Key cleared.';
  }

  // 2. Quick site openers
  if (/^\s*(?:please\s+)?(?:open\s+youtube|youtube\s+open|youtube)(?:\s+please)?[.!?]*\s*$/i.test(text)) {
    window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
    return 'Opening YouTube, Boss.';
  }
  if (/^\s*(?:please\s+)?(?:open\s+google|google\s+open|google)(?:\s+please)?[.!?]*\s*$/i.test(text)) {
    window.open('https://google.com', '_blank', 'noopener,noreferrer');
    return 'Opening Google, Boss.';
  }

  // 3. Open direct URL
  const urlCommand = text.match(/^\s*(?:open|visit|go to)\s+(https?:\/\/\S+)\s*$/i);
  if (urlCommand) {
    try {
      const destination = new URL(urlCommand[1]);
      if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
        return 'Only http and https links can be opened.';
      }
      window.open(destination.href, '_blank', 'noopener,noreferrer');
      return 'Opening ' + destination.hostname + ', Boss.';
    } catch (e) {
      return 'That link does not look valid.';
    }
  }

  // 4. Google Search
  if (/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s*$/i.test(text)) {
    return 'Tell me what to search for on Google.';
  }
  const googleSearch = text.match(/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s+(.+?)\s*$/i);
  if (googleSearch) {
    const query = googleSearch[1].trim();
    window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
    return 'Searching Google for ' + query + ', Boss.';
  }

  // 5. YouTube Search
  const playMatch = text.match(/^\s*play\s+(.+?)\s*$/i);
  const youtubeMatch = text.match(/^\s*youtube(?:\s+search)?(?:\s+for)?\s+(.+?)\s*$/i);
  const searchYoutubeMatch = text.match(/^\s*search\s+(?:on\s+)?youtube(?:\s+for)?\s+(.+?)\s*$/i);
  const videoQuery = (playMatch || youtubeMatch || searchYoutubeMatch)?.[1]?.trim();
  if (videoQuery) {
    window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(videoQuery), '_blank', 'noopener,noreferrer');
    return 'Searching YouTube for ' + videoQuery + ', Boss.';
  }

  // 6. Wikipedia Lookup
  const searchMatch = text.match(/^\s*(?:search|look up)\s+(?:for\s+)?(.+?)\s*$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    try {
      const url =
        'https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&srsearch=' +
        encodeURIComponent(query) +
        '&format=json&origin=*';
      const data = await fetchToolJson(url);
      const result = data?.query?.search?.[0];
      if (!result) return 'I could not find that, Boss.';
      const snippet = String(result.snippet || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      return 'Wikipedia summary: ' + result.title + (snippet ? '. ' + snippet : '');
    } catch (e) {
      return 'Search error, Boss.';
    }
  }

  // 7. Time
  if (/^\s*(?:what(?:'s| is)\s+the\s+)?(?:current\s+)?time\b/i.test(text)) {
    return 'Current time: ' + new Date().toLocaleTimeString();
  }

  // 8. Weather (Fixed: returns proper JSON instead of plain text)
  if (/^\s*(?:what(?:'s| is)\s+the\s+)?weather\b/i.test(text)) {
    try {
      const data = await fetchToolJson('https://wttr.in/?format=j1');
      const current = data?.current_condition?.[0];
      const area = data?.nearest_area?.[0]?.areaName?.[0]?.value || 'Your location';
      if (!current) return 'Weather data unavailable.';
      return `Weather in ${area}: ${current.temp_C}°C, ${current.weatherDesc?.[0]?.value || ''}`;
    } catch (e) {
      return 'Unable to fetch weather right now.';
    }
  }

  // 9. Crypto / Bitcoin
  if (/^\s*(?:bitcoin|btc|crypto)(?:\s+price)?\s*$/i.test(text)) {
    try {
      const data = await fetchToolJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      return `Bitcoin price: $${data?.bitcoin?.usd ?? 'Unavailable'}`;
    } catch (e) {
      return 'Unable to fetch Bitcoin price.';
    }
  }

  // 10. News
  if (/^\s*(?:latest\s+|top\s+)?news\s*$/i.test(text)) {
    try {
      const data = await fetchToolJson('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=3');
      const headlines = (data?.hits || []).map(h => h.title).filter(Boolean).join(' | ');
      return headlines ? 'Top headlines: ' + headlines : 'No news found.';
    } catch (e) {
      return 'Unable to fetch news.';
    }
  }

  return null;
}

// ===== 3.5. AGENT MODE ENGINE =====
const AGENT_TOOLS = Object.freeze({
  time: async () => handleTools('current time'),
  weather: async () => handleTools('weather'),
  news: async () => handleTools('news'),
  crypto: async () => handleTools('bitcoin')
});

const AGENT_TOOL_NAMES = Object.freeze({
  time: 'time',
  weather: 'weather',
  news: 'news',
  crypto: 'crypto'
});

function isAgentModeRequest(text = '') {
  const value = String(text || '');
  if (/\b(?:agent(?:\s+mode)?|run\s+(?:the\s+)?agent|use\s+(?:the\s+)?agent)\b/i.test(value)) return true;
  if (/\b(?:briefing|research|analy[sz]e|analysis)\b/i.test(value)) return true;
  return /\bplan\b/i.test(value) && /\b(?:time|weather|news|crypto|bitcoin|btc)\b/i.test(value);
}

function parseAgentToolPlan(responseText) {
  const text = String(responseText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Agent plan format incorrect.');
  const parsed = JSON.parse(text.slice(start, end + 1));
  const allowed = new Set(Object.keys(AGENT_TOOLS));
  return [
    ...new Set(
      parsed
        .filter(item => typeof item === 'string')
        .map(item => item.trim().toLowerCase())
        .filter(item => allowed.has(item))
    )
  ];
}

function fallbackAgentToolPlan(goal = '') {
  const g = String(goal).toLowerCase();
  const tools = [];
  if (/\btime\b/.test(g)) tools.push('time');
  if (/\bweather\b/.test(g)) tools.push('weather');
  if (/\bnews\b/.test(g)) tools.push('news');
  if (/\b(?:crypto|bitcoin|btc)\b/.test(g)) tools.push('crypto');
  return tools.length ? tools : ['time', 'weather', 'news'];
}

async function runAgent(goal) {
  add('J.A.R.V.I.S: Agent mode active.', 'ai');
  add('J.A.R.V.I.S: Goal analyze chesthunna...', 'ai');

  const planPrompt =
    'Return ONLY a JSON array of relevant tool names from ["time","weather","news","crypto"]. Goal: ' +
    JSON.stringify(String(goal));

  let toolsToRun;
  try {
    toolsToRun = parseAgentToolPlan(await callGeminiRaw(planPrompt));
    if (!toolsToRun.length) toolsToRun = fallbackAgentToolPlan(goal);
  } catch (error) {
    toolsToRun = fallbackAgentToolPlan(goal);
  }

  const results = {};
  for (let i = 0; i < toolsToRun.length; i++) {
    const tool = toolsToRun[i];
    add(`J.A.R.V.I.S: [${i + 1}/${toolsToRun.length}] ${AGENT_TOOL_NAMES[tool]} tool run chesthunna...`, 'ai');
    try {
      results[tool] = await AGENT_TOOLS[tool]();
    } catch (e) {
      results[tool] = 'Tool error';
    }
  }

  add('J.A.R.V.I.S: Results combine chesthunna...', 'ai');
  const summaryPrompt = `Goal: ${JSON.stringify(String(goal))}. Tool results: ${JSON.stringify(
    results
  )}. Give a concise Telugu/English summary.`;
  return await callGemini(summaryPrompt);
}

// ===== 4. GEMINI BRAIN =====
async function requestGemini(contents) {
  if (!API_KEY) throw new Error('Gemini API key is missing. Type "reset key" to enter one.');
  let lastError;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`;
      const data = await fetchToolJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) return reply;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All Gemini models failed.');
}

async function callGeminiRaw(promptText) {
  return requestGemini([{ role: 'user', parts: [{ text: promptText }] }]);
}

async function callGemini(p) {
  const contents = MEMORY.slice(-12).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text: p }] });
  return requestGemini(contents);
}

// ===== 5. MAIN MESSAGE ROUTER & UI LISTENERS =====
async function processUserMessage(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return;

  add('YOU: ' + text, 'user');
  MEMORY.push({ role: 'user', text });
  saveMemory();

  try {
    let reply;
    if (isAgentModeRequest(text)) {
      reply = await runAgent(text);
    } else {
      const toolReply = await handleTools(text);
      reply = toolReply !== null ? toolReply : await callGemini(text);
    }

    add('J.A.R.V.I.S: ' + reply, 'ai');
    MEMORY.push({ role: 'model', text: reply });
    saveMemory();
  } catch (err) {
    console.error(err);
    add('J.A.R.V.I.S Error: ' + (err.message || 'Something went wrong.'), 'ai');
  }
}

if (input) {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = input.value;
      input.value = '';
      processUserMessage(val);
    }
  });
}

if (sendBtn && input) {
  sendBtn.addEventListener('click', () => {
    const val = input.value;
    input.value = '';
    processUserMessage(val);
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    MEMORY = [];
    localStorage.removeItem('jarvis_memory');
    if (chat) chat.innerHTML = '';
    add('J.A.R.V.I.S: Memory cleared, Boss.', 'ai');
  });
}
