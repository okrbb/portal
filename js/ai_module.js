import { AI_CONFIG } from './config.js';
import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai@0.21.0/+esm";
// === NOVÉ: Import OpenAI SDK pre Groq ===
import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.28.0/+esm"; 
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

/* =================================== */
/* MODUL: AI PORADCA (Gemini + Groq Backup) */
/* =================================== */

marked.use({ breaks: true, gfm: true });

let chatSession = null;
let genAIModel = null;
let groqClient = null; // Klient pre zálohu
let currentUserContext = null;
let firestoreDB = null; 
let currentSystemInstruction = ""; // Uložíme si inštrukcie pre prípad fallbacku

export async function initializeAIModule(db, userProfile = null) {
    console.log('Inicializujem AI Poradcu...');

    firestoreDB = db; 
    currentUserContext = userProfile || { funkcia: 'Neznámy', meno: 'Používateľ' };
    
    setupAIInterface();

    try {
        // 1. Inicializácia Gemini (Primary)
        const genAI = new GoogleGenerativeAI(AI_CONFIG.API_KEY);
        genAIModel = genAI.getGenerativeModel({ 
            model: AI_CONFIG.MODEL_NAME
        });

        // 2. Inicializácia Groq (Backup)
        if (AI_CONFIG.GROQ_API_KEY && AI_CONFIG.GROQ_API_KEY.length > 10) {
            groqClient = new OpenAI({
                apiKey: AI_CONFIG.GROQ_API_KEY,
                baseURL: "https://api.groq.com/openai/v1",
                dangerouslyAllowBrowser: true // Nutné pre client-side usage
            });
            console.log("Groq (Backup) je pripravený.");
        }

        await startNewChatSession();
        console.log(`AI Model pripravený (${AI_CONFIG.MODEL_NAME}).`);

    } catch (error) {
        console.error("AI Init Error:", error);
    }
}

// ... (funkcie fetchSystemPrompt, fetchKnowledgeBase a setupAIInterface ostávajú BEZ ZMENY) ...
// SKOPÍRUJTE SI ICH Z PÔVODNÉHO SÚBORU (sú riadky 48 - 128 v pôvodnom kóde)

async function fetchSystemPrompt() {
    if (!firestoreDB) return null;
    try {
        const docRef = firestoreDB.collection('settings').doc('ai_config');
        const docSnap = await docRef.get();
        return docSnap.exists ? docSnap.data().system_prompt : null;
    } catch (e) {
        console.error("Chyba pri sťahovaní promptu:", e);
        return null;
    }
}

async function fetchKnowledgeBase() {
    if (!firestoreDB) return "";
    let kbContent = "\n=== EXTERNÁ ZNALOSTNÁ BÁZA (DOKUMENTY A SMERNICE) ===\n";
    try {
        const snapshot = await firestoreDB.collection('knowledge_base').where('isActive', '==', true).get();
        if (snapshot.empty) return ""; 
        snapshot.forEach(doc => {
            const data = doc.data();
            kbContent += `\n--- DOKUMENT: ${data.title} ---\n${data.content}\n--- KONIEC ---\n`;
        });
        return kbContent;
    } catch (e) { return ""; }
}

function setupAIInterface() {
    const fabBtn = document.getElementById('ai-floating-btn');
    const modalOverlay = document.getElementById('ai-modal-overlay');
    const closeBtn = document.getElementById('ai-close-btn');
    const resetBtn = document.getElementById('ai-reset-btn');
    const sendBtn = document.getElementById('send-ai-btn');
    const inputField = document.getElementById('ai-input');

    if (fabBtn && modalOverlay) {
        fabBtn.addEventListener('click', () => {
            modalOverlay.classList.remove('hidden');
            setTimeout(() => modalOverlay.classList.add('active'), 10);
            if (inputField) setTimeout(() => inputField.focus(), 100);
        });
    }
    const closeModal = () => {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('active');
        setTimeout(() => modalOverlay.classList.add('hidden'), 300);
    };
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    if (sendBtn && inputField) {
        const handleSend = () => sendMessage();
        sendBtn.addEventListener('click', handleSend);
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSend();
        });
    }
    if (resetBtn) resetBtn.addEventListener('click', resetConversation);
}
// ... (KONIEC SKOPÍROVANÝCH FUNKCIÍ) ...


async function startNewChatSession() {
    if (!genAIModel) return;

    const now = new Date();
    
    // Získanie dát z DOMu pre kontext
    const announcementContainer = document.getElementById('announcement-widget-container');
    const currentAnnouncements = announcementContainer ? announcementContainer.innerText : "Žiadne.";
    const dutyListContainer = document.getElementById('duty-list-items');
    const currentDuty = dutyListContainer ? dutyListContainer.innerText : "Neznáme.";
    const userRole = currentUserContext?.funkcia || "Neznáma";

    const [dbPrompt, dbKnowledgeBase] = await Promise.all([
        fetchSystemPrompt(),
        fetchKnowledgeBase()
    ]);

    const baseInstruction = dbPrompt || "Si nápomocný AI asistent pre krízové riadenie.";

    // Uložíme si kompletný prompt do globálnej premennej pre Groq
    currentSystemInstruction = `
    ${baseInstruction}
    
    === KONTEXT APLIKÁCIE ===
    Dátum: ${now.toLocaleDateString('sk-SK')} ${now.toLocaleTimeString('sk-SK')}
    Oznamy: ${currentAnnouncements}
    Pohotovosť: ${currentDuty}
    Používateľ: ${currentUserContext.meno} (${userRole})
    
    ${dbKnowledgeBase}
    `;

    // Štart Gemini Session
    chatSession = genAIModel.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: currentSystemInstruction }], 
            },
            {
                role: "model",
                parts: [{ text: "Rozumiem kontextu a som pripravený pomôcť." }],
            }
        ],
        generationConfig: {
            maxOutputTokens: 8000, 
            temperature: 0.5, 
        },
    });
}

function resetConversation() {
    const messagesArea = document.getElementById('ai-messages-area');
    if (!messagesArea) return;

    messagesArea.innerHTML = '';
    const welcomeMsg = document.createElement('div');
    welcomeMsg.className = 'ai-msg ai-bot';
    welcomeMsg.textContent = 'Konverzácia bola reštartovaná. Ako vám môžem pomôcť?';
    messagesArea.appendChild(welcomeMsg);

    startNewChatSession();
}

async function sendMessage() {
    const inputEl = document.getElementById('ai-input');
    const userText = inputEl.value.trim();

    if (!userText) return;
    
    if (!chatSession) {
        if(genAIModel && firestoreDB) await startNewChatSession();
        if(!chatSession) return;
    }

    appendMessage(userText, 'ai-user');
    inputEl.value = '';

    const loaderId = 'ai-loader-' + Date.now();
    appendMessage('<div class="typing-indicator"><span></span><span></span><span></span></div>', 'ai-bot', loaderId);
    scrollToBottom();

    let responseText = "";
    let usedModel = "Gemini";

    try {
        // === POKUS 1: GEMINI (PRIMARY) ===
        const result = await chatSession.sendMessage(userText);
        responseText = result.response.text();

    } catch (error) {
        console.warn("⚠️ Gemini zlyhalo, prepínam na Groq...", error);
        
        // === POKUS 2: GROQ (FALLBACK) ===
        if (groqClient) {
            try {
                responseText = await callGroqFallback(userText);
                usedModel = "Groq (Llama 3)";
            } catch (groqError) {
                console.error("Aj Groq zlyhal:", groqError);
                responseText = "Ospravedlňujem sa, momentálne sú preťažené oba systémy (Gemini aj Groq). Skúste to prosím o chvíľu.";
            }
        } else {
            responseText = "Chyba spojenia s Gemini a záložný systém nie je nakonfigurovaný.";
        }
    } finally {
        removeElement(loaderId);
    }
    
    // Spracovanie markdownu
    const formattedText = marked.parse(responseText);
    
    // Pridanie informácie o použití záložného modelu (voliteľné)
    const finalContent = usedModel.includes("Groq") 
        ? `${formattedText}<br><small style="color:orange; font-size:0.7em;">(Vygenerované cez záložný systém ${usedModel})</small>` 
        : formattedText;

    appendMessage(finalContent, 'ai-bot');
    scrollToBottom();
}

/**
 * Funkcia na volanie Groq API s kontextom z Gemini
 */
async function callGroqFallback(currentMessage) {
    if (!groqClient) throw new Error("Groq client not initialized");

    // 1. Vytvoríme históriu správ pre OpenAI formát
    // Začneme systémovým promptom
    let messages = [
        { role: "system", content: currentSystemInstruction }
    ];

    // 2. Skúsime vytiahnuť históriu z Gemini session a skonvertovať ju
    if (chatSession && chatSession.getHistory) {
        try {
            const geminiHistory = await chatSession.getHistory();
            
            // Konverzia Gemini history -> OpenAI history
            geminiHistory.forEach(msg => {
                const role = msg.role === 'model' ? 'assistant' : 'user';
                // Ignorujeme prvú správu ak je to len setup system promptu (lebo sme ho už pridali vyššie)
                const text = msg.parts[0].text;
                
                // Pridáme len ak to nie je duplikát system promptu
                if (text !== currentSystemInstruction) {
                    messages.push({ role: role, content: text });
                }
            });
        } catch (e) {
            console.warn("Nepodarilo sa načítať históriu z Gemini, posielam len aktuálnu správu.", e);
        }
    }

    // 3. Pridáme aktuálnu správu používateľa
    messages.push({ role: "user", content: currentMessage });

    // 4. Volanie Groq
    const completion = await groqClient.chat.completions.create({
        messages: messages,
        model: AI_CONFIG.GROQ_MODEL || "llama-3.1-70b-versatile",
        temperature: 0.5,
        max_tokens: 8000
    });

    return completion.choices[0]?.message?.content || "Žiadna odpoveď.";
}

function appendMessage(htmlContent, className, id = null) {
    const messagesArea = document.getElementById('ai-messages-area');
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${className}`;
    if (id) msgDiv.id = id;
    msgDiv.innerHTML = htmlContent;
    messagesArea.appendChild(msgDiv);
    scrollToBottom();
}

function removeElement(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    const messagesArea = document.getElementById('ai-messages-area');
    if(messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
}