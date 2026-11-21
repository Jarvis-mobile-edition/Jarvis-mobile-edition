/* ==========================================
   J.A.R.V.I.S MOBILE EDITION v6.0
   TACTICAL AI ENGINE (STREAMING + VISION + TTS)
   ========================================== */

"use strict";

// ==========================================
// 1. CONFIGURATION & STATE
// ==========================================

const STORAGE_KEYS = {
  API_KEY: "jarvis_api_key",
  MODEL: "jarvis_model",
  MEMORY: "jarvis_memory",
  TTS: "jarvis_tts_enabled"
};

const SYSTEM_PERSONA = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark's tactical AI assistant. 
Address the user respectfully (occasionally as "Sir" or "Boss" where natural), maintain calm British wit, and deliver concise, accurate, well-structured answers. 
Use clean Markdown formatting for code, lists, and emphasis.`;

const state = {
  apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || "",
  model: localStorage.getItem(STORAGE_KEYS.MODEL) || "gemini-2.5-flash",
  ttsEnabled: localStorage.getItem(STORAGE_KEYS.TTS) !== "false",
  memory: [],
  busy: false
};

// ==========================================
// 2. DOM REFERENCES
// ==========================================

const $ = (id) => document.getElementById(id);

const dom = {
  chat: $("chat"),
  input: $("msg"),
  sendBtn: $("send"),
  micBtn: $("mic-btn"),
  camBtn: $("cam-btn"),
  clearBtn: $("clear-btn"),
  exportBtn: $("export-btn"),
  configBtn: $("set-api-key-btn"),
  ttsToggleBtn: $("tts-toggle-btn"),
  imgInput: $("img-input"),

  webInput: $("web-search-input"),
  webBtn: $("web-search-btn"),
  webResults: $("web-results"),
  webStatus: $("web-search-status"),

  aiStatus: $("ai-status"),
  modelStatus: $("model-status"),
  voiceStatus: $("voice-status"),
  memoryStatus: $("memory-status"),
  systemState: $("system-state"),

  modal: $("config-modal"),
  apiKeyInput: $("api-key-input"),
  modelSelect: $("model-select"),
  saveConfigBtn: $("save-config-btn"),
  cancelModalBtn: $("cancel-modal-btn")
};

// ==========================================
// 3. SYSTEM STATE & DIAGNOSTICS
// ==========================================

function setSystemState(label, mode = "ready") {
  if (dom.systemState) dom.systemState.textContent = label;
  document.body.dataset.state = mode;
}

function setDiagBadge(el, text, isOnline = false) {
  if (!el) return;
  el.textContent = "• " + text;
  el.classList.toggle("on", isOnline);
  el.classList.toggle("warn", !isOnline);
}

function updateDiagnostics() {
  setDiagBadge(
    dom.aiStatus,
    state.apiKey ? "ONLINE" : "KEY REQUIRED",
    Boolean(state.apiKey)
  );

  setDiagBadge(dom.modelStatus, state.model.toUpperCase(), true);

  const hasSpeech = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  setDiagBadge(dom.voiceStatus, hasSpeech ? "READY" : "UNSUPPORTED", hasSpeech);

  setDiagBadge(dom.memoryStatus, `${state.memory.length} LOGS`, true);

  if (dom.ttsToggleBtn) {
    dom.ttsToggleBtn.textContent = state.ttsEnabled ? "🔊 VOICE: ON" : "🔇 VOICE: OFF";
    dom.ttsToggleBtn.setAttribute("aria-pressed", String(state.ttsEnabled));
  }
}

// ==========================================
// 4. SAFE MARKDOWN FORMATTER & RENDERING
// ==========================================

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(rawText) {
  const codeBlocks = [];

  let processed = rawText.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || "code", code: escapeHTML(code.trim()) });
    return `@@CODEBLOCK_${idx}@@`;
  });

  processed = escapeHTML(processed);

  processed = processed
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^\s*[-*]\s+(.+)$/gm, "• $1")
    .replace(/\n/g, "<br>");

  processed = processed.replace(/@@CODEBLOCK_(\d+)@@/g, (_, idx) => {
    const block = codeBlocks[Number(idx)];
    return `<pre><button type="button" class="copy-code-btn">COPY</button><code>${block.code}</code></pre>`;
  });

  return processed;
}

function createMessageElement(sender, text, imageDataUrl = null) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg ${sender}`;

  if (sender !== "system") {
    const header = document.createElement("div");
    header.className = "msg-header";
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    header.innerHTML = `<span>${sender === "user" ? "OPERATOR" : "J.A.R.V.I.S"}</span><span>${time}</span>`;
    wrapper.appendChild(header);
  }

  const body = document.createElement("div");
  body.className = "msg-body";

  if (sender === "ai") {
    body.innerHTML = renderMarkdown(text);
  } else {
    body.textContent = text;
  }

  wrapper.appendChild(body);

  if (imageDataUrl) {
    const img = document.createElement("img");
    img.src = imageDataUrl;
    img.alt = "Uploaded visual input";
    img.className = "chat-preview";
    wrapper.appendChild(img);
  }

  dom.chat.appendChild(wrapper);
  dom.chat.scrollTop = dom.chat.scrollHeight;
  return body;
}

function systemMessage(text) {
  createMessageElement("system", `SYSTEM // ${text}`);
}

dom.chat?.addEventListener("click", async (e) => {
  if (e.target.classList.contains("copy-code-btn")) {
    const codeEl = e.target.parentElement?.querySelector("code");
    if (!codeEl) return;
    await navigator.clipboard.writeText(codeEl.textContent);
    e.target.textContent = "COPIED";
    setTimeout(() => (e.target.textContent = "COPY"), 1500);
  }
});

// ==========================================
// 5. MEMORY PERSISTENCE
// ==========================================

function loadMemory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMORY) || "[]");
    state.memory = Array.isArray(saved)
      ? saved.filter((m) => m && ["user", "model"].includes(m.role) && typeof m.text === "string").slice(-40)
      : [];
  } catch {
    state.memory = [];
    localStorage.removeItem(STORAGE_KEYS.MEMORY);
  }

  state.memory.forEach((item) => {
    createMessageElement(item.role === "user" ? "user" : "ai", item.text);
  });
}

function saveMemory() {
  state.memory = state.memory.slice(-40);
  try {
    localStorage.setItem(STORAGE_KEYS.MEMORY, JSON.stringify(state.memory));
  } catch {
    systemMessage("Memory buffer full. Older entries pruned.");
  }
  updateDiagnostics();
}

// ==========================================
// 6. TEXT-TO-SPEECH (J.A.R.V.I.S. VOICE)
// ==========================================

function speakText(text) {
  if (!state.ttsEnabled || !("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const cleanText = text
    .replace(/```[\s\S]*?```/g, "Code block displayed on console.")
    .replace(/[*_`#]/g, "")
    .trim();

  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const voices = window.speechSynthesis.getVoices();
  const britishVoice =
    voices.find((v) => v.lang === "en-GB" && /male|daniel|arthur|google uk english male/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith("en-GB")) ||
    voices.find((v) => v.lang.startsWith("en"));

  if (britishVoice) utterance.voice = britishVoice;
  utterance.rate = 1.03;
  utterance.pitch = 0.95;

  window.speechSynthesis.speak(utterance);
}

dom.ttsToggleBtn?.addEventListener("click", () => {
  state.ttsEnabled = !state.ttsEnabled;
  localStorage.setItem(STORAGE_KEYS.TTS, String(state.ttsEnabled));
  if (!state.ttsEnabled && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  updateDiagnostics();
});

// ==========================================
// 7. GEMINI STREAMING API ENGINE
// ==========================================

async function streamGeminiResponse(imageData = null, onChunk) {
  if (!state.apiKey) {
    throw new Error("API key missing. Open CONFIG to initialize.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:streamGenerateContent?alt=sse`;

  const contents = state.memory.slice(-14).map((item) => ({
    role: item.role,
    parts: [{ text: item.text }]
  }));

  if (imageData && contents.length) {
    contents[contents.length - 1].parts.push({
      inline_data: {
        mime_type: imageData.mimeType,
        data: imageData.base64
      }
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": state.apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PERSONA }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP Error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullReply = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const parts = parsed?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (typeof part.text === "string") {
              fullReply += part.text;
              onChunk(fullReply);
            }
          }
        } catch {
          // Ignore partial SSE chunk parse errors
        }
      }
    }

    if (!fullReply.trim()) {
      throw new Error("Neural core returned an empty response.");
    }

    return fullReply.trim();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Connection timed out after 45 seconds.");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ==========================================
// 8. LOCAL TACTICAL COMMANDS & TOOLS
// ==========================================

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function wikipediaSearch(query) {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: "5",
    format: "json",
    origin: "*"
  });
  const data = await fetchJSON(`https://en.wikipedia.org/w/api.php?${params}`);
  return data?.query?.search || [];
}

async function handleLocalCommands(text) {
  const cmd = text.trim();

  if (/^(time|current time|what time is it)\??$/i.test(cmd)) {
    return `Local system time is **${new Date().toLocaleTimeString()}**, Sir.`;
  }

  if (/^(date|today|today's date|current date)\??$/i.test(cmd)) {
    return `Today's date is **${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}**.`;
  }

  if (/^(weather|what is the weather|what's the weather)\??$/i.test(cmd)) {
    const data = await fetchJSON("https://wttr.in/?format=j1");
    const current = data?.current_condition?.[0];
    const area = data?.nearest_area?.[0]?.areaName?.[0]?.value || "your location";
    if (!current) throw new Error("Meteorological sensors offline.");
    return `Current conditions in **${area}**: **${current.temp_C}°C** (feels like ${current.FeelsLikeC}°C), ${current.weatherDesc?.[0]?.value || "clear"}. Humidity at ${current.humidity}%.`;
  }

  if (/^(news|latest news|headlines|top news)$/i.test(cmd)) {
    const data = await fetchJSON("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5");
    const hits = (data.hits || []).filter((h) => h.title);
    if (!hits.length) return "No priority headlines available at the moment.";
    return "**Top Global Tech Headlines:**\n" + hits.map((h, i) => `${i + 1}. ${h.title}`).join("\n");
  }

  const googleMatch = cmd.match(/^(?:google|search google for)\s+(.+)/i);
  if (googleMatch) {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(googleMatch[1])}`, "_blank", "noopener,noreferrer");
    return `Opening external Google query for **"${googleMatch[1]}"**.`;
  }

  const ytMatch = cmd.match(/^(?:youtube|search youtube for)\s+(.+)/i);
  if (ytMatch) {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(ytMatch[1])}`, "_blank", "noopener,noreferrer");
    return `Launching YouTube archives for **"${ytMatch[1]}"**.`;
  }

  return null;
}

// ==========================================
// 9. CORE MESSAGE PIPELINE
// ==========================================

async function processMessage(rawText, imageData = null) {
  const text = String(rawText || "").trim();
  if (!text || state.busy) return;

  if (!state.apiKey) {
    systemMessage("Authorization required. Please configure your Gemini API key.");
    openConfigModal();
    return;
  }

  state.busy = true;
  dom.sendBtn.disabled = true;
  dom.camBtn.disabled = true;
  setSystemState("PROCESSING DIRECTIVE...", "processing");

  createMessageElement("user", text, imageData?.previewUrl || null);
  state.memory.push({ role: "user", text });
  saveMemory();

  try {
    let finalReply = null;

    if (!imageData) {
      finalReply = await handleLocalCommands(text);
    }

    if (finalReply !== null) {
      createMessageElement("ai", finalReply);
    } else {
      const aiBodyEl = createMessageElement("ai", "Initializing neural stream...");
      finalReply = await streamGeminiResponse(imageData, (partialText) => {
        aiBodyEl.innerHTML = renderMarkdown(partialText);
        dom.chat.scrollTop = dom.chat.scrollHeight;
      });
    }

    state.memory.push({ role: "model", text: finalReply });
    saveMemory();
    speakText(finalReply);
    setSystemState("SYSTEM READY", "ready");
  } catch (error) {
    console.error("J.A.R.V.I.S. Fault:", error);
    systemMessage(error.message);
    setSystemState("SYSTEM FAULT", "error");
  } finally {
    state.busy = false;
    dom.sendBtn.disabled = false;
    dom.camBtn.disabled = false;
  }
}

// ==========================================
// 10. IMAGE COMPRESSION & VISION INPUT
// ==========================================

function compressImage(file, maxDim = 1024, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image format."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({
          mimeType: "image/jpeg",
          base64: dataUrl.split(",")[1],
          previewUrl: dataUrl
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

dom.camBtn?.addEventListener("click", () => dom.imgInput?.click());

dom.imgInput?.addEventListener("change", async () => {
  const file = dom.imgInput.files?.[0];
  if (!file) return;

  try {
    setSystemState("PROCESSING VISUAL DATA...", "processing");
    const compressed = await compressImage(file);
    const promptText = dom.input.value.trim() || "Analyze this visual input in detail.";
    dom.input.value = "";
    dom.input.style.height = "auto";
    await processMessage(promptText, compressed);
  } catch (err) {
    systemMessage(err.message);
    setSystemState("SYSTEM READY", "ready");
  } finally {
    dom.imgInput.value = "";
  }
});

// ==========================================
// 11. VOICE RECOGNITION (AUTO-EXECUTE)
// ==========================================

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    dom.micBtn?.classList.add("active");
    setDiagBadge(dom.voiceStatus, "LISTENING", true);
    setSystemState("LISTENING FOR VOICE...", "listening");
  };

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript;
    dom.input.value = transcript;

    if (result.isFinal) {
      dom.input.value = "";
      processMessage(transcript);
    }
  };

  recognition.onerror = (event) => {
    if (event.error !== "aborted") {
      systemMessage(`Audio sensor error: ${event.error}`);
    }
  };

  recognition.onend = () => {
    dom.micBtn?.classList.remove("active");
    updateDiagnostics();
    if (!state.busy) setSystemState("SYSTEM READY", "ready");
  };
}

dom.micBtn?.addEventListener("click", () => {
  if (!recognition) {
    systemMessage("Speech recognition is unsupported in this browser.");
    return;
  }
  try {
    recognition.start();
  } catch {
    recognition.stop();
  }
});

// ==========================================
// 12. WIKIPEDIA ARCHIVE SEARCH
// ==========================================

async function runWikipediaSearch(query) {
  const clean = query.trim();
  if (!clean) {
    dom.webStatus.textContent = "ENTER A SEARCH PARAMETER";
    return;
  }

  dom.webStatus.textContent = "SCANNING ARCHIVES...";
  dom.webResults.replaceChildren();
  dom.webResults.style.display = "block";
  dom.webBtn.disabled = true;

  try {
    const results = await wikipediaSearch(clean);
    if (!results.length) {
      dom.webStatus.textContent = "NO ARCHIVE RECORDS FOUND";
      return;
    }

    dom.webStatus.textContent = `${results.length} ARCHIVE RECORDS RETRIEVED`;

    results.forEach((item) => {
      const div = document.createElement("div");
      div.className = "result-item";

      const link = document.createElement("a");
      link.textContent = item.title;
      link.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const p = document.createElement("p");
      p.textContent = item.snippet.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");

      div.append(link, p);
      dom.webResults.appendChild(div);
    });
  } catch (err) {
    dom.webStatus.textContent = "ARCHIVE CONNECTION FAILED";
    systemMessage(err.message);
  } finally {
    dom.webBtn.disabled = false;
  }
}

dom.webBtn?.addEventListener("click", () => runWikipediaSearch(dom.webInput.value));
dom.webInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runWikipediaSearch(dom.webInput.value);
});

// =========================================
