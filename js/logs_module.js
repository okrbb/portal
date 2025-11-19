import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';

/* =================================== */
/* MODUL PRE LOGOVANIE A AUDIT         */
/* (logs_module.js) - UPRAVENÝ         */
/* =================================== */

let _db = null;
let _activeUser = null;

/**
 * Inicializuje modul logov.
 * @param {Object} db - Inštancia Firestore DB (povinné)
 * @param {Object|null} activeUser - Aktívny používateľ (voliteľné, môže byť null pri štarte)
 */
export function initializeLogsModule(db, activeUser = null) {
    console.log('Inicializujem modul Logov (DB pripojená)...');
    _db = db;
    _activeUser = activeUser;

    // Ak už máme používateľa (napr. reload stránky s perzistentným loginom), nastavíme listenery
    if (_activeUser) {
        setupLogListeners();
    }

    // Inicializácia modálnych okien pre mazanie (tieto nezávisia na userovi)
    initDeleteModalListeners();
}

/**
 * Aktualizuje aktívneho používateľa po prihlásení a nastaví oprávnenia.
 * Túto funkciu volajte z mainWizard.js po úspešnom logine.
 */
export function updateLogsUser(user) {
    console.log('Log modul: Aktualizujem používateľa...');
    _activeUser = user;
    setupLogListeners();
}

/**
 * Nastaví listenery na tlačidlá sťahovania/mazania logov
 * iba ak má používateľ oprávnenie.
 */
function setupLogListeners() {
    if (!_activeUser) return;

    // Kontrola oprávnenia na správu logov
    if (Permissions.canManageLogs(_activeUser)) {
        const userInitialsButton = document.querySelector('#sidebar-user-initials');
        if (userInitialsButton) {
            userInitialsButton.classList.add('clickable-logs'); 
            userInitialsButton.setAttribute('title', 'Ľavý klik: stiahnuť logy\nPravý klik: zmazať logy'); 
            
            // Odstránime staré listenery (cloneNode trik) a pridáme nové
            const newBtn = userInitialsButton.cloneNode(true);
            userInitialsButton.parentNode.replaceChild(newBtn, userInitialsButton);
            
            newBtn.addEventListener('click', downloadAccessLogs);
            newBtn.addEventListener('contextmenu', handleDeleteLogsRequest);
            
            console.log('Log modul: Listenery pre admina nastavené.');
        }
    }
}

/**
 * Inicializácia tlačidiel v modálnom okne (pre mazanie).
 * Oddelené od user logiky, aby sa to inicializovalo vždy.
 */
function initDeleteModalListeners() {
    const modalBtnCancel = document.querySelector('#modal-btn-cancel');
    const modalBtnConfirmDelete = document.querySelector('#modal-btn-confirm-delete');
    const deleteModalOverlay = document.querySelector('#delete-logs-overlay');

    if (modalBtnCancel) {
        // Clone na odstránenie starých listenerov z iných modulov
        const newCancel = modalBtnCancel.cloneNode(true);
        modalBtnCancel.parentNode.replaceChild(newCancel, modalBtnCancel);
        newCancel.addEventListener('click', () => {
            if (deleteModalOverlay) deleteModalOverlay.classList.add('hidden');
        });
    }

    if (modalBtnConfirmDelete) {
        const newConfirm = modalBtnConfirmDelete.cloneNode(true);
        modalBtnConfirmDelete.parentNode.replaceChild(newConfirm, modalBtnConfirmDelete);
        newConfirm.addEventListener('click', executeBatchDelete);
    }
}

/**
 * Univerzálna funkcia na zápis akcie do logov.
 * @param {string} action - Typ akcie (napr. "LOGIN", "EDIT", "DELETE")
 * @param {string} details - Podrobnosti (napr. "Zmenil meno zamestnanca X")
 * @param {boolean} success - Či akcia prebehla úspešne
 * @param {string|null} error - Chybová hláška ak nastala
 */
export async function logUserAction(action, details, success = true, error = null) {
    if (!_db) {
        console.warn("LogsModule: DB nie je inicializovaná, log sa nezapíše.");
        return;
    }

    try {
        const logData = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            // Fallbacky, ak user ešte nie je prihlásený (napr. pri logine)
            email: _activeUser?.email || 'neznamy@email.sk',
            meno: _activeUser?.displayName || _activeUser?.meno || 'Neznámy',
            oec: _activeUser?.oec || 'N/A',
            funkcia: _activeUser?.funkcia || 'N/A',
            action: action,
            details: details,
            success: success,
            error: error
        };

        await _db.collection("access_logs").add(logData);
        console.log(`[LOG] ${action}: ${details}`);

    } catch (err) {
        console.error('[LOG] Chyba pri zápise logu:', err);
    }
}

// --- INTERNÉ FUNKCIE PRE SŤAHOVANIE A MAZANIE ---

async function downloadAccessLogs() {
    const userInitialsButton = document.querySelector('#sidebar-user-initials');
    if (!userInitialsButton || userInitialsButton.classList.contains('downloading')) return; 
    
    const deleteModalOverlay = document.querySelector('#delete-logs-overlay');
    const modalMessage = deleteModalOverlay ? deleteModalOverlay.querySelector('p') : null;
    const modalBtnConfirmDelete = document.querySelector('#modal-btn-confirm-delete');
    const modalBtnCancel = document.querySelector('#modal-btn-cancel');

    console.log('Iniciujem sťahovanie logov...');
    
    if (!deleteModalOverlay || !modalMessage) return;
    
    modalMessage.textContent = 'Pripravujem sťahovanie logov...';
    if (modalBtnConfirmDelete) modalBtnConfirmDelete.classList.add('hidden'); 
    if (modalBtnCancel) {
        modalBtnCancel.textContent = 'Zatvoriť'; 
        modalBtnCancel.classList.remove('hidden');
        modalBtnCancel.disabled = false;
    }
    deleteModalOverlay.classList.remove('hidden'); 
    
    userInitialsButton.classList.add('downloading'); 

    try {
        const snapshot = await _db.collection("access_logs").orderBy("timestamp", "desc").get();
        
        // Rozšírené hlavičky o Akciu a Detaily
        const headers = ["Časová pečiatka", "E-mail", "Meno", "OEČ", "Funkcia", "Akcia", "Detaily", "Stav", "Chybová hláška"];
        const data = snapshot.docs.map(doc => {
            const log = doc.data();
            let timestampStr = "N/A";
            if (log.timestamp && log.timestamp.toDate) {
                timestampStr = log.timestamp.toDate().toLocaleString('sk-SK');
            }
            return [
                timestampStr, 
                log.email || '', 
                log.meno || '---', 
                log.oec || '---',
                log.funkcia || '---', 
                log.action || 'LOGIN', // Spätná kompatibilita pre staré logy
                log.details || '',
                log.success ? 'ÚSPECH' : 'ZLYHANIE', 
                log.error || ''
            ];
        });
        
        const sheetData = [headers, ...data];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        
        ws['!cols'] = [
            { wch: 20 }, { wch: 30 }, { wch: 25 }, { wch: 10 },
            { wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 10 }, { wch: 40 }
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Logy Prístupov");
        XLSX.writeFile(wb, `access_logs_OKR_${new Date().toISOString().slice(0,10)}.xlsx`);
        
        modalMessage.textContent = 'Logy boli úspešne stiahnuté.';

    } catch (error) {
        console.error('Chyba pri sťahovaní logov:', error);
        modalMessage.textContent = 'Nastala chyba pri sťahovaní logov.';
    } finally {
        userInitialsButton.classList.remove('downloading');
    }
}

function handleDeleteLogsRequest(event) {
    event.preventDefault(); 
    console.log('Požiadavka na mazanie logov...');
    
    const deleteModalOverlay = document.querySelector('#delete-logs-overlay');
    const modalMessage = deleteModalOverlay ? deleteModalOverlay.querySelector('p') : null;
    const modalBtnConfirmDelete = document.querySelector('#modal-btn-confirm-delete');
    const modalBtnCancel = document.querySelector('#modal-btn-cancel');

    if (!deleteModalOverlay || !modalMessage) return;
    
    modalMessage.innerHTML = 'Naozaj chcete permanentne zmazať <strong>všetky</strong> logy prístupu?';
    if (modalBtnConfirmDelete) {
        modalBtnConfirmDelete.classList.remove('hidden', 'loading');
        modalBtnConfirmDelete.disabled = false;
    }
    if (modalBtnCancel) {
        modalBtnCancel.classList.remove('hidden');
        modalBtnCancel.disabled = false;
        modalBtnCancel.textContent = 'Zrušiť';
    }
    deleteModalOverlay.classList.remove('hidden');
}

async function executeBatchDelete() {
    console.log('Spúšťam mazanie logov...');
    const modalMessage = document.querySelector('#delete-logs-overlay p');
    const modalBtnConfirmDelete = document.querySelector('#modal-btn-confirm-delete');
    const modalBtnCancel = document.querySelector('#modal-btn-cancel');

    if (modalMessage) modalMessage.textContent = 'Prebieha mazanie logov...';
    if (modalBtnConfirmDelete) {
        modalBtnConfirmDelete.disabled = true;
        modalBtnConfirmDelete.classList.add('loading');
    }
    if (modalBtnCancel) modalBtnCancel.disabled = true;

    try {
        const query = _db.collection("access_logs");
        const snapshot = await query.get();

        if (snapshot.empty) {
            if (modalMessage) modalMessage.textContent = 'Nenašli sa žiadne logy na mazanie.';
            return;
        }

        const batchSize = 500;
        let currentBatch = _db.batch();
        let i = 0;
        let batchCount = 0;

        for (const doc of snapshot.docs) {
            currentBatch.delete(doc.ref);
            i++;
            if (i === batchSize) {
                await currentBatch.commit();
                currentBatch = _db.batch();
                i = 0;
                batchCount++;
            }
        }

        if (i > 0) {
            await currentBatch.commit();
        }

        if (modalMessage) modalMessage.textContent = `Všetky logy (${snapshot.size} záznamov) boli zmazané.`;

    } catch (error) {
        console.error('Chyba pri mazaní logov:', error);
        if (modalMessage) modalMessage.textContent = 'Nastala chyba pri mazaní logov.';
    } finally {
        if (modalBtnConfirmDelete) {
            modalBtnConfirmDelete.classList.remove('loading');
            modalBtnConfirmDelete.disabled = false;
            modalBtnConfirmDelete.classList.add('hidden');
        }
        if (modalBtnCancel) {
            modalBtnCancel.disabled = false;
            modalBtnCancel.textContent = 'Zatvoriť';
        }
    }
}