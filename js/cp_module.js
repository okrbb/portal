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
let _localActiveUser = null; // Uložený aktívny používateľ pre kontrolu oprávnení

export function initializeCPModule(db, activeUser, employeesData) { 
    console.log("Inicializujem modul Cestovný príkaz...");
    
    _allEmployeesData = employeesData;
    _dbReference = db;
    _localActiveUser = activeUser; // Uložíme aktívneho používateľa

    const lookupId = activeUser.id || activeUser.oec; 

    if (activeUser && lookupId) {
        console.log(`[CP] Inicializácia: Volám displayCPEmployeeDetails s ID: ${lookupId}`);
        displayCPEmployeeDetails(lookupId);
    }

    try {
        const dateInputs = [
            "#datum_zc_datum",
            "#datum_kc_datum",
            "#datum_1",
            "#datum_2"
        ];

        dateInputs.forEach(selector => {
            const el = document.querySelector(selector);
            if (el && typeof flatpickr !== 'undefined') {
                flatpickr(el, {
                    dateFormat: "d.m.Y",
                    locale: "sk"
                });
            }
        });

        populateTimeSelects();
    } catch (e) {
        console.error("Chyba pri inicializácii Flatpickr alebo časov v CP module:", e);
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

/**
 * Zobrazí detaily vybraného zamestnanca v karte.
 * @param {string|null} empId - ID zamestnanca. Ak je null, zobrazí sa hláška.
 */
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

    // --- KONTROLA OPRÁVNENÍ (Centrálna logika) ---
    if (!Permissions.canViewCP(_localActiveUser, emp)) {
        detailElement.innerHTML = `<p style="color: #E53E3E; font-weight: bold;">
            Nemáte oprávnenie vidieť detaily zamestnanca ${emp.displayName} v tomto module.
        </p>`;
        selectedEmployeeId = null; 
        return;
    }
    // --- KONIEC KONTROLY OPRÁVNENÍ ---

    selectedEmployeeId = empId; 

    detailElement.innerHTML = `
        <p><strong>Meno:</strong> ${emp.displayName || 'Neznáme'}</p>
        <p><strong>Osobné číslo:</strong> ${emp.oec || 'Neuvedené'}</p>
        <p><strong>Bydlisko:</strong> ${emp.adresa || 'Neuvedené'}</p>
        <p><strong>Číslo účtu (IBAN):</strong> <span class="blurred-text">${emp.iban || 'Neuvedené'}</span></p>
    `;
}

function populateTimeSelects() {
    const timeSelects = [
        { id: '#datum_zc_cas', defaultTime: '07:30' }, 
        { id: '#datum_kc_cas', defaultTime: '15:30' }
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
            if (h < endHour) {
                select.add(new Option(`${hour}:30`, `${hour}:30`));
            }
        }

        select.value = item.defaultTime;
    });
}

/**
 * Spracuje odoslanie formulára a vygeneruje cestovný príkaz
 */
async function handleCPFormSubmit() {
    if (!selectedEmployeeId) {
        showToast("Prosím, vyberte zamestnanca zo zoznamu.", TOAST_TYPE.ERROR);
        return;
    }

    const emp = _allEmployeesData.get(selectedEmployeeId);
    
    // Dvojitá kontrola oprávnení pred generovaním (Centrálna logika)
    if (!emp || !Permissions.canViewCP(_localActiveUser, emp)) {
        showToast("Nemáte oprávnenie vygenerovať cestovný príkaz pre tohto zamestnanca.", TOAST_TYPE.ERROR);
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
        if (parts.length === 3) {
            return dateStr; 
        }
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
    let dateStr = document.getElementById('datum_zc_datum')?.value;
    if (!dateStr) {
        dateStr = document.getElementById('datum_1')?.value;
    }
    if (!dateStr) {
        dateStr = new Date().toISOString().split('T')[0];
    }

    let dateForFilename = '';
    try {
        if (dateStr.includes('.')) {
            const [day, month, year] = dateStr.split('.');
            dateForFilename = `${day.padStart(2, '0')}${month.padStart(2, '0')}${year}`;
        } else {
            const [year, month, day] = dateStr.split('-');
            dateForFilename = `${day}${month}${year}`;
        }
    } catch (e) {
        console.error("Chyba pri parsovaní dátumu:", e);
        dateForFilename = "neznamy_datum";
    }

    const miesto = formData.miesto || 'nezname';
    const miestoSanitized = miesto
        .replace(/[^a-zA-ZáäčďéěíňóôŕšťúůýžÁÄČĎÉĚÍŇÓÔŔŠŤÚŮÝŽ0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')

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
            if (!response.ok) {
                throw new Error(`Chyba pri načítaní šablóny: ${response.statusText}`);
            }

            const content = await response.arrayBuffer();
            const zip = new PizZip(content);
            const doc = new window.docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
                delimiters: { start: "{{", end: "}}" }
            });

            doc.setData(data);
            doc.render();

            const out = doc.getZip().generate({
                type: 'blob',
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });

            saveAs(out, filename);

            showToast("Cestovný príkaz bol úspešne vygenerovaný.", TOAST_TYPE.SUCCESS);
        } catch (error) {
            console.error('Nastala chyba pri generovaní dokumentu:', error);
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

        if (!startDateTime || !endDateTime) {
            throw new Error("Neplatný formát dátumu alebo času");
        }

        const durationHours = (endDateTime - startDateTime) / (1000 * 60 * 60);

        if (durationHours < 0) {
            throw new Error("Koniec cesty je skôr ako začiatok");
        }

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

            if (!mealRate) {
                console.warn(`Sadzba stravného nebola nájdená pre dátum: ${effectiveStart.toLocaleDateString('sk-SK')}`);
            }

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
                    dayCategory = "bez nároku (menej ako 5 hodín)";
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
            totalAmount: totalAllowance,
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
        day = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1; 
        year = parseInt(parts[2]);
    } 
    else if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        day = parseInt(parts[2]);
    } else {
        return null;
    }

    const timeParts = timeStr.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);

    return new Date(year, month, day, hours, minutes);
}

async function getMealRateForDate(date) {
    try {
        const snapshot = await _dbReference.collection('dietary').get();

        if (snapshot.empty) {
            console.error("Kolekcia 'dietary' je prázdna!");
            return null;
        }

        let validRate = null;

        snapshot.forEach(doc => {
            const data = doc.data();

            let validFrom;
            if (data.validFrom && data.validFrom.toDate) {
                validFrom = data.validFrom.toDate();
            } else if (data.validFrom) {
                validFrom = new Date(data.validFrom);
            } else {
                return; 
            }

            if (validFrom <= date) {
                if (!validRate || validFrom > validRate.validFrom) {
                    validRate = {
                        ...data,
                        validFrom: validFrom,
                        id: doc.id
                    };
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

    let dailyBreakdownHtml = '';
    if (result.dailyAllowances && result.dailyAllowances.length > 0) {
        dailyBreakdownHtml = `
            <div style="margin-top: var(--spacing-md);">
                <ul style="list-style: none; padding: 0; margin-top: var(--spacing-sm);">
        `;

        result.dailyAllowances.forEach(day => {
            dailyBreakdownHtml += `
                <li style="
                    margin-bottom: var(--spacing-sm); 
                    padding: var(--spacing-sm); 
                    background: var(--color-bg); 
                    border-radius: var(--radius-md); 
                    border-left: 3px solid var(--color-orange-accent);
                    transition: all var(--transition-fast);
                ">
                    <strong style="color: var(--color-text-primary);">${day.date}:</strong> 
                    <span style="color: var(--color-text-secondary);">
                        ${day.duration}h (${day.category})
                    </span>
                    = <strong style="color: var(--color-orange-accent); font-size: 1.05rem;">${day.amount} €</strong>
                </li>
            `;
        });

        dailyBreakdownHtml += '</ul></div>';
    }

    container.innerHTML = `
        <div style="
            padding: var(--spacing-xs); 
            transition: all var(--transition-normal);
        ">
            <p style="color: var(--color-text-secondary); margin-bottom: var(--spacing-sm);">
                <strong style="color: var(--color-text-primary);">Celkové trvanie cesty:</strong> ${result.duration} hodín
            </p>
            ${dailyBreakdownHtml}
            <p style="
                margin-top: var(--spacing-lg); 
                padding-top: var(--spacing-md);
                border-top: 1px solid var(--color-border);
                font-size: 1.2rem; 
                color: var(--color-orange-accent);
                font-weight: 700;
                font-family: var(--font-primary);
            ">
                Celková náhrada stravného: ${result.totalAmount} €
            </p>
        </div>
    `;
}

function displayMealAllowanceError(message) {
    const container = document.getElementById('meal-calculation-results');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = `
        <div style="padding: var(--spacing-sm); background: var(--color-bg); border-radius: var(--radius-md); border-left: 3px solid #E53E3E;">
            <p style="color: #E53E3E; margin: 0;">
                <strong>Chyba:</strong> ${message}
            </p>
        </div>
    `;
}

function attachMealCalculationListeners() {
    const dateFields = ['datum_zc_datum', 'datum_zc_cas', 'datum_kc_datum', 'datum_kc_cas'];

    dateFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', async () => {
                const startDate = document.getElementById('datum_zc_datum')?.value;
                const startTime = document.getElementById('datum_zc_cas')?.value;
                const endDate = document.getElementById('datum_kc_datum')?.value;
                const endTime = document.getElementById('datum_kc_cas')?.value;

                if (startDate && startTime && endDate && endTime) {
                    await calculateMealAllowance(startDate, startTime, endDate, endTime);
                }
            });
        }
    });
}

export function clearCPForm() {
    console.log('Spúšťam clearCPForm...');

    try {
        const textFields = [
            'ucel', 'miesto', 'spolucestujuci',
            'cesta_z1', 'miesto_1', 'cesta_k1',
            'cesta_z2', 'miesto_2', 'cesta_k2',
            'cesta_z3', 'miesto_3', 'cesta_k3'
        ];

        textFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
            }
        });
    } catch (e) {
        console.error('Chyba pri čistení textových polí:', e);
    }

    try {
        const dateFields = [
            'datum_zc_datum', 
            'datum_kc_datum', 
            'datum_1', 
            'datum_2'
        ];

        dateFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.value = '';
                if (field._flatpickr && typeof field._flatpickr.clear === 'function') {
                    field._flatpickr.clear();
                }
            }
        });
    } catch (e) {
        console.error('Chyba pri čistení dátumových polí (Flatpickr):', e);
    }

    try {
        const startTimeSelect = document.getElementById('datum_zc_cas');
        if (startTimeSelect) {
            startTimeSelect.value = '07:30';
        }
        const endTimeSelect = document.getElementById('datum_kc_cas');
        if (endTimeSelect) {
            endTimeSelect.value = '15:30';
        }
    } catch (e) {
        console.error('Chyba pri resetovaní časových polí:', e);
    }

    try {
        const mealCalculationContainer = document.getElementById('meal-calculation-results');
        if (mealCalculationContainer) {
            mealCalculationContainer.style.display = 'none';
            mealCalculationContainer.innerHTML = '';
        }
    } catch (e) {
        console.error('Chyba pri mazaní vyúčtovania stravy:', e);
    }

    console.log('Funkcia clearCPForm dokončená.');
}