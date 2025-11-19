import { showToast, TOAST_TYPE } from './utils.js';
import { resetEditMode } from './edit_module.js';
import { Permissions } from './accesses.js';

/* =================================== */
/* MODUL PRE ADMIN PANEL (Ľudské zdroje) */
/* (emp_module.js)                   */
/* =================================== */

let _allEmployeesData = null;
let paymentGrades = new Map();
let jobDescriptions = {};
let localActiveUser = null;

// --- NOVÁ FUNKCIA: Aktivácia exportu z iných modulov ---
export function activateGlobalExport(user, employeesData) {
    localActiveUser = user;
    _allEmployeesData = employeesData;

    const exportBtn = document.querySelector('#export-excel-btn');
    if (exportBtn) {
        // Odstránime staré listenery (ak by sa funkcia volala viackrát)
        const newBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newBtn, exportBtn);
        
        // Nastavíme viditeľnosť a funkčnosť
        if (Permissions.canExportEmployees(localActiveUser)) {
            newBtn.classList.remove('hidden');
            newBtn.disabled = false;
            newBtn.setAttribute('title', 'Stiahnuť zoznam (XLSX)');
            newBtn.addEventListener('click', exportEmployeesToExcel);
            console.log('Export tlačidlo aktivované globálne.');
        } else {
            newBtn.classList.add('hidden');
        }
    }
}

// --- Funkcia exportu zamestnancov (zostáva v tomto module) ---
function exportEmployeesToExcel() {
    // Kontrola oprávnenia na export
    if (!Permissions.canExportEmployees(localActiveUser)) {
        showToast('Nemáte oprávnenie na exportovanie údajov.', TOAST_TYPE.ERROR);
        return;
    }

    if (typeof XLSX === 'undefined') {
        showToast('Chyba: Knižnica pre export chýba.', TOAST_TYPE.ERROR);
        return;
    }
    
    if (!_allEmployeesData || _allEmployeesData.size === 0) {
        showToast('Chyba: Dáta zamestnancov nie sú k dispozícii.', TOAST_TYPE.ERROR);
        return;
    }

    console.log('Exportujem zamestnancov...');
    
    const allEmployeesArray = Array.from(_allEmployeesData.values());
    const employeesToExport = filterEmployeesForExport(allEmployeesArray); 

    if (employeesToExport.length === 0) {
        showToast('Nenašli sa žiadni zamestnanci na export.', TOAST_TYPE.ERROR);
        return;
    }

    const headers = [
        "P. č.", "Názov oddelenia", "Funkcia", "Kód", "OEČ", "Titul", "Meno",
        "Priezvisko", "Adresa", "Služobný kontakt", "Súkromný kontakt", "E-mail", "Nástup", "Platová trieda"
    ];

    const data = employeesToExport.map((emp, index) => {
        let sluzobny_kontakt = '';
        let sukromny_kontakt = '';
        const kontakt = emp.kontakt || ''; 
        if (kontakt.includes(',')) {
            const parts = kontakt.split(',');
            sluzobny_kontakt = parts[0] ? parts[0].trim() : '';
            sukromny_kontakt = parts[1] ? parts[1].trim() : '';
        } else if (kontakt.trim() !== 'null' && kontakt.trim() !== '') {
            sukromny_kontakt = kontakt.trim();
        }
        const oddelenie = emp.oddelenie || '';
        const finalOddelenie = oddelenie.trim() === 'odbor krízového riadenia' ? 'OKR' : oddelenie;
        return [
            index + 1, finalOddelenie, emp.funkcia || '', emp.kod || '', emp.oec || '', 
            emp.titul || '', emp.meno || '', emp.priezvisko || '',
            (emp.adresa && emp.adresa !== 'null') ? emp.adresa : '',
            sluzobny_kontakt, sukromny_kontakt,
            emp.mail || '',
            (emp.nastup && emp.nastup !== 'null') ? emp.nastup : '',
            emp.platova_trieda || ''
        ];
    });

    const sheetData = [headers, ...data];

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        if (ws['!ref']) {
            ws['!autofilter'] = { ref: ws['!ref'] };
        }
        
        ws['!cols'] = [
            { wch: 5 }, { wch: 9 }, { wch: 18 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, 
            { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 25 },
            { wch: 9 }, { wch: 9 }
        ];
        const range = XLSX.utils.decode_range(ws['!ref']);
        const adresaColIndex = 8; 
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r: r, c: c });
                let cell = ws[cellAddress];
                if (!cell) cell = ws[cellAddress] = { t: 's', v: '' };
                if (!cell.s) cell.s = {};
                if (!cell.s.alignment) cell.s.alignment = {};
                if (!cell.s.font) cell.s.font = {};
                cell.s.alignment.horizontal = "left";
                cell.s.alignment.vertical = "center";
                if (r === 0) {
                    cell.s.alignment.wrapText = true;
                    cell.s.font.bold = true;
                }
                if (c === adresaColIndex) cell.s.alignment.wrapText = true;
            }
        }
        
        XLSX.utils.book_append_sheet(wb, ws, "Zoznam zamestnancov");
        
        let filename = "zamestnanci";
        if (localActiveUser && localActiveUser.funkcia === 'vedúci odboru') filename += "_OKR";
        else if (localActiveUser && localActiveUser.funkcia === 'vedúci oddelenia') filename += "_" + (localActiveUser.oddelenie || 'X');
        filename += ".xlsx";

        XLSX.writeFile(wb, filename);

    } catch (error) {
        console.error('Chyba pri vytváraní XLSX súboru:', error);
        showToast('Nastala chyba pri vytváraní súboru.', TOAST_TYPE.ERROR);
    }
}

export function buildDescriptionHtml(data) {
    if (!data) return ''; 

    let html = '';
    const topMargin = 'style="margin-top: 1.5rem;"'; 

    if (data['Najnáročnejšia činnosť (charakteristika platovej triedy)']) {
        html += `<h3><b>Najnáročnejšia činnosť (charakteristika platovej triedy)</b></h3>`;
        if (Array.isArray(data['Najnáročnejšia činnosť (charakteristika platovej triedy)'])) {
            html += '<ul>';
            data['Najnáročnejšia činnosť (charakteristika platovej triedy)'].forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += '</ul>';
        } else {
            html += `<p>${data['Najnáročnejšia činnosť (charakteristika platovej triedy)'].replace(/\n/g, '<br>')}</p>`;
        }
    }
    
    if (data['Bližšie určená najnáročnejšia činnosť']) {
        html += `<h3 ${topMargin}><b>Bližšie určená najnáročnejšia činnosť</b></h3>`;
        
        if (Array.isArray(data['Bližšie určená najnáročnejšia činnosť'])) {
            html += '<ul>';
            data['Bližšie určená najnáročnejšia činnosť'].forEach(item => {
                if (item === "Ďalej: ") {
                    html += `<li class="list-subheading">${item}</li>`;
                } else {
                    const style = item.trim().startsWith('na úseku') ? ' style="margin-left: 20px;"' : '';
                    html += `<li${style}>${item}</li>`;
                }
            });
            html += '</ul>';
        } else {
            let textBlock = data['Bližšie určená najnáročnejšia činnosť'];
            textBlock = textBlock.replace(/\n/g, '<br>');
            html += `<p>${textBlock}</p>`;
        }
    }

    if (data['Ďalšia činnosť (charakteristika platovej triedy)']) {
        html += `<h3 ${topMargin}><b>Ďalšia činnosť (charakteristika platovej triedy)</b></h3>`;
        if (Array.isArray(data['Ďalšia činnosť (charakteristika platovej triedy)'])) {
             html += '<ul>';
            data['Ďalšia činnosť (charakteristika platovej triedy)'].forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += '</ul>';
        } else {
            html += `<p>${data['Ďalšia činnosť (charakteristika platovej triedy)'].replace(/\n/g, '<br>')}</p>`;
        }
    }

    if (data['Bližšie určená ďalšia činnosť']) {
        html += `<h3 ${topMargin}><b>Bližšie určená ďalšia činnosť</b></h3>`;

        if (Array.isArray(data['Bližšie určená ďalšia činnosť'])) {
            html += '<ul>';
            data['Bližšie určená ďalšia činnosť'].forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += '</ul>';
        } else {
            let textBlock = data['Bližšie určená ďalšia činnosť'];
            textBlock = textBlock.replace(/\n/g, '<br>');
            html += `<p>${textBlock}</p>`;
        }
    }
    
    if (data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre']) {
        html += `<h3 ${topMargin}><b>Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre</b></h3>`;
        
        if (Array.isArray(data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'])) {
            html += '<ul>';
            data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'].forEach(item => {
                html += `<li>${item}</li>`;
            });
            html += '</ul>';
        } else {
            let textBlock = data['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'];
            textBlock = textBlock.replace(/\n/g, '<br>');
            html += `<p>${textBlock}</p>`;
        }
    }
    
    return html;
}

export function clearEmployeeDetails() {
    const personalInfoCard = document.querySelector('#personal-info .info-list');
    if (personalInfoCard) {
        personalInfoCard.innerHTML = `
            <dt>Titul</dt><dd>---</dd>
            <dt>Meno</dt><dd>---</dd>
            <dt>Priezvisko</dt><dd>---</dd>
            <dt>Adresa</dt><dd>---</dd>
            <dt>Kontakt</dt><dd>---</dd>
            <dt>Nástup</dt><dd>---</dd>
        `;
    }

    const jobInfoCardBlock = document.querySelector('#job-info .info-block');
    const jobInfoCardHeader = document.querySelector('#job-info .card-header');
    
    if (jobInfoCardBlock) {
        jobInfoCardBlock.innerHTML = `
            <h3>Platová trieda</h3>
            <p class="salary-grade">Trieda ---</p>
            <h3>Funkcia</h3>
            <p>---</p>
            <h3>Príplatky</h3>
            <p>---</p>
        `;
    }

    if (jobInfoCardHeader) {
        let kodSpan = jobInfoCardHeader.querySelector('.employee-job-code');
        if (kodSpan) {
            kodSpan.textContent = '---';
        }
    }
    
    const serviceCard = document.querySelector('#service-description-card');
    const mainCardsContainer = document.querySelector('#admin-panel-module .cards-container');
    if (serviceCard) {
        serviceCard.classList.add('hidden'); 
    }
    if (mainCardsContainer) {
        mainCardsContainer.classList.remove('hidden'); 
    }
}

export function displayEmployeeDetails(employee, forceNoRightsMessage = false) {
    if (typeof resetEditMode === 'function') {
        resetEditMode();
    }
    
    const personalInfoCard = document.querySelector('#personal-info');
    const personalInfoList = document.querySelector('#personal-info .info-list');
    const jobInfoCardBlock = document.querySelector('#job-info .info-block');
    const jobInfoCardHeader = document.querySelector('#job-info .card-header');
    const serviceCard = document.querySelector('#service-description-card');

    if (!employee || forceNoRightsMessage) {
        clearEmployeeDetails();
        const placeholderText = forceNoRightsMessage 
            ? 'Nemáte oprávnenie vidieť detaily tohto zamestnanca.' 
            : 'Vyberte zamestnanca z globálneho zoznamu vpravo.';
            
        if (personalInfoCard) {
             personalInfoCard.querySelector('p').textContent = placeholderText;
             personalInfoCard.dataset.currentEmpId = "";
        }
        return;
    }

    // --- Zobrazenie dát ---
    
    if (personalInfoCard && employee.id) {
        personalInfoCard.dataset.currentEmpId = employee.id;
        const placeholder = personalInfoCard.querySelector('p');
        if (placeholder) placeholder.style.display = 'none';
    }

    if (personalInfoList) {
        personalInfoList.innerHTML = `
            <dt>Titul</dt><dd>${employee.titul || '---'}</dd>
            <dt>Meno</dt><dd>${employee.meno || '---'}</dd>
            <dt>Priezvisko</dt><dd>${employee.priezvisko || '---'}</dd>
            <dt>Adresa</dt><dd>${employee.adresa ? employee.adresa.replace(', ', '<br>') : '---'}</dd>
            <dt>Kontakt</dt><dd>${employee.kontakt ? employee.kontakt.replace(', ', '<br>') : '---'}</dd>
            <dt>Nástup</dt><dd>${employee.nastup || '---'}</dd>
        `;
    }

    if (jobInfoCardBlock && jobInfoCardHeader) {
        let extrasList = '';
        if (employee.osobny_priplatok) extrasList += `<li>Osobný príplatok: <span class="salary-tariff">${employee.osobny_priplatok} €</span></li>`;
        if (employee.zmennost_pohotovost) extrasList += `<li>Zmennosť/Pohotovosť: ${employee.zmennost_pohotovost} €</li>`;
        if (employee.vedenie_vozidla) extrasList += `<li>Vedenie vozidla: ${employee.vedenie_vozidla} €</li>`;
        if (employee.starostlivost_vozidlo) extrasList += `<li>Starostlivosť o vozidlo: ${employee.starostlivost_vozidlo} €</li>`;
        if (extrasList === '') extrasList = '<li>Žiadne ďalšie príplatky.</li>';

        const trieda = employee.platova_trieda || '?';
        const tarifa = paymentGrades.get(String(employee.platova_trieda)); 

        const tariffHtml = tarifa !== undefined 
            ? ` <span class="salary-tariff">- ${tarifa.toFixed(2)} €</span>` 
            : '';

        let idsContainer = jobInfoCardHeader.querySelector('.employee-ids-container');
        const oldSpan = jobInfoCardHeader.querySelector('.employee-job-code');
        if (oldSpan) oldSpan.remove();
        const oldWrapper = jobInfoCardHeader.querySelector('.employee-job-code-wrapper');
        if (oldWrapper) oldWrapper.remove();

        if (!idsContainer) {
            idsContainer = document.createElement('div');
            idsContainer.className = 'employee-ids-container';
            jobInfoCardHeader.appendChild(idsContainer);
        }

        const oecValue = employee.oec ? employee.oec : '---';
        const kodValue = employee.kod || '---';

        idsContainer.innerHTML = `
            <div class="id-row oec-text" title="OEČ">${oecValue}</div>
            <div class="id-row kod-text" title="Kód zamestnanca">${kodValue}</div>
        `;

        jobInfoCardBlock.innerHTML = `
            <h3>Platová trieda</h3>
            <p class="salary-grade">Trieda ${trieda}${tariffHtml}</p>
            <h3>Funkcia</h3>
            <p>${employee.oddelenie || 'Nezaradený'}: <strong>${employee.funkcia || 'Nezadaná funkcia'}</strong></p>
            <h3>Príplatky</h3>
            <ul>${extrasList}</ul>
        `;
    }
    
    if (serviceCard) {
        let opisCinnostiHtml = '';
        let descriptionDataToShow = null;

        if (employee.customDescription) {
            descriptionDataToShow = employee.customDescription;
        } 
        else {
            const baseKey = employee.kod; 
            let effectiveKey = baseKey; 
            let baseData = jobDescriptions[baseKey];

            if (!baseData) {
                if (employee.oddelenie === 'KS IZS' && employee.platova_trieda == 5) effectiveKey = '5_ISZ';
                else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda == 6) effectiveKey = '6_ISZ';
                else if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda == 5) effectiveKey = '5_OCOaKP';
                else if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda == 6) effectiveKey = '6_OCOaKP';
                baseData = jobDescriptions[effectiveKey];
            }

            if (baseData) {
                descriptionDataToShow = JSON.parse(JSON.stringify(baseData));
                let keyToCompare = null;
                if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda == 5) keyToCompare = '5_OCOaKP';
                else if (employee.oddelenie === 'OCOaKP' && employee.platova_trieda == 6) keyToCompare = '6_OCOaKP';
                else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda == 5) keyToCompare = '5_ISZ';
                else if (employee.oddelenie === 'KS IZS' && employee.platova_trieda == 6) keyToCompare = '6_ISZ';

                if (keyToCompare && effectiveKey !== keyToCompare) {
                    const additionalData = jobDescriptions[keyToCompare];
                    if (additionalData) {
                        for (const sectionKey in additionalData) {
                            const baseSection = descriptionDataToShow[sectionKey];
                            const addSection = additionalData[sectionKey];
                            if (!baseSection) {
                                descriptionDataToShow[sectionKey] = addSection;
                            } else {
                                const baseIsArray = Array.isArray(baseSection);
                                const addIsArray = Array.isArray(addSection);
                                if (baseIsArray && addIsArray) descriptionDataToShow[sectionKey] = baseSection.concat(addSection);
                                else if (!baseIsArray && addIsArray) descriptionDataToShow[sectionKey] = [baseSection].concat(addSection);
                                else if (baseIsArray && !addIsArray) descriptionDataToShow[sectionKey] = baseSection.concat([addSection]);
                                else {
                                    const processedBase = String(baseSection).replace(/\n/g, '<br>');
                                    const processedAdd = String(addSection).replace(/\n/g, '<br>');
                                    descriptionDataToShow[sectionKey] = processedBase + "<br><br>" + processedAdd;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!descriptionDataToShow) {
            const kod = employee.kod || 'nezadaný';
            opisCinnostiHtml = `<p>Opis služobnej činnosti pre tohto zamestnanca (kód: ${kod}) zatiaľ nebol zadaný.</p>`;
        } else {
            opisCinnostiHtml = buildDescriptionHtml(descriptionDataToShow);
        }
        
        const serviceCardContent = serviceCard.querySelector('.info-block.scrollable-content');
        if(serviceCardContent) {
            serviceCardContent.innerHTML = opisCinnostiHtml;
        }

        const closeBtn = serviceCard.querySelector('#close-service-description');
        const mainCardsContainer = document.querySelector('#admin-panel-module .cards-container'); 
        
        if (closeBtn && mainCardsContainer) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

            newCloseBtn.addEventListener('click', () => {
                serviceCard.classList.add('hidden'); 
                mainCardsContainer.classList.remove('hidden'); 
            });
        }
    }
}

function filterEmployeesForExport(allEmployeesArray) {
    const isVedúciOdboru = localActiveUser.funkcia === 'vedúci odboru';
    const isVedúciOddelenia = localActiveUser.funkcia === 'vedúci oddelenia';

    let employeesToExport = [];

    if (isVedúciOdboru) {
        employeesToExport = [...allEmployeesArray];
        employeesToExport.sort((a, b) => {
            const getPriority = (emp) => {
                const f = (emp.funkcia || '').toLowerCase();
                const o = (emp.oddelenie || '').toLowerCase();
                if (f === 'vedúci odboru') return 1;
                if (f === 'vedúci oddelenia' && o.includes('ocoakp')) return 2;
                if (o.includes('ocoakp')) return 3;
                if (f === 'vedúci oddelenia' && o.includes('izs')) return 4;
                if (o.includes('izs') || o.includes('ks izs')) return 5;
                return 6;
            };
            const priorityA = getPriority(a);
            const priorityB = getPriority(b);
            if (priorityA !== priorityB) return priorityA - priorityB;
            return (a.priezvisko || '').localeCompare(b.priezvisko || '', 'sk');
        });

    } else if (isVedúciOddelenia) {
        employeesToExport = allEmployeesArray.filter(emp => emp.oddelenie === localActiveUser.oddelenie);
        employeesToExport.sort((a, b) => {
            const isLeaderA = (a.funkcia || '').toLowerCase() === 'vedúci oddelenia';
            const isLeaderB = (b.funkcia || '').toLowerCase() === 'vedúci oddelenia';
            if (isLeaderA && !isLeaderB) return -1;
            if (!isLeaderA && isLeaderB) return 1;
            return (a.priezvisko || '').localeCompare(b.priezvisko || '', 'sk');
        });
    } else {
         employeesToExport = allEmployeesArray.filter(emp => emp.mail.toLowerCase() === localActiveUser.email.toLowerCase());
         employeesToExport.sort((a, b) => (a.priezvisko || '').localeCompare(b.priezvisko || '', 'sk'));
    }
    
    return employeesToExport;
}

export async function initializeAdminModule(db, activeUser, employeesData) { 
    console.log('Inicializujem Admin modul...');

    _allEmployeesData = employeesData;
    localActiveUser = activeUser;

    // Export button aktivujeme tu, alebo v mainWizard.js. Ak je v mainWizard, tu môžeme len overiť.
    // Pre istotu ho tu zavoláme, aby sme mali aktualizované dáta
    activateGlobalExport(activeUser, employeesData);

    // --- INICIALIZÁCIA DÁT PRE ADMIN PANEL ---

    try {
        console.log("Admin Modul: Načítavam platové tarify...");
        const paymentSnapshot = await db.collection("payments").get(); 
        paymentGrades.clear(); 
        paymentSnapshot.forEach(doc => {
            const item = doc.data();
            if (item.platova_trieda !== undefined && item.platova_tarifa !== undefined) {
                paymentGrades.set(item.platova_trieda, parseFloat(item.platova_tarifa));
            }
        });
        console.log(`Admin Modul: Načítaných ${paymentGrades.size} platových taríf.`);

        console.log("Admin Modul: Načítavam opisy práce...");
        const jobDescSnapshot = await db.collection("jobDescriptions").get(); 
        jobDescriptions = {}; 
        jobDescSnapshot.forEach((doc) => {
            jobDescriptions[doc.id] = doc.data(); 
        });
        console.log(`Admin Modul: Načítaných ${Object.keys(jobDescriptions).length} opisov práce.`);

    } catch (error) {
        console.error('Admin Modul: Nepodarilo sa načítať dáta (tarify/opisy):', error);
    }
    
    // Automatické zobrazenie detailov prihláseného používateľa (ak má právo)
    if (activeUser && activeUser.email && _allEmployeesData && _allEmployeesData.size > 0) {
        let fullActiveUser = _allEmployeesData.get(activeUser.id);
        
        // Ak sa nenašiel, nájdeme ho podľa e-mailu (kvôli rôznym ID)
        if (!fullActiveUser) {
            for (const employee of _allEmployeesData.values()) {
                if (employee.mail && employee.mail.toLowerCase() === activeUser.email.toLowerCase()) {
                    fullActiveUser = employee;
                    break;
                }
            }
        }
        
        if (fullActiveUser) {
            displayEmployeeDetails(fullActiveUser);
        } else {
            console.warn("Profil prihláseného používateľa sa nenašiel v mape allEmployeesData.");
            clearEmployeeDetails();
        }
    } else {
        clearEmployeeDetails();
    }
    
    // Listenery pre UI (prepínanie karty opisu práce)
    const adminMainPanel = document.getElementById('admin-panel-module');
    const cardsContainer = document.querySelector('#admin-panel-module .cards-container'); 
    const serviceCard = document.querySelector('#service-description-card'); 

    if (adminMainPanel && cardsContainer && serviceCard) {
        adminMainPanel.addEventListener('click', (e) => {
            const titleTarget = e.target.closest('#show-service-description');
            if (titleTarget) {
                e.preventDefault();
                cardsContainer.classList.add('hidden');
                serviceCard.classList.remove('hidden');
            }

            const closeTarget = e.target.closest('#close-service-description');
            if (closeTarget) {
                e.preventDefault();
                serviceCard.classList.add('hidden');
                cardsContainer.classList.remove('hidden');
            }
        });
    }
    
    // Poznámka: Všetka logika pre logovanie (sťahovanie, mazanie) bola presunutá do logs_module.js
}