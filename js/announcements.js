import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';
import { logUserAction } from './logs_module.js';

/**
 * Hlavná funkcia pre vykreslenie Widgetu Oznámenia.
 * @param {Object} db - Firestore inštancia
 * @param {Object} user - Aktívny používateľ
 */
export function renderAnnouncementWidget(db, user) {
    const rightCol = document.querySelector('.dashboard-right-col');
    
    if (!rightCol || !db) return;

    // 1. Vytvorenie kontajnera pre widget (ak ešte neexistuje)
    let card = document.getElementById('announcement-widget-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'announcement-widget-card';
        card.className = 'announcement-card';
        
        // Vložíme ho ako PRVÝ element v pravom stĺpci (nad Welcome kartu)
        // alebo ako DRUHÝ (pod Welcome kartu), záleží na preferencii.
        // Tu ho dávam ako druhý (pod welcome), ale nad "Stav systému".
        if (rightCol.children.length > 1) {
            rightCol.insertBefore(card, rightCol.children[1]);
        } else {
            rightCol.appendChild(card);
        }
    }

    // 2. Načítanie dát z Firestore
    loadAnnouncementData(db, user, card);

    // 3. Inicializácia modálneho okna (ak je užívateľ admin)
    if (Permissions.canManageLogs(user)) { // Používame canManageLogs ako proxy pre Vedúceho odboru
        setupAnnouncementModal(db, user);
    }
}

/**
 * Načíta najnovší oznam z DB.
 */
async function loadAnnouncementData(db, user, cardElement) {
    try {
        // Získame najnovší oznam
        const snapshot = await db.collection('announcements')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            // Ak nie je žiadny oznam a user nie je admin, skryjeme widget
            if (!Permissions.canManageLogs(user)) {
                cardElement.style.display = 'none';
            } else {
                // Admin vidí prázdny widget s výzvou na pridanie
                renderCardContent(cardElement, null, true);
            }
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        // Renderujeme obsah
        renderCardContent(cardElement, data, Permissions.canManageLogs(user));

    } catch (error) {
        console.error("Chyba pri načítaní oznamov:", error);
    }
}

/**
 * Vykreslí HTML vnútro karty.
 */
function renderCardContent(card, data, isAdmin) {
    const text = data ? data.text : 'Zatiaľ nebol pridaný žiadny oznam.';
    
    let dateStr = '';
    if (data && data.timestamp) {
        const d = data.timestamp.toDate();
        dateStr = d.toLocaleDateString('sk-SK') + ' ' + d.toLocaleTimeString('sk-SK', {hour: '2-digit', minute:'2-digit'});
    }

    let editBtnHtml = '';
    if (isAdmin) {
        editBtnHtml = `<button id="edit-announcement-btn" class="announcement-edit-btn" title="Upraviť oznam"><i class="fas fa-pen"></i></button>`;
    }

    card.innerHTML = `
        <div class="announcement-header">
            <h3><i class="fas fa-bullhorn"></i> Nástenka</h3>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="announcement-date">${dateStr}</span>
                ${editBtnHtml}
            </div>
        </div>
        <div class="announcement-content">${text}</div>
    `;

    // Zobrazíme kartu
    card.classList.add('visible');

    // Listener pre tlačidlo editácie
    if (isAdmin) {
        const btn = card.querySelector('#edit-announcement-btn');
        if (btn) {
            btn.addEventListener('click', () => {
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
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById('close-announcement-modal');
    const deleteBtn = document.getElementById('btn-delete-announcement');
    const form = document.getElementById(formId);
    
    if (!modal || !form) return;

    // Zatváranie
    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
    
    // Odoslanie (Uloženie)
    form.onsubmit = async (e) => {
        e.preventDefault();
        const text = document.getElementById(textareaId).value.trim();

        if (!text) {
            showToast("Text oznamu nemôže byť prázdny.", TOAST_TYPE.ERROR);
            return;
        }

        try {
            // Pridáme nový dokument (história sa zachová, zobrazujeme len najnovší)
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

    // Mazanie (Skrytie)
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if(confirm("Naozaj chcete odstrániť aktuálny oznam?")) {
                try {
                    // Vložíme "prázdny" oznam alebo logiku mazania. 
                    // Najčistejšie: Pridať dokument s príznakom deleted alebo empty text.
                    // Pre jednoduchosť tohto riešenia: Zmažeme kolekciu (nie je ideálne) 
                    // alebo pridáme záznam s prázdnym textom, ktorý renderer ignoruje/skryje.
                    
                    // Možnosť A: Pridať dokument s textom "" (prázdny string)
                    // Renderer vyššie to potom spracuje tak, že ak je text prázdny, správa sa ako keby nebol.
                    
                    // Ale najlepšie je vymazať posledný dokument? 
                    // Nie, poďme jednoduchou cestou: Pridať dokument s textom "[OZNAM BOL ODSTRÁNENÝ]" alebo proste zmazať.
                    
                    // PRE TENTO PRÍPAD: Vymažeme vizuálne tak, že pridáme dokument s prázdnym textom, 
                    // a renderer upravíme, aby prázdny text nezobrazoval (resp. skryl widget).
                    
                    // Reálne mazanie v "append-only" logu:
                    // Nájdeme posledný a zmažeme ho? Nie, pridáme nový "vymazávací" záznam.
                    
                    // Zjednodušenie: Admin chce, aby to zmizlo.
                    // Nájdeme aktuálny viditeľný a zmažeme ho fyzicky.
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
                }
            }
        };
    }
}

function openAnnouncementModal(currentText) {
    const modal = document.getElementById(modalId);
    const textarea = document.getElementById(textareaId);
    if (modal && textarea) {
        textarea.value = currentText === 'Zatiaľ nebol pridaný žiadny oznam.' ? '' : currentText;
        modal.classList.remove('hidden');
    }
}