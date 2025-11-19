/* =================================== */
/* MODUL: Rozpis služieb IZS           */
/* (schd_izs_module.js)                */
/* =================================== */

import { showToast, TOAST_TYPE } from './utils.js';

let _db;
let _activeUser;
let selectedFile = null;
let cisloSpisu = ''; // Globálna premenná pre uchovanie čísla spisu

/**
 * Inicializácia modulu IZS
 */
export function initializeIZSModule(db, activeUser) {
    _db = db;
    _activeUser = activeUser;
    
    console.log('Inicializujem modul IZS...');
    setupDropZone();
}

/**
 * Nastavenie logiky pre Drop Zónu a Tlačidlá
 */
function setupDropZone() {
    const dropZone = document.getElementById('izs-drop-zone');
    const fileInput = document.getElementById('izs-file-input');
    const fileNameDisplay = document.getElementById('izs-file-name');
    const processBtn = document.getElementById('izs-process-btn');
    const clearBtn = document.getElementById('izs-clear-btn');
    const outputContainer = document.getElementById('izs-output-container');

    if (!dropZone || !fileInput) {
        console.warn("IZS Module: Drop zone elements not found.");
        return;
    }

    // 1. Kliknutie na drop zónu
    dropZone.addEventListener('click', () => fileInput.click());

    // 2. Zmena súboru cez input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileSelection(e.target.files[0]);
    });

    // 3. Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleFileSelection(e.dataTransfer.files[0]);
    });

    // 4. Tlačidlo Vymazať
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            selectedFile = null;
            cisloSpisu = '';
            fileInput.value = '';
            
            // Reset Dropzone UI
            dropZone.classList.remove('file-selected');
            dropZone.innerHTML = `
                <p><strong>Presuňte súbor .xlsx sem</strong></p>
                <p>alebo kliknite pre výber súboru</p>
                <input type="file" id="izs-file-input" accept=".xlsx, .xls" style="display: none;">
            `;
            
            // Reset File Name Display
            if (fileNameDisplay) {
                fileNameDisplay.classList.add('hidden');
                fileNameDisplay.querySelector('span').textContent = '';
            }

            // Reset Output
            if (outputContainer) {
                outputContainer.innerHTML = '';
            }
        });
    }

    // 5. Tlačidlo Spracovať
    if (processBtn) {
        processBtn.addEventListener('click', () => {
            if (!selectedFile) {
                showToast("Najskôr vyberte súbor.", TOAST_TYPE.ERROR);
                return;
            }
            renderTableFromExcel(selectedFile);
        });
    }
}

/**
 * Spracovanie výberu súboru (UI update)
 */
function handleFileSelection(file) {
    const allowedExtensions = ['xlsx', 'xls'];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
        showToast("Nepodporovaný formát súboru. Použite .xlsx.", TOAST_TYPE.ERROR);
        return;
    }

    selectedFile = file;
    
    const dropZone = document.getElementById('izs-drop-zone');
    const fileNameDisplay = document.getElementById('izs-file-name');

    if (dropZone) {
        dropZone.classList.add('file-selected');
        dropZone.innerHTML = `
            <i class="fas fa-file-excel" style="font-size: 3rem; color: #217346; margin-bottom: 10px;"></i>
            <p>Súbor pripravený na spracovanie</p>
            <input type="file" id="izs-file-input" accept=".xlsx, .xls" style="display: none;">
        `;
    }

    if (fileNameDisplay) {
        fileNameDisplay.classList.remove('hidden');
        fileNameDisplay.querySelector('span').textContent = file.name;
    }
}

/* ========================================================================== */
/* CORE LOGIC: Rendering Excel to HTML (Ported from script.js)               */
/* ========================================================================== */

async function renderTableFromExcel(file) {
    const outputContainer = document.getElementById('izs-output-container');
    outputContainer.innerHTML = '<div class="loader"></div><p style="text-align:center">Spracovávam farby a dáta...</p>';

    try {
        // XlsxPopulate je načítaný globálne cez CDN v index.html
        const workbook = await XlsxPopulate.fromDataAsync(await file.arrayBuffer());

        // Zistiť aktívny hárok
        let sheet;
        try {
            const activeSheetIndex = workbook.activeSheet();
            if (typeof activeSheetIndex === 'number') {
                sheet = workbook.sheet(activeSheetIndex);
            } else {
                sheet = workbook.sheet(0);
            }
        } catch (e) {
            console.warn("Nepodarilo sa zistiť aktívny hárok, používam prvý.", e);
            sheet = workbook.sheet(0);
        }

        // Načítanie čísla spisu
        try {
            const spisCell = sheet.cell("C3");
            cisloSpisu = (spisCell.value() === null || typeof spisCell.value() === 'undefined') ? '' : spisCell.value();
        } catch (e) {
            cisloSpisu = '';
        }

        // Načítanie dátumu z hlavičky
        let dateHeaderText = '';
        try {
            const dateCell = sheet.cell("D1");
            dateHeaderText = (dateCell.value() === null || typeof dateCell.value() === 'undefined') ? '' : dateCell.value();
        } catch (e) {}

        let monthYearText = dateHeaderText;
        const match = dateHeaderText.match(/na mesiac\s+(.*)/i);
        if (match && match[1]) {
            monthYearText = match[1].trim();
        }

        // Rozsah dát (podľa pôvodného skriptu)
        const range = sheet.range("A13:AI64");
        
        // Vytvorenie HTML tabuľky
        const table = document.createElement('table');
        table.className = 'izs-preview-table'; // Pridáme triedu pre CSS štýlovanie
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        table.style.fontSize = '12px'; // Menší font pre náhľad
        
        const tbody = document.createElement('tbody');

        const numRows = 64 - 13 + 1;
        const numCols = 35;

        // Hlavička tabuľky (Spis + Mesiac)
        const headerRow = document.createElement('tr');
        
        const spisCell = document.createElement('td');
        spisCell.textContent = cisloSpisu || '';
        spisCell.setAttribute('colspan', '2');
        spisCell.style.fontWeight = 'bold';
        spisCell.style.padding = '8px';
        spisCell.style.backgroundColor = '#f0f0f0';
        headerRow.appendChild(spisCell);

        const dateCell = document.createElement('td');
        dateCell.textContent = monthYearText;
        dateCell.setAttribute('colspan', numCols - 3); // -2 za spis + korekcia
        dateCell.style.fontWeight = 'bold';
        dateCell.style.textAlign = 'center';
        dateCell.style.padding = '8px';
        dateCell.style.backgroundColor = '#f0f0f0';
        headerRow.appendChild(dateCell);

        tbody.appendChild(headerRow);

        // Iterácia cez riadky a bunky
        for (let r = 0; r < numRows; r++) {
            const tr = document.createElement('tr');
            try {
                const rowHeight = range.cell(r, 0).row().height();
                if (rowHeight < 6) {
                    tr.style.display = 'none'; // Skryť prázdne riadky
                }
            } catch (e) { }

            for (let c = 0; c < numCols; c++) {
                if (c === 1) continue; // Preskočiť stĺpec B ak je skrytý/nepotrebný v pôvodnom skripte

                const cell = range.cell(r, c);
                const td = document.createElement('td');
                
                const value = cell.value();
                td.textContent = (value === null || typeof value === 'undefined') ? '' : value;

                // Farba pozadia
                const fill = safeCellStyle(cell, "fill");
                const bg = extractColorFromFill(fill);
                if (bg) td.style.backgroundColor = bg;

                // Farba písma
                const fontStyle = safeCellStyle(cell, "fontColor") || safeCellStyle(cell, "color") || safeCellStyle(cell, "font");
                const fg = extractColorFromFont(fontStyle);
                if (fg) td.style.color = fg;

                // Štýlovanie
                td.style.border = '1px solid #ccc';
                td.style.padding = '4px';
                td.style.whiteSpace = 'nowrap';

                if (c === 2) td.style.fontWeight = 'bold'; // Meno zamestnanca

                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        outputContainer.innerHTML = '';
        
        // Pridanie ovládacieho panela pre export
        const controlDiv = document.createElement('div');
        controlDiv.style.marginBottom = '1rem';
        controlDiv.style.display = 'flex';
        controlDiv.style.justifyContent = 'flex-end';

        const exportBtn = document.createElement('button');
        exportBtn.className = 'ua-btn accent';
        exportBtn.innerHTML = '<i class="fas fa-download"></i> Stiahnuť Rozdeľovník';
        exportBtn.onclick = generateRozdelovnik;

        controlDiv.appendChild(exportBtn);
        outputContainer.appendChild(controlDiv);
        outputContainer.appendChild(table);
        
        showToast("Náhlady vygenerovaný. Skontrolujte farby a stiahnite rozdeľovník.", TOAST_TYPE.SUCCESS);

    } catch (err) {
        console.error("Chyba pri spracovaní XLSX:", err);
        outputContainer.innerHTML = `<p style="color:red">Chyba pri spracovaní súboru: ${err.message}</p>`;
        showToast("Chyba pri spracovaní súboru.", TOAST_TYPE.ERROR);
    }
}

/* ========================================================================== */
/* CORE LOGIC: Generating Rozdeľovník (Ported from script.js)                */
/* ========================================================================== */

async function generateRozdelovnik() {
    const outputContainer = document.getElementById('izs-output-container');
    const table = outputContainer.querySelector('table');

    if (!table) {
        showToast('Chýba tabuľka s dátami.', TOAST_TYPE.ERROR);
        return;
    }

    showToast('Generujem rozdeľovník...', TOAST_TYPE.INFO);

    try {
        // ExcelJS je globálne dostupný
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Rozdeľovník');

        // Získanie hlavičiek z HTML tabuľky
        const headerCells = table.querySelectorAll('tr:first-child td');
        const cisloSpisuText = headerCells[0] ? headerCells[0].textContent.trim() : '';
        const titleCell = headerCells[1];
        
        const titleText = titleCell ? titleCell.textContent : '';
        const dateInfo = parseMonthYear(titleText);

        if (!dateInfo) {
            showToast(`Nepodarilo sa z textu "${titleText}" extrahovať mesiac a rok.`, TOAST_TYPE.ERROR);
            return;
        }

        const { month, year, monthIndex } = dateInfo;
        const numDays = getDaysInMonth(monthIndex, year);

        // --- Formátovanie Excelu (podľa pôvodného skriptu) ---
        sheet.getColumn(1).width = 7;
        sheet.getColumn(2).width = 35;
        sheet.getColumn(3).width = 7;
        sheet.getColumn(4).width = 35;
        sheet.getColumn(5).width = 30;

        sheet.getCell('A1').value = cisloSpisuText;
        sheet.getCell('E1').value = 'Dátum:';

        sheet.mergeCells('A3:E3');
        sheet.getCell('A3').value = `Rozdeľovník služieb operátorov na mesiac ${month} ${year}`;
        sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getCell('A3').font = { bold: true, size: 14 };

        sheet.mergeCells('A4:E4');
        sheet.getCell('A4').value = 'Koordinačného strediska IZS odboru krízového riadenia';
        sheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

        // Hlavičky tabuľky
        sheet.getCell('A7').value = 'Dátum';
        sheet.getCell('B7').value = 'Denná zmena 06:30 - 18:30';
        sheet.getCell('C7').value = 'Dátum';
        sheet.getCell('D7').value = 'Nočná zmena 18:30 - 06:30';
        sheet.getCell('E7').value = 'Poznámka';

        sheet.getRow(7).height = 27;
        
        // Štýlovanie hlavičiek
        sheet.getCell('B7').alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
        sheet.getCell('B7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }; // Zelená
        sheet.getCell('B7').font = { bold: true, size: 14 };

        sheet.getCell('D7').alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
        sheet.getCell('D7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } }; // Oranžová
        sheet.getCell('D7').font = { bold: true, size: 14 };

        ['A7', 'C7', 'E7'].forEach(cell => {
            sheet.getCell(cell).font = { bold: true };
            sheet.getCell(cell).alignment = { vertical: 'top', wrapText: true };
        });

        // Spracovanie riadkov zamestnancov
        const firstDayColIndex = 2; // Index stĺpca v HTML kde začínajú dni (0-based)
        const employeeRows = Array.from(table.querySelectorAll('tbody tr')).slice(1); // Preskočiť hlavičku
        const holidayDays = [];

        for (let day = 1; day <= numDays; day++) {
            const excelRow = day + 7;
            const htmlColIndex = firstDayColIndex + (day - 1);

            let richTextSd = [];
            let richTextSn = [];
            let notesArray = [];
            let isHoliday = false;

            for (let rowIndex = 0; rowIndex < employeeRows.length; rowIndex++) {
                const row = employeeRows[rowIndex];
                if (!row.cells || row.cells.length < 2) continue;

                const nameCell = row.cells[1]; // Predpokladáme, že meno je v 2. stĺpci (index 1)
                if (!nameCell) continue;

                const fullName = nameCell.textContent ? nameCell.textContent.trim() : '';
                if (fullName === '' || /^\d+$/.test(fullName) || fullName.toLowerCase().includes('meno')) continue;

                const employeeName = extractSurname(fullName);
                const shiftCell = row.cells[htmlColIndex];
                
                if (!shiftCell) continue;

                // Detekcia sviatku (žltá farba v HTML)
                const cellBgColor = shiftCell.style.backgroundColor; 
                // Pozor: style.backgroundColor vracia niečo ako "rgb(255, 255, 0)" alebo hex
                if (isYellowColor(cellBgColor)) {
                    isHoliday = true;
                }

                const shiftType = shiftCell.textContent ? shiftCell.textContent.trim().toLowerCase() : '';
                if (shiftType === '') continue;

                // Biznis logika podľa farieb
                const bgColor = shiftCell.style.backgroundColor;
                let hasBlueBackground = isBlueColor(bgColor);
                let hasRedBackground = isRedColor(bgColor);

                const formattedSurname = formatSurnameForNote(employeeName);

                if (hasRedBackground) {
                    notesArray.push(`${formattedSurname}-PN`);
                } else if (hasBlueBackground) {
                    notesArray.push(`${formattedSurname}-D`);
                } else if (shiftType === 'sd' || shiftType === 'sn') {
                    // Získanie farby písma z HTML
                    const shiftCellColor = shiftCell.style.color || 'black';
                    const hexColor = rgbToHex(shiftCellColor);
                    
                    const nameFragment = {
                        text: employeeName,
                        font: { color: { argb: 'FF' + hexColor } }
                    };

                    if (shiftType === 'sd') {
                        if (richTextSd.length > 0) richTextSd.push({ text: ', ', font: { color: { argb: 'FF000000' } } });
                        richTextSd.push(nameFragment);
                    } else if (shiftType === 'sn') {
                        if (richTextSn.length > 0) richTextSn.push({ text: ', ', font: { color: { argb: 'FF000000' } } });
                        richTextSn.push(nameFragment);
                    }
                } else {
                    notesArray.push(`${formattedSurname}-${shiftType.toUpperCase()}`);
                }
            }

            // Zápis do Excelu
            if (isHoliday) holidayDays.push(day);

            sheet.getCell(`A${excelRow}`).value = day;
            sheet.getCell(`C${excelRow}`).value = day;
            sheet.getCell(`A${excelRow}`).alignment = { horizontal: 'center', vertical: 'top' };
            sheet.getCell(`C${excelRow}`).alignment = { horizontal: 'center', vertical: 'top' };

            // Podfarbenie (Sviatky / Víkendy)
            if (isHoliday) {
                ['A', 'B', 'C', 'D', 'E'].forEach(col => {
                    sheet.getCell(`${col}${excelRow}`).fill = {
                        type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } // Žltá
                    };
                });
            } else if (isWeekend(day, monthIndex, year)) {
                sheet.getCell(`A${excelRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
                sheet.getCell(`C${excelRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
            }

            if (richTextSd.length > 0) {
                sheet.getCell(`B${excelRow}`).value = { richText: richTextSd };
                sheet.getCell(`B${excelRow}`).alignment = { wrapText: true, vertical: 'top' };
            }
            if (richTextSn.length > 0) {
                sheet.getCell(`D${excelRow}`).value = { richText: richTextSn };
                sheet.getCell(`D${excelRow}`).alignment = { wrapText: true, vertical: 'top' };
            }
            if (notesArray.length > 0) {
                sheet.getCell(`E${excelRow}`).value = notesArray.join(', ');
                sheet.getCell(`E${excelRow}`).alignment = { wrapText: true, vertical: 'top' };
            }
        }

        // Legenda a podpisy (fixne)
        const legendRow = 39; // alebo dynamicky pod tabuľkou
        sheet.getCell('A39').value = 'čierna farba - pravidelné striedanie služieb';
        sheet.getCell('A39').font = { bold: true };
        sheet.getCell('D39').value = 'modrá farba - služby za neprítomných';
        sheet.getCell('D39').font = { bold: true, color: { argb: 'FF00B0F0' } };

        sheet.getCell('A42').value = 'Spracoval:';
        sheet.getCell('C42').value = 'Schvaľuje:';
        sheet.getCell('E42').value = 'Schvaľuje:';

        sheet.getCell('A43').value = 'Mgr. Juraj Tuhársky';
        sheet.getCell('C43').value = 'Mgr. Juraj Tuhársky';
        sheet.getCell('E43').value = 'Mgr. Mário Banič';

        sheet.getCell('A44').value = 'Ing. Silvia Sklenárová';
        sheet.getCell('C44').value = 'vedúci koordinačného strediska IZS';
        sheet.getCell('E44').value = 'vedúci odboru krízového riadenia';

        // Orámovanie
        addBorders(sheet, numDays);

        // Stiahnutie súboru
        const fileName = `Rozdeľovník_${month}_${year}.xlsx`;
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), fileName); // FileSaver.js (global)

        showToast('Rozdeľovník úspešne stiahnutý!', TOAST_TYPE.SUCCESS);

    } catch (err) {
        console.error('Chyba pri generovaní:', err);
        showToast('Chyba pri generovaní: ' + err.message, TOAST_TYPE.ERROR);
    }
}

/* ========================================================================== */
/* HELPER FUNCTIONS                                                          */
/* ========================================================================== */

function addBorders(sheet, numDays) {
    const thinBorder = { style: 'thin', color: { argb: 'FF000000' } };
    const mediumBorder = { style: 'medium', color: { argb: 'FF000000' } };

    for (let row = 7; row <= numDays + 7; row++) {
        for (let col = 1; col <= 5; col++) {
            const cell = sheet.getCell(row, col);
            const border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

            if (row === 7) border.top = mediumBorder;
            if (row === numDays + 7) border.bottom = mediumBorder;
            if (col === 1) border.left = mediumBorder; // A
            if (col === 5) border.right = mediumBorder; // E
            
            // Hrubé vertikálne čiary
            if (col === 1) border.right = mediumBorder;
            if (col === 2) { border.left = mediumBorder; border.right = mediumBorder; }
            if (col === 3) { border.left = mediumBorder; border.right = mediumBorder; }
            if (col === 4) { border.left = mediumBorder; border.right = mediumBorder; }
            if (col === 5) border.left = mediumBorder;

            cell.border = border;
        }
    }
}

// --- Color Helpers ---

function normalizeHexOrArgb(input) {
    if (!input) return null;
    if (typeof input === 'object') return null;
    let hex = String(input).replace(/^#/, '').trim();
    
    if (hex.length === 8) { // ARGB
        const a = parseInt(hex.slice(0, 2), 16) / 255;
        const r = parseInt(hex.slice(2, 4), 16);
        const g = parseInt(hex.slice(4, 6), 16);
        const b = parseInt(hex.slice(6, 8), 16);
        if (a === 1) return `#${hex.slice(2)}`;
        return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`;
    }
    return `#${hex}`;
}

function extractColorFromFill(fill) {
    if (!fill) return null;
    let candidate = null;
    try {
        if (fill.color) {
            if (typeof fill.color.rgb === 'string') candidate = fill.color.rgb;
            else if (typeof fill.color.argb === 'string') candidate = fill.color.argb;
        }
        if (!candidate && fill.fgColor) {
            if (typeof fill.fgColor.rgb === 'string') candidate = fill.fgColor.rgb;
            else if (typeof fill.fgColor.argb === 'string') candidate = fill.fgColor.argb;
        }
        // Jednoduchá implementácia Theme colors (ak treba)
        if (!candidate && fill.color && fill.color.theme !== undefined) {
             // Tu by bola zložitá konverzia theme, pre stručnosť vynechávam
             // Ak to je kritické, skopírujte celú funkciu z pôvodného script.js
             return null; 
        }
    } catch (e) {}
    return normalizeHexOrArgb(candidate);
}

function extractColorFromFont(font) {
    if (!font) return null;
    let candidate = null;
    try {
        if (font.rgb) candidate = font.rgb;
        if (!candidate && font.argb) candidate = font.argb;
        if (!candidate && font.color) candidate = font.color.rgb || font.color.argb;
    } catch (e) {}
    return normalizeHexOrArgb(candidate);
}

function safeCellStyle(cell, prop) {
    try { return cell.style(prop); } 
    catch (e) {
        try { const s = cell.style(); return s ? s[prop] : null; } catch (e2) { return null; }
    }
}

// --- String & Date Helpers ---

function parseMonthYear(text) {
    const monthsMap = {
        'január': 0, 'januára': 0, 'február': 1, 'februára': 1, 'marec': 2, 'marca': 2,
        'apríl': 3, 'apríla': 3, 'máj': 4, 'mája': 4, 'jún': 5, 'júna': 5,
        'júl': 6, 'júla': 6, 'august': 7, 'augusta': 7, 'september': 8, 'septembra': 8,
        'október': 9, 'októbra': 9, 'november': 10, 'novembra': 10, 'december': 11, 'decembra': 11
    };
    const normalized = text.toLowerCase().trim();
    for (const [monthName, monthIndex] of Object.entries(monthsMap)) {
        if (normalized.includes(monthName)) {
            const yearMatch = normalized.match(/\d{4}/);
            if (yearMatch) {
                const year = parseInt(yearMatch[0]);
                const monthNameCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
                return { month: monthNameCapitalized, year, monthIndex };
            }
        }
    }
    return null;
}

function getDaysInMonth(monthIndex, year) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function isWeekend(day, monthIndex, year) {
    const date = new Date(year, monthIndex, day);
    const d = date.getDay();
    return d === 0 || d === 6;
}

function extractSurname(fullName) {
    const words = fullName.split(/\s+/);
    const surnames = words.filter(word => {
        const clean = word.replace(/[.,;:]/g, '');
        return clean.length >= 2 && clean === clean.toUpperCase();
    });
    return surnames.length > 0 ? surnames.join(' ') : fullName;
}

function formatSurnameForNote(surname) {
    return surname.charAt(0).toUpperCase() + surname.slice(1).toLowerCase();
}

function rgbToHex(rgb) {
    if (!rgb) return '000000';
    if (rgb.startsWith('#')) return rgb.replace('#', '').toUpperCase();
    const parts = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!parts) return '000000';
    const r = parseInt(parts[1]).toString(16).padStart(2, '0');
    const g = parseInt(parts[2]).toString(16).padStart(2, '0');
    const b = parseInt(parts[3]).toString(16).padStart(2, '0');
    return (r + g + b).toUpperCase();
}

// --- Color Checkers (for business logic) ---

function isYellowColor(rgbString) {
    if (!rgbString) return false;
    const parts = rgbString.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (parts) {
        const r = parseInt(parts[1]), g = parseInt(parts[2]), b = parseInt(parts[3]);
        return (r > 200 && g > 200 && b < 100); // Cca žltá
    }
    return false;
}

function isRedColor(rgbString) {
    if (!rgbString) return false;
    const parts = rgbString.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (parts) {
        const r = parseInt(parts[1]), g = parseInt(parts[2]), b = parseInt(parts[3]);
        return (r > 200 && g < 100 && b < 100);
    }
    return false;
}

function isBlueColor(rgbString) {
    if (!rgbString) return false;
    const parts = rgbString.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (parts) {
        const r = parseInt(parts[1]), g = parseInt(parts[2]), b = parseInt(parts[3]);
        return (r < 50 && g > 100 && b > 200); // Cca modrá
    }
    return false;
}