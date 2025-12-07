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
    // 1. Nájdenie alebo vytvorenie kontajnera
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
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