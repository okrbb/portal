/* =================================== */
/* (Hlavný skript - "Shell")         */
/* =================================== */

import { initializeLogsModule, logUserAction, updateLogsUser } from './logs_module.js';

// === 1. IMPORTOVANIE KONFIGURÁCIE A POMOCNÝCH FUNKCIÍ ===
import { firebaseConfig } from './config.js';
import { debounce, handleError, showToast, TOAST_TYPE } from './utils.js';

// === 2. IMPORTOVANIE JEDNOTLIVÝCH MODULOV ===
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

// === 3. IMPORTOVANIE CENTRÁLNYCH PRÍSTUPOV ===
import { Permissions } from './accesses.js';

// --- FIREBASE INTEGRÁCIA ---
let app, db, auth;
let activeUser = null; 
let allEmployeesData = new Map();

try {
    app = firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    auth = firebase.auth();
    initializeLogsModule(db, null);
} catch (e) {
    console.error("Chyba pri inicializácii Firebase.", e);
    document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Chyba: Nepodarilo sa načítať Firebase SDK.</h1>';
}

// === NOVÉ: SELEKTORY PRE LOGIN MODÁL (Skopírované zo script_em.js) ===
const loginOverlay = document.querySelector('#login-modal-overlay');
const loginForm = document.querySelector('#login-form');
const emailInput = document.querySelector('#email-input'); 
const passwordInput = document.querySelector('#password-input'); 
const loginErrorMsg = document.querySelector('#login-error-msg');
// === KONIEC NOVÝCH SELEKTOROV ===

/**
 * Zobrazí modál a čaká na prihlásenie e-mailom a heslom.
 * Prispôsobená verzia funkcie z script_em.js.
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
        const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
            if (authUser) {
                unsubscribe();
                
                try {
                    // 1. Načítanie základných dát zamestnanca (ako doteraz)
                    const employeesRef = db.collection("employees");
                    const snapshot = await employeesRef.where("mail", "==", authUser.email).limit(1).get();

                    if (snapshot.empty) {
                        throw new Error(`Nenašiel sa profil pre ${authUser.email} v 'employees'.`);
                    }
                    const employeeData = snapshot.docs[0].data();

                    // 2. NOVÉ: Načítanie ROLE z kolekcie 'user_roles' podľa UID
                    let userRole = 'user'; // Fallback
                    try {
                        const roleDoc = await db.collection("user_roles").doc(authUser.uid).get();
                        if (roleDoc.exists) {
                            userRole = roleDoc.data().role;
                            console.log(`[Login] Načítaná rola pre ${authUser.email}: ${userRole}`);
                        } else {
                            console.warn(`[Login] Pozor: Používateľ ${authUser.email} (UID: ${authUser.uid}) nemá záznam v 'user_roles'. Priraďujem rolu 'user'.`);
                        }
                    } catch (roleError) {
                        console.error("[Login] Chyba pri sťahovaní role:", roleError);
                    }

                    // 3. Vytvorenie activeUser objektu s rolou
                    // OPRAVA: Definujeme activeUser lokálne pre tento scope, aby sme ho mohli poslať ďalej
                    const currentUserProfile = { 
                        uid: authUser.uid,
                        email: authUser.email,
                        ...employeeData,
                        role: userRole, // <--- Rola pre accesses.js
                        displayName: `${employeeData.titul || ''} ${employeeData.meno} ${employeeData.priezvisko}`.trim()
                    };

                    // OPRAVA: Použijeme currentUserProfile namiesto tempUserForLogs
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

                    // OPRAVA: Resolve vráti správny objekt
                    resolve(currentUserProfile);

                } catch (error) {
                    console.error("[MW] Chyba pri overovaní oprávnení:", error);
                    let msg = error.message;
                    loginErrorMsg.textContent = msg;
                    loginErrorMsg.style.display = 'block';
                    await auth.signOut();
                    resolve(null);
                }
            } else if (auth.currentUser === null) {
                loginErrorMsg.style.display = 'none';
            }
        });

        // Listener na submit formulára (spúšťa overenie v Auth)
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
                // Pokus o prihlásenie cez Firebase Auth
                await auth.signInWithEmailAndPassword(email, password);
                // Ďalšia logika (overenie DB/oprávnenia) sa vykoná v onAuthStateChanged
                
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

                await logAccess(email, null, false, msg);

                passwordInput.value = ''; 
                // Používateľ už v Auth nie je, nie je potrebné volať signOut
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
        auth.signOut().then(() => {
            window.location.reload(); 
        }).catch((error) => {
            console.error("Chyba pri odhlasovaní:", error);
            document.body.innerHTML = '<h1 style="padding: 2rem; text-align: center;">Chyba pri odhlasovaní.</h1>';
        });
    });
}

// === NOVÉ: Tlačidlo Reload ===
const reloadBtn = document.querySelector('#reload-btn');
if (reloadBtn) {
    reloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
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
    'izs-module': 'Rozpis služieb IZS',
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
    link.addEventListener('click', (event) => {
        event.preventDefault();
        const targetId = link.getAttribute('data-target');
        if (!targetId) return;

        // LOGOVANIE NAVIGÁCIE
        const moduleName = moduleTitles[targetId] || targetId;
        logUserAction("NAVIGACIA", `Prechod na modul: ${moduleName}`);

        // === NOVÉ: Zmena textu v hornom tlačidle a zatvorenie menu ===
        const dropdownBtn = document.querySelector('.nav-dropdown-btn');
        const dropdownMenu = document.querySelector('.nav-dropdown-menu');

        if (dropdownBtn) {
            // Zoberieme ikonu z kliknutej položky (aby to vyzeralo pekne)
            const iconClass = link.querySelector('i') ? link.querySelector('i').className : 'fa-solid fa-grid-2';
            
            // Prepíšeme HTML tlačidla (Ikona + Názov modulu + Šípka dole)
            dropdownBtn.innerHTML = `<i class="${iconClass}"></i> ${moduleName} <i class="fas fa-chevron-down ml-2"></i>`;
        }

        // Automaticky zatvoriť menu po kliknutí
        if (dropdownMenu) {
            dropdownMenu.classList.remove('show');
        }
        // === KONIEC NOVÉHO KÓDU ===

        // --- KONTROLA OPRÁVNENÍ (pomocou Permissions) ---
        renderGlobalEmployeeList(targetId);

        if (!Permissions.canViewModule(activeUser, targetId)) {
            showToast("Prístup zamietnutý. Nemáte potrebné oprávnenia na tento modul.", TOAST_TYPE.ERROR);
            return;
        }
        
        // Špeciálna hlavička pre modul Zamestnanci - OPRAVA CHYBY
        const headerNameSection = document.querySelector('.employee-name-section');
        let oecElement = null;
        
        // Kód vykonáme len ak hlavička existuje
        if (headerNameSection) {
            oecElement = headerNameSection.querySelector('.employee-oec-subtitle');
        }

        // Vnútri if (targetId === 'bbk-module'...)
        if (targetId === 'bbk-module' && !isBBKModuleInitialized) {
            try {
                if (db) {
                    initializeBBKModule(db, activeUser);
                    isBBKModuleInitialized = true;
                }
            } catch (e) {
                console.error("Chyba pri inicializácii BBK modulu:", e);
            }
        }

        menuLinks.forEach(otherLink => otherLink.classList.remove('active'));
        link.classList.add('active');
        contentModules.forEach(module => {
            module.classList.toggle('hidden', module.id !== targetId);
        });
        
        // Zobrazenie alebo skrytie akčných tlačidiel podľa modulu/oprávnení
        const exportBtn = document.getElementById('export-excel-btn');

        // Export tlačidlo (vždy, ak má user právo exportovať)
        if (exportBtn) {
            exportBtn.classList.toggle('hidden', !Permissions.canExportEmployees(activeUser));
        }
        
        // Inicializácia CP modulu
        if (targetId === 'cestovny-prikaz-module') {
            if (!isCPModuleInitialized) {
                try {
                    if (db) {
                        initializeCPModule(db, activeUser, allEmployeesData);
                        isCPModuleInitialized = true;
                    } else {
                         console.error("Chyba: DB nie je inicializované pre CP modul.");
                    }
                } catch (e) {
                    console.error("Chyba pri inicializácii cp_module.js:", e);
                }
            }

            const lookupId = activeUser.id || activeUser.oec;

            if (activeUser && lookupId) {
                console.log(`[MW] KLIK: Volám displayCPEmployeeDetails s ID: ${lookupId}`);
                autoDisplayEmployeeDetails(lookupId, allEmployeesData.get(lookupId));
            }
        }

        // Inicializácia SCHD modulu
        if (targetId === 'pohotovost-module' && !isSCHDModuleInitialized) {
            try {
                if (db) {
                    initializeSCHDModule(db, allEmployeesData, activeUser); 
                    isSCHDModuleInitialized = true;
                } else {
                     console.error("Chyba: DB nie je inicializované pre SCHD modul.");
                }
            } catch (e) {
                console.error("Chyba pri inicializácii schd_module.js:", e);
            }
        }

        // --- Inicializácia IZS modulu ---
        if (targetId === 'izs-module' && !isIZSModuleInitialized) {
            try {
                if (db) {
                    initializeIZSModule(db, activeUser);
                    isIZSModuleInitialized = true;
                } else {
                     console.error("Chyba: DB nie je inicializované pre IZS modul.");
                }
            } catch (e) {
                console.error("Chyba pri inicializácii schd_izs_module.js:", e);
            }
        }

        // Inicializácia UA modulu
        if (targetId === 'ua-contributions-module' && !isUAModuleInitialized) {
            try {
                if (db) {
                    initializeUAModule(db, activeUser); 
                    isUAModuleInitialized = true;
                } else {
                    console.error("Chyba: DB nie je inicializované pre UA modul.");
                }
            } catch (e) {
                console.error("Chyba pri inicializácii ua_module.js:", e);
            }
        }

        // Inicializácia Fuel modulu
        if (targetId === 'fuel-module' && !isFuelModuleInitialized) {
            try {
                if (db) {
                    initializeFuelModule(db, activeUser); 
                    isFuelModuleInitialized = true;
                } else {
                    console.error("Chyba: DB nie je inicializované pre Fuel modul.");
                }
            } catch (e) {
                console.error("Chyba pri inicializácii fuel_module.js:", e);
            }
        }

    });
});

/**
 * Filtruje globálny zoznam zamestnancov v pravom paneli.
 * @param {string} searchTerm - Text z vyhľadávacieho poľa.
 */
function filterGlobalEmployeeList(searchTerm) {
    const listElement = document.getElementById('global-employees-list-items');
    if (!listElement) return;

    const allItems = listElement.querySelectorAll('li');
    let matchCount = 0;
    let uniqueMatchItem = null;
    const normalizedSearchTerm = searchTerm.toLowerCase().trim();

    // Filtrujeme len zobrazené položky
    allItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        
        if (normalizedSearchTerm === '') {
            // Zobrazíme iba tých, ktorí sú v zozname (už prefiltrovaní pri renderGlobalEmployeeList)
            item.style.display = item.dataset.hiddenByRights === 'true' ? 'none' : ''; 
            if (item.style.display === '') matchCount++;
        } else if (text.includes(normalizedSearchTerm)) {
            // Ak sa zhoduje, zobrazíme (aj tie, ktoré boli skryté, ak ich nájde)
            item.style.display = '';
            matchCount++;
            uniqueMatchItem = item;
        } else {
            item.style.display = 'none';
        }
    });

    const countElement = document.getElementById('global-emp-count');
    if (countElement) {
        // Počítadlo ukazuje celkový počet zhôd (aj v skrytej časti)
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

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        debounce(filterGlobalEmployeeList, 300)(e.target.value);
    });
}

/**
 * === ÚPRAVA: NOVÁ CENTRÁLNA FUNKCIA pre zobrazenie detailov s KONTROLOU OPRÁVNENÍ (Permissions) ===
 * Zobrazí detaily zamestnanca v aktívnom module a zvýrazní ho v zozname.
 * @param {string} empId - ID zamestnanca
 * @param {Object} employee - Celý objekt zamestnanca
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
        // V CP je povolené vidieť iba vlastné údaje + podriadených (rovnaké ako admin)
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
    if (!globalListElement) {
        console.error("Kritická chyba: Globálny zoznam zamestnancov #global-employees-list-items nebol nájdený.");
        return;
    }

    globalListElement.addEventListener('click', (e) => {
        const clickedLi = e.target.closest('li');
        if (!clickedLi) return;

        const empId = clickedLi.dataset.id;
        if (!empId) {
            console.warn("Kliknutá položka zoznamu nemá 'data-id'.");
            return;
        }

        const employee = allEmployeesData.get(empId);
        if (!employee) {
            console.error(`Zamestnanec s ID ${empId} nebol nájdený v 'allEmployeesData'.`);
            return;
        }
        
        autoDisplayEmployeeDetails(empId, employee);
    });
}


/**
 * Načíta VŠETKÝCH zamestnancov do globálnej mapy allEmployeesData.
 */
async function loadGlobalEmployees(db) {
    console.log('Načítavam globálny zoznam zamestnancov...');
    if (!db) {
        console.error("loadGlobalEmployees zlyhalo: DB nie je pripravené.");
        return;
    }

    allEmployeesData.clear();
    
    try {
        const querySnapshot = await db.collection("employees").orderBy("priezvisko").get(); 
        
        querySnapshot.forEach((doc) => {
            const emp = doc.data();
            const empId = emp.kod || doc.id;
            
            let sluzobný_kontakt = '';
            const kontakt = emp.kontakt || ''; 
            if (kontakt.includes(',')) {
                const parts = kontakt.split(',');
                sluzobný_kontakt = parts[0] ? parts[0].trim() : '';
            } else if (kontakt.trim() !== 'null' && kontakt.trim() !== '') {
                sluzobný_kontakt = kontakt.trim();
            }

            allEmployeesData.set(empId, {
                ...emp,
                id: empId,
                displayName: `${emp.titul || ''} ${emp.meno} ${emp.priezvisko}`.trim(),
                displayFunkcia: emp.funkcia || 'Nezaradený',
                displayTelefon: sluzobný_kontakt || 'Neuvedený'
            });
        });
        console.log(`Globálny zoznam načítal ${allEmployeesData.size} zamestnancov.`);
    } catch (error) {
        console.error("Kritická chyba: Nepodarilo sa načítať globálny zoznam zamestnancov:", error);
    }
}


/**
 * Vykreslí globálny zoznam z 'allEmployeesData', filtruje ho pre ne-vedúcich.
 */
// Pridáme parameter s predvolenou hodnotou 'dashboard-module'
function renderGlobalEmployeeList(activeModuleId = 'dashboard-module') {
    const listElement = document.getElementById('global-employees-list-items');
    const countElement = document.getElementById('global-emp-count'); 
    
    if (!listElement || !countElement) { 
        console.error("Chyba: Globálny zoznam #global-employees-list-items alebo počítadlo #global-emp-count neboli nájdené.");
        return;
    }
    
    listElement.innerHTML = ''; 
    let visibleCount = 0;
    
    allEmployeesData.forEach((emp, empId) => {
        // TU JE ZMENA: Posielame activeModuleId do permission funkcie
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
 * Inicializuje ovládanie mobilného menu (ľavý a pravý sidebar).
 */
/* mainWizard.js - približne riadok 515 */

function initializeMobileMenu() {
    // Ľavé menu už v novom dizajne nepoužívame (je skryté), riešime len pravé
    const rightToggle = document.getElementById('mobile-menu-right-toggle');
    const rightSidebar = document.querySelector('.sidebar-right');
    const closeRightBtn = document.getElementById('close-right-sidebar'); // Pridané tlačidlo X

    // 1. Otvorenie cez FAB tlačidlo
    if (rightToggle && rightSidebar) {
        rightToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            // OPRAVA: Zmena z 'is-open' na 'active' podľa styles.css
            rightSidebar.classList.toggle('active'); 
        });
    }

    // 2. Zatvorenie cez tlačidlo X vnútri panelu
    if (closeRightBtn && rightSidebar) {
        closeRightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            rightSidebar.classList.remove('active');
        });
    }

    // 3. Zatvorenie pri kliknutí mimo
    document.addEventListener('click', (e) => {
        if (rightSidebar && rightSidebar.classList.contains('active')) {
            // Ak klik nebol v sidebare ani na toggle tlačidle
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
    if (!calendarEl) {
        console.warn("Element pre kalendár (#dashboard-calendar-render-area) nebol nájdený.");
        return;
    }
    
    if (!db) {
         console.error("Dashboard kalendár: Databáza 'db' nie je dostupná.");
         calendarEl.innerHTML = `<p style="color: red; padding: 1rem;">Chyba: Nepodarilo sa pripojiť k databáze pre načítanie rozpisov.</p>`;
         return;
    }

    // === NOVÉ: Referencie na filtre ===
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

            // --- Interakcia myšou (Hover) ---
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
                
                // === NOVÉ: Získanie stavu filtrov ===
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
                    
                    // Optimalizácia: Načítame len to, čo je zapnuté vo filtroch
                    // (Avšak, pre jednoduchosť kódu a cache radšej načítame všetko a filtrujeme pole,
                    //  pretože Firebase snapshoty sú "lacné" ak sa nemenia dáta)
                    
                    const promisesPohotovost = docIds.map(docId => db.collection("publishedSchedules").doc(docId).get());
                    const promisesIZS = docIds.map(docId => db.collection("publishedSchedulesIZS").doc(docId).get());

                    const [snapshotsPohotovost, snapshotsIZS] = await Promise.all([
                        Promise.all(promisesPohotovost),
                        Promise.all(promisesIZS)
                    ]);

                    let allCalendarEvents = [];

                    // --- A. SPRACOVANIE POHOTOVOSTI ---
                    // === NOVÉ: Podmienka if (showPohotovost) ===
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

                        for (const doc of snapshotsPohotovost) {
                            if (!doc.exists) continue;

                            const schedule = doc.data();
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
                    } // koniec if (showPohotovost)

                    // --- B. SPRACOVANIE IZS ---
                    // Spustíme iba ak je aspoň jeden IZS filter zapnutý
                    if (showIzsDay || showIzsNight) {
                        for (const doc of snapshotsIZS) {
                            if (!doc.exists) continue;
                            
                            const data = doc.data();
                            const year = data.year;
                            const monthIndex = data.monthIndex; 
                            const daysMap = data.days || {};

                            for (const [dayStr, shifts] of Object.entries(daysMap)) {
                                const day = parseInt(dayStr, 10);
                                
                                // 1. DENNÁ SLUŽBA (06:30 - 18:30)
                                // === NOVÉ: Podmienka if (showIzsDay) ===
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
                                // === NOVÉ: Podmienka if (showIzsNight) ===
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

        // === NOVÉ: Pridanie listenerov na checkboxy ===
        // Keď sa zmení checkbox, zavolá sa calendar.refetchEvents(),
        // čo znovu spustí funkciu 'events' (vyššie), ktorá si načíta nové stavy checkboxov.
        
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
    if (!listElement) {
        console.warn("Dashboard duty list element (#duty-list-items) nebol nájdený.");
        return;
    }

    listElement.innerHTML = '<li>Načítavam dáta...</li>';
    
    try {
        const today = new Date();
        const docId = `${today.getFullYear()}-${today.getMonth()}`;
        const weekInfo = getWeekNumber(today); 
        const weekKey = `${weekInfo.year}-${weekInfo.week}`;

        const docRef = db.collection("publishedSchedules").doc(docId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
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
 * Volá sa až po inicializácii aplikácie.
 */
function setupPasswordChangeLogic() {
    console.log("[MW] Inicializujem logiku zmeny hesla...");

    const changePassBtn = document.getElementById('change-password-btn');
    const changePassModal = document.getElementById('change-password-modal');
    const closePassModalBtn = document.getElementById('close-password-modal');
    const changePassForm = document.getElementById('change-password-form');
    const passErrorMsg = document.getElementById('password-error-msg');

    // Debuggovanie
    if (!changePassBtn) console.error("Chyba: Tlačidlo #change-password-btn sa nenašlo.");
    if (!changePassModal) console.error("Chyba: Modál #change-password-modal sa nenašiel.");

    if (changePassBtn && changePassModal) {
        // 1. Otvorenie modálu
        changePassBtn.onclick = (e) => {
            e.preventDefault();
            changePassModal.classList.remove('hidden');
            
            if(changePassForm) changePassForm.reset();
            // Skryjeme starú chybu pri otvorení
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
                
                // Skryjeme predchádzajúcu chybu pri novom pokuse
                if(passErrorMsg) passErrorMsg.style.display = 'none';

                const currentPass = document.getElementById('current-password').value;
                const newPass = document.getElementById('new-password').value;
                const confirmPass = document.getElementById('confirm-password').value;
                
                // Lokálne validácie
                if (newPass !== confirmPass) {
                    showError("Nové heslá sa nezhodujú.");
                    return;
                }
                if (newPass.length < 6) {
                    showError("Nové heslo musí mať aspoň 6 znakov.");
                    return;
                }

                try {
                    const user = firebase.auth().currentUser;
                    if (!user) throw new Error("Používateľ nie je prihlásený.");

                    // Loading stav tlačidla
                    const submitBtn = changePassForm.querySelector('button[type="submit"]');
                    submitBtn.textContent = "Overujem...";
                    submitBtn.disabled = true;

                    // A. Re-autentifikácia (Overenie starého hesla)
                    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPass);
                    await user.reauthenticateWithCredential(credential);

                    // B. Zmena hesla
                    submitBtn.textContent = "Ukladám...";
                    await user.updatePassword(newPass);

                    // Logovanie úspechu
                    await logUserAction("ZMENA_HESLA", "Používateľ si úspešne zmenil heslo.", true);

                    // Úspech UI
                    showToast("Heslo bolo úspešne zmenené.", TOAST_TYPE.SUCCESS);
                    changePassModal.classList.add('hidden');
                    changePassForm.reset();

                } catch (error) {
                    console.error("Chyba pri zmene hesla:", error);
                    
                    // --- PREKLAD CHÝB PRE POUŽÍVATEĽA ---
                    let msg = "Nepodarilo sa zmeniť heslo.";
                    
                    switch (error.code) {
                        case 'auth/wrong-password':
                        case 'auth/invalid-credential': // <--- PRIDANÉ: Zachytáva novší typ chyby pre zlé heslo
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
                            // Fallback pre neznáme chyby
                            msg = `Chyba: ${error.message}`;
                    }

                    // Logovanie chyby
                    await logUserAction("ZMENA_HESLA", "Zlyhal pokus o zmenu hesla", false, msg);
                    
                    // Zobrazenie chyby vo formulári
                    showError(msg);
                } finally {
                     // Reset tlačidla
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
 * VERZIA: Priame odoslanie žiadosti adminovi (bez DB kontroly, ktorá vyžaduje prihlásenie).
 */
function setupForgotPasswordLogic() {
    const forgotLink = document.getElementById('forgot-password-link');
    const forgotModal = document.getElementById('forgot-password-modal');
    const closeForgotModalBtn = document.getElementById('close-forgot-modal');
    const forgotForm = document.getElementById('forgot-password-form');
    const forgotErrorMsg = document.getElementById('forgot-error-msg');
    const emailInputLogin = document.getElementById('email-input');
    const forgotEmailInput = document.getElementById('forgot-email');

    // === KONFIGURÁCIA ADMINA ===
    const ADMIN_EMAIL = "mario.banic2@minv.sk"; 

    if (!forgotLink || !forgotModal || !forgotForm) return;

    // 1. Otvorenie modálu
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

    // 2. Zatvorenie modálu
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

    // 3. Odoslanie žiadosti
    forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userEmail = forgotEmailInput.value.trim();

        if (!userEmail) return;

        const submitBtn = forgotForm.querySelector('button[type="submit"]');
        
        // UI feedback
        submitBtn.disabled = true;
        submitBtn.textContent = 'Otváram e-mail...';

        // Príprava e-mailu
        const subject = `Žiadosť o reset hesla - OKR Portál`;
        const body = `Dobrý deň,\n\nprosím o resetovanie hesla pre používateľa s e-mailom: ${userEmail}.\n\nĎakujem.`;

        const mailtoLink = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        // Otvorenie klienta
        window.location.href = mailtoLink;

        // Reset UI
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

        // Aktualizujeme logy, aby už "vedeli" o role
        updateLogsUser(activeUser);

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
        
        // Predvolené skrytie tlačidiel pre ne-vedúcich (inicializácia)
        const editBtn = document.getElementById('edit-btn');
        // Export button už neriešime tu cez jednoduchý toggle, ale cez novú funkciu
        
        if (editBtn) editBtn.classList.add('hidden');
        
        // --- ZMENA: Aktivácia exportu okamžite po prihlásení ---
        activateGlobalExport(activeUser, allEmployeesData);
        // -------------------------------------------------------

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