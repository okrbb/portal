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
 */
export function showToast(message, type = TOAST_TYPE.INFO) {
    // 1. Nájdenie alebo vytvorenie kontajnera
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // 2. Vytvorenie elementu
    const toast = document.createElement('div');
    toast.className = `oznamenie ${type}`;
    
    // Pridáme ikonu podľa typu
    let iconHtml = '';
    if (type === TOAST_TYPE.SUCCESS) iconHtml = '<i class="fas fa-check-circle"></i> ';
    else if (type === TOAST_TYPE.ERROR) iconHtml = '<i class="fas fa-exclamation-circle"></i> ';
    else iconHtml = '<i class="fas fa-info-circle"></i> ';

    toast.innerHTML = `${iconHtml}${message}`;

    // 3. Pridanie do DOM
    container.appendChild(toast);
    
    // 4. Animácia príchodu
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // 5. Automatické odstránenie
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (container.contains(toast)) {
                toast.remove();
            }
            if (container.children.length === 0) {
                container.remove();
            }
        });
    }, APP_CONSTANTS.TOAST_DURATION || 3000);
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
    // Použijeme náš systém notifikácií na zobrazenie chyby používateľovi
    showToast(`${contextMessage}: ${error.message || error}`, TOAST_TYPE.ERROR);
}