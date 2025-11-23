import { showToast, TOAST_TYPE } from './utils.js';

/* ======================================= */
/* MODUL: Rozpis pohotovosti BB Kraj       */
/* (schd_bbkraj_module.js)                 */
/* ======================================= */

let selectedFiles = []; // Pole pre uchovanie objektov File
let _db;
let _activeUser;

export function initializeBBKModule(db, activeUser) {
    _db = db;
    _activeUser = activeUser;
    
    console.log('Inicializujem modul BB Kraj (Smart Generator)...');
    
    // Nastavenie predvoleného dátumu (aktuálny týždeň a rok)
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentWeek = getIsoWeekNumber(today);

    const yearInput = document.getElementById('bbk-year-input');
    const weekInput = document.getElementById('bbk-week-input');

    if (yearInput) yearInput.value = currentYear;
    if (weekInput) weekInput.value = currentWeek;

    setupEventListeners();
}

function setupEventListeners() {
    const dropZone = document.getElementById('bbk-drop-zone');
    const fileInput = document.getElementById('bbk-file-input');
    const processBtn = document.getElementById('bbk-process-btn');
    const clearBtn = document.getElementById('bbk-clear-btn');

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
        processBtn.addEventListener('click', processFiles);
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', clearAll);
    }
}

/**
 * Spracuje vybrané súbory a aktualizuje UI zoznam
 */
function handleFiles(files) {
    // Pridáme nové súbory k existujúcim (alebo nahradíme, podľa preferencie - tu konvertujeme na Array)
    selectedFiles = Array.from(files);
    
    updateFileListUI();
}

function updateFileListUI() {
    const listContainer = document.getElementById('bbk-file-list');
    const ul = document.getElementById('bbk-file-list-ul');
    const processBtn = document.getElementById('bbk-process-btn');
    const dropZone = document.getElementById('bbk-drop-zone');

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
        if (processBtn) processBtn.disabled = true;
    }
}

/**
 * Vymaže stav modulu
 */
function clearAll() {
    selectedFiles = [];
    const fileInput = document.getElementById('bbk-file-input');
    const statusMsg = document.getElementById('bbk-status-msg');
    
    if (fileInput) fileInput.value = '';
    if (statusMsg) statusMsg.textContent = '';
    
    updateFileListUI();
    showToast('Výber súborov bol vymazaný.', TOAST_TYPE.INFO);
}

/**
 * Hlavná logika spracovania (extrahovaná z index.html)
 */
async function processFiles() {
    const statusMsg = document.getElementById('bbk-status-msg');
    const yearInput = document.getElementById('bbk-year-input');
    const weekInput = document.getElementById('bbk-week-input');
    const processBtn = document.getElementById('bbk-process-btn');

    const inputYear = parseInt(yearInput.value);
    const inputWeek = parseInt(weekInput.value);

    if (!inputYear || !inputWeek) {
        showToast("Prosím skontrolujte zadaný rok a týždeň.", TOAST_TYPE.ERROR);
        return;
    }

    if (processBtn) processBtn.disabled = true;
    // ZMENA: Žiadny text v statusMsg počas spracovania
    if (statusMsg) statusMsg.textContent = ""; 

    let rawData = [];
    let successCount = 0;
    let errorCount = 0; // Nové počítadlo chýb

    try {
        for (let i = 0; i < selectedFiles.length; i++) {
            let file = selectedFiles[i];
            const rowElem = document.getElementById(`bbk-file-row-${i}`);
            const iconElem = document.getElementById(`bbk-status-icon-${i}`);

            // Reset štýlov riadku (už nie je potrebné resetovať bg color, lebo sa nenastavuje)
            if(rowElem) {
                rowElem.style.color = "inherit";
            }

            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                
                // header: 1 vráti pole polí (array of arrays)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                let headerRowIndex = -1;
                let colIndexStart = 0;

                // 1. Nájdenie hlavičky tabuľky (hľadáme "okresný" a "úrad")
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

                // Ak sa nenašla tabuľka -> Chyba
                if (headerRowIndex === -1) {
                    throw new Error("Tabuľka s hlavičkou 'Okresný úrad' nebola nájdená.");
                }

                // 2. Extrahovanie dát
                for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
                    const row = jsonData[r];
                    // Bezpečné čítanie stĺpcov
                    const valUrad = row[colIndexStart];
                    const valMeno = row[colIndexStart + 1];
                    const valPriezvisko = row[colIndexStart + 2];
                    
                    const lowerUrad = String(valUrad || "").toLowerCase().trim();

                    // Podmienky na ukončenie čítania alebo preskočenie
                    if (lowerUrad.includes("schválil") || lowerUrad.includes("vypracoval") || lowerUrad.includes("dátum") || lowerUrad.includes("poznámka:")) break;
                    if (!valMeno && !String(valPriezvisko).trim()) continue;
                    if (lowerUrad.includes("okresný úrad")) continue; // Preskočenie opakovaných hlavičiek

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

                // Úspech pre tento súbor
                // ZMENA: Iba zmena ikony a jej farby
                if (iconElem) {
                    iconElem.textContent = "✅";
                    iconElem.style.color = "#48BB78"; // Zelená
                }
                // ZMENA: Žiadne pozadie pre riadok
                
                successCount++;

            } catch (err) {
                console.error(`Chyba pri súbore ${file.name}:`, err);
                errorCount++;
                
                // ZMENA: Iba zmena ikony a jej farby pri chybe
                if (iconElem) {
                    iconElem.textContent = "❌";
                    iconElem.style.color = "#E53E3E"; // Červená
                }
                if (rowElem) {
                    rowElem.title = err.message || "Chyba čítania";
                }

                // --- PRIDANÁ NOTIFIKÁCIA O CHYBE ---
                showToast(`Chyba pri spracovaní súboru "${file.name}": ${err.message}`, TOAST_TYPE.ERROR);
            }
        } // Koniec cyklu cez súbory

        if (rawData.length === 0) {
            showToast("Žiadne platné dáta neboli spracované.", TOAST_TYPE.ERROR);
            // ZMENA: Žiadny text v statusMsg
            if (processBtn) processBtn.disabled = false;
            return;
        }

        // Ak nastali nejaké chyby, ale aspoň niečo sa spracovalo
        if (errorCount > 0) {
            showToast(`Spracovanie dokončené s chybami (${errorCount} súborov zlyhalo).`, TOAST_TYPE.INFO);
        }

        // ... (Zvyšok funkcie pre generovanie Excelu zostáva nezmenený) ...
        
        // 3. Zoradenie podľa úradu
        rawData.sort((a, b) => String(a.urad).localeCompare(String(b.urad), 'sk'));

        // ... (Kód pre generovanie XLSX - viď predchádzajúca odpoveď) ...

        // 4. Príprava dát pre výstupný Excel
        let finalRows = rawData.map((item, index) => {
            return [
                "",         // A: Empty
                index + 1,  // B: P.č.
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

        // Štruktúra hárku
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

        // 5. Formátovanie (Štýly)
        // Pozor: Toto vyžaduje aby v prostredí bola knižnica, ktorá podporuje štýly (napr. xlsx-js-style)
        // Ak v mainWizard.js alebo index.html nie je načítaná, štýly sa nemusia aplikovať.
        
        if(!ws['!merges']) ws['!merges'] = [];
        ws['!merges'].push({ s: {r:0, c:1}, e: {r:0, c:8} }); // Merge nadpisu

        ws['!cols'] = [
            {wch: 5}, {wch: 5}, {wch: 25}, {wch: 15}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 30}, {wch: 25}
        ];

        // Helper pre bezpečné nastavenie štýlu
        const setStyle = (cellRef, styleObj) => {
            if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
            ws[cellRef].s = styleObj;
        };

        // Nadpis
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

        // Orámovanie tabuľky
        const range = XLSX.utils.decode_range(ws['!ref']);
        const tableStartRow = 6; 
        const thinBorder = { style: "thin", color: { auto: 1 } };
        const borderStyle = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

        for (let R = tableStartRow; R <= range.e.r; ++R) {
            for (let C = 1; C <= 8; ++C) { 
                const cellRef = XLSX.utils.encode_cell({r: R, c: C});
                if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

                // Základný štýl bunky
                const cellStyle = {
                    border: borderStyle,
                    alignment: { vertical: "center", wrapText: true, horizontal: "center" } 
                };

                // Zarovnanie vľavo pre textové stĺpce
                if (C === 2 || C === 3 || C === 4 || C === 8) { 
                    cellStyle.alignment.horizontal = "left";
                }

                // Tučná hlavička tabuľky
                if (R === tableStartRow) {
                    cellStyle.font = { bold: true };
                    cellStyle.alignment.horizontal = "center";
                }
                
                ws[cellRef].s = cellStyle;
            }
        }

        // Výška riadkov
        const rowHeights = [];
        for(let i=0; i < tableStartRow; i++) rowHeights.push({}); 
        for(let i=tableStartRow; i <= range.e.r; i++) rowHeights.push({ hpx: 27 });
        ws['!rows'] = rowHeights;

        // Generovanie a uloženie
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, ws, "Pohotovosť");

        // ... na konci funkcie:
        const filename = `Pohotovost_BBKraj_Tyzden_${inputWeek}_${inputYear}.xlsx`;
        XLSX.writeFile(newWorkbook, filename);
        
        showToast(`Hotovo! Úspešne spracovaných ${successCount} súborov.`, TOAST_TYPE.SUCCESS);
        // ZMENA: Žiadny text v statusMsg
        if (statusMsg) statusMsg.textContent = "";

    } catch (e) {
        console.error("BBK Modul Error:", e);
        showToast("Kritická chyba: " + e.message, TOAST_TYPE.ERROR);
        // ZMENA: Žiadny text v statusMsg
        if (statusMsg) statusMsg.textContent = "";
    } finally {
        if (processBtn) processBtn.disabled = false;
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