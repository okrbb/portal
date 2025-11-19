import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';

/**
 * ===================================
 * MODUL PRE ROZPIS POHOTOVOSTI
 * (schd_module.js)
 * ===================================
 */

let _activeUser = null; // Uložený aktívny používateľ

export function initializeSCHDModule(db, employeesData, activeUser) { 
    
    console.log('Inicializujem modul Rozpis Pohotovosti (verzia s cache)...');
    
    _activeUser = activeUser; // Uloženie používateľa

    // Lokálne premenné pre konfiguráciu
    let allEmployees = [];
    let employeeGroups = []; 
    let employeeSignatures = {}; 
    let clickTimer = null;

    // Centrálny stav (State)
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

    // DOM IDčká
    const ID_MONTH_SELECT = 'duty-month-select';
    const ID_YEAR_SELECT = 'duty-year-select';
    const ID_EXPORT_BUTTON = 'duty-preview-btn';    
    const ID_SAVE_BUTTON = 'duty-download-btn';     
    const ID_CLEAR_BUTTON = 'duty-delete-btn';      
    const ID_GROUPS_LIST = 'duty-groups-list';
    const ID_CALENDAR_CONTAINER = 'duty-weeks-container';
    
    // Modálne okná ID
    const ID_CLOSE_MODAL_BUTTON = 'closeModalButton';
    const ID_DOWNLOAD_PDF_BUTTON = 'downloadPdfButton';
    const ID_PDF_PREVIEW_FRAME = 'pdfPreviewFrame';
    const ID_PREVIEW_MODAL = 'previewModal';

    // CSS Triedy
    const CSS_GROUP_CARD = 'duty-group-card';
    const CSS_WEEK_CARD = 'duty-week-card';
    const CSS_WEEK_DROPZONE = 'duty-week-dropzone';
    const CSS_IS_ASSIGNED = 'is-assigned';
    const CSS_REPORTING = 'reporting';
    const CSS_SWAP_SELECTED = 'swap-selected';
    const CSS_SORTABLE_GHOST = 'sortable-ghost'; 
    const CSS_CALENDAR_DROP_GHOST = 'calendar-drop-ghost'; 
    const CSS_SORTABLE_DRAG = 'sortable-drag';

    // PDF nastavenia
    const PDF_FONT_FILENAME = 'DejaVuSans.ttf';
    const PDF_FONT_INTERNAL_NAME = 'DejaVuSans';

    // Ikony
    const ICON_SWAP = '<i class="fas fa-exchange-alt swap-icon"></i>'; 
    const ICON_SUBSTITUTION = '<i class="fas fa-user-clock swap-icon"></i>'; 
    const UNICODE_SWAP = ' \u21C4'; 
    const UNICODE_SUBSTITUTION = ' \u27F2'; 

    // Pomocné premenné
    const monthNames = ["január", "február", "marec", "apríl", "máj", "jún", "júl", "august", "september", "október", "november", "december"];
    const dayNames = ["Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota", "Nedeľa"];

    let generatedPDFDataURI = null;
    let generatedPDFFilename = '';
    let customFontBase64 = null;

    // DOM Elementy (Cache)
    let elMonthSelect, elYearSelect, elExportButton, elSaveButton, elClearButton;
    let elCloseModalButton, elDownloadPdfButton;
    let elGroupsList, elCalendarContainer;
    let elPdfPreviewFrame, elPreviewModal;


    // --- SPUSTENIE INICIALIZÁCIE ---
    (async () => {
        // 1. Cache DOM elementov
        elMonthSelect = document.getElementById(ID_MONTH_SELECT);
        elYearSelect = document.getElementById(ID_YEAR_SELECT);
        elExportButton = document.getElementById(ID_EXPORT_BUTTON);
        elSaveButton = document.getElementById(ID_SAVE_BUTTON);
        elClearButton = document.getElementById(ID_CLEAR_BUTTON);
        elCloseModalButton = document.getElementById(ID_CLOSE_MODAL_BUTTON);
        elDownloadPdfButton = document.getElementById(ID_DOWNLOAD_PDF_BUTTON);
        elPdfPreviewFrame = document.getElementById(ID_PDF_PREVIEW_FRAME);
        elPreviewModal = document.getElementById(ID_PREVIEW_MODAL);
        elGroupsList = document.getElementById(ID_GROUPS_LIST);
        elCalendarContainer = document.getElementById(ID_CALENDAR_CONTAINER);
        
        if (!elMonthSelect || !elYearSelect || !elGroupsList || !elCalendarContainer) {
            console.error('Kritická chyba modulu Pohotovosť: Chýbajú základné HTML elementy.');
            return;
        }

        // 2. Načítať konfiguráciu (SYNCHRÓNNE Z CACHE)
        loadConfig();
        
        // 3. Načítať font (asynchrónne na pozadí)
        loadFontData();
        
        // 4. Inicializovať UI
        populateYearSelect();
        elMonthSelect.value = appState.selectedMonth;
        elYearSelect.value = appState.selectedYear;
        
        initSortableList(elGroupsList); 
        initEventListeners();
        
        // 5. Vykresliť
        render();
    })();

    function loadConfig() {
        let allEmpsArray = [];
        let zodpovedaPerson = null;
        let schvalujePerson = null;
        
        employeeSignatures = {}; 

        if (!employeesData || employeesData.size === 0) {
            console.warn("SCHD Modul: Žiadne dáta v cache (employeesData je prázdne).");
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

                if (empFunkcia === 'vedúci odboru') {
                    schvalujePerson = { meno: empMeno, funkcia: empFunkcia };
                }
                if (empFunkcia === 'vedúci oddelenia' && empOddelenie === 'OCOaKP') {
                    zodpovedaPerson = { meno: empMeno, funkcia: empFunkcia, oddelenie: empOddelenie };
                }
                
                const pohValue = data.poh;
                let groupName = null;

                if (String(pohValue) === "1") groupName = "Skupina 1";
                else if (String(pohValue) === "2") groupName = "Skupina 2";
                else if (String(pohValue) === "3") groupName = "Skupina 3";
                
                allEmpsArray.push({
                    id: data.id, 
                    meno: empMeno,
                    telefon: sluzobny_kontakt,
                    skupina: groupName,
                    coz: data.coz || "", 
                    funkcia: empFunkcia
                });
            });

            if (zodpovedaPerson) {
                employeeSignatures.zodpoveda = zodpovedaPerson;
            } else {
                employeeSignatures.zodpoveda = { meno: 'Meno (Nenájdené)', funkcia: 'vedúci oddelenia', oddelenie: 'OCOaKP' };
            }
            
            if (schvalujePerson) {
                employeeSignatures.schvaluje = schvalujePerson;
            } else {
                employeeSignatures.schvaluje = { meno: 'Meno (Nenájdené)', funkcia: 'vedúci odboru' };
            }

            allEmployees = allEmpsArray.filter(emp => emp.skupina);

            if (allEmployees.length === 0) {
                 showToast('V databáze sa nenašli žiadne pohotovostné skupiny (poh=1,2,3).', TOAST_TYPE.ERROR);
            }

            const groupsMap = new Map();
            allEmployees.forEach(emp => {
                if (!groupsMap.has(emp.skupina)) {
                    groupsMap.set(emp.skupina, []);
                }
                groupsMap.get(emp.skupina).push(emp);
            });

            employeeGroups = [];

            const sortEmployeesByLeadership = (a, b) => {
                const isALeader = (a.funkcia === 'vedúci odboru' || a.funkcia === 'vedúci oddelenia');
                const isBLeader = (b.funkcia === 'vedúci odboru' || b.funkcia === 'vedúci oddelenia');
                if (isALeader && !isBLeader) return -1;
                else if (!isALeader && isBLeader) return 1;
                else return a.meno.localeCompare(b.meno);
            };

            groupsMap.forEach((moznosti, skupina) => {
                const sortedMoznosti = moznosti.sort(sortEmployeesByLeadership);
                employeeGroups.push({ skupina: skupina, moznosti: sortedMoznosti });
            });
            
            employeeGroups.sort((a, b) => a.skupina.localeCompare(b.skupina));
            
            console.log(`SCHD Modul: Načítaných ${allEmployees.length} zamestnancov z cache.`);

        } catch (error) {
            console.error('Chyba pri spracovaní dát v loadConfig:', error);
            showToast('Chyba pri spracovaní dát zamestnancov.', TOAST_TYPE.ERROR);
        }
    }


    function populateYearSelect() {
        const currentYear = appState.selectedYear; 
        for (let year = currentYear - 5; year <= currentYear + 5; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            elYearSelect.appendChild(option);
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
        const { id, value } = e.target;
        if (id === ID_MONTH_SELECT) {
            appState.selectedMonth = parseInt(value);
        } else if (id === ID_YEAR_SELECT) {
            appState.selectedYear = parseInt(value);
        }
        render(); 
    }

    function handleCalendarDutyDblClick(e) {
        // --- ZABIJEME single-click timer, aby sa nespustilo hlásenie ---
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
        }
        
        // Zabránime výberu textu pri dvojkliku
        e.preventDefault();

        // Resetujeme pravý klik (ak bol)
        appState.firstSwapSelection = null; 

        const employeeItem = e.target.closest('.employee-item-calendar');
        if (!employeeItem) return;

        const { employeeId, weekKey } = employeeItem.dataset;
        const currentMonth = appState.selectedMonth;
        const currentYear = appState.selectedYear;

        // Vyčistíme staré označenia
        document.querySelectorAll(`.${CSS_SWAP_SELECTED}`).forEach(el => el.classList.remove(CSS_SWAP_SELECTED));
        
        // Ak klikneme znova na toho istého (odznačenie)
        if (appState.selectedDutyForSwap && 
            appState.selectedDutyForSwap.weekKey === weekKey && 
            appState.selectedDutyForSwap.originalId === employeeId &&
            appState.selectedDutyForSwap.month === currentMonth &&
            appState.selectedDutyForSwap.year === currentYear) {
            
            appState.selectedDutyForSwap = null;
            showToast('Výber služby pre zastupovanie zrušený.', TOAST_TYPE.INFO);
        } else {
            // --- ZAČIATOK ZASTUPOVANIA ---
            appState.selectedDutyForSwap = { 
                weekKey, 
                originalId: employeeId,
                month: currentMonth,
                year: currentYear 
            };
            
            // Pridáme triedu pre vizuálne zvýraznenie (červená)
            employeeItem.classList.add(CSS_SWAP_SELECTED);
            
            const originalEmployee = findEmployeeById(employeeId);
            const employeeName = originalEmployee ? originalEmployee.meno : 'Neznámy zamestnanec';
            
            showToast(`VYBRANÁ SLUŽBA PRE ZASTUPOVANIE: ${employeeName}. Teraz kliknite na náhradníka.`, TOAST_TYPE.INFO);
        }
        // POZNÁMKA: Tu nevoláme render(), pretože chceme len zvýrazniť element, nie prekresliť celý kalendár.
    }

    function handleEmployeeListClick(e) {
        const employeeListItem = e.target.closest(`.${CSS_GROUP_CARD} li`);
        if (!employeeListItem) return;

        if (!appState.selectedDutyForSwap) return; 

        const newEmployeeId = employeeListItem.dataset.id; 
        if (!newEmployeeId) return;
        
        const { weekKey, originalId, month, year } = appState.selectedDutyForSwap;

        if (newEmployeeId === originalId) {
            showToast('Náhradník nemôže byť tá istá osoba.', TOAST_TYPE.ERROR);
            return;
        }

        const stateKey = `${year}-${month}-${weekKey}`;

        if (!appState.serviceOverrides[stateKey]) {
            appState.serviceOverrides[stateKey] = {};
        }
        
        const newEmployee = findEmployeeById(newEmployeeId); 
        const newEmpName = newEmployee ? newEmployee.meno : 'Neznámy'; 

        appState.serviceOverrides[stateKey][originalId] = { 
            id: newEmployeeId, 
            meno: newEmpName, 
            type: 'sub' 
        };

        appState.selectedDutyForSwap = null;
        document.querySelectorAll(`.${CSS_SWAP_SELECTED}`).forEach(el => el.classList.remove(CSS_SWAP_SELECTED));
        showToast(`Služba bola úspešne prepísaná v týždni ${weekKey}.`, TOAST_TYPE.SUCCESS);

        render();
    }

    function handleCalendarDutyClick(e) {
        const target = e.target;
        const employeeItem = target.closest('.employee-item-calendar');
        
        // Ak klikneme mimo zamestnanca, zrušíme prípadný pravý klik (výmena)
        if (!employeeItem) {
            if (appState.firstSwapSelection) {
                appState.firstSwapSelection = null;
                document.querySelectorAll(`.${CSS_SWAP_SELECTED}`).forEach(el => el.classList.remove(CSS_SWAP_SELECTED));
                showToast('Výber pre výmenu zrušený.', TOAST_TYPE.INFO);
            }
            return;
        }

        // --- KĽÚČOVÁ ZMENA: Dáta načítame HNEĎ, nie až v časovači ---
        const { renderedId, employeeId, weekKey } = employeeItem.dataset;
        const clickedEmployeeId = renderedId || employeeId;

        if (!clickedEmployeeId || !weekKey) return;

        // Resetujeme predchádzajúci časovač (ak užívateľ kliká ako ďateľ)
        if (clickTimer) clearTimeout(clickTimer);

        // Spustíme logiku s oneskorením, ale s PREDNAČÍTANÝMI dátami
        clickTimer = setTimeout(() => {
            clickTimer = null; 

            // Logika zrušenia firstSwapSelection (ak bola aktívna)
            if (appState.firstSwapSelection) {
                appState.firstSwapSelection = null;
                document.querySelectorAll(`.${CSS_SWAP_SELECTED}`).forEach(el => el.classList.remove(CSS_SWAP_SELECTED));
                showToast('Výber pre výmenu zrušený.', TOAST_TYPE.INFO);
            }
            
            if (appState.selectedDutyForSwap) {
                // --- DOKONČENIE ZASTUPOVANIA (klik na náhradníka) ---
                const { weekKey: originalWeekKey, originalId, month, year } = appState.selectedDutyForSwap;

                // Kontrola: Nemôžem zastupovať sám seba
                if (clickedEmployeeId === originalId) {
                    showToast('Náhradník nemôže byť tá istá osoba.', TOAST_TYPE.ERROR);
                    return; 
                }

                const stateKey = `${year}-${month}-${originalWeekKey}`;
                if (!appState.serviceOverrides[stateKey]) appState.serviceOverrides[stateKey] = {};
                
                const newEmployee = findEmployeeById(clickedEmployeeId); 
                const newEmpName = newEmployee ? newEmployee.meno : 'Neznámy'; 

                appState.serviceOverrides[stateKey][originalId] = { 
                    id: clickedEmployeeId, 
                    meno: newEmpName, 
                    type: 'sub' 
                };

                appState.selectedDutyForSwap = null;
                document.querySelectorAll(`.${CSS_SWAP_SELECTED}`).forEach(el => el.classList.remove(CSS_SWAP_SELECTED));
                showToast(`Služba prepísaná na ${newEmpName}.`, TOAST_TYPE.SUCCESS);
                
                render(); // Prekreslíme kalendár

            } else {
                // --- HLÁSENIE (Reporting) ---
                const idForReporting = clickedEmployeeId;
                const currentMonth = appState.selectedMonth;
                const currentYear = appState.selectedYear;
                const stateKey = `${currentYear}-${currentMonth}-${weekKey}`;

                if (!appState.reporting[stateKey]) {
                    appState.reporting[stateKey] = [];
                }
                const reportingArray = appState.reporting[stateKey];
                
                const index = reportingArray.indexOf(idForReporting);
                if (index > -1) {
                    reportingArray.splice(index, 1); // Odstrániť hlásenie
                } else {
                    reportingArray.push(idForReporting); // Pridať hlásenie

                    const empObj = findEmployeeById(idForReporting);
                    const empName = empObj ? empObj.meno : 'Neznámy';
                    showToast(`Hlásenia spracúva ${empName}`, TOAST_TYPE.INFO);
                    
                }
                
                render(); // Prekreslíme kalendár
            }
        }, 250); // Čas na čakanie na dvojklik
    }

    function handleCalendarSwapClick(e) {
        e.preventDefault();
        
        const employeeItem = e.target.closest('.employee-item-calendar');
        if (!employeeItem) return;

        const { renderedId, employeeId, originalId, weekKey } = employeeItem.dataset;
        const clickedRenderedId = renderedId || employeeId; 
        const clickedOriginalId = originalId || employeeId; 
        const clickedWeekKey = weekKey;
        const currentMonth = appState.selectedMonth;
        const currentYear = appState.selectedYear;

        if (appState.selectedDutyForSwap) {
            appState.selectedDutyForSwap = null;
            document.querySelectorAll(`.${CSS_SWAP_SELECTED}`).forEach(el => el.classList.remove(CSS_SWAP_SELECTED));
        }
        
        if (!appState.firstSwapSelection) {
            // PRVÝ KLIK
            appState.firstSwapSelection = { 
                weekKey: clickedWeekKey, 
                originalId: clickedOriginalId, 
                renderedId: clickedRenderedId, 
                month: currentMonth,
                year: currentYear
            };
            
            document.querySelectorAll(`.${CSS_SWAP_SELECTED}`).forEach(el => el.classList.remove(CSS_SWAP_SELECTED));
            employeeItem.classList.add(CSS_SWAP_SELECTED);
            // 1. Zistíme meno zamestnanca podľa ID (použijeme renderedId, teda toho, kto je tam práve zobrazený)
            const empObj = findEmployeeById(clickedRenderedId);
            const empName = empObj ? empObj.meno : 'Neznámy';

            // 2. Upravená notifikácia s menom
            showToast(`Vybraný prvý zamestnanec ${empName}. Kliknite pravým na druhého pre výmenu.`, TOAST_TYPE.INFO);
            // --- NOVÁ ÚPRAVA KONIEC ---

        } else {
            // DRUHÝ KLIK
            const first = appState.firstSwapSelection;
            const second = { 
                weekKey: clickedWeekKey, 
                originalId: clickedOriginalId, 
                renderedId: clickedRenderedId,
                month: currentMonth,
                year: currentYear
            };

            appState.firstSwapSelection = null;
            document.querySelectorAll(`.${CSS_SWAP_SELECTED}`).forEach(el => el.classList.remove(CSS_SWAP_SELECTED));

            if (first.weekKey === second.weekKey && 
                first.originalId === second.originalId &&
                first.month === second.month &&
                first.year === second.year) {
                showToast('Výmena zrušená (kliknuté na toho istého).', TOAST_TYPE.INFO);
                return;
            }

            const firstEmployeeToMove = first.renderedId;
            const secondEmployeeToMove = second.renderedId;

            const firstStateKey = `${first.year}-${first.month}-${first.weekKey}`;
            const secondStateKey = `${second.year}-${second.month}-${second.weekKey}`;

            if (!appState.serviceOverrides[firstStateKey]) appState.serviceOverrides[firstStateKey] = {};
            if (!appState.serviceOverrides[secondStateKey]) appState.serviceOverrides[secondStateKey] = {};
            
            const firstEmpData = findEmployeeById(firstEmployeeToMove);
            const secondEmpData = findEmployeeById(secondEmployeeToMove);
            const firstEmpName = firstEmpData ? firstEmpData.meno : 'Neznámy';
            const secondEmpName = secondEmpData ? secondEmpData.meno : 'Neznámy';

            // Výmena 1
            appState.serviceOverrides[firstStateKey][first.originalId] = { 
                id: secondEmployeeToMove, 
                meno: secondEmpName,
                type: 'swap' 
            };
            
            // Výmena 2
            appState.serviceOverrides[secondStateKey][second.originalId] = { 
                id: firstEmployeeToMove, 
                meno: firstEmpName, 
                type: 'swap' 
            };

            showToast(`Zamestnanci ${firstEmpName} a ${secondEmpName} boli úspešne vymenení.`, TOAST_TYPE.SUCCESS);
            render(); 
        }
    }

    function clearSchedule() {
        appState.dutyAssignments = {};
        appState.reporting = {};
        appState.serviceOverrides = {};
        appState.selectedDutyForSwap = null;
        appState.firstSwapSelection = null; 
        render(); 
        showToast('Celý rozpis služieb bol vymazaný.', TOAST_TYPE.INFO);
    }

    function findEmployeeById(id) {
        return allEmployees.find(emp => emp.id === id);
    }

    function render() {
        renderGroupLists();
        renderCalendar();
    }

    function renderGroupLists() {
        const assignedGroupNames = new Set();
        
        Object.values(appState.dutyAssignments).forEach(groupArray => {
            if (groupArray && groupArray.length > 0) {
                const employee = findEmployeeById(groupArray[0].id); 
                if (employee && employee.skupina) {
                    assignedGroupNames.add(employee.skupina);
                }
            }
        });
        
        const allReportingIds = new Set(Object.values(appState.reporting).flat());

        let html = '';
        employeeGroups.forEach(group => {
            const isAssigned = assignedGroupNames.has(group.skupina);
            const employeeIds = JSON.stringify(group.moznosti.map(emp => emp.id)); 
            
            html += `
                <div class="${CSS_GROUP_CARD} ${isAssigned ? CSS_IS_ASSIGNED : ''}" 
                     data-group-id="${group.skupina}" 
                     data-group-ids='${employeeIds}' 
                     data-group-name="${group.skupina}">
                    <h3>${group.skupina}</h3>
                    <ul>
                        ${group.moznosti.map(emp => {
                            const isReporting = allReportingIds.has(emp.id);
                            return `<li data-id="${emp.id}" class="${isReporting ? CSS_REPORTING : ''}">${emp.meno}</li>`;
                        }).join('')}
                    </ul>
                </div>
            `;
        });
        elGroupsList.innerHTML = html;
        initSortableList(elGroupsList);
    }


    function renderCalendar() {
        const currentMonth = appState.selectedMonth;
        const currentYear = appState.selectedYear;
        const weeks = getWeeksForMonth(currentYear, currentMonth);
        let htmlContent = '';

        weeks.forEach(week => {
            const weekKey = `${week.year}-${week.weekNumber}`;
            const stateKey = `${currentYear}-${currentMonth}-${weekKey}`;
            const startDateStr = `${String(week.start.getDate()).padStart(2, '0')}.${String(week.start.getMonth() + 1).padStart(2, '0')}.`;
            const endDateStr = `${String(week.end.getDate()).padStart(2, '0')}.${String(week.end.getMonth() + 1).padStart(2, '0')}.`;
            
            const assignedGroup = appState.dutyAssignments[stateKey];
            
            htmlContent += `
                <div class="${CSS_WEEK_CARD}" data-week-key="${weekKey}">
                    <div class="duty-week-header">
                        <h4>Týždeň ${week.weekNumber}</h4>
                        <span>${startDateStr} - ${endDateStr}</span>
                    </div>
            `;

            if (assignedGroup && assignedGroup.length > 0) {
                const fullAssignedGroup = assignedGroup.map(emp => findEmployeeById(emp.id)).filter(Boolean);
                const groupName = fullAssignedGroup.length > 0 ? fullAssignedGroup[0].skupina : 'Neznáma';
                const reportersForWeek = appState.reporting[stateKey] || [];

                htmlContent += `<div class="duty-week-assigned-group" data-group-name="${groupName}">`;
                
                fullAssignedGroup.forEach(employee => {
                    let employeeToRender = employee;
                    const overridesForWeek = appState.serviceOverrides[stateKey];
                    const overrideData = (overridesForWeek && overridesForWeek[employee.id]) ? overridesForWeek[employee.id] : null;
                    let iconHtml = ''; 

                    if (overrideData) {
                        const newEmployee = findEmployeeById(overrideData.id);
                        if (newEmployee) employeeToRender = newEmployee;
                        
                        if (overrideData.type === 'sub') iconHtml = ICON_SUBSTITUTION;
                        else if (overrideData.type === 'swap') iconHtml = ICON_SWAP;
                        else iconHtml = ICON_SWAP; 
                    }

                    const isReporting = reportersForWeek.includes(employeeToRender.id);
                    
                    const isSwapSelected_Replace = appState.selectedDutyForSwap && 
                                           appState.selectedDutyForSwap.weekKey === weekKey &&
                                           appState.selectedDutyForSwap.originalId === employee.id &&
                                           appState.selectedDutyForSwap.month === currentMonth &&
                                           appState.selectedDutyForSwap.year === currentYear;
                    
                    const isSwapSelected_Swap = appState.firstSwapSelection &&
                                           appState.firstSwapSelection.weekKey === weekKey &&
                                           appState.firstSwapSelection.originalId === employee.id &&
                                           appState.firstSwapSelection.month === currentMonth &&
                                           appState.firstSwapSelection.year === currentYear;

                    const swapClass = (isSwapSelected_Replace || isSwapSelected_Swap) ? CSS_SWAP_SELECTED : '';

                    htmlContent += `
                        <div class="employee-item-calendar ${isReporting ? CSS_REPORTING : ''} ${swapClass}"
                             data-employee-id="${employee.id}" 
                             data-original-id="${employee.id}"
                             data-rendered-id="${employeeToRender.id}"
                             data-week-key="${weekKey}">
                            ${employeeToRender.meno}
                            ${iconHtml}
                        </div>
                    `;
                });
                htmlContent += `</div>`; 
            } else {
                htmlContent += `
                    <div class="${CSS_WEEK_DROPZONE}" data-week-key="${weekKey}">
                        <i class="fas fa-file-import"></i>
                        <span>Presuňte sem skupinu</span>
                    </div>
                `;
            }
            htmlContent += `</div>`; 
        });

        elCalendarContainer.innerHTML = htmlContent;
        initCalendarSortable();
    }


    function getWeeksForMonth(year, month) {
        const weeks = [];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        let currentDay = new Date(firstDay);

        while (currentDay <= lastDay) {
            const weekInfo = getWeekNumber(currentDay); 
            const weekKey = `${weekInfo.year}-${weekInfo.week}`;
            
            const dayOfWeek = (currentDay.getDay() + 6) % 7;
            const monday = new Date(currentDay);
            monday.setDate(monday.getDate() - dayOfWeek);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);

            const weekStart = new Date(Math.max(firstDay.getTime(), monday.getTime()));
            const weekEnd = new Date(Math.min(lastDay.getTime(), sunday.getTime()));
            
            if (!weeks.some(w => w.key === weekKey)) {
                weeks.push({
                    weekNumber: weekInfo.week,
                    year: weekInfo.year,
                    key: weekKey,
                    start: weekStart,
                    end: weekEnd
                });
            }
            currentDay = new Date(sunday);
            currentDay.setDate(currentDay.getDate() + 1);
        }
        return weeks;
    }

    function initSortableList(listElement) {
        if (listElement) {
            if (listElement.sortableInstance) listElement.sortableInstance.destroy();
            
            listElement.sortableInstance = new Sortable(listElement, {
                animation: 150,
                ghostClass: CSS_SORTABLE_GHOST,
                dragClass: CSS_SORTABLE_DRAG,
                group: { name: 'shared', pull: 'clone', put: false }, 
                draggable: `.${CSS_GROUP_CARD}`,
                handle: 'h3',
            });
        }
    }

    function initCalendarSortable() {
        const calendarCells = document.querySelectorAll(`.${CSS_WEEK_DROPZONE}`);
        calendarCells.forEach(cell => {
            if (cell.sortableInstance) cell.sortableInstance.destroy();

            cell.sortableInstance = new Sortable(cell, {
                group: 'shared',
                animation: 150,
                ghostClass: CSS_CALENDAR_DROP_GHOST,
                onAdd: handleDragToCalendar, 
                onStart: () => { document.querySelectorAll(`.${CSS_WEEK_DROPZONE}`).forEach(d => d.classList.add('drag-active')); },
                onEnd: () => { document.querySelectorAll(`.${CSS_WEEK_DROPZONE}`).forEach(d => d.classList.remove('drag-active')); }
            });
        });
    }

    function handleDragToCalendar(evt) {
        const { item, to } = evt; 
        const startWeekKey = to.dataset.weekKey; 
        
        if (!startWeekKey) return;

        const isGroupDrag = item.classList.contains(CSS_GROUP_CARD);
        if (!isGroupDrag) {
            item.remove();
            return; 
        }

        let employeesToAssign = [];
        try {
            const employeeIds = JSON.parse(item.dataset.groupIds); 
            employeesToAssign = employeeIds.map(findEmployeeById).filter(Boolean);
        } catch (e) {
            console.error("Chyba pri parsovaní data-group-ids:", e);
            item.remove();
            return;
        }
        item.remove(); 

        const allVisibleWeekKeys = [];
        document.querySelectorAll(`.${CSS_WEEK_CARD}, .${CSS_WEEK_DROPZONE}`).forEach(el => {
            if (el.dataset.weekKey && !allVisibleWeekKeys.includes(el.dataset.weekKey)) {
                allVisibleWeekKeys.push(el.dataset.weekKey);
            }
        });

        const startIndex = allVisibleWeekKeys.indexOf(startWeekKey);
        const { selectedMonth, selectedYear } = appState;

        if (startIndex === -1) {
            const stateKey = `${selectedYear}-${selectedMonth}-${startWeekKey}`;
            appState.dutyAssignments[stateKey] = employeesToAssign.map(emp => ({
                id: emp.id, meno: emp.meno, skupina: emp.skupina 
            }));
            render();
            return;
        }

        let currentGroupToAssign = employeesToAssign;

        for (let i = startIndex; i < allVisibleWeekKeys.length; i++) {
            const currentKey = allVisibleWeekKeys[i];
            const stateKey = `${selectedYear}-${selectedMonth}-${currentKey}`;
            
            appState.dutyAssignments[stateKey] = currentGroupToAssign.map(emp => ({
                id: emp.id, meno: emp.meno, skupina: emp.skupina 
            }));

            const currentGroupNum = parseInt(currentGroupToAssign[0].skupina.split(' ')[1]);
            const nextGroupNum = (currentGroupNum % 3) + 1; 
            const nextGroupName = `Skupina ${nextGroupNum}`;
            
            const nextGroup = employeeGroups.find(g => g.skupina === nextGroupName);
            if (nextGroup) {
                currentGroupToAssign = nextGroup.moznosti;
            } else {
                break; 
            }
        }
        render(); 
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const isoYear = d.getUTCFullYear();
        const yearStart = new Date(Date.UTC(isoYear, 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return { week: weekNo, year: isoYear };
    }

    async function showSchedulePreview() {
        // Kontrola oprávnenia (pre istotu, ak by niekto obišiel UI)
        if (!Permissions.canViewModule(_activeUser, 'pohotovost-module')) {
             showToast("Nemáte oprávnenie na túto akciu.", TOAST_TYPE.ERROR);
             return;
        }

        const currentMonth = appState.selectedMonth;
        const currentYear = appState.selectedYear;
        
        const keysForCurrentMonth = Object.keys(appState.dutyAssignments).filter(key => 
            key.startsWith(`${currentYear}-${currentMonth}-`)
        );
        
        if (keysForCurrentMonth.length === 0) {
            showToast("Priraďte aspoň jedného zamestnanca.", TOAST_TYPE.ERROR);
            return;
        }
        
        showToast('Generujem náhľad PDF...', TOAST_TYPE.INFO);

        if (!customFontBase64) {
            await loadFontData(); 
            if (!customFontBase64) showToast('Font sa nepodarilo načítať.', TOAST_TYPE.ERROR);
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            
            if (customFontBase64) {
                doc.addFileToVFS(PDF_FONT_FILENAME, customFontBase64);
                doc.addFont(PDF_FONT_FILENAME, PDF_FONT_INTERNAL_NAME, 'normal');
                doc.setFont(PDF_FONT_INTERNAL_NAME, 'normal'); 
            }

            const monthName = monthNames[currentMonth];
            
            doc.setFontSize(14);
            doc.text(`Rozpis pohotovosti - OKR BB`, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
            const monthNameCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
            doc.text(`${monthNameCapitalized} ${currentYear}`, doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });
            
            const tableHead = [['Týždeň', 'Dátum', 'Meno', 'Telefón', 'Σ', 'Poznámka']];
            const tableBody = [];
            const lightGray = [230, 230, 230];
            const weeks = getWeeksForMonth(currentYear, currentMonth);

            weeks.forEach(week => {
                const weekKey = week.key; 
                const weekNumber = week.weekNumber;
                const stateKey = `${currentYear}-${currentMonth}-${weekKey}`;
                
                const activeGroup = appState.dutyAssignments[stateKey] || [];
                const reportersForWeek = appState.reporting[stateKey] || [];
                const overridesForWeek = appState.serviceOverrides[stateKey];

                const startDateStr = `${String(week.start.getDate()).padStart(2, '0')}.${String(week.start.getMonth() + 1).padStart(2, '0')}.`;
                const endDateStr = `${String(week.end.getDate()).padStart(2, '0')}.${String(week.end.getMonth() + 1).padStart(2, '0')}.`;
                const dateRange = `${startDateStr} - ${endDateStr}`;

                const startDayName = dayNames[(week.start.getDay() + 6) % 7].substring(0, 2).toLowerCase();
                const endDayName = dayNames[(week.end.getDay() + 6) % 7].substring(0, 2).toLowerCase();
                let dayRange = `${startDayName}-${endDayName}`;
                if (startDayName === endDayName) dayRange = startDayName;
                if (startDayName === 'po' && endDayName === 'ne') dayRange = 'po-ne';

                const daysInCycle = Math.round((week.end.getTime() - week.start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                let firstRow = true;
                
                if (activeGroup.length > 0) {
                    activeGroup.forEach((person) => {
                        let employeeToRender = findEmployeeById(person.id); 
                        let originalId = person.id;
                        let iconUnicode = ''; 
                        
                        const overrideData = (overridesForWeek && overridesForWeek[originalId]) ? overridesForWeek[originalId] : null;
                        if (overrideData) {
                            const newEmployee = findEmployeeById(overrideData.id);
                            if (newEmployee) employeeToRender = newEmployee;
                            if (overrideData.type === 'sub') iconUnicode = UNICODE_SUBSTITUTION;
                            else if (overrideData.type === 'swap') iconUnicode = UNICODE_SWAP;
                        }
                        
                        if (!employeeToRender) return; 

                        const employeeName = employeeToRender.meno + iconUnicode;
                        const employeePhone = employeeToRender.telefon || '';
                        const poznamka = (reportersForWeek.includes(employeeToRender.id)) ? 'hlásenia' : '';

                        if (firstRow) {
                            tableBody.push([ `Týždeň ${weekNumber}`, `${dateRange}\n${dayRange}`, employeeName, employeePhone, '', poznamka ]);
                            firstRow = false;
                        } else {
                             tableBody.push([ '', '', employeeName, employeePhone, '', poznamka ]);
                        }
                    });
                    tableBody.push([
                        { content: '', styles: { fillColor: lightGray } },
                        { content: '', styles: { fillColor: lightGray } },
                        { content: '', styles: { fillColor: lightGray } },
                        { content: '', styles: { fillColor: lightGray } },
                        { content: daysInCycle.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: lightGray } },
                        { content: '', styles: { fillColor: lightGray } }
                    ]);
                } else {
                    tableBody.push([ `Týždeň ${weekNumber}`, `${dateRange}\n${dayRange}`, '(Voľný týždeň)', '', '', '' ]);
                }
            });

            doc.autoTable({
                head: tableHead,
                body: tableBody,
                startY: 30, 
                theme: 'grid',
                headStyles: { fillColor: [0, 51, 102], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
                styles: { font: customFontBase64 ? PDF_FONT_INTERNAL_NAME : 'helvetica', fontSize: 10 },
                columnStyles: { 4: { halign: 'center' } },
                didParseCell: function (data) {
                    if ((data.column.index === 1 || data.column.index === 0) && data.cell.section === 'body') {
                        data.cell.styles.valign = 'middle';
                    }
                }
            });

            const finalY = doc.lastAutoTable.finalY;
            doc.setFontSize(10);
            
            doc.text('Zodpovedá:', 40, finalY + 20);
            doc.text(employeeSignatures.zodpoveda.meno, 40, finalY + 27);
            const zodpovedaLine = [employeeSignatures.zodpoveda.funkcia, employeeSignatures.zodpoveda.oddelenie].filter(Boolean).join(' ');
            doc.text(zodpovedaLine, 40, finalY + 34);
            
            doc.text('Schvaľuje:', doc.internal.pageSize.getWidth() - 80, finalY + 20);
            doc.text(employeeSignatures.schvaluje.meno, doc.internal.pageSize.getWidth() - 80, finalY + 27);
            doc.text(employeeSignatures.schvaluje.funkcia, doc.internal.pageSize.getWidth() - 80, finalY + 34);

            if (generatedPDFDataURI && generatedPDFDataURI.startsWith('blob:')) URL.revokeObjectURL(generatedPDFDataURI);
            
            generatedPDFDataURI = doc.output('bloburl');
            generatedPDFFilename = `rozpis_pohotovosti_${monthName}_${currentYear}.pdf`;

            elPdfPreviewFrame.src = generatedPDFDataURI + '#toolbar=0&navpanes=0';
            elPreviewModal.classList.remove('hidden');

        } catch (err) {
            console.error("Chyba pri generovaní PDF:", err);
            showToast("Nepodarilo sa vygenerovať PDF náhľad.", TOAST_TYPE.ERROR);
        }
    }

    async function saveScheduleToDB() {
        // Kontrola oprávnenia pre uloženie (zápis)
        // Keďže modul je dostupný len pre vedúcich (kontrolované v mainWizard.js a Permissions.canViewModule),
        // môžeme použiť canViewModule ako základnú kontrolu.
        if (!Permissions.canViewModule(_activeUser, 'pohotovost-module')) {
            showToast('Nemáte oprávnenie na uloženie rozpisu.', TOAST_TYPE.ERROR);
            return;
        }

        const { selectedYear, selectedMonth, dutyAssignments, serviceOverrides, reporting } = appState;
        const currentMonthName = monthNames[selectedMonth];
        const docId = `${selectedYear}-${selectedMonth}`; 
        const relevantWeeks = getWeeksForMonth(selectedYear, selectedMonth);
        const relevantWeekKeys = new Set(relevantWeeks.map(w => w.key)); 

        const filteredAssignments = {};
        const filteredOverrides = {};
        const filteredReporting = {};

        relevantWeekKeys.forEach(weekKey => {
            const stateKey = `${selectedYear}-${selectedMonth}-${weekKey}`;
            if (dutyAssignments[stateKey]) filteredAssignments[weekKey] = dutyAssignments[stateKey];
            if (serviceOverrides[stateKey]) filteredOverrides[weekKey] = serviceOverrides[stateKey];
            if (reporting[stateKey]) filteredReporting[weekKey] = reporting[stateKey];
        });

        const scheduleData = {
            year: selectedYear,
            month: selectedMonth, 
            monthName: currentMonthName,
            lastSaved: firebase.firestore.FieldValue.serverTimestamp(), 
            dutyAssignments: filteredAssignments, 
            serviceOverrides: filteredOverrides,
            reporting: filteredReporting
        };

        try {
            await db.collection("publishedSchedules").doc(docId).set(scheduleData);
            showToast('Rozpis bol úspešne uložený do databázy.', TOAST_TYPE.SUCCESS);
        } catch (error) {
            console.error("saveScheduleToDB zlyhalo:", error);
            throw new Error('Nepodarilo sa uložiť rozpis do databázy.');
        }
    }

    async function downloadSchedulePDF() {
        if (!generatedPDFDataURI) {
            showToast('Chyba sťahovania. Vygenerujte náhľad znova.', TOAST_TYPE.ERROR);
            return;
        }

        try {
            showToast('Ukladám rozpis do databázy...', TOAST_TYPE.INFO);
            await saveScheduleToDB(); 
        } catch (error) {
            console.error("Chyba pri ukladaní do DB:", error);
            showToast('Chyba ukladania do DB, PDF sa napriek tomu sťahuje.', TOAST_TYPE.ERROR);
        }

        const a = document.createElement('a');
        a.href = generatedPDFDataURI; 
        a.download = generatedPDFFilename; 
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => { showToast('PDF súbor sa sťahuje...', TOAST_TYPE.SUCCESS); }, 500);
    }

    function closeModal() {
        if (!elPreviewModal) return;
        elPreviewModal.classList.add('hidden');
        elPdfPreviewFrame.src = 'about:blank';
        if (generatedPDFDataURI && generatedPDFDataURI.startsWith('blob:')) URL.revokeObjectURL(generatedPDFDataURI);
        generatedPDFDataURI = null; 
    }

    
    async function generateDocxReport() {
        // Kontrola oprávnenia
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
            if (!response.ok) throw new Error(`HTTP chyba! status: ${response.status}`);
            const fontBuffer = await response.arrayBuffer();
            customFontBase64 = arrayBufferToBase64(fontBuffer);
            console.log('Font DejaVuSans načítaný.');
        } catch (error) {
            console.error(`Chyba pri načítaní fontu ${FONT_URL}:`, error);
        }
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
        return window.btoa(binary);
    }
}