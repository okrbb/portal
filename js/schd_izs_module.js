/* =================================== */
/* MODUL: Rozpis služieb IZS           */
/* (schd_izs_module.js)                */
/* =================================== */

import { showToast, TOAST_TYPE } from './utils.js';

let _db;
let _activeUser;
let selectedFile = null;
let cisloSpisu = ''; 

/**
 * Inicializácia modulu IZS
 */
export function initializeIZSModule(db, activeUser) {
    _db = db;
    _activeUser = activeUser;
    
    console.log('Inicializujem modul IZS...');
    setupDropZone();
    setupModalListeners(); // Nová funkcia pre zatváranie modálu
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
    // outputContainer už nepoužívame na vykreslenie, ale môžeme ho vyčistiť pri resete

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

            // Vyčistenie modálu (pre istotu)
            const modalBody = document.getElementById('izsModalBody');
            if (modalBody) modalBody.innerHTML = '';
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
 * Nastavenie listenerov pre modálne okno
 */
function setupModalListeners() {
    const closeBtn = document.getElementById('izsCloseModalBtn');
    const modal = document.getElementById('izsPreviewModal');

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
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
/* CORE LOGIC: Rendering Excel to HTML (Targeting Modal)                     */
/* ========================================================================== */

async function renderTableFromExcel(file) {
    const modal = document.getElementById('izsPreviewModal');
    const modalBody = document.getElementById('izsModalBody');
    
    if (!modal || !modalBody) {
        console.error("IZS Modal elements not found");
        return;
    }

    // Otvoríme modál a zobrazíme loader
    modal.classList.remove('hidden');
    modalBody.innerHTML = '<div class="loader" style="margin: 20px auto;"></div><p style="text-align:center; color: #000;">Spracovávam farby a dáta...</p>';

    try {
        const workbook = await XlsxPopulate.fromDataAsync(await file.arrayBuffer());

        // =================================================================
        // 1. Získanie AKTÍVNEHO hárka (záložky)
        // =================================================================
        let sheet = workbook.activeSheet();

        // Kontrola, či sa podarilo načítať aktívny hárok. 
        // Ak nie (sheet je null/undefined), použijeme prvý hárok ako zálohu.
        if (!sheet) {
            console.warn("Aktívny hárok nebol v Exceli definovaný. Používam prvý hárok (Index 0).");
            sheet = workbook.sheet(0);
        }
        
        console.log(`Pracujem s hárkom: "${sheet.name()}"`);
        // =================================================================

        // Načítanie čísla spisu
        let cisloSpisu = '';
        try {
            const spisCell = sheet.cell("C3");
            cisloSpisu = (spisCell.value() === null || typeof spisCell.value() === 'undefined') ? '' : spisCell.value();
        } catch (e) {
            console.warn("Nepodarilo sa načítať číslo spisu (C3).");
        }

        // Načítanie dátumu z hlavičky (D1)
        let dateHeaderText = '';
        try {
            const dateCell = sheet.cell("D1");
            dateHeaderText = (dateCell.value() === null || typeof dateCell.value() === 'undefined') ? '' : dateCell.value();
        } catch (e) {}

        // Parsovanie textu "na mesiac..."
        let monthYearText = dateHeaderText;
        const match = dateHeaderText.match(/na mesiac\s+(.*)/i);
        if (match && match[1]) {
            monthYearText = match[1].trim();
        }

        // Definícia rozsahu tabuľky (Podľa vášho pôvodného kódu)
        const range = sheet.range("A13:AI64");
        
        // Vytvorenie HTML tabuľky
        const table = document.createElement('table');
        table.className = 'izs-preview-table'; 
        table.style.borderCollapse = 'collapse';
        table.style.width = '100%';
        table.style.fontSize = '12px';
        table.style.backgroundColor = '#ffffff'; 
        table.style.color = '#000000'; 
        
        const tbody = document.createElement('tbody');
        const numRows = 64 - 13 + 1;
        const numCols = 35;

        // --- Hlavička tabuľky (Spis + Mesiac) ---
        const headerRow = document.createElement('tr');
        
        const spisCellElem = document.createElement('td');
        spisCellElem.textContent = cisloSpisu || '';
        spisCellElem.setAttribute('colspan', '2');
        spisCellElem.style.fontWeight = 'bold';
        spisCellElem.style.padding = '8px';
        spisCellElem.style.backgroundColor = '#f0f0f0';
        spisCellElem.style.color = '#000000';
        headerRow.appendChild(spisCellElem);

        const dateCellElem = document.createElement('td');
        dateCellElem.textContent = monthYearText;
        dateCellElem.setAttribute('colspan', numCols - 3); 
        dateCellElem.style.fontWeight = 'bold';
        dateCellElem.style.textAlign = 'center';
        dateCellElem.style.padding = '8px';
        dateCellElem.style.backgroundColor = '#f0f0f0';
        dateCellElem.style.color = '#000000';
        headerRow.appendChild(dateCellElem);

        tbody.appendChild(headerRow);

        // --- Iterácia cez riadky a bunky ---
        for (let r = 0; r < numRows; r++) {
            const tr = document.createElement('tr');
            try {
                // Skrytie riadkov s malou výškou (skryté riadky v Exceli)
                const rowHeight = range.cell(r, 0).row().height();
                if (rowHeight < 6) {
                    tr.style.display = 'none'; 
                }
            } catch (e) { }

            for (let c = 0; c < numCols; c++) {
                if (c === 1) continue; // Preskočíme stĺpec B (ak je to zámer)

                const cell = range.cell(r, c);
                const td = document.createElement('td');
                
                const value = cell.value();
                td.textContent = (value === null || typeof value === 'undefined') ? '' : value;

                // Farba pozadia
                const fill = safeCellStyle(cell, "fill");
                const bg = extractColorFromFill(fill);
                td.style.backgroundColor = bg ? bg : '#ffffff';

                // Farba písma
                const fontStyle = safeCellStyle(cell, "fontColor") || safeCellStyle(cell, "color") || safeCellStyle(cell, "font");
                const fg = extractColorFromFont(fontStyle);
                td.style.color = fg ? fg : '#000000';

                td.style.border = '1px solid #ccc';
                td.style.padding = '4px';
                td.style.whiteSpace = 'nowrap';

                // Tučné písmo pre stĺpec C (index 2 v rozsahu, v cykle je to c=2)
                if (c === 2) td.style.fontWeight = 'bold';

                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        modalBody.innerHTML = ''; // Vyčistenie loadera
        
        // --- Ovládací panel pre export ---
        const controlDiv = document.createElement('div');
        controlDiv.style.marginBottom = '1rem';
        controlDiv.style.display = 'flex';
        controlDiv.style.justifyContent = 'flex-end';
        controlDiv.style.position = 'sticky';
        controlDiv.style.left = '0';

        const exportBtn = document.createElement('button');
        exportBtn.className = 'ua-btn accent';
        exportBtn.innerHTML = '<i class="fas fa-download"></i> Stiahnuť Rozdeľovník';
        exportBtn.onclick = generateRozdelovnik;

        controlDiv.appendChild(exportBtn);
        modalBody.appendChild(controlDiv);
        modalBody.appendChild(table);
        
        showToast(`Načítaný hárok: ${sheet.name()}`, TOAST_TYPE.SUCCESS);

    } catch (err) {
        console.error("Chyba pri spracovaní XLSX:", err);
        modalBody.innerHTML = `<p style="color:red; text-align:center;">Chyba pri spracovaní súboru: ${err.message}</p>`;
        showToast("Chyba pri spracovaní súboru.", TOAST_TYPE.ERROR);
    }
}

/* ========================================================================== */
/* CORE LOGIC: Generating Rozdeľovník + Saving to DB                         */
/* ========================================================================== */

async function generateRozdelovnik() {
    const modalBody = document.getElementById('izsModalBody');
    const table = modalBody ? modalBody.querySelector('table') : null;

    if (!table) {
        showToast('Chýba tabuľka s dátami.', TOAST_TYPE.ERROR);
        return;
    }

    showToast('Generujem rozdeľovník a ukladám dáta...', TOAST_TYPE.INFO);

    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Rozdeľovník');

        // --- NASTAVENIE TLAČE (Nová časť) ---
        sheet.pageSetup = {
            paperSize: 9,              // 9 = A4
            orientation: 'portrait',  // Na šírku (odporúčané pre tabuľky)
            fitToPage: true,           // Zapnúť prispôsobenie
            fitToWidth: 1,             // Vtesnať na 1 stranu na šírku
            fitToHeight: 1,            // Vtesnať na 1 stranu na výšku
            horizontalCentered: true,  // Vycentrovať vodorovne
            verticalCentered: false    // Zvisle necentrovať (zvyčajne chceme tabuľku hore)
        };
        
        // Nastavenie okrajov (voliteľné, pre lepšie využitie miesta)
        sheet.pageSetup.margins = {
            left: 0.7, right: 0.7, top: 0.75, bottom: 0.75,
            header: 0.3, footer: 0.3
        };

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
        const dbScheduleData = {}; 

        // --- Formátovanie stĺpcov ---
        sheet.getColumn(1).width = 7;
        sheet.getColumn(2).width = 35;
        sheet.getColumn(3).width = 7;
        sheet.getColumn(4).width = 35;
        sheet.getColumn(5).width = 30;

        // --- Hlavička dokumentu ---
        sheet.getCell('A1').value = cisloSpisuText;
        sheet.getCell('E1').value = 'Dátum:';
        sheet.mergeCells('A3:E3');
        sheet.getCell('A3').value = `Rozdeľovník služieb operátorov na mesiac ${month} ${year}`;
        sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getCell('A3').font = { bold: true, size: 14 }; 
        sheet.mergeCells('A4:E4');
        sheet.getCell('A4').value = 'Koordinačného strediska IZS odboru krízového riadenia';
        sheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getCell('A4').font = { size: 11 };

        // --- Hlavička tabuľky ---
        sheet.getCell('A7').value = 'Dátum';
        sheet.getCell('B7').value = 'Denná zmena 06:30 - 18:30';
        sheet.getCell('C7').value = 'Dátum';
        sheet.getCell('D7').value = 'Nočná zmena 18:30 - 06:30';
        sheet.getCell('E7').value = 'Poznámka';
        sheet.getRow(7).height = 27;
        
        sheet.getCell('B7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }; 
        sheet.getCell('D7').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } }; 
        
        ['A7', 'B7', 'C7', 'D7', 'E7'].forEach(cell => {
            sheet.getCell(cell).font = { bold: true, size: 14 }; 
            sheet.getCell(cell).alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
        });

        const firstDayColIndex = 2; 
        const employeeRows = Array.from(table.querySelectorAll('tbody tr')).slice(1); 
        const holidayDays = [];

        // --- HLAVNÝ CYKLUS (DÁTA) ---
        for (let day = 1; day <= numDays; day++) {
            const excelRow = day + 7;
            const htmlColIndex = firstDayColIndex + (day - 1);

            let richTextSd = [];
            let richTextSn = [];
            let notesArray = [];
            let isHoliday = false;

            dbScheduleData[day] = {
                dayShift: [],   
                nightShift: []  
            };

            for (let rowIndex = 0; rowIndex < employeeRows.length; rowIndex++) {
                const row = employeeRows[rowIndex];
                if (!row.cells || row.cells.length < 2) continue;

                const nameCell = row.cells[1]; 
                if (!nameCell) continue;

                const fullName = nameCell.textContent ? nameCell.textContent.trim() : '';
                if (fullName === '' || /^\d+$/.test(fullName) || fullName.toLowerCase().includes('meno')) continue;

                const employeeName = extractSurname(fullName);
                const shiftCell = row.cells[htmlColIndex];
                
                if (!shiftCell) continue;

                const cellBgColor = shiftCell.style.backgroundColor; 
                if (isYellowColor(cellBgColor)) isHoliday = true;

                const shiftType = shiftCell.textContent ? shiftCell.textContent.trim().toLowerCase() : '';
                if (shiftType === '') continue;

                const bgColor = shiftCell.style.backgroundColor;
                let hasBlueBackground = isBlueColor(bgColor);
                let hasRedBackground = isRedColor(bgColor);

                const formattedSurname = formatSurnameForNote(employeeName);

                if (hasRedBackground) {
                    notesArray.push(`${formattedSurname}-PN`);
                } else if (hasBlueBackground) {
                    notesArray.push(`${formattedSurname}-D`);
                } else if (shiftType === 'sd' || shiftType === 'sn') {
                    const shiftCellColor = shiftCell.style.color || 'black';
                    const hexColor = rgbToHex(shiftCellColor);
                    
                    const nameFragment = {
                        text: employeeName,
                        font: { color: { argb: 'FF' + hexColor }, size: 14 } 
                    };

                    if (shiftType === 'sd') {
                        if (richTextSd.length > 0) richTextSd.push({ text: ', ', font: { color: { argb: 'FF000000' }, size: 14 } });
                        richTextSd.push(nameFragment);
                        dbScheduleData[day].dayShift.push(employeeName);

                    } else if (shiftType === 'sn') {
                        if (richTextSn.length > 0) richTextSn.push({ text: ', ', font: { color: { argb: 'FF000000' }, size: 14 } });
                        richTextSn.push(nameFragment);
                        dbScheduleData[day].nightShift.push(employeeName);
                    }
                } else {
                    notesArray.push(`${formattedSurname}-${shiftType.toUpperCase()}`);
                }
            }

            if (isHoliday) holidayDays.push(day);

            // Zápis dátumu + nastavenie fontu 14
            sheet.getCell(`A${excelRow}`).value = day;
            sheet.getCell(`C${excelRow}`).value = day;
            sheet.getCell(`A${excelRow}`).alignment = { horizontal: 'center', vertical: 'top' };
            sheet.getCell(`C${excelRow}`).alignment = { horizontal: 'center', vertical: 'top' };
            sheet.getCell(`A${excelRow}`).font = { size: 14 }; 
            sheet.getCell(`C${excelRow}`).font = { size: 14 };

            if (isHoliday) {
                ['A', 'B', 'C', 'D', 'E'].forEach(col => {
                    sheet.getCell(`${col}${excelRow}`).fill = {
                        type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } 
                    };
                });
            } else if (isWeekend(day, monthIndex, year)) {
                sheet.getCell(`A${excelRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
                sheet.getCell(`C${excelRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
            }

            // Nastavenie fontu pre bunky s textom a vloženie RichText
            if (richTextSd.length > 0) {
                const cell = sheet.getCell(`B${excelRow}`);
                cell.font = { size: 14 }; 
                cell.value = { richText: richTextSd };
                cell.alignment = { wrapText: true, vertical: 'top' };
            } else {
                sheet.getCell(`B${excelRow}`).font = { size: 14 };
            }

            if (richTextSn.length > 0) {
                const cell = sheet.getCell(`D${excelRow}`);
                cell.font = { size: 14 };
                cell.value = { richText: richTextSn };
                cell.alignment = { wrapText: true, vertical: 'top' };
            } else {
                 sheet.getCell(`D${excelRow}`).font = { size: 14 };
            }

            if (notesArray.length > 0) {
                const cell = sheet.getCell(`E${excelRow}`);
                cell.value = notesArray.join(', ');
                cell.alignment = { wrapText: true, vertical: 'top' };
                cell.font = { size: 14 };
            }
        }

        addFooterSignatures(sheet); 
        addBorders(sheet, numDays);

        await saveScheduleToFirestore(year, monthIndex, month, dbScheduleData);

        const fileName = `Rozdeľovník_${month}_${year}.xlsx`;
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), fileName); 

        showToast('Rozdeľovník stiahnutý a dáta uložené do DB!', TOAST_TYPE.SUCCESS);

    } catch (err) {
        console.error('Chyba pri generovaní:', err);
        showToast('Chyba pri generovaní: ' + err.message, TOAST_TYPE.ERROR);
    }
}

/**
 * Nová pomocná funkcia pre zápis do Firestore
 */
async function saveScheduleToFirestore(year, monthIndex, monthName, data) {
    if (!_db) {
        console.error("DB objekt nie je dostupný.");
        return;
    }

    // Vytvoríme ID dokumentu, napr. "2025-0" pre Január 2025 (aby sedelo s formátom v dashboarde)
    // monthIndex je 0-based (Január = 0)
    const docId = `${year}-${monthIndex}`;

    try {
        await _db.collection('publishedSchedulesIZS').doc(docId).set({
            year: year,
            monthIndex: monthIndex,
            monthName: monthName,
            days: data, // Tu je štruktúra { "1": {dayShift: [], nightShift: []}, "2": ... }
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: _activeUser ? _activeUser.email : 'unknown'
        });
        console.log(`Dáta pre IZS (${docId}) boli úspešne uložené.`);
    } catch (error) {
        console.error("Chyba pri ukladaní IZS rozpisu do DB:", error);
        throw new Error("Nepodarilo sa uložiť dáta do databázy.");
    }
}

// --- Pôvodná logika pre pätu (ak ste ju nemali v samostatnej funkcii, vložte ju späť do generateRozdelovnik) ---
function addFooterSignatures(sheet) {
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
}

/* ========================================================================== */
/* HELPER FUNCTIONS (Rovnaké ako predtým)                                    */
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
            if (col === 1) border.left = mediumBorder; 
            if (col === 5) border.right = mediumBorder; 
            
            if (col === 1) border.right = mediumBorder;
            if (col === 2) { border.left = mediumBorder; border.right = mediumBorder; }
            if (col === 3) { border.left = mediumBorder; border.right = mediumBorder; }
            if (col === 4) { border.left = mediumBorder; border.right = mediumBorder; }
            if (col === 5) border.left = mediumBorder;

            cell.border = border;
        }
    }
}

function normalizeHexOrArgb(input) {
    if (!input) return null;
    if (typeof input === 'object') return null;
    let hex = String(input).replace(/^#/, '').trim();
    if (hex.length === 8) {
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
        if (!candidate && fill.color && fill.color.theme !== undefined) {
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

function isYellowColor(rgbString) {
    if (!rgbString) return false;
    const parts = rgbString.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (parts) {
        const r = parseInt(parts[1]), g = parseInt(parts[2]), b = parseInt(parts[3]);
        return (r > 200 && g > 200 && b < 100); 
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
        return (r < 50 && g > 100 && b > 200); 
    }
    return false;
}