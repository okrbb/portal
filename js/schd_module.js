/* schd_module.js - Modular SDK v9+ (Enhanced Notifications) */
import { 
    doc, 
    setDoc, 
    serverTimestamp 
} from 'firebase/firestore';

import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';

let _activeUser = null; 

export function initializeSCHDModule(db, employeesData, activeUser) { 
    console.log('Inicializujem modul Rozpis Pohotovosti (Modular SDK - Full)...');
    _activeUser = activeUser; 

    let allEmployees = [];
    let employeeGroups = []; 
    let employeeSignatures = {}; 
    let clickTimer = null;

    let appState = {
        selectedMonth: new Date().getMonth(),
        selectedYear: new Date().getFullYear(),
        dutyAssignments: {}, 
        reporting: {},       
        selectedDutyForSwap: null, 
        firstSwapSelection: null, 
        serviceOverrides: {}     
    };

    // --- KONŠTANTY ---
    const FONT_URL = 'fonts/DejaVuSans.ttf';
    const DOCX_TEMPLATE_URL = 'data/vykaz_pohotovosti.docx';
    const PDF_FONT_FILENAME = 'DejaVuSans.ttf';
    const PDF_FONT_INTERNAL_NAME = 'DejaVuSans';

    // Ikony pre HTML (kalendár na obrazovke)
    const ICON_SWAP = '<i class="fas fa-exchange-alt swap-icon"></i>'; 
    const ICON_SUBSTITUTION = '<i class="fas fa-user-clock swap-icon"></i>'; 
    
    // Znaky pre PDF (tlač)
    const UNICODE_SWAP = ' \u21C4';        // ⇄
    const UNICODE_SUBSTITUTION = ' \u27F2'; // ⟲

    const monthNames = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
    
    let generatedPDFDataURI = null;
    let generatedPDFFilename = '';
    let customFontBase64 = null;

    let elMonthSelect, elYearSelect, elExportButton, elSaveButton, elClearButton;
    let elCloseModalButton, elDownloadPdfButton;
    let elGroupsList, elCalendarContainer;
    let elPdfPreviewFrame, elPreviewModal;

    (async () => {
        elMonthSelect = document.getElementById('duty-month-select');
        elYearSelect = document.getElementById('duty-year-select');
        elExportButton = document.getElementById('duty-preview-btn');
        elSaveButton = document.getElementById('duty-download-btn');
        elClearButton = document.getElementById('duty-delete-btn');
        elCloseModalButton = document.getElementById('closeModalButton');
        elDownloadPdfButton = document.getElementById('downloadPdfButton');
        elPdfPreviewFrame = document.getElementById('pdfPreviewFrame');
        elPreviewModal = document.getElementById('previewModal');
        elGroupsList = document.getElementById('duty-groups-list');
        elCalendarContainer = document.getElementById('duty-weeks-container');
        
        if (!elMonthSelect || !elYearSelect || !elGroupsList || !elCalendarContainer) {
            console.error('Kritická chyba modulu Pohotovosť: Chýbajú základné HTML elementy.');
            return;
        }

        loadConfig();
        loadFontData();
        populateYearSelect();
        elMonthSelect.value = appState.selectedMonth;
        elYearSelect.value = appState.selectedYear;
        initSortableList(elGroupsList); 
        initEventListeners();
        render();
    })();

    function loadConfig() {
        let allEmpsArray = [];
        let zodpovedaPerson = null;
        let schvalujePerson = null;
        employeeSignatures = {}; 

        if (!employeesData || employeesData.size === 0) {
            console.warn("SCHD Modul: Žiadne dáta v cache.");
            showToast('Nepodarilo sa načítať zoznam zamestnancov.', TOAST_TYPE.ERROR);
            return;
        }

        try {
            employeesData.forEach((data) => {
                const empMeno = `${data.titul || ''} ${data.meno || ''} ${data.priezvisko || ''}`.trim().replace(/\s+/g, ' ');
                const empFunkcia = data.funkcia || '';
                const empOddelenie = data.oddelenie || '';
                let sluzobny_kontakt = '';
                const kontakt = data.kontakt || ''; 
                
                if (kontakt.includes(',')) {
                    const parts = kontakt.split(',');
                    sluzobny_kontakt = parts[0] ? parts[0].trim() : '';
                } else if (kontakt.trim() !== 'null' && kontakt.trim() !== '') {
                    sluzobny_kontakt = kontakt.trim();
                }

                if (empFunkcia === 'vedúci odboru') schvalujePerson = { meno: empMeno, funkcia: empFunkcia };
                if (empFunkcia === 'vedúci oddelenia' && empOddelenie === 'OCOaKP') zodpovedaPerson = { meno: empMeno, funkcia: empFunkcia, oddelenie: empOddelenie };
                
                let groupName = null;
                if (String(data.poh) === "1") groupName = "Skupina 1";
                else if (String(data.poh) === "2") groupName = "Skupina 2";
                else if (String(data.poh) === "3") groupName = "Skupina 3";
                
                allEmpsArray.push({ id: data.id, meno: empMeno, telefon: sluzobny_kontakt, skupina: groupName, coz: data.coz || "", funkcia: empFunkcia });
            });

            employeeSignatures.zodpoveda = zodpovedaPerson || { meno: 'Meno (Nenájdené)', funkcia: 'vedúci oddelenia', oddelenie: 'OCOaKP' };
            employeeSignatures.schvaluje = schvalujePerson || { meno: 'Meno (Nenájdené)', funkcia: 'vedúci odboru' };

            allEmployees = allEmpsArray.filter(emp => emp.skupina);
            
            const groupsMap = new Map();
            allEmployees.forEach(emp => {
                if (!groupsMap.has(emp.skupina)) groupsMap.set(emp.skupina, []);
                groupsMap.get(emp.skupina).push(emp);
            });

            employeeGroups = [];
            groupsMap.forEach((moznosti, skupina) => {
                employeeGroups.push({ skupina: skupina, moznosti: moznosti.sort((a, b) => a.meno.localeCompare(b.meno)) });
            });
            employeeGroups.sort((a, b) => a.skupina.localeCompare(b.skupina));

        } catch (error) {
            console.error('Chyba loadConfig:', error);
            showToast('Chyba pri spracovaní dát zamestnancov.', TOAST_TYPE.ERROR);
        }
    }

    function populateYearSelect() {
        const currentYear = appState.selectedYear; 
        for (let year = currentYear - 5; year <= currentYear + 5; year++) {
            const option = document.createElement('option');
            option.value = year; option.textContent = year; elYearSelect.appendChild(option);
        }
    }

    function initEventListeners() {
        elMonthSelect.addEventListener('change', handleDateChange);
        elYearSelect.addEventListener('change', handleDateChange);
        elExportButton.addEventListener('click', showSchedulePreview);
        elSaveButton.addEventListener('click', generateDocxReport);
        elClearButton.addEventListener('click', clearSchedule); 
        if (elCloseModalButton) elCloseModalButton.addEventListener('click', closeModal);
        if (elDownloadPdfButton) elDownloadPdfButton.addEventListener('click', downloadSchedulePDF);
        elCalendarContainer.addEventListener('dblclick', handleCalendarDutyDblClick);
        elCalendarContainer.addEventListener('contextmenu', handleCalendarSwapClick);
        elGroupsList.addEventListener('click', handleEmployeeListClick);
        elCalendarContainer.addEventListener('click', handleCalendarDutyClick);
    }

    function handleDateChange(e) {
        if (e.target.id === 'duty-month-select') appState.selectedMonth = parseInt(e.target.value);
        else appState.selectedYear = parseInt(e.target.value);
        render(); 
    }

    // === UPRAVENÉ: Dvojklik pre zástup ===
    function handleCalendarDutyDblClick(e) {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        e.preventDefault(); appState.firstSwapSelection = null; 
        
        const employeeItem = e.target.closest('.employee-item-calendar');
        if (!employeeItem) return;
        
        const { employeeId, weekKey } = employeeItem.dataset;
        // Získame meno pre notifikáciu
        const empName = employeeItem.textContent.trim().replace(/\s+/, ' '); // Odstránime prípadné ikony/medzery

        document.querySelectorAll(`.swap-selected`).forEach(el => el.classList.remove('swap-selected'));
        
        if (appState.selectedDutyForSwap && appState.selectedDutyForSwap.weekKey === weekKey && appState.selectedDutyForSwap.originalId === employeeId) {
            appState.selectedDutyForSwap = null; 
            showToast('Zrušené.', TOAST_TYPE.INFO);
        } else {
            appState.selectedDutyForSwap = { weekKey, originalId: employeeId, month: appState.selectedMonth, year: appState.selectedYear };
            employeeItem.classList.add('swap-selected');
            // ZOBRAZÍME MENO
            showToast(`Vybraný: <strong>${empName}</strong>. Kliknite na náhradníka v zozname.`, TOAST_TYPE.INFO);
        }
    }

    function handleEmployeeListClick(e) {
        if (!appState.selectedDutyForSwap) return; 
        const employeeListItem = e.target.closest(`.duty-group-card li`);
        if (!employeeListItem) return;
        const newEmployeeId = employeeListItem.dataset.id;
        const newEmployeeName = employeeListItem.textContent; // Meno nového

        const { weekKey, originalId, month, year } = appState.selectedDutyForSwap;
        if (newEmployeeId === originalId) { showToast('Nemôže byť tá istá osoba.', TOAST_TYPE.ERROR); return; }
        const stateKey = `${year}-${month}-${weekKey}`;
        if (!appState.serviceOverrides[stateKey]) appState.serviceOverrides[stateKey] = {};
        
        const newEmp = findEmployeeById(newEmployeeId);
        // Získame meno pôvodného pre správu (cez ID)
        const oldEmp = findEmployeeById(originalId);
        const oldName = oldEmp ? oldEmp.meno : 'Pôvodný';

        appState.serviceOverrides[stateKey][originalId] = { id: newEmployeeId, meno: newEmp ? newEmp.meno : 'Neznámy', type: 'sub' };
        appState.selectedDutyForSwap = null;
        document.querySelectorAll(`.swap-selected`).forEach(el => el.classList.remove('swap-selected'));
        
        showToast(`Zastupovanie nastavené: <strong>${oldName} -> ${newEmployeeName}</strong>.`, TOAST_TYPE.SUCCESS);
        render();
    }

    function handleCalendarDutyClick(e) {
        // Kliknutie slúži na 2 veci:
        // 1. Ak je aktívny výber pre zástup (dblclick) -> dokončí zástup (kliknutím na iného v kalendári namiesto zoznamu)
        // 2. Ak nie je aktívny -> prepne Hlásenie (reporting)

        const item = e.target.closest('.employee-item-calendar');
        if (!item) { 
            // Klik mimo -> zruší výbery
            if (appState.firstSwapSelection) { appState.firstSwapSelection = null; document.querySelectorAll(`.swap-selected`).forEach(el => el.classList.remove('swap-selected')); }
            return; 
        }
        
        const { renderedId, originalId, weekKey } = item.dataset;
        const clickId = renderedId || originalId;
        const clickName = item.textContent.trim();

        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            clickTimer = null;
            if (appState.firstSwapSelection) { appState.firstSwapSelection = null; document.querySelectorAll(`.swap-selected`).forEach(el => el.classList.remove('swap-selected')); }
            
            // 1. Dokončenie zástupu (namiesto kliku v zozname)
            if (appState.selectedDutyForSwap) {
                const { weekKey: wKey, originalId: oId, month, year } = appState.selectedDutyForSwap;
                if (clickId === oId) { showToast('Tá istá osoba.', TOAST_TYPE.ERROR); return; }
                
                const sKey = `${year}-${month}-${wKey}`;
                if (!appState.serviceOverrides[sKey]) appState.serviceOverrides[sKey] = {};
                const newEmp = findEmployeeById(clickId);
                const oldEmp = findEmployeeById(oId); // Pôvodný

                appState.serviceOverrides[sKey][oId] = { id: clickId, meno: newEmp ? newEmp.meno : 'Neznámy', type: 'sub' };
                appState.selectedDutyForSwap = null;
                document.querySelectorAll(`.swap-selected`).forEach(el => el.classList.remove('swap-selected'));
                
                showToast(`Zastupovanie nastavené: <strong>${oldEmp ? oldEmp.meno : 'Pôvodný'} -> ${newEmp ? newEmp.meno : clickName}</strong>.`, TOAST_TYPE.SUCCESS);
                render();
            } else {
                // 2. Prepnutie hlásenia (Pôvodná funkcia)
                const sKey = `${appState.selectedYear}-${appState.selectedMonth}-${weekKey}`;
                if (!appState.reporting[sKey]) appState.reporting[sKey] = [];
                const idx = appState.reporting[sKey].indexOf(clickId);
                let msg = '';
                
                if (idx > -1) {
                    appState.reporting[sKey].splice(idx, 1);
                    msg = `Hlásenie zrušené: ${clickName}`;
                } else {
                    appState.reporting[sKey].push(clickId);
                    msg = `Hlásenie pridané: ${clickName}`;
                }
                
                // Voliteľné: Zobraziť toast aj pri hlásení (ak chcete, odkomentujte)
                // showToast(msg, TOAST_TYPE.INFO);
                render();
            }
        }, 250);
    }

    // === UPRAVENÉ: Pravý klik pre výmenu ===
    function handleCalendarSwapClick(e) {
        e.preventDefault();
        const item = e.target.closest('.employee-item-calendar');
        if (!item) return;
        
        const { renderedId, originalId, weekKey } = item.dataset;
        const clickRender = renderedId || originalId;
        const clickOrig = originalId;
        const empName = item.textContent.trim(); // Meno kliknutej osoby
        
        if (appState.selectedDutyForSwap) { appState.selectedDutyForSwap = null; document.querySelectorAll(`.swap-selected`).forEach(el => el.classList.remove('swap-selected')); }
        
        if (!appState.firstSwapSelection) {
            // Prvý klik
            appState.firstSwapSelection = { weekKey, originalId: clickOrig, renderedId: clickRender, month: appState.selectedMonth, year: appState.selectedYear, name: empName };
            document.querySelectorAll(`.swap-selected`).forEach(el => el.classList.remove('swap-selected'));
            item.classList.add('swap-selected');
            
            showToast(`Výmena - prvý: <strong>${empName}</strong>. Kliknite pravým na druhého.`, TOAST_TYPE.INFO);
        } else {
            // Druhý klik
            const first = appState.firstSwapSelection;
            const second = { weekKey, originalId: clickOrig, renderedId: clickRender, month: appState.selectedMonth, year: appState.selectedYear, name: empName };
            
            appState.firstSwapSelection = null;
            document.querySelectorAll(`.swap-selected`).forEach(el => el.classList.remove('swap-selected'));
            
            if (first.weekKey === second.weekKey && first.originalId === second.originalId) { 
                showToast('Zrušené (tá istá osoba).', TOAST_TYPE.INFO); 
                return; 
            }
            
            const sk1 = `${first.year}-${first.month}-${first.weekKey}`;
            const sk2 = `${second.year}-${second.month}-${second.weekKey}`;
            if (!appState.serviceOverrides[sk1]) appState.serviceOverrides[sk1] = {};
            if (!appState.serviceOverrides[sk2]) appState.serviceOverrides[sk2] = {};
            
            const emp1 = findEmployeeById(first.renderedId);
            const emp2 = findEmployeeById(second.renderedId);
            
            appState.serviceOverrides[sk1][first.originalId] = { id: second.renderedId, meno: emp2 ? emp2.meno : 'Neznámy', type: 'swap' };
            appState.serviceOverrides[sk2][second.originalId] = { id: first.renderedId, meno: emp1 ? emp1.meno : 'Neznámy', type: 'swap' };
            
            showToast(`Vymenené: <strong>${first.name} ↔ ${second.name}</strong>.`, TOAST_TYPE.SUCCESS);
            render();
        }
    }

    function clearSchedule() {
        appState.dutyAssignments = {}; appState.reporting = {}; appState.serviceOverrides = {};
        appState.selectedDutyForSwap = null; appState.firstSwapSelection = null; 
        render(); showToast('Rozpis vymazaný.', TOAST_TYPE.INFO);
    }

    function findEmployeeById(id) { return allEmployees.find(emp => emp.id === id); }

    function render() { renderGroupLists(); renderCalendar(); }

    function renderGroupLists() {
        const assignedGroups = new Set();
        Object.values(appState.dutyAssignments).forEach(arr => { if(arr.length>0) { const e = findEmployeeById(arr[0].id); if(e) assignedGroups.add(e.skupina); } });
        const reportingIds = new Set(Object.values(appState.reporting).flat());
        let html = '';
        employeeGroups.forEach(g => {
            const isAssigned = assignedGroups.has(g.skupina);
            const ids = JSON.stringify(g.moznosti.map(e => e.id));
            html += `<div class="duty-group-card ${isAssigned ? 'is-assigned' : ''}" data-group-ids='${ids}' data-group-name="${g.skupina}"><h3>${g.skupina}</h3><ul>${g.moznosti.map(e => `<li data-id="${e.id}" class="${reportingIds.has(e.id)?'reporting':''}">${e.meno}</li>`).join('')}</ul></div>`;
        });
        elGroupsList.innerHTML = html;
        initSortableList(elGroupsList);
    }

    function renderCalendar() {
        const weeks = getWeeksForMonth(appState.selectedYear, appState.selectedMonth);
        let html = '';
        weeks.forEach(w => {
            const wk = w.key;
            const sk = `${appState.selectedYear}-${appState.selectedMonth}-${wk}`;
            const start = `${String(w.start.getDate()).padStart(2,'0')}.${String(w.start.getMonth()+1).padStart(2,'0')}.`;
            const end = `${String(w.end.getDate()).padStart(2,'0')}.${String(w.end.getMonth()+1).padStart(2,'0')}.`;
            const assigned = appState.dutyAssignments[sk];
            html += `<div class="duty-week-card" data-week-key="${wk}"><div class="duty-week-header"><h4>Týždeň ${w.weekNumber}</h4><span>${start} - ${end}</span></div>`;
            if (assigned && assigned.length > 0) {
                const full = assigned.map(e => findEmployeeById(e.id)).filter(Boolean);
                const gName = full.length > 0 ? full[0].skupina : '';
                const reps = appState.reporting[sk] || [];
                html += `<div class="duty-week-assigned-group" data-group-name="${gName}">`;
                full.forEach(e => {
                    let toRender = e;
                    const ovrs = appState.serviceOverrides[sk];
                    const ovr = (ovrs && ovrs[e.id]) ? ovrs[e.id] : null;
                    let icon = '';
                    if (ovr) {
                        const ne = findEmployeeById(ovr.id);
                        if (ne) toRender = ne;
                        icon = ovr.type === 'sub' ? ICON_SUBSTITUTION : ICON_SWAP;
                    }
                    const isRep = reps.includes(toRender.id);
                    const swapCls = ((appState.selectedDutyForSwap && appState.selectedDutyForSwap.weekKey === wk && appState.selectedDutyForSwap.originalId === e.id) || (appState.firstSwapSelection && appState.firstSwapSelection.weekKey === wk && appState.firstSwapSelection.originalId === e.id)) ? 'swap-selected' : '';
                    html += `<div class="employee-item-calendar ${isRep?'reporting':''} ${swapCls}" data-employee-id="${e.id}" data-original-id="${e.id}" data-rendered-id="${toRender.id}" data-week-key="${wk}">${toRender.meno} ${icon}</div>`;
                });
                html += `</div>`;
            } else {
                html += `<div class="duty-week-dropzone" data-week-key="${wk}"><i class="fas fa-file-import"></i><span>Presuňte sem skupinu</span></div>`;
            }
            html += `</div>`;
        });
        elCalendarContainer.innerHTML = html;
        initCalendarSortable();
    }

    function getWeeksForMonth(year, month) {
        const weeks = [];
        const first = new Date(year, month, 1);
        const last = new Date(year, month + 1, 0);
        let curr = new Date(first);
        while (curr <= last) {
            const wInfo = getWeekNumber(curr);
            const wKey = `${wInfo.year}-${wInfo.week}`;
            const day = (curr.getDay() + 6) % 7;
            const mon = new Date(curr); mon.setDate(mon.getDate() - day);
            const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
            const start = new Date(Math.max(first.getTime(), mon.getTime()));
            const end = new Date(Math.min(last.getTime(), sun.getTime()));
            if (!weeks.some(w => w.key === wKey)) weeks.push({ weekNumber: wInfo.week, year: wInfo.year, key: wKey, start, end });
            curr = new Date(sun); curr.setDate(curr.getDate() + 1);
        }
        return weeks;
    }

    function initSortableList(el) {
        if (!el) return;
        if (el.sortableInstance) el.sortableInstance.destroy();
        el.sortableInstance = new Sortable(el, { animation: 150, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag', group: { name: 'shared', pull: 'clone', put: false }, draggable: '.duty-group-card', handle: 'h3' });
    }

    function initCalendarSortable() {
        document.querySelectorAll('.duty-week-dropzone').forEach(cell => {
            if (cell.sortableInstance) cell.sortableInstance.destroy();
            cell.sortableInstance = new Sortable(cell, { group: 'shared', animation: 150, ghostClass: 'calendar-drop-ghost', onAdd: handleDragToCalendar });
        });
    }

    function handleDragToCalendar(evt) {
        const { item, to } = evt;
        const startWeekKey = to.dataset.weekKey;
        if (!startWeekKey || !item.classList.contains('duty-group-card')) { item.remove(); return; }
        let emps = [];
        try { emps = JSON.parse(item.dataset.groupIds).map(findEmployeeById).filter(Boolean); } catch (e) { item.remove(); return; }
        item.remove();
        
        const allKeys = [];
        document.querySelectorAll('.duty-week-card, .duty-week-dropzone').forEach(el => { if(el.dataset.weekKey && !allKeys.includes(el.dataset.weekKey)) allKeys.push(el.dataset.weekKey); });
        const startIdx = allKeys.indexOf(startWeekKey);
        
        if (startIdx === -1) {
            appState.dutyAssignments[`${appState.selectedYear}-${appState.selectedMonth}-${startWeekKey}`] = emps.map(e => ({ id: e.id, meno: e.meno, skupina: e.skupina }));
            render(); return;
        }

        let currGroup = emps;
        for (let i = startIdx; i < allKeys.length; i++) {
            appState.dutyAssignments[`${appState.selectedYear}-${appState.selectedMonth}-${allKeys[i]}`] = currGroup.map(e => ({ id: e.id, meno: e.meno, skupina: e.skupina }));
            const gNum = parseInt(currGroup[0].skupina.split(' ')[1]);
            const nextName = `Skupina ${(gNum % 3) + 1}`;
            const nextG = employeeGroups.find(g => g.skupina === nextName);
            if (nextG) currGroup = nextG.moznosti; else break;
        }
        render();
    }

    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
    }

    async function showSchedulePreview() {
        if (!Permissions.canViewModule(_activeUser, 'pohotovost-module')) return showToast("Nemáte oprávnenie.", TOAST_TYPE.ERROR);
        
        const keys = Object.keys(appState.dutyAssignments).filter(k => k.startsWith(`${appState.selectedYear}-${appState.selectedMonth}-`));
        if (keys.length === 0) return showToast("Priraďte aspoň jedného zamestnanca.", TOAST_TYPE.ERROR);
        
        showToast('Generujem náhľad PDF...', TOAST_TYPE.INFO);
        if (!customFontBase64) await loadFontData();

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            if (customFontBase64) {
                doc.addFileToVFS(PDF_FONT_FILENAME, customFontBase64);
                doc.addFont(PDF_FONT_FILENAME, PDF_FONT_INTERNAL_NAME, 'normal');
                doc.setFont(PDF_FONT_INTERNAL_NAME, 'normal');
            }
            doc.setFontSize(14);
            doc.text(`Rozpis pohotovosti - OKR BB`, 105, 15, { align: 'center' });
            doc.text(`${monthNames[appState.selectedMonth].charAt(0).toUpperCase() + monthNames[appState.selectedMonth].slice(1)} ${appState.selectedYear}`, 105, 22, { align: 'center' });
            
            const body = [];
            const weeks = getWeeksForMonth(appState.selectedYear, appState.selectedMonth);
            weeks.forEach(w => {
                const sk = `${appState.selectedYear}-${appState.selectedMonth}-${w.key}`;
                const group = appState.dutyAssignments[sk] || [];
                const reps = appState.reporting[sk] || [];
                const ovrs = appState.serviceOverrides[sk];
                const dateRange = `${String(w.start.getDate()).padStart(2,'0')}.${String(w.start.getMonth()+1).padStart(2,'0')}. - ${String(w.end.getDate()).padStart(2,'0')}.${String(w.end.getMonth()+1).padStart(2,'0')}.`;
                const days = Math.round((w.end - w.start)/86400000)+1;
                
                if (group.length > 0) {
                    let first = true;
                    group.forEach(p => {
                        let rend = findEmployeeById(p.id); let oid = p.id;
                        let iconUnicode = ''; 

                        if (ovrs && ovrs[oid]) { 
                            const overrideData = ovrs[oid];
                            rend = findEmployeeById(overrideData.id);
                            if (overrideData.type === 'sub') iconUnicode = UNICODE_SUBSTITUTION; 
                            else if (overrideData.type === 'swap') iconUnicode = UNICODE_SWAP;
                        }
                        
                        if (!rend) return;
                        
                        const finalName = rend.meno + iconUnicode;

                        body.push([ 
                            first ? `Týždeň ${w.weekNumber}` : '', 
                            first ? dateRange : '', 
                            finalName, 
                            rend.telefon || '', 
                            '', 
                            reps.includes(rend.id) ? 'hlásenia' : '' 
                        ]);
                        first = false;
                    });
                    body.push([{content:'', colSpan:4, styles:{fillColor:[230,230,230]}}, {content: days.toString(), styles:{fontStyle:'bold', halign:'center', fillColor:[230,230,230]}}, {content:'', styles:{fillColor:[230,230,230]}}]);
                } else {
                    body.push([`Týždeň ${w.weekNumber}`, dateRange, '(Voľný týždeň)', '', '', '']);
                }
            });

            doc.autoTable({ 
                head: [['Týždeň', 'Dátum', 'Meno', 'Telefón', 'Σ', 'Poznámka']], 
                body: body, 
                startY: 30, 
                theme: 'grid', 
                headStyles: { fillColor: [0, 51, 102], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
                styles: { font: customFontBase64 ? PDF_FONT_INTERNAL_NAME : 'DejaVuSans', fontSize: 10 } 
            });

            const fy = doc.lastAutoTable.finalY;
            doc.text('Zodpovedá:', 40, fy+20); doc.text(employeeSignatures.zodpoveda.meno, 40, fy+27);
            doc.text('Schvaľuje:', 130, fy+20); doc.text(employeeSignatures.schvaluje.meno, 130, fy+27);

            generatedPDFDataURI = doc.output('bloburl');
            generatedPDFFilename = `rozpis_${appState.selectedMonth}_${appState.selectedYear}.pdf`;
            elPdfPreviewFrame.src = generatedPDFDataURI + '#toolbar=0';
            elPreviewModal.classList.remove('hidden');
        } catch (e) { console.error(e); showToast("Chyba PDF.", TOAST_TYPE.ERROR); }
    }

    async function saveScheduleToDB() {
        if (!Permissions.canViewModule(_activeUser, 'pohotovost-module')) return;
        const docId = `${appState.selectedYear}-${appState.selectedMonth}`; 
        const weeks = getWeeksForMonth(appState.selectedYear, appState.selectedMonth).map(w => w.key);
        const data = {
            year: appState.selectedYear, month: appState.selectedMonth, monthName: monthNames[appState.selectedMonth],
            lastSaved: serverTimestamp(),
            dutyAssignments: {}, serviceOverrides: {}, reporting: {}
        };
        weeks.forEach(k => {
            const sk = `${appState.selectedYear}-${appState.selectedMonth}-${k}`;
            if(appState.dutyAssignments[sk]) data.dutyAssignments[k] = appState.dutyAssignments[sk];
            if(appState.serviceOverrides[sk]) data.serviceOverrides[k] = appState.serviceOverrides[sk];
            if(appState.reporting[sk]) data.reporting[k] = appState.reporting[sk];
        });
        
        await setDoc(doc(db, "publishedSchedules", docId), data);
        showToast('Uložené do DB.', TOAST_TYPE.SUCCESS);
    }

    async function downloadSchedulePDF() {
        if (!generatedPDFDataURI) return showToast('Chyba.', TOAST_TYPE.ERROR);
        try { await saveScheduleToDB(); } catch(e) { console.error(e); }
        const a = document.createElement('a'); a.href = generatedPDFDataURI; a.download = generatedPDFFilename; 
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    function closeModal() { if (elPreviewModal) elPreviewModal.classList.add('hidden'); }

    async function generateDocxReport() {
        if (!Permissions.canViewModule(_activeUser, 'pohotovost-module')) {
             showToast("Nemáte oprávnenie na stiahnutie výkazu.", TOAST_TYPE.ERROR);
             return;
        }

        const selectedMonth = appState.selectedMonth;
        const selectedYear = appState.selectedYear;
        
        const keysForCurrentMonth = Object.keys(appState.dutyAssignments).filter(key => 
            key.startsWith(`${selectedYear}-${selectedMonth}-`)
        );
        
        const allPeopleInGroups = keysForCurrentMonth.map(key => appState.dutyAssignments[key]).flat();
        const uniquePeopleIds = new Set(allPeopleInGroups.map(p => p.id));
        const allPeople = Array.from(uniquePeopleIds).map(id => findEmployeeById(id)).filter(Boolean).slice(0, 10);
        
        if (allPeople.length === 0) {
            showToast("Priraďte aspoň jedného zamestnanca.", TOAST_TYPE.ERROR);
            return;
        }
        
        try {
            showToast('Sťahujem výkaz (DOCX)...', TOAST_TYPE.INFO);
            const response = await fetch(DOCX_TEMPLATE_URL);
            if (!response.ok) throw new Error('Nepodarilo sa načítať šablónu DOCX.');
            const arrayBuffer = await response.arrayBuffer();
            
            const pizZipInstance = new PizZip(arrayBuffer);
            const doc = new window.docxtemplater(pizZipInstance, {
                paragraphLoop: true,
                linebreaks: true,
                nullGetter: () => "", 
                delimiters: { start: '{{', end: '}}' }
            });

            const templateData = {};
            templateData['mesiac'] = monthNames[selectedMonth];
            templateData['rok'] = selectedYear;

            const employeeRows = {};
            const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

            allPeople.forEach(person => { employeeRows[person.id] = { person: person, dates: [] }; });

            for (let day = 1; day <= daysInMonth; day++) {
                const currentDate = new Date(selectedYear, selectedMonth, day);
                const weekInfo = getWeekNumber(currentDate);
                const reportingKey = `${weekInfo.year}-${weekInfo.week}`; 
                const stateKey = `${selectedYear}-${selectedMonth}-${reportingKey}`;

                const activeGroup = appState.dutyAssignments[stateKey] || [];
                const overridesForWeek = appState.serviceOverrides[stateKey] || {};
                const formattedDate = `${day}.${selectedMonth + 1}.${selectedYear}`;
                
                activeGroup.forEach(person => {
                    let currentPersonId = person.id;
                    const overrideData = (overridesForWeek && overridesForWeek[currentPersonId]) ? overridesForWeek[currentPersonId] : null;
                    if (overrideData) currentPersonId = overrideData.id;

                    if (employeeRows[currentPersonId]) {
                        employeeRows[currentPersonId].dates.push({
                            date: formattedDate,
                            dayOfWeek: currentDate.getDay() 
                        });
                    }
                });
            }
            
            allPeople.forEach((person, i) => {
                if (i > 8) return; 
                templateData[i.toString()] = person.meno;
                templateData[`oc${i}`] = person.coz || "";
                
                const dates = employeeRows[person.id]?.dates || [];
                let sumPracovneDni = 0, sumVikendy = 0, sumHodinyP5 = 0, sumHodinySn10 = 0;
                
                templateData[`dates${i}`] = dates.map(dateObj => {
                    const dayOfWeek = dateObj.dayOfWeek;
                    const isPracovnyDen = dayOfWeek >= 1 && dayOfWeek <= 5;
                    const isVikend = dayOfWeek === 0 || dayOfWeek === 6;
                    
                    if (isPracovnyDen) { sumPracovneDni++; sumHodinyP5 += 16; }
                    if (isVikend) { sumVikendy++; sumHodinySn10 += 24; }
                    
                    return {
                        date: dateObj.date,
                        popi: isPracovnyDen ? 1 : "",
                        sonesv: isVikend ? 1 : "",
                        p5: isPracovnyDen ? 16 : "",
                        sn10: isVikend ? 24 : "",
                        oc: person.coz || ""
                    };
                });
                
                templateData[`sum1${i}`] = sumPracovneDni > 0 ? sumPracovneDni : "";
                templateData[`sum2${i}`] = sumVikendy > 0 ? sumVikendy : "";
                templateData[`sum3${i}`] = sumHodinyP5 > 0 ? sumHodinyP5 : "";
                templateData[`sum4${i}`] = sumHodinySn10 > 0 ? sumHodinySn10 : "";
            });

            doc.render(templateData);
            const docBuffer = doc.getZip().generate({ type: 'blob' });
            saveAs(docBuffer, `vykaz_pohotovosti_${monthNames[selectedMonth]}_${selectedYear}.docx`);
            showToast(`Súbor bol úspešne vytvorený.`, TOAST_TYPE.SUCCESS);
            
        } catch (error) {
            console.error('Chyba pri spracovaní DOCX:', error);
            showToast('Nastala chyba pri generovaní dokumentu.', TOAST_TYPE.ERROR);
        }
    }

    async function loadFontData() {
        if (customFontBase64) return; 
        try {
            const response = await fetch(FONT_URL);
            const buffer = await response.arrayBuffer();
            let binary = ''; const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            customFontBase64 = window.btoa(binary);
        } catch (e) { console.error(e); }
    }
}