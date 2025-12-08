/* ai_module.js - Legislative Specialist (Strict RAG Version) */
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
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@7.1.0/dist/es/index.js';
import { saveAIIndexToIDB, getAIIndexFromIDB } from './db_service.js';

// Nastavenie Markdownu pre bezpečnosť a formátovanie
marked.use({ breaks: true, gfm: true });

// --- Globálne premenné ---
let chatSession = null;
let genAIModel = null;
let currentUserContext = null;
let firestoreDB = null; 
let currentSystemInstruction = ""; 
let lastUserPrompt = "";

// --- Stav vyhľadávacieho enginu (RAG) ---
let searchEngine = null;
let isIndexBuilt = false;
const AI_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // Cache indexu na 24 hodín

/**
 * Hlavná inicializačná funkcia
 */
export async function initializeAIModule(db, userProfile = null) {
    console.log('Inicializujem AI Legislatívneho Experta...');
    firestoreDB = db; 
    currentUserContext = userProfile || { funkcia: 'Neznámy', meno: 'Používateľ' };
    
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
    if (!firestoreDB) return;

    // Konfigurácia MiniSearch
    searchEngine = new MiniSearch({
        fields: ['title', 'description', 'keywords', 'category'], // Polia na vyhľadávanie
        storeFields: ['title', 'description', 'category', 'id'],  // Polia, ktoré sa vrátia vo výsledku
        searchOptions: {
            boost: { title: 3, keywords: 2, category: 1.5 }, // Váhy relevancie
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
            
            isIndexBuilt = true;
            return;
        }

        // 2. Ak nie je cache, stiahneme z Firebase
        console.log('[RAG] Sťahujem knowledge_base z databázy...');
        const q = query(collection(firestoreDB, 'knowledge_base'), where('isActive', '==', true));
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

        searchEngine.addAll(docs);
        isIndexBuilt = true;
        console.log(`RAG: Zaindexovaných ${docs.length} dokumentov.`);

        // 3. Uložíme do cache
        const serializedIndex = JSON.stringify(searchEngine.toJSON());
        await saveAIIndexToIDB(serializedIndex);

    } catch (e) {
        console.error("RAG Error (Indexovanie):", e);
    }
}

/**
 * Vyhľadá relevantné dokumenty pre System Prompt
 * Nevracia plný obsah, len "Menu" pre AI.
 */
function getRelevantContext(userQuery) {
    if (!searchEngine || !isIndexBuilt || !userQuery) return "";

    // Zoberieme top 5 najrelevantnejších výsledkov
    const results = searchEngine.search(userQuery).slice(0, 5);

    if (results.length === 0) {
        return "V databáze sa nenašli žiadne dokumenty, ktoré by priamo zodpovedali kľúčovým slovám otázky.";
    }

    let contextString = "\n=== DOSTUPNÁ LEGISLATÍVNA DATABÁZA (Nájdené dokumenty) ===\n";
    contextString += "Tu je zoznam dokumentov, ktoré môžu obsahovať odpoveď. Pre prečítanie obsahu použi príkaz CMD_READ_DOC: ID.\n\n";

    results.forEach((res, index) => {
        // OPRAVA: Bezpečné získanie kategórie s predvolenou hodnotou
        const categoryLabel = (res.category && typeof res.category === 'string') 
            ? res.category.toUpperCase() 
            : 'VŠEOBECNÉ';

        contextString += `${index + 1}. [${categoryLabel}] ${res.title}\n`;
        contextString += `   ID: ${res.id}\n`;
        contextString += `   POPIS: ${res.description || 'Bez popisu'}\n`; // Pridaný fallback aj pre popis
        contextString += `   SKÓRE: ${res.score ? res.score.toFixed(2) : 'N/A'}\n`;
        contextString += `-----------------------------------\n`;
    });

    return contextString;
}

/**
 * Nastavenie System Promptu a štart relácie
 */
async function startNewChatSession() {
    if (!genAIModel) return; 

    // Dynamický prompt pre špecialistu
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
    Meno: ${currentUserContext.meno}
    Pozícia: ${currentUserContext.funkcia || 'Neznáma'}
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
            temperature: 0.3, // Nízka teplota pre presnosť faktov
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

    // Otváranie modalu
    if (fabBtn && modalOverlay) {
        fabBtn.addEventListener('click', () => {
            modalOverlay.classList.remove('hidden');
            setTimeout(() => modalOverlay.classList.add('active'), 10);
            if (inputField) setTimeout(() => inputField.focus(), 100);
        });
    }

    // Zatváranie modalu
    const closeModal = () => {
        if (!modalOverlay) return;
        modalOverlay.classList.remove('active');
        setTimeout(() => modalOverlay.classList.add('hidden'), 300);
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    
    // Odoslanie správy
    if (sendBtn && inputField) {
        const handleSend = () => {
            sendMessage();
            // Reset výšky inputu
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

    // Reset
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
    
    // Kontrola relácie
    if (!chatSession) {
        if(genAIModel && firestoreDB) await startNewChatSession();
        if(!chatSession) return;
    }

    // Vykreslenie používateľovej správy
    appendMessage(userText, 'ai-user');
    inputEl.value = '';

    // Placeholder pre odpoveď bota
    const botMsgId = 'ai-msg-' + Date.now();
    appendMessage('<span class="typing-cursor"></span>', 'ai-bot', botMsgId);
    const botMsgElement = document.getElementById(botMsgId);

    try {
        // 1. Získanie kontextu (zoznam dokumentov)
        const context = getRelevantContext(userText);
        
        // 2. Vytvorenie promptu: Kontext + Otázka
        const fullPrompt = context 
            ? `${context}\n\nOTÁZKA POUŽÍVATEĽA:\n${userText}` 
            : userText;
        
        // 3. Odoslanie do AI
        await processGeminiStream(fullPrompt, botMsgElement);

    } catch (error) {
        console.error("Communication Error:", error);
        botMsgElement.innerHTML = "<em>Ospravedlňujem sa, nastala chyba pri spracovaní požiadavky. Skúste to prosím znova.</em>";
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
            
            // Priebežné vykresľovanie (zatiaľ len surový markdown)
            const cursorHtml = '<span class="typing-cursor"></span>';
            element.innerHTML = marked.parse(fullText) + cursorHtml;
            scrollToBottom();
        }

        // --- Analýza odpovede ---
        
        // 1. Hľadáme príkaz CMD_READ_DOC
        const commandRegex = /CMD_READ_DOC:\s*([a-zA-Z0-9_-]+)/;
        const match = fullText.match(commandRegex);

        // Vyčistíme text od príkazu pre finálne zobrazenie (ak tam nejaký text bol)
        const cleanText = fullText.replace(/CMD_READ_DOC:\s*[a-zA-Z0-9_-]+/g, '').trim();
        if (cleanText) {
            element.innerHTML = marked.parse(cleanText);
        }

        // 2. Ak AI žiada dokument
        if (match) {
            const docId = match[1];
            console.log(`[AI] Žiada prečítať dokument ID: ${docId}`);
            
            // Indikácia používateľovi, že AI pracuje
            if (!cleanText) {
                element.innerHTML = `<em>Vyhľadávam podrobnosti v dokumente...</em> <span class="typing-cursor"></span>`;
            } else {
                element.innerHTML += `<br><em>Otváram citovaný zákon...</em> <span class="typing-cursor"></span>`;
            }

            // 3. Stiahnutie obsahu dokumentu
            const docResult = await fetchDocumentContent(docId, lastUserPrompt);
            
            if (docResult.metadata) {
                // Rekurzívne volanie AI s OBSAHOM dokumentu
                // Toto je kľúčový moment: AI dostane text a preformuluje odpoveď
                await processGeminiStream(docResult.prompt, element, docResult.metadata);
                return; // Ukončíme aktuálnu vetvu
            } else {
                element.innerHTML += `<br><br><strong>Chyba:</strong> Dokument sa nepodarilo načítať.`;
            }
        }

        // 3. Finálne ukončenie (ak už nežiada ďalší dokument)
        if (metadata) {
            // Pridáme pätičku so zdrojom
            element.insertAdjacentHTML('beforeend', generateFooterHtml(metadata));
        }

        element.classList.add('finished');
        scrollToBottom();

    } catch (e) {
    console.error("Gemini Error:", e);
    
    let userMessage = "<em>(Došlo k chybe pri generovaní)</em>";

    // Detekcia chyby 429 (Prekročený limit)
    if (e.message.includes('429') || e.message.includes('Quota exceeded')) {
        userMessage = `<br><br>
        <div style="color: #e74c3c; border: 1px solid #e74c3c; padding: 10px; border-radius: 5px; background: rgba(231, 76, 60, 0.1);">
            <strong>⚠️ Systém je preťažený</strong><br>
            Dosiahli ste limit bezplatných požiadaviek pre AI.<br>
            Prosím, počkajte približne <strong>10-20 sekúnd</strong> a skúste to znova.
        </div>`;
    }

    element.innerHTML = marked.parse(fullText) + userMessage;
    }
}

/**
 * Stiahne plný text dokumentu z Firestore a pripraví "Strict Prompt"
 */
async function fetchDocumentContent(docId, originalQuestion) {
    if (!firestoreDB || !docId) return { prompt: "CHYBA: Neplatné ID.", metadata: null };
    
    try {
        const docRef = doc(firestoreDB, 'knowledge_base', docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();

            // Prísny prompt, ktorý donúti AI použiť len tento text
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
    
    // Badge pre kategóriu (napr. ZÁKON, VYHLÁŠKA)
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

    // Hlavný odkaz (Title)
    let titleHtml;
    if (downloadUrl) {
        titleHtml = `<a href="${downloadUrl}" target="_blank" download style="color: var(--color-orange-accent, #ff9f43); text-decoration: underline; font-weight: bold;">
                        ${meta.title} <i class="fas fa-cloud-download-alt"></i>
                     </a>`;
    } else {
        titleHtml = `<strong style="color: var(--color-orange-accent, #ff9f43);">${meta.title}</strong>`;
    }

    // Odkaz na Slov-Lex (ak existuje)
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

// Pomocné funkcie pre DOM
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