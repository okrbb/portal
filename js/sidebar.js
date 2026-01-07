// === MODUL PRE SIDEBAR A MOBILE MENU ===

import { IDs } from './id-registry.js';

/**
 * Trieda na správu sidebar a mobile menu.
 */
export class SidebarManager {
    constructor() {
        this.rightToggle = document.getElementById(IDs.NAV.MOBILE_MENU_RIGHT_TOGGLE);
        this.rightSidebar = document.querySelector('.sidebar-right');
        this.closeRightBtn = document.getElementById(IDs.SIDEBAR.CLOSE_BTN);
    }

    /**
     * Inicializuje mobile menu.
     */
    initializeMobileMenu() {
        if (this.rightToggle && this.rightSidebar) {
            this.rightToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.rightSidebar.classList.toggle('active');
            });
        }

        if (this.closeRightBtn && this.rightSidebar) {
            this.closeRightBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.rightSidebar.classList.remove('active');
            });
        }

        document.addEventListener('click', (e) => {
            if (this.rightSidebar && this.rightSidebar.classList.contains('active')) {
                const isClickOutside = !this.rightSidebar.contains(e.target);
                const isNotToggle = !this.rightToggle || (e.target !== this.rightToggle && !this.rightToggle.contains(e.target));

                if (isClickOutside && isNotToggle) {
                    this.rightSidebar.classList.remove('active');
                }
            }
        });
    }
}