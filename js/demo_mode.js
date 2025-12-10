/* js/demo_mode.js */
import { showToast, TOAST_TYPE } from './utils.js';

export const DEMO_CONFIG = {
    EMAIL: 'user@test.sk',
    DOC_ID: 'test',
    BANNER_TEXT: '⚠️ REŽIM UKÁŽKY: Dáta sú simulované. Zmeny sa neukladajú.',
    TOAST_MSG: 'Vitajte v ukážke aplikácie.'
};

export function isDemoUser(email) {
    return email && email.toLowerCase() === DEMO_CONFIG.EMAIL;
}

export function activateDemoMode() {
    console.log("[DemoMode] Aktivujem obmedzenia...");
    document.body.classList.add('demo-active');

    // Banner
    if (!document.querySelector('.demo-banner')) {
        const banner = document.createElement('div');
        banner.className = 'demo-banner';
        banner.innerHTML = `<i class="fas fa-eye"></i><span>${DEMO_CONFIG.BANNER_TEXT}</span>`;
        document.body.appendChild(banner);
    }

    showToast(DEMO_CONFIG.TOAST_MSG, TOAST_TYPE.INFO, 4000);

    // Blokovanie interakcií
    document.addEventListener('click', (e) => {
        const target = e.target;

        // === POVOLENÉ AKCIE (WHITELIST) ===
        const allowedSelectors = [
            '#duty-delete-btn',         // Povol: Vymazať rozpis
            '.history-btn',             // Povol: História PHM
            '#emailSelect',             // Povol: Výber obce (UA)
            '#fuel-filter-month',       // Povol: Filtre PHM
            '#fuel-filter-year',
            '.modal-close',             // Povol: Zatváranie okien
            '#close-history-modal',
            '#close-fuel-modal',
            '#close-iban-modal',
            '.nav-link-card',           // Navigácia
            '.main-menu a',
            '#logout-btn',              // ODHLÁSENIE MUSÍ OSTÁŤ POVOLENÉ
            '#settings-toggle-btn'
            // ODSTRÁNENÉ: '.settings-dropdown-menu a' (toto povoľovalo všetko v menu)
        ];

        if (allowedSelectors.some(selector => target.closest(selector))) {
            return; // Povoliť akciu
        }

        // === ZABLOKOVANÉ ELEMENTY ===
        const blockedSelectors = [
            '.module-content button',       
            '.module-content input',        
            '.module-content select',       
            '.module-content textarea',
            '.drop-zone',                   
            '.edit-iban-icon',              
            '.fuel-action-btn',             
            '#global-employees-list-items li',
            // PRIDANÉ: Konkrétne tlačidlá nastavení
            '#reload-btn',           // Obnoviť aplikáciu
            '#change-password-btn',  // Zmeniť heslo
            '#backup-data-btn',      // Záloha (ak by bola viditeľná)
            '#restore-data-btn',     // Obnova (ak by bola viditeľná)
            '#export-excel-btn'      // Export zamestnancov
        ];

        if (blockedSelectors.some(selector => target.closest(selector))) {
            e.preventDefault();
            e.stopPropagation();
            showToast("V režime ukážky je táto interakcia zablokovaná.", TOAST_TYPE.ERROR, 1500);
        }
    }, true);
}