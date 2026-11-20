/* J.A.R.V.I.S MOBILE EDITION
   Gemini chat + Google Search grounding + memory + five supplied tools.
   Security note: a key used in browser JavaScript is visible to site visitors.
   Use a server-side proxy before publishing a real API key publicly.
*/
"use strict";

const CONFIG={model:"gemini-3.8-flash",apiVersion:"v1beta",memoryKey:"jarvis_memory",apiKeyStorage:"jarvis_key",maxHistory:12};
const $=id=>document.getElementById(id);
const chat=$("chat"),input=$("msg"),sendBtn=$("send"),micBtn=$("mic-btn"),camBtn=$("cam-btn"),clearBtn=$("clear-btn"),imgInput=$("img-input"),searchInput=$("web-search-input"),searchBtn=$("web-search-btn"),searchStatus=$("web-search-status");
let API_KEY="",MEMORY=[],isThinking=false,recognition=null,lastGroundingSources=[];

function setStatus(id,text,ok=true){const n=$(id);if(n){n.textContent="• "+text;n.style.color=ok?"#00ff9d":"#ff8585";}}
function addMessage(text,type="ai"){const n=document.createElement("div");n.className="msg "+type;n.textContent=text;chat.appendChild(n);chat.scrollTop=chat.scrollHeight;return n;}
function saveMemory(){try{localStorage.setItem(CONFIG.memoryKey,JSON.stringify(MEMORY.slice(-50)));}catch{addMessage("Browser storage is full; this conversation may not be saved.","error");}}
function loadMemory(){try{const v=JSON.parse(localStorage.getItem(CONFIG.memoryKey)||"[]");MEMORY=Array.isArray(v)?v.filter(x=>x&&(x.role==="user"||x.role==="model")&&typeof x.text==="string"):[];}catch{MEMORY=[];}MEMORY.forEach(x=>addMessage((x.role==="user"?"YOU: ":"J.A.R.V.I.S: ")+x.text,x.role==="user"?"user":"ai"));}
function requestApiKey(){API_KEY=(localStorage.getItem(CONFIG.apiKeyStorage)||"").trim();if(!API_KEY){API_KEY=(prompt("Enter your Gemini API key. Do not use an unrestricted key on a public website:")||"").trim();if(API_KEY)localStorage.setItem(CONFIG.apiKeyStorage,API_KEY);}setStatus("ai-status",API_KEY?"KEY ENTERED":"API KEY MISSING",!!API_KEY);}
function speak(text){if(!("speechSynthesis"in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text).slice(0,3500));u.lang="en-IN";u.rate=1;u.pitch=.95;speechSynthesis.speak(u);}
function appendSources(container,sources){if(!sources.length)return;const box=document.createElement("div");box.className="web-sources";const h=document.createElement("strong");h.textContent="WEB SOURCES";box.appendChild(h);sources.forEach(s=>{const a=document.createElement("a");a.href=s.uri;a.target="_blank";a.rel="noopener noreferrer";a.textContent=s.title||s.uri;box.appendChild(a);});container.appendChild(box);}

async function callGemini(promptText,options={}){
 if(!API_KEY)throw Error("Gemini API key is missing. Reload and enter it.");
 const history=MEMORY.slice(-CONFIG.maxHistory).map(x=>({role:x.role,parts:[{text:x.text}]}));
 const parts=[{text:promptText}];
 if(options.imageData&&options.mimeType)parts.push({inlineData:{mimeType:options.mimeType,data:options.imageData}});
 history.push({role:"user",parts});
 const body={systemInstruction:{parts:[{text:"You are J.A.R.V.I.S., a helpful personal AI assistant. Be accurate, clear and concise. Do not claim actions you did not perform."}]},contents:history,generationConfig:{temperature:0.7,maxOutputTokens:2048}};
 if(options.webSearch)body.tools=[{google_search:{}}];
 const url=`https://generativelanguage.googleapis.com/${CONFIG.apiVersion}/models/${CONFIG.model}:generateContent?key=${encodeURIComponent(API_KEY)}`;
 const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error?.message||`Gemini request failed (${response.status}).`);
 const candidate=data.candidates?.[0],answer=candidate?.content?.parts?.map(p=>p.text||"").join("").trim();
 if(!answer)throw Error("Gemini returned no text. Check model access, quota and safety feedback.");
 lastGroundingSources=(candidate.groundingMetadata?.groundingChunks||[]).map(x=>x.web).filter(x=>x?.uri).filter((x,i,a)=>a.findIndex(y=>y.uri===x.uri)===i);
 return answer;
}

/* The five tools supplied in your original code: time, weather, timer,
   English-to-Telugu translation and YouTube search. */
async function handleTools(text){
 const t=text.toLowerCase();
 if(/\btime\b/.test(t)||t.includes("సమయం"))return "The time is "+new Date().toLocaleTimeString()+", Boss.";
 if(t.includes("weather")||t.includes("వాతావరణం")){
  if(!navigator.geolocation)return "Location is not supported by this browser.";
  return new Promise(resolve=>navigator.geolocation.getCurrentPosition(async p=>{try{const url=`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current_weather=true`;const r=await fetch(url);if(!r.ok)throw Error();const d=await r.json();const w=d.current_weather;if(!w)throw Error();resolve(`It is ${w.temperature}°C now. Wind speed is ${w.windspeed} km/h, Boss.`);}catch{resolve("Weather service is temporarily unavailable.");}},()=>resolve("Location permission is needed for local weather."),{timeout:10000}));
 }
 const m=t.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/);
 if((t.includes("timer")||t.includes("టైమర్"))&&m){const amount=Number(m[1]),unit=m[2],factor=/^(hours?|hrs?)/.test(unit)?3600000:/^(seconds?|secs?)/.test(unit)?1000:60000;if(amount<1||amount>1440)return "Please choose a timer from 1 to 1440 units.";setTimeout(()=>{speak(`Timer completed. ${amount} ${unit}.`);addMessage(`J.A.R.V.I.S: Timer completed (${amount} ${unit}).`,"system");},amount*factor);return `Timer set for ${amount} ${unit}, Boss.`;}
 if(t.startsWith("translate")){const q=text.replace(/^translate\s*(this\s*)?/i,"").trim();if(!q)return "Please provide text to translate.";try{const r=await fetch("https://api.mymemory.translated.net/get?q="+encodeURIComponent(q)+"&langpair=en|te");if(!r.ok)throw Error();const d=await r.json();return "In Telugu: "+(d.responseData?.translatedText||"No translation returned.");}catch{return "Translation service error.";}}
 if(t.startsWith("play ")||t.startsWith("youtube ")){const q=text.replace(/^play\s+/i,"").replace(/^youtube\s*(search\s*)?/i,"").trim();if(q){window.open("https://www.youtube.com/results?search_query="+encodeURIComponent(q),"_blank","noopener,noreferrer");return `Opening YouTube search for ${q}, Boss.`;}}
 return null;
}

async function askJarvis(message,webSearch=false,vision=null){
 const question=String(message||"").trim();if(!question||isThinking)return;
 isThinking=true;addMessage("YOU: "+(vision?"[IMAGE] ":"")+question,"user");input.value="";
 const loading=addMessage(webSearch?"J.A.R.V.I.S: Searching the web...":vision?"J.A.R.V.I.S: Analyzing image...":"J.A.R.V.I.S: Thinking...","ai");
 sendBtn.disabled=true;searchBtn.disabled=true;$("system-state").textContent=webSearch?"WEB SEARCH ACTIVE":"PROCESSING";
 try{
  let reply=null;lastGroundingSources=[];
  if(!webSearch&&!vision)reply=await handleTools(question);
  if(reply===null)reply=await callGemini(question,{webSearch,imageData:vision?.data,mimeType:vision?.mime});
  MEMORY.push({role:"user",text:(vision?"[Image] ":"")+question},{role:"model",text:reply});MEMORY=MEMORY.slice(-50);saveMemory();
  loading.textContent="J.A.R.V.I.S: "+reply;if(webSearch)appendSources(loading,lastGroundingSources);
  if(webSearch)searchStatus.textContent=lastGroundingSources.length?`${lastGroundingSources.length} source(s) found. Answer displayed in chat.`:"Answer displayed in chat; no source links returned.";
  speak(reply);$("system-state").textContent="SYSTEM READY";
 }catch(e){console.error(e);loading.className="msg error";loading.textContent="J.A.R.V.I.S ERROR: "+e.message;$("system-state").textContent="CHECK CONNECTION";if(webSearch)searchStatus.textContent="SEARCH FAILED. CHECK API KEY, MODEL ACCESS OR QUOTA.";}
 finally{isThinking=false;sendBtn.disabled=false;searchBtn.disabled=false;}
}

sendBtn.addEventListener("click",()=>askJarvis(input.value));
input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();askJarvis(input.value);}});
function performWebSearch(){const q=searchInput.value.trim();if(!q){searchStatus.textContent="ENTER A SEARCH QUESTION";return;}searchStatus.textContent="SEARCHING. RESULTS WILL APPEAR IN CHAT.";askJarvis(q,true);}
searchBtn.addEventListener("click",performWebSearch);
searchInput.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();performWebSearch();}});

camBtn.addEventListener("click",()=>imgInput.click());
imgInput.addEventListener("change",()=>{
 const file=imgInput.files?.[0];if(!file)return;
 if(!file.type.startsWith("image/")){addMessage("Please select an image file.","error");imgInput.value="";return;}
 if(file.size>5*1024*1024){addMessage("Choose an image smaller than 5 MB.","error");imgInput.value="";return;}
 const reader=new FileReader();
 reader.onload=()=>{const data=String(reader.result).split(",")[1],q=input.value.trim()||"Describe this image.";askJarvis(q,false,{data,mime:file.type});imgInput.value="";};
 reader.onerror=()=>{addMessage("Could not read that image.","error");imgInput.value="";};
 reader.readAsDataURL(file);
});

const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SpeechRecognition){
 recognition=new SpeechRecognition();recognition.lang="en-IN";recognition.continuous=false;recognition.interimResults=false;setStatus("voice-status","AVAILABLE");
 recognition.onstart=()=>{$("system-state").textContent="LISTENING";};
 recognition.onresult=e=>{const transcript=e.results?.[0]?.[0]?.transcript||"";input.value=transcript;askJarvis(transcript);};
 recognition.onerror=e=>addMessage("VOICE ERROR: "+e.error,"error");
 recognition.onend=()=>{micBtn.disabled=false;$("system-state").textContent="SYSTEM READY";};
}else setStatus("voice-status","NOT SUPPORTED IN THIS BROWSER",false);
micBtn.addEventListener("click",()=>{if(!recognition){addMessage("Voice recognition is not supported in this browser.","system");return;}try{micBtn.disabled=true;recognition.start();}catch(e){micBtn.disabled=false;addMessage("Microphone could not start: "+e.message,"error");}});

clearBtn.addEventListener("click",()=>{if(!confirm("Clear all saved J.A.R.V.I.S. chat memory on this browser?"))return;MEMORY=[];localStorage.removeItem(CONFIG.memoryKey);chat.replaceChildren();if("speechSynthesis"in window)speechSynthesis.cancel();addMessage("J.A.R.V.I.S: Chat memory cleared.","system");});

requestApiKey();loadMemory();setStatus("memory-status","ACTIVE");setStatus("web-status","READY");
addMessage("J.A.R.V.I.S: Systems initialized. How can I help you, Boss?","system");
console.log("J.A.R.V.I.S initialized.");
