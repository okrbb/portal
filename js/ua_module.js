/* ua_module.js - Modular SDK v9+ */
import { 
    collection, 
    getDocs 
} from 'firebase/firestore';

import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';
// PRIDANÉ: Import pre detekciu demo režimu
import { isDemoUser } from './demo_mode.js'; 
// ✅ PRIDANÉ: Lazy loader pre XLSX
import { lazyLoader } from './lazy_loader.js';
import { IDs } from './id-registry.js';

// ✅ PRIDANÉ: Store subscription cleanup
let unsubscribeStore = null;

// Tento súbor obsahuje VŠETKU logiku z vášho samostatného projektu,
// zabalenú do jednej funkcie, aby sa nespustila skôr, ako ju zavoláme.

export function initializeUAModule(db, activeUser) { 
    
    console.log('Inicializujem modul Príspevky UA (Modular)...');
    
    // ✅ CLEANUP predchádzajúceho subscription
    if (unsubscribeStore) {
        unsubscribeStore();
    }
    
    // ✅ NOVÉ subscription - UA modul nepotrebuje priamy store subscribe
    // (dáta sa načítavajú z Firestore parametrov)

    // --- KONTROLA OPRÁVNENÍ ---
    if (!Permissions.canViewModule(activeUser, IDs.UA.MODULE)) {
        console.error("UA Modul: Prístup zamietnutý. Nemáte oprávnenie na tento modul.");
        showToast("Nemáte oprávnenie pristupovať k modulu Príspevky UA.", TOAST_TYPE.ERROR);
        return;
    }
    // --- KONIEC KONTROLY ---

    // 1. Premenné pre dáta
    let excelData = [];
    let obceData = {};
    let emailData = {}; 

    let globalMesiac = ''; 
    let globalRok = '';    

    // ===================================
    // KROK 1: Načítanie databázy e-mailov
    // ===================================
    
    if (!db) {
        console.error('Kritická chyba: Firestore databáza (db) nebola poskytnutá modulu UA.');
        // V demo režime nemusíme blokovať ak chýba DB, ale tu DB zrejme je, len práva chýbajú.
        if (!isDemoUser(activeUser.email)) {
             alert('CHYBA: Nepodarilo sa inicializovať prepojenie na databázu. Modul Príspevky UA sa nemôže spustiť.');
             return; 
        }
    }

    console.log('Pripravujem načítanie e-mailov obcí...');

    // --- NOVÁ LOGIKA: Rozhodovanie medzi Demo a Real dátami ---
    const loadEmailsPromise = () => {
        if (isDemoUser(activeUser.email)) {
            console.log("🔥 DEMO REŽIM: Používam simulované dáta pre obce (obchádzam Firestore).");
            // Vrátime simulovaný zoznam, ktorý sa tvári ako Firestore Snapshot
            const mockSnapshot = [
                { id: 'Obec Testov', data: () => ({ email: 'starosta@testov.sk' }) },
                { id: 'Mesto Ukážkovo', data: () => ({ email: 'primator@ukazkovo.sk' }) },
                { id: 'Horná Dolná', data: () => ({ email: 'obec@hornadolna.sk' }) },
                { id: 'Banská Bystrica', data: () => ({ email: 'podatelna@banskabystrica.sk' }) }
            ];
            return Promise.resolve(mockSnapshot);
        } else {
            console.log("REÁLNY REŽIM: Sťahujem dáta z Firestore (towns_em)...");
            const townsRef = collection(db, "towns_em");
            return getDocs(townsRef);
        }
    };
    
    // Spustenie načítania
    loadEmailsPromise()
        .then(querySnapshot => {
            
            const tempEmailData = {};
            
            // Spracovanie snapshotu (funguje pre real aj demo dáta)
            querySnapshot.forEach(doc => {
                // Ošetrenie: v Demo mocku je .data funkcia, vo Firestore SDK tiež, ale pre istotu
                const data = typeof doc.data === 'function' ? doc.data() : doc.data;
                const id = doc.id; // Názov obce
                
                if (data.email) {
                    tempEmailData[id] = data.email;
                } else {
                    console.warn(`Obec ${id} nemá vyplnený e-mail.`);
                }
            });

            emailData = tempEmailData; 
            console.log(`Úspešne načítaných ${Object.keys(emailData).length} e-mailov.`);

            // 2. Selektory na elementy
            const dropZone = document.getElementById(IDs.UA.DROP_ZONE);
            const fileInput = document.getElementById(IDs.UA.FILE_INPUT); 
            const processBtn = document.getElementById(IDs.UA.PROCESS_BTN);
            const clearBtn = document.getElementById(IDs.UA.CLEAR_BTN);
            const fileNameDisplay = document.getElementById(IDs.UA.FILE_NAME_DISPLAY); 

            const dropZoneStrong = dropZone.querySelector('strong');
            const dropZoneP = dropZone.querySelector('p:nth-child(2)');
            
            const emailForm = document.getElementById(IDs.UA.EMAIL_FORM);
            const emailSelect = document.getElementById(IDs.UA.EMAIL_SELECT);
            const generateEmailBtn = document.getElementById(IDs.UA.GENERATE_EMAIL_BTN);
            const emailSubject = document.getElementById(IDs.UA.EMAIL_SUBJECT);
            const emailBody = document.getElementById(IDs.UA.EMAIL_BODY);
            // ✅ OPRAVA: Správne názvy konštánt z IDs.UA
            const processResultsDisplay = document.getElementById(IDs.UA.RESULTS_DISPLAY);
            const processResultsList = document.getElementById(IDs.UA.RESULTS_LIST);

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
            // ✅ UPRAVENÉ: Pridané async pre lazy loading
            processBtn.addEventListener('click', async () => {
                if (!currentFile) {
                    showToast('Prosím, vyberte alebo presuňte súbor Excel.', TOAST_TYPE.ERROR);
                    return;
                }

                // --- START ANIMÁCIE ---
                const originalContent = processBtn.innerHTML;
                processBtn.innerHTML = '<i class="fas fa-spinner"></i> Spracovávam...';
                processBtn.classList.add('btn-loading');
                processBtn.disabled = true;

                showToast('Spracovávam súbor...', TOAST_TYPE.INFO);

                // ✅ LAZY LOADING: Načítame XLSX knižnicu pred spracovaním
                let XLSX;
                try {
                    const libs = await lazyLoader.loadExcelBundle();
                    XLSX = libs.XLSX;
                } catch (err) {
                    console.error('Chyba pri načítaní XLSX knižnice:', err);
                    showToast('Chyba: Nepodarilo sa načítať nástroje pre prácu s Excelom.', TOAST_TYPE.ERROR);
                    processBtn.innerHTML = originalContent;
                    processBtn.classList.remove('btn-loading');
                    processBtn.disabled = false;
                    return;
                }

                const reader = new FileReader();

                reader.onload = (event) => {
                    try {
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
                    } catch (err) {
                        console.error(err);
                        showToast('Chyba pri spracovaní dát.', TOAST_TYPE.ERROR);
                    } finally {
                        // --- KONIEC ANIMÁCIE ---
                        processBtn.innerHTML = originalContent;
                        processBtn.classList.remove('btn-loading');
                        processBtn.disabled = false;
                    }
                };

                reader.onerror = () => {
                    processBtn.innerHTML = originalContent;
                    processBtn.classList.remove('btn-loading');
                    processBtn.disabled = false;
                    showToast('Nepodarilo sa načítať súbor.', TOAST_TYPE.ERROR);
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
            // ✅ UPRAVENÉ: Pridané async pre asynchrónny call generateExcelForObec
            generateEmailBtn.addEventListener('click', async () => {
                const selectedObec = emailSelect.value;
                if (!selectedObec) {
                    showToast('Prosím, vyberte obec zo zoznamu.', TOAST_TYPE.ERROR);
                    return;
                }

                // --- START ANIMÁCIE ---
                const originalContent = generateEmailBtn.innerHTML;
                generateEmailBtn.innerHTML = '<i class="fas fa-spinner"></i> Generujem...';
                generateEmailBtn.classList.add('btn-loading');
                generateEmailBtn.disabled = true;

                try {
                    const subject = emailSubject.value;
                    const body = emailBody.value;
                    
                    const email = emailData[selectedObec] || '';
                    
                    // ✅ UPRAVENÉ: Voláme asynchrónnu verziu
                    await generateExcelForObec(selectedObec); 

                    navigator.clipboard.writeText(body).then(() => {
                        showToast('Telo e-mailu skopírované. Otváram e-mailového klienta...', TOAST_TYPE.SUCCESS);
                    }).catch(err => {
                        console.error('Chyba: ', err);
                    });

                    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    window.location.href = mailtoLink;
                } catch (err) {
                    console.error(err);
                    showToast('Chyba pri generovaní výstupu.', TOAST_TYPE.ERROR);
                } finally {
                    // --- KONIEC ANIMÁCIE (Ukončí sa po otvorení mailto a vygenerovaní súboru) ---
                    // Malé oneskorenie, aby používateľ stihol zaregistrovať animáciu pred stiahnutím
                    setTimeout(() => {
                        generateEmailBtn.innerHTML = originalContent;
                        generateEmailBtn.classList.remove('btn-loading');
                        generateEmailBtn.disabled = false;
                    }, 500);
                }
            });

            // 8. Funkcia na generovanie XLSX
            // ✅ UPRAVENÉ: Funkcia je teraz async a využíva lazyLoader
            async function generateExcelForObec(obec) {
                const dataPreObec = obceData[obec];
                if (!dataPreObec) {
                    showToast('Chyba: Dáta pre obec neboli nájdené.', TOAST_TYPE.ERROR);
                    return;
                }

                // ✅ LAZY LOADING: Načítame XLSX a FileSaver
                let XLSX, saveAs;
                try {
                    const libs = await lazyLoader.loadExcelBundle();
                    XLSX = libs.XLSX;
                    saveAs = libs.FileSaver; // V lazy_loader.js je to namapované na window.saveAs
                } catch (error) {
                    console.error('Chyba pri načítaní exportných knižníc:', error);
                    showToast('Chyba: Knižnica pre export sa nepodarila načítať.', TOAST_TYPE.ERROR);
                    throw error;
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
            console.error('Kritická chyba pri inicializácii UA modulu:', e);
            
            // Špecifická hláška pre Permission chybu v Demo režime (ak by bypass zlyhal)
            if (isDemoUser(activeUser.email) && e.code === 'permission-denied') {
                 showToast('Chyba oprávnení v Demo režime. Skontrolujte nastavenie mock dát.', TOAST_TYPE.WARNING);
            } else {
                 alert('CHYBA: Nepodarilo sa načítať dáta pre modul UA. Skontrolujte pripojenie k internetu.');
            }
        });
}

/**
 * ✅ PRIDANÉ: Cleanup funkcia (volať pri module unload)
 */
export function cleanupUAModule() {
    if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
    }
    console.log("[UAModule] Cleanup completed.");
}