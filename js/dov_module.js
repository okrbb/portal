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

    const employee = store.getEmployee(empId);
    if (!employee) return;

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
                            <button type="submit" class="ua-btn default" id="btn-save-vacation">Zapísať dovolenku</button>
                            
                            <label class="filter-label" style="margin-bottom: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary);">
                                <input type="checkbox" id="vac-half-day" style="display: none;">
                                <span class="filter-dot dot-yellow" style="margin: 0;"></span> 1/2 dňa
                            </label>
                        </div>
                    </form>

                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--color-border);">
                        <h3>Nastavenia limitov (${currentYear})</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                            <div class="form-group">
                                <label>Prenos z m.r.</label>
                                <input type="number" id="input-prenos" step="0.5" value="0">
                            </div>
                            <div class="form-group">
                                <label>Ročný nárok</label>
                                <input type="number" id="input-narok" step="1" value="20">
                            </div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
                            <button class="ua-btn default" id="btn-update-limits" style="display: flex; align-items: center; gap: 15px;">Aktualizovať limity</button>
                        </div>
                    </div>
                </div>

                <div class="ua-card" style="flex: 2;">
                    <h2>História čerpania</h2>
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
                        <button class="ua-btn default" id="btn-download-vac-all">Stiahnuť (všetkých)</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    await loadVacationData(empId);
    attachLocalEventListeners(empId);
}

// --- LOGIKA EXPORTU DO EXCELU ---

/**
 * Vygeneruje a stiahne Excel súbor s prehľadom dovoleniek zamestnanca
 */
async function exportToExcel(empId) {
    const employee = store.getEmployee(empId);
    if (!employee) return;

    showToast("Pripravujem Excel súbor...", TOAST_TYPE.INFO);

    try {
        // 1. Získanie dát z DB
        const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
        const statsSnap = await getDoc(statsRef);
        const stats = statsSnap.exists() ? statsSnap.data() : { prenos: 0, narok: 0, cerpanie: 0 };
        const zostatok = (Number(stats.prenos) + Number(stats.narok)) - Number(stats.cerpanie);

        const reqRef = collection(db, `employees/${empId}/vacationRequests`);
        const q = query(reqRef, orderBy("startDate", "asc"));
        const querySnap = await getDocs(q);
        const history = querySnap.docs.map(d => d.data());

        // 2. Vytvorenie Workbooku
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Dovolenky ${currentYear}`);

        // Štýly
        const titleStyle = { font: { bold: true, size: 14 } };
        const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2C55' } }, alignment: { horizontal: 'center' } };
        const borderStyle = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // 3. Hlavička a info o zamestnancovi
        sheet.addRow([`PREHĽAD DOVOLENKY - ROK ${currentYear}`]).font = titleStyle;
        sheet.addRow([`Zamestnanec:`, employee.displayName]);
        sheet.addRow([]);

        // 4. Sumárna tabuľka
        sheet.addRow(['SUMÁR ČERPANIA (dni)']).font = { bold: true };
        const statsHeader = sheet.addRow(['Prenos z m.r.', 'Ročný nárok', 'Vyčerpané', 'ZOSTATOK']);
        statsHeader.eachCell(c => Object.assign(c, headerStyle));
        
        const statsRow = sheet.addRow([stats.prenos, stats.narok, stats.cerpanie, zostatok]);
        statsRow.eachCell(c => {
            c.border = borderStyle;
            c.alignment = { horizontal: 'center' };
        });
        statsRow.getCell(4).font = { bold: true, color: { argb: 'FFBC8700' } }; // Oranžový zostatok

        sheet.addRow([]);

        // 5. Tabuľka histórie
        sheet.addRow(['HISTÓRIA ČERPANIA']).font = { bold: true };
        const historyHeader = sheet.addRow(['Dátum od', 'Dátum do', 'Počet dní']);
        historyHeader.eachCell(c => Object.assign(c, headerStyle));

        history.forEach(req => {
            const row = sheet.addRow([
                req.startDate.toDate().toLocaleDateString('sk-SK'),
                req.endDate.toDate().toLocaleDateString('sk-SK'),
                req.daysCount
            ]);
            row.eachCell(c => {
                c.border = borderStyle;
                c.alignment = { horizontal: 'center' };
            });
        });

        // Nastavenie šírok stĺpcov
        sheet.columns = [
            { width: 25 }, { width: 25 }, { width: 15 }, { width: 15 }
        ];

        // 6. Vygenerovanie a stiahnutie
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `dovolenky_${currentYear}.xlsx`); //

        showToast("Excel bol úspešne stiahnutý.", TOAST_TYPE.SUCCESS);
    } catch (err) {
        console.error(err);
        showToast("Chyba pri generovaní Excelu.", TOAST_TYPE.ERROR);
    }
}

// --- DÁTOVÁ LOGIKA NAČÍTANIA (Pôvodná) ---

async function loadVacationData(empId) {
    const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
    const statsSnap = await getDoc(statsRef);
    
    let stats = { prenos: 0, narok: 20, cerpanie: 0 };
    if (statsSnap.exists()) {
        stats = statsSnap.data();
    } else {
        await setDoc(statsRef, stats);
    }

    updateStatsUI(stats);
    loadHistory(empId);
}

async function loadHistory(empId) {
    const historyBody = document.getElementById('vacation-history-body');
    if (!historyBody) return;

    const reqRef = collection(db, `employees/${empId}/vacationRequests`);
    const q = query(reqRef, orderBy("startDate", "desc"));
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
            <td class="text-right">
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

// --- POMOCNÉ FUNKCIE A LISTENERY ---

function calculateBusinessDays(d1, d2) {
    let start = new Date(d1);
    let end = new Date(d2);
    let count = 0;
    while (start <= end) {
        let day = start.getDay();
        if (day !== 0 && day !== 6) count++; 
        start.setDate(start.getDate() + 1);
    }
    return count;
}

function attachLocalEventListeners(empId) {
    const form = document.getElementById('new-vacation-form');
    const dateFrom = document.getElementById('vac-date-from');
    const dateTo = document.getElementById('vac-date-to');
    const calcBox = document.getElementById('vac-day-calculation');
    const halfDayCheckbox = document.getElementById('vac-half-day');

    const updateDisplayCount = () => {
        if (dateFrom.value && dateTo.value) {
            let days = calculateBusinessDays(dateFrom.value, dateTo.value);
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
            let days = calculateBusinessDays(dateFrom.value, dateTo.value);
            
            if (halfDayCheckbox.checked) {
                days = 0.5;
            }

            if (days <= 0) return showToast("Neplatný rozsah dátumov (víkend).", TOAST_TYPE.ERROR);

            try {
                await addDoc(collection(db, `employees/${empId}/vacationRequests`), {
                    employeeId: empId,
                    startDate: Timestamp.fromDate(new Date(dateFrom.value)),
                    endDate: Timestamp.fromDate(new Date(dateTo.value)),
                    daysCount: days,
                    createdAt: Timestamp.now()
                });

                const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
                await updateDoc(statsRef, { cerpanie: increment(days) });

                showToast(`Dovolenka (${days} d.) zapísaná.`, TOAST_TYPE.SUCCESS);
                renderVacationModule(empId);
            } catch (err) {
                showToast("Nepodarilo sa uložiť dáta.", TOAST_TYPE.ERROR);
            }
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
                showToast("Limity úspešne aktualizované.", TOAST_TYPE.SUCCESS);
                renderVacationModule(empId);
            } catch (err) {
                showToast("Chyba pri aktualizácii limitov.", TOAST_TYPE.ERROR);
            }
        };
    }

    // NOVÉ: Implementácia exportu
    const btnDownloadPersonal = document.getElementById('btn-download-vac-xlsx');
    if (btnDownloadPersonal) {
        btnDownloadPersonal.onclick = () => exportToExcel(empId);
    }

    const btnDownloadAll = document.getElementById('btn-download-vac-all');
    if (btnDownloadAll) {
        btnDownloadAll.onclick = () => {
            showToast("Pripravujem hromadný export všetkých zamestnancov...", TOAST_TYPE.INFO);
            // Tu neskôr doplníme logiku pre hromadný export
        };
    }

    const historyBody = document.getElementById('vacation-history-body');
    if (historyBody) {
        historyBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-delete-vac');
            if (!btn) return;

            if (!confirm("Naozaj chcete vymazať tento záznam o čerpaní? Dni sa pripočítajú späť k zostatku.")) return;
            
            const docId = btn.dataset.id;
            const days = parseFloat(btn.dataset.days);

            try {
                await deleteDoc(doc(db, `employees/${empId}/vacationRequests/${docId}`));
                const statsRef = doc(db, `employees/${empId}/vacationStats/${currentYear}`);
                await updateDoc(statsRef, { cerpanie: increment(-days) });

                showToast("Záznam bol odstránený.", TOAST_TYPE.SUCCESS);
                renderVacationModule(empId);
            } catch (err) {
                showToast("Chyba pri odstraňovaní záznamu.", TOAST_TYPE.ERROR);
            }
        });
    }
}

function getStatsSkeleton() {
    return `<div class="skeleton-line long" style="height: 100px; width: 100%;"></div>`;
}