/* schd_izs_module.js - Modular SDK v9+ */
import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    limit, 
    serverTimestamp 
} from 'firebase/firestore';

import { showToast, TOAST_TYPE } from './utils.js';

/* =================================== */
/* MODUL: Rozpis služieb IZS           */
/* (schd_izs_module.js)                */
/* =================================== */

let _db;
let _activeUser;
let selectedFile = null; 
let selectedScheduleFile = null;
let cisloSpisu = ''; 
let selectedOvertimeFile = null; 

export function initializeIZSModule(db, activeUser) {
    _db = db;
    _activeUser = activeUser;
    
    console.log('Inicializujem modul IZS (Modular)...');
    setupDropZone();         
    setupOvertimeLogic();    
    setupModalListeners();
}

function setupDropZone() {
    const dropZone = document.getElementById('izs-drop-zone');
    const fileInput = document.getElementById('izs-file-input');
    const fileNameDisplay = document.getElementById('izs-file-name');
    const processBtn = document.getElementById('izs-process-btn');
    const clearBtn = document.getElementById('izs-clear-btn');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileSelection(e.target.files[0]);
    });

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

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            selectedFile = null;
            selectedScheduleFile = null;
            cisloSpisu = '';
            fileInput.value = '';
            
            dropZone.classList.remove('file-selected');
            dropZone.innerHTML = `
                <p><strong>Presuňte súbor .xlsx sem</strong></p>
                <p>alebo kliknite pre výber súboru</p>
                <input type="file" id="izs-file-input" accept=".xlsx, .xls" style="display: none;">
            `;
            
            if (fileNameDisplay) {
                fileNameDisplay.classList.add('hidden');
                fileNameDisplay.querySelector('span').textContent = '';
            }

            const modalBody = document.getElementById('izsModalBody');
            if (modalBody) modalBody.innerHTML = '';
        });
    }

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

function setupModalListeners() {
    const closeBtn = document.getElementById('izsCloseModalBtn');
    const modal = document.getElementById('izsPreviewModal');

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }
}

function handleFileSelection(file) {
    const allowedExtensions = ['xlsx', 'xls'];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
        showToast("Nepodporovaný formát súboru. Použite .xlsx.", TOAST_TYPE.ERROR);
        return;
    }

    selectedFile = file;
    selectedScheduleFile = file;
    
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

function setupOvertimeLogic() {
    const dropZone = document.getElementById('izs-overtime-drop-zone');
    const fileInput = document.getElementById('izs-overtime-file-input');
    const fileNameDisplay = document.getElementById('izs-overtime-file-name');
    const processBtn = document.getElementById('izs-overtime-process-btn');
    const clearBtn = document.getElementById('izs-overtime-clear-btn');

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleOvertimeFileSelection(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleOvertimeFileSelection(e.dataTransfer.files[0]);
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            selectedOvertimeFile = null;
            fileInput.value = '';
            
            dropZone.classList.remove('file-selected');
            dropZone.innerHTML = `
                <p><strong>Presuňte súbor .xlsx sem</strong></p>
                <p>alebo kliknite pre výber súboru</p>
                <input type="file" id="izs-overtime-file-input" accept=".xlsx, .xls" style="display: none;">
            `;
            
            if (fileNameDisplay) {
                fileNameDisplay.classList.add('hidden');
                fileNameDisplay.querySelector('span').textContent = '';
            }
        });
    }

    if (processBtn) {
        processBtn.addEventListener('click', () => {
            if (!selectedOvertimeFile) {
                showToast("Najskôr nahrajte súbor s podkladmi pre nadčasy (vpravo).", TOAST_TYPE.ERROR);
                return;
            }
            if (!selectedScheduleFile) {
                showToast("Chýba Plán služieb. Nahrajte prosím súbor aj v ľavej karte.", TOAST_TYPE.WARNING);
                return;
            }
            showToast("Analyzujem plán služieb a nadčasy...", TOAST_TYPE.INFO);
            processOvertimeCalculation(selectedScheduleFile, selectedOvertimeFile);
        });
    }
}

function handleOvertimeFileSelection(file) {
    const allowedExtensions = ['xlsx', 'xls'];
    const fileExtension = file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
        showToast("Nepodporovaný formát. Použite .xlsx.", TOAST_TYPE.ERROR);
        return;
    }

    selectedOvertimeFile = file; 
    
    const dropZone = document.getElementById('izs-overtime-drop-zone');
    const fileNameDisplay = document.getElementById('izs-overtime-file-name');

    if (dropZone) {
        dropZone.classList.add('file-selected');
        dropZone.innerHTML = `
            <i class="fas fa-file-invoice-dollar" style="font-size: 3rem; color: #2b6cb0; margin-bottom: 10px;"></i>
            <p>Súbor pripravený na vyúčtovanie</p>
            <input type="file" id="izs-overtime-file-input" accept=".xlsx, .xls" style="display: none;">
        `;
    }

    if (fileNameDisplay) {
        fileNameDisplay.classList.remove('hidden');
        fileNameDisplay.querySelector('span').textContent = file.name;
    }
}

async function renderTableFromExcel(file) {
    const modal = document.getElementById('izsPreviewModal');
    const modalBody = document.getElementById('izsModalBody');
    
    if (!modal || !modalBody) return;

    modal.classList.remove('hidden');
    modalBody.innerHTML = '<div class="loader" style="margin: 20px auto;"></div><p style="text-align:center; color: #000;">Spracovávam farby a dáta...</p>';

    try {
        const workbook = await XlsxPopulate.fromDataAsync(await file.arrayBuffer());
        let sheet = workbook.activeSheet() || workbook.sheet(0);
        
        let cisloSpisu = '';
        try { cisloSpisu = sheet.cell("C3").value() || ''; } catch (e) {}

        let dateHeaderText = '';
        try { dateHeaderText = sheet.cell("D1").value() || ''; } catch (e) {}

        let monthYearText = dateHeaderText;
        const match = dateHeaderText.match(/na mesiac\s+(.*)/i);
        if (match && match[1]) monthYearText = match[1].trim();

        const range = sheet.range("A13:AI64");
        
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

        const headerRow = document.createElement('tr');
        
        const spisCellElem = document.createElement('td');
        spisCellElem.textContent = cisloSpisu;
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

        for (let r = 0; r < numRows; r++) {
            const tr = document.createElement('tr');
            try {
                const rowHeight = range.cell(r, 0).row().height();
                if (rowHeight < 6) tr.style.display = 'none'; 
            } catch (e) { }

            for (let c = 0; c < numCols; c++) {
                if (c === 1) continue; 

                const cell = range.cell(r, c);
                const td = document.createElement('td');
                const value = cell.value();
                td.textContent = (value === null || typeof value === 'undefined') ? '' : value;

                const fill = safeCellStyle(cell, "fill");
                const bg = extractColorFromFill(fill);
                td.style.backgroundColor = bg ? bg : '#ffffff';

                const fontStyle = safeCellStyle(cell, "fontColor") || safeCellStyle(cell, "color") || safeCellStyle(cell, "font");
                const fg = extractColorFromFont(fontStyle);
                td.style.color = fg ? fg : '#000000';

                td.style.border = '1px solid #ccc';
                td.style.padding = '4px';
                td.style.whiteSpace = 'nowrap';

                if (c === 2) td.style.fontWeight = 'bold';

                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
    
        modalBody.innerHTML = ''; 
        modalBody.appendChild(table);
        
        const modalFooter = document.getElementById('izsModalFooter');
        if (modalFooter) {
            modalFooter.innerHTML = ''; // Vyčistiť staré tlačidlá ak tam sú
            
            const exportBtn = document.createElement('button');
            exportBtn.className = 'ua-btn default';
            exportBtn.innerHTML = 'Stiahnuť Rozdeľovník';
            exportBtn.onclick = generateRozdelovnik;

            modalFooter.appendChild(exportBtn);
        }
        
        showToast(`Načítaný hárok: ${sheet.name()}`, TOAST_TYPE.SUCCESS);

    } catch (err) {
        // ... (error handling ostáva rovnaký) ...
        console.error("Chyba pri spracovaní XLSX:", err);
        modalBody.innerHTML = `<p style="color:red; text-align:center;">Chyba pri spracovaní súboru: ${err.message}</p>`;
        showToast("Chyba pri spracovaní súboru.", TOAST_TYPE.ERROR);
    }
}

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

        sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, horizontalCentered: true, verticalCentered: false };
        sheet.pageSetup.margins = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

        const headerCells = table.querySelectorAll('tr:first-child td');
        const cisloSpisuText = headerCells[0] ? headerCells[0].textContent.trim() : '';
        const titleCell = headerCells[1];
        
        const titleText = titleCell ? titleCell.textContent : '';
        const dateInfo = parseMonthYear(titleText);

        if (!dateInfo) {
            showToast(`Nepodarilo sa zistiť mesiac a rok.`, TOAST_TYPE.ERROR);
            return;
        }

        const { month, year, monthIndex } = dateInfo;
        const numDays = getDaysInMonth(monthIndex, year);
        const dbScheduleData = {}; 

        sheet.getColumn(1).width = 7; sheet.getColumn(2).width = 35; sheet.getColumn(3).width = 7; sheet.getColumn(4).width = 35; sheet.getColumn(5).width = 30;

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

        for (let day = 1; day <= numDays; day++) {
            const excelRow = day + 7;
            const htmlColIndex = firstDayColIndex + (day - 1);

            let richTextSd = [];
            let richTextSn = [];
            let notesArray = [];
            let isHoliday = false;

            dbScheduleData[day] = { dayShift: [], nightShift: [] };

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
                let hasKzBackground = isKzColor(bgColor);

                const formattedSurname = formatSurnameForNote(employeeName);

                if (hasRedBackground) {
                    if (shiftType === 'l' || shiftType === 'ld') notesArray.push(`${formattedSurname}-${shiftType === 'ld' ? 'Ld' : 'L'}`);
                    else notesArray.push(`${formattedSurname}-PN`);
                } else if (hasBlueBackground) {
                    notesArray.push(`${formattedSurname}-D`);
                } else if (hasKzBackground || shiftType === 'kz') { 
                    notesArray.push(`${formattedSurname}-KZ`);
                } else if (shiftType === 'sd' || shiftType === 'sn') {
                    const shiftCellColor = shiftCell.style.color || 'black';
                    const hexColor = rgbToHex(shiftCellColor);
                    
                    const nameFragment = { text: employeeName, font: { color: { argb: 'FF' + hexColor }, size: 14 } };

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
                    notesArray.push(`${formattedSurname}-${shiftType.toUpperCase() === 'LD' ? 'Ld' : shiftType.toUpperCase()}`);
                }
            }

            if (isHoliday) holidayDays.push(day);

            sheet.getCell(`A${excelRow}`).value = day;
            sheet.getCell(`C${excelRow}`).value = day;
            sheet.getCell(`A${excelRow}`).alignment = { horizontal: 'center', vertical: 'top' };
            sheet.getCell(`C${excelRow}`).alignment = { horizontal: 'center', vertical: 'top' };
            sheet.getCell(`A${excelRow}`).font = { size: 14 }; 
            sheet.getCell(`C${excelRow}`).font = { size: 14 };

            if (isHoliday) {
                ['A', 'B', 'C', 'D', 'E'].forEach(col => sheet.getCell(`${col}${excelRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } });
            } else if (isWeekend(day, monthIndex, year)) {
                sheet.getCell(`A${excelRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
                sheet.getCell(`C${excelRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA5A5A5' } };
            }

            if (richTextSd.length > 0) {
                const cell = sheet.getCell(`B${excelRow}`);
                cell.font = { size: 14 }; cell.value = { richText: richTextSd }; cell.alignment = { wrapText: true, vertical: 'top' };
            } else sheet.getCell(`B${excelRow}`).font = { size: 14 };

            if (richTextSn.length > 0) {
                const cell = sheet.getCell(`D${excelRow}`);
                cell.font = { size: 14 }; cell.value = { richText: richTextSn }; cell.alignment = { wrapText: true, vertical: 'top' };
            } else sheet.getCell(`D${excelRow}`).font = { size: 14 };

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

async function saveScheduleToFirestore(year, monthIndex, monthName, data) {
    if (!_db) return;
    const docId = `${year}-${monthIndex}`;
    try {
        // ZMENA: Modular Set Doc
        await setDoc(doc(_db, 'publishedSchedulesIZS', docId), {
            year: year,
            monthIndex: monthIndex,
            monthName: monthName,
            days: data, 
            updatedAt: serverTimestamp(),
            updatedBy: _activeUser ? _activeUser.email : 'unknown'
        });
        console.log(`Dáta pre IZS (${docId}) boli úspešne uložené.`);
    } catch (error) {
        console.error("Chyba pri ukladaní IZS rozpisu do DB:", error);
        throw new Error("Nepodarilo sa uložiť dáta do databázy.");
    }
}

function addFooterSignatures(sheet) {
    sheet.getCell('A39').value = 'čierna farba - pravidelné striedanie služieb'; sheet.getCell('A39').font = { bold: true };
    sheet.getCell('D39').value = 'modrá farba - služby za neprítomných'; sheet.getCell('D39').font = { bold: true, color: { argb: 'FF00B0F0' } };
    sheet.getCell('A42').value = 'Spracoval:'; sheet.getCell('C42').value = 'Schvaľuje:'; sheet.getCell('E42').value = 'Schvaľuje:';
    sheet.getCell('A43').value = 'Mgr. Juraj Tuhársky'; sheet.getCell('C43').value = 'Mgr. Juraj Tuhársky'; sheet.getCell('E43').value = 'Mgr. Mário Banič';
    sheet.getCell('A44').value = 'Ing. Silvia Sklenárová'; sheet.getCell('C44').value = 'vedúci koordinačného strediska IZS'; sheet.getCell('E44').value = 'vedúci odboru krízového riadenia';
}

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
    const monthsMap = { 'január': 0, 'február': 1, 'marec': 2, 'apríl': 3, 'máj': 4, 'jún': 5, 'júl': 6, 'august': 7, 'september': 8, 'október': 9, 'november': 10, 'december': 11 };
    const normalized = text.toLowerCase().trim();
    for (const [monthName, monthIndex] of Object.entries(monthsMap)) {
        if (normalized.includes(monthName)) {
            const yearMatch = normalized.match(/\d{4}/);
            if (yearMatch) return { month: monthName.charAt(0).toUpperCase() + monthName.slice(1), year: parseInt(yearMatch[0]), monthIndex };
        }
    }
    return null;
}

function getDaysInMonth(monthIndex, year) { return new Date(year, monthIndex + 1, 0).getDate(); }
function isWeekend(day, monthIndex, year) { const d = new Date(year, monthIndex, day).getDay(); return d === 0 || d === 6; }
function extractSurname(fullName) {
    const words = fullName.split(/\s+/);
    const surnames = words.filter(word => { const clean = word.replace(/[.,;:]/g, ''); return clean.length >= 2 && clean === clean.toUpperCase(); });
    return surnames.length > 0 ? surnames.join(' ') : fullName;
}
function formatSurnameForNote(surname) { return surname.charAt(0).toUpperCase() + surname.slice(1).toLowerCase(); }
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
function isYellowColor(colorInput) {
    if (!colorInput) return false;
    let r, g, b; const clean = String(colorInput).replace('#', '').trim();
    if (clean.length === 6 && /^[0-9A-Fa-f]{6}$/.test(clean)) {
        r = parseInt(clean.substring(0, 2), 16); g = parseInt(clean.substring(2, 4), 16); b = parseInt(clean.substring(4, 6), 16);
    } else { const parts = colorInput.match(/(\d+),\s*(\d+),\s*(\d+)/); if (parts) { r = parseInt(parts[1]); g = parseInt(parts[2]); b = parseInt(parts[3]); } else return false; }
    return (r > 200 && g > 200 && b < 100); 
}
function isRedColor(rgbString) {
    if (!rgbString) return false;
    const parts = rgbString.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (parts) { const r = parseInt(parts[1]), g = parseInt(parts[2]), b = parseInt(parts[3]); return (r > 200 && g < 100 && b < 100); }
    return false;
}
function isBlueColor(rgbString) {
    if (!rgbString) return false;
    const parts = rgbString.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (parts) { const r = parseInt(parts[1]), g = parseInt(parts[2]), b = parseInt(parts[3]); return (r < 50 && g > 100 && b > 200); }
    return false;
}
function isKzColor(colorInput) {
    if (!colorInput) return false;
    let r, g, b;
    if (colorInput.startsWith('#')) {
        const hex = colorInput.replace('#', '');
        if (hex.length === 6) { r = parseInt(hex.substring(0, 2), 16); g = parseInt(hex.substring(2, 4), 16); b = parseInt(hex.substring(4, 6), 16); } else return false;
    } else { const parts = colorInput.match(/(\d+),\s*(\d+),\s*(\d+)/); if (parts) { r = parseInt(parts[1]); g = parseInt(parts[2]); b = parseInt(parts[3]); } else return false; }
    return Math.abs(r - 217) <= 5 && Math.abs(g - 149) <= 5 && Math.abs(b - 148) <= 5;
}

async function processOvertimeCalculation(scheduleFile, overtimeFile) {
    try {
        const schedWorkbook = await XlsxPopulate.fromDataAsync(await scheduleFile.arrayBuffer());
        let schedSheet = schedWorkbook.activeSheet() || schedWorkbook.sheet(0);
        const overWorkbook = await XlsxPopulate.fromDataAsync(await overtimeFile.arrayBuffer());
        let overSheet = overWorkbook.activeSheet() || overWorkbook.sheet(0);

        const dateCell = schedSheet.cell("D1").value();
        const dateInfo = parseMonthYear(dateCell || "");
        if (!dateInfo) throw new Error("Nepodarilo sa zistiť mesiac a rok.");
        
        const scheduleData = parseScheduleForBilling(schedSheet, dateInfo);
        const absenceData = parseScheduleForAbsences(schedSheet, dateInfo);
        const overtimeData = parseOvertimeFile(overSheet);
        const enrichedScheduleData = await enrichWithEmployeeData(scheduleData);
        const managers = await fetchManagers(); 
        
        let finalData = mergeScheduleAndOvertime(enrichedScheduleData, overtimeData);
        finalData = finalData.map(emp => {
            const empAbsence = absenceData.find(a => a.rawName === emp.rawName);
            return { ...emp, absenceMap: empAbsence ? empAbsence.absenceMap : {} };
        });

        await generateBillingExcel(finalData, dateInfo, managers);

    } catch (error) {
        console.error("Chyba pri spracovaní vyúčtovania:", error);
        showToast("Chyba: " + error.message, TOAST_TYPE.ERROR);
    }
}

function parseOvertimeFile(sheet) {
    const usedRange = sheet.usedRange();
    if (!usedRange) return [];
    const endRow = usedRange.endCell().rowNumber();
    const results = [];
    for (let r = 1; r <= endRow; r++) {
        const cellB = sheet.cell(r, 2).value();
        if (cellB && String(cellB).trim().toLowerCase() === 'dátum') {
            const rawName = sheet.cell(r, 1).value(); 
            if (!rawName) continue;
            const hoursRowIndex = r + 1;
            const shifts60 = extractOvertimePairs(sheet, r, hoursRowIndex, 3, 9);
            const shifts30 = extractOvertimePairs(sheet, r, hoursRowIndex, 11, 15);
            results.push({ rawName: String(rawName).trim(), overtime60: shifts60, overtime30: shifts30 });
        }
    }
    return results;
}

function extractOvertimePairs(sheet, dateRowIdx, hoursRowIdx, startCol, endCol) {
    const shifts = [];
    for (let c = startCol; c <= endCol; c++) {
        const dateVal = sheet.cell(dateRowIdx, c).value();
        const hoursVal = sheet.cell(hoursRowIdx, c).value();
        if (dateVal && hoursVal) {
            let dayNum = null;
            const dateStr = String(dateVal).trim();
            const match = dateStr.match(/^(\d+)/);
            if (match) dayNum = parseInt(match[1], 10);
            let hoursNum = parseFloat(hoursVal);
            if (isNaN(hoursNum)) hoursNum = 0;
            if (dayNum && hoursNum > 0) shifts.push({ day: dayNum, hours: hoursNum });
        }
    }
    return shifts;
}

function mergeScheduleAndOvertime(scheduleData, overtimeData) {
    return scheduleData.map(emp => {
        const empNameNorm = normalizeString(emp.dbName || emp.rawName);
        const ovtMatch = overtimeData.find(ovt => {
            const ovtNameNorm = normalizeString(ovt.rawName);
            return empNameNorm.includes(ovtNameNorm) || ovtNameNorm.includes(empNameNorm);
        });
        return { ...emp, overtime60: ovtMatch ? ovtMatch.overtime60 : [], overtime30: ovtMatch ? ovtMatch.overtime30 : [] };
    });
}

async function enrichWithEmployeeData(parsedData) {
    if (!_db) return parsedData;
    try {
        // ZMENA: Modular Get Docs
        const employeesRef = collection(_db, 'employees');
        const snapshot = await getDocs(employeesRef);
        const dbEmployees = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.meno && data.priezvisko) {
                dbEmployees.push({
                    oec: data.oec || '', titul: data.titul || '', meno: data.meno, priezvisko: data.priezvisko,
                    normMeno: normalizeString(data.meno), normPriezvisko: normalizeString(data.priezvisko)
                });
            }
        });
        return parsedData.map(record => {
            const rawNameNormalized = normalizeString(record.rawName);
            const match = dbEmployees.find(emp => rawNameNormalized.includes(emp.normPriezvisko) && rawNameNormalized.includes(emp.normMeno));
            if (match) {
                const fullNameWithTitle = match.titul ? `${match.titul} ${match.meno} ${match.priezvisko}` : `${match.meno} ${match.priezvisko}`;
                return { ...record, oec: match.oec, dbName: fullNameWithTitle, simpleName: `${match.meno} ${match.priezvisko}` };
            } else return { ...record, oec: '', dbName: record.rawName };
        });
    } catch (error) {
        console.error("Chyba pri párovaní zamestnancov:", error);
        throw new Error("Nepodarilo sa načítať zoznam zamestnancov z databázy.");
    }
}

async function fetchManagers() {
    if (!_db) return { ksIzs: '', okr: '' };
    try {
        const managers = { ksIzs: '', okr: '' };
        
        // ZMENA: Modular Queries
        const employeesRef = collection(_db, 'employees');
        const q1 = query(employeesRef, where('funkcia', '==', 'vedúci oddelenia'), where('oddelenie', '==', 'KS IZS'), limit(1));
        const q2 = query(employeesRef, where('funkcia', '==', 'vedúci odboru'), where('oddelenie', '==', 'odbor krízového riadenia'), limit(1));

        const snap1 = await getDocs(q1);
        if (!snap1.empty) { const d = snap1.docs[0].data(); managers.ksIzs = `${d.titul ? d.titul + ' ' : ''}${d.meno} ${d.priezvisko}`; }

        const snap2 = await getDocs(q2);
        if (!snap2.empty) { const d = snap2.docs[0].data(); managers.okr = `${d.titul ? d.titul + ' ' : ''}${d.meno} ${d.priezvisko}`; }

        return managers;
    } catch (error) {
        console.error("Chyba pri načítaní manažérov:", error);
        return { ksIzs: '', okr: '' };
    }
}

function normalizeString(str) { if (!str) return ""; return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

function parseScheduleForBilling(sheet, dateInfo) {
    const range = sheet.range("A13:AI64");
    const numRows = 64 - 13 + 1;
    const numDays = getDaysInMonth(dateInfo.monthIndex, dateInfo.year); 
    const results = [];

    for (let r = 0; r < numRows; r++) {
        const nameCell = range.cell(r, 2); 
        const fullName = nameCell.value();
        if (!fullName || typeof fullName !== 'string' || fullName.trim() === '' || fullName.includes('Meno')) continue;
        
        // PRIDANÉ: Ak meno obsahuje "náhrad", preskočíme tento riadok
        if (fullName.toLowerCase().includes('náhrad')) continue;

        const employeeRecord = { rawName: fullName.trim(), dayShifts: [], nightShifts: [], saturdayShifts: [], sundayShifts: [], holidayShifts: [] };

        for (let d = 1; d <= numDays; d++) {
            const colIndex = d + 2; const cell = range.cell(r, colIndex);
            const cellValue = cell.value(); const text = cellValue ? String(cellValue).trim().toUpperCase() : "";
            const fill = safeCellStyle(cell, "fill"); const bgRaw = extractColorFromFill(fill); const bgHex = rgbToHex(bgRaw); 

            let isBlue = false; 
            if (bgRaw && bgRaw.toString().includes('rgb')) isBlue = isBlueColor(bgRaw); 
            else isBlue = (bgHex === '00B0F0' || bgHex === '0070C0');

            // --- PRIDANÝ RIADOK: Musíme definovať, čo je polovičný úväzok ---
            const isHalfDay = ['1/2D', '1/2 D', '1/2L', '1/2 L'].includes(text);
            // ---------------------------------------------------------------

            // Teraz už premenná existuje a kód zbehne bez chyby
            if (isBlue && !isHalfDay) continue;

            const isHoliday = isYellowColor(bgHex);
            const dateObj = new Date(dateInfo.year, dateInfo.monthIndex, d);
            const dayOfWeek = dateObj.getDay(); 
            const isSaturday = (dayOfWeek === 6); const isSunday = (dayOfWeek === 0);

            let hours = 0; let nightSurchargeHours = 0; let isDay = false; let isNight = false;

            // Úprava: Pridaná logika pre 1/2 úväzky (6 hodín)
            if (text === 'SD') { 
                isDay = true; 
                hours = 12; 
            } 
            else if (text === 'SN') { 
                isNight = true; 
                hours = 12; 
                nightSurchargeHours = 8; 
            }
            else if (['1/2D', '1/2 D', '1/2L', '1/2 L'].includes(text)) {
                // Ak je to polovičná dovolenka alebo lekár, rátame 6 hodín
                isDay = true;
                hours = 6;
            }

            if (hours > 0) {
                if (isDay) employeeRecord.dayShifts.push({ day: d, hours: hours });
                if (isNight) employeeRecord.nightShifts.push({ day: d, hours: nightSurchargeHours });
                if (isSaturday) employeeRecord.saturdayShifts.push({ day: d, hours: hours });
                if (isSunday) employeeRecord.sundayShifts.push({ day: d, hours: hours });
                if (isHoliday) employeeRecord.holidayShifts.push({ day: d, hours: hours });
            }
        }
        results.push(employeeRecord);
    }
    return results;
}

function parseScheduleForAbsences(sheet, dateInfo) {
    const range = sheet.range("A13:AI64");
    const numRows = 64 - 13 + 1;
    const numDays = getDaysInMonth(dateInfo.monthIndex, dateInfo.year);
    const results = [];

    for (let r = 0; r < numRows; r++) {
        const nameCell = range.cell(r, 2); 
        const fullName = nameCell.value();
        if (!fullName || typeof fullName !== 'string' || fullName.trim() === '' || fullName.includes('Meno')) continue;
        
        // PRIDANÉ: Ignorovanie náhradníkov
        if (fullName.toLowerCase().includes('náhrad')) continue;

        const absences = {}; 
        for (let d = 1; d <= numDays; d++) {
            const colIndex = d + 2; 
            const cell = range.cell(r, colIndex);
            const cellValue = cell.value(); 
            
            // 1. Definujeme text a upperText HNEĎ NA ZAČIATKU
            const text = cellValue ? String(cellValue).trim() : ""; 
            const upperText = text.toUpperCase();

            const fill = safeCellStyle(cell, "fill"); 
            const bgRaw = extractColorFromFill(fill); 
            const bgHex = rgbToHex(bgRaw);
            
            // Detekcia farieb
            const isRed = (bgHex === 'FF0000') || isRedColor(bgRaw);
            let isBlue = false; 
            if (bgRaw && bgRaw.toString().includes('rgb')) isBlue = isBlueColor(bgRaw); 
            else isBlue = (bgHex === '00B0F0' || bgHex === '0070C0');

            // Definujeme, čo je polovičný úväzok
            const isHalfDay = ['1/2D', '1/2 D', '1/2L', '1/2 L'].includes(text);

            let reason = null;
            
            // 2. LOGIKA PRE ČERVENÚ FARBU (S VÝNIMKAMI)
            if (isRed) {
                if (upperText === 'L') {
                    reason = 'lekár';
                } else if (upperText === 'LD') {
                    reason = 'lekár doprovod';
                } else if (upperText === '1/2L' || upperText === '1/2 L') {
                    reason = '1/2 lekár';
                } else {
                    // Ak je červená a nie je tam L/Ld, tak je to PN
                    reason = "PN"; 
                }
            } 
            // 3. LOGIKA PRE MODRÚ FARBU
            else if (isBlue) {
                if (upperText === 'D') {
                    reason = "dovolenka";
                } 
                else if (upperText === '1/2D' || upperText === '1/2 D') {
                    reason = "1/2 dovolenka";
                }
            } 
            // 4. LOGIKA LEN PODĽA TEXTU (ak nie je farba)
            else if (text) {
                if (upperText === 'PN') reason = 'PN'; 
                else if (upperText === 'L') reason = 'lekár'; 
                else if (upperText === '1/2L') reason = '1/2 lekár'; 
                else if (upperText === 'LD') reason = 'lekár doprovod'; 
                else if (upperText === 'KZ') reason = 'KZ'; 
                else if (upperText === 'ŠK') reason = 'porada';
            }
            
            if (reason) { 
                if (!absences[reason]) absences[reason] = []; 
                absences[reason].push(d); 
            }
        }
        if (Object.keys(absences).length > 0) results.push({ rawName: fullName.trim(), absenceMap: absences });
    }
    return results;
}

async function generateBillingExcel(data, dateInfo, managers) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Vyúčtovanie');

    sheet.pageSetup = { 
        orientation: 'landscape', // Orientácia na šírku
        paperSize: 9,             // Formát A4 (kód 9)
        fitToPage: true,          // Povoliť prispôsobenie
        fitToWidth: 1,            // Vtesnať všetky stĺpce na 1 stranu šírky
        fitToHeight: 0,            // Výšku nechať automatickú (0 = auto), aby sa riadky nedeformovali, ak je ich veľa
        margins: {
            top: 1,      // Horný okraj: 1
            bottom: 1,   // Spodný okraj: 1
            left: 1.5,   // Ľavý (štandardný)
            right: 1.5,  // Pravý (štandardný)
            header: 0.3, // Hlavička
            footer: 0.3  // Päta
        }
    };

    sheet.columns = [
        { header: 'OEC', key: 'oec', width: 14 }, { header: 'Meno a Priezvisko', key: 'name', width: 35 }, 
        { header: 'Nočná služba\ndeň (hodiny)', key: 'night_s', width: 36 }, { header: 'Sobota\ndeň (hodiny)', key: 'sat_s', width: 36 },      
        { header: 'Nedeľa\ndeň (hodiny)', key: 'sun_s', width: 36 }, { header: 'Sviatok\ndeň (hodiny)', key: 'holiday_s', width: 36 },
        { header: 'Nadčas 60%\ndeň (hodiny)', key: 'ovt60_s', width: 36 }, { header: 'Nadčas 30%\ndeň (hodiny)', key: 'ovt30_s', width: 36 }  
    ];

    const titleText = `Prehľad o odslúžených hodinách ${dateInfo.month} ${dateInfo.year}`;
    sheet.insertRow(1, [titleText]);
    sheet.mergeCells('A1:H1');
    const titleRow = sheet.getRow(1); titleRow.height = 36; titleRow.font = { name: 'Calibri', size: 14, bold: true }; titleRow.alignment = { vertical: 'middle', horizontal: 'left' };
    
    const headerRow = sheet.getRow(2); headerRow.height = 40; headerRow.font = { name: 'Calibri', size: 14, bold: true }; headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => { if (colNumber <= 8) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } }; cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } }; } });

    data.forEach(emp => {
        const formatShifts = (shifts) => { if (!shifts || shifts.length === 0) return ''; return shifts.map(s => `${s.day}. (${s.hours}h)`).join(', '); };
        let oecValue = emp.oec; if (oecValue && !isNaN(oecValue) && String(oecValue).trim() !== '') oecValue = Number(oecValue);

        const dataRow = sheet.addRow({ oec: oecValue, name: emp.dbName, night_s: formatShifts(emp.nightShifts), sat_s: formatShifts(emp.saturdayShifts), sun_s: formatShifts(emp.sundayShifts), holiday_s: formatShifts(emp.holidayShifts), ovt60_s: formatShifts(emp.overtime60), ovt30_s: formatShifts(emp.overtime30) });
        dataRow.height = 90; // Nastavenie pevnej výšky riadka
        dataRow.font = { name: 'Calibri', size: 14 }; dataRow.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }; dataRow.getCell('oec').alignment = { vertical: 'top', horizontal: 'center' };
        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => { if (colNumber <= 8) { cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; } });

        const sumHours = (arr) => (arr || []).reduce((acc, curr) => acc + curr.hours, 0);
        const summaryRow = sheet.addRow({ oec: '', name: 'Spolu hodín', night_s: sumHours(emp.nightShifts) > 0 ? sumHours(emp.nightShifts) + ' h' : '', sat_s: sumHours(emp.saturdayShifts) > 0 ? sumHours(emp.saturdayShifts) + ' h' : '', sun_s: sumHours(emp.sundayShifts) > 0 ? sumHours(emp.sundayShifts) + ' h' : '', holiday_s: sumHours(emp.holidayShifts) > 0 ? sumHours(emp.holidayShifts) + ' h' : '', ovt60_s: sumHours(emp.overtime60) > 0 ? sumHours(emp.overtime60) + ' h' : '', ovt30_s: sumHours(emp.overtime30) > 0 ? sumHours(emp.overtime30) + ' h' : '' });
        summaryRow.height = 27; summaryRow.font = { name: 'Calibri', size: 14, bold: true }; summaryRow.getCell('name').alignment = { horizontal: 'right', vertical: 'middle' };
        [3,4,5,6,7,8].forEach(c => summaryRow.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' });
        summaryRow.eachCell({ includeEmpty: true }, (cell, colNumber) => { if (colNumber <= 8) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; cell.border = { left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } }; } });
    });

    const lastRowTable1 = sheet.lastRow.number;
    const startRowTable2 = lastRowTable1 + 4; 
    sheet.mergeCells(startRowTable2, 3, startRowTable2, 6);
    const headerRow2 = sheet.getRow(startRowTable2);
    headerRow2.getCell(1).value = 'OEC'; headerRow2.getCell(2).value = 'Meno Priezvisko'; headerRow2.getCell(3).value = 'Dátum / Dôvod neprítomnosti';
    headerRow2.height = 30; headerRow2.font = { name: 'Calibri', size: 14, bold: true }; headerRow2.alignment = { vertical: 'middle', horizontal: 'center' };
    [1, 2, 3].forEach(colIdx => { const cell = headerRow2.getCell(colIdx); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } }; cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } }; });

    let currentRowIdx = startRowTable2 + 1;
    data.forEach(emp => {
        if (emp.absenceMap && Object.keys(emp.absenceMap).length > 0) {
            const absenceStrings = [];
            for (const [reason, days] of Object.entries(emp.absenceMap)) { const sortedDays = days.sort((a, b) => a - b); absenceStrings.push(`${sortedDays.join(', ')} (${reason})`); }
            const absenceText = absenceStrings.join('; ');
            sheet.mergeCells(currentRowIdx, 3, currentRowIdx, 6);
            const row = sheet.getRow(currentRowIdx);
            let oecValue = emp.oec; if (oecValue && !isNaN(oecValue) && String(oecValue).trim() !== '') oecValue = Number(oecValue);
            row.getCell(1).value = oecValue; row.getCell(2).value = emp.dbName; row.getCell(3).value = absenceText; 
            row.font = { name: 'Calibri', size: 14 }; row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' }; row.getCell(2).alignment = { vertical: 'top', horizontal: 'left', wrapText: false }; row.getCell(3).alignment = { vertical: 'top', horizontal: 'left', wrapText: false }; 
            [1, 2, 3].forEach(colIdx => { row.getCell(colIdx).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
            currentRowIdx++;
        }
    });

    const signatureRowIndex = currentRowIdx + 8;

    const rowSignNames = sheet.getRow(signatureRowIndex);
    const cellC_Name = rowSignNames.getCell(3); // Stĺpec C
    cellC_Name.value = managers?.ksIzs || ''; 
    cellC_Name.font = { name: 'Calibri', size: 11, bold: false }; 
    cellC_Name.alignment = { horizontal: 'center' }; 
    cellC_Name.border = { top: { style: 'thin' } }; 

    const cellF_Name = rowSignNames.getCell(6); // Stĺpec F
    cellF_Name.value = managers?.okr || ''; 
    cellF_Name.font = { name: 'Calibri', size: 11, bold: false }; 
    cellF_Name.alignment = { horizontal: 'center' }; 
    cellF_Name.border = { top: { style: 'thin' } }; 

    const rowSignTitles = sheet.getRow(signatureRowIndex + 1); // Riadok pod menami
    const cellC_Title = rowSignTitles.getCell(3); 
    cellC_Title.value = "vedúci Koordinačného strediska IZS"; 
    cellC_Title.font = { name: 'Calibri', size: 10 }; 
    cellC_Title.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };

    const cellF_Title = rowSignTitles.getCell(6); 
    cellF_Title.value = "vedúci odboru krízového riadenia"; 
    cellF_Title.font = { name: 'Calibri', size: 10 }; 
    cellF_Title.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Vyuctovanie_IZS_${dateInfo.month}_${dateInfo.year}.xlsx`;
    saveAs(new Blob([buffer]), fileName);
    
    showToast(`Súbor ${fileName} bol úspešne vygenerovaný.`, TOAST_TYPE.SUCCESS);
}