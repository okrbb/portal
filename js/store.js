/* js/store.js - Centralized State Management (Singleton) */
import { db, auth } from './config.js';
import { 
    collection, 
    query, 
    orderBy, 
    getDocs, 
    doc, 
    getDoc 
} from 'firebase/firestore';
import { 
    getEmployeesFromIDB, 
    saveEmployeesToIDB,
    getAIIndexFromIDB,
    saveAIIndexToIDB 
} from './db_service.js';

class CentralStore {
    constructor() {
        // Inicializácia stavu
        this.state = {
            user: null,           // Objekt prihláseného používateľa
            employees: new Map(), // Všetci zamestnanci (Map pre rýchle vyhľadávanie podľa ID)
            meta: {               // Metadata (verzie atď.)
                employeesVersion: 0
            },
            isLoading: false,
            lastError: null
        };
        
        // Zoznam poslucháčov (subscribers) pre reaktivitu
        this.listeners = [];
    }

    // ==========================================
    // GETTERS (Čítanie dát)
    // ==========================================
    
    /** Vráti aktuálneho používateľa */
    getUser() { 
        return this.state.user; 
    }

    /** Vráti Mapu všetkých zamestnancov */
    getEmployees() { 
        return this.state.employees; 
    }

    /** Vráti konkrétneho zamestnanca podľa ID */
    getEmployee(id) { 
        return this.state.employees.get(id); 
    }

    /** Vráti DB inštanciu (pre priame použitie v moduloch ak treba) */
    getDB() { 
        return db; 
    }

    /** Vráti Auth inštanciu */
    getAuth() {
        return auth;
    }

    // ==========================================
    // ACTIONS (Zmena stavu)
    // ==========================================

    /**
     * Nastaví aktívneho používateľa
     * @param {Object} userProfile - Profil používateľa z Firebase/DB
     */
    setUser(userProfile) {
        this.state.user = userProfile;
        this.notify();
    }

    /**
     * Načíta zamestnancov (SmartLoad logika - Cache First)
     * @param {boolean} forceRefresh - Ak true, vynúti stiahnutie z Firestore
     */
    async loadEmployees(forceRefresh = false) {
        this.setLoading(true);

        try {
            // 1. Zistíme verziu na serveri (Check Metadata)
            let serverVersion = 0;
            try {
                const metaRef = doc(db, 'settings', 'metadata');
                const metaSnap = await getDoc(metaRef);
                if (metaSnap.exists()) {
                    serverVersion = metaSnap.data().employeesVersion || 0;
                }
            } catch (e) {
                console.warn("[Store] Nepodarilo sa načítať verziu metadát, pokračujem s verziou 0.");
            }

            // 2. Skúsime načítať z lokálnej Cache (IndexedDB)
            if (!forceRefresh) {
                const cachedRecord = await getEmployeesFromIDB();
                const localVersion = cachedRecord ? cachedRecord.version : -1;

                // Ak verzie sedia, použijeme cache
                if (cachedRecord && cachedRecord.data && localVersion === serverVersion) {
                    console.log(`[Store] Dáta sú aktuálne (v${localVersion}). Načítavam z Cache.`);
                    
                    this.state.employees.clear();
                    cachedRecord.data.forEach(item => {
                        // item je pole [key, value] z Mapy
                        this.state.employees.set(item[0], item[1]);
                    });
                    
                    this.state.meta.employeesVersion = localVersion;
                    this.setLoading(false);
                    return; 
                }
                console.log(`[Store] Verzia nesedí (Server: ${serverVersion} vs Local: ${localVersion}). Sťahujem nové dáta...`);
            }

            // 3. Fallback: Stiahnutie z Firestore
            console.log('[Store] Sťahujem zamestnancov z Firestore...');
            const q = query(collection(db, "employees"), orderBy("priezvisko"));
            const snapshot = await getDocs(q);
            
            this.state.employees.clear();
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const empId = data.kod || docSnap.id;
                
                // Normalizácia dát (rovnaká logika ako v mainWizard.js)
                let kontakt = '';
                if (data.kontakt && String(data.kontakt).trim() !== '') {
                    kontakt = String(data.kontakt).trim();
                }

                const empObj = {
                    ...data, 
                    id: empId,
                    displayName: `${data.titul || ''} ${data.meno} ${data.priezvisko}`.trim(),
                    displayFunkcia: data.funkcia || 'Nezaradený',
                    displayTelefon: kontakt || 'Neznáme číslo'
                };

                this.state.employees.set(empId, empObj);
            });

            // 4. Uloženie do Cache (IndexedDB) pre budúce použitie
            // Konvertujeme Map na Array pre uloženie do JSON/IDB
            const dataToSave = Array.from(this.state.employees.entries());
            await saveEmployeesToIDB(dataToSave, serverVersion);
            this.state.meta.employeesVersion = serverVersion;

            console.log(`[Store] Hotovo. Načítaných ${this.state.employees.size} zamestnancov.`);

        } catch (error) {
            console.error("[Store] Chyba pri načítaní zamestnancov:", error);
            this.state.lastError = error;
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * Pomocná metóda pre nastavenie loading stavu
     */
    setLoading(isLoading) {
        this.state.isLoading = isLoading;
        this.notify();
    }

    // ==========================================
    // SUBSCRIPTION SYSTEM (Reaktivita)
    // ==========================================

    /**
     * Prihlásenie sa na odber zmien
     * @param {Function} listener - Funkcia, ktorá sa zavolá pri zmene stavu
     * @returns {Function} Funkcia na odhlásenie (unsubscribe)
     */
    subscribe(listener) {
        this.listeners.push(listener);
        // Hneď po prihlásení vrátime aktuálny stav
        listener(this.state);
        
        // Return unsubscribe function
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Upozorní všetkých poslucháčov na zmenu
     */
    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}

// Exportujeme inštanciu (Singleton) - v celej appke sa importuje táto jedna inštancia
export const store = new CentralStore();