/* =================================================================
   ACTION PANEL MODULE - JavaScript Logic
   Spravuje interakcie, animácie a integráciu s existujúcimi modulmi
   ================================================================= */

import { store } from './store.js';
import { a11y } from './accessibility.js';
import { Permissions } from './accesses.js';
import { IDs } from './id-registry.js';

class ActionPanel {
    constructor() {
        this.isOpen = false;
        this.panel = null;
        this.toggle = null;
        this.menu = null;
        this.initialized = false;
    }

    /**
     * Inicializácia Action Panelu
     */
    init() {
        if (this.initialized) return;
        
        this.createPanel();
        this.attachEventListeners();
        this.handleExternalTriggers();
        
        this.initialized = true;
        console.log('[ActionPanel] Inicializovaný');
    }

    /**
     * Vytvorenie HTML štruktúry panelu
     */
    createPanel() {
        // Odstránime staré floating buttony ak existujú
        this.removeOldButtons();

        const wrapper = document.createElement('div');
        wrapper.className = 'action-panel-wrapper';
        wrapper.innerHTML = `
            <!-- Menu položky (skryté by default) -->
            <div class="action-panel-menu">
                <!-- AI Asistent -->
                <div class="action-panel-item" data-action="ai" role="button" tabindex="0" aria-label="AI Asistent">
                    <div class="action-panel-item-icon">
                        <i class="fa-solid fa-comments"></i>
                    </div>
                    <div class="action-panel-item-text">
                        <span class="action-panel-item-title">AI Asistent</span>
                        <span class="action-panel-item-desc">Adresár kontaktov</span>
                    </div>
                </div>

                <!-- Zoznam zamestnancov -->
                <div class="action-panel-item" data-action="employees" role="button" tabindex="0" aria-label="Zoznam zamestnancov">
                    <div class="action-panel-item-icon">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="action-panel-item-text">
                        <span class="action-panel-item-title">Zoznam zamestnancov</span>
                        <span class="action-panel-item-desc">Prehľad všetkých členov</span>
                    </div>
                </div>

                <!-- Prístupnosť -->
                <div class="action-panel-item" data-action="accessibility" role="button" tabindex="0" aria-label="Nastavenia prístupnosti">
                    <div class="action-panel-item-icon">
                        <i class="fas fa-universal-access"></i>
                    </div>
                    <div class="action-panel-item-text">
                        <span class="action-panel-item-title">Prístupnosť</span>
                        <span class="action-panel-item-desc">Zväčšenie písma</span>
                    </div>
                </div>
            </div>

            <!-- Hlavné toggle tlačidlo -->
            <button class="action-panel-toggle" aria-label="Otvoriť menu akcií" aria-expanded="false">
                <i class="fas fa-bars"></i>
            </button>
        `;

        document.body.appendChild(wrapper);

        // Uložíme referencie
        this.panel = wrapper;
        this.toggle = wrapper.querySelector('.action-panel-toggle');
        this.menu = wrapper.querySelector('.action-panel-menu');
    }

    /**
     * Odstránenie starých floating buttonov
     */
    removeOldButtons() {
        const oldButtons = [
            '#employees-floating-btn',
            '#ai-floating-btn',
            '#accessibility-floating-btn',
            '#a11y-toolbar',  // ✅ Accessibility toolbar z accessibility.js
            '.a11y-toolbar'   // ✅ Class variant
        ];

        oldButtons.forEach(selector => {
            const btn = document.querySelector(selector);
            if (btn) {
                btn.remove();
                console.log(`[ActionPanel] Odstránené staré tlačidlo: ${selector}`);
            }
        });
    }

    /**
     * Pripojenie event listenerov
     */
    attachEventListeners() {
        // Toggle tlačidlo
        this.toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // Klávesnica pre toggle
        this.toggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggleMenu();
            }
        });

        // Klik na jednotlivé položky
        this.menu.querySelectorAll('.action-panel-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                this.handleAction(action);
            });

            // Klávesnica support
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const action = item.dataset.action;
                    this.handleAction(action);
                }
            });
        });

        // Zatvorenie pri kliku mimo panelu
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.panel.contains(e.target)) {
                this.closeMenu();
            }
        });

        // ESC key na zatvorenie
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeMenu();
                this.toggle.focus();
            }
        });
    }

    /**
     * Toggle menu (otvorenie/zatvorenie)
     */
    toggleMenu() {
        if (this.isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    /**
     * Otvorenie menu
     */
    openMenu() {
        this.menu.classList.add('open');
        this.toggle.classList.add('active');
        this.toggle.setAttribute('aria-expanded', 'true');
        this.isOpen = true;

        // Focus na prvú položku
        setTimeout(() => {
            const firstItem = this.menu.querySelector('.action-panel-item');
            if (firstItem) firstItem.focus();
        }, 100);
    }

    /**
     * Zatvorenie menu
     */
    closeMenu() {
        this.menu.classList.remove('open');
        this.toggle.classList.remove('active');
        this.toggle.setAttribute('aria-expanded', 'false');
        this.isOpen = false;
    }

    /**
     * Cleanup: Odstránenie panelu a reset stavu
     */
    cleanup() {
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
        this.isOpen = false;
        this.panel = null;
        this.toggle = null;
        this.menu = null;
        this.initialized = false;
    }

    /**
     * Spracovanie akcií
     */
    handleAction(action) {
        console.log(`[ActionPanel] Akcia: ${action}`);

        switch (action) {
            case 'employees':
                this.openEmployeesList();
                break;
            
            case 'ai':
                this.openAIModal();
                break;
            
            case 'accessibility':
                this.toggleAccessibility();
                break;
            
            default:
                console.warn(`[ActionPanel] Neznáma akcia: ${action}`);
        }

        // Zatvoríme menu po akcii
        this.closeMenu();
    }

    /**
     * Otvorenie zoznamu zamestnancov
     */
    openEmployeesList() {
        const sidebar = document.getElementById(IDs.SIDEBAR.PANEL);
        if (!sidebar) {
            console.warn('[ActionPanel] Sidebar pre zamestnancov neexistuje');
            return;
        }
        
        // ✅FORCE FIX: Pridanie inline štýlov pre istotu
        sidebar.style.transform = 'translateX(0)';
        sidebar.style.webkitTransform = 'translateX(0)';
        sidebar.style.right = '0';
        sidebar.classList.add('active');
        
        console.log('[ActionPanel] 🔧 Aplikované force inline styles');
        
        // ✅ OPRAVA: Refresh zoznamu pri otvorení
        const listElement = document.getElementById(IDs.SIDEBAR.EMPLOYEES_LIST);
        const countElement = document.getElementById(IDs.SIDEBAR.EMP_COUNT);
        
        if (listElement && countElement) {
            const employeesMap = store.getEmployees();
            const activeUser = store.getUser();
            
            if (employeesMap.size === 0) {
                listElement.innerHTML = '<li style="padding: 20px; text-align: center; color: #9ca3af;">Načítavam...</li>';
                return;
            }
            
            listElement.innerHTML = '';
            let visibleCount = 0;
            
            employeesMap.forEach((emp, empId) => {
                const shouldBeVisible = Permissions.canViewEmployeeList(activeUser, emp, 'dashboard-module');
                
                if (shouldBeVisible) {
                    const li = document.createElement('li');
                    li.dataset.id = empId;
                    li.innerHTML = `
                        <div class="dashboard-emp-details">
                            <span class="dashboard-emp-name">${emp.displayName}</span>
                            <span class="dashboard-emp-position">${emp.displayFunkcia}</span>
                        </div>
                    `;
                    listElement.appendChild(li);
                    visibleCount++;
                }
            });
            
            countElement.textContent = visibleCount;
            
            if (visibleCount === 0) {
                listElement.innerHTML = '<li style="padding: 20px; text-align: center; color: #9ca3af;">Nenašli sa žiadni zamestnanci.</li>';
            }
        }
        
        console.log('[ActionPanel] Otvorený zoznam zamestnancov');
    }

    /**
     * Otvorenie AI modálneho okna
     */
    openAIModal() {
        // ✅ DEMO MODE: Blokovanie AI asistenta
        const user = store.getUser();
        if (user && user.email && user.email.toLowerCase() === 'user@test.sk') {
            // Dynamický import utils.js
            import('./utils.js').then(({ showToast, TOAST_TYPE }) => {
                showToast('AI asistent nie je dostupný v režime ukážky.', TOAST_TYPE.ERROR, 2000);
            });
            console.log('[ActionPanel] AI asistent zablokovaný v demo režime');
            return;
        }
        
        const modal = document.getElementById(IDs.AI.MODAL_OVERLAY);
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('active'), 10);
            
            const input = document.getElementById(IDs.AI.INPUT);
            if (input) input.focus();
            
            console.log('[ActionPanel] Otvorený AI asistent');
        } else {
            console.warn('[ActionPanel] AI modal neexistuje');
        }
    }

    /**
     * Otvorenie prístupnosti menu
     * Namiesto jednoduchého toggle otvoríme kompletné accessibility menu
     */
    toggleAccessibility() {
        // Dynamicky vytvoríme plné A11Y menu ak neexistuje
        if (!document.getElementById(IDs.A11Y.MODAL_MENU)) {
            this.createAccessibilityModal();
        }
        
        const modal = document.getElementById(IDs.A11Y.MODAL_MENU);
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('active'), 10);
            
            const firstButton = modal.querySelector('button');
            if (firstButton) firstButton.focus();
            
            console.log('[ActionPanel] Otvorené A11Y menu');
        }
    }

    /**
     * Vytvorenie kompletného accessibility modalu
     */
    createAccessibilityModal() {
        const modal = document.createElement('div');
        modal.id = IDs.A11Y.MODAL_MENU;
        modal.className = 'modal-overlay hidden';
        modal.style.zIndex = '10001';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2><i class="fas fa-universal-access"></i> Nastavenia prístupnosti</h2>
                    <button id="${IDs.A11Y.CLOSE_MODAL_BTN}" class="modal-close" aria-label="Zatvoriť">&times;</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <!-- Vysoký kontrast -->
                        <button class="a11y-modal-option" data-action="high-contrast">
                            <i class="fas fa-adjust"></i>
                            <div>
                                <div class="a11y-option-title">Vysoký kontrast</div>
                                <div class="a11y-option-desc">Zvýšenie čitateľnosti</div>
                            </div>
                        </button>
                        
                        <!-- Dyslektické písmo -->
                        <button class="a11y-modal-option" data-action="dyslexic-font">
                            <i class="fas fa-font"></i>
                            <div>
                                <div class="a11y-option-title">Dyslektické písmo</div>
                                <div class="a11y-option-desc">OpenDyslexic font</div>
                            </div>
                        </button>
                        
                        <!-- Zväčšiť písmo -->
                        <button class="a11y-modal-option" data-action="increase-font">
                            <i class="fas fa-search-plus"></i>
                            <div>
                                <div class="a11y-option-title">Zväčšiť text</div>
                                <div class="a11y-option-desc">+10% veľkosť písma</div>
                            </div>
                        </button>
                        
                        <!-- Zmenšiť písmo -->
                        <button class="a11y-modal-option" data-action="decrease-font">
                            <i class="fas fa-search-minus"></i>
                            <div>
                                <div class="a11y-option-title">Zmenšiť text</div>
                                <div class="a11y-option-desc">-10% veľkosť písma</div>
                            </div>
                        </button>
                        
                        <!-- Reset -->
                        <button class="a11y-modal-option" data-action="reset" style="border-color: var(--color-orange-accent); margin-top: 10px;">
                            <i class="fas fa-undo"></i>
                            <div>
                                <div class="a11y-option-title">Reset nastavení</div>
                                <div class="a11y-option-desc">Vrátiť predvolené</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Event listeners pre modal
        this.setupAccessibilityModalListeners(modal);
        
        // CSS pre modal options
        this.injectAccessibilityModalStyles();
    }

    /**
     * Event listenery pre A11Y modal
     */
    setupAccessibilityModalListeners(modal) {
        // Close button
        const closeBtn = modal.querySelector(`#${IDs.A11Y.CLOSE_MODAL_BTN}`);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
                setTimeout(() => modal.classList.add('hidden'), 300);
            });
        }
        
        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        });
        
        // ESC key
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                modal.classList.remove('active');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        });
        
        // Option buttons
        modal.querySelectorAll('.a11y-modal-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.handleA11yAction(action);
            });
        });
    }

    /**
     * Spracovanie A11Y akcií
     */
    handleA11yAction(action) {
        // Používame priamo importovaný a11y modul
        try {
            switch (action) {
                case 'high-contrast':
                    a11y.toggleHighContrast();
                    break;
                case 'dyslexic-font':
                    a11y.toggleDyslexicFont();
                    break;
                case 'increase-font':
                    a11y.adjustFontSize(1.1);
                    break;
                case 'decrease-font':
                    a11y.adjustFontSize(0.9);
                    break;
                case 'reset':
                    a11y.resetAccessibility();
                    break;
            }
        } catch (error) {
            console.error('[ActionPanel] Chyba pri A11Y akcii:', error);
            // Fallback implementácia ak a11y modul zlyhal
            this.fallbackA11yAction(action);
        }
    }

    /**
     * Fallback pre A11Y akcie (ak accessibility.js nie je načítaný)
     */
    fallbackA11yAction(action) {
        switch (action) {
            case 'high-contrast':
                document.documentElement.toggleAttribute('data-contrast', 'high');
                this.showNotification('Vysoký kontrast prepnutý', 'info');
                break;
            case 'increase-font':
                const current = parseFloat(getComputedStyle(document.documentElement).fontSize);
                document.documentElement.style.fontSize = (current * 1.1) + 'px';
                this.showNotification('Text zväčšený', 'success');
                break;
            case 'decrease-font':
                const currentSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
                document.documentElement.style.fontSize = (currentSize * 0.9) + 'px';
                this.showNotification('Text zmenšený', 'success');
                break;
            case 'reset':
                document.documentElement.removeAttribute('data-contrast');
                document.documentElement.style.fontSize = '';
                this.showNotification('Nastavenia resetované', 'info');
                break;
        }
    }

    /**
     * CSS pre A11Y modal options
     */
    injectAccessibilityModalStyles() {
        if (document.getElementById(IDs.A11Y.MODAL_STYLES)) return;
        
        const style = document.createElement('style');
        style.id = 'a11y-modal-styles';
        style.textContent = `
            .a11y-modal-option {
                width: 100%;
                padding: 14px 16px;
                background: var(--color-bg, #1f2937);
                border: 1px solid var(--color-border, rgba(255,255,255,0.1));
                border-radius: 10px;
                color: var(--color-text-primary, #e5e7eb);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 14px;
                transition: all 0.2s ease;
                text-align: left;
            }
            
            .a11y-modal-option:hover,
            .a11y-modal-option:focus {
                background: rgba(221, 89, 13, 0.1);
                border-color: rgba(221, 89, 13, 0.4);
                transform: translateX(4px);
            }
            
            .a11y-modal-option i {
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--color-orange-accent, #dd590d);
                font-size: 18px;
                flex-shrink: 0;
            }
            
            .a11y-option-title {
                font-weight: 600;
                font-size: 15px;
                margin-bottom: 2px;
            }
            
            .a11y-option-desc {
                font-size: 12px;
                color: var(--color-text-secondary, #9ca3af);
            }
        `;
        
        document.head.appendChild(style);
    }

    /**
     * Obsluha externých triggerov (pre kompatibilitu so starým kódom)
     */
    handleExternalTriggers() {
        // Ak iné moduly volajú staré funkcie, presmerujeme ich sem
        window.openEmployeesSidebar = () => this.openEmployeesList();
        window.openAIModal = () => this.openAIModal();
        window.toggleAccessibility = () => this.toggleAccessibility();
        
        // ✅ PRIDANÉ: Event listener na zatvorenie sidebaru
        const closeBtn = document.getElementById(IDs.SIDEBAR.CLOSE_BTN);
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeEmployeesList();
            });
            console.log('[ActionPanel] Close button listener pridaný');
        }
    }
    
    /**
     * Zatvorenie zoznamu zamestnancov
     */
    closeEmployeesList() {
        const sidebar = document.getElementById(IDs.SIDEBAR.PANEL);
        if (!sidebar) return;
        
        // Odstránenie triedy active a reset transform
        sidebar.classList.remove('active');
        sidebar.style.transform = 'translateX(110%)';
        sidebar.style.webkitTransform = 'translateX(110%)';
        
        console.log('[ActionPanel] Sidebar zatvorený');
    }

    /**
     * Pridanie badge (notifikácie) na položku
     * @param {string} action - Identifikátor akcie (employees/ai/accessibility)
     * @param {number} count - Počet notifikácií
     */
    addBadge(action, count) {
        const item = this.menu.querySelector(`[data-action="${action}"]`);
        if (!item) return;

        // Odstránime starý badge ak existuje
        const oldBadge = item.querySelector('.action-panel-badge');
        if (oldBadge) oldBadge.remove();

        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'action-panel-badge';
            badge.textContent = count > 99 ? '99+' : count;
            item.appendChild(badge);
        }
    }

    /**
     * Odstránenie badge
     */
    removeBadge(action) {
        const item = this.menu.querySelector(`[data-action="${action}"]`);
        if (!item) return;

        const badge = item.querySelector('.action-panel-badge');
        if (badge) badge.remove();
    }

    /**
     * Notifikácia (toast)
     */
    showNotification(message, type = 'info') {
        // Ak máte showToast funkciu v utils.js
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`[ActionPanel] ${message}`);
        }
    }

    /**
     * Destrukcia panelu (cleanup)
     */
    destroy() {
        if (this.panel) {
            this.panel.remove();
        }
        this.initialized = false;
        console.log('[ActionPanel] Zničený');
    }
}

// Singleton instance
export const actionPanel = new ActionPanel();

// Auto-init pri načítaní DOMu
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        actionPanel.init();
    });
} else {
    actionPanel.init();
}

/**
 * =================================================================
 * USAGE EXAMPLES
 * =================================================================
 * 
 * // V mainWizard.js alebo inom module:
 * import { actionPanel } from './action-panel.js';
 * 
 * // Pridanie notifikácie na AI:
 * actionPanel.addBadge('ai', 3);
 * 
 * // Odstránenie badge:
 * actionPanel.removeBadge('ai');
 * 
 * // Programatické otvorenie AI:
 * actionPanel.handleAction('ai');
 * 
 * =================================================================
 */

/**
 * Cleanup funkcia pre odhlásenie listenerov a odstránenie panelu
 */
export function cleanupActionPanel() {
    if (actionPanel && actionPanel.initialized) {
        // Odstrániť panel z DOM
        if (actionPanel.panel && actionPanel.panel.parentNode) {
            actionPanel.panel.parentNode.removeChild(actionPanel.panel);
        }
        // Resetovať stav
        actionPanel.isOpen = false;
        actionPanel.panel = null;
        actionPanel.toggle = null;
        actionPanel.menu = null;
        actionPanel.initialized = false;
    }
}
