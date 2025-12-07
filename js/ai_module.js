/* ai_module.js - Modular SDK v9+ (Client-side RAG with MiniSearch) */
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    query, 
    where 
} from 'firebase/firestore';

import { AI_CONFIG } from './config.js';
import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai@0.21.0/+esm";
import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.28.0/+esm"; 
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@7.1.0/dist/es/index.js';
import { saveAIIndexToIDB, getAIIndexFromIDB } from './db_service.js';

marked.use({ breaks: true, gfm: true });

let chatSession = null;
let genAIModel = null;
let groqClient = null; 
let currentUserContext = null;
let firestoreDB = null; 
let currentSystemInstruction = ""; 
let lastUserPrompt = "";

// --- RAG: Search Engine State ---
let searchEngine = null;
let isIndexBuilt = false;

export async function initializeAIModule(db, userProfile = null) {
    console.log('Inicializujem AI Poradcu (RAG - MiniSearch)...');

    firestoreDB = db; 
    currentUserContext = userProfile || { funkcia: 'Neznámy', meno: 'Používateľ' };
    
    setupAIInterface();

    // 1. Build Local Index (pozadie)
    buildLocalSearchIndex().then(() => {
        console.log("RAG: Lokálny index dokumentov bol vytvorený.");
    });

    try {
        const genAI = new GoogleGenerativeAI(AI_CONFIG.API_KEY);
        genAIModel = genAI.getGenerativeModel({ 
            model: AI_CONFIG.MODEL_NAME
        });

        if (AI_CONFIG.GROQ_API_KEY && AI_CONFIG.GROQ_API_KEY.length > 10) {
            groqClient = new OpenAI({
                apiKey: AI_CONFIG.GROQ_API_KEY,
                baseURL: "https://api.groq.com/openai/v1",
                dangerouslyAllowBrowser: true 
            });
            console.log("Groq (Backup) je pripravený.");
        }

        await startNewChatSession();
        console.log(`AI Model pripravený (${AI_CONFIG.MODEL_NAME}).`);

    } catch (error) {
        console.error("AI Init Error:", error);
    }
}

// Konštanta pre expiráciu cache (napr. 12 hodín pre dokumenty)
const AI_CACHE_DURATION_MS = 12 * 60 * 60 * 1000; 

/**
 * RAG: Vytvorí alebo načíta lokálny vyhľadávací index.
 * Optimalizované pre IndexedDB.
 */
async function buildLocalSearchIndex() {
    if (!firestoreDB) return;

    // Inicializácia MiniSearch inštancie (prázdnej)
    searchEngine = new MiniSearch({
        fields: ['title', 'description', 'keywords'],
        storeFields: ['title', 'description', 'id'],
        searchOptions: {
            boost: { title: 2, keywords: 1.5 },
            fuzzy: 0.2
        }
    });

    try {
        // 1. Pokus o načítanie z IndexedDB
        const cachedData = await getAIIndexFromIDB();
        
        if (cachedData) {
            const { index, timestamp } = cachedData;
            const now = Date.now();
            const ageMinutes = ((now - timestamp) / 1000 / 60).toFixed(1);

            // Ak je cache čerstvá (menej ako 12 hodín)
            if (now - timestamp < AI_CACHE_DURATION_MS) {
                console.log(`[RAG-IDB] Načítavam index z disku (Vek: ${ageMinutes} min).`);
                
                // KĽÚČOVÉ: Načítanie JSONu späť do MiniSearch objektu
                searchEngine = MiniSearch.loadJSON(index, {
                    fields: ['title', 'description', 'keywords'],
                    storeFields: ['title', 'description', 'id'],
                    searchOptions: { boost: { title: 2, keywords: 1.5 }, fuzzy: 0.2 }
                });
                
                isIndexBuilt = true;
                return; // Hotovo, nevoláme Firebase!
            } else {
                console.log(`[RAG-IDB] Index je expirovaný (${ageMinutes} min), prepočítavam...`);
            }
        } else {
            console.log('[RAG-IDB] Index nenájdený v cache, sťahujem z Firebase...');
        }

        // 2. Fallback: Načítanie z Firebase (ak nie je cache alebo je stará)
        const q = query(collection(firestoreDB, 'knowledge_base'), where('isActive', '==', true));
        const snapshot = await getDocs(q);
        
        const docs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            docs.push({
                id: docSnap.id,
                title: data.title || '',
                description: data.description || '',
                keywords: Array.isArray(data.keywords) ? data.keywords.join(' ') : (data.keywords || '')
            });
        });

        // Vloženie dokumentov do MiniSearch
        searchEngine.addAll(docs);
        isIndexBuilt = true;
        console.log(`RAG: Zaindexovaných ${docs.length} dokumentov z DB.`);

        // 3. Uloženie do IndexedDB pre budúce použitie
        const serializedIndex = JSON.stringify(searchEngine.toJSON());
        await saveAIIndexToIDB(serializedIndex);
        console.log('[RAG-IDB] Index úspešne uložený do cache.');

    } catch (e) {
        console.error("RAG Error (Indexovanie):", e);
        // Ak zlyhá cache, pokúsime sa pokračovať aspoň v pamäti bez uloženia
    }
}

/**
 * RAG: Vyhľadá relevantné dokumenty podľa dotazu používateľa
 */
function getRelevantContext(userQuery) {
    if (!searchEngine || !isIndexBuilt || !userQuery) return "";

    // Vyhľadanie top 3 dokumentov
    const results = searchEngine.search(userQuery).slice(0, 3);

    if (results.length === 0) return "";

    let contextString = "\n=== RELEVANTNÉ DOKUMENTY (Nájdené v indexe) ===\n";
    contextString += "Na základe tvojej otázky som našiel tieto potenciálne zdroje. Ak potrebuješ detailný obsah, použi príkaz CMD_READ_DOC: ID.\n\n";

    results.forEach((res, index) => {
        contextString += `${index + 1}. ID: ${res.id}\n`;
        contextString += `   NÁZOV: ${res.title}\n`;
        contextString += `   POPIS: ${res.description}\n`;
        contextString += `   SKÓRE RELEVANCIE: ${res.score.toFixed(2)}\n`;
        contextString += `-----------------------------------\n`;
    });

    return contextString;
}

async function fetchSystemPrompt() {
    if (!firestoreDB) return null;
    try {
        const docRef = doc(firestoreDB, 'settings', 'ai_config');
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data().system_prompt : null;
    } catch (e) {
        console.error("Chyba pri sťahovaní promptu:", e);
        return null;
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
            if (inputField) {
                setTimeout(() => {
                    inputField.focus();
                    inputField.style.height = '48px'; 
                }, 100);
            }
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
        const handleSend = () => {
            sendMessage();
            inputField.style.height = '48px';
            inputField.style.overflowY = 'hidden';
            inputField.focus(); 
        };

        sendBtn.addEventListener('click', handleSend);

        inputField.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                handleSend();
            }
        });

        inputField.addEventListener('input', function() {
            this.style.height = '48px'; 
            const newHeight = Math.min(this.scrollHeight, 120);
            this.style.height = newHeight + 'px';
            if (this.scrollHeight > 120) {
                this.style.overflowY = 'auto';
            } else {
                this.style.overflowY = 'hidden';
            }
        });
    }

    if (resetBtn) resetBtn.addEventListener('click', resetConversation);
}

async function startNewChatSession() {
    if (!genAIModel) return; 

    const now = new Date();
    const announcementContainer = document.getElementById('announcement-widget-container');
    const currentAnnouncements = announcementContainer ? announcementContainer.innerText : "Žiadne.";
    const dutyListContainer = document.getElementById('duty-list-items');
    const currentDuty = dutyListContainer ? dutyListContainer.innerText : "Neznáme.";
    const userRole = currentUserContext?.funkcia || "Neznáma";

    const dbPrompt = await fetchSystemPrompt();

    let baseInstruction = dbPrompt || "Si nápomocný AI asistent pre krízové riadenie.";
    
    baseInstruction = baseInstruction.replace(/\$\{userRole\}/g, userRole);
    baseInstruction = baseInstruction.replace(/\$\{userName\}/g, currentUserContext.meno);

    const toolInstructions = `
    === KNIŽNICA DOKUMENTOV ===
    Máš prístup k internej databáze smerníc.
    Relevantné dokumenty ti budem posielať priamo s otázkou používateľa (Context).
    Ak sa otázka týka legislatívy a v kontexte vidíš relevantný dokument, NEODPOVEDAJ Z PAMÄTI, ale vyžiadaj si jeho obsah.
    
    FORMÁT PRE VYŽIADANIE OBSAHU DOKUMENTU:
    CMD_READ_DOC: ID_DOKUMENTU
    `;

    const roleAdaptationInstructions = `
    === DYNAMICKÁ ADAPTÁCIA ROLY ===
    Prihlásený používateľ je: ${currentUserContext.meno} (${userRole}).
    
    1. Odpovedaj priamo, vecne a v bodoch.
    2. Žiadne "vaty" a zdvorilostné úvody.
    3. Ak nevieš odpoveď na základe kontextu, priznaj to.
    `;

    currentSystemInstruction = `
    ${baseInstruction}
    
    ${roleAdaptationInstructions}

    === KONTEXT APLIKÁCIE ===
    Dátum: ${now.toLocaleDateString('sk-SK')} ${now.toLocaleTimeString('sk-SK')}
    Oznamy: ${currentAnnouncements}
    Pohotovosť: ${currentDuty}
    
    ${toolInstructions}
    `;

    chatSession = genAIModel.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: currentSystemInstruction }], 
            },
            {
                role: "model",
                parts: [{ text: "Rozumiem. Čakám na otázky a kontext dokumentov." }],
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

    lastUserPrompt = userText;
    
    if (!chatSession) {
        if(genAIModel && firestoreDB) await startNewChatSession();
        if(!chatSession) return;
    }

    appendMessage(userText, 'ai-user');
    inputEl.value = '';

    const botMsgId = 'ai-msg-' + Date.now();
    appendMessage('<span class="typing-cursor"></span>', 'ai-bot', botMsgId);
    
    const botMsgElement = document.getElementById(botMsgId);

    try {
        // --- RAG: Získanie kontextu ---
        const context = getRelevantContext(userText);
        
        // Správa pre AI = Kontext + Otázka
        // Kontext používateľovi nezobrazujeme (je interný), ale AI ho vidí
        const fullPrompt = context ? `${context}\n\nOTÁZKA POUŽÍVATEĽA:\n${userText}` : userText;
        
        if (context) {
            console.log("RAG Context odoslaný do AI:", context);
        }

        await processGeminiStream(fullPrompt, botMsgElement);

    } catch (error) {
        console.error("Stream Error:", error);
        if (botMsgElement) botMsgElement.innerHTML = "<em>Ospravedlňujem sa, nastala chyba pri komunikácii. Skúšam záložný systém...</em>";
        
        try {
            const fallbackText = await callGroqFallback(userText);
            if (botMsgElement) botMsgElement.innerHTML = marked.parse(fallbackText);
        } catch (e2) {
            if (botMsgElement) botMsgElement.innerHTML = "<em>Kritická chyba. Skúste reštartovať konverzáciu.</em>";
        }
    }
    
    scrollToBottom();
}

/**
 * Spracuje stream z Gemini.
 */
async function processGeminiStream(inputText, element, metadata = null) {
    let fullText = "";
    
    try {
        const result = await chatSession.sendMessageStream(inputText);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            
            // Priebežné vykresľovanie (bez pätičky zatiaľ)
            const cursorHtml = '<span class="typing-cursor"></span>';
            element.innerHTML = marked.parse(fullText) + cursorHtml;
            scrollToBottom();
        }

        // 1. Vyčistíme text od príkazov CMD_READ_DOC
        const commandRegex = /CMD_READ_DOC:\s*([a-zA-Z0-9_-]+)/g;
        const matches = [...fullText.matchAll(commandRegex)];
        const cleanText = fullText.replace(commandRegex, '').trim();

        // 2. Finálny text bez kurzora
        element.innerHTML = marked.parse(cleanText);

        // 3. Logika pre Dokumenty vs. Finálna odpoveď
        if (matches.length > 0) {
            // AI žiada prečítať dokument
            console.log(`[AI] Detekovaných ${matches.length} dokumentov na čítanie.`);
            
            // Spracujeme prvý nájdený dokument (pre jednoduchosť toku)
            const docId = matches[0][1]; 
            
            try {
                // Stiahneme obsah a POŠLEME AJ PÔVODNÚ OTÁZKU (lastUserPrompt)
                const docResult = await fetchDocumentContent(docId, lastUserPrompt);
                
                if (docResult.metadata) {
                    // Informácia pre používateľa
                    element.innerHTML = `<em>Študujem dokument: ${docResult.metadata.title} k vašej otázke...</em><span class="typing-cursor"></span>`;
                    
                    // Rekurzívne volanie s novým promptom
                    await processGeminiStream(docResult.prompt, element, docResult.metadata);
                    return; // Dôležité: ukončíme túto vetvu, aby nepreblikla stará pätička
                }
            } catch (e) {
                console.error(`Chyba pri načítaní dokumentu ${docId}:`, e);
            }
        }

        // 4. Ak sme tu, znamená to, že je to finálna odpoveď (už žiadne CMD príkazy)
        // Teraz bezpečne pripojíme pätičku (ak máme metadata z predchádzajúceho kroku)
        if (metadata) {
            element.insertAdjacentHTML('beforeend', generateFooterHtml(metadata));
        }

        element.classList.add('finished');
        scrollToBottom();

    } catch (e) {
        console.error("Gemini Error:", e);
        element.innerHTML += "<br><br><em>(Chyba generovania odpovede)</em>";
    }
}

function generateFooterHtml(meta) {
    // Získame URL na stiahnutie (teams_url) a prípadne Slov-Lex
    const downloadUrl = meta.teams_url;
    const slovLexUrl = meta.slov_lex;

    // 1. Vytvorenie hlavného odkazu (Názov dokumentu)
    let titleHtml;
    
    if (downloadUrl) {
        // Ak je link, vytvoríme klikateľný názov s ikonou stiahnutia
        // Pridali sme atribút 'download' a target='_blank'
        titleHtml = `<a href="${downloadUrl}" target="_blank" download style="color: var(--color-orange-accent, #ff9f43); text-decoration: underline; cursor: pointer; font-weight: bold;">
                        ${meta.title} <i class="fas fa-cloud-download-alt"></i>
                     </a>`;
    } else {
        // Ak link nie je, zobrazí sa len tučný text
        titleHtml = `<strong>${meta.title}</strong>`;
    }

    // 2. Voliteľné: Odkaz na Slov-Lex (ak existuje, zobrazí sa pod tým)
    let extraLinks = '';
    if (slovLexUrl) {
        extraLinks = `<div style="margin-left: 24px; margin-top: 4px; font-size: 0.85em;">
                        <a href="${slovLexUrl}" target="_blank" style="color: #cbd5e1; opacity: 0.8; text-decoration: none;">
                           Otvoriť v Slov-Lex <i class="fas fa-external-link-alt" style="font-size: 10px;"></i>
                        </a>
                      </div>`;
    }

    // 3. Výsledné HTML pätičky
    return `
    <div class="ai-citation" style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.15);">
        <div class="ai-citation-text" style="display:flex; flex-direction: column; color:#cbd5e1; font-size:0.95em;">
            <div style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-file-lines" style="color:var(--color-orange-accent, #ff9f43);"></i> 
                Zdroj: ${titleHtml}
            </div>
            ${extraLinks}
        </div>
    </div>`;
}

async function callGroqFallback(currentMessage) {
    if (!groqClient) throw new Error("Groq client not initialized");
    let messages = [{ role: "system", content: currentSystemInstruction }];
    messages.push({ role: "user", content: currentMessage });
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

function scrollToBottom() {
    const messagesArea = document.getElementById('ai-messages-area');
    if(messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
}

/**
 * VRACIA OBJEKT: { prompt: string, metadata: object }
 * Prijíma aj originalQuestion, aby AI nezabudla, na čo odpovedá.
 */
async function fetchDocumentContent(docId, originalQuestion) {
    if (!firestoreDB || !docId) return { prompt: "CHYBA: Chýba databáza alebo ID.", metadata: null };
    
    if (docId.includes('/') || docId.includes(' ')) {
        return { prompt: "SYSTÉMOVÁ CHYBA: Neplatné ID.", metadata: null };
    }

    try {
        console.log(`Sťahujem obsah dokumentu: ${docId}`);
        const docRef = doc(firestoreDB, 'knowledge_base', docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();

            // --- KĽÚČOVÁ ZMENA: Explicitné pripomenutie otázky ---
            const promptText = `
=== NÁSTROJ: OBSAH DOKUMENTU (${data.title}) ===
Používateľ sa pýtal: "${originalQuestion}"

Tvojou úlohou je odpovedať na túto otázku výhradne na základe nižšie uvedeného textu.

TEXT DOKUMENTU:
${data.content}
=== KONIEC DOKUMENTU ===

INŠTRUKCIE PRE ODPOVEĎ:
1. Ignoruj všetko, čo nie je relevantné pre otázku "${originalQuestion}".
2. Ak dokument obsahuje odpoveď, stručne a jasne ju sformuluj.
3. Ak dokument NEODPOVEDÁ na otázku "${originalQuestion}", napíš: "Tento dokument neobsahuje informácie o..."
`;

            const metadata = {
                title: data.title,
                slov_lex: data.slov_lex || null,
                teams_url: data.teams_url || null
            };

            return { prompt: promptText, metadata: metadata };

        } else {
            return { prompt: `SYSTÉMOVÁ CHYBA: Dokument ${docId} sa nenašiel.`, metadata: null };
        }
    } catch (e) {
        return { prompt: "SYSTÉMOVÁ CHYBA: Nepodarilo sa stiahnuť dokument.", metadata: null };
    }
}