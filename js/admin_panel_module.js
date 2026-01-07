/* admin_panel_module.js */
import { store } from './store.js';
import { Permissions } from './accesses.js';
import { showToast, TOAST_TYPE } from './utils.js';
import { collection, query, where, orderBy, limit, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { performFullBackup } from './backup_service.js';
import { restoreCollectionFromFile } from './restore_service.js';
import { IDs } from './id-registry.js';
import { isDemoUser } from './demo_mode.js';

/**
 * =============================================
 * ADMIN PANEL MODULE
 * Centrálne ovládanie pre admin funkcie
 * VERSION: 1.3.0 - Idempotent Initialization
 * =============================================
 */

// ✅ NOVÉ: Flag pre idempotentné volanie
let isAdminPanelInitialized = false;

/**
 * Inicializácia admin funkcií
 */
export function initializeAdminPanel() {
    // ✅ OPRAVA: Prevencia duplicitného pridávania event listenerov
    if (isAdminPanelInitialized) {
        console.log('[AdminPanel] Admin panel už bol inicializovaný, preskakujem.');
        updateAdminPanel(); // Aktualizuj iba viditeľnosť
        return;
    }

    const user = store.getUser();
    
    console.log('[AdminPanel] Inicializujem admin funkcie...');

    // === RELOAD (Hard Refresh) ===
    const reloadBtn = document.getElementById(IDs.NAV.RELOAD_BTN);
    if (reloadBtn) {
        reloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const activeUser = store.getUser();
            
            // 🔥 DEMO REŽIM: Zakázať obnovenie aplikácie
            if (isDemoUser(activeUser?.email)) {
                showToast('V režime ukážky je táto interakcia zablokovaná.', TOAST_TYPE.WARNING);
                return false;
            }
            
            if (confirm('Naozaj chcete obnoviť aplikáciu? Neuložené zmeny budú stratené.')) {
                // Vymazanie všetkých cache
                if ('caches' in window) {
                    caches.keys().then(names => {
                        names.forEach(name => caches.delete(name));
                    });
                }
                // Hard reload
                window.location.reload(true);
            }
            return false;
        });
    }

    // === CHANGE PASSWORD ===
    const changePasswordBtn = document.getElementById(IDs.NAV.CHANGE_PASSWORD_BTN);
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            showToast('Funkcia zmeny hesla je dostupná cez Firebase Console.', TOAST_TYPE.INFO);
        });
    }

    // === BACKUP DATA ===
    const backupBtn = document.getElementById(IDs.ADMIN.BACKUP_DATA_BTN);
    if (backupBtn && Permissions.canManageLogs(user)) {
        backupBtn.style.display = 'block';
        backupBtn.addEventListener('click', async () => {
            await performFullBackup();
        });
    }

    // === RESTORE DATA ===
    const restoreBtn = document.getElementById(IDs.ADMIN.RESTORE_DATA_BTN);
    if (restoreBtn && Permissions.canManageLogs(user)) {
        restoreBtn.style.display = 'block';
        restoreBtn.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    restoreCollectionFromFile(file);
                }
            };
            fileInput.click();
        });
    }

    // === DOWNLOAD ACCESS LOGS ===
    const downloadLogsBtn = document.getElementById(IDs.ADMIN.DOWNLOAD_ACCESS_LOGS_BTN);
    if (downloadLogsBtn && Permissions.canManageLogs(user)) {
        downloadLogsBtn.style.display = 'block';
        downloadLogsBtn.addEventListener('click', async () => {
            await downloadAccessLogs();
        });
    }

    // === DELETE ACCESS LOGS ===
    const deleteLogsBtn = document.getElementById(IDs.ADMIN.DELETE_ACCESS_LOGS_BTN);
    if (deleteLogsBtn && Permissions.canManageLogs(user)) {
        deleteLogsBtn.style.display = 'block';
        deleteLogsBtn.addEventListener('click', async () => {
            await deleteAccessLogs();
        });
    }

    // ✅ OPRAVA: Označenie ako inicializované
    isAdminPanelInitialized = true;
    console.log('[AdminPanel] Admin funkcie inicializované.');
}

/**
 * Reset admin panelu (pre účely testovania alebo reinicializácie)
 */
export function resetAdminPanel() {
    isAdminPanelInitialized = false;
    console.log('[AdminPanel] Admin panel reset.');
}

/**
 * Sťahovanie Access Logs
 */
async function downloadAccessLogs() {
    const db = store.getDB();
    if (!db) {
        showToast('Databáza nie je pripojená.', TOAST_TYPE.ERROR);
        return;
    }

    try {
        showToast('Sťahujem access logy...', TOAST_TYPE.INFO);

        const logsRef = collection(db, 'access_logs');
        const q = query(logsRef, orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);

        const logs = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            logs.push({
                timestamp: data.timestamp?.toDate().toISOString() || '',
                email: data.email || '',
                meno: data.meno || '',
                action: data.action || '',
                details: data.details || '',
                success: data.success !== false,
                error: data.error || ''
            });
        });

        if (logs.length === 0) {
            showToast('Žiadne logy na stiahnutie.', TOAST_TYPE.WARNING);
            return;
        }

        // Konverzia na JSON a stiahnutie
        const jsonString = JSON.stringify(logs, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `access_logs_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showToast(`Stiahnutých ${logs.length} logov.`, TOAST_TYPE.SUCCESS);

    } catch (error) {
        console.error('Chyba pri sťahovaní logov:', error);
        showToast('Chyba pri sťahovaní logov.', TOAST_TYPE.ERROR);
    }
}

/**
 * Vymazanie Access Logs
 */
async function deleteAccessLogs() {
    if (!confirm('POZOR: Táto akcia vymaže VŠETKY prístupové logy. Pokračovať?')) {
        return;
    }

    const db = store.getDB();
    if (!db) return;

    try {
        showToast('Mažem access logy...', TOAST_TYPE.INFO);

        const logsRef = collection(db, 'access_logs');
        const snapshot = await getDocs(logsRef);

        const deletePromises = [];
        snapshot.forEach(docSnap => {
            deletePromises.push(deleteDoc(doc(db, 'access_logs', docSnap.id)));
        });

        await Promise.all(deletePromises);

        showToast(`Vymazaných ${deletePromises.length} logov.`, TOAST_TYPE.SUCCESS);

    } catch (error) {
        console.error('Chyba pri mazaní logov:', error);
        showToast('Chyba pri mazaní logov.', TOAST_TYPE.ERROR);
    }
}

/**
 * Dynamicky aktualizuje viditeľnosť admin prvkov v UI
 * Volané z mainWizard.js pri zmene stavu (napr. po prihlásení)
 */
export function updateAdminPanel() {
    const user = store.getUser();
    if (!user) return;

    // 1. Získame všetky prvky označené ako admin položky
    // V index.html sú to prvky s atribútom data-admin-item="true"
    const adminElements = document.querySelectorAll('[data-admin-item="true"]');

    adminElements.forEach(el => {
        const id = el.id;
        let hasPermission = false;

        // Rozhodnutie o viditeľnosti podľa typu tlačidla a matice prístupov
        switch (id) {
            case 'backup-data-btn':
            case 'restore-data-btn':
            case 'download-access-logs-btn':
            case 'delete-access-logs-btn':
                hasPermission = Permissions.canManageLogs(user);
                break;
            case 'export-excel-btn':
                hasPermission = Permissions.canExportEmployees(user);
                break;
            default:
                // Pre ostatné položky v admin sekcii (napr. Reload, Change Pass)
                hasPermission = Permissions.canManageLogs(user);
        }

        // Zobrazenie alebo skrytie elementu
        el.style.display = hasPermission ? 'block' : 'none';
    });

    console.log('[AdminPanel] Viditeľnosť admin prvkov aktualizovaná.');
}
