import { AI_CONFIG } from './config.js';
import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai@0.21.0/+esm";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

/* =================================== */
/* MODUL: AI PORADCA (RAG + Firebase)  */
/* =================================== */

// Konfigurácia marked (aby Enter znamenal nový riadok <br>)
marked.use({
    breaks: true,
    gfm: true
});

let chatSession = null;
let genAIModel = null;
let currentUserContext = null;
let firestoreDB = null; 

export async function initializeAIModule(db, userProfile = null) {
    console.log('Inicializujem AI Poradcu (RAG Mode)...');

    firestoreDB = db; 
    currentUserContext = userProfile || { funkcia: 'Neznámy', meno: 'Používateľ' };
    
    setupAIInterface();

    try {
        const genAI = new GoogleGenerativeAI(AI_CONFIG.API_KEY);
        genAIModel = genAI.getGenerativeModel({ 
            model: AI_CONFIG.MODEL_NAME, 
            tools: [
                {
                    googleSearch: {} 
                }
            ]
        });

        await startNewChatSession();

        console.log(`AI Model pripravený (${AI_CONFIG.MODEL_NAME}). Rola: ${currentUserContext.funkcia}`);
    } catch (error) {
        console.error("AI Init Error:", error);
    }
}

async function fetchSystemPrompt() {
    if (!firestoreDB) return null;
    try {
        const docRef = firestoreDB.collection('settings').doc('ai_config');
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return docSnap.data().system_prompt;
        } else {
            return null;
        }
    } catch (e) {
        console.error("Chyba pri sťahovaní promptu:", e);
        return null;
    }
}

async function fetchKnowledgeBase() {
    if (!firestoreDB) return "";
    let kbContent = "\n=== EXTERNÁ ZNALOSTNÁ BÁZA (DOKUMENTY A SMERNICE) ===\n";
    
    try {
        const snapshot = await firestoreDB.collection('knowledge_base')
                                          .where('isActive', '==', true)
                                          .get();
        
        if (snapshot.empty) {
            return ""; 
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            kbContent += `\n--- DOKUMENT: ${data.title} (${data.category || 'Všeobecné'}) ---\n`;
            kbContent += `${data.content}\n`;
            kbContent += `--- KONIEC DOKUMENTU ---\n`;
        });

        return kbContent;

    } catch (e) {
        console.error("Chyba pri sťahovaní knowledge base:", e);
        return ""; 
    }
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

    if (resetBtn) {
        resetBtn.addEventListener('click', resetConversation);
    }
}

async function startNewChatSession() {
    if (!genAIModel) return;

    const now = new Date();
    const todayDate = now.toLocaleDateString('sk-SK');
    const todayTime = now.toLocaleTimeString('sk-SK');
    
    const announcementContainer = document.getElementById('announcement-widget-container');
    const currentAnnouncements = announcementContainer ? announcementContainer.innerText : "Žiadne aktuálne oznamy.";
    
    const dutyListContainer = document.getElementById('duty-list-items');
    const currentDuty = dutyListContainer ? dutyListContainer.innerText : "Neznáme.";
    
    const userRole = currentUserContext?.funkcia || "Neznáma";

    const [dbPrompt, dbKnowledgeBase] = await Promise.all([
        fetchSystemPrompt(),
        fetchKnowledgeBase()
    ]);

    const baseInstruction = dbPrompt || "Si nápomocný AI asistent.";

    let finalDynamicInstruction = `
    ${baseInstruction}

    === AKTUÁLNY KONTEXT APLIKÁCIE (REALITA) ===
    Dnešný dátum: ${todayDate} (Čas: ${todayTime})
    Aktuálne oznamy: ${currentAnnouncements}
    Aktuálne v pohotovosti: ${currentDuty}
    
    AKTUÁLNY POUŽÍVATEĽ:
    - Meno: ${currentUserContext.meno || 'Neznáme'}
    - Pracovná pozícia: ${userRole}
    
    ${dbKnowledgeBase} 
    
    INŠTRUKCIA K ZNALOSTNEJ BÁZE:
    Odpovedaj štruktúrovane. Používaj odrážky a číslované zoznamy pre prehľadnosť.
    Texty vyššie označené ako "EXTERNÁ ZNALOSTNÁ BÁZA" sú prioritným zdrojom.
    `;

    console.log("AI Prompt pripravený.");

    chatSession = genAIModel.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: finalDynamicInstruction }], 
            },
            {
                role: "model",
                parts: [{ text: "Rozumiem. Som pripravený." }],
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

    // Zobrazenie správy používateľa (nepotrebujeme markdown)
    appendMessage(userText, 'ai-user');
    inputEl.value = '';

    const loaderId = 'ai-loader-' + Date.now();
    appendMessage('<div class="typing-indicator"><span></span><span></span><span></span></div>', 'ai-bot', loaderId);
    scrollToBottom();

    try {
        const result = await chatSession.sendMessage(userText);
        const responseText = result.response.text();
        removeElement(loaderId);
        
        // === ZMENA: Použitie knižnice Marked pre parsovanie ===
        // Toto automaticky spracuje **bold**, *list*, 1. list, tabuľky, atď.
        const formattedText = marked.parse(responseText);

        appendMessage(formattedText, 'ai-bot');

    } catch (error) {
        console.error("AI Error:", error);
        removeElement(loaderId);
        appendMessage("Chyba spojenia. Skúste obnoviť stránku.", 'ai-msg error');
    }
    
    scrollToBottom();
}

function appendMessage(htmlContent, className, id = null) {
    const messagesArea = document.getElementById('ai-messages-area');
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${className}`;
    if (id) msgDiv.id = id;
    
    // Vložíme HTML obsah (Marked vracia HTML reťazec)
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
    if(messagesArea) {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

}
