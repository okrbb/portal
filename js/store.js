/* js/store.js - Centralized State Management with Real-time Support & Normalization */
import { db, auth } from './config.js';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    getDoc 
} from 'firebase/firestore';
import { 
    getEmployeesFromIDB, 
    saveEmployeesToIDB 
} from './db_service.js';

class CentralStore {
    constructor() {
        // Inicializácia stavu
        this.state = {
            user: null,           
            employees: new Map(), 
            meta: {               
                employeesVersion: 0
            },
            isLoading: false,
            lastError: null
        };
        
        this.listeners = [];
        this.activeListeners = new Map(); // Register pre aktívne Firestore listenery
        this.loadingPromise = null; // ✅ NOVÉ: Promise pre zamedzenie race conditions
    }

    // ==========================================
    // GETTERS
    // ==========================================
    
    getUser() { return this.state.user; }
    getEmployees() { return this.state.employees; }
    getEmployee(id) { return this.state.employees.get(id); }
    getDB() { return db; }
    getAuth() { return auth; }

    /**
     * ✅ NOVÉ: Počká na dokončenie inicializácie dát (rieši race conditions)
     * @returns {Promise<void>}
     */
    async waitUntilReady() {
        // Ak loadingPromise existuje, počkáme na dokončenie načítania
        if (this.loadingPromise) {
            console.log('[Store] Čaká sa na dokončenie načítania...');
            await this.loadingPromise;
        }
        
        // Ak ešte neboli načítané zamestnanci, spustíme načítanie
        if (this.state.employees.size === 0 && !this.state.isLoading) {
            console.log('[Store] Spúšťa sa načítanie zamestnancov...');
            await this.loadEmployees();
        }
        
        console.log('[Store] Store je pripravený. Zamestnanci:', this.state.employees.size);
    }

    // ==========================================
    // ACTIONS
    // ==========================================

    setUser(userProfile) {
        this.state.user = userProfile;
        this.notify(['user']);
    }

    setLoading(isLoading) {
        this.state.isLoading = isLoading;
        this.notify(['isLoading']);
    }

    setError(error) {
        this.state.lastError = error;
        this.notify(['lastError']);
    }

    /**
     * Načíta zamestnancov s Real-time podporou a zachovaním formátu dát
     */
    async loadEmployees(force = false) {
        // Prevencia duplicitných listenerov
        if (this.activeListeners.has('employees') && !force) {
            console.log('[Store] Real-time stream pre zamestnancov už je aktívny.');
            return;
        }

        // ✅ OPRAVA: Promise-based race condition protection
        if (this.loadingPromise) {
            console.log('[Store] Čaká sa na prebiehajúce načítanie zamestnancov...');
            return this.loadingPromise;
        }

        // Prevencia race condition: ak už načítava, nezačínať znovu
        if (this.state.isLoading) {
            console.log('[Store] Načítanie zamestnancov už prebieha.');
            return;
        }

        if (this.activeListeners.has('employees')) {
            this.activeListeners.get('employees')();
            this.activeListeners.delete('employees');
        }

        // ✅ OPRAVA: Vytvorenie Promise pre sledovanie načítania
        this.loadingPromise = (async () => {
            this.setLoading(true);

            try {
            // 1. Offline-first: Načítanie z IndexedDB pre okamžitý štart
            const cachedData = await getEmployeesFromIDB();
            if (cachedData) {
                const cachedArray = Array.isArray(cachedData) ? cachedData : (cachedData.data || []);
                if (cachedArray.length > 0) {
                    const empMap = new Map();
                    cachedArray.forEach(item => {
                        // Ošetrenie formátu (či ide o pole [id, obj] alebo čistý objekt)
                        const emp = Array.isArray(item) ? item[1] : item;
                        const id = emp.id || (Array.isArray(item) ? item[0] : null);
                        if (id) empMap.set(id, emp);
                    });
                    this.state.employees = empMap;
                    this.notify(['employees']);
                }
            }

            // 2. Real-time synchronizácia s Firestore
            const q = query(collection(db, 'employees'), orderBy('priezvisko', 'asc'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const employeesMap = new Map();
                const employeesArray = [];

                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    
                    // KĽÚČOVÉ: Použitie pôvodnej logiky ID (kód alebo Firestore ID)
                    const empId = data.kod || docSnap.id;
                    
                    // KĽÚČOVÉ: Normalizácia dát pre UI (displayName atď.)
                    let kontakt = (data.kontakt && String(data.kontakt).trim() !== '') 
                                  ? String(data.kontakt).trim() 
                                  : 'Neznáme číslo';

                    const empObj = {
                        ...data, 
                        id: empId,
                        displayName: `${data.titul || ''} ${data.meno} ${data.priezvisko}`.trim(),
                        displayFunkcia: data.funkcia || 'Nezaradený',
                        displayTelefon: kontakt
                    };

                    employeesMap.set(empId, empObj);
                    employeesArray.push(empObj);
                });

                // Aktualizácia stavu a Cache
                this.state.employees = employeesMap;
                saveEmployeesToIDB(employeesArray);

                console.log(`[Store] Sync: ${this.state.employees.size} zamestnancov.`);
                this.setLoading(false);
                this.notify(['employees']);
            }, (error) => {
                console.error("[Store] Firestore Error:", error);
                this.setError(error);
                this.setLoading(false);
            });

            this.activeListeners.set('employees', unsubscribe);

            } catch (error) {
                console.error('[Store] Load error:', error);
                this.setError(error);
                this.setLoading(false);
            } finally {
                // ✅ OPRAVA: Vyčistenie loadingPromise po dokončení
                this.loadingPromise = null;
            }
        })();

        return this.loadingPromise;
    }

    // ==========================================
    // REAKTIVITA
    // ==========================================

    subscribe(listener, watchedKeys = null) {
        if (watchedKeys) {
            listener.watchedKeys = watchedKeys;
        }
        this.listeners.push(listener);
        
        // KĽÚČOVÉ: Okamžité zavolanie listenera pri prihlásení
        listener(this.state);
        
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify(changedKeys = null) {
        this.listeners.forEach(listener => {
            if (listener.watchedKeys && changedKeys) {
                const hasChange = changedKeys.some(key => listener.watchedKeys.includes(key));
                if (!hasChange) return;
            }
            listener(this.state);
        });
    }

    resetState() {
        this.activeListeners.forEach(unsub => unsub());
        this.activeListeners.clear();
        this.loadingPromise = null; // ✅ Reset loading promise
        this.state = {
            user: null,
            employees: new Map(),
            meta: { employeesVersion: 0 },
            isLoading: false,
            lastError: null
        };
        this.listeners = [];
        console.log('[Store] Reset hotovo.');
    }
}

export const store = new CentralStore();