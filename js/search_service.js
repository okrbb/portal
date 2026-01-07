/* js/search_service.js - Centralizovaný vyhľadávací service */

/**
 * Singleton service pre konzistentné vyhľadávanie cez Web Worker
 * Konsoliduje logiku z contacts_module.js a ai_module.js
 */
class SearchService {
    constructor() {
        this.worker = null;
        this.pendingRequests = new Map();
        this.isInitialized = false;
        this.indexedCollections = new Set();
    }
    
    /**
     * Inicializácia workera
     * @param {Worker} worker - Web Worker inštancia (voliteľné, vytvorí sa automaticky)
     */
    init(worker = null) {
        if (this.isInitialized) {
            console.warn('[SearchService] Už je inicializovaný');
            return;
        }
        
        // Použiť poskytnutého workera alebo vytvoriť nového
        if (worker) {
            this.worker = worker;
        } else {
            try {
                this.worker = new Worker('./js/search_worker.js', { type: 'module' });
            } catch (error) {
                console.error('[SearchService] Nepodarilo sa vytvoriť worker:', error);
                return;
            }
        }
        
        // Setup message handler
        this.worker.addEventListener('message', this._handleWorkerMessage.bind(this));
        
        this.isInitialized = true;
        console.log('[SearchService] Inicializovaný');
    }
    
    /**
     * Interný handler pre správy z workera
     */
    _handleWorkerMessage(e) {
        const { type, requestId, results } = e.data;
        
        switch (type) {
            case 'SEARCH_RESULTS':
                if (requestId && this.pendingRequests.has(requestId)) {
                    const resolver = this.pendingRequests.get(requestId);
                    resolver(results || []);
                    this.pendingRequests.delete(requestId);
                }
                break;
                
            case 'INDEX_READY':
                console.log('[SearchService] Index pripravený');
                break;
                
            default:
                console.warn('[SearchService] Neznámy typ správy:', type);
        }
    }
    
    /**
     * Univerzálne vyhľadávanie
     * @param {string} query - Vyhľadávací dotaz
     * @param {Object} options - Konfigurácia vyhľadávania
     * @returns {Promise<Array>} Pole výsledkov
     */
    async search(query, options = {}) {
        if (!this.isInitialized || !this.worker) {
            console.error('[SearchService] Service nie je inicializovaný');
            return [];
        }
        
        if (!query || query.trim() === '') {
            return [];
        }
        
        const requestId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timeout = options.timeout || 10000; // 10s default timeout
        
        return new Promise((resolve) => {
            // Uložiť resolver
            this.pendingRequests.set(requestId, resolve);
            
            // Poslať požiadavku workerovi
            this.worker.postMessage({
                type: 'SEARCH',
                payload: {
                    query: query.trim(),
                    requestId,
                    options: {
                        fuzzy: options.fuzzy ?? 0.2,
                        prefix: options.prefix ?? true,
                        filterType: options.filterType || null,
                        boost: options.boost || {},
                        ...options
                    }
                }
            });
            
            // Timeout fallback
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    console.warn(`[SearchService] Timeout pre: "${query}"`);
                    resolve([]);
                    this.pendingRequests.delete(requestId);
                }
            }, timeout);
        });
    }
    
    /**
     * Indexovanie dát pre vyhľadávanie
     * @param {Array} data - Pole objektov na indexovanie
     * @param {string} collectionType - Typ kolekcie (pre tracking)
     */
    indexData(data, collectionType = 'unknown') {
        if (!this.isInitialized || !this.worker) {
            console.error('[SearchService] Service nie je inicializovaný');
            return;
        }
        
        if (!Array.isArray(data)) {
            console.error('[SearchService] Data musia byť pole');
            return;
        }
        
        this.worker.postMessage({
            type: 'INDEX_DATA',
            payload: data
        });
        
        this.indexedCollections.add(collectionType);
        console.log(`[SearchService] Indexovaných ${data.length} záznamov (${collectionType})`);
    }
    
    /**
     * Vyčistenie indexu
     */
    clearIndex() {
        if (!this.worker) return;
        
        this.worker.postMessage({ type: 'CLEAR_INDEX' });
        this.indexedCollections.clear();
        console.log('[SearchService] Index vyčistený');
    }
    
    /**
     * Ukončenie workera
     */
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        
        this.pendingRequests.clear();
        this.indexedCollections.clear();
        this.isInitialized = false;
        console.log('[SearchService] Ukončený');
    }
    
    // ============================================
    // === ŠPECIALIZOVANÉ VYHĽADÁVACIE METÓDY ===
    // ============================================
    
    /**
     * Vyhľadávanie kontaktov (obce, mestá)
     * @param {string} query - Vyhľadávací dotaz
     * @param {Object} filters - Dodatočné filtre (napr. okres)
     * @returns {Promise<Array>} Pole kontaktov
     */
    async searchContacts(query, filters = {}) {
        const results = await this.search(query, {
            filterType: 'contact',
            fuzzy: 0.2,
            prefix: true,
            boost: { 
                title: 3,        // názov obce
                municipality: 3, 
                mayor: 2         // meno starostu
            }
        });
        
        // Aplikovať dodatočné filtre (napr. okres)
        if (filters.okres && filters.okres !== 'all') {
            return results.filter(c => c.okres === filters.okres);
        }
        
        return results;
    }
    
    /**
     * Vyhľadávanie legislatívy (dokumenty, zákony)
     * @param {string} query - Vyhľadávací dotaz
     * @returns {Promise<Array>} Pole dokumentov
     */
    async searchLegislation(query) {
        return this.search(query, {
            filterType: 'legislation',
            fuzzy: 0.2,
            prefix: true,
            boost: { 
                title: 3, 
                keywords: 2, 
                description: 1 
            }
        });
    }
    
    /**
     * Vyhľadávanie zamestnancov
     * @param {string} query - Vyhľadávací dotaz
     * @returns {Promise<Array>} Pole zamestnancov
     */
    async searchEmployees(query) {
        return this.search(query, {
            filterType: 'employee',
            fuzzy: 0.1, // Prísnejšie pre mená
            prefix: true,
            boost: { 
                displayName: 3, 
                priezvisko: 2, 
                funkcia: 1 
            }
        });
    }
    
    /**
     * Multi-type vyhľadávanie (hľadá vo všetkých typoch)
     * @param {string} query - Vyhľadávací dotaz
     * @returns {Promise<Object>} Objekt s výsledkami podľa typu
     */
    async searchAll(query) {
        const [contacts, legislation, employees] = await Promise.all([
            this.searchContacts(query),
            this.searchLegislation(query),
            this.searchEmployees(query)
        ]);
        
        return {
            contacts,
            legislation,
            employees,
            total: contacts.length + legislation.length + employees.length
        };
    }
    
    // ============================================
    // === POMOCNÉ METÓDY ===
    // ============================================
    
    /**
     * Kontrola či je worker živý
     */
    isAlive() {
        return this.isInitialized && this.worker !== null;
    }
    
    /**
     * Získanie indexovaných kolekcií
     */
    getIndexedCollections() {
        return Array.from(this.indexedCollections);
    }
    
    /**
     * Počet pending requestov
     */
    getPendingCount() {
        return this.pendingRequests.size;
    }
}

// ============================================
// === SINGLETON EXPORT ===
// ============================================

export const searchService = new SearchService();
