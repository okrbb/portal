/* js/accessibility.js - A11Y Enhancement Module */
/**
 * =============================================
 * ACCESSIBILITY MODULE
 * WCAG 2.1 AA Compliance Helper
 * =============================================
 */

import { showToast, TOAST_TYPE } from './utils.js';

class AccessibilityManager {
    constructor() {
        this.focusTrapStack = [];
        this.announcer = null;
        this.isHighContrast = false;
        this.isDyslexicFont = false;
    }

    /**
     * Inicializácia A11Y features
     */
    init() {
        this.createLiveRegion();
        this.enhanceButtons();
        this.setupKeyboardNav();
        this.addSkipLinks();
        this.loadUserPreferences();
        // this.addAccessibilityToolbar();
        
        console.log('[A11Y] Accessibility features initialized');
    }

    /**
     * =============================================
     * ARIA LIVE REGION
     * =============================================
     */
    
    createLiveRegion() {
        if (document.getElementById('aria-live-region')) return;
        
        const region = document.createElement('div');
        region.id = 'aria-live-region';
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        region.className = 'sr-only';
        
        document.body.appendChild(region);
        this.announcer = region;
    }

    announce(message, priority = 'polite') {
        if (!this.announcer) return;
        
        this.announcer.setAttribute('aria-live', priority);
        this.announcer.textContent = message;
        
        // Clear po 3 sekundách
        setTimeout(() => {
            this.announcer.textContent = '';
        }, 3000);
    }

    /**
     * =============================================
     * BUTTON ENHANCEMENT
     * =============================================
     */
    
    enhanceButtons() {
        // Pridať aria-label tam kde chýba
        document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])').forEach(btn => {
            const icon = btn.querySelector('i[class*="fa-"]');
            
            if (icon) {
                // Extrahovať názov z FA class (fa-save -> Save)
                const iconClass = Array.from(icon.classList)
                    .find(c => c.startsWith('fa-') && c !== 'fa' && c !== 'fas' && c !== 'far');
                
                if (iconClass) {
                    const label = iconClass
                        .replace('fa-', '')
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());
                    
                    btn.setAttribute('aria-label', label);
                }
            } else if (btn.textContent.trim()) {
                // Ak má text, použiť ten
                btn.setAttribute('aria-label', btn.textContent.trim());
            } else {
                // Fallback
                btn.setAttribute('aria-label', 'Button');
            }
        });

        // Disabled buttons - informuj screen reader
        document.querySelectorAll('button:disabled').forEach(btn => {
            if (!btn.hasAttribute('aria-disabled')) {
                btn.setAttribute('aria-disabled', 'true');
            }
        });
    }

    /**
     * =============================================
     * KEYBOARD NAVIGATION
     * =============================================
     */
    
    setupKeyboardNav() {
        // Global shortcuts
        document.addEventListener('keydown', (e) => {
            // Alt + M = Main menu
            if (e.altKey && e.key === 'm') {
                e.preventDefault();
                const menu = document.querySelector('.main-menu');
                menu?.querySelector('a')?.focus();
                this.announce('Menu navigácia');
            }

            // Alt + S = Search
            if (e.altKey && e.key === 's') {
                e.preventDefault();
                document.getElementById('global-employee-search')?.focus();
                this.announce('Vyhľadávanie');
            }

            // Escape = Close modals/dropdowns
            if (e.key === 'Escape') {
                this.closeAllModals();
            }

            // Alt + 1-9 = Quick module navigation
            if (e.altKey && /^[1-9]$/.test(e.key)) {
                e.preventDefault();
                const modules = document.querySelectorAll('[data-target]');
                const index = parseInt(e.key) - 1;
                
                if (modules[index]) {
                    modules[index].click();
                    this.announce(`Modul ${index + 1}`);
                }
            }
        });

        // Tab trap v modáloch
        this.setupModalTabTraps();
    }

    setupModalTabTraps() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                
                const focusable = modal.querySelectorAll(
                    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
                );
                
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            });
        });
    }

    /**
     * Focus trap pre modály
     */
    trapFocus(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const focusable = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusable.length === 0) return;

        this.focusTrapStack.push({
            element,
            previousFocus: document.activeElement,
            firstFocusable: focusable[0],
            lastFocusable: focusable[focusable.length - 1]
        });

        focusable[0].focus();
    }

    releaseFocus() {
        const trap = this.focusTrapStack.pop();
        if (trap && trap.previousFocus) {
            trap.previousFocus.focus();
        }
    }

    /**
     * =============================================
     * SKIP LINKS
     * =============================================
     */
    
    addSkipLinks() {
        if (document.getElementById('skip-links')) return;

        const skipLinks = document.createElement('div');
        skipLinks.id = 'skip-links';
        skipLinks.className = 'skip-links';
        skipLinks.innerHTML = `
            <a href="#main-content" class="skip-link">Preskočiť na hlavný obsah</a>
            <a href="#global-employee-search" class="skip-link">Preskočiť na vyhľadávanie</a>
            <a href="#navigation" class="skip-link">Preskočiť na menu</a>
        `;

        document.body.insertBefore(skipLinks, document.body.firstChild);

        // CSS pre skip links
        if (!document.getElementById('skip-links-style')) {
            const style = document.createElement('style');
            style.id = 'skip-links-style';
            style.textContent = `
                .skip-links {
                    position: absolute;
                    top: -100px;
                    left: 0;
                    z-index: 99999;
                }
                .skip-link {
                    position: absolute;
                    left: -10000px;
                    width: 1px;
                    height: 1px;
                    overflow: hidden;
                }
                .skip-link:focus {
                    position: static;
                    width: auto;
                    height: auto;
                    padding: 10px 20px;
                    background: var(--color-orange-accent);
                    color: white;
                    text-decoration: none;
                    font-weight: bold;
                    border-radius: 0 0 8px 0;
                }
            `;
            document.head.appendChild(style);
        }
    }

    /**
     * =============================================
     * ACCESSIBILITY TOOLBAR
     * =============================================
     */
    
    addAccessibilityToolbar() {
        if (document.getElementById('a11y-toolbar')) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'a11y-toolbar';
        toolbar.className = 'a11y-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Nástroje prístupnosti');
        
        toolbar.innerHTML = `
            <button id="a11y-toggle" class="a11y-toggle" aria-label="Otvoriť nástroje prístupnosti" aria-expanded="false">
                <i class="fas fa-universal-access"></i>
            </button>
            <div id="a11y-menu" class="a11y-menu hidden" role="menu">
                <div class="a11y-menu-header">
                    <h3>Prístupnosť</h3>
                </div>
                <button class="a11y-option" id="toggle-high-contrast" role="menuitem">
                    <i class="fas fa-adjust"></i>
                    <span>Vysoký kontrast</span>
                </button>
                <button class="a11y-option" id="toggle-dyslexic-font" role="menuitem">
                    <i class="fas fa-font"></i>
                    <span>Dyslektické písmo</span>
                </button>
                <button class="a11y-option" id="increase-font-size" role="menuitem">
                    <i class="fas fa-search-plus"></i>
                    <span>Zväčšiť text</span>
                </button>
                <button class="a11y-option" id="decrease-font-size" role="menuitem">
                    <i class="fas fa-search-minus"></i>
                    <span>Zmenšiť text</span>
                </button>
                <button class="a11y-option" id="reset-a11y" role="menuitem">
                    <i class="fas fa-undo"></i>
                    <span>Reset nastavení</span>
                </button>
            </div>
        `;

        document.body.appendChild(toolbar);

        // Event listeners
        this.setupToolbarListeners();

        // CSS
        this.injectToolbarStyles();
    }

    setupToolbarListeners() {
        const toggle = document.getElementById('a11y-toggle');
        const menu = document.getElementById('a11y-menu');

        toggle?.addEventListener('click', () => {
            const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', !isExpanded);
            menu?.classList.toggle('hidden');
            
            if (!isExpanded) {
                menu?.querySelector('button')?.focus();
            }
        });

        // High Contrast
        document.getElementById('toggle-high-contrast')?.addEventListener('click', () => {
            this.toggleHighContrast();
        });

        // Dyslexic Font
        document.getElementById('toggle-dyslexic-font')?.addEventListener('click', () => {
            this.toggleDyslexicFont();
        });

        // Font Size
        document.getElementById('increase-font-size')?.addEventListener('click', () => {
            this.adjustFontSize(1.1);
        });

        document.getElementById('decrease-font-size')?.addEventListener('click', () => {
            this.adjustFontSize(0.9);
        });

        // Reset
        document.getElementById('reset-a11y')?.addEventListener('click', () => {
            this.resetAccessibility();
        });
    }

    /**
     * =============================================
     * ACCESSIBILITY FEATURES
     * =============================================
     */
    
    toggleHighContrast() {
        this.isHighContrast = !this.isHighContrast;
        document.documentElement.setAttribute('data-contrast', this.isHighContrast ? 'high' : 'normal');
        
        localStorage.setItem('a11y-high-contrast', this.isHighContrast);
        this.announce(this.isHighContrast ? 'Vysoký kontrast zapnutý' : 'Vysoký kontrast vypnutý');
        
        showToast(
            this.isHighContrast ? 'Vysoký kontrast aktivovaný' : 'Vysoký kontrast deaktivovaný',
            TOAST_TYPE.INFO
        );
    }

    toggleDyslexicFont() {
        this.isDyslexicFont = !this.isDyslexicFont;
        document.body.style.fontFamily = this.isDyslexicFont 
            ? '"OpenDyslexic", "Comic Sans MS", sans-serif' 
            : '';
        
        localStorage.setItem('a11y-dyslexic-font', this.isDyslexicFont);
        this.announce(this.isDyslexicFont ? 'Dyslektické písmo zapnuté' : 'Dyslektické písmo vypnuté');
    }

    adjustFontSize(factor) {
        const current = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const newSize = current * factor;
        
        // Limit 12px - 24px
        if (newSize < 12 || newSize > 24) return;
        
        document.documentElement.style.fontSize = newSize + 'px';
        localStorage.setItem('a11y-font-size', newSize);
        
        this.announce(`Veľkosť písma: ${Math.round(newSize)}px`);
    }

    resetAccessibility() {
        this.isHighContrast = false;
        this.isDyslexicFont = false;
        
        document.documentElement.removeAttribute('data-contrast');
        document.body.style.fontFamily = '';
        document.documentElement.style.fontSize = '';
        
        localStorage.removeItem('a11y-high-contrast');
        localStorage.removeItem('a11y-dyslexic-font');
        localStorage.removeItem('a11y-font-size');
        
        this.announce('Nastavenia prístupnosti resetované');
        showToast('Nastavenia resetované', TOAST_TYPE.SUCCESS);
    }

    /**
     * Načítanie používateľských preferencií
     */
    loadUserPreferences() {
        const highContrast = localStorage.getItem('a11y-high-contrast') === 'true';
        const dyslexicFont = localStorage.getItem('a11y-dyslexic-font') === 'true';
        const fontSize = localStorage.getItem('a11y-font-size');

        if (highContrast) {
            this.isHighContrast = true;
            document.documentElement.setAttribute('data-contrast', 'high');
        }

        if (dyslexicFont) {
            this.isDyslexicFont = true;
            document.body.style.fontFamily = '"OpenDyslexic", "Comic Sans MS", sans-serif';
        }

        if (fontSize) {
            document.documentElement.style.fontSize = fontSize + 'px';
        }
    }

    /**
     * =============================================
     * HELPERS
     * =============================================
     */
    
    closeAllModals() {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(modal => {
            modal.classList.add('hidden');
            this.releaseFocus();
        });

        document.querySelectorAll('.dropdown-menu.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }

    injectToolbarStyles() {
        if (document.getElementById('a11y-toolbar-style')) return;

        const style = document.createElement('style');
        style.id = 'a11y-toolbar-style';
        style.textContent = `
            .a11y-toolbar {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
            }

            .a11y-toggle {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: var(--color-orange-accent);
                color: white;
                border: none;
                cursor: pointer;
                font-size: 1.5rem;
                box-shadow: var(--shadow-lg);
                transition: all 0.3s ease;
            }

            .a11y-toggle:hover,
            .a11y-toggle:focus {
                transform: scale(1.1);
                background: var(--color-orange-hover);
            }

            .a11y-menu {
                position: absolute;
                bottom: 70px;
                right: 0;
                background: var(--color-bg-light);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-lg);
                padding: 15px;
                width: 250px;
                box-shadow: var(--shadow-lg);
            }

            .a11y-menu.hidden {
                display: none;
            }

            .a11y-menu-header h3 {
                margin: 0 0 15px 0;
                font-size: 1.1rem;
                color: var(--color-orange-accent);
            }

            .a11y-option {
                width: 100%;
                padding: 12px 15px;
                margin-bottom: 8px;
                background: var(--color-bg);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-md);
                color: var(--color-text-primary);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 0.95rem;
                transition: all 0.2s ease;
            }

            .a11y-option:hover,
            .a11y-option:focus {
                background: var(--color-bg-hover);
                border-color: var(--color-orange-accent);
                transform: translateX(-2px);
            }

            .a11y-option i {
                width: 20px;
                color: var(--color-orange-accent);
            }

            /* High Contrast Theme */
            [data-contrast="high"] {
                --color-bg: #000000;
                --color-bg-light: #1a1a1a;
                --color-text-primary: #ffffff;
                --color-orange-accent: #ffcc00;
                --color-border: #666666;
            }

            /* Screen Reader Only */
            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0, 0, 0, 0);
                white-space: nowrap;
                border: 0;
            }

            /* Focus Visible */
            *:focus-visible {
                outline: 3px solid var(--color-orange-accent);
                outline-offset: 2px;
            }
        `;

        document.head.appendChild(style);
    }
}

// Singleton instance
export const a11y = new AccessibilityManager();

/**
 * =============================================
 * AUTO-INIT
 * =============================================
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => a11y.init());
} else {
    a11y.init();
}
