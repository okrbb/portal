// === GLOBÁLNE HANDLERY PRE CHYBY A PROMISE REJECTIONS ===

import { logUserAction } from './logs_module.js';
import { store } from './store.js';
import { showToast, TOAST_TYPE } from './utils.js';

/**
 * Nastaví globálne handlery pre chyby a promise rejections.
 */
export function setupGlobalHandlers() {
    // ✅ GLOBAL ERROR HANDLER
    // ✅ STREDNÁ PRIORITA #7: Vylepšený error boundary - ignoruje third-party a známe benign errors
    window.addEventListener('error', (event) => {
        // Ignorovať third-party errors (CDN, external scripts)
        if (event.filename && !event.filename.includes(window.location.origin)) {
            console.warn('[Global Error] Third-party error ignorovaný:', event.filename);
            return;
        }

        // Ignorovať známe benign errors ktoré nezhodia aplikáciu
        const ignoredErrors = [
            'ResizeObserver loop limit exceeded',
            'ResizeObserver loop completed with undelivered notifications',
            'Loading chunk',
            'ChunkLoadError',
            'Script error', // Cross-origin errors
            'Non-Error promise rejection captured' // React Developer Tools
        ];

        const errorMessage = event.message || event.error?.message || '';
        if (ignoredErrors.some(msg => errorMessage.includes(msg))) {
            console.warn('[Global Error] Benign error ignorovaný:', errorMessage);
            return;
        }

        console.error('[Global Error]', event.error);

        // Loguj do Firestore iba významné chyby
        if (store.getUser() && store.getDB()) {
            logUserAction(
                'ERROR',
                `Uncaught: ${event.error?.message || 'Unknown'}`,
                false,
                event.error?.stack
            );
        }

        showToast(
            'Vyskytla sa neočakávaná chyba. Skúste obnoviť stránku.',
            TOAST_TYPE.ERROR,
            5000
        );
    });

    // ✅ PROMISE REJECTION HANDLER
    // ✅ STREDNÁ PRIORITA #7: Vylepšený handler - lepšia detekcia typu chyby
    window.addEventListener('unhandledrejection', (event) => {
        // Ignorovať Firebase offline errors (sú normálne pri strate connectivity)
        const reason = event.reason?.message || event.reason || '';
        const ignoredPatterns = [
            'Failed to get document because the client is offline',
            'Missing or insufficient permissions',
            'PERMISSION_DENIED',
            'QuotaExceededError' // Už riešené v db_service.js
        ];

        if (typeof reason === 'string' && ignoredPatterns.some(pattern => reason.includes(pattern))) {
            console.warn('[Promise Rejection] Známy error ignorovaný:', reason);
            event.preventDefault();
            return;
        }

        console.error('[Unhandled Promise Rejection]', event.reason);

        if (store.getUser() && store.getDB()) {
            logUserAction(
                'ERROR',
                `Promise Rejection: ${reason}`,
                false,
                null
            );
        }

        showToast(
            'Asynchrónna operácia zlyhala. Skúste znova.',
            TOAST_TYPE.ERROR,
            4000
        );

        event.preventDefault(); // Zabráni default console error
    });
}