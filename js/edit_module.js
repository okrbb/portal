import { showToast, TOAST_TYPE } from './utils.js';
import { displayEmployeeDetails, clearEmployeeDetails } from './emp_module.js';
import { Permissions } from './accesses.js';

/* =================================== */
/* MODUL PRE EDITOVANIE (edit.js)      */
/* =================================== */

let isEditMode = false;
let isAddMode = false; 

// 1. Lokálne premenné
let _allEmployeesData = null;
let _db = null;
let _activeUser = null; // Uložený aktívny používateľ pre kontrolu oprávnení

// 2. Upravená inicializačná funkcia
export function initializeEditModule(db, employeesData, activeUser) { 
    console.log("Inicializujem Edit Modul...");

    // Uloženie referencií
    _db = db;
    _allEmployeesData = employeesData;
    _activeUser = activeUser; // Uložíme používateľa poslaného z mainWizard.js

    if (!_activeUser) {
        console.warn("EditModule: activeUser nebol poskytnutý pri inicializácii.");
    }

    initializeDeleteLogic();
    initializeAddLogic();
    
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            cancelEditAction();
        });
    }
    
    // Tlačidlo "Pridať" skryjeme pri štarte (zobrazí sa len ak má user práva)
    const addBtn = document.getElementById('add-employee-btn');
    if (addBtn) addBtn.classList.add('hidden');
}

export function initializeAddLogic() {
    const addBtn = document.getElementById('add-employee-btn');
    
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            // Kontrola oprávnenia (Centrálna logika)
            if (!Permissions.canAddEmployee(_activeUser)) {
                 showToast('Nemáte oprávnenie pridávať nových zamestnancov.', TOAST_TYPE.ERROR);
                 return;
            }
            startAddMode();
        });
    }
}

/**
 * Spustí režim pridávania nového zamestnanca
 */
function startAddMode() {
    if (typeof clearEmployeeDetails === 'function') {
        clearEmployeeDetails();
    }

    isEditMode = true;
    isAddMode = true;

    const editBtn = document.getElementById('edit-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const addBtn = document.getElementById('add-employee-btn'); 
    const deleteBtn = document.getElementById('delete-employee-btn');
    const personalInfoCard = document.getElementById('personal-info');

    if (personalInfoCard) {
        personalInfoCard.dataset.currentEmpId = "new"; // Použijeme "new" pre pridávanie
    }

    if (cancelBtn) cancelBtn.classList.remove('hidden');
    if (addBtn) addBtn.classList.add('hidden');
    if (deleteBtn) deleteBtn.classList.add('hidden');

    if (editBtn) {
        editBtn.classList.add('active-edit-mode');
        const icon = editBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-pen-to-square');
            icon.classList.add('fa-save');
        }
    }

    const emptyEmployee = {
        titul: '', meno: '', priezvisko: '', adresa: '', kontakt: '', nastup: '',
        platova_trieda: '', oddelenie: '', funkcia: '',
        osobny_priplatok: 0, zmennost_pohotovost: 0, vedenie_vozidla: 0, starostlivost_vozidlo: 0,
        kod: '', oec: ''
    };

    renderEditView(emptyEmployee);
    showToast("Režim pridávania nového zamestnanca.", TOAST_TYPE.INFO);
}

/**
 * Nastaví listenery pre modálne okno a tlačidlo mazania
 */
function initializeDeleteLogic() {
    const deleteBtn = document.getElementById('delete-employee-btn');
    const modalOverlay = document.getElementById('delete-employee-overlay');
    const confirmBtn = document.getElementById('btn-confirm-delete-emp');
    const cancelModalBtn = document.getElementById('btn-cancel-delete-emp');

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const personalInfoCard = document.getElementById('personal-info');
            const currentEmpId = personalInfoCard ? personalInfoCard.dataset.currentEmpId : null;

            if (!currentEmpId) {
                showToast("Chyba: Žiadny zamestnanec nie je vybraný.", TOAST_TYPE.ERROR);
                return;
            }
            
            // Kontrola oprávnenia pred zobrazením modálu (Centrálna logika)
            const empData = _allEmployeesData.get(currentEmpId); 
            if (!Permissions.canDeleteEmployee(_activeUser, empData)) {
                 showToast('Nemáte oprávnenie vymazať tohto zamestnanca.', TOAST_TYPE.ERROR);
                 return;
            }

            if (modalOverlay && _allEmployeesData) { 
                const empName = empData ? `${empData.meno} ${empData.priezvisko}` : 'Neznámy zamestnanec';
                
                const messageParagraph = modalOverlay.querySelector('p');
                if (messageParagraph) {
                    messageParagraph.innerHTML = `Naozaj chcete permanentne zmazať zamestnanca <span style="color: #E53E3E; font-weight: bold;">${empName}</span> z databázy?`;
                }
                modalOverlay.classList.remove('hidden');
            }
        });
    }

    if (cancelModalBtn && modalOverlay) {
        cancelModalBtn.addEventListener('click', () => {
            modalOverlay.classList.add('hidden');
        });
    }

    if (confirmBtn && modalOverlay) {
        confirmBtn.addEventListener('click', async () => {
            const personalInfoCard = document.getElementById('personal-info');
            const currentEmpId = personalInfoCard ? personalInfoCard.dataset.currentEmpId : null;

            if (!currentEmpId) return;
            if (!_db) { console.error("DB not initialized in edit module"); return; }
            
            // Dvojitá kontrola oprávnenia
            const empData = _allEmployeesData.get(currentEmpId);
            if (!Permissions.canDeleteEmployee(_activeUser, empData)) {
                 showToast('Nemáte oprávnenie vymazať tohto zamestnanca.', TOAST_TYPE.ERROR);
                 modalOverlay.classList.add('hidden');
                 return;
            }

            confirmBtn.classList.add('loading');
            confirmBtn.disabled = true;
            cancelModalBtn.disabled = true;

            try {
                console.log(`Mažem zamestnanca ID: ${currentEmpId}...`);
                await _db.collection("employees").doc(currentEmpId).delete();

                if (_allEmployeesData && _allEmployeesData.has(currentEmpId)) {
                    _allEmployeesData.delete(currentEmpId);
                }

                showToast("Zamestnanec bol úspešne vymazaný.", TOAST_TYPE.SUCCESS);
                modalOverlay.classList.add('hidden');
                
                cancelEditAction(); 
                
                clearEmployeeDetails();

            } catch (error) {
                console.error("Chyba pri mazaní zamestnanca:", error);
                showToast("Chyba pri mazaní: " + error.message, TOAST_TYPE.ERROR);
            } finally {
                confirmBtn.classList.remove('loading');
                confirmBtn.disabled = false;
                cancelModalBtn.disabled = false;
            }
        });
    }
}


/**
 * Hlavná funkcia volaná po kliknutí na tlačidlo Editovať (alebo Uložiť).
 */
export async function toggleEditMode() {
    const personalInfoCard = document.getElementById('personal-info');
    if (!personalInfoCard) return;

    const currentEmpId = personalInfoCard.dataset.currentEmpId;
    const currentEmployee = _allEmployeesData.get(currentEmpId);

    // Krok 0: Kontrola OPRÁVNENÍ pre editáciu (Centrálna logika)
    // Ak sme v AddMode, kontrola už prebehla v initializeAddLogic.
    if (!isAddMode) {
        if (!_activeUser) {
            showToast("Chyba: Používateľské dáta nie sú dostupné.", TOAST_TYPE.ERROR);
            return;
        }

        if (!currentEmployee) {
            showToast("Chyba: Žiadny zamestnanec nie je vybraný.", TOAST_TYPE.ERROR);
            return;
        }

        if (!Permissions.canEditEmployee(_activeUser, currentEmployee)) {
             showToast("Nemáte oprávnenie editovať detaily tohto zamestnanca.", TOAST_TYPE.ERROR);
             return;
        }
    }
    
    const editBtn = document.getElementById('edit-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const addBtn = document.getElementById('add-employee-btn');
    const deleteBtn = document.getElementById('delete-employee-btn');
    
    if (!isEditMode) {
        // START EDIT
        isEditMode = true;
        isAddMode = false;
        
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        // Tlačidlo "Pridať" zobrazíme iba ak má právo
        if (addBtn && Permissions.canAddEmployee(_activeUser)) {
             addBtn.classList.remove('hidden');
        }
        
        // Zobraziť delete len ak máme právo a nie sme v add mode
        if (currentEmployee && Permissions.canDeleteEmployee(_activeUser, currentEmployee)) {
            if (deleteBtn) deleteBtn.classList.remove('hidden');
        } else if (deleteBtn) {
            deleteBtn.classList.add('hidden');
        }

        if (editBtn) {
            editBtn.classList.add('active-edit-mode');
            const icon = editBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-pen-to-square');
                icon.classList.add('fa-save');
            }
        }

        const employee = _allEmployeesData.get(currentEmpId);
        renderEditView(employee);
        showToast("Aktivovaný mód editovania", TOAST_TYPE.INFO);

    } else {
        // SAVE
        console.log("EditMode: Začínam zbierať dáta...");
        const updatedData = gatherFormData();

        if (!updatedData.meno || !updatedData.priezvisko) {
            showToast("Chyba: Meno a Priezvisko sú povinné.", TOAST_TYPE.ERROR);
            return;
        }
        
        if (!_db) { console.error("DB not initialized"); return; }

        try {
            let newDocId = currentEmpId;

            if (isAddMode) {
                if (!updatedData.kod) {
                    showToast("Chyba: Pri pridávaní musí byť vyplnený Kód (bude ID).", TOAST_TYPE.ERROR);
                    return; 
                }

                newDocId = updatedData.kod; 
                const docRef = _db.collection("employees").doc(newDocId);
                const docSnap = await docRef.get();

                if (docSnap.exists) {
                    showToast(`Chyba: Zamestnanec s kódom ${newDocId} už existuje!`, TOAST_TYPE.ERROR);
                    return; 
                }

                await docRef.set(updatedData);
                updatedData.id = newDocId;
                showToast("Nový zamestnanec bol vytvorený.", TOAST_TYPE.SUCCESS);
                
            } else {
                await _db.collection("employees").doc(currentEmpId).update(updatedData);
                showToast("Zmeny boli úspešne uložené.", TOAST_TYPE.SUCCESS);
            }

            let mergedData;
            if (isAddMode) {
                mergedData = { ...updatedData };
            } else {
                const originalData = _allEmployeesData.get(currentEmpId);
                mergedData = { ...originalData, ...updatedData };
            }
            
            mergedData.displayName = `${mergedData.titul || ''} ${mergedData.meno} ${mergedData.priezvisko}`.trim();
            mergedData.displayFunkcia = mergedData.funkcia || 'Nezaradený';
            mergedData.id = newDocId;

            _allEmployeesData.set(newDocId, mergedData);

            // Reset stavov
            isEditMode = false;
            isAddMode = false;

            if (cancelBtn) cancelBtn.classList.add('hidden');
            if (addBtn) addBtn.classList.add('hidden');
            if (deleteBtn) deleteBtn.classList.add('hidden');

            if (editBtn) {
                editBtn.classList.remove('active-edit-mode');
                const icon = editBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-save');
                    icon.classList.add('fa-pen-to-square');
                }
            }

            // Cleanup UI
            const jobWrapper = document.querySelector('.employee-job-code-wrapper');
            if (jobWrapper) jobWrapper.remove();
            
            const originalJobSpan = document.querySelector('.employee-job-code');
            if (originalJobSpan) originalJobSpan.style.display = '';

            displayEmployeeDetails(mergedData);

        } catch (error) {
            console.error("Chyba pri ukladaní:", error);
            showToast("Chyba pri ukladaní: " + error.message, TOAST_TYPE.ERROR);
        }
    }
}

function cancelEditAction() {
    if (!isEditMode) return;

    const personalInfoCard = document.getElementById('personal-info');
    const currentEmpId = personalInfoCard ? personalInfoCard.dataset.currentEmpId : null;

    const wasAddMode = isAddMode;
    isEditMode = false;
    isAddMode = false;

    const editBtn = document.getElementById('edit-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const addBtn = document.getElementById('add-employee-btn');
    const deleteBtn = document.getElementById('delete-employee-btn');

    if (cancelBtn) cancelBtn.classList.add('hidden');
    if (addBtn) addBtn.classList.add('hidden');
    if (deleteBtn) deleteBtn.classList.add('hidden');

    if (editBtn) {
        editBtn.classList.remove('active-edit-mode');
        const icon = editBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-save');
            icon.classList.add('fa-pen-to-square');
        }
    }

    const jobWrapper = document.querySelector('.employee-job-code-wrapper');
    if (jobWrapper) jobWrapper.remove();
    const originalJobSpan = document.querySelector('.employee-job-code');
    if (originalJobSpan) originalJobSpan.style.display = '';

    if (wasAddMode) {
        clearEmployeeDetails();
        showToast("Pridávanie zrušené.", TOAST_TYPE.INFO);
    } else {
        if (currentEmpId && _allEmployeesData && _allEmployeesData.has(currentEmpId)) {
            const originalData = _allEmployeesData.get(currentEmpId);
            displayEmployeeDetails(originalData);
        } else {
            clearEmployeeDetails();
        }
        showToast("Editovanie zrušené.", TOAST_TYPE.INFO);
    }
}

function renderEditView(emp) {
    const safeVal = (val) => (val === undefined || val === null) ? '' : val;
    const nastupISO = convertSlovakDateToISO(safeVal(emp.nastup));

    const personalList = document.querySelector('#personal-info .info-list');
    if (personalList) {
        personalList.innerHTML = `
            <dt>Titul</dt><dd><input type="text" id="edit_titul" value="${safeVal(emp.titul)}" placeholder="Titul"></dd>
            <dt>Meno</dt><dd><input type="text" id="edit_meno" value="${safeVal(emp.meno)}" placeholder="Meno (povinné)"></dd>
            <dt>Priezvisko</dt><dd><input type="text" id="edit_priezvisko" value="${safeVal(emp.priezvisko)}" placeholder="Priezvisko (povinné)"></dd>
            <dt>Adresa</dt><dd><input type="text" id="edit_adresa" value="${safeVal(emp.adresa)}" placeholder="Ulica, Mesto"></dd>
            <dt>Kontakt</dt><dd><input type="text" id="edit_kontakt" value="${safeVal(emp.kontakt)}" placeholder="Služobný, Súkromný"></dd>
            <dt>Nástup</dt><dd><input type="date" id="edit_nastup" value="${nastupISO}"></dd>
        `;
    }

    const jobBlock = document.querySelector('#job-info .info-block');
    const jobHeader = document.querySelector('#job-info .card-header');
    
    if (jobHeader) {
        // Použijeme ten istý kontajner ako v read-only móde
        let idsContainer = jobHeader.querySelector('.employee-ids-container');
        
        // Poistka, ak by náhodou neexistoval (napr. pri Add Mode)
        if (!idsContainer) {
            idsContainer = document.createElement('div');
            idsContainer.className = 'employee-ids-container';
            idsContainer.style.marginLeft = 'auto'; // Pre istotu, ak by to CSS nezachytilo
            jobHeader.appendChild(idsContainer);
        }

        // Vložíme INPUTY pod sebou
        idsContainer.innerHTML = `
            <input type="text" id="edit_oec" value="${safeVal(emp.oec)}" placeholder="OEČ" title="Zadajte OEČ">
            <input type="text" id="edit_kod" value="${safeVal(emp.kod)}" placeholder="Kód" title="Zadajte Kód">
        `;
    }

    if (jobBlock) {
        jobBlock.innerHTML = `
            <h3>Platová trieda</h3>
            <select id="edit_platova_trieda" class="edit-select">
                <option value="">-- Vyberte --</option>
                ${[1,2,3,4,5,6,7,8,9].map(n => `<option value="${n}" ${String(emp.platova_trieda) == String(n) ? 'selected' : ''}>Trieda ${n}</option>`).join('')}
            </select>

            <h3>Oddelenie a Funkcia</h3>
            <input type="text" id="edit_oddelenie" value="${safeVal(emp.oddelenie)}" placeholder="Oddelenie (napr. OCOaKP)" style="margin-bottom: 5px;">
            <input type="text" id="edit_funkcia" value="${safeVal(emp.funkcia)}" placeholder="Funkcia (napr. Referent)">

            <h3>Príplatky (€)</h3>
            <div class="edit-allowances-grid">
                <label>Osobný:</label><input type="number" step="0.01" id="edit_osobny_priplatok" value="${parseMoney(emp.osobny_priplatok)}">
                <label>Zmennosť:</label><input type="number" step="0.01" id="edit_zmennost_pohotovost" value="${parseMoney(emp.zmennost_pohotovost)}">
                <label>Vedenie vozidla:</label><input type="number" step="0.01" id="edit_vedenie_vozidla" value="${parseMoney(emp.vedenie_vozidla)}">
                <label>Starostlivosť:</label><input type="number" step="0.01" id="edit_starostlivost_vozidlo" value="${parseMoney(emp.starostlivost_vozidlo)}">
            </div>
        `;
    }
    
    const serviceCard = document.querySelector('#service-description-card');
    if (serviceCard) {
        const contentArea = serviceCard.querySelector('.info-block.scrollable-content');
        let currentData = emp.customDescription || {}; 
        const arrayToText = (arr) => Array.isArray(arr) ? arr.join('\n') : (arr || '');

        if (contentArea) {
            contentArea.innerHTML = `
                <div class="edit-description-wrapper" style="display: flex; flex-direction: column; gap: 15px;">
                    <p style="font-size:0.9rem; color:var(--color-text-secondary);">Tu môžete zadať vlastný popis činnosti.</p>
                    <div class="desc-group">
                        <label style="font-weight:bold; color:var(--color-orange-accent);">Najnáročnejšia činnosť</label>
                        <textarea id="edit_desc_narocna" rows="4" style="width:100%; margin-top:5px;">${arrayToText(currentData['Najnáročnejšia činnosť (charakteristika platovej triedy)'])}</textarea>
                    </div>
                    <div class="desc-group">
                        <label style="font-weight:bold; color:var(--color-orange-accent);">Bližšie určená najnáročnejšia činnosť</label>
                        <textarea id="edit_desc_narocna_blizsie" rows="6" style="width:100%; margin-top:5px;">${arrayToText(currentData['Bližšie určená najnáročnejšia činnosť'])}</textarea>
                    </div>
                    <div class="desc-group">
                        <label style="font-weight:bold; color:var(--color-orange-accent);">Ďalšia činnosť</label>
                        <textarea id="edit_desc_dalsia" rows="4" style="width:100%; margin-top:5px;">${arrayToText(currentData['Ďalšia činnosť (charakteristika platovej triedy)'])}</textarea>
                    </div>
                    <div class="desc-group">
                        <label style="font-weight:bold; color:var(--color-orange-accent);">Bližšie určená ďalšia činnosť</label>
                        <textarea id="edit_desc_dalsia_blizsie" rows="6" style="width:100%; margin-top:5px;">${arrayToText(currentData['Bližšie určená ďalšia činnosť'])}</textarea>
                    </div>
                    <div class="desc-group">
                        <label style="font-weight:bold; color:var(--color-orange-accent);">Ostatné činnosti</label>
                        <textarea id="edit_desc_ostatne" rows="4" style="width:100%; margin-top:5px;">${arrayToText(currentData['Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre'])}</textarea>
                    </div>
                </div>
            `;
        }
    }
}

function gatherFormData() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : null;
    };
    const getNum = (id) => {
        const val = getVal(id);
        return (val && val !== '') ? parseFloat(val) : 0;
    };

    const getTextArray = (id) => {
        const val = getVal(id);
        if (!val) return [];
        return val.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    };

    const rawDate = getVal('edit_nastup');
    const slovakDate = convertISOToSlovakDate(rawDate);

    const data = {
        titul: getVal('edit_titul'),
        meno: getVal('edit_meno'),
        priezvisko: getVal('edit_priezvisko'),
        adresa: getVal('edit_adresa'),
        kontakt: getVal('edit_kontakt'),
        nastup: slovakDate, 
        
        platova_trieda: getVal('edit_platova_trieda'),
        oddelenie: getVal('edit_oddelenie'),
        funkcia: getVal('edit_funkcia'),
        
        kod: getVal('edit_kod'),     
        oec: getVal('edit_oec'), 
        
        osobny_priplatok: getNum('edit_osobny_priplatok'),
        zmennost_pohotovost: getNum('edit_zmennost_pohotovost'),
        vedenie_vozidla: getNum('edit_vedenie_vozidla'),
        starostlivost_vozidlo: getNum('edit_starostlivost_vozidlo')
    };

    const checkEl = document.getElementById('edit_desc_narocna');
    if (checkEl) {
        const descData = {
            'Najnáročnejšia činnosť (charakteristika platovej triedy)': getTextArray('edit_desc_narocna'),
            'Bližšie určená najnáročnejšia činnosť': getTextArray('edit_desc_narocna_blizsie'),
            'Ďalšia činnosť (charakteristika platovej triedy)': getTextArray('edit_desc_dalsia'),
            'Bližšie určená ďalšia činnosť': getTextArray('edit_desc_dalsia_blizsie'),
            'Ostatné činnosti, ktoré súvisia so zaradením v organizačnej štruktúre': getTextArray('edit_desc_ostatne')
        };
        
        const hasContent = Object.values(descData).some(arr => arr.length > 0);
        if (hasContent) {
            data.customDescription = descData;
        }
    }

    return data;
}

function parseMoney(value) {
    return (value === undefined || value === null) ? '' : value;
}

export function resetEditMode() {
    if (isEditMode) {
        cancelEditAction();
    }
}

function convertSlovakDateToISO(dateStr) {
    if (!dateStr) return '';
    dateStr = String(dateStr).replace(/\s/g, '');
    const parts = dateStr.split('.');
    if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
    }
    return '';
}

function convertISOToSlovakDate(isoDate) {
    if (!isoDate) return null;
    const parts = isoDate.split('-');
    if (parts.length === 3) {
        return `${parseInt(parts[2])}.${parseInt(parts[1])}.${parts[0]}`;
    }
    return isoDate;
}