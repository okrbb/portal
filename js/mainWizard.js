/* =================================== */
/* (Hlavný skript - Entry Point)      */
/* =================================== */

// === JADRO APLIKÁCIE ===
import { db, auth } from './config.js';
import { initializeLogsModule } from './logs_module.js';
import { AppInitializer } from './app-init.js';

// Inicializácia Logov (beží ihneď)
initializeLogsModule(null, null);

// Manuálne oznámenie pre screen reader
import { a11y } from './accessibility.js';
a11y.announce('Dovolenka bola schválená', 'assertive');

// Focus trap pri otváraní modálu
a11y.trapFocus('vacation-modal');

// Release pri zatváraní
a11y.releaseFocus();

// === SPUSTENIE APLIKÁCIE ===
if (db && auth) {
    const appInitializer = new AppInitializer();
    appInitializer.initializeApp();
} else {
    console.error("Kritická chyba: Nepodarilo sa inicializovať databázu alebo autentifikáciu.");
    document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Chyba: Nepodarilo sa pripojiť k databáze.</h1>';
}

// ✅ OPRAVA KRITICKÉHO PROBLÉMU #1: Race Condition v Service Worker
// Service Worker sa registruje až po úplnom načítaní aplikácie
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            // Počkať na úplné načítanie kritických modulov
            await new Promise(resolve => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', resolve);
                }
            });

            // ✅ OPRAVA: Dynamická cesta k SW (funguje v root aj v podpriečinku)
            const swPath = new URL('./sw.js', window.location.href).pathname;
            const registration = await navigator.serviceWorker.register(swPath);
            console.log('[PWA] Service Worker úspešne registrovaný.', registration.scope);

            // Automatická aktualizácia SW pri novej verzii
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Nová verzia je dostupná
                        if (confirm('Nová verzia aplikácie je dostupná. Obnoviť teraz?')) {
                            window.location.reload();
                        }
                    }
                });
            });

        } catch (error) {
            console.error('[PWA] Registrácia Service Worker zlyhala:', error);
            // Aplikácia funguje aj bez SW (iba bez offline podpory)
        }
    });
}

