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

    // 1. Otváranie okna (FAB)
    if (fabBtn && modalOverlay) {
        fabBtn.addEventListener('click', () => {
            modalOverlay.classList.remove('hidden');
            setTimeout(() => modalOverlay.classList.add('active'), 10);
            
            // Focus do poľa a reset výšky pri otvorení
            if (inputField) {
                setTimeout(() => {
                    inputField.focus();
                    inputField.style.height = '48px'; 
                }, 100);
            }
        });
    }

    // 2. Zatváranie okna
    const closeModal = () => {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('active');
        setTimeout(() => modalOverlay.classList.add('hidden'), 300);
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    
    // Zatvorenie kliknutím mimo okna (na tmavé pozadie)
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // 3. Logika odosielania správ a Auto-Resize
    if (sendBtn && inputField) {
        
        // Funkcia na odoslanie a "sfúknutie" poľa
        const handleSend = () => {
            sendMessage();
            // Reset poľa na 1 riadok
            inputField.style.height = '48px';
            inputField.style.overflowY = 'hidden';
            inputField.focus(); // Udržíme kurzor v poli
        };

        // Kliknutie na ikonu lietadielka
        sendBtn.addEventListener('click', handleSend);

        // Klávesové skratky
        inputField.addEventListener('keydown', (e) => { // Zmena z 'keypress' na 'keydown' pre lepšiu odozvu
            if (e.key === 'Enter' && !e.shiftKey) { 
                // Enter = Odoslať
                e.preventDefault(); // Zabráni vloženiu nového riadku
                handleSend();
            }
            // Shift+Enter = Nový riadok (necháme predvolené správanie)
        });

        // === AUTO-RESIZE LOGIKA (Nafukovanie) ===
        inputField.addEventListener('input', function() {
            // 1. Reset výšky na základ, aby sme zmerali skutočný obsah (ak užívateľ mazal text)
            this.style.height = '48px'; 
            
            // 2. Vypočítame novú výšku podľa obsahu (scrollHeight)
            // Ale neprekročíme 120px (čo je cca max-height v CSS)
            const newHeight = Math.min(this.scrollHeight, 120);
            
            // 3. Nastavíme novú výšku
            this.style.height = newHeight + 'px';

            // 4. Ak text presahuje maximum, zapneme scrollbar
            if (this.scrollHeight > 120) {
                this.style.overflowY = 'auto';
            } else {
                this.style.overflowY = 'hidden';
            }
        });
    }

    // 4. Reset konverzácie
    if (resetBtn) resetBtn.addEventListener('click', resetConversation);
}

async function startNewChatSession() {
    if (!genAIModel) return; // Kontrola modelu z ai_module.js

    const now = new Date();
    
    // Získanie kontextu z DOM (ako v pôvodnom súbore)
    const announcementContainer = document.getElementById('announcement-widget-container');
    const currentAnnouncements = announcementContainer ? announcementContainer.innerText : "Žiadne.";
    const dutyListContainer = document.getElementById('duty-list-items');
    const currentDuty = dutyListContainer ? dutyListContainer.innerText : "Neznáme.";
    const userRole = currentUserContext?.funkcia || "Neznáma";

    // ZMENA: Voláme nový fetchKnowledgeBaseIndex
    const [dbPrompt, dbKnowledgeIndex] = await Promise.all([
        fetchSystemPrompt(),
        fetchKnowledgeBaseIndex()
    ]);

    const baseInstruction = dbPrompt || "Si nápomocný AI asistent pre krízové riadenie.";

    // ZMENA: Vylepšené inštrukcie pre používanie nástroja
    const toolInstructions = `
    
    === PRÁCA S DOKUMENTMI (ON-DEMAND) ===
    Máš prístup k zoznamu (indexu) dokumentov vyššie.
    
    ❗️ KRITICKÉ PRAVIDLÁ PRE ROZHODOVANIE:
    1. Ak sa otázka týka legislatívy alebo postupov, NEODPOVEDAJ Z PAMÄTI.
    2. Namiesto toho vyhľadaj ID dokumentu v indexe.
    3. Tvoja odpoveď v tomto kroku musí byť LEN A LEN príkaz. Žiadne úvody, žiadne "Analýza fázy", žiadne "Používam dokument".
    
    POVINNÝ FORMÁT VÝSTUPU (ak potrebuješ dokument):
    CMD_READ_DOC: ID_DOKUMENTU
    
    (Príklad: Namiesto "Našiel som vyhlášku 220, ID je xy..." napíš LEN "CMD_READ_DOC: xy")
    
    Až keď ti systém doručí obsah dokumentu (v druhom kroku), potom vypíš svoju analýzu a odpoveď pre používateľa.
    
    ${dbKnowledgeIndex}
    `;

    // Zloženie finálneho promptu
    currentSystemInstruction = `
    ${baseInstruction}
    
    === KONTEXT APLIKÁCIE ===
    Dátum: ${now.toLocaleDateString('sk-SK')} ${now.toLocaleTimeString('sk-SK')}
    Oznamy: ${currentAnnouncements}
    Pohotovosť: ${currentDuty}
    Používateľ: ${currentUserContext.meno} (${userRole})
    
    ${toolInstructions}
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
            temperature: 0.2, 
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

    try {
        // 1. Prvé volanie AI
        let responseText = await getAIResponse(userText); 
        
        // 2. Kontrola príkazu CMD_READ_DOC pomocou REGEXU (Bezpečnejšie)
        // Hľadáme vzor: CMD_READ_DOC: (nejaké_znaky_bez_medzery)
        const cmdMatch = responseText.match(/CMD_READ_DOC:\s*([^\s\n\r]+)/);

        if (cmdMatch && cmdMatch[1]) {
            // cmdMatch[1] obsahuje len čisté ID (prvé slovo za dvojbodkou)
            // Odstránime prípadné bodky alebo čiarky na konci, ak ich tam AI dala
            const docId = cmdMatch[1].replace(/[.,;!?)]+$/, "").trim();
            
            console.log(`AI žiada dokument (RAW): ${cmdMatch[0]}`);
            console.log(`AI žiada dokument (CLEAN ID): ${docId}`);
            
            // UX vylepšenie - povieme užívateľovi, čo sa deje (voliteľné)
            // appendMessage(`Analyzujem dokument ID: ${docId}...`, 'ai-system-note');

            // 3. Stiahneme obsah
            const docContent = await fetchDocumentContent(docId);
            
            // 4. Pošleme obsah späť AI
            responseText = await getAIResponse(docContent);
        }

        // 5. Zobrazenie finálnej odpovede
        removeElement(loaderId);
        const formattedText = marked.parse(responseText);
        appendMessage(formattedText, 'ai-bot');

    } catch (error) {
        console.error("Chyba komunikácie:", error);
        removeElement(loaderId);
        appendMessage("Ospravedlňujem sa, nastala chyba pri spracovaní požiadavky.", 'ai-bot');
    }
    
    scrollToBottom();
}

/**
 * Wrapper funkcia pre volanie Gemini (alebo Groq fallbacku)
 * Aby sme nekopírovali kód dvakrát v sendMessage
 */
async function getAIResponse(inputText) {
    let text = "";
    try {
        // Skúsime Gemini
        const result = await chatSession.sendMessage(inputText);
        text = result.response.text();
    } catch (geminiError) {
        console.warn("Gemini fail, skúšam Groq...", geminiError);
        // Fallback na Groq
        if (groqClient) {
            text = await callGroqFallback(inputText);
        } else {
            throw geminiError;
        }
    }
    return text;
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

// === NOVÉ FUNKCIE PRE ON-DEMAND NAČÍTANIE ===

/**
 * Stiahne index dokumentov (Názov, Popis, Kľúčové slová) pre rozhodovanie AI.
 */
async function fetchKnowledgeBaseIndex() {
    if (!firestoreDB) return "";
    
    // Hlavička pre AI, aby vedela, čo číta
    let indexContent = "\n=== DOSTUPNÁ KNIŽNICA DOKUMENTOV (INDEX) ===\n";
    indexContent += "Nasleduje zoznam dostupných smerníc. Obsah nie je načítaný.\n";
    indexContent += "Ak potrebuješ detaily z konkrétneho dokumentu, použi príkaz: CMD_READ_DOC: [ID]\n\n";

    try {
        const snapshot = await firestoreDB.collection('knowledge_base')
            .where('isActive', '==', true)
            .get();

        if (snapshot.empty) return ""; 

        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Ošetrenie, ak by keywords boli pole alebo string, alebo chýbali
            let tags = "";
            if (data.keywords) {
                tags = Array.isArray(data.keywords) ? data.keywords.join(', ') : data.keywords;
            }

            // Formátovanie pre AI
            indexContent += `ID: ${doc.id}\n`;
            indexContent += `NÁZOV: ${data.title}\n`;
            indexContent += `POPIS: ${data.description || "Bez popisu"}\n`;
            if (tags) indexContent += `TAGY: ${tags}\n`; // Pridáme len ak existujú
            indexContent += `-----------------------------------\n`;
        });
        
        return indexContent;
    } catch (e) { 
        console.error("Chyba pri indexovaní KB:", e);
        return ""; 
    }
}

/**
 * 2. Stiahne KONKRÉTNY obsah dokumentu na vyžiadanie.
 */
async function fetchDocumentContent(docId) {
    if (!firestoreDB || !docId) return "CHYBA: Chýba databáza alebo ID.";
    
    // POISTKA: Ak ID obsahuje podozrivé znaky
    if (docId.includes('/') || docId.includes(' ')) {
        console.warn(`Zablokované neplatné ID dokumentu: "${docId}"`);
        return "SYSTÉMOVÁ CHYBA: AI poskytla neplatný formát ID dokumentu. Skúste otázku položiť inak.";
    }

    try {
        console.log(`Sťahujem obsah dokumentu: ${docId}`);
        const docRef = firestoreDB.collection('knowledge_base').doc(docId);
        const docSnap = await docRef.get();
        
        if (docSnap.exists) {
            const data = docSnap.data();

            // === NOVÉ: Príprava odkazov ===
            let linksHtml = '';
            
            // Link na Slov-Lex (ak existuje)
            if (data.slov_lex) {
                linksHtml += `<a href="${data.slov_lex}" target="_blank" class="ai-doc-link" title="Otvoriť v Slov-Lex">Slov-Lex <i class="fas fa-external-link-alt"></i></a>`;
            }

            // Link na Teams/Sharepoint (ak existuje)
            if (data.teams_url) {
                linksHtml += `<a href="${data.teams_url}" target="_blank" class="ai-doc-link" title="Otvoriť dokument">Dokument <i class="fas fa-file-arrow-down"></i></a>`;
            }

            // Obalenie odkazov do kontajnera (ak nejaké sú)
            const linksContainer = linksHtml ? `<div class="ai-citation-links">${linksHtml}</div>` : '';

            return `
=== OBSAH VYŽIADANÉHO DOKUMENTU ===
ID: ${docId}
NÁZOV: ${data.title}
OBSAH:
${data.content}
=== KONIEC DOKUMENTU ===

INŠTRUKCIE PRE ODPOVEĎ:
1. Odpovedz priamo na otázku používateľa s využitím informácií vyššie.
2. ZAKÁZANÉ: Na začiatku odpovede NEPIŠ vety typu "Používam dokument...", "Na základe dokumentu..." ani "Podľa vyhlášky...". Začni rovno faktami.
3. POVINNÉ: Na úplnom konci odpovede vlož PRESNE tento HTML kód (bez úprav):
<div class="ai-citation">
    <div class="ai-citation-text"><i class="fa-solid fa-file-lines"></i> Zdroj: ${data.title}</div>
    ${linksContainer}
</div>
            `;
        } else {
            return `SYSTÉMOVÁ CHYBA: Dokument s ID '${docId}' sa v databáze nenašiel.`;
        }
    } catch (e) {
        console.error("Chyba pri sťahovaní dokumentu:", e);
        return "SYSTÉMOVÁ CHYBA: Nepodarilo sa stiahnuť obsah dokumentu (Firebase Error).";
    }
}