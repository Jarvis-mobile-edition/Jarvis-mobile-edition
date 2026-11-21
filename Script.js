
/* ==========================================
   J.A.R.V.I.S MOBILE EDITION
   COMPLETE WORKING JAVASCRIPT
   ========================================== */

"use strict";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const MODEL = "gemini-3.8-flash";

const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const KEY_NAME = "jarvis_key";
const MEMORY_NAME = "jarvis_memory";

let API_KEY = localStorage.getItem(KEY_NAME) || "";
let MEMORY = [];
let busy = false;

// ==========================================
// 2. HTML ELEMENTS
// ==========================================

const $ = id => document.getElementById(id);

const chat = $("chat");
const input = $("msg");

const sendBtn = $("send");
const micBtn = $("mic-btn");
const camBtn = $("cam-btn");
const clearBtn = $("clear-btn");
const keyBtn = $("set-api-key-btn");

const imgInput = $("img-input");

const webInput = $("web-search-input");
const webBtn = $("web-search-btn");
const webResults = $("web-results");
const webStatus = $("web-search-status");

const aiStatus = $("ai-status");
const webStatusIndicator = $("web-status");
const voiceStatus = $("voice-status");
const memoryStatus = $("memory-status");
const systemState = $("system-state");

// ==========================================
// 3. DISPLAY FUNCTIONS
// ==========================================

function setStatus(element, message, online = false) {
    if (!element) return;

    element.textContent = "• " + message;
    element.classList.toggle("on", online);
}

function setState(message) {
    if (systemState) {
        systemState.textContent = message;
    }
}

function addMessage(message, sender = "ai") {
    if (!chat) return;

    const div = document.createElement("div");

    div.className = "msg " + sender;
    div.textContent = message;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function systemMessage(message) {
    addMessage("SYSTEM: " + message, "system");
}

function aiMessage(message) {
    addMessage("J.A.R.V.I.S: " + message, "ai");
}

function userMessage(message) {
    addMessage("YOU: " + message, "user");
}

// ==========================================
// 4. MEMORY
// ==========================================

function loadMemory() {
    try {
        const data = JSON.parse(
            localStorage.getItem(MEMORY_NAME) || "[]"
        );

        MEMORY = Array.isArray(data)
            ? data.filter(item =>
                item &&
                ["user", "model"].includes(item.role) &&
                typeof item.text === "string"
              ).slice(-40)
            : [];

    } catch (error) {
        MEMORY = [];
        localStorage.removeItem(MEMORY_NAME);
    }
}

function saveMemory() {
    MEMORY = MEMORY.slice(-40);

    try {
        localStorage.setItem(
            MEMORY_NAME,
            JSON.stringify(MEMORY)
        );
    } catch (error) {
        console.error("Memory error:", error);
        systemMessage("Browser storage is full.");
    }
}

function displayMemory() {
    MEMORY.forEach(item => {
        if (item.role === "user") {
            userMessage(item.text);
        } else {
            aiMessage(item.text);
        }
    });
}

loadMemory();
displayMemory();

// ==========================================
// 5. DIAGNOSTICS
// ==========================================

function updateDiagnostics() {
    setStatus(
        aiStatus,
        API_KEY ? "KEY SAVED" : "WAITING FOR KEY",
        !!API_KEY
    );

    setStatus(webStatusIndicator, "READY", true);

    const speechAvailable =
        !!(window.SpeechRecognition ||
           window.webkitSpeechRecognition);

    setStatus(
        voiceStatus,
        speechAvailable ? "AVAILABLE" : "NOT SUPPORTED",
        speechAvailable
    );

    setStatus(memoryStatus, "ACTIVE", true);
}

updateDiagnostics();

setState("SYSTEM READY");

// ==========================================
// 6. API KEY SETTINGS
// ==========================================

function setupAPIKey() {
    const entered = prompt(
        "Enter your Gemini API key:"
    );

    if (entered === null) return;

    const key = entered.trim();

    if (!key) {
        systemMessage("API key cannot be empty.");
        return;
    }

    API_KEY = key;

    localStorage.setItem(KEY_NAME, key);

    updateDiagnostics();

    systemMessage("API key saved. Testing connection...");

    testConnection();
}

if (keyBtn) {
    keyBtn.addEventListener("click", setupAPIKey);
}

// ==========================================
// 7. GEMINI API REQUEST
// ==========================================

async function requestGemini(contents) {

    if (!API_KEY) {
        throw new Error(
            "API KEY MISSING. Tap SET API KEY."
        );
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 30000);

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
                    maxOutputTokens: 2048
                }
            }),

            signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data?.error?.message ||
                `HTTP ${response.status}`
            );
        }

        const parts =
            data?.candidates?.[0]?.content?.parts || [];

        const answer = parts
            .filter(part => typeof part.text === "string")
            .map(part => part.text)
            .join("\n")
            .trim();

        if (!answer) {
            throw new Error(
                data?.promptFeedback?.blockReason ||
                "Gemini returned an empty response."
            );
        }

        return answer;

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error(
                "Connection timeout. Check your internet."
            );
        }

        if (error instanceof TypeError) {
            throw new Error(
                "Network or browser connection error. Check your internet and browser console."
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// ==========================================
// 8. CONNECTION TEST
// ==========================================

async function testConnection() {

    if (!API_KEY) {
        systemMessage("Set your API key first.");
        return;
    }

    setState("CONNECTING");

    setStatus(aiStatus, "CONNECTING", false);

    try {
        const answer = await requestGemini([
            {
                role: "user",
                parts: [
                    { text: "Reply only: JARVIS ONLINE" }
                ]
            }
        ]);

        setState("SYSTEM READY");

        setStatus(aiStatus, "ONLINE", true);

        systemMessage("Gemini connection successful.");

        aiMessage(answer);

    } catch (error) {

        setState("CONNECTION ERROR");

        setStatus(aiStatus, "FAILED", false);

        systemMessage(
            "Connection failed: " + error.message
        );
    }
}

// ==========================================
// 9. GEMINI CHAT AND IMAGE
// ==========================================

async function callGemini(imageData = null) {

    const contents = MEMORY.slice(-12).map(item => ({
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

    return requestGemini(contents);
}

// ==========================================
// 10. INTERNET REQUEST HELPER
// ==========================================

async function fetchJSON(url) {

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        15000
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
        clearTimeout(timeout);
    }
}

// ==========================================
// 11. WIKIPEDIA SEARCH
// ==========================================

async function wikipediaSearch(query) {

    const params = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: query,
        srlimit: "5",
        format: "json",
        origin: "*"
    });

    const data = await fetchJSON(
        "https://en.wikipedia.org/w/api.php?" + params
    );

    return data?.query?.search || [];
}

async function runWikipediaSearch(query) {

    if (!query.trim()) {
        if (webStatus) {
            webStatus.textContent = "ENTER A SEARCH QUERY";
        }
        return;
    }

    if (webStatus) {
        webStatus.textContent = "SEARCHING...";
    }

    if (webResults) {
        webResults.replaceChildren();
        webResults.style.display = "block";
    }

    if (webBtn) webBtn.disabled = true;

    try {

        const results = await wikipediaSearch(query);

        if (!results.length) {
            webStatus.textContent = "NO RESULTS FOUND";
            return;
        }

        webStatus.textContent =
            results.length + " RESULTS FOUND";

        results.forEach(result => {

            const card = document.createElement("div");
            card.className = "msg ai";

            const link = document.createElement("a");

            link.textContent = result.title;

            link.href =
                "https://en.wikipedia.org/wiki/" +
                encodeURIComponent(
                    result.title.replace(/ /g, "_")
                );

            link.target = "_blank";
            link.rel = "noopener noreferrer";

            const description = document.createElement("p");

            description.textContent =
                result.snippet
                    .replace(/<[^>]*>/g, "")
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, "&")
                    .replace(/&#039;/g, "'");

            card.appendChild(link);
            card.appendChild(description);

            webResults.appendChild(card);
        });

    } catch (error) {

        webStatus.textContent = "SEARCH FAILED";

        systemMessage(error.message);

    } finally {
        if (webBtn) webBtn.disabled = false;
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

// ==========================================
// 12. WEATHER
// ==========================================

async function getWeather() {

    const data = await fetchJSON(
        "https://wttr.in/?format=j1"
    );

    const current = data?.current_condition?.[0];

    if (!current) {
        throw new Error("Weather unavailable.");
    }

    const area =
        data?.nearest_area?.[0]?.areaName?.[0]?.value ||
        "Your area";

    return (
        "Weather in " + area +
        ": " + current.temp_C + "°C. " +
        (current.weatherDesc?.[0]?.value || "")
    );
}

// ==========================================
// 13. NEWS
// ==========================================

async function getNews() {

    const data = await fetchJSON(
        "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5"
    );

    const titles = (data.hits || [])
        .map(item => item.title)
        .filter(Boolean);

    return titles.length
        ? "Latest headlines:\n" + titles.join("\n")
        : "No headlines found.";
}

// ==========================================
// 14. COMMAND HANDLER
// ==========================================

async function handleCommands(text) {

    const command = text.trim();

    if (/^(time|current time|time now|what time is it)\??$/i.test(command)) {
        return "Current time: " +
            new Date().toLocaleTimeString();
    }

    if (/^(date|today|today's date|current date)\??$/i.test(command)) {
        return "Today's date: " +
            new Date().toLocaleDateString();
    }

    if (/^(weather|what is the weather|what's the weather)\??$/i.test(command)) {
        return await getWeather();
    }

    if (/^(news|latest news|top news)$/i.test(command)) {
        return await getNews();
    }

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

        return "Opening Google search.";
    }

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

    if (/^open google$/i.test(command)) {
        window.open(
            "https://google.com",
            "_blank",
            "noopener,noreferrer"
        );

        return "Opening Google.";
    }

    if (/^open youtube$/i.test(command)) {
        window.open(
            "https://youtube.com",
            "_blank",
            "noopener,noreferrer"
        );

        return "Opening YouTube.";
    }

    const wiki = command.match(
        /^(?:search|look up)\s+(.+)/i
    );

    if (wiki) {
        const results = await wikipediaSearch(wiki[1]);

        if (!results.length) {
            return "No Wikipedia results found.";
        }

        return results.map((item, index) =>
            `${index + 1}. ${item.title}\n` +
            item.snippet.replace(/<[^>]*>/g, "")
        ).join("\n\n");
    }

    return null;
}

// ==========================================
// 15. MAIN MESSAGE PROCESSOR
// ==========================================

async function processMessage(text, imageData = null) {

    text = String(text || "").trim();

    if (!text || busy) return;

    if (!API_KEY) {
        systemMessage("Tap SET API KEY before chatting.");
        return;
    }

    busy = true;

    if (sendBtn) sendBtn.disabled = true;
    if (camBtn) camBtn.disabled = true;

    setState("PROCESSING");

    userMessage(text);

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

            const toolReply = await handleCommands(text);

            reply = toolReply !== null
                ? toolReply
                : await callGemini();
        }

        aiMessage(reply);

        MEMORY.push({
            role: "model",
            text: reply
        });

        saveMemory();

        setState("SYSTEM READY");

    } catch (error) {

        console.error("JARVIS ERROR:", error);

        systemMessage(error.message);

        setState("SYSTEM ERROR");

    } finally {

        busy = false;

        if (sendBtn) sendBtn.disabled = false;
        if (camBtn) camBtn.disabled = false;
    }
}

// ==========================================
// 16. SEND BUTTON
// ==========================================

if (sendBtn && input) {

    sendBtn.addEventListener("click", () => {

        const text = input.value.trim();

        if (!text) return;

        input.value = "";

        processMessage(text);
    });
}

// ==========================================
// 17. ENTER KEY
// ==========================================

if (input) {

    input.addEventListener("keydown", event => {

        if (event.key === "Enter") {

            event.preventDefault();

            if (sendBtn) sendBtn.click();
        }
    });
}

// ==========================================
// 18. CLEAR CHAT
// ==========================================

if (clearBtn) {

    clearBtn.addEventListener("click", () => {

        if (!confirm("Clear all chat memory?")) return;

        MEMORY = [];

        localStorage.removeItem(MEMORY_NAME);

        if (chat) chat.replaceChildren();

        systemMessage("Chat memory cleared.");

        setState("SYSTEM READY");
    });
}

// ==========================================
// 19. VOICE RECOGNITION
// ==========================================

const SpeechAPI =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let recognition = null;

if (SpeechAPI) {

    recognition = new SpeechAPI();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        setStatus(voiceStatus, "LISTENING", true);
        setState("LISTENING");
    };

    recognition.onresult = event => {

        const spoken =
            event.results[0][0].transcript;

        if (input) {
            input.value = spoken;
        }

        systemMessage("Voice recognized: " + spoken);
    };

    recognition.onerror = event => {
        systemMessage("Voice error: " + event.error);
        updateDiagnostics();
        setState("SYSTEM READY");
    };

    recognition.onend = () => {
        updateDiagnostics();
        setState("SYSTEM READY");
    };
}

if (micBtn) {

    micBtn.addEventListener("click", () => {

        if (!recognition) {
            systemMessage(
                "Voice recognition is not supported."
            );
            return;
        }

        try {
            recognition.start();
        } catch (error) {
            systemMessage("Voice is already active.");
        }
    });
}

// ==========================================
// 20. IMAGE ANALYSIS
// ==========================================

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

            if (!file.type.startsWith("image/")) {
                throw new Error("Select a valid image.");
            }

            if (file.size > 5 * 1024 * 1024) {
                throw new Error("Image must be below 5 MB.");
            }

            if (!API_KEY) {
                throw new Error("Set your API key first.");
            }

            const dataURL = await new Promise(
                (resolve, reject) => {

                    const reader = new FileReader();

                    reader.onload = () => resolve(reader.result);

                    reader.onerror = () => reject(
                        new Error("Image reading failed.")
                    );

                    reader.readAsDataURL(file);
                }
            );

            const base64 = String(dataURL).split(",")[1];

            const imageData = {
                mimeType: file.type,
                base64: base64
            };

            const question =
                input?.value.trim() ||
                "Describe this image.";

            if (input) input.value = "";

            await processMessage(question, imageData);

        } catch (error) {

            systemMessage("Image error: "
