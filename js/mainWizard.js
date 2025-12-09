/* =================================== */
/* (Hlavný skript - "Shell")         */
/* =================================== */

// === 1. STORE & CONFIG IMPORTS (Jadro aplikácie ostáva statické) ===
import { store } from './store.js';
import { 
    db, 
    auth 
} from './config.js';

import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut, 
    reauthenticateWithCredential, 
    updatePassword, 
    EmailAuthProvider 
} from 'firebase/auth';

import { 
    collection, 
    query, 
    where, 
    limit, 
    getDocs, 
    getDoc, 
    doc 
} from 'firebase/firestore';

// === 2. UTILITY A CORE MODULY ===
import { debounce, showToast, TOAST_TYPE, getSkeletonHTML } from './utils.js';
import { initializeLogsModule, logUserAction, updateLogsUser } from './logs_module.js';
import { updateWelcomeWidget } from './widget.js';
import { renderAnnouncementWidget } from './announcements.js';
import { initializeAIModule } from './ai_module.js';
import { clearEmployeesIDB, clearAIIndexIDB } from './db_service.js';
import { Permissions } from './accesses.js';

// Poznámka: emp_module nechávame statický, pretože export tlačidlo je viditeľné hneď
import { activateGlobalExport } from './emp_module.js';

// Inicializácia Logov (beží ihneď)
initializeLogsModule(store.getDB(), null);

// === SELEKTORY PRE LOGIN MODÁL ===
const loginOverlay = document.querySelector('#login-modal-overlay');
const loginForm = document.querySelector('#login-form');
const emailInput = document.querySelector('#email-input'); 
const passwordInput = document.querySelector('#password-input'); 
const loginErrorMsg = document.querySelector('#login-error-msg');

/**
 * Zobrazí modál a čaká na prihlásenie e-mailom a heslom.
 */
async function handleLogin() {
    if (!loginOverlay || !loginForm || !emailInput || !passwordInput || !loginErrorMsg) {
        console.error("[MW] Kritická chyba: Chýbajú HTML elementy pre prihlásenie.");
        return Promise.reject(new Error("Chýbajú prihlasovacie elementy."));
    }

    loginOverlay.classList.remove('hidden');

    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
            if (authUser) {
                unsubscribe();
                
                try {
                    // 1. Načítanie základných dát zamestnanca
                    const employeesRef = collection(store.getDB(), "employees");
                    const q = query(employeesRef, where("mail", "==", authUser.email), limit(1));
                    const snapshot = await getDocs(q);

                    if (snapshot.empty) {
                        throw new Error(`Nenašiel sa profil pre ${authUser.email} v 'employees'.`);
                    }
                    const employeeData = snapshot.docs[0].data();

                    // 2. Načítanie ROLE
                    let userRole = 'user'; 
                    try {
                        const roleRef = doc(store.getDB(), "user_roles", authUser.uid);
                        const roleDoc = await getDoc(roleRef);
                        
                        if (roleDoc.exists()) {
                            userRole = roleDoc.data().role;
                        }
                    } catch (roleError) {
                        console.error("[Login] Chyba pri sťahovaní role:", roleError);
                    }

                    // 3. Vytvorenie profilu a uloženie do STORE
                    const currentUserProfile = { 
                        uid: authUser.uid,
                        email: authUser.email,
                        ...employeeData,
                        role: userRole, 
                        displayName: `${employeeData.titul || ''} ${employeeData.meno} ${employeeData.priezvisko}`.trim()
                    };

                    store.setUser(currentUserProfile);
                    updateLogsUser(currentUserProfile); 

                    await logUserAction("LOGIN", "Úspešné prihlásenie", true, null);

                    const portalContainer = document.querySelector('.portal-container');
                    if (portalContainer) {
                        requestAnimationFrame(() => {
                            portalContainer.classList.add('app-visible');
                        });
                    }

                    loginOverlay.classList.add('fade-out');
                    setTimeout(() => {
                        loginOverlay.classList.add('hidden');
                        loginOverlay.classList.remove('fade-out'); 
                    }, 500);

                    resolve(currentUserProfile);

                } catch (error) {
                    console.error("[MW] Chyba pri overovaní oprávnení:", error);
                    let msg = error.message;
                    loginErrorMsg.textContent = msg;
                    loginErrorMsg.style.display = 'block';
                    await signOut(auth);
                    resolve(null);
                }
            } else if (auth.currentUser === null) {
                loginErrorMsg.style.display = 'none';
            }
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginErrorMsg.style.display = 'none'; 
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();

            if (!email || !password) {
                loginErrorMsg.textContent = 'Zadajte e-mail aj heslo.';
                loginErrorMsg.style.display = 'block';
                return;
            }

            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("[MW] Chyba pri prihlásení v Auth:", error);
                let msg = 'prístup zamietnutý';
                if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                    msg = 'Nesprávny e-mail alebo heslo.';
                } else if (error.message) {
                    msg = error.message; 
                }
                loginErrorMsg.textContent = msg;
                loginErrorMsg.style.display = 'block';
                passwordInput.value = ''; 
            }
        });
    });
}

function updateSidebarUser(user) {
    const userNameEl = document.querySelector('#sidebar-user-name');
    const userPositionEl = document.querySelector('#sidebar-user-position');
    const userInitialsEl = document.querySelector('#sidebar-user-initials'); 

    if (userNameEl && userPositionEl && userInitialsEl) {
        if (user) {
             userNameEl.textContent = user.displayName || '---'; 
             userPositionEl.textContent = user.funkcia || '---';
             const prveMeno = user.meno ? user.meno[0] : '';
             const prvePriezvisko = user.priezvisko ? user.priezvisko[0] : '';
             const initials = (prveMeno + prvePriezvisko).toUpperCase() || '--';
             userInitialsEl.textContent = initials;
        } else {
             userNameEl.textContent = '---';
             userPositionEl.textContent = '---';
             userInitialsEl.textContent = '--';
        }
    }
}

// --- INTERAKTIVITA "SHELLU" ---
const logoutBtn = document.querySelector('#logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        signOut(auth).then(() => {
            window.location.reload(); 
        }).catch((error) => {
            console.error("Chyba pri odhlasovaní:", error);
        });
    });
}

const reloadBtn = document.querySelector('#reload-btn');
if (reloadBtn) {
    reloadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await Promise.all([
            clearEmployeesIDB(),
            clearAIIndexIDB()
        ]);
        console.log('Cache vymazaná, reštartujem...');
        window.location.reload();
    });
}

// ===================================
// NAVIGÁCIA V MENU A LAZY LOADING
// ===================================

const moduleTitles = {
    'dashboard-module': 'Prehľad udalostí', 
    'cestovny-prikaz-module': 'Cestovný príkaz',
    'pohotovost-module': 'Rozpis pohotovosti',
    'bbk-module': 'Rozpis pohotovosti BB kraj', 
    'izs-module': 'Agenda služieb IZS',
    'ua-contributions-module': 'Príspevky UA', 
    'fuel-module': 'Evidencia spotreby PHM', 
};

const titleElement = document.getElementById('module-title');
const logoElement = document.querySelector('.sidebar-header .logo'); 
const menuLinks = document.querySelectorAll('.main-menu li a');
const contentModules = document.querySelectorAll('.module-content');
const searchInput = document.getElementById('global-employee-search');

// Flagy inicializácie pre Lazy Loading
let isCPModuleInitialized = false;
let isSCHDModuleInitialized = false; 
let isBBKModuleInitialized = false;
let isIZSModuleInitialized = false;
let isUAModuleInitialized = false;
let isFuelModuleInitialized = false;

// Klik na logo -> Dashboard
if (logoElement) {
    logoElement.addEventListener('click', () => {
        const targetId = logoElement.getAttribute('data-target');
        if (!targetId) return;
        if (titleElement) {
            const newTitle = moduleTitles[targetId] || 'Prehľad';
            titleElement.textContent = newTitle;
        }
        menuLinks.forEach(otherLink => otherLink.classList.remove('active'));
        contentModules.forEach(module => {
            module.classList.toggle('hidden', module.id !== targetId);
        });
    });
}

// Klik na položky menu (S DYNAMICKÝMI IMPORTMI)
menuLinks.forEach(link => {
    link.addEventListener('click', async (event) => {
        event.preventDefault();
        const targetId = link.getAttribute('data-target');
        if (!targetId) return;

        const activeUser = store.getUser();
        const moduleName = moduleTitles[targetId] || targetId;
        logUserAction("NAVIGACIA", `Prechod na modul: ${moduleName}`);

        if (!Permissions.canViewModule(activeUser, targetId)) {
            showToast("Prístup zamietnutý.", TOAST_TYPE.ERROR);
            return;
        }

        // 1. UI Update (prepnutie tabov)
        const updateDOM = () => {
            const dropdownBtn = document.querySelector('.nav-dropdown-btn');
            const dropdownMenu = document.querySelector('.nav-dropdown-menu');

            if (dropdownBtn) {
                const iconClass = link.querySelector('i') ? link.querySelector('i').className : 'fa-solid fa-grid-2';
                dropdownBtn.innerHTML = `<i class="${iconClass}"></i> ${moduleName} <i class="fas fa-chevron-down ml-2"></i>`;
            }
            if (dropdownMenu) dropdownMenu.classList.remove('show');

            menuLinks.forEach(otherLink => otherLink.classList.remove('active'));
            link.classList.add('active');
            
            contentModules.forEach(module => {
                module.classList.toggle('hidden', module.id !== targetId);
            });

            if (titleElement) titleElement.textContent = moduleName;

            const exportBtn = document.getElementById('export-excel-btn');
            if (exportBtn) {
                exportBtn.classList.toggle('hidden', !Permissions.canExportEmployees(activeUser));
            }
            
            renderGlobalEmployeeList(targetId);
        };

        if (document.startViewTransition) {
            document.startViewTransition(() => updateDOM());
        } else {
            updateDOM();
        }

        // 2. LAZY LOADING LOGIKA (Code Splitting)
        try {
            switch (targetId) {
                case 'cestovny-prikaz-module':
                    if (!isCPModuleInitialized) {
                        showToast("Načítavam modul Cestovný príkaz...", TOAST_TYPE.INFO);
                        const module = await import('./cp_module.js');
                        module.initializeCPModule();
                        isCPModuleInitialized = true;
                    }
                    const lookupId = activeUser.id || activeUser.oec;
                    if (activeUser && lookupId) {
                        // Dynamicky zavoláme funkciu na zobrazenie detailov
                        autoDisplayEmployeeDetails(lookupId, store.getEmployee(lookupId));
                    }
                    break;

                case 'pohotovost-module':
                    if (!isSCHDModuleInitialized) {
                        showToast("Načítavam modul Pohotovosť...", TOAST_TYPE.INFO);
                        const module = await import('./schd_module.js');
                        module.initializeSCHDModule();
                        isSCHDModuleInitialized = true;
                    }
                    break;

                case 'bbk-module':
                    if (!isBBKModuleInitialized) {
                        showToast("Načítavam modul BB Kraj...", TOAST_TYPE.INFO);
                        const module = await import('./schd_bbk_module.js');
                        module.initializeBBKModule();
                        isBBKModuleInitialized = true;
                    }
                    break;

                case 'izs-module':
                    if (!isIZSModuleInitialized) {
                        showToast("Načítavam modul IZS...", TOAST_TYPE.INFO);
                        const module = await import('./schd_izs_module.js');
                        module.initializeIZSModule();
                        isIZSModuleInitialized = true;
                    }
                    break;

                case 'ua-contributions-module':
                    if (!isUAModuleInitialized) {
                        showToast("Načítavam modul UA Príspevky...", TOAST_TYPE.INFO);
                        const module = await import('./ua_module.js');
                        // UA modul potrebuje DB inštanciu
                        module.initializeUAModule(store.getDB(), activeUser);
                        isUAModuleInitialized = true;
                    }
                    break;

                case 'fuel-module':
                    if (!isFuelModuleInitialized) {
                        showToast("Načítavam modul PHM...", TOAST_TYPE.INFO);
                        const module = await import('./fuel_module.js');
                        module.initializeFuelModule();
                        isFuelModuleInitialized = true;
                    }
                    break;
            }
        } catch (error) {
            console.error(`Chyba pri načítaní modulu ${targetId}:`, error);
            showToast("Nepodarilo sa načítať modul. Skontrolujte pripojenie.", TOAST_TYPE.ERROR);
        }
    });
});

/**
 * Filtruje globálny zoznam zamestnancov.
 */
function filterGlobalEmployeeList(searchTerm) {
    const listElement = document.getElementById('global-employees-list-items');
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

    const countElement = document.getElementById('global-emp-count');
    if (countElement) {
        countElement.textContent = matchCount;
    }

    if (matchCount === 1 && uniqueMatchItem) {
        const empId = uniqueMatchItem.dataset.id;
        const employee = store.getEmployee(empId);

        if (empId && employee) {
            autoDisplayEmployeeDetails(empId, employee);
        }
    }
}

const clearSearchBtn = document.getElementById('clear-search-btn');

if (searchInput && clearSearchBtn) {
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value;
        if (term.length > 0) {
            clearSearchBtn.classList.remove('hidden');
        } else {
            clearSearchBtn.classList.add('hidden');
        }
        debounce(filterGlobalEmployeeList, 300)(term);
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';                 
        clearSearchBtn.classList.add('hidden'); 
        searchInput.focus();                    
        filterGlobalEmployeeList('');
    });
}

/**
 * Zobrazí detaily zamestnanca v CP module (ak je aktívny).
 * Používa dynamický import, aby nezlyhala, ak modul ešte nie je načítaný.
 */
async function autoDisplayEmployeeDetails(empId, employee) {
    const globalListElement = document.getElementById('global-employees-list-items');
    if (globalListElement) {
        globalListElement.querySelectorAll('li').forEach(li => li.classList.remove('active-global-item'));
        const listItem = globalListElement.querySelector(`li[data-id="${empId}"]`);
        if (listItem) listItem.classList.add('active-global-item');
    }
    
    const activeModule = document.querySelector('.module-content:not(.hidden)');
    if (!activeModule) return;

    // Logika len pre CP modul
    if (activeModule.id === 'cestovny-prikaz-module') {
        const activeUser = store.getUser();
        const canView = Permissions.canViewCP(activeUser, employee);

        if (canView) {
            // Dynamický import funkcie pre zobrazenie
            try {
                const module = await import('./cp_module.js');
                module.displayCPEmployeeDetails(empId);
            } catch (e) {
                console.warn("CP Modul ešte nie je pripravený pre zobrazenie detailov.");
            }
        } else {
            showToast(`Nemáte oprávnenie vidieť detaily zamestnanca ${employee.displayName}.`, TOAST_TYPE.ERROR);
            try {
                const module = await import('./cp_module.js');
                module.displayCPEmployeeDetails(null);
            } catch(e) {}
        }
    }
}

function initializeGlobalListListener() {
    const globalListElement = document.getElementById('global-employees-list-items');
    if (!globalListElement) return;

    // Clone pre odstránenie starých listenerov pri re-render
    const newElement = globalListElement.cloneNode(true);
    globalListElement.parentNode.replaceChild(newElement, globalListElement);

    newElement.addEventListener('click', (e) => {
        const clickedLi = e.target.closest('li');
        if (!clickedLi) return;

        const empId = clickedLi.dataset.id;
        if (!empId) return;

        const employee = store.getEmployee(empId);
        if (!employee) return;
        
        autoDisplayEmployeeDetails(empId, employee);
    });
}

function renderGlobalEmployeeList(activeModuleId = 'dashboard-module') {
    // Nájdenie elementu v DOM (po klonovaní v listeneri musíme hľadať znova)
    const listElement = document.getElementById('global-employees-list-items');
    const countElement = document.getElementById('global-emp-count'); 
    
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

    initializeGlobalListListener();
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const isoYear = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { week: weekNo, year: isoYear };
}

function getDateOfISOWeek(w, y) {
    const jan4 = new Date(Date.UTC(y, 0, 4)); 
    const jan4Day = (jan4.getUTCDay() + 6) % 7; 
    const mondayOfW1 = new Date(jan4.valueOf() - jan4Day * 86400000);
    return new Date(mondayOfW1.valueOf() + (w - 1) * 7 * 86400000);
}

function initializeMobileMenu() {
    const rightToggle = document.getElementById('mobile-menu-right-toggle');
    const rightSidebar = document.querySelector('.sidebar-right');
    const closeRightBtn = document.getElementById('close-right-sidebar');

    if (rightToggle && rightSidebar) {
        rightToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            rightSidebar.classList.toggle('active'); 
        });
    }

    if (closeRightBtn && rightSidebar) {
        closeRightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            rightSidebar.classList.remove('active');
        });
    }

    document.addEventListener('click', (e) => {
        if (rightSidebar && rightSidebar.classList.contains('active')) {
            if (!rightSidebar.contains(e.target) && e.target !== rightToggle && !rightToggle.contains(e.target)) {
                rightSidebar.classList.remove('active');
            }
        }
    });
}

/**
 * Inicializuje FullCalendar (Dashboard).
 * Poznámka: Calendar logika ostáva v mainWizarde, lebo je súčasťou dashboardu (vždy načítaný).
 */
async function initializeDashboardCalendar() {
    const calendarEl = document.getElementById('dashboard-calendar-render-area');
    if (!calendarEl) return;

    calendarEl.innerHTML = getSkeletonHTML('calendar');
    const db = store.getDB();
    if (!db) return;

    const filterPohotovost = document.getElementById('filter-pohotovost');
    const filterIzsDay = document.getElementById('filter-izs-day');
    const filterIzsNight = document.getElementById('filter-izs-night');

    try {
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth', 
            locale: 'sk', 
            firstDay: 1, 
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek'
            },
            buttonText: { today: 'dnes', month: 'mesiac', week:  'týždeň' },
            height: 'auto',
            dayMaxEvents: 4, 

            eventMouseEnter: function(info) {
                const employeeList = info.event.extendedProps.employeeNames || [];
                const groupName = info.event.extendedProps.tooltipTitle || info.event.title || ''; 
                if (employeeList.length === 0) return;
                const tooltip = document.createElement('div');
                tooltip.className = 'calendar-tooltip';
                tooltip.id = 'current-calendar-tooltip';
                let namesHtml = employeeList.map(name => `• ${name}`).join('<br>');
                tooltip.innerHTML = `<strong>${groupName}</strong><div style="margin-top:4px;">${namesHtml}</div>`;
                document.body.appendChild(tooltip);
                const padding = 15;
                tooltip.style.left = (info.jsEvent.pageX + padding) + 'px';
                tooltip.style.top = (info.jsEvent.pageY + padding) + 'px';
            },

            eventMouseLeave: function(info) {
                const tooltip = document.getElementById('current-calendar-tooltip');
                if (tooltip) tooltip.remove();
            },
            
            events: async function(fetchInfo, successCallback, failureCallback) {
                const showPohotovost = filterPohotovost ? filterPohotovost.checked : true;
                const showIzsDay = filterIzsDay ? filterIzsDay.checked : true;
                const showIzsNight = filterIzsNight ? filterIzsNight.checked : true;

                const start = fetchInfo.start;
                const end = fetchInfo.end;
                let monthsToQuery = new Set();
                let currentDate = new Date(start);
                
                while (currentDate < end) {
                    monthsToQuery.add(`${currentDate.getFullYear()}-${currentDate.getMonth()}`);
                    currentDate.setMonth(currentDate.getMonth() + 1);
                }
                const endMonthDate = new Date(end);
                endMonthDate.setDate(endMonthDate.getDate() - 1);
                monthsToQuery.add(`${endMonthDate.getFullYear()}-${endMonthDate.getMonth()}`);

                try {
                    const docIds = Array.from(monthsToQuery);
                    const promisesPohotovost = docIds.map(docId => getDoc(doc(db, "publishedSchedules", docId)));
                    const promisesIZS = docIds.map(docId => getDoc(doc(db, "publishedSchedulesIZS", docId)));

                    const [snapshotsPohotovost, snapshotsIZS] = await Promise.all([
                        Promise.all(promisesPohotovost),
                        Promise.all(promisesIZS)
                    ]);

                    let allCalendarEvents = [];

                    if (showPohotovost) {
                        const GROUP_COLORS = { "Skupina 1": "#dd590d", "Skupina 2": "#4CAF50", "Skupina 3": "#a855f7" };
                        const formatLocalDate = (date) => {
                            const y = date.getFullYear();
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const d = String(date.getDate()).padStart(2, '0');
                            return `${y}-${m}-${d}`;
                        };

                        for (const docSnap of snapshotsPohotovost) {
                            if (!docSnap.exists()) continue;
                            const schedule = docSnap.data();
                            const dutyAssignments = schedule.dutyAssignments || {};
                            const serviceOverrides = schedule.serviceOverrides || {};
                            const docYear = schedule.year;
                            const docMonth = schedule.month; 
                            const monthStartDate = new Date(docYear, docMonth, 1);
                            const monthEndDate = new Date(docYear, docMonth + 1, 0);

                            for (const weekKey in dutyAssignments) {
                                const [year, weekNum] = weekKey.split('-').map(Number);
                                const weekStartDate_ISO = getDateOfISOWeek(weekNum, year);
                                const weekEndDate_ISO = new Date(weekStartDate_ISO);
                                weekEndDate_ISO.setDate(weekStartDate_ISO.getDate() + 6); 

                                const finalStartDate = new Date(Math.max(weekStartDate_ISO.getTime(), monthStartDate.getTime()));
                                const finalEndDate = new Date(Math.min(weekEndDate_ISO.getTime(), monthEndDate.getTime()));
                                const calendarEndDate = new Date(finalEndDate);
                                calendarEndDate.setDate(calendarEndDate.getDate() + 1);

                                const weekAssignments = dutyAssignments[weekKey];

                                if (weekAssignments && weekAssignments.length > 0) {
                                    const firstAssignment = weekAssignments[0];
                                    const groupName = firstAssignment.skupina || "Neznáma skupina";
                                    const groupColor = GROUP_COLORS[groupName] || '#808080';
                                    const employeeNames = [];
                                    const weekOverrides = serviceOverrides[weekKey] || {};

                                    weekAssignments.forEach(assignment => {
                                        let fullName = assignment.meno;
                                        let suffix = ''; 
                                        if (weekOverrides[assignment.id]) {
                                            const overrideData = weekOverrides[assignment.id];
                                            fullName = overrideData.meno || 'Neznámy';
                                            if (overrideData.type === 'sub') suffix = ' (Zástup)';
                                            if (overrideData.type === 'swap') suffix = ' (Výmena)';
                                        }
                                        const nameParts = fullName.trim().split(/\s+/);
                                        const surname = nameParts.length > 0 ? nameParts[nameParts.length - 1] : fullName;
                                        employeeNames.push(surname + suffix);
                                    });

                                    let currentLoopDate = new Date(finalStartDate);
                                    while (currentLoopDate < calendarEndDate) {
                                        const dateStr = formatLocalDate(currentLoopDate);
                                        allCalendarEvents.push({
                                            start: dateStr, end: dateStr, display: 'background',
                                            backgroundColor: groupColor, classNames: ['pohotovost-strip-day'], allDay: true,
                                            extendedProps: { tooltipTitle: 'Pohotovosť:', employeeNames: employeeNames }
                                        });
                                        currentLoopDate.setDate(currentLoopDate.getDate() + 1);
                                    }
                                }
                            }
                        }
                    } 

                    if (showIzsDay || showIzsNight) {
                        for (const docSnap of snapshotsIZS) {
                            if (!docSnap.exists()) continue;
                            const data = docSnap.data();
                            const year = data.year;
                            const monthIndex = data.monthIndex; 
                            const daysMap = data.days || {};

                            for (const [dayStr, shifts] of Object.entries(daysMap)) {
                                const day = parseInt(dayStr, 10);
                                if (showIzsDay && shifts.dayShift && shifts.dayShift.length > 0) {
                                    const startD = new Date(year, monthIndex, day, 6, 30);
                                    const endD = new Date(year, monthIndex, day, 18, 30);
                                    allCalendarEvents.push({
                                        start: startD.toISOString(), end: endD.toISOString(), allDay: true, display: 'background', 
                                        classNames: ['izs-strip-day'],
                                        extendedProps: { tooltipTitle: 'IZS denná:', employeeNames: shifts.dayShift.map(name => name.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')) }
                                    });
                                }
                                if (showIzsNight && shifts.nightShift && shifts.nightShift.length > 0) {
                                    const startN = new Date(year, monthIndex, day, 18, 30);
                                    const endN = new Date(year, monthIndex, day, 23, 59); 
                                    allCalendarEvents.push({
                                        start: startN.toISOString(), end: endN.toISOString(), allDay: true, display: 'background',
                                        classNames: ['izs-strip-night'],
                                        extendedProps: { tooltipTitle: 'IZS nočná:', employeeNames: shifts.nightShift.map(name => name.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')) }
                                    });
                                }
                            }
                        }
                    }
                    successCallback(allCalendarEvents);
                } catch (err) {
                    console.error("Chyba pri spracovaní dát rozpisov:", err);
                    failureCallback(err);
                }
            }
        });

        calendar.render();
        if (filterPohotovost) filterPohotovost.addEventListener('change', () => calendar.refetchEvents());
        if (filterIzsDay) filterIzsDay.addEventListener('change', () => calendar.refetchEvents());
        if (filterIzsNight) filterIzsNight.addEventListener('change', () => calendar.refetchEvents());

    } catch (e) {
        console.error("Chyba pri inicializácii FullCalendar:", e);
        calendarEl.innerHTML = `<p style="color: red; padding: 1rem;">Chyba: Nepodarilo sa načítať kalendár.</p>`;
    }
}

async function loadDashboardDutyToday() {
    const listElement = document.getElementById('duty-list-items');
    if (!listElement) return;

    listElement.innerHTML = getSkeletonHTML('list', 3);
    const db = store.getDB();
    if (!db) return;

    try {
        const today = new Date();
        const docId = `${today.getFullYear()}-${today.getMonth()}`;
        const weekInfo = getWeekNumber(today); 
        const weekKey = `${weekInfo.year}-${weekInfo.week}`;

        const docRef = doc(db, "publishedSchedules", docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            listElement.innerHTML = '<li>Pre dnešok nie je zverejnený rozpis.</li>';
            return;
        }

        const schedule = docSnap.data();
        const dutyAssignments = schedule.dutyAssignments || {};
        const serviceOverrides = schedule.serviceOverrides || {};
        const reporting = schedule.reporting || {};

        const weekAssignments = dutyAssignments[weekKey]; 
        const weekOverrides = serviceOverrides[weekKey] || {};
        const reportersForWeek = reporting[weekKey] || [];

        if (!weekAssignments || weekAssignments.length === 0) {
            listElement.innerHTML = '<li>Pre tento týždeň nie sú priradení zamestnanci.</li>';
            return;
        }

        let finalEmployees = [];
        for (const assignment of weekAssignments) {
            const originalId = assignment.id;
            let finalEmployeeId = originalId;
            let finalEmployeeName = assignment.meno;
            let suffix = '';
            
            if (weekOverrides[originalId]) {
                const overrideData = weekOverrides[originalId];
                finalEmployeeId = overrideData.id;
                finalEmployeeName = overrideData.meno || 'Chyba mena'; 
                
                if (overrideData.type === 'sub') suffix = ' (Zástup)';
                else if (overrideData.type === 'swap') suffix = ' (Výmena)';
            }
            
            const employeeInfo = store.getEmployee(finalEmployeeId);
            let displayInfo = 'Telefón neuvedený';
            if (employeeInfo && employeeInfo.displayTelefon) {
                displayInfo = employeeInfo.displayTelefon.split(',')[0].trim();
            }
            const isReporting = reportersForWeek.includes(finalEmployeeId);

            finalEmployees.push({
                name: finalEmployeeName,
                suffix: suffix,
                displayInfo: displayInfo,
                isReporting: isReporting
            });
        }

        listElement.innerHTML = '';
        if (finalEmployees.length === 0) {
            listElement.innerHTML = '<li>Nenašli sa žiadni relevantní zamestnanci pre dnešný deň.</li>';
            return;
        }
        
        finalEmployees.forEach(emp => {
            const li = document.createElement('li');
            if (emp.isReporting) li.classList.add('reporting');
            
            li.innerHTML = `
                <div class="dashboard-emp-details">
                    <span class="dashboard-emp-name">${emp.name}${emp.suffix}</span>
                    <span class="dashboard-emp-position">${emp.displayInfo}</span>
                </div>
            `;
            listElement.appendChild(li);
        });

    } catch (error) {
        console.error("Chyba pri načítaní pohotovosti pre dashboard:", error);
        listElement.innerHTML = '<li>Chyba pri načítaní dát.</li>';
    }
}

function setupPasswordChangeLogic() {
    const changePassBtn = document.getElementById('change-password-btn');
    const changePassModal = document.getElementById('change-password-modal');
    const closePassModalBtn = document.getElementById('close-password-modal');
    const changePassForm = document.getElementById('change-password-form');
    const passErrorMsg = document.getElementById('password-error-msg');

    if (changePassBtn && changePassModal) {
        changePassBtn.onclick = (e) => {
            e.preventDefault();
            changePassModal.classList.remove('hidden');
            if(changePassForm) changePassForm.reset();
            if(passErrorMsg) {
                passErrorMsg.style.display = 'none';
                passErrorMsg.textContent = '';
            }
        };

        if (closePassModalBtn) {
            closePassModalBtn.onclick = () => changePassModal.classList.add('hidden');
        }

        if (changePassForm) {
            changePassForm.onsubmit = async (e) => {
                e.preventDefault();
                if(passErrorMsg) passErrorMsg.style.display = 'none';

                const currentPass = document.getElementById('current-password').value;
                const newPass = document.getElementById('new-password').value;
                const confirmPass = document.getElementById('confirm-password').value;
                
                if (newPass !== confirmPass) return showError("Nové heslá sa nezhodujú.");
                if (newPass.length < 6) return showError("Nové heslo musí mať aspoň 6 znakov.");

                try {
                    const user = auth.currentUser;
                    if (!user) throw new Error("Používateľ nie je prihlásený.");

                    const submitBtn = changePassForm.querySelector('button[type="submit"]');
                    submitBtn.textContent = "Overujem...";
                    submitBtn.disabled = true;

                    const credential = EmailAuthProvider.credential(user.email, currentPass);
                    await reauthenticateWithCredential(user, credential);

                    submitBtn.textContent = "Ukladám...";
                    await updatePassword(user, newPass);

                    await logUserAction("ZMENA_HESLA", "Používateľ si úspešne zmenil heslo.", true);
                    showToast("Heslo bolo úspešne zmenené.", TOAST_TYPE.SUCCESS);
                    changePassModal.classList.add('hidden');
                    changePassForm.reset();

                } catch (error) {
                    console.error("Chyba pri zmene hesla:", error);
                    let msg = "Nepodarilo sa zmeniť heslo.";
                    if (error.code === 'auth/wrong-password') msg = "Nesprávne súčasné heslo.";
                    await logUserAction("ZMENA_HESLA", "Zlyhal pokus o zmenu hesla", false, msg);
                    showError(msg);
                } finally {
                     const submitBtn = changePassForm.querySelector('button[type="submit"]');
                     if(submitBtn) {
                        submitBtn.textContent = "Zmeniť heslo";
                        submitBtn.disabled = false;
                     }
                }
            };
        }
    }

    function showError(msg) {
        if (passErrorMsg) {
            passErrorMsg.textContent = msg;
            passErrorMsg.style.display = 'block';
            passErrorMsg.classList.add('shake');
            setTimeout(() => passErrorMsg.classList.remove('shake'), 500);
        } else {
            alert(msg);
        }
    }
}

function setupForgotPasswordLogic() {
    const forgotLink = document.getElementById('forgot-password-link');
    const forgotModal = document.getElementById('forgot-password-modal');
    const closeForgotModalBtn = document.getElementById('close-forgot-modal');
    const forgotForm = document.getElementById('forgot-password-form');
    const forgotErrorMsg = document.getElementById('forgot-error-msg');
    const emailInputLogin = document.getElementById('email-input');
    const forgotEmailInput = document.getElementById('forgot-email');

    const ADMIN_EMAIL = "mario.banic2@minv.sk"; 

    if (!forgotLink || !forgotModal || !forgotForm) return;

    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        forgotModal.classList.remove('hidden');
        if (forgotErrorMsg) forgotErrorMsg.style.display = 'none';
        
        if (emailInputLogin && emailInputLogin.value) {
            forgotEmailInput.value = emailInputLogin.value;
        } else {
            forgotEmailInput.value = '';
        }
        forgotEmailInput.focus();
    });

    if (closeForgotModalBtn) {
        closeForgotModalBtn.addEventListener('click', () => forgotModal.classList.add('hidden'));
    }

    forgotModal.addEventListener('click', (e) => {
        if (e.target === forgotModal) forgotModal.classList.add('hidden');
    });

    forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userEmail = forgotEmailInput.value.trim();
        if (!userEmail) return;

        const submitBtn = forgotForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Otváram e-mail...';

        const subject = `Žiadosť o reset hesla - OKR Portál`;
        const body = `Dobrý deň,\n\nprosím o resetovanie hesla pre používateľa s e-mailom: ${userEmail}.\n\nĎakujem.`;
        const mailtoLink = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        window.location.href = mailtoLink;
        showToast("Otvoril sa váš e-mailový klient. Odošlite správu adminovi.", TOAST_TYPE.INFO);
        forgotModal.classList.add('hidden');
        forgotForm.reset();
        
        submitBtn.disabled = false;
        submitBtn.textContent = 'Odoslať';
    });
}

/**
 * HLAVNÁ INICIALIZAČNÁ FUNKCIA
 */
async function initializeApp() {
    try {
        setupForgotPasswordLogic();
        const userProfile = await handleLogin(); // Store setUser je volané vnútri

        if (!userProfile) {
            document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Prihlásenie zlyhalo alebo nemáte oprávnenia.</h1>';
            return;
        }

        const activeUser = store.getUser();

        // === NASTAVENIE TLAČIDLA ZÁLOHY (ADMIN ONLY - LAZY LOADED) ===
        if (Permissions.canManageLogs(activeUser)) { 
            const settingsMenu = document.querySelector('.settings-dropdown-menu');
            let backupBtn = document.getElementById('backup-data-btn');
            
            if (!backupBtn && settingsMenu) {
                const link = document.createElement('a');
                link.href = "#";
                link.id = "backup-data-btn";
                link.innerHTML = `<i class="fas fa-database"></i> Zálohovať dáta (JSON)`;
                settingsMenu.appendChild(link);
                
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (confirm("Spustiť kompletnú zálohu databázy?\n\nTento proces stiahne všetky dáta zamestnancov, rozpisov a vozidiel do jedného súboru.")) {
                        settingsMenu.classList.remove('show');
                        showToast("Pripravujem zálohu...", TOAST_TYPE.INFO);
                        try {
                            // DYNAMICKÝ IMPORT
                            const backupService = await import('./backup_service.js');
                            await backupService.performFullBackup(store.getDB());
                        } catch (err) {
                            console.error(err);
                            showToast("Chyba pri načítaní zálohovacieho modulu.", TOAST_TYPE.ERROR);
                        }
                    }
                });
            }

            if (settingsMenu && !document.getElementById('restore-data-btn')) {
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
                    settingsMenu.classList.remove('show');
                    fileInput.click(); 
                });

                fileInput.addEventListener('change', async (e) => {
                    if (e.target.files.length > 0) {
                        const file = e.target.files[0];
                        showToast("Načítavam obnovovací modul...", TOAST_TYPE.INFO);
                        try {
                            // DYNAMICKÝ IMPORT
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

        // --- REAKTIVITA STORE ---
        store.subscribe((state) => {
            if (state.isLoading === false) {
                renderGlobalEmployeeList();
                // Refresh CP modulu ak je aktívny
                if (document.getElementById('cestovny-prikaz-module').classList.contains('active')) {
                     const lookupId = state.user.id || state.user.oec;
                     if (lookupId) autoDisplayEmployeeDetails(lookupId, state.employees.get(lookupId));
                }
                activateGlobalExport(state.user, state.employees);
            }
        });

        // Spustíme načítanie dát (Cache first)
        await store.loadEmployees();
        
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
        
        updateSidebarUser(activeUser);
        updateWelcomeWidget(activeUser);
        renderAnnouncementWidget(store.getDB(), activeUser);
        
        // AI Modul je ľahký, inicializujeme hneď (alebo by sme mohli tiež lazy loadnuť až po kliknutí na FAB)
        initializeAIModule(store.getDB(), activeUser);
        
        if (titleElement) {
            titleElement.textContent = moduleTitles['dashboard-module'] || 'Prehľad udalostí';
        }
        
        const editBtn = document.getElementById('edit-btn');
        if (editBtn) editBtn.classList.add('hidden');
        
        activateGlobalExport(activeUser, employeesMap);
        renderGlobalEmployeeList();
        
        await initializeDashboardCalendar(); 
        await loadDashboardDutyToday(store.getDB());
        
        initializeMobileMenu();
        setupPasswordChangeLogic();

        console.log("Portál pripravený. Aktívny používateľ: ", activeUser.funkcia, activeUser.oddelenie);

    } catch (error) {
        console.error("Kritická chyba pri inicializácii aplikácie:", error);
        let errorMessage = `Kritická chyba aplikácie: ${error.message}.`;
        document.body.innerHTML = `<h1 style="padding: 2rem; text-align: center;">${errorMessage}</h1>`;
    }
}

// --- SPUSTENIE ---
if (db && auth) {
    initializeApp();
} else {
    console.error("Kritická chyba: Nepodarilo sa inicializovať databázu alebo autentifikáciu.");
    document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Chyba: Nepodarilo sa pripojiť k databáze.</h1>';
}