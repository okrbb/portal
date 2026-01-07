/* cp_module.js - FINAL REFACTORED VERSION */
import { store } from './store.js';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

// Import helpers
import { showToast, TOAST_TYPE, safeAsync, attachListener, ModalManager } from './utils.js';
import { fetchCollection, updateDocument } from './firebase_helpers.js';
import { lazyLoader } from './lazy_loader.js';
import { Permissions } from './accesses.js';
import { IDs } from './id-registry.js';

let selectedEmployeeId = null;
let unsubscribeStore = null;

export function initializeCPModule() { 
    console.log("Inicializujem modul Cestovný príkaz...");
    
    // 1. Správa store
    if (unsubscribeStore) unsubscribeStore();
    unsubscribeStore = store.subscribe((state) => {
        if (state.user && state.employees.size > 0) {
            console.log("[CPModule] Store sync active");
        }
    });
    
    // 2. Identifikácia používateľa (Oprava Doc ID vs OEC)
    const activeUser = store.getUser();
    let lookupId = activeUser ? activeUser.id : null; 

    if (!lookupId && activeUser?.oec) {
        const employeesMap = store.getEmployees();
        for (let [docId, emp] of employeesMap) {
            if (String(emp.oec) === String(activeUser.oec)) {
                lookupId = docId;
                break;
            }
        }
    }

    if (lookupId) {
        displayCPEmployeeDetails(lookupId);
    }

    // 3. Listenery (VŽDY používať ID string pre attachListener)
    attachListener(IDs.CP.CLEAR_FORM_BTN, 'click', (e) => {
        e.preventDefault();
        clearCPForm();
        showToast("Formulár bol vymazaný.", TOAST_TYPE.INFO);
    });

    // Otváranie modalu IBAN
    attachListener(IDs.CP.EDIT_IBAN_BTN, 'click', (e) => {
        e.preventDefault();
        openIbanModal();
    });

    // 4. Inicializácia modalu (Ukladanie)
    setupIbanModalLogic();

    // 5. Formulár
    const cpForm = document.getElementById(IDs.CP.FORM);
    if (cpForm) {
        cpForm.onsubmit = async (e) => {
            e.preventDefault();
            await handleCPFormSubmit();
        };
    }

    // 6. Lazy Loading Flatpickr
    const initFlatpickr = async () => {
        try {
            const fp = await lazyLoader.loadFlatpickr(); 
            const dateInputs = [
                `#${IDs.CP.START_DATE}`,
                `#${IDs.CP.END_DATE}`,
                `#${IDs.CP.ACCOMMODATION_DATE_1}`,
                `#${IDs.CP.ACCOMMODATION_DATE_2}`,
            ];
            
            dateInputs.forEach(selector => {
                const el = document.querySelector(selector);
                if (el) {
                    if (el._flatpickr) el._flatpickr.destroy();
                    fp(el, { dateFormat: "d.m.Y", locale: "sk", allowInput: true });
                }
            });
            populateTimeSelects();
        } catch (e) {
            console.error("Flatpickr lazy load error:", e);
        }
    };
    initFlatpickr();

    attachMealCalculationListeners();
}

/**
 * Zobrazí detaily zamestnanca
 */
export function displayCPEmployeeDetails(empId) {
    const detailElement = document.getElementById(IDs.CP.EMPLOYEE_DETAILS);
    if (!detailElement) return;
    
    const employeesData = store.getEmployees();
    const activeUser = store.getUser();

    if (!employeesData || !empId) {
        detailElement.innerHTML = '<p>Vyberte zamestnanca zo zoznamu.</p>';
        selectedEmployeeId = null;
        return;
    }

    const emp = employeesData.get(empId);
    if (!emp) return;

    if (!Permissions.canViewCP(activeUser, emp)) {
        detailElement.innerHTML = `<p style="color: #E53E3E;">Nemáte oprávnenie pre ${emp.displayName}.</p>`;
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

/**
 * Validácia IBANU (SK formát: SK + 22 číslic)
 */
function isValidIban(iban) {
    // Odstránime medzery
    const cleanedIban = iban.replace(/\s+/g, '').toUpperCase();
    // SK formát: SK + 22 číslic = 24 znakov celkom
    const ibanRegex = /^SK\d{22}$/;
    return ibanRegex.test(cleanedIban);
}

/**
 * Logika pre IBAN modal (iba priradenie submitu)
 */
function setupIbanModalLogic() {
    ModalManager.setupCloseListeners(IDs.MODALS.IBAN_MODAL, IDs.MODALS.CLOSE_IBAN_MODAL);
    
    // DÔLEŽITÉ: Použiť ID string, nie element
    attachListener(IDs.MODALS.IBAN_FORM, 'submit', handleIbanSave);
}

function openIbanModal() {
    if (!selectedEmployeeId) {
        showToast("Najprv vyberte zamestnanca.", TOAST_TYPE.ERROR);
        return;
    }
    const emp = store.getEmployee(selectedEmployeeId);
    const input = document.getElementById(IDs.MODALS.IBAN_INPUT);
    
    ModalManager.open(IDs.MODALS.IBAN_MODAL, () => {
        if (input && emp) {
            input.value = emp.iban || '';
            input.focus();
        }
    });
}

async function handleIbanSave(e) {
    e.preventDefault();
    const db = store.getDB();
    if (!selectedEmployeeId || !db) return;

    const input = document.getElementById(IDs.MODALS.IBAN_INPUT);
    const newIban = input.value.trim();
    
    // Validácia IBANU (ak nie je prázdny)
    if (newIban && !isValidIban(newIban)) {
        showToast('IBAN musí mať tvar: SK + 22 číslic (napr. SK8975000000000012345678)', TOAST_TYPE.ERROR);
        input.focus();
        return;
    }
    
    const modal = document.getElementById(IDs.MODALS.IBAN_MODAL);
    const submitBtn = modal.querySelector('button[type="submit"]');

    submitBtn.textContent = 'Ukladám...';
    submitBtn.disabled = true;

    await safeAsync(
        async () => {
            await updateDocument('employees', selectedEmployeeId, { iban: newIban });

            // Update lokálneho store
            const emp = store.getEmployee(selectedEmployeeId);
            if (emp) {
                emp.iban = newIban;
                store.notify(); 
            }

            displayCPEmployeeDetails(selectedEmployeeId);
            ModalManager.close(IDs.MODALS.IBAN_MODAL);
            showToast("IBAN bol úspešne aktualizovaný.", TOAST_TYPE.SUCCESS);
        },
        'Nepodarilo sa uložiť IBAN'
    );

    submitBtn.textContent = 'Uložiť';
    submitBtn.disabled = false;
}

async function resolveSignatures(empId) {
    // Obnova všetkých 5 polí pre podpisy podľa pôvodnej predlohy
    let signatures = {
        podpis_1: '',
        podpis_1a: '',
        podpis_1b: '',
        podpis_2: '',
        podpis_3: ''
    };

    try {
        const role = await getRoleForEmployee(empId);
        const cpConfig = await getCPConfig(); // Načítanie Prednostu a Vedúceho OR
        const getName = (key) => findEmployeeNameByIdOrOec(key) || '';

        // 1. Rola ADMIN
        if (role === 'admin') {
            signatures.podpis_1 = cpConfig.prednosta || '';
            signatures.podpis_1b = cpConfig.prednosta || '';
            signatures.podpis_3 = cpConfig.veduci_or || '';
        } 
        // 2. Roly manažérov
        else if (role === 'manager_1' || role === 'manager_2') {
            const name28831 = getName('28831');
            signatures.podpis_1 = name28831;
            signatures.podpis_1a = name28831;
            signatures.podpis_2 = cpConfig.prednosta || '';
        } 
        // 3. Bežní používatelia a super_useri
        else if (['super_user_1', 'super_user_2', 'user'].includes(role)) {
            const name28832 = getName('28832');
            const name28831 = getName('28831');
            signatures.podpis_1 = name28832;
            signatures.podpis_1a = name28832;
            signatures.podpis_2 = name28831;
        }
        // 4. Roly IZS
        else if (['super_user_IZS_1', 'super_user_IZS_2', 'user_IZS'].includes(role)) {
            const name28845 = getName('28845');
            const name28831 = getName('28831');
            signatures.podpis_1 = name28845;
            signatures.podpis_1a = name28845;
            signatures.podpis_2 = name28831;
        }

    } catch (e) {
        console.error("Chyba pri získavaní podpisov:", e);
    }

    return signatures;
}

async function handleCPFormSubmit() {
    if (!selectedEmployeeId) {
        showToast("Prosím, vyberte zamestnanca zo zoznamu.", TOAST_TYPE.ERROR);
        return;
    }
    
    const emp = store.getEmployee(selectedEmployeeId);
    const activeUser = store.getUser();

    if (!emp || !Permissions.canViewCP(activeUser, emp)) {
        showToast("Nemáte oprávnenie vygenerovať CP pre tohto zamestnanca.", TOAST_TYPE.ERROR);
        return;
    }

    const submitBtn = document.querySelector(`#${IDs.CP.FORM} button[type="submit"]`);
    if(submitBtn) {
        submitBtn.dataset.originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner"></i> Spracovávam...';
        submitBtn.classList.add('btn-loading');
        submitBtn.disabled = true;
    }

    await safeAsync(
        async () => {
            let formData = collectFormData(emp);
            const signatures = await resolveSignatures(selectedEmployeeId);
            formData = { ...formData, ...signatures };

            const filename = generateFilename(formData);
            
            // Tu si môžete vybrať formát. Pôvodne DOCX:
            await generateCPDocx(formData, filename);
        },
        'Nastala chyba pri spracovaní dát'
    );

    if(submitBtn && submitBtn.dataset.originalText) {
        submitBtn.innerHTML = submitBtn.dataset.originalText;
        submitBtn.classList.remove('btn-loading');
        submitBtn.disabled = false;
    }
}

/**
 * ✅ OPTIMALIZOVANÉ: Použitie fetchCollection helper
 */
async function getRoleForEmployee(empId) {
    const db = store.getDB();
    if (!db) return 'user'; 

    // ✅ NOVÉ: Použitie fetchCollection
    const roles = await safeAsync(
        () => fetchCollection('user_roles', {
            whereConditions: [
                { field: 'employeeID', operator: '==', value: String(empId) }
            ],
            limitCount: 1
        }),
        'Chyba pri získavaní role',
        { fallbackValue: [], showToastOnError: false }
    );

    if (roles.length > 0) {
        return roles[0].role || 'user';
    } else {
        console.warn(`Rola pre zamestnanca ${empId} sa nenašla, používam 'user'.`);
        return 'user';
    }
}

/**
 * ✅ OPTIMALIZOVANÉ: Použitie safeAsync
 */
async function getCPConfig() {
    const config = { prednosta: '', veduci_or: '' };
    const db = store.getDB();
    if (!db) return config;

    const cpDoc = await safeAsync(
        async () => {
            const cpDocRef = doc(db, 'employees', 'cp'); 
            const cpDocSnap = await getDoc(cpDocRef);
            return cpDocSnap.exists() ? cpDocSnap.data() : null;
        },
        'Chyba pri načítaní CP config',
        { fallbackValue: null, showToastOnError: false }
    );

    if (cpDoc) {
        config.prednosta = cpDoc.prednosta || '';
        config.veduci_or = cpDoc.veduci_or || '';
    } else {
        console.warn("Dokument 'employees/cp' neexistuje.");
    }

    return config;
}

function findEmployeeNameByIdOrOec(searchKey) {
    const employeesMap = store.getEmployees();
    if (!employeesMap) return '';

    if (employeesMap.has(searchKey)) {
        return formatEmpName(employeesMap.get(searchKey));
    }

    for (let [id, emp] of employeesMap) {
        if (String(emp.oec) === String(searchKey)) {
            return formatEmpName(emp);
        }
    }

    return '';
}

function formatEmpName(emp) {
    if (!emp) return '';
    const titul = emp.titul ? `${emp.titul} ` : '';
    return `${titul}${emp.meno} ${emp.priezvisko}`;
}

// ========================================
// ZBER DÁT Z FORMULÁRA
// ========================================

function collectFormData(emp) {
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const parts = dateStr.split('.');
        if (parts.length === 3) return dateStr; 
        const [year, month, day] = dateStr.split('-');
        return `${day}.${month}.${year}`;
    };

    // Získanie hodnôt z formulára
    const datumZcDatum = document.getElementById(IDs.CP.START_DATE)?.value || '';
    const datumZcCas = document.getElementById(IDs.CP.START_TIME)?.value || '';
    const datumKcDatum = document.getElementById(IDs.CP.END_DATE)?.value || '';
    const datumKcCas = document.getElementById(IDs.CP.END_TIME)?.value || '';

    const datum1 = document.getElementById(IDs.CP.ACCOMMODATION_DATE_1)?.value || '';
    const datum2 = document.getElementById(IDs.CP.ACCOMMODATION_DATE_2)?.value || '';
    const cas1 = document.getElementById(IDs.CP.ACCOMMODATION_TIME_1)?.value || '';
    const cas2 = document.getElementById(IDs.CP.ACCOMMODATION_TIME_2)?.value || '';

    const mzdaInput = document.getElementById(IDs.CP.WAGE_INPUT)?.value || '';
    const mzda = parseFloat(mzdaInput.replace(',', '.')) || 0;

    const stravneTotal = document.getElementById(IDs.CP.MEAL_TOTAL)?.textContent || '0';

    // Formátovanie dátumov
    const fDatumZc = formatDate(datumZcDatum);
    const fDatumKc = formatDate(datumKcDatum);

    return {
        // ✅ PRIDANÉ: OEC a spojené dátumy s časom
        OEC: emp.oec || '', // Získané z dát zamestnanca v store
        datum_zc: `${fDatumZc} ${datumZcCas}`.trim(), // Spojenie dátumu a času odchodu
        datum_kc: `${fDatumKc} ${datumKcCas}`.trim(), // Spojenie dátumu a času príchodu

        // Údaje o zamestnancovi
        oddelenie: emp.oddelenie || '',
        meno: emp.displayName || '',
        funkcia: emp.funkcia || '',
        adresa: emp.adresa || '',
        ucet: emp.iban || '',
        
        // Cesta a účel
        ucel: document.getElementById(IDs.CP.PURPOSE_INPUT)?.value || '',
        miesto: document.getElementById(IDs.CP.DESTINATION_INPUT)?.value || '',
        spolucestujuci: document.getElementById(IDs.CP.COMPANION_INPUT)?.value || '',
        
        // Etapy cesty (predchádzajúca oprava)
        cesta_z1: document.getElementById(IDs.CP.JOURNEY_FROM_1)?.value || '',
        miesto_1: document.getElementById(IDs.CP.JOURNEY_PLACE_1)?.value || '',
        cesta_k1: document.getElementById(IDs.CP.JOURNEY_TO_1)?.value || '',
        cesta_z2: document.getElementById(IDs.CP.JOURNEY_FROM_2)?.value || '',
        miesto_2: document.getElementById(IDs.CP.JOURNEY_PLACE_2)?.value || '',
        cesta_k2: document.getElementById(IDs.CP.JOURNEY_TO_2)?.value || '',
        cesta_z3: document.getElementById(IDs.CP.JOURNEY_FROM_3)?.value || '',
        miesto_3: document.getElementById(IDs.CP.JOURNEY_PLACE_3)?.value || '',
        cesta_k3: document.getElementById(IDs.CP.JOURNEY_TO_3)?.value || '',
        
        // Jednotlivé polia (ak ich šablóna vyžaduje samostatne)
        datum_zc_datum: fDatumZc,
        datum_zc_cas: datumZcCas,
        datum_kc_datum: fDatumKc,
        datum_kc_cas: datumKcCas,
        
        datum_1: formatDate(datum1),
        datum_2: formatDate(datum2),
        cas_1: cas1,
        cas_2: cas2,
        
        // Finančné údaje
        mzda: mzda.toFixed(2),
        naklady_doprava: document.getElementById(IDs.CP.TRANSPORT_COSTS)?.value || '',
        naklady_ubytovanie: document.getElementById(IDs.CP.ACCOMMODATION_COSTS)?.value || '',
        naklady_ine: document.getElementById(IDs.CP.OTHER_COSTS)?.value || '',
        stravne_total: stravneTotal,
        
        // Ostatné
        cel_cestovnych: document.getElementById(IDs.CP.PURPOSE_OF_TRAVEL)?.value || '',
        meno_organizacie: document.getElementById(IDs.CP.ORGANIZATION_NAME)?.value || '',
        miesto_organizacie: document.getElementById(IDs.CP.ORGANIZATION_PLACE)?.value || '',
        dopravny_prostriedok: document.getElementById(IDs.CP.TRANSPORT_MEANS)?.value || '',
        predpokladana_trasa: document.getElementById(IDs.CP.EXPECTED_ROUTE)?.value || ''
    };
}

function generateFilename(formData) {
    const meno = formData.meno.replace(/\s+/g, '_');
    const datum = formData.datum_zc_datum.replace(/\./g, '-');
    return `CP_${meno}_${datum}.docx`;
}

// ========================================
// GENEROVANIE DOCX (UPRAVENÉ NA LAZY LOAD)
// ========================================

async function generateCPDocx(data, filename) {
    try {
        // ✅ LAZY LOADING: Načítanie Word bundlu (PizZip + Docxtemplater + FileSaver)
        const { Docxtemplater, PizZip, FileSaver } = await lazyLoader.loadWordBundle();

        const response = await fetch('/data/cp.docx'); 
        if (!response.ok) throw new Error('Nepodarilo sa načítať šablónu');

        const content = await response.arrayBuffer();
        const zip = new PizZip(content);
        
        const doc = new Docxtemplater(zip, { 
            paragraphLoop: true, 
            linebreaks: true, 
            delimiters: { start: "{{", end: "}}" } 
        });

        doc.render(data);

        const out = doc.getZip().generate({ 
            type: 'blob', 
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        });

        // saveAs je súčasťou FileSaver, ktorý prišiel v bundle
        window.saveAs(out, filename); 
        showToast("Cestovný príkaz bol úspešne vygenerovaný.", TOAST_TYPE.SUCCESS);

    } catch (error) {
        console.error('Generovanie dokumentu:', error);
        showToast(`Nastala chyba pri generovaní Wordu: ${error.message}`, TOAST_TYPE.ERROR);
    }
}

// ========================================
// MODUL PRE VÝPOČET STRAVNÉHO
// ========================================

/**
 * ✅ KOMPLETNÁ: Pôvodná sofistikovaná verzia s Firebase integráciou
 */
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
    const db = store.getDB();
    if (!db) return null;

    try {
        const dietaryRef = collection(db, 'dietary');
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
    const container = document.getElementById(IDs.CP.MEAL_CALCULATION_RESULTS);
    if (!container) return;
    
    // Najprv nastavíme obsah, potom zobrazíme s animáciou
    container.innerHTML = '';
    container.style.display = 'none';
    
    let breakdown = '';
    if (result.dailyAllowances?.length > 0) {
        breakdown = `<div style="margin-top: 1.5rem;">
            <ul class="cp-meal-days-list" style="list-style: none; padding: 0; max-height: ${result.dailyAllowances.length > 4 ? '400px' : 'none'}; overflow-y: ${result.dailyAllowances.length > 4 ? 'auto' : 'visible'};">` +
            result.dailyAllowances.map(day => `
                <li style="margin-bottom: 1rem; padding: 1rem; background: var(--color-bg); border-radius: 8px; border-left: 3px solid var(--color-orange-accent);">
                    <strong>${day.date}:</strong> ${day.duration}h (${day.category}) = <strong>${Number(day.amount).toFixed(2)} €</strong>
                </li>`).join('') + '</ul></div>';
    }

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
    
    // Zobrazíme s malým oneskorením pre plynulú animáciu
    setTimeout(() => {
        container.style.display = 'block';
    }, 50);
}

function displayMealAllowanceError(message) {
    const container = document.getElementById(IDs.CP.MEAL_CALCULATION_RESULTS);
    if (!container) return;
    
    container.style.display = 'none';
    container.innerHTML = `<div style="padding: 1rem; background: var(--color-bg); border-radius: 8px; border-left: 3px solid #E53E3E;"><p style="color: #E53E3E; margin: 0;"><strong>Chyba:</strong> ${message}</p></div>`;
    
    setTimeout(() => {
        container.style.display = 'block';
    }, 50);
}

function attachMealCalculationListeners() {
    const watchIDs = [IDs.CP.START_DATE, IDs.CP.START_TIME, IDs.CP.END_DATE, IDs.CP.END_TIME];
    let debounceTimer = null;
    
    watchIDs.forEach(id => {
        const field = document.getElementById(id);
        if (field) {
            field.addEventListener('change', async () => {
                // Debounce - počkáme 500ms po poslednej zmene
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    const sD = document.getElementById(IDs.CP.START_DATE)?.value;
                    const sT = document.getElementById(IDs.CP.START_TIME)?.value;
                    const eD = document.getElementById(IDs.CP.END_DATE)?.value;
                    const eT = document.getElementById(IDs.CP.END_TIME)?.value;
                    if (sD && sT && eD && eT) {
                        await calculateMealAllowance(sD, sT, eD, eT);
                    }
                }, 500);
            });
        }
    });
}

function populateTimeSelects() {
    const timeSelects = [
        { id: `#${IDs.CP.START_TIME}`, defaultTime: '07:30' }, 
        { id: `#${IDs.CP.END_TIME}`, defaultTime: '15:30' }
    ];
    
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

export function clearCPForm() {
    [
      IDs.CP.PURPOSE_INPUT,
      IDs.CP.DESTINATION_INPUT,
      IDs.CP.COMPANION_INPUT,
      IDs.CP.JOURNEY_FROM_1,
      IDs.CP.JOURNEY_PLACE_1,
      IDs.CP.JOURNEY_TO_1,
      IDs.CP.JOURNEY_FROM_2,
      IDs.CP.JOURNEY_PLACE_2,
      IDs.CP.JOURNEY_TO_2,
      IDs.CP.JOURNEY_FROM_3,
      IDs.CP.JOURNEY_PLACE_3,
      IDs.CP.JOURNEY_TO_3,
    ]
    .forEach(id => {
        const el = document.getElementById(id); 
        if(el) el.value = '';
    });

    [IDs.CP.START_DATE, IDs.CP.END_DATE, IDs.CP.ACCOMMODATION_DATE_1, IDs.CP.ACCOMMODATION_DATE_2].forEach(id => {
        const el = document.getElementById(id); 
        if(el) { 
            el.value = ''; 
            if(el._flatpickr) {
                el._flatpickr.clear(); 
            }
        }
    });

    const sT = document.getElementById(IDs.CP.START_TIME); 
    if(sT) sT.value = '07:30';
    
    const eT = document.getElementById(IDs.CP.END_TIME); 
    if(eT) eT.value = '15:30';

    const calc = document.getElementById(IDs.CP.MEAL_CALCULATION_RESULTS); 
    if(calc) { 
        calc.style.display = 'none'; 
        calc.innerHTML = ''; 
    }
}

/**
 * ✅ NOVÉ: Cleanup funkcia pre CPModule
 * Očisťuje Store subscriptions a event listenery
 */
export function cleanupCPModule() {
    if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
    }
    selectedEmployeeId = null;
    console.log("[CPModule] Cleanup completed.");
}
