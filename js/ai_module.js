/* ai_module.js - Legislative Specialist (Store Integrated & Strict RAG) */
import { store } from './store.js'; // CENTRÁLNY STORE
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    query, 
    where 
} from 'firebase/firestore';

// Predpokladáme, že config.js existuje a obsahuje API kľúče
import { AI_CONFIG } from './config.js'; 
import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai@0.21.0/+esm";
import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.28.0/+esm"; 
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@7.1.0/dist/es/index.js';
import { saveAIIndexToIDB, getAIIndexFromIDB } from './db_service.js';

// Nastavenie Markdownu pre bezpečnosť a formátovanie
marked.use({ breaks: true, gfm: true });

// --- Globálne premenné ---
let chatSession = null;
let genAIModel = null;
let groqClient = null; 
let currentSystemInstruction = ""; 
let lastUserPrompt = "";
let allDocumentsMeta = [];

// --- Stav vyhľadávacieho enginu (RAG) ---
let searchEngine = null;
let isIndexBuilt = false;
const AI_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // Cache indexu na 24 hodín

/**
 * Hlavná inicializačná funkcia (Bez parametrov)
 */
export async function initializeAIModule() {
    console.log('Inicializujem AI Legislatívneho Experta (Store verzia)...');
    
    const db = store.getDB();
    if (!db) {
        console.warn("AI Module: DB nie je dostupná.");
        return;
    }

    // Nastavenie UI poslucháčov (tlačidlá, inputy)
    setupAIInterface();

    // 1. Vybudovanie lokálneho indexu (pozadie)
    buildLocalSearchIndex().then(() => {
        console.log("RAG: Legislatívny index je pripravený.");
    });

    try {
        // 2. Inicializácia Gemini
        const genAI = new GoogleGenerativeAI(AI_CONFIG.API_KEY);
        genAIModel = genAI.getGenerativeModel({ 
            model: AI_CONFIG.MODEL_NAME 
        });

        // Inicializácia Groq (Fallback)
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

/**
 * RAG: Vytvorí lokálny vyhľadávací index z Firebase dát (s podporou kategórií)
 */
async function buildLocalSearchIndex() {
    const db = store.getDB();
    if (!db) return;

    // Konfigurácia MiniSearch
    searchEngine = new MiniSearch({
        fields: ['title', 'description', 'keywords', 'category'], 
        storeFields: ['title', 'description', 'category', 'id'],  
        searchOptions: {
            boost: { title: 3, keywords: 2, category: 1.5 }, 
            fuzzy: 0.2,
            prefix: true
        }
    });

    try {
        // 1. Skúsime načítať z IndexedDB (cache)
        const cachedData = await getAIIndexFromIDB();
        const now = Date.now();
        
        if (cachedData && (now - cachedData.timestamp < AI_CACHE_DURATION_MS)) {
            console.log(`[RAG] Načítavam index z cache (vek: ${((now - cachedData.timestamp)/3600000).toFixed(1)}h).`);
            
            searchEngine = MiniSearch.loadJSON(cachedData.index, {
                fields: ['title', 'description', 'keywords', 'category'],
                storeFields: ['title', 'description', 'category', 'id'],
                searchOptions: { boost: { title: 3, keywords: 2, category: 1.5 }, fuzzy: 0.2, prefix: true }
            });

            // Obnovíme aj allDocumentsMeta z cacheovaného indexu
            const allDocs = searchEngine.search(MiniSearch.wildcard);
            allDocumentsMeta = allDocs.map(doc => ({
                id: doc.id,
                title: doc.title,
                description: doc.description,
                category: doc.category
            }));
            
            isIndexBuilt = true;
            console.log(`[RAG] Obnovených ${allDocumentsMeta.length} dokumentov pre zoznam.`);
            return;
        }

        // 2. Ak nie je cache, stiahneme z Firebase
        console.log('[RAG] Sťahujem knowledge_base z databázy...');
        const q = query(collection(db, 'knowledge_base'), where('isActive', '==', true));
        const snapshot = await getDocs(q);
        
        const docs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            docs.push({
                id: docSnap.id,
                title: data.title || '',
                description: data.description || '',
                keywords: Array.isArray(data.keywords) ? data.keywords.join(' ') : (data.keywords || ''),
                category: data.category || 'Všeobecné'
            });
        });

        allDocumentsMeta = docs;

        searchEngine.addAll(docs);
        isIndexBuilt = true;
        console.log(`RAG: Zaindexovaných ${docs.length} dokumentov.`);

        const serializedIndex = JSON.stringify(searchEngine.toJSON());
        await saveAIIndexToIDB(serializedIndex);

    } catch (e) {
        console.error("RAG Error (Indexovanie):", e);
    }
}

/**
 * Vyhľadá relevantné dokumenty pre System Prompt
 */
function getRelevantContext(userQuery) {
    if (!searchEngine || !isIndexBuilt || !userQuery) return "";

    // 1. DETEKCIA ÚMYSLU: Zoznam
    const listKeywords = ['zoznam', 'všetky predpisy', 'všetky zákony', 'obsah databázy', 'aké máš dokumenty'];
    const lowerQuery = userQuery.toLowerCase();
    
    const isListRequest = listKeywords.some(kw => lowerQuery.includes(kw));

    if (isListRequest && allDocumentsMeta.length > 0) {
        let listContext = "\n=== KOMPLETNÝ OBSAH DATABÁZY ===\n";
        listContext += "Používateľ požiadal o prehľad všetkých dostupných dokumentov. Tu je ich zoznam:\n\n";
        
        const byCategory = {};
        allDocumentsMeta.forEach(doc => {
            if (!byCategory[doc.category]) byCategory[doc.category] = [];
            byCategory[doc.category].push(doc.title);
        });

        for (const [cat, titles] of Object.entries(byCategory)) {
            listContext += `Kategória: ${cat.toUpperCase()}\n`;
            titles.forEach(t => listContext += `- ${t}\n`);
            listContext += "\n";
        }
        
        return listContext;
    }

    // 2. ŠTANDARDNÉ VYHĽADÁVANIE (RAG)
    const results = searchEngine.search(userQuery).slice(0, 5);

    if (results.length === 0) {
        return "V databáze sa nenašli žiadne dokumenty, ktoré by priamo zodpovedali kľúčovým slovám otázky.";
    }

    let contextString = "\n=== DOSTUPNÁ LEGISLATÍVNA DATABÁZA (Nájdené dokumenty) ===\n";
    contextString += "Tu je zoznam dokumentov, ktoré môžu obsahovať odpoveď. Pre prečítanie obsahu použi príkaz CMD_READ_DOC: ID.\n\n";

    results.forEach((res, index) => {
        const categoryLabel = (res.category && typeof res.category === 'string') 
            ? res.category.toUpperCase() 
            : 'VŠEOBECNÉ';

        contextString += `${index + 1}. [${categoryLabel}] ${res.title}\n`;
        contextString += `   ID: ${res.id}\n`;
        contextString += `   POPIS: ${res.description || 'Bez popisu'}\n`;
        contextString += `-----------------------------------\n`;
    });

    return contextString;
}

/**
 * Nastavenie System Promptu a štart relácie (Načíta Usera zo Store)
 */
async function startNewChatSession() {
    if (!genAIModel) return; 

    // Získame aktuálneho používateľa zo Store
    const user = store.getUser() || { funkcia: 'Neznámy', meno: 'Používateľ' };

    const baseInstruction = `
    Si špecializovaný AI asistent pre krízové riadenie a legislatívu SR.
    
    Tvojou hlavnou úlohou je odpovedať na otázky POUŽÍVANÍM poskytnutej databázy dokumentov (Context).
    
    === PRAVIDLÁ SPRÁVANIA (STRICT MODE) ===
    1. EXKLUZIVITA ZDROJOV: Na legislatívne otázky odpovedaj IBA na základe textu dokumentov, ktoré si načítaš. Nevymýšľaj si paragrafy z pamäti.
    2. NÁSTROJ "READ DOC": V kontexte uvidíš zoznam relevantných dokumentov (názvy a popisy). Ak si myslíš, že dokument obsahuje odpoveď, musíš si vyžiadať jeho obsah príkazom:
       CMD_READ_DOC: ID_DOKUMENTU
    3. CITÁCIE: Vždy presne cituj zdroj (napr. "Podľa § 3 písm. a) zákona...").
    4. NEVEDOMOSŤ: Ak v databáze nenájdeš odpoveď, napíš: "Ľutujem, ale v dostupnej legislatívnej databáze sa k tejto téme nenachádzajú informácie."
    
    === FORMÁT ODPOVEDE ===
    - Buď stručný, vecný a formálny.
    - Používaj odrážky pre prehľadnosť.
    `;

    currentSystemInstruction = `
    ${baseInstruction}
    
    === POUŽÍVATEĽ ===
    Meno: ${user.displayName || user.meno}
    Pozícia: ${user.funkcia || 'Neznáma'}
    Dátum: ${new Date().toLocaleDateString('sk-SK')}
    `;

    chatSession = genAIModel.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: currentSystemInstruction }], 
            },
            {
                role: "model",
                parts: [{ text: "Rozumiem. Som pripravený pracovať ako legislatívny expert s využitím internej databázy." }],
            }
        ],
        generationConfig: {
            maxOutputTokens: 4000, 
            temperature: 0.3, 
        },
    });
}

// --- UI Funkcie ---

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
    
    if (sendBtn && inputField) {
        const handleSend = () => {
            sendMessage();
            inputField.style.height = 'auto';
            inputField.focus(); 
        };

        sendBtn.addEventListener('click', handleSend);
        inputField.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                handleSend();
            }
        });
    }

    if (resetBtn) resetBtn.addEventListener('click', resetConversation);
}

function resetConversation() {
    const messagesArea = document.getElementById('ai-messages-area');
    if (!messagesArea) return;

    messagesArea.innerHTML = '';
    const welcomeMsg = document.createElement('div');
    welcomeMsg.className = 'ai-msg ai-bot';
    welcomeMsg.innerHTML = 'Legislatívny asistent je pripravený.<br>Zadajte kľúčové slovo alebo otázku (napr. <em>"Aké sú povinnosti starostu pri povodni?"</em>).';
    messagesArea.appendChild(welcomeMsg);

    startNewChatSession();
}

/**
 * Spracovanie odoslania správy používateľom
 */
async function sendMessage() {
    const inputEl = document.getElementById('ai-input');
    const userText = inputEl.value.trim();

    if (!userText) return;

    lastUserPrompt = userText;
    
    // Kontrola relácie (Ak by user refreshol a session zmizla)
    if (!chatSession) {
        if(genAIModel) await startNewChatSession();
        if(!chatSession) return;
    }

    appendMessage(userText, 'ai-user');
    inputEl.value = '';

    const botMsgId = 'ai-msg-' + Date.now();
    appendMessage('<span class="typing-cursor"></span>', 'ai-bot', botMsgId);
    const botMsgElement = document.getElementById(botMsgId);

    try {
        const context = getRelevantContext(userText);
        
        const fullPrompt = context 
            ? `${context}\n\nOTÁZKA POUŽÍVATEĽA:\n${userText}` 
            : userText;
        
        await processGeminiStream(fullPrompt, botMsgElement);

    } catch (error) {
        console.error("Communication Error (Gemini):", error);
        botMsgElement.innerHTML = "<em>Systém Gemini je preťažený. Prepínam na záložný systém (Groq)...</em> <span class=\"typing-cursor\"></span>";
        
        try {
            const fallbackText = await callGroqFallback(lastUserPrompt, getRelevantContext(lastUserPrompt));
            botMsgElement.innerHTML = marked.parse(fallbackText);
            botMsgElement.classList.add('finished');
        } catch (e2) {
            console.error("Critical Error (Both AI failed):", e2);
            botMsgElement.innerHTML = "<em>Ospravedlňujem sa, nastala kritická chyba pri spracovaní požiadavky. Skúste to prosím znova neskôr.</em>";
        }
    }
    
    scrollToBottom();
}

/**
 * Spracovanie streamu odpovede a detekcia príkazov na čítanie dokumentov
 */
async function processGeminiStream(inputText, element, metadata = null) {
    let fullText = "";
    
    try {
        const result = await chatSession.sendMessageStream(inputText);

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            
            const cursorHtml = '<span class="typing-cursor"></span>';
            element.innerHTML = marked.parse(fullText) + cursorHtml;
            scrollToBottom();
        }

        // --- Analýza odpovede ---
        const commandRegex = /CMD_READ_DOC:\s*([a-zA-Z0-9_-]+)/;
        const match = fullText.match(commandRegex);

        const cleanText = fullText.replace(/CMD_READ_DOC:\s*[a-zA-Z0-9_-]+/g, '').trim();
        if (cleanText) {
            element.innerHTML = marked.parse(cleanText);
        }

        // 2. Ak AI žiada dokument
        if (match) {
            const docId = match[1];
            console.log(`[AI] Žiada prečítať dokument ID: ${docId}`);
            
            if (!cleanText) {
                element.innerHTML = `<em>Vyhľadávam podrobnosti v dokumente...</em> <span class="typing-cursor"></span>`;
            } else {
                element.innerHTML += `<br><em>Otváram citovaný zákon...</em> <span class="typing-cursor"></span>`;
            }

            const docResult = await fetchDocumentContent(docId, lastUserPrompt);
            
            if (docResult.metadata) {
                // Rekurzívne volanie s OBSAHOM
                await processGeminiStream(docResult.prompt, element, docResult.metadata);
                return; 
            } else {
                element.innerHTML += `<br><br><strong>Chyba:</strong> Dokument sa nepodarilo načítať.`;
            }
        }

        if (metadata) {
            element.insertAdjacentHTML('beforeend', generateFooterHtml(metadata));
        }

        element.classList.add('finished');
        scrollToBottom();

    } catch (e) {
        throw e;
    }
}

/**
 * Záložná funkcia pre volanie Groq API
 */
async function callGroqFallback(userQuery, contextString) {
    if (!groqClient) throw new Error("Groq client not initialized");

    const fullPrompt = contextString 
            ? `${contextString}\n\nOTÁZKA POUŽÍVATEĽA:\n${userQuery}` 
            : userQuery;

    let messages = [{ role: "system", content: currentSystemInstruction }];
    messages.push({ role: "user", content: fullPrompt });

    try {
        const completion = await groqClient.chat.completions.create({
            messages: messages,
            model: AI_CONFIG.GROQ_MODEL || "llama-3.3-70b-versatile", 
            temperature: 0.5,
            max_tokens: 4000
        });
        
        return completion.choices[0]?.message?.content || "Záložný systém: Žiadna odpoveď.";
    } catch (e) {
        console.error("Groq Fallback Error:", e);
        throw e;
    }
}

/**
 * Stiahne plný text dokumentu z Firestore a pripraví "Strict Prompt"
 */
async function fetchDocumentContent(docId, originalQuestion) {
    const db = store.getDB();
    if (!db || !docId) return { prompt: "CHYBA: Neplatné ID.", metadata: null };
    
    try {
        const docRef = doc(db, 'knowledge_base', docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();

            const promptText = `
=== OBSAH DOKUMENTU: ${data.title} (${data.category}) ===
Popis: ${data.description}

POKYNY PRE AI:
1. Používateľ sa pýtal: "${originalQuestion}"
2. Odpovedz na túto otázku VÝHRADNE použitím nižšie uvedeného textu.
3. Cituj konkrétne časti (napr. §, odsek).
4. Ak text neobsahuje odpoveď, napíš to jasne.

--- ZAČIATOK TEXTU ---
${data.content}
--- KONIEC TEXTU ---
`;

            const metadata = {
                title: data.title,
                category: data.category || 'Dokument',
                slov_lex: data.slov_lex || null,
                teams_url: data.teams_url || null
            };

            return { prompt: promptText, metadata: metadata };

        } else {
            return { prompt: "SYSTÉMOVÁ CHYBA: Dokument nebol nájdený.", metadata: null };
        }
    } catch (e) {
        console.error("Firestore Fetch Error:", e);
        return { prompt: "SYSTÉMOVÁ CHYBA: Zlyhalo pripojenie k databáze.", metadata: null };
    }
}

/**
 * Generovanie HTML pätičky so zdrojmi
 */
function generateFooterHtml(meta) {
    const downloadUrl = meta.teams_url;
    const slovLexUrl = meta.slov_lex;
    
    const categoryBadge = `<span style="
        background-color: #374151; 
        color: #e5e7eb; 
        padding: 2px 6px; 
        border-radius: 4px; 
        font-size: 0.75em; 
        font-weight: 600; 
        margin-right: 8px;
        text-transform: uppercase;
        vertical-align: middle;
    ">${meta.category}</span>`;

    let titleHtml;
    if (downloadUrl) {
        titleHtml = `<a href="${downloadUrl}" target="_blank" download style="color: var(--color-orange-accent, #ff9f43); text-decoration: underline; font-weight: bold;">
                        ${meta.title} <i class="fas fa-cloud-download-alt"></i>
                     </a>`;
    } else {
        titleHtml = `<strong style="color: var(--color-orange-accent, #ff9f43);">${meta.title}</strong>`;
    }

    let extraLinks = '';
    if (slovLexUrl) {
        extraLinks = `<div style="margin-top: 4px; font-size: 0.85em;">
                        <a href="${slovLexUrl}" target="_blank" style="color: #9ca3af; text-decoration: none; display: flex; align-items: center; gap: 5px;">
                           <i class="fas fa-gavel"></i> Otvoriť v Slov-Lex <i class="fas fa-external-link-alt" style="font-size: 0.7em;"></i>
                        </a>
                      </div>`;
    }

    return `
    <div class="ai-citation" style="
        margin-top: 15px; 
        padding-top: 12px; 
        border-top: 1px solid rgba(255,255,255,0.1); 
        background: rgba(0,0,0,0.1);
        padding: 10px;
        border-radius: 6px;
    ">
        <div class="ai-citation-text" style="display:flex; flex-direction: column; color:#cbd5e1; font-size:0.95em;">
            <div style="display:flex; align-items:center; flex-wrap: wrap;">
                ${categoryBadge}
                <span>Zdroj: ${titleHtml}</span>
            </div>
            ${extraLinks}
        </div>
    </div>`;
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