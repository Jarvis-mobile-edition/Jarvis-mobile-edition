
/* =========================================
   J.A.R.V.I.S MOBILE EDITION
   COMPLETE JAVASCRIPT - VERSION 4
   ========================================= */

// =========================================
// 1. CONFIGURATION
// =========================================

const MODEL = "gemini-3.8-flash";

const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const KEY_STORAGE = "jarvis_key";
const MEMORY_STORAGE = "jarvis_memory";

let API_KEY = localStorage.getItem(KEY_STORAGE) || "";
let MEMORY = [];
let isProcessing = false;

// =========================================
// 2. GET HTML ELEMENTS
// =========================================

const $ = (id) => document.getElementById(id);

const chat = $("chat");
const input = $("msg");

const sendBtn = $("send");
const micBtn = $("mic-btn");
const camBtn = $("cam-btn");
const clearBtn = $("clear-btn");
const setKeyBtn = $("set-api-key-btn");

const imgInput = $("img-input");

const webInput = $("web-search-input");
const webBtn = $("web-search-btn");
const webResults = $("web-results");
const webStatus = $("web-search-status");

const aiStatus = $("ai-status");
const webEngineStatus = $("web-status");
const voiceStatus = $("voice-status");
const memoryStatus = $("memory-status");

const systemState = $("system-state");

// =========================================
// 3. SYSTEM STATUS
// =========================================

function setStatus(element, message, online = false) {
  if (!element) return;

  element.textContent = "• " + message;
  element.classList.toggle("on", online);
}

function setSystemState(message) {
  if (systemState) {
    systemState.textContent = message;
  }
}

function updateDiagnostics() {
  setStatus(
    aiStatus,
    API_KEY ? "KEY SAVED · READY TO TEST" : "WAITING FOR KEY",
    !!API_KEY
  );

  setStatus(webEngineStatus, "READY", true);

  setStatus(
    voiceStatus,
    ("SpeechRecognition" in window ||
      "webkitSpeechRecognition" in window)
      ? "AVAILABLE"
      : "NOT SUPPORTED",
    ("SpeechRecognition" in window ||
      "webkitSpeechRecognition" in window)
  );

  setStatus(memoryStatus, "ACTIVE", true);
}

updateDiagnostics();

// =========================================
// 4. CHAT MEMORY
// =========================================

function loadMemory() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(MEMORY_STORAGE) || "[]"
    );

    if (Array.isArray(saved)) {
      MEMORY = saved.filter(item =>
        item &&
        ["user", "model"].includes(item.role) &&
        typeof item.text === "string"
      ).slice(-60);
    }
  } catch (error) {
    MEMORY = [];
    localStorage.removeItem(MEMORY_STORAGE);
  }
}

function saveMemory() {
  try {
    MEMORY = MEMORY.slice(-60);

    localStorage.setItem(
      MEMORY_STORAGE,
      JSON.stringify(MEMORY)
    );
  } catch (error) {
    console.error("Memory storage error:", error);
  }
}

loadMemory();

// =========================================
// 5. CHAT MESSAGE DISPLAY
// =========================================

function addMessage(text, sender = "ai") {
  if (!chat) return;

  const div = document.createElement("div");

  div.className = `msg ${sender}`;
  div.textContent = text;

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function showSystem(text) {
  addMessage("SYSTEM: " + text, "system");
}

function showAI(text) {
  addMessage("J.A.R.V.I.S: " + text, "ai");
}

function showUser(text) {
  addMessage("YOU: " + text, "user");
}

// Display previous conversations.

MEMORY.forEach(item => {
  if (item.role === "user") {
    showUser(item.text);
  } else {
    showAI(item.text);
  }
});

if (MEMORY.length === 0) {
  showSystem(
    API_KEY
      ? "System online. Gemini API key saved."
      : "System online. Set your Gemini API key, then send a message."
  );
}

// =========================================
// 6. API KEY SETTINGS
// =========================================

function saveApiKey() {
  const enteredKey = prompt(
    "Enter your Gemini API Key:"
  );

  if (enteredKey === null) return;

  const key = enteredKey.trim();

  if (!key) {
    showSystem("API key cannot be empty.");
    return;
  }

  API_KEY = key;

  localStorage.setItem(KEY_STORAGE, API_KEY);

  showSystem("API key saved. Testing connection...");

  updateDiagnostics();

  testConnection();
}

async function testConnection() {
  if (!API_KEY) {
    showSystem("Please set your API key first.");
    return;
  }

  setStatus(aiStatus, "CONNECTING...", false);
  setSystemState("CONNECTING");

  try {
    const reply = await requestGemini([
      {
        role: "user",
        parts: [{ text: "Reply with only: JARVIS ONLINE" }]
      }
    ]);

    setStatus(aiStatus, "ONLINE", true);
    setSystemState("SYSTEM READY");

    showSystem("Gemini connection successful!");
    showAI(reply);

  } catch (error) {
    setStatus(aiStatus, "CONNECTION FAILED", false);
    setSystemState("CONNECTION ERROR");

    showSystem("API connection failed: " + error.message);
  }
}

if (setKeyBtn) {
  setKeyBtn.addEventListener("click", saveApiKey);
}

// =========================================
// 7. GEMINI API CONNECTION
// =========================================

async function requestGemini(contents) {
  if (!API_KEY) {
    throw new Error(
      'Gemini API key missing. Tap "SET API KEY" first.'
    );
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    30000
  );

  try {
    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
      },

      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      }),

      signal: controller.signal
    });

    const data = await response.json();

    if (!response.ok) {
      const message =
        data?.error?.message ||
        `HTTP Error ${response.status}`;

      throw new Error(message);
    }

    const candidate = data?.candidates?.[0];

    const parts = candidate?.content?.parts || [];

    const reply = parts
      .filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!reply) {
      throw new Error(
        data?.promptFeedback?.blockReason
          ? "Request blocked: " + data.promptFeedback.blockReason
          : "Gemini returned an empty response."
      );
    }

    return reply;

  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}

// =========================================
// 8. GEMINI CHAT WITH MEMORY
// =========================================

async function callGemini(imageData = null) {
  const history = MEMORY.slice(-12);

  const contents = history.map((item, index) => {
    const parts = [{ text: item.text }];

    // Attach image to the latest user message.
    if (
      imageData &&
      index === history.length - 1 &&
      item.role === "user"
    ) {
      parts.push({
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.base64
        }
      });
    }

    return {
      role: item.role,
      parts: parts
    };
  });

  return requestGemini(contents);
}

// =========================================
// 9. NETWORK HELPER
// =========================================

async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Network error: " + response.status);
  }

  return response.json();
}

// =========================================
// 10. WIKIPEDIA SEARCH
// =========================================

async function wikipediaSearch(query) {
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "5",
      format: "json",
      origin: "*"
    });

  const data = await fetchJSON(url);

  return data?.query?.search || [];
}

async function runWikipediaSearch(query) {
  if (!query.trim()) {
    webStatus.textContent = "ENTER A SEARCH QUERY";
    return;
  }

  webStatus.textContent = "SEARCHING...";

  if (webResults) {
    webResults.replaceChildren();
  }

  try {
    const results = await wikipediaSearch(query);

    if (!results.length) {
      webStatus.textContent = "NO RESULTS FOUND";
      return;
    }

    webStatus.textContent =
      results.length + " RESULTS FOUND";

    results.forEach(result => {
      const article = document.createElement("div");
      article.className = "msg ai";

      const title = document.createElement("a");

      title.textContent = result.title;
      title.href =
        "https://en.wikipedia.org/wiki/" +
        encodeURIComponent(result.title.replace(/ /g, "_"));

      title.target = "_blank";
      title.rel = "noopener noreferrer";

      const description = document.createElement("p");

      description.textContent =
        result.snippet.replace(/<[^>]*>/g, "")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&#039;/g, "'");

      article.appendChild(title);
      article.appendChild(description);

      webResults.appendChild(article);
    });

  } catch (error) {
    webStatus.textContent = "SEARCH ERROR";

    showSystem(error.message);
  }
}

if (webBtn) {
  webBtn.addEventListener("click", () => {
    runWikipediaSearch(webInput.value);
  });
}

if (webInput) {
  webInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      runWikipediaSearch(webInput.value);
    }
  });
}

// =========================================
// 11. WEATHER TOOL
// =========================================

async function getWeather() {
  const data = await fetchJSON(
    "https://wttr.in/?format=j1"
  );

  const current = data?.current_condition?.[0];

  if (!current) {
    throw new Error("Weather information unavailable.");
  }

  const area =
    data?.nearest_area?.[0]?.areaName?.[0]?.value ||
    "Your area";

  return (
    `Weather in ${area}: ` +
    `${current.temp_C}°C. ` +
    `${current.weatherDesc?.[0]?.value || "Unknown conditions"}.`
  );
}

// =========================================
// 12. NEWS TOOL
// =========================================

async function getNews() {
  const data = await fetchJSON(
    "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5"
  );

  const headlines = (data.hits || [])
    .map(item => item.title)
    .filter(Boolean);

  return headlines.length
    ? "Latest headlines:\n" + headlines.join("\n")
    : "No headlines found.";
}

// =========================================
// 13. BUILT-IN COMMANDS
// =========================================

async function handleTools(text) {
  const command = text.trim();

  // Current time

  if (/\b(current time|what time is it|time now)\b/i.test(command)) {
    return "Current time: " +
      new Date().toLocaleTimeString();
  }

  // Date

  if (/\b(today's date|what is the date|current date)\b/i.test(command)) {
    return "Today's date: " +
      new Date().toLocaleDateString();
  }

  // Weather

  if (/^(weather|what is the weather|what's the weather)$/i.test(command)) {
    return await getWeather();
  }

  // News

  if (/^(news|latest news|top news)$/i.test(command)) {
    return await getNews();
  }

  // Google search

  const google = command.match(
    /^(?:google search|search google for)\s+(.+)/i
  );

  if (google) {
    window.open(
      "https://www.google.com/search?q=" +
      encodeURIComponent(google[1]),
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening Google search for " + google[1];
  }

  // YouTube search

  const youtube = command.match(
    /^(?:youtube search|search youtube for)\s+(.+)/i
  );

  if (youtube) {
    window.open(
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(youtube[1]),
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening YouTube search.";
  }

  // Open Google

  if (/^open google$/i.test(command)) {
    window.open(
      "https://google.com",
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening Google.";
  }

  // Open YouTube

  if (/^open youtube$/i.test(command)) {
    window.open(
      "https://youtube.com",
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening YouTube.";
  }

  // Wikipedia command

  const wiki = command.match(
    /^(?:search|look up)\s+(.+)/i
  );

  if (wiki) {
    const results = await wikipediaSearch(wiki[1]);

    if (!results.length) {
      return "No Wikipedia results found.";
    }

    return results.map((item, index) =>
      `${index + 1}. ${item.title}: ` +
      item.snippet.replace(/<[^>]*>/g, "")
    ).join("\n\n");
  }

  return null;
}

// =========================================
// 14. MAIN MESSAGE PROCESSOR
// =========================================

async function processUserMessage(rawText, imageData = null) {
  const text = String(rawText || "").trim();

  if (!text || isProcessing) return;

  if (!API_KEY) {
    showUser(text);

    showSystem(
      'Gemini API key missing. Tap "SET API KEY" first.'
    );

    return;
  }

  isProcessing = true;

  if (sendBtn) sendBtn.disabled = true;

  setSystemState("PROCESSING");

  showUser(text);

  MEMORY.push({
    role: "user",
    text: text
  });

  saveMemory();

  try {
    let reply;

    if (imageData) {
      reply = await callGemini(imageData);
    } else {
      const toolReply = await handleTools(text);

      reply = toolReply !== null
        ? toolReply
        : await callGemini();
    }

    showAI(reply);

    MEMORY.push({
      role: "model",
      text: reply
    });

    saveMemory();

    setSystemState("SYSTEM READY");

  } catch (error) {
    console.error("JARVIS ERROR:", error);

    showSystem("ERROR: " + error.message);

    setSystemState("SYSTEM ERROR");

  } finally {
    isProcessing = false;

    if (sendBtn) sendBtn.disabled = false;
  }
}

// =========================================
// 15. SEND BUTTON
// =========================================

if (sendBtn && input) {
  sendBtn.addEventListener("click", () => {
    const text = input.value.trim();

    if (!text) return;

    input.value = "";

    processUserMessage(text);
  });
}

// =========================================
// 16. ENTER KEY
// =========================================

if (input) {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();

      if (sendBtn) {
        sendBtn.click();
      }
    }
  });
}

// =========================================
// 17. CLEAR CHAT
// =========================================

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    const confirmClear = confirm(
      "Are you sure you want to clear chat memory?"
    );

    if (!confirmClear) return;

    MEMORY = [];

    localStorage.removeItem(MEMORY_STORAGE);

    if (chat) chat.replaceChildren();

    showSystem("Chat memory cleared.");

    setSystemState("SYSTEM READY");
  });
}

// =========================================
// 18. VOICE RECOGNITION
// =========================================

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    setStatus(voiceStatus, "LISTENING", true);
    setSystemState("LISTENING");
  };

  recognition.onresult = event => {
    const spokenText =
      event.results[0][0].transcript;

    if (input) {
      input.value = spokenText;
    }

    showSystem("Voice recognized: " + spokenText);
  };

  recognition.onerror = event => {
    showSystem("Voice error: " + event.error);
    updateDiagnostics();
    setSystemState("SYSTEM READY");
  };

  recognition.onend = () => {
    updateDiagnostics();
    setSystemState("SYSTEM READY");
  };
}

if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (!recognition) {
      showSystem(
        "Voice recognition is not supported by this browser."
      );
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      showSystem("Voice is already active.");
    }
  });
}

// =========================================
// 19. IMAGE ANALYSIS
// =========================================

if (camBtn && imgInput) {
  camBtn.addEventListener("click", () => {
    imgInput.click();
  });
}

if (imgInput) {
  imgInput.addEventListener("change", async () => {
    const file = imgInput.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showSystem("Please select an image.");
      imgInput.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showSystem("Image must be smaller than 5 MB.");
      imgInput.value = "";
      return;
    }

    if (!API_KEY) {
      showSystem("Set your Gemini API key first.");
      imgInput.value = "";
      return;
    }

    try {
      const dataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(
          new Error("Could not read image.")
        );

        reader.readAsDataURL(file);
      });

      const base64 = String(dataURL).split(",")[1];

      const imageData = {
        mimeType: file.type,
        base64: base64
      };

      const question =
        input?.value.trim() ||
        "Please describe and analyze this image.";

      if (input) input.value = "";

      await processUserMessage(question, imageData);

    } catch (error) {
      showSystem("Image error: " + error.message);

    } finally {
      imgInput.value = "";
    }
  });
}

// =========================================
// 20. INITIALIZE J.A.R.V.I.S
// =========================================

updateDiagnostics();

setSystemState("SYSTEM READY");

console.log(
  "J.A.R.V.I.S MOBILE EDITION INITIALIZED"
);

console.log("Gemini model:", MODEL);
