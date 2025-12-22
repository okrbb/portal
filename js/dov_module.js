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
import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';

let currentYear = new Date().getFullYear().toString();

/**
 * Inicializácia modulu
 */
export async function initializeDovModule() {
    console.log("[DovModule] Inicializácia...");
}

/**
 * Hlavný renderer modulu pre konkrétneho zamestnanca
 */
export async function renderVacationModule(empId) {
    const container = document.getElementById('dov-module');
    if (!container) return;

    const user = store.getUser();
    const employee = store.getEmployee(empId);
    if (!employee) return;

    // --- AUTOMATICKÉ PREDVOLANIE ROKA PO UZÁVIERKE --- 
    const systemYear = new Date().getFullYear().toString();
    const nextYear = (parseInt(systemYear) + 1).toString();

    // Ak sme v "systémovom" roku, skontrolujeme, či už nebola vykonaná uzávierka
    // (t.j. či existujú štatistiky pre ďalší rok so záznamom o uzavretí) 
    if (currentYear === systemYear) {
        try {
            const nextYearRef = doc(db, `employees/${empId}/vacationStats/${nextYear}`);
            const nextYearSnap = await getDoc(nextYearRef);
            
            if (nextYearSnap.exists() && nextYearSnap.data().closedAt) {
                currentYear = nextYear; // Automatický posun vpred 
            }
        } catch (e) {
            console.warn("Nepodarilo sa overiť stav uzávierky pre automatické predvolanie.");
        }
    }

    // Identifikácia nepretržitej prevádzky [cite: 1]
    const funkciaString = employee.funkcia || '';
    const funkciaParts = funkciaString.split(','); 
    const textZaCiarkou = (funkciaParts[1] || '').trim().toLowerCase();
    const isContinuous = textZaCiarkou === 'operátor linky 112';

    // Generovanie možností pre výber roka [cite: 1]
    const yearOptions = [];
    const startY = new Date().getFullYear() + 1;
    for (let y = startY; y >= 2025; y--) {
        yearOptions.push(`<option value="${y}" ${y.toString() === currentYear ? 'selected' : ''}>Rok ${y}</option>`);
    }

    container.innerHTML = `
        <div class="ua-container" style="flex-direction: column; gap: 40px;">
            <div class="dashboard-row" id="vacation-stats-row">
                ${getStatsSkeleton()}
            </div>

            <div class="dashboard-row" style="align-items: stretch;">
                <div class="ua-card" style="flex: 1;">
                    <h2>Nová žiadosť</h2>
                    <form id="new-vacation-form">
                        <div class="form-group">
                            <label>Dátum od</label>
                            <input type="date" id="vac-date-from" required>
                        </div>
                        <div class="form-group">
                            <label>Dátum do</label>
                            <input type="date" id="vac-date-to" required>
                        </div>
                        <div class="cp-employee-card" id="vac-day-calculation" style="margin-bottom: 15px; display: none; background: rgba(188, 135, 0, 0.1); border: 1px solid var(--color-orange-accent);">
                            <p style="margin: 0; color: var(--color-text-primary);">Počet pracovných dní: <strong id="calc-days-val" style="color: var(--color-orange-accent); font-size: 1.2rem;">0</strong></p>
                        </div>
                        
                        <div class="file-actions" style="display: flex; align-items: center; gap: 15px; justify-content: flex-end;">
                            <button type="submit" class="ua-btn default" id="btn-save-vacation" style="padding: 8px 16px; font-size: 0.85rem;">Zapísať dovolenku</button>
                            <label class="filter-label" style="margin-bottom: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); font-size: 0.9rem;">
                                <input type="checkbox" id="vac-half-day" style="display: none;">
                                <span class="filter-dot dot-yellow" style="margin: 0;"></span> 1/2 dňa
                            </label>
                        </div>
                    </form>

                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--color-border);">
                        <h3 id="limits-title">Nastavenia limitov (${currentYear})</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                            <div class="form-group">
                                <label>Prenos z m.r.</label>
                                <input type="number" id="input-prenos" step="1" value="20" 
                                    ${!Permissions.canEditVacationLimits(user) ? 'disabled' : ''}>
                            </div>
                            <div class="form-group">
                                <label>Ročný nárok</label>
                                <input type="number" id="input-narok" step="1" value="20">
                            </div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                            ${Permissions.canEditVacationLimits(user) ? `
                                <button class="ua-btn default" id="btn-update-limits">Aktualizovať limity</button>
                            ` : ''}
                            
                            ${Permissions.canCloseVacationYear(user) ? `
                                <button class="ua-btn default delete-hover" id="btn-close-year">
                                    <i class="fas fa-lock" style="margin-right: 8px;"></i>Uzavrieť rok
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <div class="ua-card" style="flex: 2;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0;">História čerpania - <span style="color: var(--color-orange-accent);">${employee.displayName}</span></h2>
                        <select id="vac-year-select" class="ua-select" style="width: auto; padding: 5px 10px; background: var(--color-bg-light); border: 1px solid var(--color-border); color: white; border-radius: 4px; cursor: pointer;">
                            ${yearOptions.join('')}
                        </select>
                    </div>

                    <div class="fuel-history-container" style="max-height: 500px; overflow-y: auto; margin-bottom: 15px;">
                        <table class="history-table">
                            <thead>
                                <tr>
                                    <th>Od</th>
                                    <th>Do</th>
                                    <th class="text-right" style="padding-right: 20px;">Dní</th> 
                                    <th class="actions-col"></th> 
                                </tr>
                            </thead>
                            <tbody id="vacation-history-body">
                                <tr><td colspan="4" class="text-center">Načítavam údaje...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="file-actions" style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button class="ua-btn default" id="btn-download-vac-xlsx">Stiahnuť (.xlsx)</button>
                        ${Permissions.canDownloadAllVacations(user) ? `
                            <button class="ua-btn default" id="btn-download-vac-all">Stiahnuť (všetkých)</button>
                            <button class="ua-btn default" id="btn-download-vac-all-detailed">Hromadný detailný export</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadVacationData(empId);
    attachLocalEventListeners(empId, isContinuous);
}

/**
 * Vykoná hromadnú ročnú uzávierku s kontrolou predošlého spustenia
 */
async function processYearlyClosure(btnElement) {
    const nextYear = (parseInt(currentYear) + 1).toString();
    const employeesMap = store.getEmployees();
    
    // --- KONTROLA PREDOŠLEJ UZÁVIERKY ---
    let isAlreadyClosed = false;
    let lastClosedInfo = "";

    // Skontrolujeme vzorku (prvého zamestnanca v mape), či už má uzavretý rok
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

    // Dynamická správa pre potvrdenie
    const baseMsg = `POZOR: Táto akcia uzavrie rok ${currentYear} pre VŠETKÝCH zamestnancov a prenesie zostatky do roku ${nextYear}.`;
    const warningMsg = isAlreadyClosed 
        ? `⚠️ UPOZORNENIE: Uzávierka pre tento rok už bola raz vykonaná.${lastClosedInfo}\n\nOpätovné spustenie prepíše aktuálne prenosy v roku ${nextYear}. Chcete napriek tomu pokračovať?`
        : `${baseMsg}\n\nPokračovať?`;

    if (!confirm(warningMsg)) return;

    const originalContent = btnElement.innerHTML;
    btnElement.classList.add('btn-loading');
    btnElement.innerHTML = `<i class="fas fa-spinner"></i> Uzatváram...`;

    try {
        const closureData = [];
        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));

        for (const [empId, emp] of employeesMap) {
            if (emp.id === 'test') continue;

            const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
            const statsSnap = await getDoc(statsRef);
            const stats = statsSnap.exists() ? statsSnap.data() : { prenos: 0, narok: 20 };

            const reqRef = collection(db, `employees/${empId}/vacationRequests`);
            const q = query(reqRef, where("startDate", ">=", yearStart), where("startDate", "<=", yearEnd));
            const querySnap = await getDocs(q);
            let totalSpent = 0;
            querySnap.forEach(d => totalSpent += Number(d.data().daysCount || 0));

            const balance = (Number(stats.prenos) + Number(stats.narok)) - totalSpent;

            const nextYearRef = doc(db, `employees/${empId}/vacationStats/${nextYear}`);
            await setDoc(nextYearRef, {
                prenos: balance,
                narok: stats.narok,
                cerpanie: 0,
                closedAt: Timestamp.now(), // Značka času uzávierky
                closedBy: store.getUser()?.displayName || 'Admin' // Kto uzávierku vykonal
            });

            closureData.push({ oec: emp.oec || '-', meno: emp.displayName, prenos: stats.prenos, narok: stats.narok, cerpanie: totalSpent, zostatok: balance });
        }

        currentYear = nextYear; 
        await downloadClosureExcel(closureData, (parseInt(nextYear) - 1).toString());
        showToast(`Rok úspešne uzavretý. Modul bol prepnutý na rok ${currentYear}.`, TOAST_TYPE.SUCCESS);
        
        const activeUser = store.getUser();
        if (activeUser) renderVacationModule(activeUser.id || activeUser.oec);

    } catch (err) {
        console.error(err);
        showToast("Chyba pri ročnej uzávierke.", TOAST_TYPE.ERROR);
    } finally {
        btnElement.classList.remove('btn-loading');
        btnElement.innerHTML = originalContent;
    }
}

/**
 * Pomocná funkcia pre generovanie Excelu uzávierky
 */
async function downloadClosureExcel(data, year) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Uzávierka ${year}`);
    const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2C55' } }, alignment: { horizontal: 'center' } };
    const borderStyle = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

    sheet.addRow([`ROČNÁ UZÁVIERKA DOVOLENIEK - ROK ${year}`]).font = { bold: true, size: 16 };
    sheet.addRow([`Dátum vykonania:`, new Date().toLocaleString('sk-SK')]);
    sheet.addRow([]);

    const headerRow = sheet.addRow(['OEC', 'Meno a priezvisko', 'Prenos z m.r.', 'Ročný nárok', 'Vyčerpané', 'Zostatok (Prenos do r. ' + (parseInt(year)+1) + ')']);
    headerRow.eachCell(c => Object.assign(c, headerStyle));

    data.forEach(item => {
        const row = sheet.addRow([item.oec, item.meno, item.prenos, item.narok, item.cerpanie, item.zostatok]);
        row.eachCell((c, i) => {
            c.border = borderStyle;
            if (i >= 3) c.alignment = { horizontal: 'center' };
            if (i === 6 && item.zostatok < 0) c.font = { color: { argb: 'FFE53E3E' }, bold: true };
        });
    });

    sheet.columns = [{ width: 10 }, { width: 35 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 25 }];
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `uzavierka_dovoleniek_${year}.xlsx`);
}

// --- DÁTOVÁ LOGIKA (Pôvodná + Oprava výpočtu) ---

async function loadVacationData(empId) {
    const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
    const statsSnap = await getDoc(statsRef);
    
    let stats = { prenos: 0, narok: 20, cerpanie: 0 };
    
    if (statsSnap.exists()) {
        stats = statsSnap.data();
    } else {
        // --- NOVÁ LOGIKA: PRENOS NÁROKU Z PREDCHÁDZAJÚCEHO ROKA ---
        try {
            const prevYear = (parseInt(currentYear) - 1).toString();
            const prevStatsRef = doc(db, `employees/${empId}/vacationStats/${prevYear}`);
            const prevSnap = await getDoc(prevStatsRef);
            
            if (prevSnap.exists()) {
                // Preberieme nárok z minulého roka (napr. 25 alebo 30 dní)
                stats.narok = prevSnap.data().narok || 20;
            }
        } catch (e) {
            console.warn("Nepodarilo sa prebrať nárok z minulého roka, použijem predvolených 20.");
        }
        
        // Vytvoríme dokument pre nový rok s prebratým nárokom
        await setDoc(statsRef, stats);
    }

    // Výpočet reálneho čerpania (ako doteraz)
    const reqRef = collection(db, `employees/${empId}/vacationRequests`);
    const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
    const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));
    
    const q = query(reqRef, 
        where("startDate", ">=", yearStart), 
        where("startDate", "<=", yearEnd)
    );
    
    const querySnap = await getDocs(q);
    let realSum = 0;
    querySnap.forEach(d => {
        realSum += Number(d.data().daysCount || 0);
    });

    stats.cerpanie = realSum;

    // Samooprava v DB
    if (realSum !== Number(statsSnap.data()?.cerpanie)) {
        await updateDoc(statsRef, { cerpanie: realSum });
    }

    updateStatsUI(stats);
    loadHistory(empId);
}

async function loadHistory(empId) {
    const historyBody = document.getElementById('vacation-history-body');
    if (!historyBody) return;

    const reqRef = collection(db, `employees/${empId}/vacationRequests`);
    const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
    const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));
    
    const q = query(reqRef, where("startDate", ">=", yearStart), where("startDate", "<=", yearEnd), orderBy("startDate", "desc"));
    const querySnap = await getDocs(q);

    if (querySnap.empty) {
        historyBody.innerHTML = '<tr><td colspan="4" class="text-center">Žiadne záznamy o čerpaní v tomto roku.</td></tr>';
        return;
    }

    historyBody.innerHTML = '';
    querySnap.forEach(requestDoc => {
        const data = requestDoc.data();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${data.startDate.toDate().toLocaleDateString('sk-SK')}</td>
            <td>${data.endDate.toDate().toLocaleDateString('sk-SK')}</td>
            <td class="text-right" style="padding-right: 20px;"><strong>${data.daysCount}</strong></td>
            <td class="text-center">
                <button class="action-btn-edit btn-delete-vac" 
                        data-id="${requestDoc.id}" 
                        data-days="${data.daysCount}" 
                        title="Zmazať záznam">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        historyBody.appendChild(tr);
    });
}

function updateStatsUI(stats) {
    const zostatok = (Number(stats.prenos) + Number(stats.narok)) - Number(stats.cerpanie);
    const row = document.getElementById('vacation-stats-row');
    if (!row) return;
    
    row.innerHTML = `
        <div class="fuel-summary-card" style="flex:1">
            <div class="fuel-summary-label">Prenos</div>
            <div class="fuel-summary-value">${stats.prenos}</div>
        </div>
        <div class="fuel-summary-card" style="flex:1">
            <div class="fuel-summary-label">Nárok</div>
            <div class="fuel-summary-value">${stats.narok}</div>
        </div>
        <div class="fuel-summary-card" style="flex:1">
            <div class="fuel-summary-label">Vyčerpané</div>
            <div class="fuel-summary-value" style="color: #E53E3E">${stats.cerpanie}</div>
        </div>
        <div class="fuel-summary-card" style="flex:1; border-color: var(--color-orange-accent)">
            <div class="fuel-summary-label">Zostatok</div>
            <div class="fuel-summary-value" style="color: var(--color-orange-accent)">${zostatok}</div>
        </div>
    `;

    document.getElementById('input-prenos').value = stats.prenos;
    document.getElementById('input-narok').value = stats.narok;
}

// --- LOGIKA EXPORTU DO EXCELU (Individuálny a Hromadný) ---

async function exportToExcel(empId, btnElement) {
    const employee = store.getEmployee(empId);
    if (!employee || !btnElement) return;

    const originalContent = btnElement.innerHTML;
    btnElement.classList.add('btn-loading');
    btnElement.innerHTML = `<i class="fas fa-spinner"></i> Spracúvam...`;

    try {
        const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
        const statsSnap = await getDoc(statsRef);
        const statsData = statsSnap.exists() ? statsSnap.data() : { prenos: 0, narok: 0 };

        const reqRef = collection(db, `employees/${empId}/vacationRequests`);
        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));
        const q = query(reqRef, where("startDate", ">=", yearStart), where("startDate", "<=", yearEnd), orderBy("startDate", "asc"));
        const querySnap = await getDocs(q);
        const history = querySnap.docs.map(d => d.data());

        const calculatedCerpanie = history.reduce((sum, req) => sum + Number(req.daysCount), 0);
        const zostatok = (Number(statsData.prenos) + Number(statsData.narok)) - calculatedCerpanie;

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Dovolenky ${currentYear}`);
        sheet.columns = [
            { width: 14 }, // Stĺpec A
            { width: 14 }, // Stĺpec B
            { width: 14 }, // Stĺpec C
            { width: 14 }  // Stĺpec D
        ];
        const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2C55' } }, alignment: { horizontal: 'center' } };
        const borderStyle = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        sheet.addRow([`PREHĽAD DOVOLENKY - ROK ${currentYear}`]).font = { bold: true, size: 14 };
        sheet.addRow([`Zamestnanec:`, employee.displayName]);
        sheet.addRow([]);
        sheet.addRow(['SUMÁR ČERPANIA (dni)']).font = { bold: true };
        const statsHeader = sheet.addRow(['Prenos z m.r.', 'Ročný nárok', 'Vyčerpané', 'ZOSTATOK']);
        statsHeader.eachCell(c => Object.assign(c, headerStyle));
        const statsRow = sheet.addRow([statsData.prenos, statsData.narok, calculatedCerpanie, zostatok]);
        statsRow.eachCell(c => { c.border = borderStyle; c.alignment = { horizontal: 'center' }; });

        sheet.addRow([]);
        sheet.addRow(['HISTÓRIA ČERPANIA']).font = { bold: true };
        const historyHeader = sheet.addRow(['Dátum od', 'Dátum do', 'Počet dní']);
        historyHeader.eachCell(c => Object.assign(c, headerStyle));
        history.forEach(req => {
            const row = sheet.addRow([req.startDate.toDate().toLocaleDateString('sk-SK'), req.endDate.toDate().toLocaleDateString('sk-SK'), req.daysCount]);
            row.eachCell(c => { c.border = borderStyle; c.alignment = { horizontal: 'center' }; });
        });

        const priezvisko = (employee.priezvisko || 'zamestnanec').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const fileName = `${priezvisko}_dovolenky_${currentYear}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
        showToast("Excel stiahnutý.", TOAST_TYPE.SUCCESS);
    } catch (err) {
        showToast("Chyba exportu.", TOAST_TYPE.ERROR);
    } finally {
        btnElement.classList.remove('btn-loading');
        btnElement.innerHTML = originalContent;
    }
}

async function exportAllToExcel(btnElement) {
    if (!btnElement) return;
    const originalContent = btnElement.innerHTML;
    btnElement.classList.add('btn-loading');
    btnElement.innerHTML = `<i class="fas fa-spinner"></i> Generujem...`;

    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Prehľad ${currentYear}`);
        
        // Nastavenie šírok stĺpcov podľa zadania: 9, 27, 9, 9, 9, 14, 14
        sheet.columns = [
            { width: 9 },  // OEC
            { width: 27 }, // Meno a priezvisko
            { width: 10 },  // Oddelenie
            { width: 10 },  // Prenos
            { width: 10 },  // Nárok
            { width: 14 }, // Vyčerpané
            { width: 14 }  // ZOSTATOK
        ];

        const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2C55' } }, alignment: { horizontal: 'center' } };
        const borderStyle = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        sheet.addRow([`HROMADNÝ PREHĽAD DOVOLENIEK - ROK ${currentYear}`]).font = { bold: true, size: 16 };
        const tableHeader = sheet.addRow(['OEC', 'Meno a priezvisko', 'Oddelenie', 'Prenos', 'Nárok', 'Vyčerpané', 'ZOSTATOK']);
        tableHeader.eachCell(c => Object.assign(c, headerStyle));

        const employeesMap = store.getEmployees();
        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));

        for (const [empId, emp] of employeesMap) {
            // --- FILTER: Vynechanie testovacieho zamestnanca ---
            if (empId === 'test' || emp.id === 'test') continue;

            const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
            const statsSnap = await getDoc(statsRef);
            const stats = statsSnap.exists() ? statsSnap.data() : { prenos: 0, narok: 20 };

            const reqRef = collection(db, `employees/${empId}/vacationRequests`);
            const q = query(reqRef, where("startDate", ">=", yearStart), where("startDate", "<=", yearEnd));
            const querySnap = await getDocs(q);
            let totalSpent = 0;
            querySnap.forEach(d => totalSpent += Number(d.data().daysCount || 0));

            const balance = (Number(stats.prenos) + Number(stats.narok)) - totalSpent;
            const row = sheet.addRow([emp.oec || '-', emp.displayName, emp.oddelenie || '-', stats.prenos, stats.narok, totalSpent, balance]);
            row.eachCell((cell, i) => { 
                cell.border = borderStyle; 
                if (i >= 4) cell.alignment = { horizontal: 'center' }; // Zarovnanie čísiel na stred
                if (i === 7 && balance < 0) cell.font = { color: { argb: 'FFE53E3E' }, bold: true };
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `dovolenky_vsetci_${currentYear}.xlsx`);
        showToast("Hromadný export dokončený.", TOAST_TYPE.SUCCESS);
    } catch (err) {
        console.error(err);
        showToast("Chyba hromadného exportu.", TOAST_TYPE.ERROR);
    } finally {
        btnElement.classList.remove('btn-loading');
        btnElement.innerHTML = originalContent;
    }
}

async function exportAllDetailedToExcel(btnElement) {
    if (!btnElement) return;
    const originalContent = btnElement.innerHTML;
    btnElement.classList.add('btn-loading');
    btnElement.innerHTML = `<i class="fas fa-spinner"></i> Generujem detaily...`;

    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Detailný prehľad ${currentYear}`);
        
        // Formátovanie stĺpcov
        sheet.columns = [
            { width: 15 }, // Dátum od / Nadpis
            { width: 15 }, // Dátum do
            { width: 12 }, // Počet dní
            { width: 30 }, // Poznámka / Meno
            { width: 15 }, // Prázdny/OEC
        ];

        const styles = {
            empHeader: { font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2C55' } } },
            statsHeader: { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }, border: { bottom: { style: 'thin' } } },
            requestHeader: { font: { italic: true, color: { argb: 'FF666666' } }, border: { bottom: { style: 'thin' } } },
            border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
        };

        const employeesMap = store.getEmployees();
        const yearStart = Timestamp.fromDate(new Date(parseInt(currentYear), 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(parseInt(currentYear), 11, 31, 23, 59, 59));

        for (const [empId, emp] of employeesMap) {
            if (empId === 'test') continue;

            // 1. Načítanie štatistík
            const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
            const statsSnap = await getDoc(statsRef);
            const stats = statsSnap.exists() ? statsSnap.data() : { prenos: 0, narok: 20 };

            // 2. Načítanie žiadostí
            const reqRef = collection(db, `employees/${empId}/vacationRequests`);
            const q = query(reqRef, where("startDate", ">=", yearStart), where("startDate", "<=", yearEnd), orderBy("startDate", "asc"));
            const querySnap = await getDocs(q);
            
            let totalSpent = 0;
            const requests = [];
            querySnap.forEach(d => {
                const data = d.data();
                totalSpent += Number(data.daysCount || 0);
                requests.push(data);
            });

            const balance = (Number(stats.prenos) + Number(stats.narok)) - totalSpent;

            // 3. Zápis do Excelu - Hlavička zamestnanca
            const nameRow = sheet.addRow([`${emp.displayName} (OEC: ${emp.oec || '-'})`]);
            nameRow.getCell(1).style = styles.empHeader;
            sheet.mergeCells(nameRow.number, 1, nameRow.number, 5);

            // Sumárny riadok pod menom
            const sHeader = sheet.addRow(['Prenos', 'Nárok', 'Vyčerpané', 'ZOSTATOK', 'Oddelenie']);
            sHeader.eachCell(c => Object.assign(c, styles.statsHeader));
            
            const sValues = sheet.addRow([stats.prenos, stats.narok, totalSpent, balance, emp.oddelenie || '-']);
            sValues.getCell(4).font = { bold: true, color: { argb: balance < 0 ? 'FFE53E3E' : 'FF000000' } };

            // Tabuľka konkrétnych dní
            if (requests.length > 0) {
                const rHeader = sheet.addRow(['Dátum od', 'Dátum do', 'Dní', 'Typ']);
                rHeader.eachCell(c => Object.assign(c, styles.requestHeader));

                requests.forEach(r => {
                    sheet.addRow([
                        r.startDate.toDate().toLocaleDateString('sk-SK'),
                        r.endDate.toDate().toLocaleDateString('sk-SK'),
                        r.daysCount,
                        r.daysCount === 0.5 ? 'Pol dňa' : 'Dovolenka'
                    ]);
                });
            } else {
                sheet.addRow(['Žiadne čerpanie v tomto roku']).font = { italic: true };
            }

            sheet.addRow([]); // Prázdny riadok medzi zamestnancami
        }

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `detailny_prehlad_dovoleniek_${currentYear}.xlsx`);
        showToast("Detailný export dokončený.", TOAST_TYPE.SUCCESS);

    } catch (err) {
        console.error(err);
        showToast("Chyba detailného exportu.", TOAST_TYPE.ERROR);
    } finally {
        btnElement.classList.remove('btn-loading');
        btnElement.innerHTML = originalContent;
    }
}

// --- POMOCNÉ FUNKCIE ---

function calculateBusinessDays(d1, d2, isContinuous = false) {
    let start = new Date(d1);
    let end = new Date(d2);
    let count = 0;
    while (start <= end) {
        if (isContinuous) {
            count++;
        } else {
            let day = start.getDay();
            if (day !== 0 && day !== 6) count++; 
        }
        start.setDate(start.getDate() + 1);
    }
    return count;
}

function attachLocalEventListeners(empId, isContinuous) {
    const form = document.getElementById('new-vacation-form');
    const dateFrom = document.getElementById('vac-date-from');
    const dateTo = document.getElementById('vac-date-to');
    const calcBox = document.getElementById('vac-day-calculation');
    const halfDayCheckbox = document.getElementById('vac-half-day');
    const yearSelect = document.getElementById('vac-year-select');

    if (yearSelect) {
        yearSelect.addEventListener('change', async (e) => {
            currentYear = e.target.value;
            // Aktualizujeme nadpis limitov, aby odrážal nový rok
            const limitsTitle = document.getElementById('limits-title');
            if (limitsTitle) limitsTitle.textContent = `Nastavenia limitov (${currentYear})`;
            
            // Znovu načítame všetky dáta pre daný rok
            await loadVacationData(empId);
        });
    }

    const updateDisplayCount = () => {
        if (dateFrom.value && dateTo.value) {
            let days = calculateBusinessDays(dateFrom.value, dateTo.value, isContinuous);
            if (halfDayCheckbox.checked) days = 0.5; 
            document.getElementById('calc-days-val').textContent = days;
            calcBox.style.display = 'block';
        }
    };

    [dateFrom, dateTo].forEach(el => el.addEventListener('change', updateDisplayCount));
    halfDayCheckbox.addEventListener('change', updateDisplayCount);

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            let days = calculateBusinessDays(dateFrom.value, dateTo.value, isContinuous);
            if (halfDayCheckbox.checked) days = 0.5;
            if (days <= 0) return showToast("Neplatný rozsah.", TOAST_TYPE.ERROR);

            try {
                await addDoc(collection(db, `employees/${empId}/vacationRequests`), {
                    employeeId: empId,
                    startDate: Timestamp.fromDate(new Date(dateFrom.value)),
                    endDate: Timestamp.fromDate(new Date(dateTo.value)),
                    daysCount: days,
                    createdAt: Timestamp.now()
                });
                showToast(`Dovolenka (${days} d.) zapísaná.`, TOAST_TYPE.SUCCESS);
                renderVacationModule(empId);
            } catch (err) { showToast("Chyba zápisu.", TOAST_TYPE.ERROR); }
        };
    }

    const btnLimits = document.getElementById('btn-update-limits');
    if (btnLimits) {
        btnLimits.onclick = async () => {
            const prenos = parseFloat(document.getElementById('input-prenos').value) || 0;
            const narok = parseFloat(document.getElementById('input-narok').value) || 0;
            try {
                const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
                await updateDoc(statsRef, { prenos, narok });
                showToast("Limity aktualizované.", TOAST_TYPE.SUCCESS);
                renderVacationModule(empId);
            } catch (err) { showToast("Chyba aktualizácie.", TOAST_TYPE.ERROR); }
        };
    }

    const btnCloseYear = document.getElementById('btn-close-year');
    if (btnCloseYear) {
        btnCloseYear.onclick = function() { processYearlyClosure(this); };
    }

    const btnDownloadPersonal = document.getElementById('btn-download-vac-xlsx');
    if (btnDownloadPersonal) { btnDownloadPersonal.onclick = function() { exportToExcel(empId, this); }; }

    const btnDownloadAll = document.getElementById('btn-download-vac-all');
    if (btnDownloadAll) { 
        btnDownloadAll.onclick = function() {
            if (Permissions.canExportEmployees(store.getUser())) {
                exportAllToExcel(this);
            } else {
                showToast("Nedostatočné práva.", TOAST_TYPE.ERROR);
            }
        }; 
    }

    const btnDownloadAllDetailed = document.getElementById('btn-download-vac-all-detailed');
    if (btnDownloadAllDetailed) {
        btnDownloadAllDetailed.onclick = function() {
            if (Permissions.canDownloadAllVacations(store.getUser())) {
                exportAllDetailedToExcel(this);
            } else {
                showToast("Nedostatočné práva.", TOAST_TYPE.ERROR);
            }
        };
    }

    const historyBody = document.getElementById('vacation-history-body');
    if (historyBody) {
        historyBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-delete-vac');
            if (!btn || !confirm("Naozaj vymazať?")) return;
            try {
                await deleteDoc(doc(db, `employees/${empId}/vacationRequests/${btn.dataset.id}`));
                showToast("Záznam vymazaný.", TOAST_TYPE.SUCCESS);
                renderVacationModule(empId);
            } catch (err) { showToast("Chyba pri mazaní.", TOAST_TYPE.ERROR); }
        });
    }
}

function getStatsSkeleton() { return `<div class="skeleton-line long" style="height: 100px; width: 100%;"></div>`; }