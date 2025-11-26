import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';

// Tento súbor obsahuje VŠETKU logiku z vášho samostatného projektu,
// zabalenú do jednej funkcie, aby sa nespustila skôr, ako ju zavoláme.

export function initializeUAModule(db, activeUser) { 
    
    console.log('Inicializujem modul Príspevky UA...');

    // --- KONTROLA OPRÁVNENÍ ---
    if (!Permissions.canViewModule(activeUser, 'ua-contributions-module')) {
        console.error("UA Modul: Prístup zamietnutý. Nemáte oprávnenie na tento modul.");
        showToast("Nemáte oprávnenie pristupovať k modulu Príspevky UA.", TOAST_TYPE.ERROR);
        return;
    }
    // --- KONIEC KONTROLY ---

    // 1. Premenné pre dáta
    let excelData = [];
    let obceData = {};
    let emailData = {}; // Táto premenná sa naplní z Firestore

    let globalMesiac = ''; 
    let globalRok = '';    

    // ===================================
    // KROK 1: Načítanie databázy e-mailov z Firestore
    // ===================================
    
    if (!db) {
        console.error('Kritická chyba: Firestore databáza (db) nebola poskytnutá modulu UA.');
        alert('CHYBA: Nepodarilo sa inicializovať prepojenie na databázu. Modul Príspevky UA sa nemôže spustiť.');
        return; 
    }

    console.log('Načítavam e-maily obcí z Firestore (kolekcia towns_em)...');
    
    db.collection("towns_em").get()
        .then(querySnapshot => {
            
            const tempEmailData = {};
            querySnapshot.forEach(doc => {
                const data = doc.data();
                if (data.email) {
                    tempEmailData[doc.id] = data.email;
                } else {
                    console.warn(`Obec ${doc.id} v databáze towns_em nemá vyplnený e-mail.`);
                }
            });

            emailData = tempEmailData; 
            console.log(`Úspešne načítaných ${Object.keys(emailData).length} e-mailov z Firestore.`);

            // 2. Selektory na elementy
            const dropZone = document.getElementById('dropZone');
            const fileInput = document.getElementById('fileInput'); 
            const processBtn = document.getElementById('processBtn');
            const clearBtn = document.getElementById('clearBtn');
            const fileNameDisplay = document.getElementById('fileNameDisplay'); 

            const dropZoneStrong = dropZone.querySelector('strong');
            const dropZoneP = dropZone.querySelector('p:nth-child(2)');
            
            const emailForm = document.getElementById('emailForm');
            const emailSelect = document.getElementById('emailSelect');
            const generateEmailBtn = document.getElementById('generateEmailBtn');
            const emailSubject = document.getElementById('emailSubject');
            const emailBody = document.getElementById('emailBody');
            const processResultsDisplay = document.getElementById('processResultsDisplay');
            const processResultsList = document.getElementById('processResultsList');

            let currentFile = null; 
            const originalDropZoneStrong = dropZoneStrong.innerHTML;
            const originalDropZoneP = dropZoneP.innerHTML;

            // ===================================
            // 3. Obsluha Drag & Drop a tlačidiel
            // ===================================

            dropZone.addEventListener('click', () => {
                fileInput.click();
            });

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFile(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    handleFile(e.target.files[0]);
                }
            });

            function handleFile(file) {
                currentFile = file; 
                dropZoneStrong.textContent = 'Vybraný súbor:';
                dropZoneP.textContent = file.name;
                dropZone.classList.add('file-selected');
            }

            // Listener pre tlačidlo "Spracovať"
            processBtn.addEventListener('click', () => {
                if (!currentFile) {
                    showToast('Prosím, vyberte alebo presuňte súbor Excel.', TOAST_TYPE.ERROR);
                    return;
                }

                showToast('Spracovávam súbor...', TOAST_TYPE.INFO);

                const reader = new FileReader();

                reader.onload = (event) => {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    
                    excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    excelData = excelData.filter(row => row.length > 0 && row[0] !== null); 
                    
                    if (excelData.length <= 1) {
                        showToast('Súbor je prázdny alebo neobsahuje hlavičku.', TOAST_TYPE.ERROR);
                        clearModuleState(); 
                        return;
                    }

                    processData(excelData);
                };

                reader.readAsArrayBuffer(currentFile);
            });

            // Listener pre tlačidlo "Vymazať"
            clearBtn.addEventListener('click', () => {
                clearModuleState();
            });

            function clearModuleState() {
                currentFile = null;
                fileInput.value = ''; 
                
                dropZoneStrong.innerHTML = originalDropZoneStrong;
                dropZoneP.innerHTML = originalDropZoneP;
                dropZone.classList.remove('file-selected');
                
                excelData = [];
                obceData = {};
                globalMesiac = ''; 
                globalRok = '';    

                emailSelect.innerHTML = '<option value="">-- Vyberte obec --</option>';
                emailSubject.value = '';
                emailBody.value = '';

                if (processResultsDisplay && processResultsList) {
                    processResultsList.innerHTML = '<li class="empty-state">...</li>';
                    processResultsList.classList.remove('empty');
                }
            }

            // 4. Funkcia na spracovanie dát
            function processData(data) {
                obceData = {}; 
                globalMesiac = ''; 
                globalRok = '';    
                const header = data[0]; 
                
                const ovmIndex = header.indexOf('ovm');
                const mesiacIndex = header.indexOf('mesiac'); 
                const rokIndex = header.indexOf('rok');       

                if (ovmIndex === -1) {
                    showToast('Chyba: V súbore chýba stĺpec "ovm".', TOAST_TYPE.ERROR);
                    return;
                }
                
                if (mesiacIndex === -1 || rokIndex === -1) {
                    showToast('Chyba: V súbore chýbajú stĺpce "mesiac" alebo "rok".', TOAST_TYPE.ERROR);
                    return;
                }

                if (data.length > 1) {
                    globalMesiac = data[1][mesiacIndex];
                    globalRok = data[1][rokIndex];
                } else {
                    showToast('Chyba: Súbor neobsahuje žiadne dátové riadky.', TOAST_TYPE.ERROR);
                    return;
                }

                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    const ovm = row[ovmIndex];
                    
                    if (ovm) {
                        if (!obceData[ovm]) {
                            obceData[ovm] = [header]; 
                        }
                        obceData[ovm].push(row);
                    }
                }

                if (processResultsDisplay && processResultsList) {
                    processResultsList.innerHTML = ''; 
                    
                    const obce = Object.keys(obceData);
                    obce.sort(); 

                    if (obce.length > 0) {
                        obce.forEach(obec => {
                            const pocetZaznamov = obceData[obec].length - 1; 
                            
                            const li = document.createElement('li');
                            const nazovSpan = document.createElement('span');
                            nazovSpan.textContent = obec;
                            
                            const pocetSpan = document.createElement('span');
                            let zaznamText = 'záznamov';
                            if (pocetZaznamov === 1) zaznamText = 'záznam';
                            else if (pocetZaznamov >= 2 && pocetZaznamov <= 4) zaznamText = 'záznamy';
                            
                            pocetSpan.innerHTML = `<strong>${pocetZaznamov}</strong> ${zaznamText}`;
                            
                            li.appendChild(nazovSpan);
                            li.appendChild(pocetSpan);
                            processResultsList.appendChild(li);
                        });
                        processResultsList.classList.remove('empty');
                    } else {
                        processResultsList.innerHTML = '<li class="empty-state">Nenašli sa žiadne relevantné dáta.</li>';
                        processResultsList.classList.remove('empty'); 
                    }
                    
                    processResultsDisplay.classList.remove('hidden'); 
                }
                
                displayOvmList(Object.keys(obceData));

                showToast(`Súbor úspešne spracovaný. Nájdených ${Object.keys(obceData).length} obcí.`, TOAST_TYPE.SUCCESS);
            }

            // 5. Funkcia na zobrazenie zoznamu obcí
            function displayOvmList(obce) {
                emailSelect.innerHTML = '<option value="">-- Vyberte obec --</option>'; 

                if (obce.length === 0) {
                    return;
                }

                obce.sort().forEach(obec => {
                    const option = document.createElement('option');
                    option.value = obec;
                    option.textContent = obec;
                    emailSelect.appendChild(option);
                });
            }

            // 6. Náhľad e-mailu
            function updateEmailPreview() {
                const selectedObec = emailSelect.value;
                
                if (!selectedObec) {
                    emailSubject.value = '';
                    emailBody.value = '';
                    return;
                }

                const subject = `Schválené výkazy za ubytovanie (UA) - ${globalMesiac} ${globalRok} ${selectedObec}`;
                emailSubject.value = subject;

                const body = `Dobrý deň,

v prílohe Vám zasielam spracované dáta k vyplateniu príspevkov za ubytovanie pre obec/mesto ${selectedObec}.
Prípadné krátenie príspevku a jeho dôvod nájdete priamo v priloženom súbore (stĺpce Y a Z).

S pozdravom


`;
                emailBody.value = body;
            }

            emailSelect.addEventListener('change', updateEmailPreview);

            // 7. Listener na tlačidlo "Stiahnuť a odoslať"
            generateEmailBtn.addEventListener('click', () => {
                const selectedObec = emailSelect.value;
                if (!selectedObec) {
                    showToast('Prosím, vyberte obec zo zoznamu.', TOAST_TYPE.ERROR);
                    return;
                }

                const subject = emailSubject.value;
                const body = emailBody.value;
                const email = emailData[selectedObec] || '';
                
                generateExcelForObec(selectedObec); 

                navigator.clipboard.writeText(body).then(() => {
                    showToast('Telo e-mailu skopírované. Otváram e-mailového klienta...', TOAST_TYPE.SUCCESS);
                }).catch(err => {
                    console.error('Chyba: Nepodarilo sa skopírovať text do schránky: ', err);
                    showToast('Chyba: Telo e-mailu sa nepodarilo skopírovať.', TOAST_TYPE.ERROR);
                });

                const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                window.location.href = mailtoLink;
            });

            // 8. Funkcia na generovanie XLSX
            function generateExcelForObec(obec) {
                const dataPreObec = obceData[obec];
                if (!dataPreObec) {
                    showToast('Chyba: Dáta pre obec neboli nájdené.', TOAST_TYPE.ERROR);
                    return;
                }

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(dataPreObec);
                
                const cols = [];
                const header = dataPreObec[0];
                for(let i = 0; i < header.length; i++) {
                    let maxLen = header[i].length;
                    for(let j = 1; j < dataPreObec.length; j++) {
                        const cell = dataPreObec[j][i];
                        if (cell) {
                            const len = cell.toString().length;
                            if (len > maxLen) {
                                maxLen = len;
                            }
                        }
                    }
                    cols.push({ wch: maxLen + 2 }); 
                }
                ws['!cols'] = cols;

                XLSX.utils.book_append_sheet(wb, ws, "Dáta");
                
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
                function s2ab(s) {
                    const buf = new ArrayBuffer(s.length);
                    const view = new Uint8Array(buf);
                    for (let i=0; i<s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
                    return buf;
                }
                
                const fileName = `Príspevok_UA_${obec}.xlsx`;
                saveAs(new Blob([s2ab(wbout)], {type:"application/octet-stream"}), fileName);
                showToast(`Príloha "${fileName}" sa sťahuje...`, TOAST_TYPE.INFO);
            }

        })
        .catch(e => {
            console.error('Kritická chyba: Nepodarilo sa načítať dáta z Firestore (kolekcia towns_em).', e);
            alert('CHYBA: Nepodarilo sa načítať databázu e-mailov z Firestore. Modul Príspevky UA sa nemôže spustiť. Skontrolujte konzolu (F12) a pripojenie k internetu.');
        });
}