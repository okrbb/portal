/* cp_module.js - Modular SDK v9+ (Oprava zaokrúhľovania) */
import { 
    collection, 
    doc, 
    updateDoc, 
    getDocs 
} from 'firebase/firestore';

import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';

/**
 * ===================================
 * MODUL PRE CESTOVNÉ PRÍKAZY
 * (cp_module.js)
 * ===================================
 */

let _allEmployeesData = null; 
let selectedEmployeeId = null;
let _dbReference = null;
let _localActiveUser = null; 

export function initializeCPModule(db, activeUser, employeesData) { 
    console.log("Inicializujem modul Cestovný príkaz...");
    
    _allEmployeesData = employeesData;
    _dbReference = db; 
    _localActiveUser = activeUser;

    const lookupId = activeUser.id || activeUser.oec; 

    if (activeUser && lookupId) {
        console.log(`[CP] Inicializácia: Volám displayCPEmployeeDetails s ID: ${lookupId}`);
        displayCPEmployeeDetails(lookupId);
    }

    try {
        const dateInputs = ["#datum_zc_datum", "#datum_kc_datum", "#datum_1", "#datum_2"];
        dateInputs.forEach(selector => {
            const el = document.querySelector(selector);
            if (el && typeof flatpickr !== 'undefined') {
                flatpickr(el, { dateFormat: "d.m.Y", locale: "sk" });
            }
        });
        populateTimeSelects();
    } catch (e) {
        console.error("Chyba pri inicializácii Flatpickr:", e);
    }

    const clearBtn = document.getElementById('btn-clear-cp-form');
    if (clearBtn) {
        const newBtn = clearBtn.cloneNode(true);
        clearBtn.parentNode.replaceChild(newBtn, clearBtn);
        newBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearCPForm();
            showToast("Formulár bol vymazaný.", TOAST_TYPE.INFO);
        });
    }

    const cpForm = document.getElementById('cp-form-embedded');
    if(cpForm) {
        cpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleCPFormSubmit();
        });
    }

    attachMealCalculationListeners();
}

const editIbanBtn = document.getElementById('btn-edit-iban');
if (editIbanBtn) editIbanBtn.addEventListener('click', openIbanModal);

const ibanForm = document.getElementById('iban-form');
if (ibanForm) ibanForm.addEventListener('submit', handleIbanSave);

const closeIbanBtn = document.getElementById('close-iban-modal');
if (closeIbanBtn) {
    closeIbanBtn.addEventListener('click', () => {
        document.getElementById('iban-modal').classList.add('hidden');
    });
}

export function displayCPEmployeeDetails(empId) {
    const detailElement = document.getElementById('cp-employee-details');
    if (!detailElement) return;
    
    if (!_allEmployeesData || !empId) {
        detailElement.innerHTML = '<p>Vyberte zamestnanca z globálneho zoznamu vpravo kliknutím.</p>';
        selectedEmployeeId = null;
        return;
    }

    const emp = _allEmployeesData.get(empId);

    if (!emp) {
        detailElement.innerHTML = '<p>Chyba: Dáta zamestnanca neboli nájdené.</p>';
        selectedEmployeeId = null;
        return;
    }

    if (!Permissions.canViewCP(_localActiveUser, emp)) {
        detailElement.innerHTML = `<p style="color: #E53E3E; font-weight: bold;">
            Nemáte oprávnenie vidieť detaily zamestnanca ${emp.displayName} v tomto module.
        </p>`;
        selectedEmployeeId = null; 
        return;
    }

    selectedEmployeeId = empId; 

    detailElement.innerHTML = `
        <p><strong>Meno:</strong> ${emp.displayName || 'Neznáme'}</p>
        <p><strong>Osobné číslo:</strong> ${emp.oec || 'Neuvedené'}</p>
        <p><strong>Bydlisko:</strong> ${emp.adresa || 'Neuvedené'}</p>
        <p><strong>Číslo účtu (IBAN):</strong> <span class="blurred-text">${emp.iban || 'Neuvedené'}</span></p>
    `;
}

function populateTimeSelects() {
    const timeSelects = [{ id: '#datum_zc_cas', defaultTime: '07:30' }, { id: '#datum_kc_cas', defaultTime: '15:30' }];
    const startHour = 6;
    const endHour = 22;

    timeSelects.forEach(item => {
        const select = document.querySelector(item.id);
        if (!select) return;
        select.innerHTML = '<option value="">-- čas --</option>';
        for (let h = startHour; h <= endHour; h++) {
            const hour = h.toString().padStart(2, '0');
            select.add(new Option(`${hour}:00`, `${hour}:00`));
            if (h < endHour) select.add(new Option(`${hour}:30`, `${hour}:30`));
        }
        select.value = item.defaultTime;
    });
}

function openIbanModal() {
    if (!selectedEmployeeId) {
        showToast("Najprv vyberte zamestnanca zo zoznamu.", TOAST_TYPE.ERROR);
        return;
    }
    const emp = _allEmployeesData.get(selectedEmployeeId);
    if (!emp) return;
    if (!_localActiveUser) {
         showToast("Pre úpravu údajov musíte byť prihlásený.", TOAST_TYPE.ERROR);
         return;
    }
    const modal = document.getElementById('iban-modal');
    const input = document.getElementById('iban-input');
    if (modal && input) {
        input.value = emp.iban || ''; 
        modal.classList.remove('hidden');
        input.focus();
    }
}

async function handleIbanSave(e) {
    e.preventDefault();
    if (!selectedEmployeeId || !_dbReference) return;

    const input = document.getElementById('iban-input');
    const newIban = input.value.trim();
    const modal = document.getElementById('iban-modal');
    const submitBtn = modal.querySelector('button[type="submit"]');

    if (newIban.length > 0 && newIban.length < 15) { 
         showToast("IBAN sa zdá byť príliš krátky.", TOAST_TYPE.INFO);
    }

    try {
        submitBtn.textContent = 'Ukladám...';
        submitBtn.disabled = true;

        const empRef = doc(_dbReference, 'employees', selectedEmployeeId);
        await updateDoc(empRef, { iban: newIban });

        const emp = _allEmployeesData.get(selectedEmployeeId);
        if (emp) {
            emp.iban = newIban;
            _allEmployeesData.set(selectedEmployeeId, emp);
        }

        displayCPEmployeeDetails(selectedEmployeeId);
        modal.classList.add('hidden');
        showToast("IBAN bol úspešne aktualizovaný.", TOAST_TYPE.SUCCESS);

    } catch (error) {
        console.error("Chyba pri ukladaní IBAN:", error);
        showToast("Nepodarilo sa uložiť IBAN.", TOAST_TYPE.ERROR);
    } finally {
        submitBtn.textContent = 'Uložiť';
        submitBtn.disabled = false;
    }
}

async function handleCPFormSubmit() {
    if (!selectedEmployeeId) {
        showToast("Prosím, vyberte zamestnanca zo zoznamu.", TOAST_TYPE.ERROR);
        return;
    }
    const emp = _allEmployeesData.get(selectedEmployeeId);
    if (!emp || !Permissions.canViewCP(_localActiveUser, emp)) {
        showToast("Nemáte oprávnenie vygenerovať CP pre tohto zamestnanca.", TOAST_TYPE.ERROR);
        return;
    }
    const formData = collectFormData(emp);
    const filename = generateFilename(formData);
    await generateCPDocx(formData, filename);
}

function collectFormData(emp) {
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('.');
        if (parts.length === 3) return dateStr; 
        const [year, month, day] = dateStr.split('-');
        return `${day}.${month}.${year}`;
    };

    const datumZcDatum = document.getElementById('datum_zc_datum')?.value || '';
    const datumZcCas = document.getElementById('datum_zc_cas')?.value || '';
    const datumKcDatum = document.getElementById('datum_kc_datum')?.value || '';
    const datumKcCas = document.getElementById('datum_kc_cas')?.value || '';

    return {
        meno: `${emp.priezvisko}, ${emp.meno}, ${emp.titul || ''}`,
        OEC: emp.oec || '',
        adresa: emp.adresa || '',
        ucet: emp.iban || '',
        ucel: document.getElementById('ucel')?.value || '',
        miesto: document.getElementById('miesto')?.value || '',
        datum_zc: `${formatDate(datumZcDatum)}, ${datumZcCas}`,
        datum_kc: `${formatDate(datumKcDatum)}, ${datumKcCas}`,
        spolucestujuci: document.getElementById('spolucestujuci')?.value || '',
        datum_1: formatDate(document.getElementById('datum_1')?.value || ''),
        datum_2: formatDate(document.getElementById('datum_2')?.value || ''),
        cesta_z1: document.getElementById('cesta_z1')?.value || '',
        miesto_1: document.getElementById('miesto_1')?.value || '',
        cesta_k1: document.getElementById('cesta_k1')?.value || '',
        cesta_z2: document.getElementById('cesta_z2')?.value || '',
        miesto_2: document.getElementById('miesto_2')?.value || '',
        cesta_k2: document.getElementById('cesta_k2')?.value || '',
        cesta_z3: document.getElementById('cesta_z3')?.value || '',
        miesto_3: document.getElementById('miesto_3')?.value || '',
        cesta_k3: document.getElementById('cesta_k3')?.value || ''
    };
}

function generateFilename(formData) {
    let dateStr = document.getElementById('datum_zc_datum')?.value || document.getElementById('datum_1')?.value || new Date().toISOString().split('T')[0];
    let dateForFilename = '';
    try {
        if (dateStr.includes('.')) {
            const [day, month, year] = dateStr.split('.');
            dateForFilename = `${day.padStart(2, '0')}${month.padStart(2, '0')}${year}`;
        } else {
            const [year, month, day] = dateStr.split('-');
            dateForFilename = `${day}${month}${year}`;
        }
    } catch (e) { dateForFilename = "neznamy_datum"; }

    const miesto = formData.miesto || 'nezname';
    const miestoSanitized = miesto.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_');
    return `cestovny_prikaz_${miestoSanitized}_${dateForFilename}.docx`;
}

async function generateCPDocx(data, filename) {
    const templatePath = 'data/cp.docx';
    const submitBtn = document.querySelector('#cp-form-embedded button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Generujem...';

        try {
            const response = await fetch(templatePath);
            if (!response.ok) throw new Error(`Chyba pri načítaní šablóny: ${response.statusText}`);
            const content = await response.arrayBuffer();
            const zip = new PizZip(content);
            const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "{{", end: "}}" } });
            doc.setData(data);
            doc.render();
            const out = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            saveAs(out, filename);
            showToast("Cestovný príkaz bol úspešne vygenerovaný.", TOAST_TYPE.SUCCESS);
        } catch (error) {
            console.error('Generovanie dokumentu:', error);
            showToast(`Nastala chyba: ${error.message}`, TOAST_TYPE.ERROR);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// ========================================
// MODUL PRE VÝPOČET STRAVNÉHO
// ========================================

async function calculateMealAllowance(startDate, startTime, endDate, endTime) {
    try {
        const startDateTime = parseDateTime(startDate, startTime);
        const endDateTime = parseDateTime(endDate, endTime);
        if (!startDateTime || !endDateTime) throw new Error("Neplatný formát dátumu alebo času");
        const durationHours = (endDateTime - startDateTime) / (1000 * 60 * 60);
        if (durationHours < 0) throw new Error("Koniec cesty je skôr ako začiatok");

        const dailyAllowances = [];
        let totalAllowance = 0;
        let currentDay = new Date(startDateTime);
        currentDay.setHours(0, 0, 0, 0); 

        while (currentDay <= endDateTime) {
            const dayStart = new Date(currentDay);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(currentDay);
            dayEnd.setHours(23, 59, 59, 999);

            const effectiveStart = dayStart < startDateTime ? startDateTime : dayStart;
            const effectiveEnd = dayEnd > endDateTime ? endDateTime : dayEnd;
            const dayDurationHours = (effectiveEnd - effectiveStart) / (1000 * 60 * 60);

            const mealRate = await getMealRateForDate(effectiveStart);
            let dayAllowanceAmount = 0;
            let dayCategory = "";

            if (mealRate) {
                if (dayDurationHours >= 5 && dayDurationHours < 12) {
                    dayAllowanceAmount = mealRate["5h_12h"] || 0;
                    dayCategory = "5-12h";
                } else if (dayDurationHours >= 12 && dayDurationHours < 18) {
                    dayAllowanceAmount = mealRate["12h_18h"] || 0;
                    dayCategory = "12-18h";
                } else if (dayDurationHours >= 18) {
                    dayAllowanceAmount = mealRate["18h"] || 0;
                    dayCategory = "nad 18h";
                } else {
                    dayCategory = "bez nároku";
                }
            }
            totalAllowance += dayAllowanceAmount;
            dailyAllowances.push({
                date: effectiveStart.toLocaleDateString('sk-SK'),
                duration: dayDurationHours.toFixed(2),
                category: dayCategory,
                amount: dayAllowanceAmount,
                validFrom: mealRate ? (mealRate.validFrom || "N/A") : "N/A"
            });
            currentDay.setDate(currentDay.getDate() + 1);
        }

        // ZMENA: Zaokrúhlenie celkovej sumy na 2 desatinné miesta
        displayMealAllowanceResult({ 
            duration: durationHours.toFixed(2), 
            totalAmount: totalAllowance.toFixed(2), 
            dailyAllowances: dailyAllowances 
        });
        return totalAllowance;

    } catch (error) {
        console.error("Chyba pri výpočte stravného:", error);
        displayMealAllowanceError(error.message);
        return 0;
    }
}

function parseDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    let year, month, day;
    if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        day = parseInt(parts[0]); month = parseInt(parts[1]) - 1; year = parseInt(parts[2]);
    } else if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        year = parseInt(parts[0]); month = parseInt(parts[1]) - 1; day = parseInt(parts[2]);
    } else return null;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return new Date(year, month, day, hours, minutes);
}

async function getMealRateForDate(date) {
    try {
        const dietaryRef = collection(_dbReference, 'dietary');
        const snapshot = await getDocs(dietaryRef);

        if (snapshot.empty) return null;

        let validRate = null;
        snapshot.forEach(doc => {
            const data = doc.data();
            let validFrom;
            if (data.validFrom && data.validFrom.toDate) validFrom = data.validFrom.toDate();
            else if (data.validFrom) validFrom = new Date(data.validFrom);
            else return;

            if (validFrom <= date) {
                if (!validRate || validFrom > validRate.validFrom) {
                    validRate = { ...data, validFrom: validFrom, id: doc.id };
                }
            }
        });
        return validRate;
    } catch (error) {
        console.error("Chyba pri načítaní sadzby stravného:", error);
        return null;
    }
}

function displayMealAllowanceResult(result) {
    const container = document.getElementById('meal-calculation-results');
    if (!container) return;
    container.style.display = 'block';
    
    let breakdown = '';
    if (result.dailyAllowances?.length > 0) {
        breakdown = '<div style="margin-top: 1.5rem;"><ul style="list-style: none; padding: 0;">' +
            result.dailyAllowances.map(day => `
                <li style="margin-bottom: 1rem; padding: 1rem; background: var(--color-bg); border-radius: 8px; border-left: 3px solid var(--color-orange-accent);">
                    <strong>${day.date}:</strong> ${day.duration}h (${day.category}) = <strong>${Number(day.amount).toFixed(2)} €</strong>
                </li>`).join('') + '</ul></div>';
    }

    // TU JE ZMENA: Pridané padding-top: 15px do posledného <p> tagu
    container.innerHTML = `
        <div style="padding: 0.5rem;">
            <p style="color: var(--color-text-secondary); margin-bottom: 1rem;">
                <strong>Celkové trvanie cesty:</strong> ${result.duration} hodín
            </p>
            ${breakdown}
            <p style="margin-top: 2rem; border-top: 1px solid var(--color-border); padding-top: 15px; font-size: 1.2rem; color: var(--color-orange-accent); font-weight: 700;">
                Celková náhrada stravného: ${result.totalAmount} €
            </p>
        </div>`;
}

function displayMealAllowanceError(message) {
    const container = document.getElementById('meal-calculation-results');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = `<div style="padding: 1rem; background: var(--color-bg); border-radius: 8px; border-left: 3px solid #E53E3E;"><p style="color: #E53E3E; margin: 0;"><strong>Chyba:</strong> ${message}</p></div>`;
}

function attachMealCalculationListeners() {
    ['datum_zc_datum', 'datum_zc_cas', 'datum_kc_datum', 'datum_kc_cas'].forEach(id => {
        const field = document.getElementById(id);
        if (field) {
            field.addEventListener('change', async () => {
                const sD = document.getElementById('datum_zc_datum')?.value;
                const sT = document.getElementById('datum_zc_cas')?.value;
                const eD = document.getElementById('datum_kc_datum')?.value;
                const eT = document.getElementById('datum_kc_cas')?.value;
                if (sD && sT && eD && eT) await calculateMealAllowance(sD, sT, eD, eT);
            });
        }
    });
}

export function clearCPForm() {
    ['ucel', 'miesto', 'spolucestujuci', 'cesta_z1', 'miesto_1', 'cesta_k1', 'cesta_z2', 'miesto_2', 'cesta_k2', 'cesta_z3', 'miesto_3', 'cesta_k3'].forEach(id => {
        const el = document.getElementById(id); if(el) el.value = '';
    });
    ['datum_zc_datum', 'datum_kc_datum', 'datum_1', 'datum_2'].forEach(id => {
        const el = document.getElementById(id); 
        if(el) { el.value = ''; if(el._flatpickr) el._flatpickr.clear(); }
    });
    const sT = document.getElementById('datum_zc_cas'); if(sT) sT.value = '07:30';
    const eT = document.getElementById('datum_kc_cas'); if(eT) eT.value = '15:30';
    const calc = document.getElementById('meal-calculation-results'); 
    if(calc) { calc.style.display = 'none'; calc.innerHTML = ''; }
}