/* utils.js - Updated with Manual Close & Stacking */
import { APP_CONSTANTS } from './config.js';

// Typy notifikácií
export const TOAST_TYPE = {
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info'
};

/**
 * Globálna funkcia pre zobrazenie notifikácie
 * @param {string} message - Text správy
 * @param {string} type - Typ: 'success', 'error', 'info' (predvolené 'info')
 * @param {number} duration - Trvanie v ms (voliteľné, predvolené z configu)
 */
export function showToast(message, type = TOAST_TYPE.INFO, duration = APP_CONSTANTS.TOAST_DURATION || 4000) {
    const MAX_TOASTS = 5;
    // 1. Nájdenie alebo vytvorenie kontajnera
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.viewTransitionName = 'notifications'; 
        document.body.appendChild(container);
    }

    while (container.children.length >= MAX_TOASTS) {
        container.removeChild(container.firstChild);
    }

    // 2. Vytvorenie elementu Toastu
    const toast = document.createElement('div');
    toast.className = `oznamenie ${type}`;
    
    // Pridáme ikonu podľa typu
    let iconHtml = '';
    if (type === TOAST_TYPE.SUCCESS) iconHtml = '<i class="fas fa-check-circle toast-icon"></i>';
    else if (type === TOAST_TYPE.ERROR) iconHtml = '<i class="fas fa-exclamation-circle toast-icon"></i>';
    else iconHtml = '<i class="fas fa-info-circle toast-icon"></i>';

    // HTML štruktúra s krížikom
    toast.innerHTML = `
        <div class="toast-content">
            ${iconHtml}
            <span class="toast-message">${message}</span>
        </div>
        <button class="toast-close-btn">&times;</button>
    `;

    // 3. Pridanie do DOM (Stacking)
    // appendChild pridá nový toast na spodok (najnovší dole)
    container.appendChild(toast);
    
    // 4. Logika odstránenia (DRY princíp)
    let timeoutId;

    const removeToast = () => {
        // Zrušíme časovač ak bol spustený manuálne
        if (timeoutId) clearTimeout(timeoutId);

        toast.classList.remove('show');
        // Počkáme na CSS transition (0.4s)
        toast.addEventListener('transitionend', () => {
            if (container.contains(toast)) {
                toast.remove();
            }
            // Ak je kontajner prázdny, odstránime ho
            if (container.children.length === 0) {
                container.remove();
            }
        });
    };

    // 5. Listener pre manuálne zatvorenie (Krížik)
    const closeBtn = toast.querySelector('.toast-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Aby sa nekliklo na toast ak by bol klikateľný
            removeToast();
        });
    }

    // 6. Animácia príchodu
    // requestAnimationFrame zabezpečí, že prehliadač stihne vykresliť počiatočný stav pred pridaním triedy 'show'
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // 7. Automatické odstránenie po čase
    // Pri chybe necháme toast dlhšie (napr. +2 sekundy), aby si ho user stihol prečítať
    const finalDuration = type === TOAST_TYPE.ERROR ? duration + 2000 : duration;
    timeoutId = setTimeout(removeToast, finalDuration);
}

/**
 * Funkcia Debounce - zabraňuje viacnásobnému volaniu funkcie (napr. pri vyhľadávaní)
 */
export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

/**
 * Centralizované spracovanie chýb
 */
export function handleError(error, contextMessage = 'Vyskytla sa chyba') {
    console.error(`${contextMessage}:`, error);
    showToast(`${contextMessage}: ${error.message || error}`, TOAST_TYPE.ERROR);
}

/**
 * Vráti HTML reťazec pre Skeleton Loading.
 */
export function getSkeletonHTML(type, count = 5) {
    let html = '';

    if (type === 'list') {
        for (let i = 0; i < count; i++) {
            html += `
            <li class="skeleton-list-item">
                <div class="skeleton-line medium" style="height: 14px; width: 60%;"></div>
                <div class="skeleton-line short" style="height: 10px; width: 40%; margin-top: 4px;"></div>
            </li>`;
        }
    } 
    else if (type === 'calendar') {
        html = `<div class="skeleton-calendar-grid">`;
        for (let i = 0; i < 28; i++) {
            html += `
            <div class="skeleton-calendar-day">
                <div class="skeleton-line short" style="height: 10px; width: 20px; align-self: flex-end;"></div>
                <div class="skeleton-line long" style="height: 8px; margin-top: 15px;"></div>
                <div class="skeleton-line medium" style="height: 8px;"></div>
            </div>`;
        }
        html += `</div>`;
    }

    return html;
}
// ============================================
// === NOVÉ FUNKCIE - MODAL MANAGER ===
// ============================================

/**
 * Univerzálny Modal Manager pre konzistentné správanie modalov
 */
export const ModalManager = {
    /**
     * Otvorí modal s ID
     * @param {string} modalId - ID modal elementu
     * @param {Function} onOpenCallback - Voliteľný callback po otvorení
     */
    open(modalId, onOpenCallback = null) {
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.warn(`Modal ${modalId} neexistuje`);
            return;
        }
        
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('active'), 10);
        
        // Lock scrollu na body
        document.body.style.overflow = 'hidden';
        
        if (onOpenCallback) onOpenCallback();
    },
    
    /**
     * Zatvorí modal s ID
     * @param {string} modalId - ID modal elementu
     * @param {Function} onCloseCallback - Voliteľný callback po zatvorení
     */
    close(modalId, onCloseCallback = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        modal.classList.remove('active');
        setTimeout(() => {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            if (onCloseCallback) onCloseCallback();
        }, 300);
    },
    
    /**
     * Toggle modal
     * @param {string} modalId - ID modal elementu
     */
    toggle(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        if (modal.classList.contains('hidden')) {
            this.open(modalId);
        } else {
            this.close(modalId);
        }
    },
    
    /**
     * Setup univerzálneho zatváracieho listenera (X button + klik mimo + ESC)
     * @param {string} modalId - ID modal elementu
     * @param {string} closeButtonId - ID close buttonu (voliteľné)
     */
    setupCloseListeners(modalId, closeButtonId = null) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // Klik mimo modal-content
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.close(modalId);
            }
        });
        
        // Close button
        if (closeButtonId) {
            const btn = document.getElementById(closeButtonId);
            if (btn) {
                btn.addEventListener('click', () => this.close(modalId));
            }
        }
        
        // ESC klávesa
        const escHandler = (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                this.close(modalId);
            }
        };
        
        document.addEventListener('keydown', escHandler);
        
        // Return cleanup function
        return () => {
            document.removeEventListener('keydown', escHandler);
        };
    }
};

// ============================================
// === NOVÉ FUNKCIE - EVENT LISTENER CLEANUP ===
// ============================================

/**
 * Odstráni všetky event listenery z elementu a vráti čistú kópiu
 * @param {HTMLElement|string} element - Element alebo ID
 * @returns {HTMLElement} Nový element bez listenerov
 */
export function cleanElement(element) {
    const el = typeof element === 'string' ? document.getElementById(element) : element;
    if (!el) return null;
    
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    return newEl;
}

/**
 * Priradí event listener k elementu s automatickým cleanupom
 * @param {string} elementId - ID elementu
 * @param {string} event - Typ eventu (click, change, ...)
 * @param {Function} handler - Handler funkcia
 * @param {boolean} cleanup - Či vyčistiť staré listenery
 * @returns {HTMLElement} Element s novým listenerom
 */
export function attachListener(elementId, event, handler, cleanup = true) {
    let el = document.getElementById(elementId);
    if (!el) return null;
    
    if (cleanup) {
        el = cleanElement(el);
    }
    
    el.addEventListener(event, handler);
    return el;
}

// ============================================
// === NOVÉ FUNKCIE - SEARCH INPUT HELPER ===
// ============================================

/**
 * Setup pre search input s debounce a clear buttonom
 * @param {string} inputId - ID input elementu
 * @param {Function} callback - Funkcia na spracovanie vyhľadávania
 * @param {number} debounceMs - Debounce delay (default 300ms)
 * @returns {HTMLElement} Input element
 */
export function setupSearchInput(inputId, callback, debounceMs = 300) {
    const input = document.getElementById(inputId);
    const clearBtn = input?.parentElement.querySelector('.clear-search-btn');
    
    if (!input) {
        console.warn(`Search input ${inputId} neexistuje`);
        return null;
    }
    
    const debouncedCallback = debounce(callback, debounceMs);
    
    // Input event
    input.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        
        // Toggle clear button
        if (clearBtn) {
            value ? clearBtn.classList.remove('hidden') : clearBtn.classList.add('hidden');
        }
        
        debouncedCallback(value);
    });
    
    // Clear button handler
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.classList.add('hidden');
            callback(''); // Immediate callback
            input.focus();
        });
    }
    
    return input;
}

// ============================================
// === NOVÉ FUNKCIE - VIRTUAL SCROLLING ===
// ============================================

/**
 * Jednoduchý virtual scroller pre zoznamy
 * Renderuje len viditeľné položky pre lepší performance
 */
export class VirtualList {
    /**
     * @param {string} containerId - ID kontajnera
     * @param {Function} itemRenderer - Funkcia pre renderovanie položky (item, index) => HTML string
     * @param {number} itemHeight - Výška jednej položky v px
     */
    constructor(containerId, itemRenderer, itemHeight = 50) {
        this.container = document.getElementById(containerId);
        this.itemRenderer = itemRenderer;
        this.itemHeight = itemHeight;
        this.items = [];
        this.visibleCount = 0;
        this.scrollTop = 0;
        
        this.init();
    }
    
    init() {
        if (!this.container) {
            console.warn('VirtualList: Container neexistuje');
            return;
        }
        
        this.container.style.overflowY = 'auto';
        this.container.style.position = 'relative';
        
        this.container.addEventListener('scroll', () => {
            this.scrollTop = this.container.scrollTop;
            this.render();
        });
        
        // Výpočet počtu viditeľných položiek
        this.visibleCount = Math.ceil(this.container.clientHeight / this.itemHeight) + 5; // +5 buffer
    }
    
    /**
     * Nastaví nový zoznam položiek
     * @param {Array} items - Pole položiek na renderovanie
     */
    setItems(items) {
        this.items = items;
        this.render();
    }
    
    /**
     * Renderuje len viditeľné položky
     */
    render() {
        if (!this.container) return;
        
        const startIndex = Math.floor(this.scrollTop / this.itemHeight);
        const endIndex = Math.min(startIndex + this.visibleCount, this.items.length);
        
        const topPadding = startIndex * this.itemHeight;
        const bottomPadding = (this.items.length - endIndex) * this.itemHeight;
        
        let html = `<div style="height: ${topPadding}px;"></div>`;
        
        for (let i = startIndex; i < endIndex; i++) {
            html += this.itemRenderer(this.items[i], i);
        }
        
        html += `<div style="height: ${bottomPadding}px;"></div>`;
        
        this.container.innerHTML = html;
    }
    
    /**
     * Scrollne na konkrétny index
     * @param {number} index - Index položky
     */
    scrollToIndex(index) {
        if (!this.container) return;
        this.container.scrollTop = index * this.itemHeight;
    }
    
    /**
     * Aktualizuje výšku položiek (ak sa dynamicky mení)
     * @param {number} newHeight - Nová výška v px
     */
    updateItemHeight(newHeight) {
        this.itemHeight = newHeight;
        this.visibleCount = Math.ceil(this.container.clientHeight / this.itemHeight) + 5;
        this.render();
    }
}

// ============================================
// === NOVÉ FUNKCIE - ERROR HANDLING ===
// ============================================

/**
 * Wrapper pre async funkcie s automatickým error handlingom a retry logikou
 * @param {Function} fn - Async funkcia na vykonanie
 * @param {string} errorMessage - Chybová hláška
 * @param {Object} options - Konfigurácia
 */
export async function safeAsync(fn, errorMessage = 'Vyskytla sa chyba', options = {}) {
    const { 
        showToastOnError = true, 
        logError = true,
        fallbackValue = null,
        retries = 0,
        retryDelay = 1000
    } = options;
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (logError) {
                console.error(`${errorMessage} (pokus ${attempt + 1}/${retries + 1}):`, error);
            }
            
            // Ak máme ešte pokusy, počkáme
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            }
            
            // Posledný pokus zlyhal
            if (showToastOnError) {
                showToast(`${errorMessage}: ${error.message}`, TOAST_TYPE.ERROR);
            }
        }
    }
    
    return fallbackValue;
}
