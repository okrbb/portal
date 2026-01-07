/* logs_module.js - SIMPLIFIED VERSION (Admin functions moved to admin_panel_module.js) */
import { store } from './store.js';
import { safeAsync } from './utils.js';
import { addDocument } from './firebase_helpers.js';

/* =================================== */
/* MODUL PRE LOGOVANIE A AUDIT         */
/* (logs_module.js) - SIMPLIFIED       */
/* =================================== */

/**
 * Inicializuje modul logov.
 * Poznámka: Admin funkcie (download, delete) sú teraz v admin_panel_module.js
 */
export function initializeLogsModule() {
    console.log('[LogsModule] Inicializujem modul Logov (Simplified verzia)...');
    // Admin funkcie sú teraz v Settings menu - žiadne listenery na iniciály
}

/**
 * Update user - už nerobí nič, kompatibilita
 */
export function updateLogsUser() {
    // Admin funkcie sú v admin_panel_module.js
}

/**
 * Univerzálna funkcia na zápis akcie do logov.
 * @param {string} action - Názov akcie (napr. "LOGIN", "EDIT_VACATION")
 * @param {string} details - Detaily akcie
 * @param {boolean} success - Či akcia bola úspešná
 * @param {string|null} error - Chybová hláška (ak je zlyhanie)
 */
export async function logUserAction(action, details, success = true, error = null) {
    const db = store.getDB();
    const user = store.getUser();

    if (!db) {
        console.warn("[LogsModule] DB nie je inicializovaná, log sa nezapíše.");
        return;
    }

    await safeAsync(
        () => addDocument('access_logs', {
            email: user?.email || 'neznamy@email.sk',
            meno: user?.displayName || user?.meno || 'Neznámy',
            oec: user?.oec || 'N/A',
            funkcia: user?.funkcia || 'N/A',
            action: action,
            details: details,
            success: success,
            error: error
            // timestamp sa pridá automaticky v addDocument
        }),
        'Chyba pri zápise logu',
        { showToastOnError: false } // Tichý fallback
    );
}

/**
 * Export getLogsCount pre kompatibilitu
 */
export async function getLogsCount() {
    const db = store.getDB();
    if (!db) return 0;
    
    try {
        const { getCountFromServer, collection } = await import('firebase/firestore');
        const coll = collection(db, "access_logs");
        const snapshot = await getCountFromServer(coll);
        return snapshot.data().count;
    } catch (error) {
        console.error("Chyba pri počítaní logov:", error);
        return 0;
    }
}
