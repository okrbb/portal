/* announcements.js - OPRAVENÁ VERZIA s XSS ochranou */
import { store } from './store.js';
import { ModalManager, safeAsync, attachListener } from './utils.js';
import { fetchLatest, addDocument, deleteDocument } from './firebase_helpers.js';
import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';
import { logUserAction } from './logs_module.js';
import { IDs } from './id-registry.js';

/**
 * ============================================
 * ✅ OPRAVA #1: Lazy loading DOMPurify
 * Načítanie len pri použití (performance)
 * ============================================
 */
let DOMPurify = null;

async function ensureDOMPurify() {
    if (!DOMPurify) {
        const { lazyLoader } = await import('./lazy_loader.js');
        DOMPurify = await lazyLoader.loadDOMPurify();
    }
    return DOMPurify;
}

/**
 * Hlavná funkcia pre vykreslenie Widgetu Oznámenia.
 */
export function renderAnnouncementWidget() {
    const db = store.getDB();
    const user = store.getUser();

    let card = document.getElementById(IDs.ANNOUNCEMENTS.WIDGET_CONTAINER);
    
    if (!card) {
        const rightCol = document.querySelector('.dashboard-right-col');
        if (rightCol) {
            card = document.createElement('div');
            card.id = IDs.ANNOUNCEMENTS.WIDGET_CONTAINER;
            card.className = 'announcement-card';
            rightCol.insertBefore(card, rightCol.firstChild);
        } else {
            return;
        }
    }

    if (db && user) {
        loadAnnouncementData(db, user, card);

        if (Permissions.canManageAnnouncements(user)) {
            setupAnnouncementModal(db, user);
        }
    }
}

/**
 * Načíta najnovší oznam z DB.
 */
async function loadAnnouncementData(db, user, cardElement) {
    const announcements = await safeAsync(
        () => fetchLatest('announcements', 1, 'timestamp'),
        'Nepodarilo sa načítať oznamy',
        { 
            fallbackValue: [],
            showToastOnError: false
        }
    );

    if (announcements.length === 0) {
        if (!Permissions.canManageLogs(user)) {
            cardElement.style.display = 'none';
            cardElement.classList.remove('visible');
        } else {
            cardElement.style.display = 'block';
            renderCardContent(cardElement, null, true);
        }
        return;
    }

    const data = announcements[0];

    cardElement.style.display = 'block';
    renderCardContent(cardElement, data, Permissions.canManageAnnouncements(user));
}

/**
 * ============================================
 * ✅ OPRAVA #2: Bezpečné renderovanie s DOMPurify
 * Všetok user-generated content je sanitizovaný
 * ============================================
 */
async function renderCardContent(card, data, isAdmin) {
    // ✅ Sanitizácia textu pred zobrazením
    const purify = await ensureDOMPurify();
    
    const rawText = data ? data.text : 'Zatiaľ nebol pridaný žiadny oznam. Kliknite pre pridanie.';
    
    // ✅ KRITICKÉ: Sanitizovať text proti XSS
    const safeText = purify.sanitize(rawText, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'], // Len základné formátovanie
        ALLOWED_ATTR: [], // Žiadne atribúty (onclick, onerror, ...)
        KEEP_CONTENT: true,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false
    });
    
    let dateStr = '';
    if (data && data.timestamp) {
        const d = data.timestamp.toDate();
        dateStr = d.toLocaleDateString('sk-SK') + ' ' + 
                  d.toLocaleTimeString('sk-SK', {hour: '2-digit', minute:'2-digit'});
    }

    let editBtnHtml = '';
    if (isAdmin) {
        editBtnHtml = `
            <button type="button" id="${IDs.ANNOUNCEMENTS.EDIT_BTN}" class="announcement-edit-btn" title="Upraviť oznam">
                <i class="fas fa-pen"></i>
            </button>
        `;
    }

    // ✅ Bezpečné vloženie - safeText je už sanitizovaný
    card.innerHTML = `
        <div class="announcement-header">
            <h3><i class="fas fa-bullhorn"></i> Nástenka</h3>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="announcement-date">${dateStr}</span>
                ${editBtnHtml}
            </div>
        </div>
        <div class="announcement-content" style="white-space: pre-wrap;">${safeText}</div>
    `;

    setTimeout(() => card.classList.add('visible'), 50);

    if (isAdmin) {
        const btn = document.getElementById(IDs.ANNOUNCEMENTS.EDIT_BTN);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openAnnouncementModal(data ? data.text : '');
            });
        }
    }
}

/**
 * ============================================
 * ✅ OPRAVA #3: Validácia a sanitizácia vstupu
 * Pred uložením do DB kontrolujeme obsah
 * ============================================
 */
function setupAnnouncementModal(db, user) {
    let modal = document.getElementById(IDs.ANNOUNCEMENTS.MODAL);
    
    if (!modal) {
        createModalHTML();
        modal = document.getElementById(IDs.ANNOUNCEMENTS.MODAL);
    }

    if (!modal) return;

    ModalManager.setupCloseListeners(IDs.ANNOUNCEMENTS.MODAL, IDs.ANNOUNCEMENTS.CLOSE_BTN);
    
    const form = document.getElementById(IDs.ANNOUNCEMENTS.FORM);
    if (!form) return;

    // Odoslanie formulára
    attachListener(IDs.ANNOUNCEMENTS.FORM, 'submit', async (e) => {
        e.preventDefault();
        const textInput = document.getElementById(IDs.ANNOUNCEMENTS.TEXTAREA);
        const rawText = textInput.value.trim();

        // ✅ Validácia dĺžky
        if (!rawText) {
            showToast("Text oznamu nemôže byť prázdny.", TOAST_TYPE.ERROR);
            return;
        }

        if (rawText.length > 5000) {
            showToast("Text je príliš dlhý (max 5000 znakov).", TOAST_TYPE.ERROR);
            return;
        }

        // ✅ Detekcia podozrivého obsahu
        const suspiciousPatterns = [
            /<script/i,
            /javascript:/i,
            /onerror=/i,
            /onclick=/i,
            /<iframe/i
        ];

        const hasSuspiciousContent = suspiciousPatterns.some(pattern => 
            pattern.test(rawText)
        );

        if (hasSuspiciousContent) {
            showToast("Text obsahuje nepovolený obsah.", TOAST_TYPE.ERROR);
            
            // Logovanie podozrivej aktivity
            await logUserAction(
                "SECURITY_WARNING", 
                `Pokus o XSS v oznámení: ${rawText.substring(0, 100)}...`,
                false
            );
            return;
        }

        // ✅ Sanitizácia pred uložením
        const purify = await ensureDOMPurify();
        const cleanText = purify.sanitize(rawText, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'],
            ALLOWED_ATTR: []
        });

        await safeAsync(
            async () => {
                await addDocument('announcements', {
                    text: cleanText, // ✅ Ukladáme sanitizovaný text
                    author: user.email,
                    authorName: user.displayName || user.meno || 'Neznámy',
                    originalLength: rawText.length,
                    sanitized: cleanText !== rawText // Flag či sa text zmenil
                });

                showToast("Oznam bol zverejnený.", TOAST_TYPE.SUCCESS);
                logUserAction("OZNAM", "Pridal/Upravil globálny oznam.");
                
                ModalManager.close(IDs.ANNOUNCEMENTS.MODAL);
                renderAnnouncementWidget();
            },
            'Nepodarilo sa uložiť oznam'
        );
    });

    // Delete button
    attachListener(IDs.ANNOUNCEMENTS.DELETE_BTN, 'click', async () => {
        if (!confirm("Naozaj chcete odstrániť aktuálny oznam?")) return;

        await safeAsync(
            async () => {
                const announcements = await fetchLatest('announcements', 1, 'timestamp');
                
                if (announcements.length > 0) {
                    await deleteDocument('announcements', announcements[0].id);
                }

                showToast("Oznam bol odstránený.", TOAST_TYPE.INFO);
                logUserAction("OZNAM", "Odstránil globálny oznam.");
                
                ModalManager.close(IDs.ANNOUNCEMENTS.MODAL);
                renderAnnouncementWidget();
            },
            'Chyba pri mazaní oznamu'
        );
    });
}

/**
 * Otvorenie modálneho okna
 */
function openAnnouncementModal(currentText) {
    const textarea = document.getElementById(IDs.ANNOUNCEMENTS.TEXTAREA);
    
    ModalManager.open(IDs.ANNOUNCEMENTS.MODAL, () => {
        if (textarea) {
            textarea.value = (!currentText || currentText === 'Zatiaľ nebol pridaný žiadny oznam.') ? '' : currentText;
            textarea.focus();
            
            // ✅ Character counter
            updateCharacterCount();
        }
    });
}

/**
 * ============================================
 * ✅ VYLEPŠENIE: Character counter pre textarea
 * ============================================
 */
function updateCharacterCount() {
    const textarea = document.getElementById(IDs.ANNOUNCEMENTS.TEXTAREA);
    const counter = document.getElementById(IDs.ANNOUNCEMENTS.CHAR_COUNTER);
    
    if (textarea && counter) {
        const currentLength = textarea.value.length;
        const maxLength = 5000;
        counter.textContent = `${currentLength} / ${maxLength}`;
        
        if (currentLength > maxLength * 0.9) {
            counter.style.color = '#ef4444'; // Red warning
        } else {
            counter.style.color = '#9ca3af'; // Normal
        }
    }
}

/**
 * ============================================
 * ✅ VYLEPŠENIE: Updatované modálne okno s counter
 * ============================================
 */
function createModalHTML() {
    const modalHtml = `
    <div id="${IDs.ANNOUNCEMENTS.MODAL}" class="modal-overlay hidden" style="z-index: 10000;">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Upraviť oznam</h2>
                <button id="${IDs.ANNOUNCEMENTS.CLOSE_BTN}" class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <form id="${IDs.ANNOUNCEMENTS.FORM}">
                    <div class="form-group">
                        <label for="${IDs.ANNOUNCEMENTS.TEXTAREA}">
                            Text oznamu:
                            <span id="${IDs.ANNOUNCEMENTS.CHAR_COUNTER}" style="float: right; font-size: 0.85em; color: #9ca3af;">0 / 5000</span>
                        </label>
                        <textarea 
                            id="${IDs.ANNOUNCEMENTS.TEXTAREA}" 
                            rows="8" 
                            maxlength="5000"
                            style="width:100%; resize:vertical;" 
                            placeholder="Sem napíšte text oznamu..."
                            oninput="updateCharacterCount()"
                        ></textarea>
                        <small style="color: #9ca3af; display: block; margin-top: 8px;">
                            <i class="fas fa-info-circle"></i> Povolené formátovanie: tučné, kurzíva, nový riadok
                        </small>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1rem; display: flex; justify-content: space-between;">
                        <button type="button" id="${IDs.ANNOUNCEMENTS.DELETE_BTN}" class="ua-btn delete-style">Odstrániť</button>
                        <button type="submit" class="ua-btn accent">Zverejniť</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // ✅ Pripojenie character counter
    const textarea = document.getElementById(IDs.ANNOUNCEMENTS.TEXTAREA);
    if (textarea) {
        textarea.addEventListener('input', updateCharacterCount);
    }
}

// ✅ Export funkcie pre globálny scope (pre inline oninput)
window.updateCharacterCount = updateCharacterCount;