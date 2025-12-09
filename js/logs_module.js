/* logs_module.js - Optimized SDK v9+ (Store Integrated) */
import { store } from './store.js'; // CENTRÁLNY STORE
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    orderBy, 
    deleteDoc, 
    writeBatch, 
    serverTimestamp,
    where,
    limit,
    getCountFromServer
} from 'firebase/firestore';

import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';

/* =================================== */
/* MODUL PRE LOGOVANIE A AUDIT         */
/* (logs_module.js) - OPTIMALIZOVANÝ   */
/* =================================== */

/**
 * Inicializuje modul logov.
 */
export function initializeLogsModule() {
    console.log('Inicializujem modul Logov (Store verzia)...');
    
    // Nastavenie listenerov (ak je user už prihlásený)
    setupLogListeners();
    initDeleteModalListeners();

    // Reaktivita: Ak sa zmení user, obnovíme listenery
    // (Toto je voliteľné, ak sa inicializácia volá až po prihlásení v mainWizarde)
}

/**
 * Nastaví listenery pre admina (klik na iniciály).
 * Táto funkcia nahrádza starú updateLogsUser.
 */
export function updateLogsUser() {
    setupLogListeners();
}

function setupLogListeners() {
    const user = store.getUser();
    if (!user) return;

    if (Permissions.canManageLogs(user)) {
        const userInitialsButton = document.querySelector('#sidebar-user-initials');
        if (userInitialsButton) {
            userInitialsButton.classList.add('clickable-logs'); 
            userInitialsButton.setAttribute('title', 'Ľavý klik: stiahnuť logy\nPravý klik: zmazať logy'); 
            
            // Clone node na odstránenie starých listenerov pri re-init
            const newBtn = userInitialsButton.cloneNode(true);
            userInitialsButton.parentNode.replaceChild(newBtn, userInitialsButton);
            
            newBtn.addEventListener('click', downloadAccessLogs);
            newBtn.addEventListener('contextmenu', handleDeleteLogsRequest);
            
            console.log('Log modul: Listenery pre admina nastavené.');
        }
    }
}

function initDeleteModalListeners() {
    const modalBtnCancel = document.querySelector('#modal-btn-cancel');
    const modalBtnConfirmDelete = document.querySelector('#modal-btn-confirm-delete');
    const deleteModalOverlay = document.querySelector('#delete-logs-overlay');

    if (modalBtnCancel) {
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
 */
export async function logUserAction(action, details, success = true, error = null) {
    const db = store.getDB();
    const user = store.getUser();

    if (!db) {
        console.warn("LogsModule: DB nie je inicializovaná, log sa nezapíše.");
        return;
    }

    try {
        const logData = {
            timestamp: serverTimestamp(),
            email: user?.email || 'neznamy@email.sk',
            meno: user?.displayName || user?.meno || 'Neznámy',
            oec: user?.oec || 'N/A',
            funkcia: user?.funkcia || 'N/A',
            action: action,
            details: details,
            success: success,
            error: error
        };

        await addDoc(collection(db, "access_logs"), logData);

    } catch (err) {
        console.error('[LOG] Chyba pri zápise logu:', err);
    }
}

// --- INTERNÉ FUNKCIE PRE SŤAHOVANIE A MAZANIE ---

async function downloadAccessLogs() {
    const userInitialsButton = document.querySelector('#sidebar-user-initials');
    if (!userInitialsButton || userInitialsButton.classList.contains('downloading')) return; 
    
    // === OCHRANA KVÓTY (FREE TIER PROTECTION) ===
    const downloadMode = confirm(
        "Chcete stiahnuť logy len za posledných 30 dní (Odporúčané)?\n\n" +
        "OK = Posledných 30 dní (Šetrí databázu)\n" +
        "Zrušiť = Stiahnuť VŠETKO (Môže vyčerpať denný limit!)"
    );

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
        const db = store.getDB();
        const logsRef = collection(db, "access_logs");
        let q;

        if (downloadMode) {
            // MOŽNOSŤ A: Bezpečné sťahovanie (Posledných 30 dní)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            q = query(
                logsRef, 
                where("timestamp", ">=", thirtyDaysAgo),
                orderBy("timestamp", "desc"),
                limit(2000) 
            );
            console.log("[Logs] Sťahujem optimalizované logy (30 dní / max 2000).");
        } else {
            // MOŽNOSŤ B: Všetko (Nebezpečné pre Free Tier)
            q = query(logsRef, orderBy("timestamp", "desc"), limit(5000));
            console.warn("[Logs] POZOR: Sťahujem hromadné logy (max 5000).");
        }

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            modalMessage.textContent = 'Za vybrané obdobie sa nenašli žiadne logy.';
            userInitialsButton.classList.remove('downloading');
            return;
        }

        const headers = ["Časová pečiatka", "E-mail", "Meno", "OEČ", "Funkcia", "Akcia", "Detaily", "Stav", "Chybová hláška"];
        const data = snapshot.docs.map(docSnap => {
            const log = docSnap.data();
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
                log.action || 'LOGIN', 
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
        
        modalMessage.textContent = `Logy boli úspešne stiahnuté (${snapshot.size} záznamov).`;

    } catch (error) {
        console.error('Chyba pri sťahovaní logov:', error);
        modalMessage.textContent = 'Nastala chyba pri sťahovaní logov. Skúste neskôr.';
    } finally {
        userInitialsButton.classList.remove('downloading');
    }
}

async function handleDeleteLogsRequest(event) {
    event.preventDefault(); 

    const deleteModalOverlay = document.querySelector('#delete-logs-overlay');
    const modalMessage = deleteModalOverlay ? deleteModalOverlay.querySelector('p') : null;

    if (deleteModalOverlay && modalMessage) {
        modalMessage.textContent = 'Analyzujem počet logov...';
        deleteModalOverlay.classList.remove('hidden');
    }

    const totalLogs = await getLogsCount();

    const modalBtnConfirmDelete = document.querySelector('#modal-btn-confirm-delete');
    const modalBtnCancel = document.querySelector('#modal-btn-cancel');

    if (!deleteModalOverlay || !modalMessage) return;

    if (totalLogs === 0) {
         modalMessage.innerHTML = 'V databáze nie sú žiadne logy na vymazanie.';
         if (modalBtnConfirmDelete) modalBtnConfirmDelete.classList.add('hidden');
         if (modalBtnCancel) modalBtnCancel.textContent = 'Zatvoriť';
    } else {
        modalMessage.innerHTML = `V databáze je celkom <strong>${totalLogs}</strong> logov.<br><br>
        Naozaj chcete zmazať najstarších 500 záznamov?<br>
        <small>(Pre úplné vymazanie opakujte akciu)</small>`;

        if (modalBtnConfirmDelete) {
            modalBtnConfirmDelete.classList.remove('hidden', 'loading');
            modalBtnConfirmDelete.disabled = false;
        }
        if (modalBtnCancel) {
            modalBtnCancel.classList.remove('hidden');
            modalBtnCancel.disabled = false;
            modalBtnCancel.textContent = 'Zrušiť';
        }
    }
}

async function executeBatchDelete() {
    console.log('Spúšťam mazanie logov (Optimalizované)...');
    const db = store.getDB();
    const modalMessage = document.querySelector('#delete-logs-overlay p');
    const modalBtnConfirmDelete = document.querySelector('#modal-btn-confirm-delete');
    const modalBtnCancel = document.querySelector('#modal-btn-cancel');

    if (modalMessage) modalMessage.textContent = 'Prebieha mazanie...';
    if (modalBtnConfirmDelete) {
        modalBtnConfirmDelete.disabled = true;
        modalBtnConfirmDelete.classList.add('loading');
    }
    if (modalBtnCancel) modalBtnCancel.disabled = true;

    try {
        const logsRef = collection(db, "access_logs");
        
        // Len 500 kusov pre bezpečnosť
        const q = query(logsRef, orderBy("timestamp", "asc"), limit(500));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            if (modalMessage) modalMessage.textContent = 'Nenašli sa žiadne logy na mazanie.';
            return;
        }

        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        if (modalMessage) modalMessage.textContent = `Úspešne zmazaných ${snapshot.size} najstarších logov. Pre zmazanie ďalších opakujte akciu.`;

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

/**
 * Zistí celkový počet logov.
 */
export async function getLogsCount() {
    const db = store.getDB();
    if (!db) return 0;
    try {
        const coll = collection(db, "access_logs");
        const snapshot = await getCountFromServer(coll);
        return snapshot.data().count;
    } catch (error) {
        console.error("Chyba pri počítaní logov:", error);
        return 0;
    }
}