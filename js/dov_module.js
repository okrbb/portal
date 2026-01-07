import { store } from './store.js';
import { db } from './config.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    addDoc, 
    query, 
    where,
    orderBy, 
    getDocs, 
    deleteDoc,
    increment,
    Timestamp 
} from 'firebase/firestore';

// ✅ NOVÉ: Import helpers
import { showToast, TOAST_TYPE, safeAsync, attachListener } from './utils.js';
import { fetchCollection, addDocument, updateDocument, deleteDocument } from './firebase_helpers.js';
import { lazyLoader } from './lazy_loader.js'; // ✅ LAZY LOADING
import { IDs } from './id-registry.js';

import { Permissions } from './accesses.js';

let currentYear = new Date().getFullYear().toString();
let unsubscribeStore = null;

/**
 * Inicializácia modulu
 */
export async function initializeDovModule() {
    console.log("[DovModule] Inicializácia...");
    
    if (unsubscribeStore) {
        unsubscribeStore();
    }
    
    unsubscribeStore = store.subscribe((state) => {
        if (state.user && state.employees.size > 0) {
            console.log("[DovModule] Store state updated, employees count:", state.employees.size);
        }
    });
}

export function cleanupDovModule() {
    if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
    }
    console.log("[DovModule] Cleanup completed.");
}

export async function renderVacationModule(empId) {
    const container = document.getElementById(IDs.DOV.MODULE);
        if (!container) return;

        const user = store.getUser();
        const employee = store.getEmployee(empId);
        if (!employee) return;

        // --- AUTOMATICKÉ PREDVOLANIE ROKA PO UZÁVIERKE --- 
        const systemYear = new Date().getFullYear().toString();
        const nextYear = (parseInt(systemYear) + 1).toString();

        if (currentYear === systemYear) {
            try {
                const nextYearRef = doc(db, `employees/${empId}/vacationStats/${nextYear}`);
                const nextYearSnap = await getDoc(nextYearRef);
                
                if (nextYearSnap.exists() && nextYearSnap.data().closedAt) {
                    currentYear = nextYear;
                }
            } catch (e) {
                console.warn("Nepodarilo sa overiť stav uzávierky pre automatické predvolanie.");
                console.error(e);
            }
        }

        const funkciaString = employee.funkcia || '';
        const funkciaParts = funkciaString.split(','); 
        const textZaCiarkou = (funkciaParts[1] || '').trim().toLowerCase();
        const isContinuous = textZaCiarkou === 'operátor linky 112';

        const yearOptions = [];
        const startY = new Date().getFullYear() + 1;
        for (let y = startY; y >= 2025; y--) {
            yearOptions.push(`<option value="${y}" ${y.toString() === currentYear ? 'selected' : ''}>Rok ${y}</option>`);
        }
    container.innerHTML = `
        <div class="ua-container" style="flex-direction: column; gap: 40px;">
            <div class="dashboard-row" id="${IDs.DOV.STATS_ROW}">
                <div class="fuel-summary-card" style="flex:1">
                    <div class="fuel-summary-label">Prenos</div>
                    <div id="${IDs.DOV.STAT_PRENOS}" class="fuel-summary-value">0</div>
                </div>
                <div class="fuel-summary-card" style="flex:1">
                    <div class="fuel-summary-label">Nárok</div>
                    <div id="${IDs.DOV.STAT_NAROK}" class="fuel-summary-value">0</div>
                </div>
                <div class="fuel-summary-card" style="flex:1">
                    <div class="fuel-summary-label">Vyčerpané</div>
                    <div id="${IDs.DOV.STAT_CERPANIE}" class="fuel-summary-value" style="color: #E53E3E">0</div>
                </div>
                <div class="fuel-summary-card" style="flex:1; border-color: var(--color-orange-accent)">
                    <div class="fuel-summary-label">Zostatok</div>
                    <div id="${IDs.DOV.STAT_ZOSTATOK}" class="fuel-summary-value" style="color: var(--color-orange-accent)">0</div>
                </div>
            </div>

            <div class="dashboard-row" style="align-items: stretch;">
                <div class="ua-card" style="flex: 1;">
                    <h2>Nová žiadosť</h2>
                    <form id="${IDs.DOV.NEW_VACATION_FORM}">
                        <div class="form-group">
                            <label>Dátum od</label>
                            <input type="date" id="${IDs.DOV.DATE_FROM}" required>
                        </div>
                        <div class="form-group">
                            <label>Dátum do</label>
                            <input type="date" id="${IDs.DOV.DATE_TO}" required>
                        </div>
                        <div class="cp-employee-card" id="${IDs.DOV.DAY_CALCULATION}" style="margin-bottom: 15px; display: none; background: rgba(188, 135, 0, 0.1); border: 1px solid var(--color-orange-accent);">
                            <p style="margin: 0; color: var(--color-text-primary);">Počet pracovných dní: <strong id="${IDs.DOV.DAYS_VALUE}" style="color: var(--color-orange-accent); font-size: 1.2rem;">0</strong></p>
                        </div>
                        
                        <div class="file-actions" style="display: flex; align-items: center; gap: 15px; justify-content: flex-end;">
                            <button type="submit" class="ua-btn default" id="${IDs.DOV.SAVE_VACATION_BTN}" style="padding: 8px 16px; font-size: 0.85rem;">Zapísať dovolenku</button>
                            <label class="filter-label" style="margin-bottom: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); font-size: 0.9rem;">
                                <input type="checkbox" id="${IDs.DOV.HALF_DAY_CHECKBOX}" style="display: none;">
                                <span class="filter-dot dot-yellow" style="margin: 0;"></span> 1/2 dňa
                            </label>
                        </div>
                    </form>

                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--color-border);">
                        <h3 id="${IDs.DOV.LIMITS_TITLE}">Nastavenia limitov (${currentYear})</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                            <div class="form-group">
                                <label>Prenos z m.r.</label>
                                <input type="number" id="${IDs.DOV.INPUT_PRENOS}" step="0.5" value="0" ${!Permissions.canEditVacationLimits(user) ? 'disabled' : ''}>
                            </div>
                            <div class="form-group">
                                <label>Ročný nárok</label>
                                <input type="number" id="${IDs.DOV.INPUT_NAROK}" step="1" value="20" ${!Permissions.canEditVacationLimits(user) ? 'disabled' : ''}>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                            <button class="ua-btn default" id="${IDs.DOV.RECALCULATE_BTN}" title="Prepočítať čerpanie podľa histórie">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            ${Permissions.canEditVacationLimits(user) ? `
                                <button class="ua-btn default" id="${IDs.DOV.UPDATE_LIMITS_BTN}">Aktualizovať limity</button>
                            ` : ''}
                            ${Permissions.canCloseVacationYear(user) ? `
                                <button class="ua-btn default delete-hover" id="${IDs.DOV.CLOSE_YEAR_BTN}">
                                    <i class="fas fa-lock" style="margin-right: 8px;"></i>Uzavrieť rok
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div class="ua-card" style="flex: 2;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0;">História čerpania - <span style="color: var(--color-orange-accent);">${employee.displayName}</span></h2>
                        <select id="${IDs.DOV.YEAR_SELECT}" class="ua-select" style="width: auto; padding: 5px 10px; background: var(--color-bg-light); border: 1px solid var(--color-border); color: white; border-radius: 4px; cursor: pointer;">
                            ${yearOptions.join('')}
                        </select>
                    </div>

                    <div class="fuel-history-container" style="max-height: 400px; overflow-y: auto; margin-bottom: 15px;">
                        <table class="history-table">
                            <thead>
                                <tr>
                                    <th>Od</th>
                                    <th>Do</th>
                                    <th class="text-right" style="padding-right: 20px;">Dní</th> 
                                    <th class="actions-col"></th> 
                                </tr>
                            </thead>
                            <tbody id="${IDs.DOV.HISTORY_BODY}">
                                <tr><td colspan="4" class="text-center">Načítavam údaje...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="file-actions" style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button class="ua-btn default" id="${IDs.DOV.DOWNLOAD_XLSX_BTN}">Stiahnuť (.xlsx)</button>
                        ${Permissions.canDownloadAllVacations(user) ? `
                            <button class="ua-btn default" id="${IDs.DOV.DOWNLOAD_ALL_BTN}">Hromadný prehľad</button>
                            <button class="ua-btn default" id="${IDs.DOV.DOWNLOAD_ALL_DETAILED_BTN}">Hromadný detail</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Pridanie event listenerov pre exporty
    attachListener(IDs.DOV.DOWNLOAD_XLSX_BTN, 'click', () => exportToExcel(empId, document.getElementById(IDs.DOV.DOWNLOAD_XLSX_BTN)));
    if (Permissions.canDownloadAllVacations(user)) {
        attachListener(IDs.DOV.DOWNLOAD_ALL_BTN, 'click', () => exportAllToExcel(document.getElementById(IDs.DOV.DOWNLOAD_ALL_BTN)));
        attachListener(IDs.DOV.DOWNLOAD_ALL_DETAILED_BTN, 'click', () => exportAllDetailedToExcel(document.getElementById(IDs.DOV.DOWNLOAD_ALL_DETAILED_BTN)));
    }

    // ✅ NOVÉ: Použitie attachListener namiesto clone node pattern
    attachListener(IDs.DOV.UPDATE_LIMITS_BTN, 'click', () => saveLimits(empId));
    
    if (Permissions.canCloseVacationYear(user)) {
        attachListener(IDs.DOV.CLOSE_YEAR_BTN, 'click', () => closeVacationYear(empId));
    }
    
    attachListener(IDs.DOV.RECALCULATE_BTN, 'click', () => recalculateAllVacations(empId));
    attachListener(IDs.DOV.NEW_VACATION_FORM, 'submit', (e) => {
        e.preventDefault();
        saveNewVacation(empId, isContinuous);
    });

    // Date calculation
    const dateFrom = document.getElementById(IDs.DOV.DATE_FROM);
    const dateTo = document.getElementById(IDs.DOV.DATE_TO);
    const calcDiv = document.getElementById(IDs.DOV.DAY_CALCULATION);
    const calcVal = document.getElementById(IDs.DOV.DAYS_VALUE);
    const halfDayCheck = document.getElementById(IDs.DOV.HALF_DAY_CHECKBOX);

    if (dateFrom && dateTo && calcDiv && calcVal) {
        const recalc = () => {
            const f = dateFrom.value;
            const t = dateTo.value;
            if (f && t) {
                const days = calcWorkingDays(new Date(f), new Date(t), isContinuous);
                const displayDays = halfDayCheck?.checked ? days / 2 : days;
                calcVal.textContent = displayDays.toFixed(1);
                calcDiv.style.display = 'block';
            } else {
                calcDiv.style.display = 'none';
            }
        };
        dateFrom.addEventListener('change', recalc);
        dateTo.addEventListener('change', recalc);
        if (halfDayCheck) halfDayCheck.addEventListener('change', recalc);
    }

    // Year select
    const yearSelectEl = document.getElementById(IDs.DOV.YEAR_SELECT);
    if (yearSelectEl) {
        yearSelectEl.addEventListener('change', (e) => {
            currentYear = e.target.value;
            renderVacationModule(empId);
        });
    }

    await loadVacationData(empId);
    renderVacationCalendar(empId, parseInt(currentYear));
}

/**
 * ✅ OPTIMALIZOVANÉ: Použitie updateDocument helper
 */
async function saveLimits(empId) {
    const prenos = Number(document.getElementById(IDs.DOV.INPUT_PRENOS).value) || 0;
    const narok = Number(document.getElementById(IDs.DOV.INPUT_NAROK).value) || 0;
    
    await safeAsync(
        async () => {
            const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
            const snap = await getDoc(statsRef);
            
            if (snap.exists()) {
                await updateDoc(statsRef, { prenos, narok });
            } else {
                await setDoc(statsRef, { prenos, narok, cerpanie: 0 });
            }
            
            showToast("Limity boli aktualizované.", TOAST_TYPE.SUCCESS);
            await loadVacationData(empId);
        },
        'Nepodarilo sa uložiť limity'
    );
}

async function saveNewVacation(empId, isContinuous) {
        const from = document.getElementById(IDs.DOV.DATE_FROM).value;
        const to = document.getElementById(IDs.DOV.DATE_TO).value;
        const isHalf = document.getElementById(IDs.DOV.HALF_DAY_CHECKBOX)?.checked || false;

        if (!from || !to) {
            showToast("Vyplňte oba dátumy.", TOAST_TYPE.ERROR);
            return;
        }

        const startDate = new Date(from);
        const endDate = new Date(to);

        if (startDate > endDate) {
            showToast("Dátum 'do' musí byť po dátume 'od'.", TOAST_TYPE.ERROR);
            return;
        }

        let days = calcWorkingDays(startDate, endDate, isContinuous);
        if (isHalf) days = days / 2;

        await safeAsync(
            async () => {
                // ✅ NOVÉ: Použitie addDocument
                await addDocument(`employees/${empId}/vacationRequests`, {
                    employeeId: empId,
                    startDate: Timestamp.fromDate(startDate),
                    endDate: Timestamp.fromDate(endDate),
                    daysCount: days,
                    isHalfDay: isHalf
                });

                // Update čerpanie
                const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
                await updateDoc(statsRef, { cerpanie: increment(days) });

                showToast(`Dovolenka zapísaná (${days} dní).`, TOAST_TYPE.SUCCESS);
                
                document.getElementById(IDs.DOV.DATE_FROM).value = '';
                document.getElementById(IDs.DOV.DATE_TO).value = '';
                document.getElementById(IDs.DOV.DAY_CALCULATION).style.display = 'none';
                if (document.getElementById(IDs.DOV.HALF_DAY_CHECKBOX)) {
                    document.getElementById(IDs.DOV.HALF_DAY_CHECKBOX).checked = false;
                }

                await loadVacationData(empId);
                renderVacationCalendar(empId, parseInt(currentYear));
                
                // ✅ NOVÉ: Obnovujem kalendár v Prehľade
                if (window.__dashboardManager) {
                    window.__dashboardManager.refetchCalendarEvents();
                }
            },
            'Nepodarilo sa uložiť dovolenku'
        );
}

async function deleteVacation(empId, reqId, daysCount) {
        if (!confirm("Naozaj vymazať tento záznam dovolenky?")) return;

        await safeAsync(
            async () => {
                // ✅ NOVÉ: Použitie deleteDocument
                await deleteDocument(`employees/${empId}/vacationRequests`, reqId);

                // Update čerpanie
                const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
                await updateDoc(statsRef, { cerpanie: increment(-daysCount) });

                showToast("Dovolenka bola vymazaná.", TOAST_TYPE.SUCCESS);
                await loadVacationData(empId);
                renderVacationCalendar(empId, parseInt(currentYear));
                
                // ✅ NOVÉ: Obnovujem kalendár v Prehľade
                if (window.__dashboardManager) {
                    window.__dashboardManager.refetchCalendarEvents();
                }
            },
            'Nepodarilo sa vymazať dovolenku'
        );
}

/**
 * ✅ OPTIMALIZOVANÉ: Batch uzávierka roka
 */
async function closeVacationYear(empId) {
    const btnElement = document.getElementById(IDs.DOV.CLOSE_YEAR_BTN);
    if (!btnElement) return;

    const nextYear = (parseInt(currentYear) + 1).toString();
    const employeesMap = store.getEmployees();
    
    // Kontrola predošlej uzávierky
    let isAlreadyClosed = false;
    let lastClosedInfo = "";

    const firstEmpId = Array.from(employeesMap.keys())[0];
    if (firstEmpId) {
        const checkRef = doc(db, `employees/${firstEmpId}/vacationStats/${nextYear}`);
        const checkSnap = await getDoc(checkRef);
        if (checkSnap.exists() && checkSnap.data().closedAt) {
            isAlreadyClosed = true;
            const d = checkSnap.data().closedAt.toDate();
            lastClosedInfo = `\n\nPosledná uzávierka bola vykonaná: ${d.toLocaleString('sk-SK')} (${checkSnap.data().closedBy || 'Admin'})`;
        }
    }

    const baseMsg = `POZOR: Táto akcia uzavrie rok ${currentYear} pre VŠETKÝCH zamestnancov a prenesie zostatky do roku ${nextYear}.`;
    const warningMsg = isAlreadyClosed 
        ? `⚠️ UPOZORNENIE: Uzávierka pre tento rok už bola raz vykonaná.${lastClosedInfo}\n\nOpätovné spustenie prepíše aktuálne prenosy v roku ${nextYear}. Chcete napriek tomu pokračovať?`
        : `${baseMsg}\n\nPokračovať?`;

    if (!confirm(warningMsg)) return;

    const originalContent = btnElement.innerHTML;
    btnElement.classList.add('btn-loading');
    btnElement.innerHTML = `<i class="fas fa-spinner"></i>...`;

    await safeAsync(
        async () => {
            const closureData = [];
            const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
            const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));

            for (const [empId, emp] of employeesMap) {
                if (emp.id === 'test') continue;

                const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
                const statsSnap = await getDoc(statsRef);
                const stats = statsSnap.exists() ? statsSnap.data() : { prenos: 0, narok: 20 };

                // ✅ NOVÉ: Použitie fetchCollection
                const requests = await fetchCollection(`employees/${empId}/vacationRequests`, {
                    whereConditions: [
                        { field: 'startDate', operator: '>=', value: yearStart },
                        { field: 'startDate', operator: '<=', value: yearEnd }
                    ]
                });

                let totalSpent = 0;
                requests.forEach(req => totalSpent += Number(req.daysCount || 0));

                const balance = (Number(stats.prenos) + Number(stats.narok)) - totalSpent;

                const nextYearRef = doc(db, `employees/${empId}/vacationStats/${nextYear}`);
                await setDoc(nextYearRef, {
                    prenos: balance,
                    narok: stats.narok,
                    cerpanie: 0,
                    closedAt: Timestamp.now(),
                    closedBy: store.getUser()?.displayName || 'Admin'
                });

                closureData.push({ 
                    oec: emp.oec || '-', 
                    meno: emp.displayName, 
                    prenos: stats.prenos, 
                    narok: stats.narok, 
                    cerpanie: totalSpent, 
                    zostatok: balance 
                });
            }

            currentYear = nextYear; 
            await downloadClosureExcel(closureData, (parseInt(nextYear) - 1).toString());
            showToast(`Rok úspešne uzavretý. Modul bol prepnutý na rok ${currentYear}.`, TOAST_TYPE.SUCCESS);
            
            const activeUser = store.getUser();
            if (activeUser) renderVacationModule(activeUser.id || activeUser.oec);
        },
        'Chyba pri ročnej uzávierke'
    );

    btnElement.classList.remove('btn-loading');
    btnElement.innerHTML = originalContent;
}

async function loadVacationData(empId) {
        const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
        const statsSnap = await getDoc(statsRef);
        
        let stats = { prenos: 0, narok: 20, cerpanie: 0 };
        
        if (statsSnap.exists()) {
            stats = statsSnap.data();
        } else {
            // Prenos nároku z predchádzajúceho roka
            try {
                const prevYear = (parseInt(currentYear) - 1).toString();
                const prevStatsRef = doc(db, `employees/${empId}/vacationStats/${prevYear}`);
                const prevSnap = await getDoc(prevStatsRef);
                
                if (prevSnap.exists()) {
                    stats.narok = prevSnap.data().narok || 20;
                }
            } catch (e) {
                console.warn("Nepodarilo sa prebrať nárok z minulého roka, použijem predvolených 20.");
                console.error(e);
            }
            
            await setDoc(statsRef, stats);
        }

        // ✅ NOVÉ: Použitie fetchCollection
        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));
        
        const requests = await fetchCollection(`employees/${empId}/vacationRequests`, {
            whereConditions: [
                { field: 'startDate', operator: '>=', value: yearStart },
                { field: 'startDate', operator: '<=', value: yearEnd }
            ]
        });
        
        let realSum = 0;
        requests.forEach(req => {
            realSum += Number(req.daysCount || 0);
        });

        // Update UI
        document.getElementById(IDs.DOV.STAT_PRENOS).textContent = stats.prenos;
        document.getElementById(IDs.DOV.STAT_NAROK).textContent = stats.narok;
        document.getElementById(IDs.DOV.STAT_CERPANIE).textContent = realSum.toFixed(1);
        document.getElementById(IDs.DOV.STAT_ZOSTATOK).textContent = ((stats.prenos + stats.narok) - realSum).toFixed(1);
        document.getElementById(IDs.DOV.INPUT_PRENOS).value = stats.prenos;
        document.getElementById(IDs.DOV.INPUT_NAROK).value = stats.narok;

        renderVacationTable(requests, empId);
}
function renderVacationTable(requests, empId) {
    const historyBody = document.getElementById(IDs.DOV.HISTORY_BODY);
    if (!historyBody) return;

    if (requests.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="4" class="text-center">Žiadne záznamy v tomto roku.</td></tr>';
        return;
    }

    historyBody.innerHTML = '';
    // Zoradenie od najnovšieho
    const sorted = [...requests].sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());

    sorted.forEach(req => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${req.startDate.toDate().toLocaleDateString('sk-SK')}</td>
            <td>${req.endDate.toDate().toLocaleDateString('sk-SK')}</td>
            <td class="text-right" style="padding-right: 20px;"><strong>${req.daysCount}</strong></td>
            <td class="text-center">
                <button class="action-btn-edit btn-delete-vac" 
                        data-id="${req.id}" 
                        data-days="${req.daysCount}" 
                        title="Zmazať záznam">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;

        const delBtn = tr.querySelector('.btn-delete-vac');
        delBtn.onclick = () => deleteVacation(empId, req.id, req.daysCount);
        
        historyBody.appendChild(tr);
    });
}

/**
 * ✅ NOVÉ/PRENESENÉ: Logika pre kalendár
 */
async function renderVacationCalendar(empId, year) {
    const calendarEl = document.getElementById(IDs.DOV.VACATION_MINI_CALENDAR);
    if (!calendarEl) return;

    // Tu môžete použiť FullCalendar podobne ako v mainWizarde
    // Pre jednoduchosť zatiaľ placeholder alebo inicializácia mini-kalendára
    calendarEl.innerHTML = '<p class="text-muted">Načítavam kalendár...</p>';
}

/**
 * ✅ PRENESENÉ: Individuálny export
 */
async function exportToExcel(empId, btnElement) {
    const employee = store.getEmployee(empId);
    if (!employee || !btnElement) return;

    const originalContent = btnElement.innerHTML;
    btnElement.classList.add('btn-loading');
    btnElement.innerHTML = `<i class="fas fa-spinner"></i> Generujem Generujem...`;

    await safeAsync(async () => {
        // ✅ LAZY LOADING: Načítame ExcelJS a FileSaver len pri exporte
        let ExcelJS, saveAs;
        try {
            showToast('Pripravujem export...', TOAST_TYPE.INFO, 1000);
            const libs = await lazyLoader.loadExcelBundle();
            ExcelJS = libs.ExcelJS;
            saveAs = libs.FileSaver;
        } catch (error) {
            console.error('Chyba pri načítaní Excel knižníc:', error);
            showToast('Chyba: Knižnica pre export sa nepodarila načítať.', TOAST_TYPE.ERROR);
            btnElement.classList.remove('btn-loading');
            btnElement.innerHTML = originalContent;
            return;
        }

        const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
        const statsSnap = await getDoc(statsRef);
        const statsData = statsSnap.exists() ? statsSnap.data() : { prenos: 0, narok: 0 };

        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));
        
        const history = await fetchCollection(`employees/${empId}/vacationRequests`, {
            whereConditions: [
                { field: 'startDate', operator: '>=', value: yearStart },
                { field: 'startDate', operator: '<=', value: yearEnd }
            ],
            orderByField: 'startDate'
        });

        const calculatedCerpanie = history.reduce((sum, req) => sum + Number(req.daysCount), 0);
        const zostatok = (Number(statsData.prenos) + Number(statsData.narok)) - calculatedCerpanie;

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Dovolenky ${currentYear}`);

        // ✅ NASTAVENIE ŠÍRKY STĹPCOV (14, 14, 11, 11)
        sheet.columns = [
            { width: 14 }, // Stĺpec A
            { width: 14 }, // Stĺpec B
            { width: 11 }, // Stĺpec C
            { width: 11 }  // Stĺpec D
        ];
        
        sheet.addRow([`PREHĽAD DOVOLENKY - ROK ${currentYear}`]).font = { bold: true, size: 14 };
        sheet.addRow([`Zamestnanec:`, employee.displayName]);
        sheet.addRow([]);
        
        const hRow = sheet.addRow(['Prenos', 'Nárok', 'Vyčerpané', 'ZOSTATOK']);
        hRow.eachCell(c => {
            c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2C55' } };
        });

        sheet.addRow([statsData.prenos, statsData.narok, calculatedCerpanie, zostatok]);
        
        sheet.addRow([]);
        const rRow = sheet.addRow(['Dátum od', 'Dátum do', 'Dní']);
        rRow.eachCell(c => { c.font = { bold: true }; c.border = { bottom: { style: 'thin' } }; });

        history.forEach(req => {
            sheet.addRow([
                req.startDate.toDate().toLocaleDateString('sk-SK'), 
                req.endDate.toDate().toLocaleDateString('sk-SK'), 
                req.daysCount
            ]);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `dovolenka_${employee.priezvisko}_${currentYear}.xlsx`);
        
        showToast('Export dokončený!', TOAST_TYPE.SUCCESS);
    }, "Chyba pri exporte");

    btnElement.classList.remove('btn-loading');
    btnElement.innerHTML = originalContent;
}

/**
 * ✅ PRENESENÉ: Hromadný sumárny export
 */
async function exportAllToExcel(btnElement) {
    if (!btnElement) return;
    const originalContent = btnElement.innerHTML;
    btnElement.classList.add('btn-loading');

    await safeAsync(async () => {
        // ✅ LAZY LOADING
        let ExcelJS, saveAs;
        try {
            showToast('Pripravujem hromadný export...', TOAST_TYPE.INFO, 1000);
            const libs = await lazyLoader.loadExcelBundle();
            ExcelJS = libs.ExcelJS;
            saveAs = libs.FileSaver;
        } catch (error) {
            console.error('Chyba pri načítaní Excel knižníc:', error);
            showToast('Chyba: Knižnica pre export sa nepodarila načítať.', TOAST_TYPE.ERROR);
            btnElement.classList.remove('btn-loading');
            btnElement.innerHTML = originalContent;
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Prehľad ${currentYear}`);

        // ✅ NASTAVENIE ŠÍRKY STĹPCOV (14, 14, 11, 11)
        sheet.columns = [
            { width: 9 }, // Stĺpec A
            { width: 30 }, // Stĺpec B
            { width: 11 }, // Stĺpec C
            { width: 9 },  // Stĺpec D
            { width: 9 },  // Stĺpec E
            { width: 13 },  // Stĺpec F
            { width: 13 }  // Stĺpec G
        ];

        const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2C55' } } };

        sheet.addRow(['OEC', 'Meno a priezvisko', 'Oddelenie', 'Prenos', 'Nárok', 'Vyčerpané', 'ZOSTATOK']).eachCell(c => Object.assign(c, headerStyle));

        // Pridanie filtra na hlavičku
        sheet.autoFilter = 'A1:G1';

        const employeesMap = store.getEmployees();
        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));

        for (const [empId, emp] of employeesMap) {
            if (empId === 'test') continue;
            const sRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
            const sSnap = await getDoc(sRef);
            const stats = sSnap.exists() ? sSnap.data() : { prenos: 0, narok: 20 };

            const reqs = await fetchCollection(`employees/${empId}/vacationRequests`, {
                whereConditions: [
                    { field: 'startDate', operator: '>=', value: yearStart },
                    { field: 'startDate', operator: '<=', value: yearEnd }
                ]
            });
            const spent = reqs.reduce((sum, r) => sum + Number(r.daysCount || 0), 0);
            const bal = (stats.prenos + stats.narok) - spent;

            sheet.addRow([emp.oec || '-', emp.displayName, emp.oddelenie || '-', stats.prenos, stats.narok, spent, bal]);
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `hromadny_prehlad_dovoleniek_${currentYear}.xlsx`);
        
        showToast('Hromadný export dokončený!', TOAST_TYPE.SUCCESS);
    }, "Chyba hromadného exportu");

    btnElement.classList.remove('btn-loading');
    btnElement.innerHTML = originalContent;
}

/**
 * ✅ PRENESENÉ: Detailný hromadný export
 */
async function exportAllDetailedToExcel(btnElement) {
    const originalContent = btnElement.innerHTML;
    btnElement.classList.add('btn-loading');

    await safeAsync(async () => {
        // ✅ LAZY LOADING knižníc
        let ExcelJS, saveAs;
        try {
            showToast('Pripravujem plochý export...', TOAST_TYPE.INFO, 1000);
            const libs = await lazyLoader.loadExcelBundle();
            ExcelJS = libs.ExcelJS;
            saveAs = libs.FileSaver;
        } catch (error) {
            console.error('Chyba pri načítaní Excel knižníc:', error);
            showToast('Chyba knižnice.', TOAST_TYPE.ERROR);
            btnElement.classList.remove('btn-loading');
            btnElement.innerHTML = originalContent;
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Detailný zoznam ${currentYear}`);
        
        // 1. Definícia stĺpcov (Flat formát)
        sheet.columns = [
            { header: 'OEC', key: 'oec', width: 10 },
            { header: 'Meno a priezvisko', key: 'meno', width: 25 },
            { header: 'Oddelenie', key: 'oddelenie', width: 20 },
            { header: 'Dátum od', key: 'od', width: 15 },
            { header: 'Dátum do', key: 'do', width: 15 },
            { header: 'Dni', key: 'dni', width: 8 },
            { header: 'Prenos', key: 'prenos', width: 10 },
            { header: 'Nárok', key: 'narok', width: 10 },
            { header: 'Zostatok', key: 'zostatok', width: 10 }
        ];

        // Štýl pre hlavičku - iba bunky
        sheet.getRow(1).eachCell(c => {
            c.font = { color: { argb: 'FFFFFFFF' }, bold: true };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2C55' } };
        });

        const employeesMap = store.getEmployees();
        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));

        for (const [empId, emp] of employeesMap) {
            if (empId === 'test') continue;
            
            // Získanie štatistík (kvôli prenosu a nároku)
            const sRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
            const sSnap = await getDoc(sRef);
            const stats = sSnap.exists() ? sSnap.data() : { prenos: 0, narok: 20 };

            // Získanie všetkých žiadostí zamestnanca
            const reqs = await fetchCollection(`employees/${empId}/vacationRequests`, {
                whereConditions: [
                    { field: 'startDate', operator: '>=', value: yearStart },
                    { field: 'startDate', operator: '<=', value: yearEnd }
                ],
                orderByField: 'startDate'
            });

            // Výpočet celkového zostatku pre zamestnanca (voliteľné pre každý riadok)
            const totalSpent = reqs.reduce((sum, r) => sum + Number(r.daysCount || 0), 0);
            const balance = (Number(stats.prenos) + Number(stats.narok)) - totalSpent;

            // Zápis každého záznamu ako samostatný riadok
            reqs.forEach(r => {
                sheet.addRow({
                    oec: emp.oec || '-',
                    meno: emp.displayName,
                    oddelenie: emp.oddelenie || '-',
                    od: r.startDate.toDate().toLocaleDateString('sk-SK'),
                    do: r.endDate.toDate().toLocaleDateString('sk-SK'),
                    dni: r.daysCount,
                    prenos: stats.prenos,
                    narok: stats.narok,
                    zostatok: balance
                });
            });
        }

        // Zapnutie automatického filtra na všetky stĺpce
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: 9 }
        };

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `detailny_flat_prehlad_${currentYear}.xlsx`);
        
        showToast('Plochý export dokončený!', TOAST_TYPE.SUCCESS);
    }, "Chyba detailného exportu");

    btnElement.classList.remove('btn-loading');
    btnElement.innerHTML = originalContent;
}

/**
 * ✅ PRENESENÉ: Pomocná funkcia pre uzávierkový Excel
 */
async function downloadClosureExcel(data, year) {
    // ✅ LAZY LOADING
    let ExcelJS, saveAs;
    try {
        showToast('Pripravujem uzávierkový export...', TOAST_TYPE.INFO, 1000);
        const libs = await lazyLoader.loadExcelBundle();
        ExcelJS = libs.ExcelJS;
        saveAs = libs.FileSaver;
    } catch (error) {
        console.error('Chyba pri načítaní Excel knižníc:', error);
        showToast('Chyba: Knižnica pre export sa nepodarila načítať.', TOAST_TYPE.ERROR);
        return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Uzávierka ${year}`);
    
    sheet.addRow([`ROČNÁ UZÁVIERKA DOVOLENIEK - ROK ${year}`]).font = { bold: true, size: 14 };
    sheet.addRow(['OEC', 'Meno', 'Prenos', 'Nárok', 'Vyčerpané', 'Zostatok']);
    
    data.forEach(item => {
        sheet.addRow([item.oec, item.meno, item.prenos, item.narok, item.cerpanie, item.zostatok]);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `uzavierka_${year}.xlsx`);
    
    showToast('Uzávierka exportovaná!', TOAST_TYPE.SUCCESS);
}

/**
 * ✅ NOVÉ: Logika prepočíta čerpanie podľa histórie
 */
async function recalculateAllVacations(empId) {
    const btn = document.getElementById(IDs.DOV.RECALCULATE_BTN);
    btn.classList.add('fa-spin');

    await safeAsync(async () => {
        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));
        
        const requests = await fetchCollection(`employees/${empId}/vacationRequests`, {
            whereConditions: [
                { field: 'startDate', operator: '>=', value: yearStart },
                { field: 'startDate', operator: '<=', value: yearEnd }
            ]
        });

        const realSum = requests.reduce((sum, r) => sum + Number(r.daysCount || 0), 0);
        const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
        await updateDoc(statsRef, { cerpanie: realSum });
        
        showToast("Čerpanie bolo prepočítané podľa histórie.", TOAST_TYPE.SUCCESS);
        await loadVacationData(empId);
    }, "Chyba pri prepočte");

    btn.classList.remove('fa-spin');
}

/**
 * ✅ PRENESENÉ: Výpočet pracovných dní
 */
function calcWorkingDays(start, end, isContinuous) {
    let d = new Date(start);
    let count = 0;
    while (d <= end) {
        if (isContinuous) {
            count++;
        } else {
            const day = d.getDay();
            if (day !== 0 && day !== 6) count++;
        }
        d.setDate(d.getDate() + 1);
    }
    return count;
}

/**
 * ✅ PRENESENÉ: Skeleton
 */
function getStatsSkeleton() { 
    return `<div class="skeleton-line long" style="height: 100px; width: 100%;"></div>`; 
}