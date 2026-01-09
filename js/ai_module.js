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
 * Formátuje telefónne číslo do tvaru: 0905 123 456
 * Ak sú dve čísla oddelené čiarkou, naformátuje obe
 */
function formatPhoneNumber(phone) {
    if (!phone) return '---';
    
    // Ak sú dve čísla oddelené čiarkou, naformátuj obe samostatne
    if (phone.includes(',')) {
        return phone.split(',')
            .map(num => formatSinglePhoneNumber(num.trim()))
            .join(', ');
    }
    
    return formatSinglePhoneNumber(phone);
}

/**
 * Formátuje jedno telefónne číslo
 */
function formatSinglePhoneNumber(phone) {
    if (!phone) return '---';
    // Odstráň všetky medzery a pomlčky
    const cleaned = phone.replace(/[\s-]/g, '');
    // Ak má 10 číslic (slovenský formát): 0905123456 → 0905 123 456
    if (cleaned.length === 10 && cleaned.startsWith('0')) {
        return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
    }
    // Ak má 9 číslic (bez nuly): 905123456 → 905 123 456
    if (cleaned.length === 9) {
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    }
    // Inak vráť pôvodné
    return phone;
}

/**
 * POMOCNÁ FUNKCIA: Naformátuje dáta lokálne bez použitia AI
 * Zabezpečuje rovnaký vzhľad ako z Gemini, ale zadarmo a okamžite.
 * ✅ NOVÉ: Podporuje aj formátovanie zamestnancov a personálu (staff)
 */
function formatLocalContacts(contacts) {
    let htmlResult = "";
    contacts.slice(0, 10).forEach(c => {
        if (c.type === 'staff') {
            // ✅ NOVÉ: Formátovanie pre zamestnancov (novo pridaný z Excel k.xlsx)
            htmlResult += `### osoba: ${c.meno || ''} (${c.okres || 'neuvedený okres'})\n`;
            htmlResult += `- **funkcia:** ${c.funkcia || '---'}\n`;
            htmlResult += `- **kontakt:** ${formatPhoneNumber(c.kontakt)}\n`;
            htmlResult += `- **email:** ${c.email || '---'}\n\n`;
        } else if (c.type === 'employee') {
            // Formátovanie pre zamestnancov
            htmlResult += `### zamestnanec: ${c.meno || ''} ${c.priezvisko || ''}`.trim() + '\n';
            htmlResult += `- **oddelenie:** ${c.oddelenie || '---'}\n`;
            htmlResult += `- **funkcia:** ${c.funkcia || '---'}\n`;
            htmlResult += `- **email:** ${c.mail || '---'}\n`;
            htmlResult += `- **telefón/kontakt:** ${formatPhoneNumber(c.telefon)}\n\n`;
        } else {
            // Formátovanie pre obce/mestá
            htmlResult += `### obec/mesto: ${c.id || '---'}\n`;
            htmlResult += `- **okres:** ${c.okres || '---'}\n`;
            // Zobraz starostu alebo primátora - podľa toho čo existuje
            htmlResult += `- **starosta/primátor:** ${c.name || c.primator || '---'}\n`;
            htmlResult += `- **email:** ${c.em_s || '---'}\n`;
            htmlResult += `- **mobil:** ${formatPhoneNumber(c.mob_s)}\n`;
            htmlResult += `- **bydlisko:** ${c.adresa || '---'}\n`;
            htmlResult += `- **email obec/mesto:** ${c.em_o || '---'}\n`;
            htmlResult += `- **tel. úrad:** ${formatPhoneNumber(c.tc_o)}\n\n`;
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
 * POMOCNÁ FUNKCIA: Detectuje či je query iba okresId (BS, BR, DT, atď.)
 */
function detectPeriodId(query) {
    const queryUpper = query.toUpperCase().trim();
    const validPeriods = ["BB", "BS", "BR", "DT", "KA", "LC", "PT", "RA", "RS", "VK", "ZV", "ZC", "ZH"];
    return validPeriods.includes(queryUpper) ? queryUpper : null;
}

/**
 * POMOCNÁ FUNKCIA: Filtruje kontakty podľa typu (staff alebo contact)
 */
function filterResultsByType(contacts, type) {
    return contacts.filter(c => c.type === type);
}

/**
 * POMOCNÁ FUNKCIA: Odstráni diakritiku z textu
 */
function removeDiacritics(text) {
    if (!text) return '';
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * POMOCNÁ FUNKCIA: Očistí dopyt od "šumových" slov, ktoré by bránili lokálnemu vyhľadaniu.
 * Premení napr. "starosta Vlkanová" na "Vlkanová".
 */
function cleanQuery(query) {
    const noiseWords = [
        "starosta", "starostka", "obec", "mesto", "kontakt", 
        "primator", "primatorka", "primátor", "primátorka", "starostu", "primátora",
        "na", "hladam", "hľadám", "tel", "email", "cislo", "číslo"
    ];
    
    let cleaned = query.toLowerCase();
    // Normalizuj aj bez diakritiky
    const cleanedNoDiacritics = removeDiacritics(cleaned);
    
    noiseWords.forEach(word => {
        // Regulárny výraz nahradí celé slová bez ohľadu na veľkosť písmen
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleaned = cleaned.replace(regex, '');
        // Skús aj bez diakritiky
        const wordNoDiacritics = removeDiacritics(word);
        const regexNoDiacritics = new RegExp(`\\b${wordNoDiacritics}\\b`, 'gi');
        cleaned = cleaned.replace(regexNoDiacritics, '');
    });
    
    return cleaned.trim();
}

/**
 * UPRAVENÁ HLAVNÁ FUNKCIA: Hybridné vyhľadávanie (Lokálne -> Očistené lokálne -> AI)
 * ✅ NOVÉ: Ak je query iba okresId, zobrazí iba osôb (staff)
 */
async function sendMessageToAI(userMessage) {
    if (!userMessage || userMessage.trim() === '') return;

    // 1. Zobrazenie správy používateľa a indikátora načítania
    appendMessage(userMessage, 'user-msg');
    const loadingId = 'ai-thinking-msg';
    appendMessage('<i class="fas fa-circle-notch fa-spin"></i> Hľadám v databáze...', 'assistant-msg', loadingId);

    try {
        // ✅ DETEKCIA NEÚPLNÝCH DOTAZOV (iba "starosta" alebo "primátor" bez obce)
        const lowerMsg = userMessage.toLowerCase().trim();
        const incompleteRolePatterns = /^(starosta|starostka|primátor|primátorka)$/i;
        
        if (incompleteRolePatterns.test(lowerMsg)) {
            removeMessage(loadingId);
            appendMessage("Prosím, upresni názov obce alebo mesta. Napríklad: 'starosta Vlkanová' alebo 'primátor Banská Bystrica'", 'assistant-msg');
            return;
        }
        
        // ✅ DETEKCIA FUNKCIE (starosta/primátor) v dotaze
        const hasPrimator = /\b(primátor|primátorka|primator|primatorka)\b/i.test(userMessage);
        const hasStarosta = /\b(starosta|starostka)\b/i.test(userMessage);
        const detectedRole = hasPrimator ? 'primator' : (hasStarosta ? 'starosta' : null);
        
        // --- DETEKCIA OKRESID ---
        const detectedPeriod = detectPeriodId(userMessage);
        
        // --- KROK A: LOKÁLNE VYHĽADÁVANIE S PÔVODNÝM TEXTOM ---
        let foundContacts = await searchContactsInCache(userMessage);
        
        // --- KROK B: POKUS S OČISTENÝM TEXTOM (Ak prvý pokus zlyhal) ---
        if (!foundContacts || foundContacts.length === 0) {
            const cleanedText = cleanQuery(userMessage);
            if (cleanedText && cleanedText !== userMessage.toLowerCase()) {
                console.log(`Pôvodný dopyt neuspel, skúšam očistený: "${cleanedText}"`);
                foundContacts = await searchContactsInCache(cleanedText);
            }
        }

        // --- KROK C: ZOBRAZENIE LOKÁLNYCH VÝSLEDKOV (Ak sa niečo našlo) ---
        if (foundContacts && foundContacts.length > 0) {
            // ✅ FILTER PODĽA FUNKCIE (ak bola zadaná)
            if (detectedRole) {
                foundContacts = foundContacts.filter(c => 
                    c.type === 'contact' && c.stat === detectedRole
                );
            }
            
            // ✅ NOVÉ: Ak je query iba okresId, zobrazí iba zamestnancov (staff) z toho okresu
            if (detectedPeriod) {
                // Filtruj iba staff dáta pre daný okres
                foundContacts = foundContacts.filter(c => 
                    c.type === 'staff' && c.okres && c.okres.toUpperCase() === detectedPeriod
                );
                
                // Ak sa nenašli staff, skús vyhľadať všetky kontakty pre okres
                if (foundContacts.length === 0) {
                    foundContacts = await searchContactsInCache(userMessage);
                }
            }
            
            const formattedHTML = formatLocalContacts(foundContacts);
            document.getElementById(loadingId)?.remove();
            appendMessage(formattedHTML, 'assistant-msg');
            console.log('Výsledok doručený lokálne (zadarmo)');
            return;
        }

        // --- KROK D: AI FALLBACK (Ak lokálne hľadanie definitívne zlyhalo) ---
        console.log('Lokálne hľadanie neúspešné, pýtam sa AI...');
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) {
            loadingElement.innerHTML = '<i class="fa-brands fa-think-peaks"></i> Premýšľam ...';
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
        reset: document.getElementById(IDs.AI.RESET_BTN),
        help: document.getElementById(IDs.AI.HELP_BTN)
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

    ui.help?.addEventListener('click', () => {
        showHelpMessage();
    });
}

/**
 * Zobrazí nápovedu pre vyhľadávanie
 */
function showHelpMessage() {
    const helpText = `
## 📚 Nápoveda - Ako vyhľadávať

### Hľadanie osôb (personálu OKR)
- **ID okresu** (BB, BS, BR ...) → zobrazí všetkých zamestnancov OKR z daného okresu
- **priezvisko** alebo **meno a priezvisko** → nájde konkrétnu osobu (zamestnanca)
- **funkciu** (napr. "vedúci", "prednosta") → nájde osoby na danej pozícii

### Hľadanie obcí a miest
- **názov obce/mesta** → nájde konkrétnu obec/mesto
- **"starosta"** a **názov obce** → nájde starostu obce (napr. "starosta Vlkanová")
- **"primátor"** a **názov mesta** → nájde primátora mesta (napr. "primátor Zvolen")

### Vyhľadávanie podľa kontaktov
- **telefónne číslo** (aj s medzerami alebo bez) → nájde osobu s daným číslom
- **email** → nájde osobu podľa emailovej adresy
    `.trim();

    const area = document.getElementById(IDs.AI.MESSAGES_AREA);
    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-msg assistant-msg';
    msgDiv.innerHTML = DOMPurify.sanitize(marked.parse(helpText), {
        ALLOWED_TAGS: ['h2', 'h3', 'p', 'br', 'ul', 'li', 'strong', 'em', 'b', 'i'],
        ALLOWED_ATTR: []
    });
    area.appendChild(msgDiv);
    area.scrollTop = area.scrollHeight;
}