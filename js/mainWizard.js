/* =================================== */
/* (Hlavný skript - "Shell")         */
/* =================================== */

// === 1. FIREBASE MODULAR IMPORTS ===
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
    doc, 
    orderBy 
} from 'firebase/firestore';

// === 2. IMPORTOVANIE POMOCNÝCH FUNKCIÍ ===
import { debounce, showToast, TOAST_TYPE } from './utils.js';
import { getSkeletonHTML } from './utils.js';
import { initializeLogsModule, logUserAction, updateLogsUser } from './logs_module.js';

// === 3. IMPORTOVANIE JEDNOTLIVÝCH MODULOV ===
import { initializeCPModule, displayCPEmployeeDetails } from './cp_module.js';
import { initializeSCHDModule } from './schd_module.js';
import { initializeBBKModule } from './schd_bbkraj_module.js';
import { initializeIZSModule } from './schd_izs_module.js';
import { initializeUAModule } from './ua_module.js';
import { activateGlobalExport } from './emp_module.js';
import { initializeFuelModule } from './fuel_module.js';
import { updateWelcomeWidget } from './widget.js';
import { renderAnnouncementWidget } from './announcements.js';
import { initializeAIModule } from './ai_module.js';
import { saveEmployeesToIDB, getEmployeesFromIDB, clearEmployeesIDB, clearAIIndexIDB } from './db_service.js';
import { performFullBackup } from './backup_service.js';
import { restoreCollectionFromFile } from './restore_service.js';

// === 4. IMPORTOVANIE CENTRÁLNYCH PRÍSTUPOV ===
import { Permissions } from './accesses.js';

// --- GLOBÁLNE PREMENNÉ ---
let activeUser = null; 
let allEmployeesData = new Map();

// Inicializácia Logov (DB už je inicializovaná v config.js)
initializeLogsModule(db, null);

// === SELEKTORY PRE LOGIN MODÁL ===
const loginOverlay = document.querySelector('#login-modal-overlay');
const loginForm = document.querySelector('#login-form');
const emailInput = document.querySelector('#email-input'); 
const passwordInput = document.querySelector('#password-input'); 
const loginErrorMsg = document.querySelector('#login-error-msg');

/**
 * Zobrazí modál a čaká na prihlásenie e-mailom a heslom.
 * @returns {Promise<Object|null>} - Vráti nájdené dáta používateľa alebo null pri zlyhaní.
 */
async function handleLogin() {
    if (!loginOverlay || !loginForm || !emailInput || !passwordInput || !loginErrorMsg) {
        console.error("[MW] Kritická chyba: Chýbajú HTML elementy pre prihlásenie.");
        return Promise.reject(new Error("Chýbajú prihlasovacie elementy."));
    }

    // Pred prvým pokusom zobrazíme modál
    loginOverlay.classList.remove('hidden');

    return new Promise((resolve) => {
        // ZMENA: Modular Auth Observer
        const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
            if (authUser) {
                unsubscribe();
                
                try {
                    // 1. Načítanie základných dát zamestnanca
                    // ZMENA: Modular Firestore Query
                    const employeesRef = collection(db, "employees");
                    const q = query(employeesRef, where("mail", "==", authUser.email), limit(1));
                    const snapshot = await getDocs(q);

                    if (snapshot.empty) {
                        throw new Error(`Nenašiel sa profil pre ${authUser.email} v 'employees'.`);
                    }
                    const employeeData = snapshot.docs[0].data();

                    // 2. Načítanie ROLE z kolekcie 'user_roles' podľa UID
                    let userRole = 'user'; // Fallback
                    try {
                        // ZMENA: Modular Get Doc
                        const roleRef = doc(db, "user_roles", authUser.uid);
                        const roleDoc = await getDoc(roleRef);
                        
                        if (roleDoc.exists()) {
                            userRole = roleDoc.data().role;
                            console.log(`[Login] Načítaná rola pre ${authUser.email}: ${userRole}`);
                        } else {
                            console.warn(`[Login] Pozor: Používateľ ${authUser.email} (UID: ${authUser.uid}) nemá záznam v 'user_roles'. Priraďujem rolu 'user'.`);
                        }
                    } catch (roleError) {
                        console.error("[Login] Chyba pri sťahovaní role:", roleError);
                    }

                    // 3. Vytvorenie activeUser objektu s rolou
                    const currentUserProfile = { 
                        uid: authUser.uid,
                        email: authUser.email,
                        ...employeeData,
                        role: userRole, 
                        displayName: `${employeeData.titul || ''} ${employeeData.meno} ${employeeData.priezvisko}`.trim()
                    };

                    updateLogsUser(currentUserProfile); 

                    // Logovanie akcie
                    await logUserAction("LOGIN", "Úspešné prihlásenie", true, null);

                    // Animácie UI
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
                    // ZMENA: Modular SignOut
                    await signOut(auth);
                    resolve(null);
                }
            } else if (auth.currentUser === null) {
                loginErrorMsg.style.display = 'none';
            }
        });

        // Listener na submit formulára
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
                // ZMENA: Modular SignIn
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

                // Tu voláme logovanie priamo, keďže activeUser ešte nie je nastavený
                // Poznámka: logAccess nie je importované, použijeme logUserAction s fallbackom
                // alebo ak máte funkciu logAccess v logs_module, importujte ju.
                // Pre jednoduchosť logujem do konzoly ak logAccess chýba
                console.warn("Failed login attempt logged locally:", email);

                passwordInput.value = ''; 
            }
        });
    });
}


/**
 * Aktualizuje informácie o prihlásenom používateľovi v päte sidebaru.
 */
function updateSidebarUser(user) {
    const userNameEl = document.querySelector('#sidebar-user-name');
    const userPositionEl = document.querySelector('#sidebar-user-position');
    const userInitialsEl = document.querySelector('#sidebar-user-initials'); 

    if (userNameEl && userPositionEl && userInitialsEl) {
        if (user) {
             userNameEl.textContent = `${user.titul || ''} ${user.meno} ${user.priezvisko}`.trim(); 
             userPositionEl.textContent = user.funkcia;
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

// --- INTERAKTIVITA "SHELLU" (Odhlásenie) ---
const logoutBtn = document.querySelector('#logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        // ZMENA: Modular SignOut
        signOut(auth).then(() => {
            window.location.reload(); 
        }).catch((error) => {
            console.error("Chyba pri odhlasovaní:", error);
            document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Chyba pri odhlasovaní.</h1>';
        });
    });
}

// === Tlačidlo Reload (Vynútená obnova dát) ===
const reloadBtn = document.querySelector('#reload-btn');
if (reloadBtn) {
    reloadBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        // Vymažeme VŠETKY cache v IndexedDB
        await Promise.all([
            clearEmployeesIDB(),
            clearAIIndexIDB()
        ]);

        console.log('Kompletná IndexedDB Cache vymazaná, reštartujem...');
        window.location.reload();
    });
}

// ===================================
// NAVIGÁCIA V MENU A SPRÁVA MODULOV
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

let isCPModuleInitialized = false;
let isSCHDModuleInitialized = false; 
let isBBKModuleInitialized = false;
let isIZSModuleInitialized = false;
let isUAModuleInitialized = false;
let isFuelModuleInitialized = false;

// --- Listener pre logo ---
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

// Listener pre položky menu
menuLinks.forEach(link => {
    link.addEventListener('click', async (event) => {
        event.preventDefault();
        const targetId = link.getAttribute('data-target');
        if (!targetId) return;

        // 1. Zistíme názov pre logovanie
        const moduleName = moduleTitles[targetId] || targetId;
        logUserAction("NAVIGACIA", `Prechod na modul: ${moduleName}`);

        // 2. Definujeme funkciu, ktorá reálne zmení DOM (prepne moduly)
        const updateDOM = async () => {
            // Zmena textu v hornom tlačidle a zatvorenie menu
            const dropdownBtn = document.querySelector('.nav-dropdown-btn');
            const dropdownMenu = document.querySelector('.nav-dropdown-menu');

            if (dropdownBtn) {
                const iconClass = link.querySelector('i') ? link.querySelector('i').className : 'fa-solid fa-grid-2';
                dropdownBtn.innerHTML = `<i class="${iconClass}"></i> ${moduleName} <i class="fas fa-chevron-down ml-2"></i>`;
            }

            if (dropdownMenu) {
                dropdownMenu.classList.remove('show');
            }

            // Samotné prepnutie viditeľnosti modulov
            menuLinks.forEach(otherLink => otherLink.classList.remove('active'));
            link.classList.add('active');
            
            contentModules.forEach(module => {
                // Tu sa deje mágia - výmena .hidden triedy
                if (module.id === targetId) {
                    module.classList.remove('hidden');
                } else {
                    module.classList.add('hidden');
                }
            });

            // Špecifické UI úpravy (Export button)
            const exportBtn = document.getElementById('export-excel-btn');
            if (exportBtn) {
                exportBtn.classList.toggle('hidden', !Permissions.canExportEmployees(activeUser));
            }
            
            // Prekreslenie zoznamu zamestnancov pre daný kontext
            renderGlobalEmployeeList(targetId);
        };

        // 3. Inicializácia modulov (Lazy Loading logika)
        // Toto musí prebehnúť PRED spustením tranzície, ak je to možné, 
        // alebo vnútri, ale neblokujúco.
        
        if (!Permissions.canViewModule(activeUser, targetId)) {
            showToast("Prístup zamietnutý.", TOAST_TYPE.ERROR);
            return;
        }

        // --- Inicializačná logika (skopírovaná z vášho pôvodného kódu) ---
        if (targetId === 'bbk-module' && !isBBKModuleInitialized && db) {
            initializeBBKModule(db, activeUser); isBBKModuleInitialized = true;
        }
        if (targetId === 'cestovny-prikaz-module') {
            if (!isCPModuleInitialized && db) {
                initializeCPModule(db, activeUser, allEmployeesData); isCPModuleInitialized = true;
            }
            const lookupId = activeUser.id || activeUser.oec;
            if (activeUser && lookupId) autoDisplayEmployeeDetails(lookupId, allEmployeesData.get(lookupId));
        }
        if (targetId === 'pohotovost-module' && !isSCHDModuleInitialized && db) {
            initializeSCHDModule(db, allEmployeesData, activeUser); isSCHDModuleInitialized = true;
        }
        if (targetId === 'izs-module' && !isIZSModuleInitialized && db) {
            initializeIZSModule(db, activeUser); isIZSModuleInitialized = true;
        }
        if (targetId === 'ua-contributions-module' && !isUAModuleInitialized && db) {
            initializeUAModule(db, activeUser); isUAModuleInitialized = true;
        }
        if (targetId === 'fuel-module' && !isFuelModuleInitialized && db) {
            initializeFuelModule(db, activeUser); isFuelModuleInitialized = true;
        }
        // -------------------------------------------------------------

        // 4. SPUSTENIE TRANZÍCIE (Podpora pre prehliadače)
        if (!document.startViewTransition) {
            // Fallback pre staršie prehliadače (okamžité prepnutie)
            await updateDOM();
        } else {
            // Moderný prehliadač -> Animácia
            document.startViewTransition(() => updateDOM());
        }
    });
});

/**
 * Filtruje globálny zoznam zamestnancov v pravom paneli.
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
        const employee = allEmployeesData.get(empId);

        if (empId && employee) {
            autoDisplayEmployeeDetails(empId, employee);
        }
    }
}

// --- NOVÁ LOGIKA PRE VYHĽADÁVANIE A MAZANIE ---
const clearSearchBtn = document.getElementById('clear-search-btn');

if (searchInput && clearSearchBtn) {
    // 1. Pri písaní zobraz/skry krížik a filtruj
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value;
        
        // Zobraz krížik len ak je tam text
        if (term.length > 0) {
            clearSearchBtn.classList.remove('hidden');
        } else {
            clearSearchBtn.classList.add('hidden');
        }

        // Spusti filtrovanie (debounce)
        debounce(filterGlobalEmployeeList, 300)(term);
    });

    // 2. Kliknutie na krížik
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';                 // Vymazať text
        clearSearchBtn.classList.add('hidden'); // Skryť krížik
        searchInput.focus();                    // Vrátiť kurzor do poľa
        
        // Okamžite resetovať zoznam (bez čakania 300ms)
        filterGlobalEmployeeList('');
    });
}

/**
 * Zobrazí detaily zamestnanca v aktívnom module a zvýrazní ho v zozname.
 */
function autoDisplayEmployeeDetails(empId, employee) {
    // 1. Zvýraznenie v globálnom zozname
    const globalListElement = document.getElementById('global-employees-list-items');
    if (globalListElement) {
        globalListElement.querySelectorAll('li').forEach(li => li.classList.remove('active-global-item'));
        const listItem = globalListElement.querySelector(`li[data-id="${empId}"]`);
        if (listItem) {
            listItem.classList.add('active-global-item');
        }
    }
    
    // 2. Zistenie aktívneho modulu
    const activeModule = document.querySelector('.module-content:not(.hidden)');
    if (!activeModule) return;

    if (activeModule.id === 'cestovny-prikaz-module') {
        const canView = Permissions.canViewCP(activeUser, employee);

        if (canView && typeof displayCPEmployeeDetails === 'function') {
            displayCPEmployeeDetails(empId);
        } else {
            showToast(`Nemáte oprávnenie vidieť detaily zamestnanca ${employee.displayName} v module Cestovný príkaz.`, TOAST_TYPE.ERROR);
            if (typeof displayCPEmployeeDetails === 'function') {
                displayCPEmployeeDetails(null);
            }
        }
    }
}

function initializeGlobalListListener() {
    const globalListElement = document.getElementById('global-employees-list-items');
    if (!globalListElement) return;

    globalListElement.addEventListener('click', (e) => {
        const clickedLi = e.target.closest('li');
        if (!clickedLi) return;

        const empId = clickedLi.dataset.id;
        if (!empId) return;

        const employee = allEmployeesData.get(empId);
        if (!employee) return;
        
        autoDisplayEmployeeDetails(empId, employee);
    });
}

const CACHE_KEY_EMPLOYEES = 'OKR_EMPLOYEES_CACHE_V1';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hodín

/**
 * Načíta zamestnancov. Používa IndexedDB pre cache.
 * @param {Object} db - Firestore inštancia
 * @param {boolean} forceRefresh - Ak je true, ignoruje cache a stiahne z DB
 */
async function loadGlobalEmployees(db, forceRefresh = false) {
    console.log('Spúšťam inteligentné načítanie zamestnancov...');
    
    // Skeleton
    const listElement = document.getElementById('global-employees-list-items');
    if (listElement) listElement.innerHTML = getSkeletonHTML('list', 10);

    if (!db) return;
    allEmployeesData.clear();

    try {
        // 1. KROK: Zistíme aktuálnu verziu dát na serveri (Cena: 1 Read)
        const metaRef = doc(db, 'settings', 'metadata');
        const metaSnap = await getDoc(metaRef);
        
        // Ak dokument neexistuje, nastavíme verziu na 0
        const serverVersion = metaSnap.exists() ? metaSnap.data().employeesVersion : 0;

        // 2. KROK: Zistíme verziu uloženú u používateľa
        const cachedRecord = await getEmployeesFromIDB();
        const localVersion = cachedRecord ? cachedRecord.version : -1;

        console.log(`Verzia dát: Server=${serverVersion} vs Local=${localVersion}`);

        // 3. KROK: Rozhodnutie
        if (!forceRefresh && cachedRecord && localVersion === serverVersion) {
            // A) Máme aktuálne dáta -> Použijeme Cache (0 Reads navyše)
            console.log('[SmartLoad] Dáta sú aktuálne. Načítavam z IndexedDB.');
            
            cachedRecord.data.forEach(item => {
                allEmployeesData.set(item[0], item[1]);
            });
            
            renderGlobalEmployeeList();
            return; 
        }

        // B) Dáta sú staré alebo chýbajú -> Sťahujeme z Firestore (Bezpečné & autorizované)
        console.log('[SmartLoad] Zistená zmena alebo prvé spustenie. Sťahujem Firestore...');
        
        const employeesRef = collection(db, "employees");
        const q = query(employeesRef, orderBy("priezvisko"));
        const querySnapshot = await getDocs(q); // Toto stojí (počet zamestnancov) Reads
        
        querySnapshot.forEach((doc) => {
            const emp = doc.data();
            const empId = emp.kod || doc.id;
            
            // ... (Vaša logika spracovania kontaktu) ...
            let sluzobny_kontakt = '';
            // ... (sem skopírujte vašu logiku parsovania kontaktu z pôvodného súboru) ...

            allEmployeesData.set(empId, {
                ...emp,
                id: empId,
                displayName: `${emp.titul || ''} ${emp.meno} ${emp.priezvisko}`.trim(),
                displayFunkcia: emp.funkcia || 'Nezaradený',
                displayTelefon: sluzobny_kontakt || 'Neuvedený'
            });
        });

        // 4. KROK: Uložíme nové dáta do IDB spolu s NOVOU VERZIOU
        const dataToSave = Array.from(allEmployeesData.entries());
        
        // POZOR: Musíte upraviť saveEmployeesToIDB v db_service.js, aby prijímala verziu!
        // Alebo to uložíme do objektu takto:
        await saveEmployeesToIDB(dataToSave, serverVersion); 

        console.log(`[SmartLoad] Aktualizované. Stiahnutých ${allEmployeesData.size} záznamov.`);
        renderGlobalEmployeeList();

    } catch (error) {
        console.error("Chyba loadGlobalEmployees:", error);
        showToast('Nepodarilo sa načítať zamestnancov.', TOAST_TYPE.ERROR);
    }
}

/**
 * Vykreslí globálny zoznam z 'allEmployeesData'.
 */
function renderGlobalEmployeeList(activeModuleId = 'dashboard-module') {
    const listElement = document.getElementById('global-employees-list-items');
    const countElement = document.getElementById('global-emp-count'); 
    
    if (!listElement || !countElement) return;
    
    listElement.innerHTML = ''; 
    let visibleCount = 0;
    
    allEmployeesData.forEach((emp, empId) => {
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

/**
 * Pomocná funkcia pre získanie čísla týždňa
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const isoYear = d.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { week: weekNo, year: isoYear };
}

/**
 * Pomocná funkcia pre získanie dátumu z ISO týždňa
 */
function getDateOfISOWeek(w, y) {
    const jan4 = new Date(Date.UTC(y, 0, 4)); 
    const jan4Day = (jan4.getUTCDay() + 6) % 7; 
    const mondayOfW1 = new Date(jan4.valueOf() - jan4Day * 86400000);
    return new Date(mondayOfW1.valueOf() + (w - 1) * 7 * 86400000);
}

/**
 * Inicializuje ovládanie mobilného menu.
 */
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
 * Inicializuje FullCalendar.
 */
async function initializeDashboardCalendar() {
    const calendarEl = document.getElementById('dashboard-calendar-render-area');
    if (!calendarEl) return;

    // 1. ZOBRAZIŤ SKELETON (Kým sa načíta FullCalendar)
    calendarEl.innerHTML = getSkeletonHTML('calendar');
    
    if (!db) {
         calendarEl.innerHTML = `<p style="color: red; padding: 1rem;">Chyba: Nepodarilo sa pripojiť k databáze pre načítanie rozpisov.</p>`;
         return;
    }

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
            buttonText: {
                today: 'dnes',
                month: 'mesiac',
                week:  'týždeň'
            },
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
                if (tooltip) {
                    tooltip.remove();
                }
            },
            
            // --- LOGIKA NAČÍTANIA DÁT ---
            events: async function(fetchInfo, successCallback, failureCallback) {
                
                const showPohotovost = filterPohotovost ? filterPohotovost.checked : true;
                const showIzsDay = filterIzsDay ? filterIzsDay.checked : true;
                const showIzsNight = filterIzsNight ? filterIzsNight.checked : true;

                const start = fetchInfo.start;
                const end = fetchInfo.end;
                let monthsToQuery = new Set();
                let currentDate = new Date(start);
                
                while (currentDate < end) {
                    const docId = `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
                    monthsToQuery.add(docId);
                    currentDate.setMonth(currentDate.getMonth() + 1);
                }
                const endMonthDate = new Date(end);
                endMonthDate.setDate(endMonthDate.getDate() - 1);
                monthsToQuery.add(`${endMonthDate.getFullYear()}-${endMonthDate.getMonth()}`);

                try {
                    const docIds = Array.from(monthsToQuery);
                    
                    // ZMENA: Modular Doc Fetching
                    const promisesPohotovost = docIds.map(docId => getDoc(doc(db, "publishedSchedules", docId)));
                    const promisesIZS = docIds.map(docId => getDoc(doc(db, "publishedSchedulesIZS", docId)));

                    const [snapshotsPohotovost, snapshotsIZS] = await Promise.all([
                        Promise.all(promisesPohotovost),
                        Promise.all(promisesIZS)
                    ]);

                    let allCalendarEvents = [];

                    // --- A. SPRACOVANIE POHOTOVOSTI ---
                    if (showPohotovost) {
                        const GROUP_COLORS = {
                            "Skupina 1": "#dd590d",
                            "Skupina 2": "#4CAF50",
                            "Skupina 3": "#a855f7"
                        };

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
                                            start: dateStr,
                                            end: dateStr,
                                            display: 'background',
                                            backgroundColor: groupColor,
                                            classNames: ['pohotovost-strip-day'], 
                                            allDay: true,
                                            extendedProps: { 
                                                tooltipTitle: 'Pohotovosť:',
                                                employeeNames: employeeNames }
                                        });
                                        currentLoopDate.setDate(currentLoopDate.getDate() + 1);
                                    }
                                }
                            }
                        }
                    } 

                    // --- B. SPRACOVANIE IZS ---
                    if (showIzsDay || showIzsNight) {
                        for (const docSnap of snapshotsIZS) {
                            if (!docSnap.exists()) continue;
                            
                            const data = docSnap.data();
                            const year = data.year;
                            const monthIndex = data.monthIndex; 
                            const daysMap = data.days || {};

                            for (const [dayStr, shifts] of Object.entries(daysMap)) {
                                const day = parseInt(dayStr, 10);
                                
                                // 1. DENNÁ SLUŽBA (06:30 - 18:30)
                                if (showIzsDay && shifts.dayShift && shifts.dayShift.length > 0) {
                                    const startD = new Date(year, monthIndex, day, 6, 30);
                                    const endD = new Date(year, monthIndex, day, 18, 30);

                                    allCalendarEvents.push({
                                        start: startD.toISOString(),
                                        end: endD.toISOString(),
                                        allDay: true,
                                        display: 'background', 
                                        classNames: ['izs-strip-day'],
                                        extendedProps: {
                                            tooltipTitle: 'IZS denná:',
                                            employeeNames: shifts.dayShift.map(name => {
                                                return name.toLowerCase().split(' ').map(word => 
                                                    word.charAt(0).toUpperCase() + word.slice(1)
                                                ).join(' ');
                                        })
                                        }
                                    });
                                }

                                // 2. NOČNÁ SLUŽBA
                                if (showIzsNight && shifts.nightShift && shifts.nightShift.length > 0) {
                                    const startN = new Date(year, monthIndex, day, 18, 30);
                                    const endN = new Date(year, monthIndex, day, 23, 59); 

                                    allCalendarEvents.push({
                                        start: startN.toISOString(),
                                        end: endN.toISOString(),
                                        allDay: true,
                                        display: 'background',
                                        classNames: ['izs-strip-night'],
                                        extendedProps: {
                                            tooltipTitle: 'IZS nočná:',
                                            employeeNames: shifts.nightShift.map(name => {
                                                return name.toLowerCase().split(' ').map(word => 
                                                    word.charAt(0).toUpperCase() + word.slice(1)
                                                ).join(' ');
                                            })
                                        }
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

        if (filterPohotovost) {
            filterPohotovost.addEventListener('change', () => calendar.refetchEvents());
        }
        if (filterIzsDay) {
            filterIzsDay.addEventListener('change', () => calendar.refetchEvents());
        }
        if (filterIzsNight) {
            filterIzsNight.addEventListener('change', () => calendar.refetchEvents());
        }

    } catch (e) {
        console.error("Chyba pri inicializácii FullCalendar:", e);
        calendarEl.innerHTML = `<p style="color: red; padding: 1rem;">Chyba: Nepodarilo sa načítať kalendár.</p>`;
    }
}

/**
 * Načíta zamestnancov, ktorí majú dnes pohotovosť.
 */
async function loadDashboardDutyToday(db) {
    if (!db) {
        console.error("loadDashboardDutyToday zlyhalo: DB nie je pripravené.");
        return;
    }

    const listElement = document.getElementById('duty-list-items');
    if (!listElement) return;

    // SKELETON (3 riadky stačia)
    listElement.innerHTML = getSkeletonHTML('list', 3);
    
    try {
        const today = new Date();
        const docId = `${today.getFullYear()}-${today.getMonth()}`;
        const weekInfo = getWeekNumber(today); 
        const weekKey = `${weekInfo.year}-${weekInfo.week}`;

        // ZMENA: Modular Doc Fetch
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
                
                if (overrideData.type === 'sub') {
                    suffix = ' (Zástup)';
                } else if (overrideData.type === 'swap') {
                    suffix = ' (Výmena)';
                }
            }
            
            const employeeInfo = allEmployeesData.get(finalEmployeeId);
            const displayInfo = (employeeInfo && employeeInfo.displayTelefon) ? employeeInfo.displayTelefon : 'Telefón neuvedený';
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
            
            if (emp.isReporting) {
                li.classList.add('reporting');
            }
            
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

/**
 * Nastaví logiku pre zmenu hesla.
 */
function setupPasswordChangeLogic() {
    console.log("[MW] Inicializujem logiku zmeny hesla...");

    const changePassBtn = document.getElementById('change-password-btn');
    const changePassModal = document.getElementById('change-password-modal');
    const closePassModalBtn = document.getElementById('close-password-modal');
    const changePassForm = document.getElementById('change-password-form');
    const passErrorMsg = document.getElementById('password-error-msg');

    if (changePassBtn && changePassModal) {
        // 1. Otvorenie modálu
        changePassBtn.onclick = (e) => {
            e.preventDefault();
            changePassModal.classList.remove('hidden');
            
            if(changePassForm) changePassForm.reset();
            if(passErrorMsg) {
                passErrorMsg.style.display = 'none';
                passErrorMsg.textContent = '';
            }
        };

        // 2. Zatvorenie modálu
        if (closePassModalBtn) {
            closePassModalBtn.onclick = () => {
                changePassModal.classList.add('hidden');
            };
        }

        // 3. Odoslanie formulára
        if (changePassForm) {
            changePassForm.onsubmit = async (e) => {
                e.preventDefault();
                if(passErrorMsg) passErrorMsg.style.display = 'none';

                const currentPass = document.getElementById('current-password').value;
                const newPass = document.getElementById('new-password').value;
                const confirmPass = document.getElementById('confirm-password').value;
                
                if (newPass !== confirmPass) {
                    showError("Nové heslá sa nezhodujú.");
                    return;
                }
                if (newPass.length < 6) {
                    showError("Nové heslo musí mať aspoň 6 znakov.");
                    return;
                }

                try {
                    // ZMENA: Modular Auth User
                    const user = auth.currentUser;
                    if (!user) throw new Error("Používateľ nie je prihlásený.");

                    const submitBtn = changePassForm.querySelector('button[type="submit"]');
                    submitBtn.textContent = "Overujem...";
                    submitBtn.disabled = true;

                    // A. Re-autentifikácia (ZMENA: Modular)
                    const credential = EmailAuthProvider.credential(user.email, currentPass);
                    await reauthenticateWithCredential(user, credential);

                    // B. Zmena hesla (ZMENA: Modular)
                    submitBtn.textContent = "Ukladám...";
                    await updatePassword(user, newPass);

                    await logUserAction("ZMENA_HESLA", "Používateľ si úspešne zmenil heslo.", true);

                    showToast("Heslo bolo úspešne zmenené.", TOAST_TYPE.SUCCESS);
                    changePassModal.classList.add('hidden');
                    changePassForm.reset();

                } catch (error) {
                    console.error("Chyba pri zmene hesla:", error);
                    let msg = "Nepodarilo sa zmeniť heslo.";
                    
                    switch (error.code) {
                        case 'auth/wrong-password':
                        case 'auth/invalid-credential':
                            msg = "Zadali ste nesprávne súčasné heslo.";
                            break;
                        case 'auth/weak-password':
                            msg = "Nové heslo je príliš slabé (vyžaduje sa aspoň 6 znakov).";
                            break;
                        case 'auth/too-many-requests':
                            msg = "Príliš veľa neúspešných pokusov. Skúste to neskôr.";
                            break;
                        case 'auth/requires-recent-login':
                            msg = "Pre bezpečnosť sa musíte odhlásiť a znova prihlásiť, aby ste mohli zmeniť heslo.";
                            break;
                        case 'auth/network-request-failed':
                            msg = "Chyba pripojenia. Skontrolujte internet.";
                            break;
                        default:
                            msg = `Chyba: ${error.message}`;
                    }

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

/**
 * Inicializuje logiku pre "Zabudol som heslo".
 */
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
        closeForgotModalBtn.addEventListener('click', () => {
            forgotModal.classList.add('hidden');
        });
    }

    forgotModal.addEventListener('click', (e) => {
        if (e.target === forgotModal) {
            forgotModal.classList.add('hidden');
        }
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

async function initializeApp() {
    try {
        setupForgotPasswordLogic();
        const userProfile = await handleLogin();

        if (!userProfile) {
            document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Prihlásenie zlyhalo alebo nemáte oprávnenia.</h1>';
            return;
        }

        activeUser = {
            uid: userProfile.uid,
            email: userProfile.email,
            role: userProfile.role, 
            titul: userProfile.titul || '',
            meno: userProfile.meno || '',
            priezvisko: userProfile.priezvisko || '',
            funkcia: userProfile.funkcia || 'Nezaradený',
            oddelenie: userProfile.oddelenie || 'Nezaradené'
        };

        updateLogsUser(activeUser);

        // === NASTAVENIE TLAČIDLA ZÁLOHY (ADMIN ONLY) ===
        if (Permissions.canManageLogs(activeUser)) { // Použijeme existujúce právo pre Admina
            const settingsMenu = document.querySelector('.settings-dropdown-menu');
            
            // Skontrolujeme, či tam už tlačidlo nie je (aby sme ho nepridali 2x pri re-init)
            let backupBtn = document.getElementById('backup-data-btn');
            
            if (!backupBtn && settingsMenu) {
                // Vytvoríme odkaz
                const link = document.createElement('a');
                link.href = "#";
                link.id = "backup-data-btn";
                link.innerHTML = `<i class="fas fa-database"></i> Zálohovať dáta (JSON)`;
                
                // Vložíme ho na začiatok alebo pred "Odhlásiť"
                // settingsMenu má zvyčajne Reload a Zmeniť heslo. Pridáme ho na koniec.
                settingsMenu.appendChild(link);
                
                // Listener
                link.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const confirmBackup = confirm("Spustiť kompletnú zálohu databázy?\n\nTento proces stiahne všetky dáta zamestnancov, rozpisov a vozidiel do jedného súboru.");
                    if (confirmBackup) {
                        // Zavrieme menu
                        settingsMenu.classList.remove('show');
                        // Spustíme zálohu
                        await performFullBackup(db);
                    }
                });
                
                console.log("Admin tlačidlo pre zálohu bolo pridané.");
            }

            // === ADMIN RESTORE TLAČIDLO ===
            // (Vložiť do if (Permissions.canManageLogs(activeUser)) { ... })
            if (settingsMenu && !document.getElementById('restore-data-btn')) {
                
                // 1. Skryté input pole pre výber súboru
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                // 2. Tlačidlo v menu
                const restoreLink = document.createElement('a');
                restoreLink.href = "#";
                restoreLink.id = "restore-data-btn";
                restoreLink.innerHTML = `<i class="fas fa-upload"></i> Obnoviť zo zálohy`;
                restoreLink.style.color = "#ff9f43"; // Oranžová pre odlíšenie (pozor!)

                settingsMenu.appendChild(restoreLink);

                // 3. Kliknutie na odkaz otvorí výber súboru
                restoreLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    settingsMenu.classList.remove('show');
                    fileInput.click(); // Simuluje klik na input
                });

                // 4. Po vybratí súboru spustíme restore
                fileInput.addEventListener('change', (e) => {
                    if (e.target.files.length > 0) {
                        const file = e.target.files[0];
                        restoreCollectionFromFile(file, db);
                        // Reset inputu, aby sa dal vybrať ten istý súbor znova ak treba
                        fileInput.value = ''; 
                    }
                });
                
                console.log("Admin Restore tlačidlo aktivované.");
            }
        }

        await loadGlobalEmployees(db);
        
        if (activeUser && activeUser.email && allEmployeesData.size > 0) {
            let fullActiveUser = null;
            let foundByEmail = false;

            for (const employee of allEmployeesData.values()) {
                if (employee.mail && employee.mail.toLowerCase() === activeUser.email.toLowerCase()) {
                    fullActiveUser = employee;
                    foundByEmail = true;
                    break;
                }
            }
            if (fullActiveUser) {
                activeUser.id = fullActiveUser.id;
                activeUser.oec = fullActiveUser.oec || '---';
                activeUser.displayName = `${fullActiveUser.titul || ''} ${fullActiveUser.meno} ${fullActiveUser.priezvisko}`.trim();
                activeUser.funkcia = fullActiveUser.funkcia || activeUser.funkcia;
                activeUser.oddelenie = fullActiveUser.oddelenie || activeUser.oddelenie;

                console.log(`[MW] Profil prihláseného používateľa nájdený: ID=${activeUser.id}, OEC=${activeUser.oec}, Mail=${activeUser.email}`);
            } else {
                console.warn("Nepodarilo sa nájsť plný profil pre prihláseného používateľa na doplnenie OEC.");
                activeUser.oec = 'CHYBA';
                activeUser.id = activeUser.email; 
                activeUser.displayName = `${activeUser.titul || ''} ${activeUser.meno} ${activeUser.priezvisko}`.trim();
            }
        }
        
        updateSidebarUser(activeUser);
        updateWelcomeWidget(activeUser);
        renderAnnouncementWidget(db, activeUser);
        
        initializeAIModule(db, activeUser);
        
        if (titleElement) {
            titleElement.textContent = moduleTitles['dashboard-module'] || 'Prehľad udalostí';
        }
        
        const editBtn = document.getElementById('edit-btn');
        if (editBtn) editBtn.classList.add('hidden');
        
        activateGlobalExport(activeUser, allEmployeesData);

        renderGlobalEmployeeList();
        await initializeDashboardCalendar(); 
        await loadDashboardDutyToday(db);
        
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
    console.error("Kritická chyba: Nepodarilo sa inicializovať databázu alebo autentifikáciu. Aplikácia sa nespustí.");
    document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Chyba: Nepodarilo sa pripojiť k databáze.</h1>';
}