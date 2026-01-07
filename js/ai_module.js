/* ai_module_contacts.js - Hybridný AI asistent (Lokálne vyhľadávanie + AI Fallback) */
import { store } from './store.js';
import { AI_CONFIG } from './config.js'; 
import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai@0.21.0/+esm";
import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.28.0/+esm"; 
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import { IDs } from './id-registry.js';

// Import pre vyhľadávanie kontaktov
import { searchContactsInCache } from './contacts_module.js';

marked.use({ breaks: true, gfm: true });

// --- Globálne premenné ---
let chatSession = null;
let genAIModel = null;
let groqClient = null; 

const SYSTEM_PROMPT = `
Si špičkový asistent pre vyhľadávanie kontaktov odboru krízového riadenia v Banskej Bystrici.
Všetky informácie čerpáš VÝLUČNE z poskytnutej databázy kontaktov.
Ak neexistujú výsledky v databáze, povedz: "Nenašiel som žiadne výsledky."
Po zobrazení výsledkov UKONČI odpoveď - žiadny ďalší text ani návrhy.
`.trim();

/**
 * POMOCNÁ FUNKCIA: Naformátuje dáta lokálne bez použitia AI
 * Zabezpečuje rovnaký vzhľad ako z Gemini, ale zadarmo a okamžite.
 * ✅ NOVÉ: Podporuje aj formátovanie zamestnancov
 */
function formatLocalContacts(contacts) {
    let htmlResult = "";
    contacts.slice(0, 10).forEach(c => {
        if (c.type === 'employee') {
            // Formátovanie pre zamestnancov
            htmlResult += `### Zamestnanec: ${c.meno || ''} ${c.priezvisko || ''}`.trim() + '\n';
            htmlResult += `- **Oddelenie:** ${c.oddelenie || '---'}\n`;
            htmlResult += `- **Funkcia:** ${c.funkcia || '---'}\n`;
            htmlResult += `- **E-mail:** ${c.mail || '---'}\n`;
            htmlResult += `- **Telefón/Kontakt:** ${c.telefon || '---'}\n\n`;
        } else {
            // Formátovanie pre obce/mestá
            htmlResult += `### Obec/Mesto: ${c.id || '---'}\n`;
            htmlResult += `- **Okres:** ${c.okres || '---'}\n`;
            htmlResult += `- **Starosta:** ${c.starosta || '---'}\n`;
            htmlResult += `- **Bydlisko:** ${c.adresa || '---'}\n`;
            htmlResult += `- **E-mail obec:** ${c.em_o || '---'}\n`;
            htmlResult += `- **E-mail starosta:** ${c.em_s || '---'}\n`;
            htmlResult += `- **Mobil starosta:** ${c.mob_s || '---'}\n`;
            htmlResult += `- **Tel. úrad:** ${c.tc_o || '---'}\n\n`;
        }
        htmlResult += `-----------------------------------\n\n`;
    });
    
    if (contacts.length > 10) {
        htmlResult += `\n*(Nájdených ďalších ${contacts.length - 10} výsledkov - zobrazujem prvých 10)*\n`;
    }
    
    return marked.parse(htmlResult);
}

/**
 * Hlavná inicializačná funkcia
 */
export async function initializeAIModule() {
    console.log('Inicializujem Hybridného AI Asistenta...');
    setupAIInterface();

    try {
        const genAI = new GoogleGenerativeAI(AI_CONFIG.API_KEY);
        genAIModel = genAI.getGenerativeModel({ 
            model: AI_CONFIG.MODEL_NAME,
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }
        });

        if (AI_CONFIG.GROQ_API_KEY && AI_CONFIG.GROQ_API_KEY.length > 10) {
            groqClient = new OpenAI({
                apiKey: AI_CONFIG.GROQ_API_KEY,
                baseURL: "https://api.groq.com/openai/v1",
                dangerouslyAllowBrowser: true 
            });
        }
        await startNewChatSession();
    } catch (error) {
        console.error("AI Init Error:", error);
    }
}

async function startNewChatSession() {
    if (genAIModel) {
        chatSession = genAIModel.startChat({
            history: [],
            generationConfig: { maxOutputTokens: 1500 }
        });
    }
}

/**
 * POMOCNÁ FUNKCIA: Očistí dopyt od "šumových" slov, ktoré by bránili lokálnemu vyhľadaniu.
 * Premení napr. "starosta Vlkanová" na "Vlkanová".
 */
function cleanQuery(query) {
    const noiseWords = [
        "starosta", "starostka", "obec", "mesto", "kontakt", 
        "primator", "primatorka", "na", "hladam", "tel", "email", "cislo"
    ];
    
    let cleaned = query.toLowerCase();
    noiseWords.forEach(word => {
        // Regulárny výraz nahradí celé slová bez ohľadu na veľkosť písmen
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });
    
    return cleaned.trim();
}

/**
 * UPRAVENÁ HLAVNÁ FUNKCIA: Hybridné vyhľadávanie (Lokálne -> Očistené lokálne -> AI)
 */
async function sendMessageToAI(userMessage) {
    if (!userMessage || userMessage.trim() === '') return;

    // 1. Zobrazenie správy používateľa a indikátora načítania
    appendMessage(userMessage, 'user-msg');
    const loadingId = 'ai-thinking-msg';
    appendMessage('<i class="fas fa-circle-notch fa-spin"></i> Hľadám v databáze...', 'assistant-msg', loadingId);

    try {
        // --- KROK A: LOKÁLNE VYHĽADÁVANIE S PÔVODNÝM TEXTOM ---
        let foundContacts = await searchContactsInCache(userMessage);
        
        // --- KROK B: POKUS S OČISTENÝM TEXTOM (Ak prvý pokus zlyhal) ---
        // Toto rieši prípady ako "starosta Vlkanová" alebo "obec Poniky"
        if (!foundContacts || foundContacts.length === 0) {
            const cleanedText = cleanQuery(userMessage);
            if (cleanedText && cleanedText !== userMessage.toLowerCase()) {
                console.log(`Pôvodný dopyt neuspel, skúšam očistený: "${cleanedText}"`);
                foundContacts = await searchContactsInCache(cleanedText);
            }
        }

        // --- KROK C: ZOBRAZENIE LOKÁLNYCH VÝSLEDKOV (Ak sa niečo našlo) ---
        if (foundContacts && foundContacts.length > 0) {
            const formattedHTML = formatLocalContacts(foundContacts);
            document.getElementById(loadingId)?.remove();
            appendMessage(formattedHTML, 'assistant-msg');
            console.log('Výsledok doručený lokálne (zadarmo)');
            return; // Ukončíme funkciu, AI sa vôbec nevolá
        }

        // --- KROK D: AI FALLBACK (Ak lokálne hľadanie definitívne zlyhalo) ---
        console.log('Lokálne hľadanie neúspešné, pýtam sa AI...');
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) {
            loadingElement.innerHTML = '<i class="fas fa-brain"></i> Premýšľam (AI Fallback)...';
        }

        let response;
        try {
            // Skúsime prioritne Gemini
            if (!chatSession) await startNewChatSession();
            const result = await chatSession.sendMessage(userMessage);
            response = marked.parse(result.response.text());
        } catch (geminiError) {
            console.warn("Gemini zlyhalo, skúšam Groq...");
            // Záložný model Groq
            if (groqClient) {
                const completion = await groqClient.chat.completions.create({
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: userMessage }
                    ],
                    model: AI_CONFIG.GROQ_MODEL || "llama-3.3-70b-versatile",
                    temperature: 0.3
                });
                response = marked.parse(completion.choices[0]?.message?.content || "Žiadna odpoveď.");
            } else {
                throw new Error("Žiadny AI model nie je dostupný.");
            }
        }

        document.getElementById(loadingId)?.remove();
        appendMessage(response, 'assistant-msg');

    } catch (error) {
        console.error("Fatal Error:", error);
        document.getElementById(loadingId)?.remove();
        appendMessage(`❌ Nenašiel som žiadne výsledky pre: "${userMessage}"`, 'assistant-msg error-msg');
    }
}

/**
 * Pridá správu do chat area (so sanitizáciou)
 */
async function appendMessage(htmlContent, className, id = null) {
    const area = document.getElementById(IDs.AI.MESSAGES_AREA);
    if (!area) return;
    
    if (!window.DOMPurify) {
        try {
            const { lazyLoader } = await import('./lazy_loader.js');
            await lazyLoader.loadDOMPurify();
        } catch (error) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `ai-msg ${className}`;
            if (id) msgDiv.id = id;
            msgDiv.textContent = htmlContent.replace(/<[^>]*>/g, '');
            area.appendChild(msgDiv);
            area.scrollTop = area.scrollHeight;
            return;
        }
    }
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${className}`;
    if (id) msgDiv.id = id;
    
    msgDiv.innerHTML = DOMPurify.sanitize(htmlContent, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h3', 'hr'],
        ALLOWED_ATTR: ['href', 'target']
    });
    
    area.appendChild(msgDiv);
    area.scrollTop = area.scrollHeight;
}

function setupAIInterface() {
    const ui = {
        btn: document.getElementById(IDs.AI.FLOATING_BTN),
        modal: document.getElementById(IDs.AI.MODAL_OVERLAY),
        close: document.getElementById(IDs.AI.CLOSE_BTN),
        send: document.getElementById(IDs.AI.SEND_BTN),
        input: document.getElementById(IDs.AI.INPUT),
        reset: document.getElementById(IDs.AI.RESET_BTN)
    };

    ui.btn?.addEventListener('click', () => {
        ui.modal.classList.remove('hidden');
        setTimeout(() => ui.modal.classList.add('active'), 10);
        ui.input?.focus();
    });

    ui.close?.addEventListener('click', () => {
        ui.modal.classList.remove('active');
        setTimeout(() => ui.modal.classList.add('hidden'), 300);
    });

    ui.send?.addEventListener('click', () => {
        const msg = ui.input.value.trim();
        if (msg) { 
            sendMessageToAI(msg); 
            ui.input.value = ''; 
        }
    });

    ui.input?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            ui.send.click(); 
        }
    });

    ui.reset?.addEventListener('click', async () => {
        document.getElementById(IDs.AI.MESSAGES_AREA).innerHTML = '';
        await startNewChatSession();
        appendMessage('💬 Konverzácia bola resetovaná.', 'assistant-msg');
    });
}