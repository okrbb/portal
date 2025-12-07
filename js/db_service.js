/* js/db_service.js - Wrapper pre IndexedDB (v2 - Employees + AI) */

const DB_NAME = 'OKR_Portal_DB';
const DB_VERSION = 2; // ZMENA: Zvýšili sme verziu, aby sa vytvoril nový store
const STORE_EMPLOYEES = 'employees';
const STORE_AI = 'ai_cache'; // NOVÉ: Store pre RAG index

/**
 * Otvorí databázu a vytvorí štruktúru.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // 1. Store pre zamestnancov (ak neexistuje)
            if (!db.objectStoreNames.contains(STORE_EMPLOYEES)) {
                db.createObjectStore(STORE_EMPLOYEES, { keyPath: 'id' });
            }

            // 2. NOVÉ: Store pre AI index (ak neexistuje)
            if (!db.objectStoreNames.contains(STORE_AI)) {
                db.createObjectStore(STORE_AI, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(`IndexedDB chyba: ${event.target.errorCode}`);
    });
}

// === SEKCE: ZAMESTNANCI (Pôvodné funkcie) ===

export async function saveEmployeesToIDB(employeesArray, version = 0) {
    const db = await openDB(); // Vaša existujúca openDB funkcia
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_EMPLOYEES], 'readwrite');
        const store = tx.objectStore(STORE_EMPLOYEES);
        
        // Uložíme metadata vrátane verzie
        store.put({ 
            id: 'meta_cache_info', 
            timestamp: Date.now(),
            version: version // <--- NOVÉ POLE
        });
        
        store.put({ id: 'all_employees_data', data: employeesArray });
        
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject('Chyba IDB Employees');
    });
}

export async function getEmployeesFromIDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_EMPLOYEES], 'readonly');
        const store = tx.objectStore(STORE_EMPLOYEES);
        
        const rData = store.get('all_employees_data');
        const rMeta = store.get('meta_cache_info');
        
        tx.oncomplete = () => {
            if (rData.result && rMeta.result) {
                resolve({ 
                    data: rData.result.data, 
                    timestamp: rMeta.result.timestamp,
                    version: rMeta.result.version || 0 // <--- VRÁTIME VERZIU
                });
            } else resolve(null);
        };
        tx.onerror = () => reject('Chyba IDB Read');
    });
}

export async function clearEmployeesIDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_EMPLOYEES], 'readwrite');
        tx.objectStore(STORE_EMPLOYEES).clear();
        tx.oncomplete = () => resolve();
    });
}

// === NOVÁ SEKCE: AI RAG INDEX ===

/**
 * Uloží serializovaný JSON index MiniSearchu do IDB.
 */
export async function saveAIIndexToIDB(jsonIndex) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_AI], 'readwrite');
        const store = tx.objectStore(STORE_AI);

        // Uložíme index a časovú pečiatku
        store.put({ 
            id: 'rag_index_data', 
            index: jsonIndex, 
            timestamp: Date.now() 
        });

        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject('Chyba pri ukladaní AI Indexu');
    });
}

/**
 * Načíta index z IDB.
 */
export async function getAIIndexFromIDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_AI], 'readonly');
        const store = tx.objectStore(STORE_AI);
        const request = store.get('rag_index_data');

        tx.oncomplete = () => {
            if (request.result) {
                resolve({
                    index: request.result.index,
                    timestamp: request.result.timestamp
                });
            } else {
                resolve(null);
            }
        };
        tx.onerror = () => reject('Chyba pri čítaní AI Indexu');
    });
}

/**
 * Vymaže cache AI indexu (pre vynútený reload)
 */
export async function clearAIIndexIDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_AI], 'readwrite');
        tx.objectStore(STORE_AI).clear();
        tx.oncomplete = () => resolve();
    });
}