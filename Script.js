
/* ==========================================
   J.A.R.V.I.S MOBILE EDITION
   Complete Assistant Engine
   ========================================== */

"use strict";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const CONFIG = {
    model: "gemini-3.5-flash",
    apiVersion: "v1beta",
    memoryKey: "jarvis_memory",
    apiKeyStorage: "jarvis_key",
    maxHistory: 12
};

let API_KEY = localStorage.getItem(CONFIG.apiKeyStorage) || "";

if (!API_KEY) {
    API_KEY = prompt("Enter your Gemini API Key:") || "";
    if (API_KEY.trim()) {
        localStorage.setItem(CONFIG.apiKeyStorage, API_KEY.trim());
        API_KEY = API_KEY.trim();
    }
}

// ==========================================
// 2. DOM ELEMENTS
// ==========================================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");
const imgInput = document.getElementById("img-input");

// ==========================================
// 3. MEMORY SYSTEM
// ==========================================

let MEMORY = [];

try {
    MEMORY = JSON.parse(
        localStorage.getItem(CONFIG.memoryKey) || "[]"
    );

    if (!Array.isArray(MEMORY)) MEMORY = [];

} catch (error) {
    console.error("Memory loading error:", error);
    MEMORY = [];
}

function saveMemory() {
    try {
        localStorage.setItem(
            CONFIG.memoryKey,
            JSON.stringify(MEMORY)
        );
    } catch (error) {
        console.error("Memory storage error:", error);
        addMessage("Memory storage is full or unavailable.", "system");
    }
}

function addMessage(message, type = "ai") {
    if (!chat) return null;

    const element = document.createElement("div");
    element.className = "msg " + type;
    element.textContent = message;

    chat.appendChild(element);
    chat.scrollTop = chat.scrollHeight;

    return element;
}

// Restore previous conversations
MEMORY.forEach(item => {
    if (item && typeof item.text === "string") {
        addMessage(
            (item.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") +
            item.text,
            item.role === "user" ? "user" : "ai"
        );
    }
});

// ==========================================
// 4. GEMINI AI ENGINE
// ==========================================

async function callGemini(promptText, imageData = null, mimeType = null) {

    if (!API_KEY) {
        throw new Error("Gemini API key is missing. Reload and enter your key.");
    }

    const history = MEMORY
        .slice(-CONFIG.maxHistory)
        .map(item => ({
            role: item.role === "model" ? "model" : "user",
            parts: [{ text: item.text }]
        }));

    const parts = [{ text: promptText }];

    if (imageData && mimeType) {
        parts.push({
            inlineData: {
                mimeType: mimeType,
                data: imageData
            }
        });
    }

    history.push({
        role: "user",
        parts: parts
    });

    const url =
        "https://generativelanguage.googleapis.com/" +
        CONFIG.apiVersion +
        "/models/" +
        CONFIG.model +
        ":generateContent?key=" +
        encodeURIComponent(API_KEY);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{
                    text: "You are J.A.R.V.I.S., a helpful personal AI assistant. Answer clearly, politely and accurately."
                }]
            },
            contents: history,
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Gemini API request failed."
        );
    }

    const answer = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!answer) {
        throw new Error("Gemini returned an empty response.");
    }

    return answer;
}

// ==========================================
// 5. CHAT SYSTEM
// ==========================================

let isThinking = false;

async function askGemini(message) {

    if (isThinking) return;

    const question = message.trim();

    if (!question) return;

    isThinking = true;

    addMessage("YOU: " + question, "user");

    if (input) input.value = "";

    const loading = addMessage(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    if (sendBtn) sendBtn.disabled = true;

    try {
        const reply = await callGemini(question);

        MEMORY.push({
            role: "user",
            text: question
        });

        MEMORY.push({
            role: "model",
            text: reply
        });

        MEMORY = MEMORY.slice(-50);
        saveMemory();

        loading.textContent = "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {
        console.error("Gemini error:", error);

        loading.textContent =
            "J.A.R.V.I.S ERROR: " + error.message;

    } finally {
        isThinking = false;

        if (sendBtn) sendBtn.disabled = false;
    }
}

// Execute button
if (sendBtn) {
    sendBtn.addEventListener("click", () => {
        if (input) askGemini(input.value);
    });
}

// Enter key
if (input) {
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            if (sendBtn) sendBtn.click();
        }
    });
}

// ==========================================
// 6. INTERNET SEARCH ENGINE
// ==========================================

// Create search interface automatically
// if it is not already in index.html.

let searchInput = document.getElementById("web-search-input");
let searchBtn = document.getElementById("web-search-btn");
let searchStatus = document.getElementById("web-search-status");

function createSearchInterface() {

    if (searchInput && searchBtn) return;

    const section = document.createElement("section");
    section.className = "web-search";

    const heading = document.createElement("h2");
    heading.textContent = "INTERNET SEARCH";

    const wrapper = document.createElement("div");
    wrapper.className = "search-box";

    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.id = "web-search-input";
    searchInput.placeholder = "Search the internet...";

    searchBtn = document.createElement("button");
    searchBtn.type = "button";
    searchBtn.id = "web-search-btn";
    searchBtn.textContent = "SEARCH";

    searchStatus = document.createElement("p");
    searchStatus.id = "web-search-status";
    searchStatus.textContent = "WEB SEARCH READY";

    wrapper.append(searchInput, searchBtn);
    section.append(heading, wrapper, searchStatus);

    if (document.querySelector(".input-area")) {
        document.querySelector(".input-area").before(section);
    } else {
        document.body.appendChild(section);
    }
}

createSearchInterface();

function performWebSearch() {

    const query = searchInput.value.trim();

    if (!query) {
        searchStatus.textContent = "ENTER A SEARCH QUERY";
        return;
    }

    searchStatus.textContent = "OPENING GOOGLE SEARCH...";

    const searchURL =
        "https://www.google.com/search?q=" +
        encodeURIComponent(query);

    const opened = window.open(
        searchURL,
        "_blank",
        "noopener,noreferrer"
    );

    if (!opened) {
        searchStatus.textContent =
            "POPUP BLOCKED. ALLOW POPUPS OR OPEN GOOGLE MANUALLY.";

        return;
    }

    searchStatus.textContent = "SEARCH OPENED";
}

if (searchBtn) {
    searchBtn.addEventListener("click", performWebSearch);
}

if (searchInput) {
    searchInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            performWebSearch();
        }
    });
}

// ==========================================
// 7. CAMERA & VISION ENGINE
// ==========================================

if (camBtn && imgInput) {

    camBtn.addEventListener("click", () => {
        imgInput.click();
    });

    imgInput.addEventListener("change", () => {

        const file = imgInput.files?.[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            addMessage("Please select an image file.", "system");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            addMessage("Please choose an image smaller than 5 MB.", "system");
            imgInput.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = async () => {

            const base64 = reader.result.split(",")[1];

            const question = input?.value.trim() ||
                "Describe what you see in this image.";

            if (input) input.value = "";

            await askVision(base64, file.type, question);

            imgInput.value = "";
        };

        reader.onerror = () => {
            addMessage("Could not read the selected image.", "system");
        };

        reader.readAsDataURL(file);
    });
}

async function askVision(base64, mimeType, question) {

    if (isThinking) return;

    isThinking = true;

    addMessage("YOU: [IMAGE] " + question, "user");

    const loading = addMessage(
        "J.A.R.V.I.S: Analyzing image...",
        "ai"
    );

    if (sendBtn) sendBtn.disabled = true;

    try {

        const reply = await callGemini(
            question,
            base64,
            mimeType
        );

        MEMORY.push({
            role: "user",
            text: "[Image] " + question
        });

        MEMORY.push({
            role: "model",
            text: reply
        });

        MEMORY = MEMORY.slice(-50);
        saveMemory();

        loading.textContent = "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {

        console.error("Vision error:", error);

        loading.textContent =
            "VISION ERROR: " + error.message;

    } finally {

        isThinking = false;

        if (sendBtn) sendBtn.disabled = false;
    }
}

// ==========================================
// 8. VOICE RECOGNITION
// ==========================================

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
        addMessage("J.A.R.V.I.S: Listening...", "system");
    };

    recognition.onresult = event => {

        const transcript =
            event.results[0][0].transcript;

        if (input) {
            input.value = transcript;
            askGemini(transcript);
        }
    };

    recognition.onerror = event => {
        addMessage(
            "VOICE ERROR: " + event.error,
            "system"
        );
    };

    recognition.onend = () => {
        if (micBtn) micBtn.disabled = false;
    };
}

if (micBtn) {

    micBtn.addEventListener("click", () => {

        if (!recognition) {
            addMessage(
                "Voice recognition is not supported by this browser.",
                "system"
            );
            return;
        }

        try {
            micBtn.disabled = true;
            recognition.start();

        } catch (error) {
            micBtn.disabled = false;
            addMessage(
                "Microphone error: " + error.message,
                "system"
            );
        }
    });
}

// ==========================================
// 9. TEXT TO SPEECH
// ==========================================

function speak(text) {

    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const cleanText = text
        .replace(/[*#_`]/g, "")
        .slice(0, 4000);

    const speech = new SpeechSynthesisUtterance(cleanText);

    speech.lang = "en-IN";
    speech.rate = 1;
    speech.pitch = 0.9;
    speech.volume = 1;

    window.speechSynthesis.speak(speech);
}

// ==========================================
// 10. CLEAR MEMORY
// ==========================================

if (clearBtn) {

    clearBtn.addEventListener("click", () => {

        const confirmed = confirm(
            "Are you sure you want to clear J.A.R.V.I.S. memory?"
        );

        if (!confirmed) return;

        MEMORY = [];

        localStorage.removeItem(CONFIG.memoryKey);

        if (chat) chat.replaceChildren();

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }

        addMessage(
            "J.A.R.V.I.S: Memory cleared successfully.",
            "system"
        );
    });
}

// ==========================================
// 11. SYSTEM STARTUP
// ==========================================

console.log("J.A.R.V.I.S SYSTEM INITIALIZED");
console.log("AI ENGINE:", API_KEY ? "KEY PRESENT" : "KEY MISSING");
console.log("VOICE ENGINE:", recognition ? "AVAILABLE" : "UNAVAILABLE");
console.log("VISION ENGINE:", camBtn ? "READY" : "UNAVAILABLE");
console.log("WEB SEARCH:", searchBtn ? "READY" : "UNAVAILABLE");

addMessage(
    "J.A.R.V.I.S: System initialized. How can I help you?",
    "system"
);
