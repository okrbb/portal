// === MODUL PRE INICIALIZÁCIU APLIKÁCIE ===

import { store } from './store.js';
import { db, auth } from './config.js';
import { showToast, TOAST_TYPE } from './utils.js';
import { logUserAction } from './logs_module.js';
import { Permissions } from './accesses.js';
import { clearEmployeesIDB, clearAIIndexIDB } from './db_service.js';
import { a11y } from './accessibility.js';
import { actionPanel } from './action-panel.js';
import { initializeAdminPanel, updateAdminPanel } from './admin_panel_module.js';
import { searchService } from './search_service.js';
import { loadContactsToCache, initializeContactsModule } from './contacts_module.js';
import { activateGlobalExport } from './emp_module.js';
import { updateWelcomeWidget } from './widget.js';
import { renderAnnouncementWidget } from './announcements.js';
import { initializeAIModule } from './ai_module.js';
import { MODULE_TITLES } from './constants.js';
import { IDs } from './id-registry.js';

import { setupGlobalHandlers } from './global-handlers.js';
import { AuthManager } from './auth.js';
import { SidebarManager } from './sidebar.js';
import { NavigationManager } from './navigation.js';
import { DashboardManager } from './dashboard.js';

/**
 * Trieda na inicializáciu aplikácie.
 */
export class AppInitializer {
    constructor() {
        this.authManager = new AuthManager();
        this.sidebarManager = new SidebarManager();
        this.navigationManager = new NavigationManager();
        this.dashboardManager = new DashboardManager();
        
        // ✅ NOVÉ: Globálny reference na dashboardManager pre prístup z iných modulov
        if (!window.__dashboardManager) {
            window.__dashboardManager = this.dashboardManager;
        }
    }

    /**
     * Hlavná inicializačná funkcia.
     */
    async initializeApp() {
        try {
            setupGlobalHandlers();
            this.authManager.setupForgotPassword();

            const userProfile = await this.authManager.handleLogin();

            if (!userProfile) {
                document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Prihlásenie zlyhalo alebo nemáte oprávnenia.</h1>';
                return;
            }

            initializeAdminPanel();

            const activeUser = store.getUser();

            if (window.a11y) {
                a11y.init();
            }

            actionPanel.init();

            this._setupBackupAndRestore(activeUser);

            store.subscribe((state) => {
                if (state.isLoading === false) {
                    this.navigationManager._renderGlobalEmployeeList();
                    updateAdminPanel();
                    const cpModuleEl = document.getElementById(IDs.CP.MODULE);
                    if (cpModuleEl && cpModuleEl.classList.contains('active')) {
                        const lookupId = state.user.id || state.user.oec;
                        if (lookupId) this.navigationManager._autoDisplayEmployeeDetails(lookupId, state.employees.get(lookupId));
                    }
                    activateGlobalExport(state.user, state.employees);
                }
            });

            // ✅ OPRAVA: Použitie waitUntilReady() namiesto priameho loadEmployees()
            // Zabraňuje race conditions pri štarte aplikácie
            await store.waitUntilReady();

            const employeesMap = store.getEmployees();

            if (activeUser && activeUser.email && employeesMap.size > 0) {
                let fullActiveUser = null;
                for (const employee of employeesMap.values()) {
                    if (employee.mail && employee.mail.toLowerCase() === activeUser.email.toLowerCase()) {
                        fullActiveUser = employee;
                        break;
                    }
                }
                if (fullActiveUser) {
                    activeUser.id = fullActiveUser.id;
                    activeUser.oec = fullActiveUser.oec || '---';
                    activeUser.displayName = `${fullActiveUser.titul || ''} ${fullActiveUser.meno} ${fullActiveUser.priezvisko}`.trim();
                    activeUser.funkcia = fullActiveUser.funkcia || activeUser.funkcia;
                    activeUser.oddelenie = fullActiveUser.oddelenie || activeUser.oddelenie;
                    store.setUser(activeUser);
                }
            }

            this.authManager.updateSidebarUser(activeUser);
            updateWelcomeWidget(activeUser);
            renderAnnouncementWidget(store.getDB(), activeUser);

            initializeAIModule(store.getDB(), activeUser);

            const titleElement = document.getElementById(IDs.NAV.MODULE_TITLE);
            if (titleElement) {
                titleElement.textContent = MODULE_TITLES['dashboard-module'] || 'Prehľad udalostí';
            }

            const editBtn = document.getElementById(IDs.NAV.EDIT_BTN);
            if (editBtn) editBtn.classList.add('hidden');

            activateGlobalExport(activeUser, employeesMap);
            this.navigationManager._renderGlobalEmployeeList();

            this.navigationManager.initializeNavigation();
            this.sidebarManager.initializeMobileMenu();
            this.authManager.setupPasswordChange();
            this.authManager.setupLogout();
            this.authManager.setupReload();
            this._setupSettingsToggle();

            await this.dashboardManager.initializeCalendar();
            await this.dashboardManager.loadDutyToday();

            console.log("Portál pripravený. Aktívny používateľ: ", activeUser.funkcia, activeUser.oddelenie);

            searchService.init();
            console.log("[SearchService] Web Worker inicializovaný.");

            loadContactsToCache().then(() => {
                console.log("[Adresár] Kontakty úspešne načítané do cache.");
            });

            initializeContactsModule();

            const addressBookBtn = document.getElementById(IDs.NAV.ADDRESS_BOOK_BTN);
            const contactsModal = document.getElementById(IDs.CONTACTS.MODAL);
            if (addressBookBtn && contactsModal) {
                addressBookBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    contactsModal.classList.remove('hidden');
                    setTimeout(() => {
                        document.getElementById(IDs.CONTACTS.SEARCH_INPUT)?.focus();
                    }, 100);
                });
            }

        } catch (error) {
            console.error("Kritická chyba pri inicializácii aplikácie:", error);
            let errorMessage = `Kritická chyba aplikácie: ${error.message}.`;
            document.body.innerHTML = `<h1 style="padding: 2rem; text-align: center;">${errorMessage}</h1>`;
        }
    }

    /**
     * Nastaví toggle pre Settings dropdown menu.
     */
    _setupSettingsToggle() {
        const settingsToggleBtn = document.getElementById(IDs.NAV.SETTINGS_TOGGLE_BTN);
        const settingsMenu = document.querySelector('.settings-dropdown-menu');

        if (!settingsToggleBtn || !settingsMenu) return;

        // Kliknutie na tlačidlo
        settingsToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            settingsMenu.classList.toggle('active');
            settingsToggleBtn.classList.toggle('active');
        });

        // Zatvorenie menu pri kliknutí mimo neho
        document.addEventListener('click', (e) => {
            if (settingsMenu.classList.contains('active')) {
                const isClickInsideMenu = settingsMenu.contains(e.target);
                const isClickOnButton = settingsToggleBtn.contains(e.target);

                if (!isClickInsideMenu && !isClickOnButton) {
                    settingsMenu.classList.remove('active');
                    settingsToggleBtn.classList.remove('active');
                }
            }
        });

        // Zatvorenie menu pri kliknutí na položku
        settingsMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                settingsMenu.classList.remove('active');
                settingsToggleBtn.classList.remove('active');
            });
        });
    }

    _setupBackupAndRestore(activeUser) {
        if (Permissions.canManageLogs(activeUser)) {
            const settingsMenu = document.querySelector('.settings-dropdown-menu');
            let backupBtn = document.getElementById(IDs.ADMIN.BACKUP_DATA_BTN);

            if (!backupBtn && settingsMenu) {
                const link = document.createElement('a');
                link.href = "#";
                link.id = "backup-data-btn";
                link.innerHTML = `<i class="fas fa-database"></i> Zálohovať dáta (JSON)`;
                settingsMenu.appendChild(link);

                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (confirm("Spustiť kompletnú zálohu databázy?\n\nTento proces stiahne všetky dáta zamestnancov, rozpisov a vozidiel do jedného súboru.")) {
                        settingsMenu.classList.remove('active');
                        showToast("Pripravujem zálohu...", TOAST_TYPE.INFO);
                        try {
                            const backupService = await import('./backup_service.js');
                            await backupService.performFullBackup(store.getDB());
                        } catch (err) {
                            console.error(err);
                            showToast("Chyba pri načítaní zálohovacieho modulu.", TOAST_TYPE.ERROR);
                        }
                    }
                });
            }

            if (settingsMenu && !document.getElementById(IDs.ADMIN.RESTORE_DATA_BTN)) {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                const restoreLink = document.createElement('a');
                restoreLink.href = "#";
                restoreLink.id = "restore-data-btn";
                restoreLink.innerHTML = `<i class="fas fa-upload"></i> Obnoviť zo zálohy`;
                restoreLink.style.color = "#ff9f43";

                settingsMenu.appendChild(restoreLink);

                restoreLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    settingsMenu.classList.remove('active');
                    fileInput.click();
                });

                fileInput.addEventListener('change', async (e) => {
                    if (e.target.files.length > 0) {
                        const file = e.target.files[0];
                        showToast("Načítavam obnovovací modul...", TOAST_TYPE.INFO);
                        try {
                            const restoreService = await import('./restore_service.js');
                            restoreService.restoreCollectionFromFile(file, store.getDB());
                        } catch (err) {
                            console.error(err);
                            showToast("Chyba pri načítaní modulu obnovy.", TOAST_TYPE.ERROR);
                        }
                        fileInput.value = '';
                    }
                });
            }
        }
    }
}