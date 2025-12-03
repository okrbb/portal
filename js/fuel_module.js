import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';
import { logUserAction } from './logs_module.js';

let _db = null;
let _user = null;
let _carsUnsubscribe = null;

// Stav filtrov
let filterState = {
    month: '', // '' = Celkový prehľad (null)
    year: new Date().getFullYear().toString()
};

export function initializeFuelModule(db, activeUser) {
    console.log('Inicializujem modul PHM (Lite Version - bez pridávania áut)...');
    _db = db;
    _user = activeUser;

    if (!Permissions.canViewModule(activeUser, 'fuel-module')) return;

    setupEventListeners();
    populateYearSelect();
    loadCars(); // Spustí načítanie (Live listener)
}

function setupEventListeners() {
    // 1. Modálne okná - zatváranie a submit
    const closeFuelBtn = document.getElementById('close-fuel-modal');
    const fuelForm = document.getElementById('fuel-form');
    
    if (closeFuelBtn) closeFuelBtn.onclick = closeFuelModal;
    if (fuelForm) fuelForm.onsubmit = handleFuelSubmit;

    // (Voliteľné) Listenery pre Km modal
    const closeKmBtn = document.getElementById('close-km-modal');
    const kmForm = document.getElementById('km-form');
    if (closeKmBtn) closeKmBtn.onclick = closeKmModal;
    if (kmForm) kmForm.onsubmit = handleKmSubmit;

    // 2. Filtre (Mesiac / Rok)
    const monthSelect = document.getElementById('fuel-filter-month');
    const yearSelect = document.getElementById('fuel-filter-year');

    if (monthSelect && yearSelect) {
        // Nastavíme predvolené hodnoty
        monthSelect.value = ''; // Default: Celkový prehľad
        yearSelect.value = new Date().getFullYear();

        const handleFilterChange = () => {
            filterState.month = monthSelect.value;
            filterState.year = yearSelect.value;
            loadCars(); 
        };

        monthSelect.addEventListener('change', handleFilterChange);
        yearSelect.addEventListener('change', handleFilterChange);
    }

    const closeHistoryBtn = document.getElementById('close-history-modal');
    if (closeHistoryBtn) {
        closeHistoryBtn.onclick = () => document.getElementById('history-modal').classList.add('hidden');
    }
    
    // 3. Info / Help Modal
    const infoBtn = document.getElementById('fuel-info-btn');
    const helpModal = document.getElementById('fuel-help-modal');
    const closeHelpBtn = document.getElementById('close-fuel-help');
    const closeHelpFooter = document.getElementById('btn-close-help-footer');

    if (infoBtn && helpModal) {
        infoBtn.onclick = () => {
            helpModal.classList.remove('hidden');
        };
    }

    const closeHelpAction = () => {
        if (helpModal) helpModal.classList.add('hidden');
    };

    if (closeHelpBtn) closeHelpBtn.onclick = closeHelpAction;
    if (closeHelpFooter) closeHelpFooter.onclick = closeHelpAction;
}

function populateYearSelect() {
    const yearSelect = document.getElementById('fuel-filter-year');
    if (!yearSelect) return;
    
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = currentYear; y >= 2023; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        yearSelect.appendChild(opt);
    }
}

function loadCars() {
    const grid = document.getElementById('fuel-cars-grid');
    if (!grid) return;
    
    if (_carsUnsubscribe) {
        _carsUnsubscribe();
    }

    grid.innerHTML = '<div class="skeleton-wrapper"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div>';

    _carsUnsubscribe = _db.collection('cars').orderBy('brand').onSnapshot(async (snapshot) => {
        grid.innerHTML = '';
        
        if (snapshot.empty) {
            grid.innerHTML = '<p style="padding: 20px;">Zatiaľ nie sú pridané žiadne vozidlá.</p>';
            return;
        }

        const renderPromises = snapshot.docs.map(async (doc) => {
        const carData = doc.data();
        const carId = doc.id;
        
        let displayData = { ...carData }; 
        let isMonthlyView = false;

        // Vypočítame celkový dlhodobý priemer
        const realOverallConsumption = await calculateOverallAverage(carId);

        if (filterState.month !== '') {
            // === A. MESAČNÝ VÝKAZ ===
            isMonthlyView = true;
            
            // ZMENA: Posielame aj normy (carData.norm_city a carData.norm)
            const monthlyStats = await calculateMonthlyStats(
                carId, 
                filterState.month, 
                filterState.year, 
                realOverallConsumption,
                carData.norm_city || 0, // Norma Mesto
                carData.norm || 0       // Norma Mimo (v kóde je to field 'norm')
            );
            
            displayData.current_km = monthlyStats.distance; 
            displayData.average_consumption = monthlyStats.consumption;
            displayData.km_norm_c = monthlyStats.km_c;
            displayData.km_norm_a = monthlyStats.km_a;
            
            displayData.isVirtual = monthlyStats.isVirtual; 

        } else {
            // === B. CELKOVÝ PREHĽAD ===
            displayData.average_consumption = realOverallConsumption;
            displayData.isVirtual = false;
        }

        return createCarCard(carId, carData, displayData, isMonthlyView);
    });

        const cards = await Promise.all(renderPromises);
        cards.forEach(card => grid.appendChild(card));
    });
}

/**
 * Vypočíta štatistiky pre konkrétne auto a mesiac s INTELIGENTNÝM VYHLADZOVANÍM
 */
async function calculateMonthlyStats(carId, monthStr, yearStr, overallAvgFallback, normCity, normOutside) {
    const month = parseInt(monthStr);
    const year = parseInt(yearStr);

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    try {
        const carRef = _db.collection('cars').doc(carId);

        let sumLiters = 0;
        let sumDistance = 0;
        let sumKmC = 0;
        let sumKmA = 0;

        // 1. Načítanie dát (Tankovania)
        const fuelSnap = await carRef.collection('refuelings')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get();

        fuelSnap.forEach(doc => {
            const d = doc.data();
            sumLiters += (d.liters || 0);
            sumDistance += (d.distance_driven || 0);
            sumKmC += (d.km_c || 0);
            sumKmA += (d.km_a || 0);
        });

        // 2. Načítanie dát (Jazdy)
        const kmSnap = await carRef.collection('km_logs')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get();

        kmSnap.forEach(doc => {
            const d = doc.data();
            sumDistance += (d.distance_driven || 0);
            sumKmC += (d.km_c || 0);
            sumKmA += (d.km_a || 0);
        });

        // --- VÝPOČET SPOTREBY ---
        let avgCons = 0;
        let isVirtual = false;
        
        // Zadefinujeme si referenčnú hodnotu (dlhodobý priemer alebo norma)
        // Toto je hodnota, okolo ktorej by sa auto malo reálne pohybovať
        const referenceValue = overallAvgFallback > 0 ? overallAvgFallback : (parseFloat(normCity) || 0);

        if (sumDistance > 0) {
            if (sumLiters > 0) {
                // A. Reálny matematický výpočet pre tento mesiac
                let calculatedMonthlyCons = (sumLiters / sumDistance) * 100;

                // --- INTELIGENTNÁ KONTROLA (Anti-Spike Logic) ---
                // Ak je vypočítaná spotreba extrémna (napr. > 2.0 násobok normálu/priemeru)
                // a zároveň máme nejakú referenčnú hodnotu, považujeme to za "Doplatenie paliva"
                // a zobrazíme radšej dlhodobý priemer, aby sme nešokovali užívateľa.
                
                if (referenceValue > 0 && calculatedMonthlyCons > (referenceValue * 2.0)) {
                    // Prípad: Marec (37 Litrov vs 10 Litrov priemer)
                    avgCons = overallAvgFallback > 0 ? overallAvgFallback : referenceValue;
                    isVirtual = true; // Označíme to ako "Virtuálny/Odhadovaný" údaj
                } else {
                    // Prípad: Bežný mesiac, tankovanie sedí s kilometrami
                    avgCons = calculatedMonthlyCons;
                }

            } else {
                // B. Netankovalo sa (Január/Február) -> Použijeme odhad
                isVirtual = true;

                if (overallAvgFallback > 0) {
                    avgCons = overallAvgFallback;
                } else {
                    // Záložný výpočet podľa normy
                    const nCity = parseFloat(normCity) || 0;
                    const nOut = parseFloat(normOutside) || 0;

                    if (nCity > 0 || nOut > 0) {
                        const theoreticalLitersCity = (sumKmC * nCity) / 100;
                        const theoreticalLitersOut = (sumKmA * nOut) / 100;
                        avgCons = ((theoreticalLitersCity + theoreticalLitersOut) / sumDistance) * 100;
                    } else {
                        avgCons = 0;
                    }
                }
            }
        }

        return {
            distance: sumDistance,
            consumption: avgCons,
            km_c: sumKmC,
            km_a: sumKmA,
            isVirtual: isVirtual 
        };

    } catch (e) {
        console.error(`Chyba pri výpočte stats:`, e);
        return { distance: 0, consumption: 0, km_c: 0, km_a: 0, isVirtual: false };
    }
}

/**
 * Vypočíta celkovú priemernú spotrebu zo všetkých záznamov v histórii.
 * Sčítava kilometre z tankovaní (refuelings) AJ z jázd (km_logs).
 */
async function calculateOverallAverage(carId) {
    try {
        const carRef = _db.collection('cars').doc(carId);
        
        let sumLiters = 0;
        let sumDistance = 0;

        // 1. Načítanie TANKOVANÍ (refuelings)
        // Získame litre a kilometre prejdené pri tankovaní
        const fuelSnap = await carRef.collection('refuelings').get();
        fuelSnap.forEach(doc => {
            const d = doc.data();
            sumLiters += (d.liters || 0);
            sumDistance += (d.distance_driven || 0);
        });

        // 2. Načítanie JÁZD (km_logs) - OPRAVA
        // Musíme pripočítať aj kilometre z jázd bez tankovania
        const kmSnap = await carRef.collection('km_logs').get();
        kmSnap.forEach(doc => {
            const d = doc.data();
            sumDistance += (d.distance_driven || 0);
        });

        // Výpočet
        if (sumDistance > 0) {
            return (sumLiters / sumDistance) * 100;
        } else {
            return 0;
        }

    } catch (e) {
        console.error(`Chyba pri výpočte celkovej spotreby pre ${carId}:`, e);
        return 0;
    }
}

/**
 * Vykreslí kartu vozidla.
 */
function createCarCard(docId, rawCarData, displayData, isMonthly) {
    const div = document.createElement('div');
    div.className = 'dashboard-card'; 
    div.style.flex = '1 0 400px'; 
    div.style.minWidth = '400px';
    div.style.maxWidth = '600px';

    // Základná logika farieb
    let consumptionColor = '#48BB78'; // Zelená
    if (rawCarData.norm_city && displayData.average_consumption > rawCarData.norm_city) {
        consumptionColor = '#E53E3E'; // Červená (nadspotreba)
    }

    // NOVÉ: Ak je to virtuálna spotreba, prepíšeme farbu na Oranžovú
    let consumptionIcon = '';
    let consumptionLabelTitle = '';
    
    if (displayData.isVirtual) {
        consumptionColor = '#DD6B20'; // Oranžová
        consumptionIcon = '<i class="fas fa-calculator" style="margin-right:4px; font-size: 0.9em;"></i>';
        consumptionLabelTitle = ' (Odhad podľa dlhodobého priemeru)';
    }

    // Formátovanie noriem
    const normCityDisplay = rawCarData.norm_city ? Number(rawCarData.norm_city).toFixed(1) + ' L' : '--';
    const normOutsideDisplay = rawCarData.norm ? Number(rawCarData.norm).toFixed(1) + ' L' : '--';
    
    // --- VÝPOČET HODNÔT ---
    
    // 1. Tachometer / Najazdené
    const valKm = displayData.current_km ? Number(displayData.current_km).toLocaleString() : '0';
    
    // 2. Spotreba
    const valCons = displayData.average_consumption ? Number(displayData.average_consumption).toFixed(2) : '--';

    // 3. Normy KM (Mesto / Mimo)
    let rawKmC = displayData.km_norm_c || 0;
    let rawKmA = displayData.km_norm_a || 0;

    // Ak sme v globálnom prehľade, pripočítame štartovacie stavy
    if (!isMonthly) {
        rawKmC += (rawCarData.start_km_norm_c || 0);
        rawKmA += (rawCarData.start_km_norm_a || 0);
    }

    const valKmC = Number(rawKmC).toLocaleString();
    const valKmA = Number(rawKmA).toLocaleString();

    // Popisky
    const labelTachometer = isMonthly ? `Najazdené (${parseInt(filterState.month) + 1}/${filterState.year})` : 'Stav tachometra';
    
    // VYMAZAL SOM PÔVODNÝ RIADOK ODTIAĽTO

    const labelKmC = isMonthly ? 'Jazdy mesto (mesiac)' : 'Km norma C (celkom)';
    const labelKmA = isMonthly ? 'Jazdy mimo (mesiac)' : 'Km norma A (celkom)';

    // PONECHAL SOM TENTO NOVÝ (obsahuje logiku pre "displayData.isVirtual")
    const labelSpotreba = isMonthly ? 
        (displayData.isVirtual ? 'Odhad spotreby' : 'Priemer v mesiaci') : 
        'Reálna spotreba';

    // Výpočet "Najazdené v evidencii"
    let drivenTotalHtml = '';
    if (!isMonthly && rawCarData.start_km !== undefined) {
        const drivenTotal = (rawCarData.current_km || 0) - rawCarData.start_km;
        if (drivenTotal >= 0) {
            drivenTotalHtml = `
                <div style="font-size: 0.75rem; color: #48BB78; margin-top: 4px; font-weight: 500;">
                    <i class="fas fa-route"></i> V evidencii: +${Number(drivenTotal).toLocaleString()} km
                </div>
            `;
        }
    }

    // Indikátor filtra
    let filterIndicator = '';
    if (isMonthly) {
        div.style.borderTopColor = '#3182ce'; 
        filterIndicator = `<span style="font-size:0.7rem; background:#3182ce; color:white; padding:2px 6px; border-radius:4px; margin-left:auto;">Mesačný výkaz</span>`;
    }

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem; border-bottom: 1px solid var(--color-border); padding-bottom: 10px;">
            <div>
                <h3 style="margin:0; font-size:1.2rem;">${rawCarData.brand}</h3>
                <span style="color:var(--color-orange-accent); font-weight:700; font-size:0.9rem;">${docId}</span>
            </div>
            <div style="text-align:right;">
                ${filterIndicator}
                <div style="font-size:0.8rem; color:var(--color-text-secondary); margin-top:4px;">ID: <strong>${rawCarData.evidence_number}</strong></div>
            </div>
        </div>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom: 1.5rem;">
            
            <div style="background:var(--color-bg); padding:10px; border-radius:8px; border:1px solid var(--color-border);">
                <div style="font-size:0.75rem; color:var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.5px;">${labelTachometer}</div>
                <div style="font-size:1.1rem; font-weight:600;">${valKm} km</div>
                ${drivenTotalHtml}
            </div>
            <div style="background:var(--color-bg); padding:10px; border-radius:8px; border:1px solid var(--color-border);">
                <div style="font-size:0.75rem; color:var(--color-text-secondary); text-transform:uppercase; letter-spacing:0.5px;">${labelSpotreba}</div>
                <div style="font-size:1.1rem; font-weight:600; color:${consumptionColor};" title="${displayData.isVirtual ? 'V tomto mesiaci sa netankovalo. Hodnota je vypočítaná z dlhodobého priemeru vozidla.' : ''}">
                        ${consumptionIcon}${valCons} L
                </div>
            </div>

            <div style="background:var(--color-bg); padding:10px; border-radius:8px; border:1px solid var(--color-border);">
                <div style="font-size:0.75rem; color:var(--color-text-secondary);">${labelKmC}</div>
                <div style="font-size:1.1rem; font-weight:600;">${valKmC} km</div>
            </div>
            <div style="background:var(--color-bg); padding:10px; border-radius:8px; border:1px solid var(--color-border);">
                <div style="font-size:0.75rem; color:var(--color-text-secondary);">${labelKmA}</div>
                <div style="font-size:1.1rem; font-weight:600;">${valKmA} km</div>
            </div>

            <div style="background:var(--color-bg); padding:10px; border-radius:8px; border:1px solid var(--color-border); opacity: 0.8;">
                <div style="font-size:0.75rem; color:var(--color-text-secondary);">Norma (mesto)</div>
                <div style="font-size:1.0rem; font-weight:500;">${normCityDisplay}</div>
            </div>
            <div style="background:var(--color-bg); padding:10px; border-radius:8px; border:1px solid var(--color-border); opacity: 0.8;">
                <div style="font-size:0.75rem; color:var(--color-text-secondary);">Norma (mimo)</div>
                <div style="font-size:1.0rem; font-weight:500;">${normOutsideDisplay}</div>
            </div>

        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button class="ua-btn default history-btn" data-id="${docId}">História</button>
            <button class="ua-btn default km-btn" data-id="${docId}" data-km="${rawCarData.current_km}">
                Jazda
            </button>
            <button class="ua-btn accent refuel-btn" data-id="${docId}" data-km="${rawCarData.current_km}">
                Tankovať
            </button>
        </div>
    `;

    // Listenery
    div.querySelector('.refuel-btn').onclick = () => openFuelModal(docId, rawCarData.current_km);
    div.querySelector('.history-btn').onclick = () => openHistoryModal(docId, rawCarData.brand);
    div.querySelector('.km-btn').onclick = () => openKmModal(docId, rawCarData.current_km);

    return div;
}

// --- MODÁLNE OKNÁ ---

function openFuelModal(carId = null, currentKm = 0) {
    const modal = document.getElementById('fuel-modal');
    // Nastavíme nadpis napevno, keďže už máme len jednu funkciu
    const title = document.getElementById('fuel-modal-title');
    if(title) title.textContent = 'Zaevidovať tankovanie';

    const carIdInput = document.getElementById('fuel-car-id');
    const dateInput = document.getElementById('fuel-date');
    const kmInput = document.getElementById('fuel-km');
    
    // Zobrazíme správnu sekciu (ak by tam ešte ostala stará štruktúra v HTML)
    const newCarFields = document.getElementById('new-car-fields');
    const refuelFields = document.getElementById('refuel-fields');
    if(newCarFields) newCarFields.classList.add('hidden');
    if(refuelFields) refuelFields.classList.remove('hidden');

    document.getElementById('fuel-form').reset();
    
    // INTELIGENTNÝ DÁTUM
    let defaultDate = new Date();
    if (filterState.month !== '') {
        const filterMonth = parseInt(filterState.month);
        const filterYear = parseInt(filterState.year);
        if (defaultDate.getMonth() !== filterMonth || defaultDate.getFullYear() !== filterYear) {
            defaultDate = new Date(filterYear, filterMonth, 1, 12, 0, 0); 
        }
    }
    dateInput.valueAsDate = defaultDate;

    modal.classList.remove('hidden');
    carIdInput.value = carId || '';

    // Nastavenie min. km a predvyplnenie
    if (kmInput) {
        kmInput.min = currentKm + 1;
        kmInput.value = currentKm; 
    }
}

function openKmModal(carId, currentKm = 0) {
    const modal = document.getElementById('km-modal');
    document.getElementById('km-form').reset();
    
    // Inteligentný dátum (rovnako ako pri tankovaní)
    const dateInput = document.getElementById('km-date');
    let defaultDate = new Date();
    if (filterState.month !== '') {
        const filterMonth = parseInt(filterState.month);
        const filterYear = parseInt(filterState.year);
        if (defaultDate.getMonth() !== filterMonth || defaultDate.getFullYear() !== filterYear) {
            defaultDate = new Date(filterYear, filterMonth, 1, 12, 0, 0); 
        }
    }
    dateInput.valueAsDate = defaultDate;

    document.getElementById('km-car-id').value = carId;
    
    // Nastavenie limitov pre tachometer
    const kmInput = document.getElementById('km-total-state');
    if (kmInput) {
        kmInput.min = currentKm + 1;
        kmInput.value = currentKm; // Predvyplníme aktuálny stav
    }

    modal.classList.remove('hidden');
}

function closeFuelModal() { document.getElementById('fuel-modal').classList.add('hidden'); }
function closeKmModal() { document.getElementById('km-modal').classList.add('hidden'); }

// --- LOGIKA UKLADANIA ---

async function handleFuelSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Ukladám...';

    try {
        await processRefueling();
        closeFuelModal();
        showToast('Záznam uložený. Dáta sa aktualizujú...', TOAST_TYPE.SUCCESS);
    } catch (error) {
        console.error("Fuel Error:", error);
        showToast('Chyba: ' + error.message, TOAST_TYPE.ERROR);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Uložiť záznam';
    }
}

async function processRefueling() {
    const carId = document.getElementById('fuel-car-id').value;
    const newKm = parseInt(document.getElementById('fuel-km').value);
    const liters = parseFloat(document.getElementById('fuel-liters').value);
    const price = parseFloat(document.getElementById('fuel-price').value) || 0;
    const date = document.getElementById('fuel-date').value;
    
    // Načítanie poľa pre mesto
    const kmCityInput = parseFloat(document.getElementById('fuel-km-city').value) || 0;
    
    const carRef = _db.collection('cars').doc(carId);
    const carDoc = await carRef.get();
    const prevKm = carDoc.data().current_km;

    if (newKm <= prevKm) {
        throw new Error(`Nový stav (${newKm}) musí byť vyšší ako predchádzajúci (${prevKm}).`);
    }

    // 1. Výpočet celkovej vzdialenosti
    const distanceTotal = newKm - prevKm;

    // 2. Kontrola logiky
    if (kmCityInput > distanceTotal) {
        throw new Error(`Km v meste (${kmCityInput}) nemôžu byť vyššie ako celková prejdená vzdialenosť (${distanceTotal}).`);
    }

    // 3. Automatický výpočet "Mimo mesta"
    const distanceOutside = distanceTotal - kmCityInput;

    // 4. Výpočet spotreby
    const consumption = (liters / distanceTotal) * 100;

    // 5. Uloženie do subkolekcie refuelings
    await carRef.collection('refuelings').add({
        date: new Date(date),
        liters: liters,
        price: price,
        km_total: newKm,
        
        distance_driven: distanceTotal, 
        km_c: kmCityInput,              
        km_a: distanceOutside,          
        
        consumption_l100: parseFloat(consumption.toFixed(2))
    });

    // 6. Update hlavného dokumentu vozidla
    await carRef.update({
        current_km: newKm,
        average_consumption: parseFloat(consumption.toFixed(2)),
        last_refuel_date: new Date(date),
        
        // Pripočítame k celkovým počítadlám
        km_norm_c: firebase.firestore.FieldValue.increment(kmCityInput),
        km_norm_a: firebase.firestore.FieldValue.increment(distanceOutside)
    });
    
    logUserAction("PHM", `Tankovanie ${carId}: ${liters}L, ${distanceTotal}km (Mesto: ${kmCityInput}, Mimo: ${distanceOutside})`);
}

async function handleKmSubmit(e) {
    e.preventDefault();
    
    const carId = document.getElementById('km-car-id').value;
    const dateVal = document.getElementById('km-date').value;
    
    // 1. Získame nový stav tachometra a km v meste
    const newKm = parseInt(document.getElementById('km-total-state').value);
    const kmCityInput = parseFloat(document.getElementById('km-city-input').value) || 0;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Ukladám...';

    try {
        const carRef = _db.collection('cars').doc(carId);
        
        // Získame aktuálny stav z DB pre kontrolu
        const carDoc = await carRef.get();
        const prevKm = carDoc.data().current_km;

        if (newKm <= prevKm) {
            throw new Error(`Nový stav (${newKm}) musí byť vyšší ako aktuálny (${prevKm}).`);
        }

        // 2. Výpočet vzdialeností
        const distanceTotal = newKm - prevKm; // Celková prejdená vzdialenosť

        if (kmCityInput > distanceTotal) {
            throw new Error(`Km v meste (${kmCityInput}) nemôžu byť vyššie ako celková trasa (${distanceTotal}).`);
        }

        const distanceOutside = distanceTotal - kmCityInput; // Automatický výpočet

        // 3. Uloženie do km_logs (História jázd)
        await carRef.collection('km_logs').add({
            date: new Date(dateVal),
            km_total: newKm,        // Uložíme aj stav tachometra pre kontrolu
            distance_driven: distanceTotal,
            km_c: kmCityInput,      // Mesto
            km_a: distanceOutside,  // Mimo
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            user_email: _user.email || 'unknown'
        });

        // 4. Update hlavného tachometra a noriem na aute
        // POZOR: Teraz aktualizujeme aj 'current_km', lebo auto sa hýbalo!
        await carRef.update({
            current_km: newKm, // Posunieme tachometer
            km_norm_c: firebase.firestore.FieldValue.increment(kmCityInput),
            km_norm_a: firebase.firestore.FieldValue.increment(distanceOutside)
        });

        showToast(`Jazda zapísaná (+${distanceTotal} km).`, TOAST_TYPE.SUCCESS);
        closeKmModal();

    } catch (error) {
        console.error("Chyba:", error);
        showToast("Chyba: " + error.message, TOAST_TYPE.ERROR);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Uložiť jazdu';
    }
}

async function openHistoryModal(carId, carBrand) {
    const modal = document.getElementById('history-modal');
    const title = document.getElementById('history-modal-title');
    const tbody = document.getElementById('history-table-body');
    const footer = modal.querySelector('.modal-footer'); 
    
    title.textContent = `História: ${carBrand}`;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Načítavam údaje...</td></tr>';
    
    // 1. Vyčistíme footer (odstránime staré tlačidlá pri otvorení)
    footer.innerHTML = '';
    
    modal.classList.remove('hidden');

    try {
        const carRef = _db.collection('cars').doc(carId);

        const [refuelSnap, kmSnap, carDoc] = await Promise.all([
            carRef.collection('refuelings').get(),
            carRef.collection('km_logs').get(),
            carRef.get()
        ]);

        const carData = carDoc.data();
        const normCity = parseFloat(carData.norm_city) || 0;
        const normOutside = parseFloat(carData.norm) || 0;

        let events = [];
        let grandTotalLiters = 0;
        let grandTotalDistance = 0;

        refuelSnap.forEach(doc => {
            const data = doc.data();
            grandTotalLiters += (data.liters || 0);
            grandTotalDistance += (data.distance_driven || 0);
            events.push({
                type: 'tankovanie',
                date: data.date.toDate(),
                km_total: data.km_total,
                distance: data.distance_driven,
                liters: data.liters,
                consumption: data.consumption_l100, 
                km_c: data.km_c || 0,
                km_a: data.km_a || 0
            });
        });

        kmSnap.forEach(doc => {
            const data = doc.data();
            grandTotalDistance += (data.distance_driven || 0);
            events.push({
                type: 'jazda',
                date: data.date.toDate(),
                km_total: data.km_total,
                distance: data.distance_driven,
                km_c: data.km_c || 0,
                km_a: data.km_a || 0
            });
        });

        let globalAverage = 0;
        if (grandTotalDistance > 0) {
            globalAverage = (grandTotalLiters / grandTotalDistance) * 100;
        }

        events.sort((a, b) => b.date - a.date);

        const monthlyStats = {};
        events.forEach(e => {
            const monthKey = `${e.date.getFullYear()}-${e.date.getMonth()}`; 
            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = { km: 0, liters: 0, km_c: 0, km_a: 0 };
            }
            monthlyStats[monthKey].km += (e.distance || 0);
            monthlyStats[monthKey].km_c += (e.km_c || 0);
            monthlyStats[monthKey].km_a += (e.km_a || 0);

            if (e.type === 'tankovanie') {
                monthlyStats[monthKey].liters += (e.liters || 0);
            }
        });

        // --- VYKRESLENIE HTML ---
        tbody.innerHTML = '';
        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Zatiaľ žiadne záznamy.</td></tr>';
            return;
        }

        let currentMonthKey = null;
        const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

        events.forEach(item => {
            const itemMonthKey = `${item.date.getFullYear()}-${item.date.getMonth()}`;

            if (itemMonthKey !== currentMonthKey) {
                const stats = monthlyStats[itemMonthKey];
                const monthName = monthNames[item.date.getMonth()];
                const year = item.date.getFullYear();
                
                let monthlyConsumptionStr = '<span style="color:#aaa; font-weight:normal;">--</span>';
                
                if (stats.km > 0) {
                    if (stats.liters > 0) {
                        const realCons = (stats.liters / stats.km) * 100;
                        const color = (globalAverage > 0 && realCons > globalAverage * 1.3) ? '#E53E3E' : '#48BB78';
                        monthlyConsumptionStr = `<strong style="color:${color}; font-size: 1rem;">${realCons.toFixed(2)} L/100km</strong>`;
                    } else {
                        let virtualCons = 0;
                        if (normCity > 0 || normOutside > 0) {
                            const theoreticalLiters = ((stats.km_c * normCity) + (stats.km_a * normOutside)) / 100;
                            virtualCons = (theoreticalLiters / stats.km) * 100;
                        } else if (globalAverage > 0) {
                            virtualCons = globalAverage;
                        }

                        monthlyConsumptionStr = `
                            <div style="display:flex; flex-direction:column; align-items:flex-end;">
                                <span style="font-size: 0.85rem;">(bez tankovania)</span>
                                ${virtualCons > 0 
                                    ? `<span style="color:#DD6B20; font-size: 0.8rem; opacity: 0.8;"><i class="fas fa-calculator"></i> ~${virtualCons.toFixed(2)} L/100km</span>` 
                                    : ''}
                            </div>
                        `;
                    }
                }

                const summaryRow = document.createElement('tr');
                summaryRow.style.cssText = `font-size: 0.9rem; border-bottom: 2px solid var(--color-border); font-weight: 700; color: var(--color-text-primary);`;
                
                summaryRow.innerHTML = `
                    <td colspan="2" style="padding: 15px 10px;">${monthName} ${year}</td>
                    <td colspan="2" class="text-right" style="padding: 15px 10px;">Spolu: ${stats.km.toLocaleString()} km</td>
                    <td class="text-right" style="padding: 15px 10px;">${monthlyConsumptionStr}</td>
                    <td></td>
                `;
                tbody.appendChild(summaryRow);
                currentMonthKey = itemMonthKey;
            }

            const tr = document.createElement('tr');
            const dateStr = item.date.toLocaleDateString('sk-SK') + ' ' + 
                          item.date.toLocaleTimeString('sk-SK', {hour: '2-digit', minute:'2-digit'});
            let typeHtml = '', consumptionHtml = '';

            if (item.type === 'tankovanie') {
                typeHtml = `<span class="badge-event badge-refuel"><i class="fas fa-gas-pump"></i> Tankovanie</span>`;
                
                let displayVal = item.consumption;
                let isSmoothed = false;
                if (globalAverage > 0 && displayVal > (globalAverage * 2.0)) {
                    displayVal = globalAverage;
                    isSmoothed = true;
                }

                const litersPart = `<div style="font-weight:bold;">${item.liters.toFixed(2)} L</div>`;
                let consPart = isSmoothed 
                    ? `<div style="color: #DD6B20; font-size: 0.85rem;" title="Vyhladená hodnota"><i class="fas fa-calculator" style="font-size: 0.8em;"></i> ~${displayVal.toFixed(2)} L/100km</div>`
                    : `<div style="font-size:0.8rem; color:#aaa;">${displayVal ? displayVal.toFixed(2) + ' L/100km' : ''}</div>`;
                
                consumptionHtml = litersPart + consPart;
            } else {
                typeHtml = `<span class="badge-event badge-drive"><i class="fas fa-route"></i> Jazda</span>`;
                if (globalAverage > 0) {
                    consumptionHtml = `<div style="color: #aaa; font-size: 0.8rem;">~${globalAverage.toFixed(2)} L (odhad)</div>`;
                } else {
                    consumptionHtml = `<span style="color:#aaa;">-</span>`;
                }
            }

            tr.innerHTML = `
                <td style="padding-left: 20px; font-size: 0.9em; opacity: 0.8;">${dateStr}</td>
                <td style="opacity: 0.9;">${typeHtml}</td>
                <td class="text-right" style="opacity: 0.9;">${item.km_total.toLocaleString()} km</td>
                <td class="text-right">+${item.distance.toLocaleString()} km</td>
                <td class="text-right">${consumptionHtml}</td>
                <td class="text-right"><div style="font-size:1em; opacity: 0.7;">C: ${item.km_c} ~ A: ${item.km_a}</div></td>
            `;
            tbody.appendChild(tr);
        });

        // --- 2. UPDATE FOOTERU (TLAČIDLÁ) ---
        footer.innerHTML = ''; // Vyčistíme footer
        footer.style.display = 'flex';
        footer.style.gap = '10px';
        footer.style.justifyContent = 'flex-end';

        // Tlačidlo Excel
        const excelBtn = document.createElement('button');
        excelBtn.className = 'ua-btn default';
        excelBtn.innerHTML = 'Export Excel';
        excelBtn.onclick = () => downloadHistoryExcel(carBrand, events, monthlyStats, normCity, normOutside, globalAverage);

        // Tlačidlo PDF
        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'ua-btn default';
        pdfBtn.innerHTML = 'Stiahnuť PDF';
        pdfBtn.onclick = () => downloadHistoryPdf(carBrand, events, monthlyStats, normCity, normOutside, globalAverage);

        footer.appendChild(excelBtn);
        footer.appendChild(pdfBtn);

    } catch (error) {
        console.error("Chyba histórie:", error);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #E53E3E;">Chyba: ${error.message}</td></tr>`;
    }
}

/**
 * Generuje PDF z histórie vozidla s použitím lokálneho fontu DejaVuSans
 */
async function downloadHistoryPdf(carBrand, events, monthlyStats, normCity, normOutside, globalAverage) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // --- 1. NAČÍTANIE FONTU (DejaVuSans) ---
    // Používame rovnaký lokálny font ako v module pohotovosti
    try {
        const fontUrl = 'fonts/DejaVuSans.ttf';
        const response = await fetch(fontUrl);
        
        if (!response.ok) throw new Error(`Font sa nenašiel (status: ${response.status})`);
        
        const fontBuffer = await response.arrayBuffer();
        const base64Font = arrayBufferToBase64(fontBuffer);

        // Pridanie fontu do jsPDF
        doc.addFileToVFS('DejaVuSans.ttf', base64Font);
        doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
        doc.setFont('DejaVuSans'); 
    } catch (e) {
        console.warn("Nepodarilo sa načítať lokálny font, PDF môže mať chybnú diakritiku:", e);
    }

    // --- 2. Hlavička dokumentu ---
    doc.setFontSize(18);
    doc.text(`História vozidla: ${carBrand}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Dátum generovania: ${new Date().toLocaleDateString('sk-SK')}`, 14, 28);

    // --- 3. Príprava dát pre tabuľku ---
    const tableBody = [];
    let currentMonthKey = null;
    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

    events.forEach(item => {
        const itemMonthKey = `${item.date.getFullYear()}-${item.date.getMonth()}`;

        // === A. VLOŽENIE SÚHRNNÉHO RIADKU ===
        if (itemMonthKey !== currentMonthKey) {
            const stats = monthlyStats[itemMonthKey];
            const monthName = monthNames[item.date.getMonth()];
            const year = item.date.getFullYear();
            
            let consumptionStr = '--';

            if (stats.km > 0) {
                if (stats.liters > 0) {
                    const val = (stats.liters / stats.km) * 100;
                    consumptionStr = `${val.toFixed(2)} L/100km`;
                } else {
                    let virtualCons = 0;
                    if (normCity > 0 || normOutside > 0) {
                        const theoreticalLiters = ((stats.km_c * normCity) + (stats.km_a * normOutside)) / 100;
                        virtualCons = (theoreticalLiters / stats.km) * 100;
                    } else if (globalAverage > 0) {
                        virtualCons = globalAverage;
                    }
                    consumptionStr = `~${virtualCons.toFixed(2)} L (Odhad)`;
                }
            }

            tableBody.push([
                { content: `${monthName} ${year}`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
                { content: `Spolu: ${stats.km.toLocaleString()} km`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240] } },
                { content: consumptionStr, styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 240, 240] } },
                { content: '', styles: { fillColor: [240, 240, 240] } }
            ]);

            currentMonthKey = itemMonthKey;
        }

        // === B. VLOŽENIE RIADKU UDALOSTI ===
        const dateStr = item.date.toLocaleDateString('sk-SK') + ' ' + 
                      item.date.toLocaleTimeString('sk-SK', {hour: '2-digit', minute:'2-digit'});
        
        let typeStr = item.type === 'tankovanie' ? 'Tankovanie' : 'Jazda';
        let consCell = '-';

        if (item.type === 'tankovanie') {
            consCell = `${item.liters.toFixed(2)} L`;
            if(item.consumption) {
                 consCell += `\n(${item.consumption.toFixed(2)} L/100km)`;
            }
        } else {
            if (globalAverage > 0) consCell = `(~${globalAverage.toFixed(2)} L/100km)`;
        }

        tableBody.push([
            dateStr,
            typeStr,
            `${item.km_total} km`,
            `+${item.distance} km`,
            consCell,
            `C: ${item.km_c} / A: ${item.km_a}`
        ]);
    });

    // --- 4. Generovanie tabuľky ---
    doc.autoTable({
        startY: 35,
        head: [['Dátum', 'Udalosť', 'Tachometer', 'Vzdialenosť', 'Spotreba', 'Mesto / Mimo']],
        body: tableBody,
        theme: 'grid',
        styles: { 
            fontSize: 8, 
            cellPadding: 2,
            font: 'DejaVuSans' // Použitie načítaného fontu
        },
        headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' }
        }
    });

    // --- 5. Uloženie ---
    const safeBrand = carBrand.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateFile = new Date().toISOString().split('T')[0];
    doc.save(`historia_${safeBrand}_${dateFile}.pdf`);
}

/**
 * Generuje a stiahne Excel súbor - IBA REÁLNE DÁTA (bez odhadov a bez času)
 */
function downloadHistoryExcel(carBrand, events, monthlyStats, normCity, normOutside, globalAverage) {
    if (!events || events.length === 0) {
        showToast('Žiadne dáta na export.', TOAST_TYPE.ERROR);
        return;
    }

    // 1. Príprava dát (Odstránený stĺpec Čas)
    const wsData = [
        ['Dátum', 'Typ udalosti', 'Stav tachometra (km)', 'Prejdená vzdialenosť (km)', 'Natankované (L)', 'Spotreba (L/100km)', 'Jazda mesto (km)', 'Jazda mimo mesto (km)']
    ];

    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
    let currentMonthKey = null;
    const summaryRowIndices = []; 

    events.forEach(item => {
        const itemMonthKey = `${item.date.getFullYear()}-${item.date.getMonth()}`;

        // === A. VLOŽENIE SUMÁRNEHO RIADKU ===
        if (itemMonthKey !== currentMonthKey) {
            
            if (currentMonthKey !== null) {
                // Vložíme prázdny riadok s 8 stĺpcami (jeden ubudol)
                wsData.push(['', '', '', '', '', '', '', '']); 
            }

            const stats = monthlyStats[itemMonthKey] || { km: 0, liters: 0 };
            const monthName = monthNames[item.date.getMonth()];
            const year = item.date.getFullYear();

            // Výpočet iba reálnej spotreby
            let consumptionStr = '';
            let litersStr = '';

            if (stats.liters > 0) {
                litersStr = stats.liters;
                if (stats.km > 0) {
                    const val = (stats.liters / stats.km) * 100;
                    consumptionStr = val.toFixed(2); 
                }
            } else {
                litersStr = '-';
                consumptionStr = '-';
            }

            // Pridanie sumárneho riadku (bez stĺpca Čas)
            wsData.push([
                `${monthName} ${year}`,       // A: Mesiac
                '',                           // B: (miesto pre Typ)
                '',                           // C: (miesto pre Tachometer)
                `Spolu: ${stats.km}`,         // D: Sumár KM
                litersStr,                    // E: Sumár Litre
                consumptionStr,               // F: Spotreba
                '',                           // G
                ''                            // H
            ]);

            summaryRowIndices.push(wsData.length - 1);
            currentMonthKey = itemMonthKey;
        }

        // === B. VLOŽENIE RIADKU UDALOSTI ===
        const dateStr = item.date.toLocaleDateString('sk-SK');
        // Čas už neformátujeme ani nevkladáme
        let typeStr = item.type === 'tankovanie' ? 'Tankovanie' : 'Jazda';

        wsData.push([
            dateStr,
            typeStr,
            item.km_total,
            item.distance,
            item.liters > 0 ? item.liters : '',
            item.consumption > 0 ? item.consumption : '',
            item.km_c || 0,
            item.km_a || 0
        ]);
    });

    // 2. Vytvorenie hárku
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 3. Formátovanie
    const range = XLSX.utils.decode_range(ws['!ref']);
    
    // Zapnutie filtrov
    ws['!autofilter'] = { ref: ws['!ref'] };

    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[address]) continue;

            if (!ws[address].s) ws[address].s = {};

            // Hlavička
            if (R === 0) {
                ws[address].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    alignment: { wrapText: true, horizontal: "center", vertical: "center" },
                    fill: { fgColor: { rgb: "44546A" } },
                    border: { bottom: { style: "medium", color: { auto: 1 } } }
                };
            }
            // Sumárny riadok
            else if (summaryRowIndices.includes(R)) {
                ws[address].s = {
                    font: { bold: true, color: { rgb: "000000" } },
                    fill: { fgColor: { rgb: "E2E8F0" } },
                    alignment: { vertical: "center" },
                    border: { 
                        top: { style: "thin", color: { rgb: "A0AEC0" } },
                        bottom: { style: "thin", color: { rgb: "A0AEC0" } }
                    }
                };
                // Zarovnanie čísel doprava (posunuté o 1 menej kvôli odstránenému času)
                // Predtým C >= 4, teraz C >= 3 (od stĺpca D - "Prejdená vzdialenosť")
                if (C >= 3) ws[address].s.alignment = { horizontal: "right" };
            }
        }
    }

    // 4. Šírky stĺpcov (bez stĺpca Čas)
    ws['!cols'] = [
        { wch: 18 }, // Dátum
        { wch: 18 }, // Typ
        { wch: 18 }, // Tachometer
        { wch: 27 }, // Vzdialenosť
        { wch: 18 }, // Litre
        { wch: 22 }, // Spotreba
        { wch: 14 }, // Mesto
        { wch: 18 }  // Mimo
    ];

    // 5. Uloženie
    XLSX.utils.book_append_sheet(wb, ws, "História");
    
    const safeBrand = carBrand.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateFile = new Date().toISOString().split('T')[0];
    const fileName = `export_phm_${safeBrand}_${dateFile}.xlsx`;

    XLSX.writeFile(wb, fileName);
}

// Pomocná funkcia pre konverziu fontu (rovnaká ako v schd_module.js)
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}