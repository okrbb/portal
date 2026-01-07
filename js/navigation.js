// === MODUL PRE NAVIGÁCIU A LAZY LOADING ===

import { store } from './store.js';
import { showToast, TOAST_TYPE } from './utils.js';
import { logUserAction } from './logs_module.js';
import { Permissions } from './accesses.js';
import { MODULE_TITLES } from './constants.js';
import { IDs } from './id-registry.js';

/**
 * Trieda na správu navigácie medzi modulmi.
 */
export class NavigationManager {
    constructor() {
        this.titleElement = document.getElementById(IDs.NAV.MODULE_TITLE);
        this.logoElement = document.querySelector('.sidebar-header .logo');
        this.menuLinks = document.querySelectorAll('.main-menu li a');
        this.contentModules = document.querySelectorAll('.module-content');
        this.searchInput = document.getElementById(IDs.NAV.GLOBAL_SEARCH);
        this.clearSearchBtn = document.getElementById(IDs.NAV.CLEAR_SEARCH_BTN);

        // Flagy inicializácie pre Lazy Loading
        this.isCPModuleInitialized = false;
        this.isDovModuleInitialized = false;
        this.isSCHDModuleInitialized = false;
        this.isBBKModuleInitialized = false;
        this.isIZSModuleInitialized = false;
        this.isUAModuleInitialized = false;
        this.isFuelModuleInitialized = false;

        // ✅ NOVÉ: Aktuálne načítaný modul ID
        this.currentModuleId = IDs.DASHBOARD.MODULE;

        // ✅ NOVÉ: Registračný systém pre cleanup funkcie
        this.moduleCleanupRegistry = new Map([
            [IDs.CP.MODULE, () => this._loadAndCleanup('./cp_module.js', 'cleanupCPModule')],
            [IDs.DOV.MODULE, () => this._loadAndCleanup('./dov_module.js', 'cleanupDovModule')],
            [IDs.DUTY.MODULE, () => this._loadAndCleanup('./schd_module.js', 'cleanupSCHDModule')],
            [IDs.IZS.MODULE, async () => {
                await this._loadAndCleanup('./schd_izs_module.js', 'cleanupIZSModule');
                await this._loadAndCleanup('./schd_bbk_module.js', 'cleanupBBKModule');
            }],
            [IDs.UA.MODULE, () => this._loadAndCleanup('./ua_module.js', 'cleanupUAModule')],
            [IDs.FUEL.MODULE, () => this._loadAndCleanup('./fuel_module.js', 'cleanupFuelModule')],
        ]);
    }

    /**
     * ✅ NOVÉ: Pomocná metóda na bezpečné načítanie a zavolanie cleanup funkcie
     */
    async _loadAndCleanup(modulePath, cleanupFunctionName) {
        try {
            const module = await import(modulePath);
            const cleanupFunc = module[cleanupFunctionName];
            if (typeof cleanupFunc === 'function') {
                await cleanupFunc();
                console.log(`[Navigation] Cleanup: ${cleanupFunctionName} zavolaný`);
            } else {
                console.warn(`[Navigation] Cleanup funkcia '${cleanupFunctionName}' nenájdená v ${modulePath}`);
            }
        } catch (error) {
            console.warn(`[Navigation] Chyba pri cleanup ${modulePath}:`, error);
        }
    }

    /**
     * ✅ NOVÉ: Metóda na centralizovaný unload aktuálneho modulu
     */
    async unloadCurrentModule() {
        if (!this.currentModuleId || this.currentModuleId === IDs.DASHBOARD.MODULE) {
            return; // Dashboard nemá cleanup funkciu
        }

        const cleanup = this.moduleCleanupRegistry.get(this.currentModuleId);
        if (cleanup) {
            try {
                await cleanup();
                console.log(`[Navigation] Modul ${this.currentModuleId} bol úspešne unloaded`);
            } catch (error) {
                console.error(`[Navigation] Chyba pri unload ${this.currentModuleId}:`, error);
            }
        }
    }

    /**
     * Inicializuje navigáciu.
     */
    initializeNavigation() {
        this._setupLogoClick();
        this._setupMenuClicks();
        this._setupDashboardNavigation();
        this._setupSearch();
    }

    _setupLogoClick() {
        if (this.logoElement) {
            this.logoElement.addEventListener('click', () => {
                const targetId = this._normalizeTargetId(this.logoElement.getAttribute('data-target'));
                if (!targetId) return;
                if (this.titleElement) {
                    const newTitle = MODULE_TITLES[targetId] || 'Prehľad';
                    this.titleElement.textContent = newTitle;
                }
                this._updateActiveMenu(targetId);
            });
        }
    }

    _setupMenuClicks() {
        this.menuLinks.forEach(link => {
            link.addEventListener('click', async (event) => {
                event.preventDefault();
                const targetId = this._normalizeTargetId(link.getAttribute('data-target'));
                if (!targetId) return;

                const activeUser = store.getUser();
                const moduleName = MODULE_TITLES[targetId] || targetId;
                logUserAction("NAVIGACIA", `Prechod na modul: ${moduleName}`);

                if (!Permissions.canViewModule(activeUser, targetId)) {
                    showToast("Prístup zamietnutý.", TOAST_TYPE.ERROR);
                    return;
                }

                this._navigateToModule(targetId, activeUser);
            });
        });
    }

    async _navigateToModule(targetId, activeUser) {
        // ✅ NOVÉ: Unload predošlého modulu pred načítaním nového
        if (this.currentModuleId !== targetId) {
            await this.unloadCurrentModule();
        }

        const updateDOM = () => {
            const dropdownBtn = document.querySelector('.nav-dropdown-btn');
            const dropdownMenu = document.querySelector('.nav-dropdown-menu');

            if (dropdownBtn) {
                const iconClass = this.menuLinks.forEach(l => {
                    if (l.getAttribute('data-target') === targetId) {
                        return l.querySelector('i')?.className || 'fa-solid fa-grid-2';
                    }
                });
            }
            if (dropdownMenu) dropdownMenu.classList.remove('show');

            this._updateActiveMenu(targetId);

            if (this.titleElement) this.titleElement.textContent = MODULE_TITLES[targetId] || targetId;

            const exportBtn = document.getElementById(IDs.NAV.EXPORT_EXCEL_BTN);
            if (exportBtn) {
                exportBtn.classList.toggle('hidden', !Permissions.canExportEmployees(activeUser));
            }

            this._renderGlobalEmployeeList(targetId);
        };

        if (document.startViewTransition) {
            document.startViewTransition(() => updateDOM());
        } else {
            updateDOM();
        }

        // ✅ NOVÉ: Aktualizuj currentModuleId po unloade starého
        this.currentModuleId = targetId;

        await this._lazyLoadModule(targetId, activeUser);
    }

    _updateActiveMenu(targetId) {
        this.menuLinks.forEach(otherLink => otherLink.classList.remove('active'));
        const activeLink = Array.from(this.menuLinks).find(link => this._normalizeTargetId(link.getAttribute('data-target')) === targetId);
        if (activeLink) activeLink.classList.add('active');

        this.contentModules.forEach(module => {
            module.classList.toggle('hidden', module.id !== targetId);
        });
    }

    async _lazyLoadModule(targetId, activeUser) {
        try {
            switch (targetId) {
                case IDs.CP.MODULE:
                    if (!this.isCPModuleInitialized) {
                        showToast("Načítavam modul Cestovný príkaz...", TOAST_TYPE.INFO);
                        const module = await import('./cp_module.js');
                        module.initializeCPModule();
                        this.isCPModuleInitialized = true;
                    }
                    const lookupId = activeUser.id || activeUser.oec;
                    if (activeUser && lookupId) {
                        this._autoDisplayEmployeeDetails(lookupId, store.getEmployee(lookupId));
                    }
                    break;

                case IDs.DOV.MODULE:
                    if (!this.isDovModuleInitialized) {
                        showToast("Načítavam modul dovoleniek...", TOAST_TYPE.INFO);
                        const module = await import('./dov_module.js');
                        await module.initializeDovModule();
                        this.isDovModuleInitialized = true;
                    }
                    const activeDovId = activeUser.id || activeUser.oec;
                    if (activeDovId) {
                        const module = await import('./dov_module.js');
                        await module.renderVacationModule(activeDovId);
                    }
                    break;

                case IDs.DUTY.MODULE:
                    if (!this.isSCHDModuleInitialized) {
                        showToast("Načítavam modul Pohotovosť...", TOAST_TYPE.INFO);
                        const module = await import('./schd_module.js');
                        module.initializeSCHDModule();
                        this.isSCHDModuleInitialized = true;
                    }
                    break;

                case IDs.IZS.MODULE:
                    if (!this.isIZSModuleInitialized) {
                        showToast("Načítavam agendu IZS a BB Kraj...", TOAST_TYPE.INFO);
                        const [izsMod, bbkMod] = await Promise.all([
                            import('./schd_izs_module.js'),
                            import('./schd_bbk_module.js')
                        ]);
                        izsMod.initializeIZSModule();
                        bbkMod.initializeBBKModule();
                        this.isIZSModuleInitialized = true;
                        this.isBBKModuleInitialized = true;
                    }
                    break;

                case IDs.UA.MODULE:
                    if (!this.isUAModuleInitialized) {
                        showToast("Načítavam modul UA Príspevky...", TOAST_TYPE.INFO);
                        const module = await import('./ua_module.js');
                        module.initializeUAModule(store.getDB(), activeUser);
                        this.isUAModuleInitialized = true;
                    }
                    break;

                case IDs.FUEL.MODULE:
                    if (!this.isFuelModuleInitialized) {
                        showToast("Načítavam modul PHM...", TOAST_TYPE.INFO);
                        const module = await import('./fuel_module.js');
                        module.initializeFuelModule();
                        this.isFuelModuleInitialized = true;
                    }
                    break;
            }
        } catch (error) {
            console.error(`Chyba pri načítaní modulu ${targetId}:`, error);
            showToast("Nepodarilo sa načítať modul. Skontrolujte pripojenie.", TOAST_TYPE.ERROR);
        }
    }

    _setupDashboardNavigation() {
        const dashboardCards = document.querySelectorAll('.nav-link-card');

        const cardsContainer = document.querySelector('.bento-grid-container');
        if (cardsContainer) {
            cardsContainer.onmousemove = e => {
                for (const card of document.getElementsByClassName("bento-card")) {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    card.style.setProperty("--mouse-x", `${x}px`);
                    card.style.setProperty("--mouse-y", `${y}px`);
                }
            };
        }

        dashboardCards.forEach(card => {
            card.addEventListener('click', async (event) => {
                event.preventDefault();
                const targetId = this._normalizeTargetId(card.getAttribute('data-target'));
                if (!targetId) return;

                dashboardCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');

                const originalLink = Array.from(this.menuLinks).find(link => this._normalizeTargetId(link.getAttribute('data-target')) === targetId);
                if (originalLink) {
                    originalLink.click();
                } else {
                    console.warn("Original menu link not found for target: " + targetId);
                }
            });
        });

        const dashboardCard = document.querySelector('.nav-link-card[data-target="dashboard-module"]');
        if (dashboardCard) dashboardCard.classList.add('active');
    }

    _setupSearch() {
        if (!this.searchInput || !this.clearSearchBtn) return;

        this.searchInput.addEventListener('input', (e) => {
            const term = e.target.value;
            if (term.length > 0) {
                this.clearSearchBtn.classList.remove('hidden');
            } else {
                this.clearSearchBtn.classList.add('hidden');
            }
            this._debounce(this._filterGlobalEmployeeList, 300)(term);
        });

        this.clearSearchBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.clearSearchBtn.classList.add('hidden');
            this.searchInput.focus();
            this._filterGlobalEmployeeList('');
        });
    }

    _debounce(func, delay) {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    _filterGlobalEmployeeList(searchTerm) {
        const listElement = document.getElementById(IDs.SIDEBAR.EMPLOYEES_LIST);
        if (!listElement) return;

        const allItems = listElement.querySelectorAll('li');
        let matchCount = 0;
        let uniqueMatchItem = null;
        const normalizedSearchTerm = searchTerm.toLowerCase().trim();

        allItems.forEach(item => {
            const text = item.textContent.toLowerCase();

            if (normalizedSearchTerm === '') {
                item.style.display = item.dataset.hiddenByRights === 'true' ? 'none' : '';
                if (item.style.display === '') matchCount++;
            } else if (text.includes(normalizedSearchTerm)) {
                item.style.display = '';
                matchCount++;
                uniqueMatchItem = item;
            } else {
                item.style.display = 'none';
            }
        });

        const countElement = document.getElementById(IDs.SIDEBAR.EMP_COUNT);
        if (countElement) {
            countElement.textContent = matchCount;
        }

        if (matchCount === 1 && uniqueMatchItem) {
            const empId = uniqueMatchItem.dataset.id;
            const employee = store.getEmployee(empId);

            if (empId && employee) {
                this._autoDisplayEmployeeDetails(empId, employee);
            }
        }
    }

    async _autoDisplayEmployeeDetails(empId, employee) {
        const globalListElement = document.getElementById(IDs.SIDEBAR.EMPLOYEES_LIST);
        if (globalListElement) {
            globalListElement.querySelectorAll('li').forEach(li => li.classList.remove('active-global-item'));
            const listItem = globalListElement.querySelector(`li[data-id="${empId}"]`);
            if (listItem) listItem.classList.add('active-global-item');
        }

        const activeModule = document.querySelector('.module-content:not(.hidden)');
        if (!activeModule) return;

        const activeUser = store.getUser();

        if (activeModule.id === IDs.CP.MODULE) {
            const canView = Permissions.canViewCP(activeUser, employee);
            if (canView) {
                try {
                    const module = await import('./cp_module.js');
                    module.displayCPEmployeeDetails(empId);
                } catch (e) {
                    console.warn("CP Modul ešte nie je pripravený.");
                }
            } else {
                showToast(`Nemáte oprávnenie vidieť detaily zamestnanca ${employee.displayName}.`, TOAST_TYPE.ERROR);
            }
        }

        if (activeModule.id === IDs.DOV.MODULE) {
            try {
                const module = await import('./dov_module.js');
                await module.renderVacationModule(empId);
            } catch (e) {
                console.error("Chyba pri načítaní dovoleniek:", e);
            }
        }
    }

    _renderGlobalEmployeeList(activeModuleId = 'dashboard-module') {
        const listElement = document.getElementById(IDs.SIDEBAR.EMPLOYEES_LIST);
        const countElement = document.getElementById(IDs.SIDEBAR.EMP_COUNT);

        if (!listElement || !countElement) return;

        const employeesMap = store.getEmployees();
        const activeUser = store.getUser();

        if (employeesMap.size === 0) {
            listElement.innerHTML = getSkeletonHTML('list', 10);
            return;
        }

        listElement.innerHTML = '';
        let visibleCount = 0;

        employeesMap.forEach((emp, empId) => {
            const shouldBeVisible = Permissions.canViewEmployeeList(activeUser, emp, activeModuleId);

            const li = document.createElement('li');
            li.dataset.id = empId;
            li.dataset.hiddenByRights = (!shouldBeVisible).toString();

            li.innerHTML = `
                <div class="dashboard-emp-details">
                    <span class="dashboard-emp-name">${emp.displayName}</span>
                    <span class="dashboard-emp-position">${emp.displayFunkcia}</span>
                </div>
            `;

            if (!shouldBeVisible) {
                li.style.display = 'none';
            } else {
                visibleCount++;
            }

            listElement.appendChild(li);
        });

        countElement.textContent = visibleCount;
        if (visibleCount === 0) {
            listElement.innerHTML = '<li>Nenašli sa žiadni zamestnanci pre zobrazenie.</li>';
        }

        this._initializeGlobalListListener();
    }

    _initializeGlobalListListener() {
        const globalListElement = document.getElementById(IDs.SIDEBAR.EMPLOYEES_LIST);
        if (!globalListElement) return;

        const newElement = cleanElement(globalListElement);

        newElement.addEventListener('click', (e) => {
            const clickedLi = e.target.closest('li');
            if (!clickedLi) return;

            const empId = clickedLi.dataset.id;
            if (!empId) return;

            const employee = store.getEmployee(empId);
            if (!employee) return;

            this._autoDisplayEmployeeDetails(empId, employee);
        });
    }

    _normalizeTargetId(targetId) {
        const map = {
            'dashboard-module': IDs.DASHBOARD.MODULE,
            'cestovny-prikaz-module': IDs.CP.MODULE,
            'dov-module': IDs.DOV.MODULE,
            'pohotovost-module': IDs.DUTY.MODULE,
            'izs-module': IDs.IZS.MODULE,
            'ua-contributions-module': IDs.UA.MODULE,
            'fuel-module': IDs.FUEL.MODULE,
        };
        return map[targetId] || targetId;
    }
}

// Pomocné funkcie
function getSkeletonHTML(type, count) {
    // Implementácia skeleton HTML
    return `<div>Skeleton for ${type} with ${count} items</div>`;
}

function cleanElement(element) {
    // Implementácia cleanElement
    return element;
}