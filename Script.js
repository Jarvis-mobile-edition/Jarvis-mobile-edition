
/* ==========================================
   J.A.R.V.I.S MOBILE EDITION
   COMPLETE JAVASCRIPT - VERSION 4
   ========================================== */

// ==========================================
// 1. CONFIGURATION
// ==========================================

const MODEL = "gemini-3.8-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

let API_KEY = localStorage.getItem("jarvis_key") || "";
let MEMORY = [];
let selectedImage = null;
let isProcessing = false;

// ==========================================
// 2. DOM ELEMENTS
// ==========================================

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

const setKeyBtn =
    document.getElementById("set-api-key-btn") ||
    document.getElementById("set-key-btn") ||
    document.getElementById("api-key-btn");

const aiStatus = document.getElementById("ai-status");
const webStatusDiagnostic = document.getElementById("web-status");
const voiceStatus = document.getElementById("voice-status");
const memoryStatus = document.getElementById("memory-status");
const systemState = document.getElementById("system-state");

// ==========================================
// 3. MEMORY SYSTEM
// ==========================================

function loadMemory() {
    try {
        const saved = JSON.parse(
            localStorage.getItem("jarvis_memory") || "[]"
        );

        MEMORY = Array.isArray(saved)
            ? saved.filter(item =>
                item &&
                ["user", "model"].includes(item.role) &&
                typeof item.text === "string"
            ).slice(-40)
            : [];

    } catch (error) {
        MEMORY = [];
        localStorage.removeItem("jarvis_memory");
    }
}

function saveMemory() {
    try {
        localStorage.setItem(
            "jarvis_memory",
            JSON.stringify(MEMORY.slice(-40))
        );
    } catch (error) {
        console.error("Memory save error:", error);
    }
}

function remember(role, text) {
    MEMORY.push({ role, text });
    MEMORY = MEMORY.slice(-40);
    saveMemory();
}

// ==========================================
// 4. CHAT DISPLAY
// ==========================================

function addMessage(text, sender = "ai") {

    if (!chat) {
        console.log(sender + ": " + text);
        return;
    }

    const div = document.createElement("div");

    div.className = "msg " + sender;

    div.textContent = text;

    chat.appendChild(div);

    chat.scrollTop = chat.scrollHeight;
}

function add(text, sender = "ai") {
    addMessage(text, sender);
}

function showSystem(text) {
    addMessage("SYSTEM: " + text, "system");
}

function updateStatus(state) {

    if (aiStatus) {
        aiStatus.textContent = "• " + state;
    }

    if (systemState) {
        systemState.textContent = state;
    }

    if (aiStatus) {
        aiStatus.classList.toggle(
            "on",
            state === "READY"
        );
    }
}

// ==========================================
// 5. INITIALIZE APPLICATION
// ==========================================

loadMemory();

MEMORY.forEach(item => {

    addMessage(
        (item.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") +
        item.text,
        item.role === "user" ? "user" : "ai"
    );

});

if (memoryStatus) {
    memoryStatus.textContent = "• ACTIVE";
}

if (webStatusDiagnostic) {
    webStatusDiagnostic.textContent = "• READY";
}

if (voiceStatus) {
    const supported =
        ("SpeechRecognition" in window) ||
        ("webkitSpeechRecognition" in window);

    voiceStatus.textContent = supported
        ? "• AVAILABLE"
        : "• NOT SUPPORTED";
}

if (API_KEY) {
    updateStatus("READY");
    showSystem("J.A.R.V.I.S online. Gemini API key detected.");
} else {
    updateStatus("WAITING FOR KEY");
    showSystem('System online. Tap "SET API KEY" to connect Gemini.');
}

// ==========================================
// 6. API KEY SETTINGS
// ==========================================

function setApiKey() {

    const newKey = prompt(
        "Enter your Gemini API key:"
    );

    if (newKey === null) return;

    const key = newKey.trim();

    if (!key) {
        showSystem("API key cannot be empty.");
        return;
    }

    API_KEY = key;

    localStorage.setItem("jarvis_key", API_KEY);

    updateStatus("READY");

    showSystem("API key saved. J.A.R.V.I.S is ready.");

}

if (setKeyBtn) {
    setKeyBtn.addEventListener("click", setApiKey);
}

// ==========================================
// 7. NETWORK REQUEST SYSTEM
// ==========================================

async function fetchJSON(url, options = {}, timeout = 20000) {

    const controller = new AbortController();

    const timer = setTimeout(
        () => controller.abort(),
        timeout
    );

    try {

        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {

            const message =
                data?.error?.message ||
                "HTTP error " + response.status;

            throw new Error(message);
        }

        return data;

    } finally {
        clearTimeout(timer);
    }
}

// ==========================================
// 8. GEMINI AI ENGINE
// ==========================================

async function requestGemini(contents) {

    if (!API_KEY) {
        throw new Error(
            'Gemini API key missing. Tap "SET API KEY" first.'
        );
    }

    const data = await fetchJSON(
        API_URL,
        {
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
            })
        },
        60000
    );

    if (data.promptFeedback?.blockReason) {
        throw new Error(
            "Request blocked: " + data.promptFeedback.blockReason
        );
    }

    const parts =
        data?.candidates?.[0]?.content?.parts || [];

    const reply = parts
        .filter(part => typeof part.text === "string")
        .map(part => part.text)
        .join("\n")
        .trim();

    if (!reply) {
        throw new Error(
            "Gemini returned no text. Please try again."
        );
    }

    return reply;
}

// ==========================================
// 9. CHAT WITH MEMORY
// ==========================================

async function callGemini(message) {

    const history = MEMORY.slice(-12).map(item => ({
        role: item.role,
        parts: [{ text: item.text }]
    }));

    return requestGemini([
        ...history,
        {
            role: "user",
            parts: [{ text: message }]
        }
    ]);
}

// ==========================================
// 10. TIME COMMAND
// ==========================================

function getTime() {

    return "Current time: " +
        new Date().toLocaleTimeString();
}

// ==========================================
// 11. DATE COMMAND
// ==========================================

function getDate() {

    return "Today's date: " +
        new Date().toLocaleDateString();
}

// ==========================================
// 12. GOOGLE SEARCH
// ==========================================

function googleSearch(query) {

    const url =
        "https://www.google.com/search?q=" +
        encodeURIComponent(query);

    window.open(url, "_blank", "noopener,noreferrer");

    return "Opening Google search for: " + query;
}

// ==========================================
// 13. YOUTUBE COMMAND
// ==========================================

function youtubeSearch(query) {

    const url =
        "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(query);

    window.open(url, "_blank", "noopener,noreferrer");

    return "Opening YouTube results for: " + query;
}

// ==========================================
// 14. WIKIPEDIA SEARCH
// ==========================================

async function wikipediaSearch(query) {

    const url =
        "https://en.wikipedia.org/w/api.php" +
        "?action=query" +
        "&list=search" +
        "&srsearch=" + encodeURIComponent(query) +
        "&srlimit=3" +
        "&format=json" +
        "&origin=*";

    const data = await fetchJSON(url);

    const results = data?.query?.search || [];

    if (!results.length) {
        return "No Wikipedia results found.";
    }

    return results.map((item, index) => {

        const snippet = item.snippet
            .replace(/<[^>]*>/g, "")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/&#039;/g, "'");

        const pageURL =
            "https://en.wikipedia.org/wiki/" +
            encodeURIComponent(item.title.replace(/ /g, "_"));

        return (
            (index + 1) + ". " +
            item.title + "\n" +
            snippet + "\n" +
            pageURL
        );

    }).join("\n\n");
}

// ==========================================
// 15. WEATHER COMMAND
// ==========================================

async function getWeather(city = "") {

    const url = city
        ? "https://wttr.in/" + encodeURIComponent(city) + "?format=j1"
        : "https://wttr.in/?format=j1";

    const data = await fetchJSON(url);

    const current = data?.current_condition?.[0];

    if (!current) {
        return "Weather information unavailable.";
    }

    const area =
        data?.nearest_area?.[0]?.areaName?.[0]?.value ||
        city ||
        "Your location";

    return (
        "Weather in " + area + "\n" +
        "Temperature: " + current.temp_C + "°C\n" +
        "Condition: " + current.weatherDesc?.[0]?.value + "\n" +
        "Humidity: " + current.humidity + "%\n" +
        "Wind: " + current.windspeedKmph + " km/h"
    );
}

// ==========================================
// 16. NEWS COMMAND
// ==========================================

async function getNews() {

    const data = await fetchJSON(
        "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5"
    );

    const articles = data?.hits || [];

    if (!articles.length) {
        return "No news available right now.";
    }

    return articles.map((item, index) => {

        return (
            (index + 1) + ". " +
            item.title + "\n" +
            item.url
        );

    }).join("\n\n");
}

// ==========================================
// 17. BITCOIN PRICE
// ==========================================

async function getBitcoin() {

    const data = await fetchJSON(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    );

    return "Bitcoin price: $" +
        (data?.bitcoin?.usd ?? "Unavailable");
}

// ==========================================
// 18. QUICK COMMAND ROUTER
// ==========================================

async function handleTools(text) {

    const command = text.trim();

    let match;

    // Reset API key

    if (/^(reset|change|clear)\s+(api\s+)?key$/i.test(command)) {

        localStorage.removeItem("jarvis_key");

        API_KEY = "";

        updateStatus("WAITING FOR KEY");

        setApiKey();

        return "API key settings updated.";
    }

    // Open YouTube

    if (/^(open\s+)?youtube$/i.test(command)) {

        window.open(
            "https://youtube.com",
            "_blank",
            "noopener,noreferrer"
        );

        return "Opening YouTube.";
    }

    // Open Google

    if (/^(open\s+)?google$/i.test(command)) {

        window.open(
            "https://google.com",
            "_blank",
            "noopener,noreferrer"
        );

        return "Opening Google.";
    }

    // Google search

    match = command.match(
        /^(?:google search|search google)(?: for)?\s+(.+)$/i
    );

    if (match) {
        return googleSearch(match[1]);
    }

    // YouTube search

    match = command.match(
        /^(?:play|search youtube for|youtube search for)\s+(.+)$/i
    );

    if (match) {
        return youtubeSearch(match[1]);
    }

    // Time

    if (/^(what is the time|what's the time|current time|time)$/i.test(command)) {
        return getTime();
    }

    // Date

    if (/^(what is the date|today's date|current date|date)$/i.test(command)) {
        return getDate();
    }

    // Weather

    if (/^(weather|what is the weather|what's the weather)$/i.test(command)) {
        return getWeather();
    }

    // Weather in a city

    match = command.match(
        /^(?:weather in|temperature in)\s+(.+)$/i
    );

    if (match) {
        return getWeather(match[1]);
    }

    // News

    if (/^(latest news|news|top news)$/i.test(command)) {
        return getNews();
    }

    // Bitcoin

    if (/^(bitcoin|btc|bitcoin price|crypto price)$/i.test(command)) {
        return getBitcoin();
    }

    // Wikipedia search

    match = command.match(
        /^(?:search|look up|wikipedia search)\s+(.+)$/i
    );

    if (match) {
        return wikipediaSearch(match[1]);
    }

    return null;
}

// ==========================================
// 19. MAIN MESSAGE PROCESSOR
// ==========================================

async function processUserMessage(rawText) {

    const text = String(rawText || "").trim();

    if (!text || isProcessing) return;

    addMessage("YOU: " + text, "user");

    remember("user", text);

    isProcessing = true;

    updateStatus("PROCESSING");

    if (sendBtn) sendBtn.disabled = true;

    try {

        let reply = await handleTools(text);

        if (reply === null) {
            reply = await callGemini(text);
        }

        addMessage("J.A.R.V.I.S: " + reply, "ai");

        remember("model", reply);

        updateStatus("READY");

    } catch (error) {

        console.error("JARVIS ERROR:", error);

        addMessage(
            "SYSTEM ERROR: " +
            (error.message || "Something went wrong."),
            "system"
        );

        updateStatus(
            API_KEY ? "ERROR - CHECK CONNECTION" : "WAITING FOR KEY"
        );

    } finally {

        isProcessing = false;

        if (sendBtn) sendBtn.disabled = false;

    }
}

// ==========================================
// 20. EXECUTE BUTTON
// ==========================================

if (sendBtn && input) {

    sendBtn.addEventListener("click", () => {

        const message = input.value.trim();

        if (!message) return;

        input.value = "";

        processUserMessage(message);

    });

}

// ==========================================
// 21. ENTER KEY
// ==========================================

if (input) {

    input.addEventListener("keydown", event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            if (sendBtn) {
                sendBtn.click();
            } else {
                const message = input.value;
                input.value = "";
                processUserMessage(message);
            }

        }

    });

}

// ==========================================
// 22. CLEAR CHAT
// ==========================================

if (clearBtn) {

    clearBtn.addEventListener("click", () => {

        if (!confirm("Clear all J.A.R.V.I.S chat history?")) {
            return;
        }

        MEMORY = [];

        localStorage.removeItem("jarvis_memory");

        if (chat) {
            chat.innerHTML = "";
        }

        showSystem("Chat history cleared.");

        if (memoryStatus) {
            memoryStatus.textContent = "• ACTIVE";
        }

    });

}

// ==========================================
// 23. VOICE RECOGNITION
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

        if (voiceStatus) {
            voiceStatus.textContent = "• LISTENING";
        }

        if (micBtn) {
            micBtn.textContent = "🔴 LISTENING";
        }

    };

    recognition.onresult = event => {

        const spokenText =
            event.results[0][0].transcript;

        if (input) {
            input.value = spokenText;
        }

        processUserMessage(spokenText);

    };

    recognition.onerror = event => {

        showSystem(
            "Voice recognition error: " + event.error
        );

    };

    recognition.onend = () => {

        if (voiceStatus) {
            voiceStatus.textContent = "• AVAILABLE";
        }

        if (micBtn) {
            micBtn.textContent = "🎤 VOICE";
        }

    };

}

if (micBtn) {

    micBtn.addEventListener("click", () => {

        if (!recognition) {

            showSystem(
                "Voice recognition is not supported in this browser."
            );

            return;
        }

        try {
            recognition.start();
        } catch (error) {
            showSystem("Voice interface is already active.");
        }

    });

}

// ==========================================
// 24. IMAGE UPLOAD BUTTON
// ==========================================

if (camBtn && imgInput) {

    camBtn.addEventListener("click", () => {
        imgInput.click();
    });

}

// ==========================================
// 25. IMAGE CONVERSION
// ==========================================

function fileToBase64(file) {

    return new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {

            const result = String(reader.result);

            resolve(result.split(",")[1]);

        };

        reader.onerror = () => {
            reject(new Error("Unable to read image."));
        };

        reader.readAsDataURL(file);

    });

}

// ==========================================
// 26. IMAGE ANALYSIS
// ==========================================

async function analyzeImage(file) {

    if (!API_KEY) {
        showSystem("Set your Gemini API key before analyzing images.");
        return;
    }

    if (!file || !file.type.startsWith("image/")) {
        showSystem("Please select a valid image.");
        return;
    }

    if (file.size > 8 * 1024 * 1024) {
        showSystem("Image is too large. Choose an image under 8 MB.");
        return;
    }

    updateStatus("ANALYZING IMAGE");

    addMessage("J.A.R.V.I.S: Analyzing your image...", "ai");

    try {

        const base64 = await fileToBase64(file);

        const contents = [
            {
                role: "user",

                parts: [
                    {
                        text: "Please describe this image clearly and helpfully."
                    },

                    {
                        inline_data: {
                            mime_type: file.type,
                            data: base64
                        }
                    }
                ]
            }
        ];

        const reply = await requestGemini(contents);

        addMessage("J.A.R.V.I.S: " + reply, "ai");

        updateStatus("RE
