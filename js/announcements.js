/* announcements.js - Opravená verzia */
import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';
import { logUserAction } from './logs_module.js';

/**
 * Hlavná funkcia pre vykreslenie Widgetu Oznámenia.
 * @param {Object} db - Firestore inštancia
 * @param {Object} user - Aktívny používateľ
 */
export function renderAnnouncementWidget(db, user) {
    // 1. Nájdeme existujúci kontajner z HTML (index.html)
    // Pôvodne ste mali 'announcement-widget-card', v HTML je 'announcement-widget-container'
    let card = document.getElementById('announcement-widget-container');
    
    // Ak by náhodou v HTML nebol, skúsime ho vytvoriť (fallback)
    if (!card) {
        const rightCol = document.querySelector('.dashboard-right-col');
        if (rightCol) {
            card = document.createElement('div');
            card.id = 'announcement-widget-container';
            card.className = 'announcement-card';
            // Vložíme na začiatok alebo na vhodné miesto
            rightCol.insertBefore(card, rightCol.firstChild);
        } else {
            // Ak nie je ani pravý stĺpec, končíme
            return;
        }
    }

    // 2. Načítanie dát z Firestore
    loadAnnouncementData(db, user, card);

    // 3. Inicializácia modálneho okna (ak je užívateľ admin/vedúci)
    // Toto stačí spustiť raz, ale kontrolujeme, či už nebolo spustené
    if (Permissions.canManageLogs(user)) {
        setupAnnouncementModal(db, user);
    }
}

/**
 * Načíta najnovší oznam z DB.
 */
async function loadAnnouncementData(db, user, cardElement) {
    try {
        const snapshot = await db.collection('announcements')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            if (!Permissions.canManageLogs(user)) {
                // Bežný user nevidí prázdny widget
                cardElement.style.display = 'none';
                cardElement.classList.remove('visible');
            } else {
                // Admin vidí widget s výzvou
                cardElement.style.display = 'block';
                renderCardContent(cardElement, null, true);
            }
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        // Zobrazíme widget
        cardElement.style.display = 'block';
        renderCardContent(cardElement, data, Permissions.canManageLogs(user));

    } catch (error) {
        console.error("Chyba pri načítaní oznamov:", error);
    }
}

/**
 * Vykreslí HTML vnútro karty a pripojí listenery.
 */
function renderCardContent(card, data, isAdmin) {
    const text = data ? data.text : 'Zatiaľ nebol pridaný žiadny oznam. Kliknite pre pridanie.';
    
    let dateStr = '';
    if (data && data.timestamp) {
        const d = data.timestamp.toDate();
        dateStr = d.toLocaleDateString('sk-SK') + ' ' + d.toLocaleTimeString('sk-SK', {hour: '2-digit', minute:'2-digit'});
    }

    let editBtnHtml = '';
    if (isAdmin) {
        // Pridáme ID aj pre Delete tlačidlo, ak by sme ho chceli inline (voliteľné)
        // Pre istotu pridáme type="button", aby to neodosielalo formuláre
        editBtnHtml = `
            <button type="button" id="edit-announcement-btn" class="announcement-edit-btn" title="Upraviť oznam">
                <i class="fas fa-pen"></i>
            </button>
        `;
    }

    // Vložíme HTML
    card.innerHTML = `
        <div class="announcement-header">
            <h3><i class="fas fa-bullhorn"></i> Nástenka</h3>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="announcement-date">${dateStr}</span>
                ${editBtnHtml}
            </div>
        </div>
        <div class="announcement-content" style="white-space: pre-wrap;">${text}</div>
    `;

    // Pridáme triedu pre animáciu (ak v CSS existuje)
    setTimeout(() => card.classList.add('visible'), 50);

    // === KĽÚČOVÉ: PRIPOJENIE LISTENERU ===
    if (isAdmin) {
        const btn = card.querySelector('#edit-announcement-btn');
        if (btn) {
            // Odstránime starý listener (klonovaním) pre istotu, ak by sa funkcia volala viackrát? 
            // Nie je nutné, lebo innerHTML prepísalo DOM element, takže starý btn už neexistuje.
            // Stačí pridať nový listener.
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Pre istotu
                openAnnouncementModal(data ? data.text : '');
            });
        }
    }
}

// --- MODÁLNE OKNO LOGIKA ---

const modalId = 'announcement-modal';
const formId = 'announcement-form';
const textareaId = 'announcement-text';

function setupAnnouncementModal(db, user) {
    // Dynamicky vytvoríme modál, ak v HTML neexistuje (aby sme nemuseli meniť index.html)
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        createModalHTML(); // Vytvoríme ho v DOMe
        modal = document.getElementById(modalId);
    }

    const closeBtn = document.getElementById('close-announcement-modal');
    const deleteBtn = document.getElementById('btn-delete-announcement');
    const form = document.getElementById(formId);
    
    if (!modal || !form) return;

    // Zatváranie
    if (closeBtn) {
        closeBtn.onclick = () => modal.classList.add('hidden');
    }
    
    // Zatvorenie klikom mimo
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    };
    
    // Odoslanie (Uloženie)
    form.onsubmit = async (e) => {
        e.preventDefault();
        const text = document.getElementById(textareaId).value.trim();

        if (!text) {
            showToast("Text oznamu nemôže byť prázdny.", TOAST_TYPE.ERROR);
            return;
        }

        try {
            await db.collection('announcements').add({
                text: text,
                author: user.email,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            showToast("Oznam bol zverejnený.", TOAST_TYPE.SUCCESS);
            logUserAction("OZNAM", "Pridal/Upravil globálny oznam.");
            modal.classList.add('hidden');
            
            // Prekreslíme widget
            renderAnnouncementWidget(db, user);

        } catch (error) {
            console.error("Chyba pri ukladaní oznamu:", error);
            showToast("Nepodarilo sa uložiť oznam.", TOAST_TYPE.ERROR);
        }
    };

    // Mazanie
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if(confirm("Naozaj chcete odstrániť aktuálny oznam?")) {
                try {
                    const snapshot = await db.collection('announcements')
                        .orderBy('timestamp', 'desc')
                        .limit(1)
                        .get();
                    
                    if (!snapshot.empty) {
                        await snapshot.docs[0].ref.delete();
                    }

                    showToast("Oznam bol odstránený.", TOAST_TYPE.INFO);
                    logUserAction("OZNAM", "Odstránil globálny oznam.");
                    modal.classList.add('hidden');
                    renderAnnouncementWidget(db, user);

                } catch (error) {
                    console.error("Chyba mazania:", error);
                    showToast("Chyba pri mazaní.", TOAST_TYPE.ERROR);
                }
            }
        };
    }
}

function openAnnouncementModal(currentText) {
    const modal = document.getElementById(modalId);
    const textarea = document.getElementById(textareaId);
    if (modal && textarea) {
        textarea.value = (!currentText || currentText === 'Zatiaľ nebol pridaný žiadny oznam.') ? '' : currentText;
        modal.classList.remove('hidden');
        textarea.focus();
    }
}

// Pomocná funkcia na vloženie HTML modálu do stránky (ak tam nie je)
function createModalHTML() {
    const modalHtml = `
    <div id="announcement-modal" class="modal-overlay hidden" style="z-index: 10000;">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2>Upraviť oznam</h2>
                <button id="close-announcement-modal" class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <form id="announcement-form">
                    <div class="form-group">
                        <label for="announcement-text">Text oznamu:</label>
                        <textarea id="announcement-text" rows="5" style="width:100%; resize:vertical;" placeholder="Sem napíšte text oznamu..."></textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1rem; display: flex; justify-content: space-between;">
                        <button type="button" id="btn-delete-announcement" class="ua-btn delete-style">Odstrániť</button>
                        <button type="submit" class="ua-btn accent">Zverejniť</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}