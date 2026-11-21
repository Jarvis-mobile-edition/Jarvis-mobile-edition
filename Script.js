// J.A.R.V.I.S MOBILE EDITION
// Browser-only demo. A key entered here is visible to this browser and its owner.

const MODEL = "gemini-3.8-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const MEMORY_KEY = "jarvis_memory";
const KEY_STORAGE = "jarvis_key_session";

const $ = (id) => document.getElementById(id);
const chat = $("chat");
const input = $("msg");
const sendBtn = $("send");
const micBtn = $("mic-btn");
const camBtn = $("cam-btn");
const clearBtn = $("clear-btn");
const keyBtn = $("key-btn");
const imgInput = $("img-input");
const webInput = $("web-search-input");
const webBtn = $("web-search-btn");

let apiKey = sessionStorage.getItem(KEY_STORAGE) || "";
let busy = false;
let pendingImage = null;
let memory = loadMemory();

function loadMemory() {
  try {
    const value = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(x =>
      x && (x.role === "user" || x.role === "model") &&
      Array.isArray(x.parts) &&
      x.parts.every(p => p && typeof p.text === "string")
    ).slice(-30);
  } catch {
    return [];
  }
}

function saveMemory() {
  try {
    // Only text turns are persisted; images are not stored in chat history.
    const safe = memory.filter(turn => turn.parts.every(part => typeof part.text === "string"));
    localStorage.setItem(MEMORY_KEY, JSON.stringify(safe.slice(-30)));
    $("memory-status").textContent = "• ACTIVE";
    $("memory-status").className = "on";
  } catch {
    $("memory-status").textContent = "• STORAGE BLOCKED";
    $("memory-status").className = "warn";
  }
}

function addMessage(text, sender = "ai", imageUrl = null) {
  const div = document.createElement("div");
  div.className = `msg ${sender}`;
  const label = sender === "user" ? "YOU: " : sender === "system" ? "SYSTEM: " : "J.A.R.V.I.S: ";
  const paragraph = document.createElement("div");
  paragraph.textContent = label + text;
  div.appendChild(paragraph);
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "Image attached by user";
    div.appendChild(img);
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function setState(message, aiStatus) {
  $("system-state").textContent = message;
  if (aiStatus) $("ai-status").textContent = aiStatus;
}

function setBusy(value) {
  busy = value;
  sendBtn.disabled = value;
  $("web-search-btn").disabled = value;
  sendBtn.textContent = value ? "WORKING..." : "EXECUTE";
  if (value) setState("PROCESSING", "• CONNECTING");
  else setState("SYSTEM READY", apiKey ? "• ONLINE" : "• WAITING FOR KEY");
}

function askForKey() {
  const entered = window.prompt("Paste your Gemini API key. Do not share this key with anyone:");
  if (entered && entered.trim()) {
    apiKey = entered.trim();
    sessionStorage.setItem(KEY_STORAGE, apiKey);
    $("ai-status").textContent = "• KEY SET";
    $("ai-status").className = "on";
    addMessage("API key set for this browser session.", "system");
  } else {
    apiKey = "";
    sessionStorage.removeItem(KEY_STORAGE);
    $("ai-status").textContent = "• WAITING FOR KEY";
    $("ai-status").className = "warn";
  }
}

async function geminiRequest(contents) {
  if (!apiKey) throw new Error('Gemini API key missing. Tap "SET API KEY" first.');
  const url = `${API_BASE}${MODEL}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map(part => part.text || "")
    .join("\n")
    .trim();
  if (!answer) throw new Error("Gemini returned an empty response. Try again.");
  return answer;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 3500));
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function handleQuickCommand(text) {
  const command = text.trim();
  if (/^(?:what(?:'s| is) the )?(?:current )?time\??$/i.test(command)) {
    return `Current time: ${new Date().toLocaleTimeString()}`;
  }
  if (/^(?:open )?youtube$/i.test(command)) {
    window.open("https://www.youtube.com/", "_blank", "noopener,noreferrer");
    return "Opening YouTube in a new tab.";
  }
  if (/^(?:open )?google$/i.test(command)) {
    window.open("https://www.google.com/", "_blank", "noopener,noreferrer");
    return "Opening Google in a new tab.";
  }
  const google = command.match(/^(?:google search|search google)(?: for)?\s+(.+)$/i);
  if (google) {
    window.open("https://www.google.com/search?q=" + encodeURIComponent(google[1]), "_blank", "noopener,noreferrer");
    return `Opened Google results for: ${google[1]}`;
  }
  const yt = command.match(/^(?:youtube search|search youtube|play)\s+(.+)$/i);
  if (yt) {
    window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(yt[1]), "_blank", "noopener,noreferrer");
    return `Opened YouTube results for: ${yt[1]}`;
  }
  if (/^(?:reset|change|clear) (?:the )?(?:gemini )?api key$/i.test(command)) {
    apiKey = "";
    sessionStorage.removeItem(KEY_STORAGE);
    askForKey();
    return "API key settings updated.";
  }
  return null;
}

async function processMessage(rawText, image = null) {
  const text = String(rawText || "").trim();
  if ((!text && !image) || busy) return;
  if (!apiKey) {
    addMessage('Please set your Gemini API key using "SET API KEY" before chatting.', "system");
    askForKey();
    if (!apiKey) return;
  }

  addMessage(text || "Please describe this image.", "user", image?.preview || null);
  const parts = [];
  if (text) parts.push({ text });
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });

  setBusy(true);
  try {
    const quickReply = image ? null : await handleQuickCommand(text);
    let reply;
    if (quickReply !== null) {
      reply = quickReply;
    } else {
      const contents = memory.slice(-16);
      contents.push({ role: "user", parts });
      reply = await geminiRequest(contents);
      memory.push({ role: "user", parts: [{ text: text || "Please describe the attached image." }] });
      memory.push({ role: "model", parts: [{ text: reply }] });
      memory = memory.slice(-30);
      saveMemory();
    }
    addMessage(reply, "ai");
    speak(reply);
  } catch (error) {
    console.error(error);
    addMessage(`Error: ${error.message || "Request failed."}`, "system");
    if (/api key|permission|unauthorized|403/i.test(error.message || "")) {
      $("ai-status").textContent = "• CHECK API KEY";
      $("ai-status").className = "warn";
    }
  } finally {
    setBusy(false);
  }
}

function sendCurrentMessage() {
  const text = input.value;
  if (!text.trim()) return;
  input.value = "";
  processMessage(text, pendingImage);
  pendingImage = null;
}

sendBtn.addEventListener("click", sendCurrentMessage);
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendCurrentMessage();
  }
});

clearBtn.addEventListener("click", () => {
  memory = [];
  localStorage.removeItem(MEMORY_KEY);
  chat.replaceChildren();
  addMessage("Chat history cleared from this browser.", "system");
  $("memory-status").textContent = "• CLEARED";
});

keyBtn.addEventListener("click", askForKey);

webBtn.addEventListener("click", searchWeb);
webInput.addEventListener("keydown", event => {
  if (event.key === "Enter") searchWeb();
});

async function searchWeb() {
  const query = webInput.value.trim();
  if (!query) {
    $("web-search-status").textContent = "ENTER A SEARCH TERM FIRST";
    return;
  }
  const status = $("web-search-status");
  const resultsBox = $("web-results");
  status.textContent = "SEARCHING WIKIPEDIA...";
  resultsBox.replaceChildren();
  resultsBox.classList.add("visible");
  $("web-status").textContent = "• SEARCHING";
  try {
    const url = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(query) + "&srlimit=5&format=json&origin=*";
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    const data = await response.json();
    const results = data?.query?.search || [];
    if (!results.length) {
      status.textContent = "NO RESULTS FOUND";
      return;
    }
    for (const result of results) {
      const item = document.createElement("article");
      item.className = "result-item";
      const link = document.createElement("a");
      link.href = "https://en.wikipedia.org/?curid=" + encodeURIComponent(result.pageid);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = result.title;
      const snippet = document.createElement("p");
      // Wikipedia snippets contain markup; textContent keeps the result safe.
      snippet.textContent = result.snippet.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      item.append(link, snippet);
      resultsBox.appendChild(item);
    }
    status.textContent = `${results.length} RESULT(S) FOUND · WIKIPEDIA`;
  } catch (error) {
    status.textContent = error.message || "SEARCH UNAVAILABLE";
  } finally {
    $("web-status").textContent = "• READY";
  }
}

// Voice input uses the browser's speech recognition feature where supported.
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  $("voice-status").textContent = "• AVAILABLE";
  $("voice-status").className = "on";
  micBtn.addEventListener("click", () => {
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    micBtn.disabled = true;
    $("voice-status").textContent = "• LISTENING";
    recognition.onresult = event => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      input.value = transcript;
      processMessage(transcript, pendingImage);
      pendingImage = null;
    };
    recognition.onerror = event => addMessage(`Voice input error: ${event.error}`, "system");
    recognition.onend = () => {
      micBtn.disabled = false;
      $("voice-status").textContent = "• AVAILABLE";
    };
    recognition.start();
  });
} else {
  $("voice-status").textContent = "• NOT SUPPORTED";
  $("voice-status").className = "warn";
  micBtn.addEventListener("click", () => addMessage("Voice recognition is not supported in this browser. Try a supported browser.", "system"));
}

// Image upload and vision prompt.
camBtn.addEventListener("click", () => imgInput.click());
imgInput.addEventListener("change", async () => {
  const file = imgInput.files?.[0];
  imgInput.value = "";
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    addMessage("Please choose a JPG, PNG, or WEBP image.", "system");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    addMessage("Please choose an image smaller than 5 MB.", "system");
    return;
  }
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.readAsDataURL(file);
    });
    const base64 = String(dataUrl).split(",")[1];
    pendingImage = { base64, mimeType: file.type, preview: dataUrl };
    input.value = "Please describe this image.";
    addMessage("Image selected. Press EXECUTE to send it to J.A.R.V.I.S.", "system", dataUrl);
  } catch (error) {
    addMessage(error.message, "system");
  }
});

// Restore saved text conversation.
for (const turn of memory) {
  const text = turn.parts.map(part => part.text || "").join("\n");
  if (text) addMessage(text, turn.role === "user" ? "user" : "ai");
}
$("memory-status").textContent = "• ACTIVE";
if (apiKey) {
  $("ai-status").textContent = "• KEY SET";
  $("ai-status").className = "on";
} else {
  $("ai-status").textContent = "• WAITING FOR KEY";
  $("ai-status").className = "warn";
}
if (!chat.children.length) addMessage("System online. Set your Gemini API key, then send a message.", "system");
