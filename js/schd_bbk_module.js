/* schd_bbk_module.js - Modular SDK Ready (Store Integrated) */
import { store } from './store.js'; // CENTRÁLNY STORE
import { showToast, TOAST_TYPE } from './utils.js';
import { lazyLoader } from './lazy_loader.js'; // ✅ LAZY LOADING
import { IDs } from './id-registry.js';

/* ======================================= */
/* MODUL: Rozpis pohotovosti BB Kraj       */
/* (schd_bbk_module.js)                 */
/* ======================================= */

let selectedFiles = []; // Pole pre uchovanie objektov File

export function initializeBBKModule() {
    console.log('Inicializujem modul BB Kraj (Smart Generator)...');
    
    // Získanie usera zo Store (ak by sme chceli v budúcnosti logovať akcie)
    // const user = store.getUser(); 
    
    // Nastavenie predvoleného dátumu (aktuálny týždeň a rok)
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentWeek = getIsoWeekNumber(today);

    const yearInput = document.getElementById(IDs.BBK.YEAR_INPUT);
    const weekInput = document.getElementById(IDs.BBK.WEEK_INPUT);

    if (yearInput) yearInput.value = currentYear;
    if (weekInput) weekInput.value = currentWeek;

    setupEventListeners();
    updateFileListUI();
}

function setupEventListeners() {
    const dropZone = document.getElementById(IDs.BBK.DROP_ZONE);
    const fileInput = document.getElementById(IDs.BBK.FILE_INPUT);
    const processBtn = document.getElementById(IDs.BBK.PROCESS_BTN);
    const clearBtn = document.getElementById(IDs.BBK.CLEAR_BTN);

    if (!dropZone || !fileInput) return;

    // 1. Kliknutie a Drag&Drop
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });

    // 2. Input change (výber súborov)
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });

    // 3. Tlačidlá
    if (processBtn) {
        // Odstránenie starého listenera cez cloneNode
        const newProcessBtn = processBtn.cloneNode(true);
        processBtn.parentNode.replaceChild(newProcessBtn, processBtn);
        newProcessBtn.addEventListener('click', processFiles);
    }

    if (clearBtn) {
        // Odstránenie starého listenera
        const newClearBtn = clearBtn.cloneNode(true);
        clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
        newClearBtn.addEventListener('click', clearAll);
    }
}

/**
 * Spracuje vybrané súbory a aktualizuje UI zoznam
 */
function handleFiles(files) {
    // Pridáme nové súbory k existujúcim
    selectedFiles = Array.from(files);
    updateFileListUI();
}

function updateFileListUI() {
    const listContainer = document.getElementById(IDs.BBK.FILE_LIST);
    const ul = document.getElementById(IDs.BBK.FILE_LIST_UL);
    const processBtn = document.getElementById(IDs.BBK.PROCESS_BTN);
    const dropZone = document.getElementById(IDs.BBK.DROP_ZONE);

    if (!ul) return;
    ul.innerHTML = "";

    if (selectedFiles.length > 0) {
        listContainer.classList.remove('hidden');
        dropZone.classList.add('file-selected');
        
        selectedFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.id = `bbk-file-row-${index}`;
            li.style.cssText = "padding: 5px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;";
            
            li.innerHTML = `
                <span>📄 ${file.name}</span>
                <span id="bbk-status-icon-${index}" style="font-size: 1.2rem;">⏳</span>
            `;
            ul.appendChild(li);
        });

        if (processBtn) processBtn.disabled = false;
    } else {
        listContainer.classList.add('hidden');
        dropZone.classList.remove('file-selected');
        if (processBtn) processBtn.disabled = false; // Necháme enabled, ale checkneme v processFiles
    }
}

/**
 * Vymaže stav modulu
 */
function clearAll() {
    selectedFiles = [];
    const fileInput = document.getElementById(IDs.BBK.FILE_INPUT);
    const statusMsg = document.getElementById(IDs.BBK.STATUS_MSG);
    
    if (fileInput) fileInput.value = '';
    if (statusMsg) statusMsg.textContent = '';
    
    updateFileListUI();
    showToast('Výber súborov bol vymazaný.', TOAST_TYPE.INFO);
}

/**
 * Hlavná logika spracovania
 */
async function processFiles() {
    const statusMsg = document.getElementById(IDs.BBK.STATUS_MSG);
    const yearInput = document.getElementById(IDs.BBK.YEAR_INPUT);
    const weekInput = document.getElementById(IDs.BBK.WEEK_INPUT);
    const processBtn = document.getElementById(IDs.BBK.PROCESS_BTN);
  
    if (!selectedFiles || selectedFiles.length === 0) {
        showToast('Prosím nahrajte aspoň jeden súbor.', TOAST_TYPE.ERROR);
        return;
    }
    
    const inputYear = parseInt(yearInput.value);
    const inputWeek = parseInt(weekInput.value);

    if (!inputYear || !inputWeek) {
        showToast("Prosím skontrolujte zadaný rok a týždeň.", TOAST_TYPE.ERROR);
        return;
    }

    // --- START ANIMÁCIE ---
    const originalContent = processBtn.innerHTML;
    processBtn.innerHTML = '<i class="fas fa-spinner"></i> Spracovávam...';
    processBtn.classList.add('btn-loading');
    processBtn.disabled = true;

    if (statusMsg) statusMsg.textContent = ""; 

    // ✅ LAZY LOADING: Načítame XLSX len pri spracovaní súborov
    let XLSX;
    try {
        showToast('Načítavam Excel knižnicu...', TOAST_TYPE.INFO, 1000);
        const libs = await lazyLoader.loadExcelBundle();
        XLSX = libs.XLSX;
    } catch (error) {
        console.error('Chyba pri načítaní XLSX knižnice:', error);
        showToast('Chyba: Excel knižnica sa nepodarila načítať.', TOAST_TYPE.ERROR);
        processBtn.innerHTML = originalContent;
        processBtn.classList.remove('btn-loading');
        processBtn.disabled = false;
        return;
    }

    let rawData = [];
    let successCount = 0;
    let errorCount = 0;

    try {
        for (let i = 0; i < selectedFiles.length; i++) {
            let file = selectedFiles[i];
            const rowElem = document.getElementById(`bbk-file-row-${i}`);
            const iconElem = document.getElementById(`bbk-status-icon-${i}`);

            if(rowElem) {
                rowElem.style.color = "inherit";
            }

            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                let headerRowIndex = -1;
                let colIndexStart = 0;

                for (let r = 0; r < jsonData.length; r++) {
                    const row = jsonData[r];
                    for (let c = 0; c < row.length; c++) {
                        if (row[c]) {
                            const cellText = String(row[c]).trim().toLowerCase();
                            if (cellText.includes("okresný") && cellText.includes("úrad")) {
                                headerRowIndex = r;
                                colIndexStart = c;
                                break;
                            }
                        }
                    }
                    if (headerRowIndex !== -1) break;
                }

                if (headerRowIndex === -1) {
                    throw new Error("Tabuľka s hlavičkou 'Okresný úrad' nebola nájdená.");
                }

                for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
                    const row = jsonData[r];
                    const valUrad = row[colIndexStart];
                    const valMeno = row[colIndexStart + 1];
                    const valPriezvisko = row[colIndexStart + 2];
                    
                    const lowerUrad = String(valUrad || "").toLowerCase().trim();

                    if (lowerUrad.includes("schválil") || lowerUrad.includes("vypracoval") || lowerUrad.includes("dátum") || lowerUrad.includes("poznámka:")) break;
                    if (!valMeno && !String(valPriezvisko).trim()) continue;
                    if (lowerUrad.includes("okresný úrad")) continue; 

                    rawData.push({
                        urad: valUrad,
                        meno: valMeno,
                        priezvisko: valPriezvisko,
                        pevna: row[colIndexStart + 3],
                        mobil: row[colIndexStart + 4],
                        pritomnost: row[colIndexStart + 5],
                        poznamka: row[colIndexStart + 6] || ""
                    });
                }

                if (iconElem) {
                    iconElem.textContent = "✅";
                    iconElem.style.color = "#48BB78";
                }
                
                successCount++;

            } catch (err) {
                console.error(`Chyba pri súbore ${file.name}:`, err);
                errorCount++;
                
                if (iconElem) {
                    iconElem.textContent = "❌";
                    iconElem.style.color = "#E53E3E";
                }
                if (rowElem) {
                    rowElem.title = err.message || "Chyba čítania";
                }

                showToast(`Chyba pri spracovaní súboru "${file.name}": ${err.message}`, TOAST_TYPE.ERROR);
            }
        } 

        if (rawData.length === 0) {
            showToast("Žiadne platné dáta neboli spracované.", TOAST_TYPE.ERROR);
            if (processBtn) processBtn.disabled = false;
            return;
        }

        if (errorCount > 0) {
            showToast(`Spracovanie dokončené s chybami (${errorCount} súborov zlyhalo).`, TOAST_TYPE.INFO);
        }

        rawData.sort((a, b) => String(a.urad).localeCompare(String(b.urad), 'sk'));

        let finalRows = rawData.map((item, index) => {
            return [
                "",         
                index + 1,  
                item.urad,
                item.meno,
                item.priezvisko,
                item.pevna,
                item.mobil,
                item.pritomnost,
                item.poznamka
            ];
        });

        const dateInfo = getDateRangeFromWeek(inputYear, inputWeek);

        let wsData = [
            [null, "služobná pohotovosť zamestnancov OKR OÚ BB"], 
            [], 
            [], 
            [null, null, null, null, "dátum od", "do", null, "týždeň"], 
            [null, null, null, null, dateInfo.start, dateInfo.end, null, inputWeek], 
            [] 
        ];
        
        const tableHeaders = ["", "P.č.", "Okresný úrad", "Meno", "Priezvisko", "Pevná linka", "Mobil", "Prítomnosť vedúceho na pracovisku", "Poznámka"];
        wsData.push(tableHeaders);
        finalRows.forEach(r => wsData.push(r));

        const ws = XLSX.utils.aoa_to_sheet(wsData);

        if(!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: {r:0, c:1}, e: {r:0, c:8} }); 

        ws['!cols'] = [
            {wch: 5}, {wch: 5}, {wch: 25}, {wch: 15}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 30}, {wch: 25}
        ];

        const setStyle = (cellRef, styleObj) => {
            if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
            ws[cellRef].s = styleObj;
        };

        setStyle('B1', {
            font: { bold: true, sz: 14 },
            alignment: { horizontal: "center", vertical: "center" }
        });

        const subHeaderStyle = {
            font: { bold: true },
            alignment: { wrapText: true, horizontal: "center", vertical: "center" }
        };
        ['E4', 'F4', 'H4'].forEach(cell => setStyle(cell, subHeaderStyle));

        const dateStyle = { alignment: { horizontal: "center" } };
        ['E5', 'F5', 'H5'].forEach(cell => setStyle(cell, dateStyle));

        const range = XLSX.utils.decode_range(ws['!ref']);
        const tableStartRow = 6; 
        const thinBorder = { style: "thin", color: { auto: 1 } };
        const borderStyle = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        for (let R = tableStartRow; R <= range.e.r; ++R) {
            for (let C = 1; C <= 8; ++C) { 
                const cellRef = XLSX.utils.encode_cell({r: R, c: C});
                if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

                const cellStyle = {
                    border: borderStyle,
                    alignment: { vertical: "center", wrapText: true, horizontal: "center" } 
                };

                if (C === 2 || C === 3 || C === 4 || C === 8) { 
                    cellStyle.alignment.horizontal = "left";
                }

                if (R === tableStartRow) {
                    cellStyle.font = { bold: true };
                    cellStyle.alignment.horizontal = "center";
                }
                
                ws[cellRef].s = cellStyle;
            }
        }

        const rowHeights = [];
        for(let i=0; i < tableStartRow; i++) rowHeights.push({}); 
        for(let i=tableStartRow; i <= range.e.r; i++) rowHeights.push({ hpx: 27 });
        ws['!rows'] = rowHeights;

        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, ws, "Pohotovosť");

        const filename = `Pohotovost_BBKraj_Tyzden_${inputWeek}_${inputYear}.xlsx`;
        XLSX.writeFile(newWorkbook, filename);
        
        showToast(`Hotovo! Úspešne spracovaných ${successCount} súborov.`, TOAST_TYPE.SUCCESS);
        if (statusMsg) statusMsg.textContent = "";

    } catch (e) {
        console.error("BBK Modul Error:", e);
        showToast("Kritická chyba: " + e.message, TOAST_TYPE.ERROR);
        if (statusMsg) statusMsg.textContent = "";
    } finally {
        // --- KONIEC ANIMÁCIE (Bezpečný návrat do pôvodného stavu) ---
        processBtn.innerHTML = originalContent;
        processBtn.classList.remove('btn-loading');
        processBtn.disabled = false;
        if (statusMsg) statusMsg.textContent = "";
    }
}

// --- POMOCNÉ FUNKCIE ---

function getIsoWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

function getDateRangeFromWeek(year, week) {
    const jan4 = new Date(year, 0, 4);
    const dayOfJan4 = jan4.getDay() || 7; 
    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setDate(jan4.getDate() - dayOfJan4 + 1);
    const resultStart = new Date(mondayWeek1);
    resultStart.setDate(mondayWeek1.getDate() + (week - 1) * 7);
    const resultEnd = new Date(resultStart);
    resultEnd.setDate(resultStart.getDate() + 6);
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return {
        start: resultStart.toLocaleDateString('sk-SK', options),
        end: resultEnd.toLocaleDateString('sk-SK', options)
    };
}

/**
 * ✅ NOVÉ: Cleanup funkcia pre BBKModule
 * Očisťuje vybrané súbory a event listenery
 */
export function cleanupBBKModule() {
    selectedFiles = [];
    console.log("[BBKModule] Cleanup completed.");
}