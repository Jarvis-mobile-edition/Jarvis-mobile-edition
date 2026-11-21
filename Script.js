
/* =====================================================
   J.A.R.V.I.S MOBILE EDITION
   COMPLETE JAVASCRIPT - VERSION 4
   Gemini AI + Memory + Voice + Image + Search
   ===================================================== */

// =====================================================
// 1. CONFIGURATION
// =====================================================

const API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models/";

const MODEL = "gemini-3.8-flash";
const API_TIMEOUT = 25000;
const MEMORY_LIMIT = 30;

let API_KEY = localStorage.getItem("jarvis_key") || "";
let MEMORY = [];
let pendingImage = null;
let recognition = null;
let isProcessing = false;

// =====================================================
// 2. DOM ELEMENTS
// =====================================================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");

const sendBtn =
  document.getElementById("send") ||
  document.getElementById("send-btn");

const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");

const imgInput = document.getElementById("img-input");

const webInput = document.getElementById("web-search-input");
const webBtn = document.getElementById("web-search-btn");
const webStatus = document.getElementById("web-search-status");

const aiStatus = document.getElementById("ai-status");
const webStatusDiagnostic = document.getElementById("web-status");
const voiceStatus = document.getElementById("voice-status");
const memoryStatus = document.getElementById("memory-status");
const systemState = document.getElementById("system-state");

const setKeyBtn =
  document.getElementById("set-api-key-btn") ||
  document.getElementById("set-key-btn");

// =====================================================
// 3. MEMORY
// =====================================================

function loadMemory() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("jarvis_memory") || "[]"
    );

    if (Array.isArray(saved)) {
      MEMORY = saved.filter(item =>
        item &&
        ["user", "model"].includes(item.role) &&
        typeof item.text === "string"
      ).slice(-MEMORY_LIMIT);
    }
  } catch (error) {
    MEMORY = [];
    localStorage.removeItem("jarvis_memory");
  }
}

function saveMemory() {
  try {
    localStorage.setItem(
      "jarvis_memory",
      JSON.stringify(MEMORY.slice(-MEMORY_LIMIT))
    );
  } catch (error) {
    addMessage(
      "Browser storage is full. Some chat history could not be saved.",
      "system"
    );
  }
}

function remember(role, text) {
  MEMORY.push({ role, text });
  MEMORY = MEMORY.slice(-MEMORY_LIMIT);
  saveMemory();
}

function clearMemory() {
  MEMORY = [];
  localStorage.removeItem("jarvis_memory");
}

// =====================================================
// 4. CHAT DISPLAY
// =====================================================

function addMessage(text, sender = "ai") {
  if (!chat) return;

  const div = document.createElement("div");

  // Matches your original CSS .msg classes
  div.className = `msg ${sender}`;
  div.textContent = String(text);

  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function restoreChat() {
  MEMORY.forEach(item => {
    const name = item.role === "user" ? "YOU: " : "J.A.R.V.I.S: ";

    addMessage(
      name + item.text,
      item.role === "user" ? "user" : "ai"
    );
  });
}

// =====================================================
// 5. API KEY MANAGEMENT
// =====================================================

function setApiKey() {
  const key = prompt("Enter your Gemini API key:");

  if (!key || !key.trim()) {
    return;
  }

  API_KEY = key.trim();

  localStorage.setItem("jarvis_key", API_KEY);

  updateStatus("READY", "API key saved.");

  addMessage(
    "Gemini API key saved. J.A.R.V.I.S is ready.",
    "system"
  );
}

function updateStatus(status, message = "") {
  if (aiStatus) {
    aiStatus.textContent = "• " + status;
    aiStatus.classList.add("on");
  }

  if (systemState) {
    systemState.textContent = status === "READY"
      ? "SYSTEM READY"
      : status === "CONNECTING"
      ? "PROCESSING"
      : "SYSTEM READY";
  }

  if (message) {
    console.log("[JARVIS]", message);
  }
}

// =====================================================
// 6. GEMINI AI CONNECTION
// =====================================================

async function geminiRequest(contents) {
  if (!API_KEY) {
    throw new Error(
      'Gemini API key missing. Tap "SET API KEY" first.'
    );
  }

  const url =
    API_BASE +
    MODEL +
    ":generateContent";

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, API_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
      },

      body: JSON.stringify({
        contents: contents,

        generationConfig: {
          maxOutputTokens: 1200
        }
      }),

      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        "Unknown Gemini API error";

      throw new Error(
        `Gemini API Error ${response.status}: ${errorMessage}`
      );
    }

    const answer = (
      data?.candidates?.[0]?.content?.parts || []
    )
      .map(part => part.text || "")
      .join("\n")
      .trim();

    if (!answer) {
      throw new Error(
        "Gemini returned an empty response. Try another message."
      );
    }

    return answer;

  } catch (error) {

    if (error.name === "AbortError") {
      throw new Error(
        "Connection timeout. Check your internet and try again."
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Network error. Check your internet connection."
      );
    }

    throw error;

  } finally {
    clearTimeout(timeoutId);
  }
}

// =====================================================
// 7. CHAT WITH MEMORY
// =====================================================

async function callGemini(promptText, image = null) {

  const contents = MEMORY.slice(-12).map(item => ({
    role: item.role,
    parts: [{ text: item.text }]
  }));

  const currentParts = [
    { text: promptText }
  ];

  if (image) {
    currentParts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.data
      }
    });
  }

  contents.push({
    role: "user",
    parts: currentParts
  });

  return await geminiRequest(contents);
}

// =====================================================
// 8. VOICE RESPONSE
// =====================================================

function speak(text) {
  if (!("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-IN";
  speech.rate = 1;
  speech.pitch = 1;
  speech.volume = 1;

  window.speechSynthesis.speak(speech);
}

// =====================================================
// 9. VOICE RECOGNITION
// =====================================================

function startVoice() {

  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    addMessage(
      "Voice recognition is not supported by this browser.",
      "system"
    );
    return;
  }

  recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    if (voiceStatus) {
      voiceStatus.textContent = "• LISTENING";
    }

    addMessage("Listening for your command...", "system");
  };

  recognition.onresult = event => {
    const transcript =
      event.results[0][0].transcript;

    if (input) {
      input.value = transcript;
    }

    processUserMessage(transcript);
  };

  recognition.onerror = event => {
    addMessage(
      "Voice error: " + event.error,
      "system"
    );
  };

  recognition.onend = () => {
    if (voiceStatus) {
      voiceStatus.textContent = "• AVAILABLE";
    }
  };

  try {
    recognition.start();
  } catch (error) {
    addMessage(
      "Voice recognition could not start. Try again.",
      "system"
    );
  }
}

// =====================================================
// 10. IMAGE UPLOAD
// =====================================================

function readImage(file) {

  return new Promise((resolve, reject) => {

    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please select an image."));
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      reject(new Error("Image must be smaller than 8 MB."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(",")[1];

      resolve({
        mimeType: file.type,
        data: base64
      });
    };

    reader.onerror = () => {
      reject(new Error("Unable to read the image."));
    };

    reader.readAsDataURL(file);
  });
}

// =====================================================
// 11. INTERNET SEARCH - WIKIPEDIA
// =====================================================

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

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Wikipedia search failed.");
  }

  const data = await response.json();

  return data?.query?.search || [];
}

async function performWebSearch(query) {

  if (!query.trim()) return;

  if (webStatus) {
    webStatus.textContent = "SEARCHING...";
  }

  if (webStatusDiagnostic) {
    webStatusDiagnostic.textContent = "• SEARCHING";
  }

  try {

    const results = await wikipediaSearch(query);

    if (!results.length) {
      addMessage("No Wikipedia results found.", "system");

      if (webStatus) {
        webStatus.textContent = "NO RESULTS FOUND";
      }

      return;
    }

    addMessage(
      "SEARCH RESULTS FOR: " + query,
      "system"
    );

    results.forEach(result => {

      const title = result.title;

      const snippet = result.snippet
        .replace(/<[^>]*>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, "&");

      addMessage(
        title + "\n" + snippet +
        "\nhttps://en.wikipedia.org/wiki/" +
        encodeURIComponent(title.replace(/ /g, "_")),
        "ai"
      );
    });

    if (webStatus) {
      webStatus.textContent =
        results.length + " RESULTS FOUND";
    }

  } catch (error) {

    addMessage(
      "Search error: " + error.message,
      "system"
    );

    if (webStatus) {
      webStatus.textContent = "SEARCH FAILED";
    }

  } finally {

    if (webStatusDiagnostic) {
      webStatusDiagnostic.textContent = "• READY";
    }
  }
}

// =====================================================
// 12. GENERAL WEB TOOLS
// =====================================================

async function fetchJson(url) {

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    10000
  );

  try {

    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    return await response.json();

  } finally {
    clearTimeout(timer);
  }
}

async function handleTools(text) {

  const command = text.trim();

  // Reset API key
  if (/^(reset|change|clear)\s+(api\s+)?key$/i.test(command)) {

    localStorage.removeItem("jarvis_key");
    API_KEY = "";

    setApiKey();

    return API_KEY
      ? "Your API key has been updated."
      : "API key was not changed.";
  }

  // Open YouTube
  if (/^(open\s+)?youtube$/i.test(command)) {

    window.open(
      "https://www.youtube.com/",
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening YouTube.";
  }

  // Open Google
  if (/^(open\s+)?google$/i.test(command)) {

    window.open(
      "https://www.google.com/",
      "_blank",
      "noopener,noreferrer"
    );

    return "Opening Google.";
  }

  // Google search
  const googleMatch = command.match(
    /^(?:google search|search google)(?: for)?\s+(.+)$/i
  );

  if (googleMatch) {

    const query = googleMatch[1];

    window.open(
      "https://www.google.com/search?q=" +
      encodeURIComponent(query),
      "_blank",
      "noopener,noreferrer"
    );

    return "Searching Google for " + query;
  }

  // YouTube search
  const youtubeMatch = command.match(
    /^(?:play|youtube search|search youtube)\s+(.+)$/i
  );

  if (youtubeMatch) {

    const query = youtubeMatch[1];

    window.open(
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(query),
      "_blank",
      "noopener,noreferrer"
    );

    return "Searching YouTube for " + query;
  }

  // Open URL
  const urlMatch = command.match(
    /^(?:open|visit|go to)\s+(https?:\/\/\S+)$/i
  );

  if (urlMatch) {

    try {

      const destination = new URL(urlMatch[1]);

      if (!["http:", "https:"].includes(destination.protocol)) {
        return "Only HTTP and HTTPS links are supported.";
      }

      window.open(
        destination.href,
        "_blank",
        "noopener,noreferrer"
      );

      return "Opening " + destination.hostname;

    } catch (error) {
      return "Invalid website address.";
    }
  }

  // Wikipedia search command
  const wikiMatch = command.match(
    /^(?:search|look up)\s+(.+)$/i
  );

  if (wikiMatch) {

    const results = await wikipediaSearch(wikiMatch[1]);

    if (!results.length) {
      return "No Wikipedia results found.";
    }

    return results.map(item =>
      item.title + ": " +
      item.snippet.replace(/<[^>]*>/g, "")
    ).join("\n\n");
  }

  // Time
  if (/\b(current time|what time|time now)\b/i.test(command)) {
    return "Current time: " +
      new Date().toLocaleTimeString();
  }

  // Date
  if (/\b(today's date|current date|what date)\b/i.test(command)) {
    return "Today's date: " +
      new Date().toLocaleDateString();
  }

  // Weather
  if (/\bweather\b/i.test(command)) {

    try {

      const data = await fetchJson(
        "https://wttr.in/?format=j1"
      );

      const current = data.current_condition?.[0];

      if (!current) {
        return "Weather information unavailable.";
      }

      const area =
        data.nearest_area?.[0]?.areaName?.[0]?.value ||
        "Your area";

      return (
        "Weather in " + area +
        "\nTemperature: " + current.temp_C + "°C" +
        "\nCondition: " +
        current.weatherDesc?.[0]?.value
      );

    } catch (error) {
      return "Unable to fetch weather.";
    }
  }

  // Bitcoin price
  if (/^(bitcoin|btc|crypto)( price)?$/i.test(command)) {

    try {

      const data = await fetchJson(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
      );

      return "Bitcoin price: $" +
        (data.bitcoin?.usd ?? "Unavailable");

    } catch (error) {
      return "Unable to fetch Bitcoin information.";
    }
  }

  // News
  if (/^(latest )?news$/i.test(command)) {

    try {

      const data = await fetchJson(
        "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5"
      );

      const headlines = (data.hits || [])
        .map(item => item.title)
        .filter(Boolean);

      return headlines.length
        ? "Latest technology headlines:\n" +
          headlines.join("\n\n")
        : "No headlines found.";

    } catch (error) {
      return "Unable to fetch news.";
    }
  }

  return null;
}

// =====================================================
// 13. MAIN MESSAGE PROCESSOR
// =====================================================

async function processUserMessage(rawText) {

  const text = String(rawText || "").trim();

  if ((!text && !pendingImage) || isProcessing) {
    return;
  }

  const image = pendingImage;
  pendingImage = null;

  const message = text ||
    "Please describe this image.";

  isProcessing = true;

  if (input) input.value = "";

  if (sendBtn) sendBtn.disabled = true;

  if (aiStatus) {
    aiStatus.textContent = "• CONNECTING";
  }

  if (systemState) {
    systemState.textContent = "PROCESSING";
  }

  addMessage("YOU: " + message, "user");

  remember("user", message);

  try {

    let reply;

    // Don't send images to text-only shortcut handlers.
    const toolReply = image
      ? null
      : await handleTools(message);

    if (toolReply !== null) {

      reply = toolReply;

    } else {

      reply = await callGemini(message, image);
    }

    addMessage("J.A.R.V.I.S: " + reply, "ai");

    remember("model", reply);

    speak(reply);

    if (aiStatus) {
      aiStatus.textContent = "• ONLINE";
    }

    if (systemState) {
      systemState.textContent = "SYSTEM READY";
    }

  } catch (error) {

    console.error("JARVIS ERROR:", error);

    addMessage(
      "SYSTEM ERROR: " + error.message,
      "system"
    );

    if (aiStatus) {
      aiStatus.textContent = "• ERROR";
    }

    if (systemState) {
      systemState.textContent = "CONNECTION ERROR";
    }

  } finally {

    isProcessing = false;

    if (sendBtn) {
      sendBtn.disabled = false;
    }
  }
}

// =====================================================
// 14. SEND BUTTON
// =====================================================

if (sendBtn) {

  sendBtn.addEventListener("click", () => {

    processUserMessage(input?.value || "");

  });
}

// =====================================================
// 15. ENTER KEY
// =====================================================

if (input) {

  input.addEventListener("keydown", event => {

    if (event.key === "Enter" && !event.shiftKey) {

      event.preventDefault();

      processUserMessage(input.value);
    }
  });
}

// =====================================================
// 16. VOICE BUTTON
// =====================================================

if (micBtn) {

  micBtn.addEventListener("click", () => {

    startVoice();

  });
}

// =====================================================
// 17. IMAGE BUTTON
// =====================================================

if (camBtn && imgInput) {

  camBtn.addEventListener("click", () => {

    imgInput.click();

  });
}

if (imgInput) {

  imgInput.addEventListener("change", async () => {

    const file = imgInput.files?.[0];

    if (!file) return;

    try {

      pendingImage = await readImage(file);

      addMessage(
        "Image ready. Enter a question and press EXECUTE.",
        "system"
      );

    } catch (error) {

      addMessage(error.message, "system");

    }

    imgInput.value = "";
  });
}

// =====================================================
// 18. CLEAR CHAT BUTTON
// =====================================================

if (clearBtn) {

  clearBtn.addEventListener("click", () => {

    clearMemory();

    if (chat) {
      chat.innerHTML = "";
    }

    pendingImage = null;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    addMessage("Chat memory cleared.", "system");

    if (memoryStatus) {
      memoryStatus.textContent = "• ACTIVE";
    }
  });
}

// =====================================================
// 19. SET API KEY BUTTON
// =====================================================

if (setKeyBtn) {

  setKeyBtn.addEventListener("click", () => {

    setApiKey();

  });
}

// =====================================================
// 20. INTERNET SEARCH BUTTON
// ============
