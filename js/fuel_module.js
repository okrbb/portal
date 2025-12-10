/* fuel_module.js - Modular SDK v9+ (Store Integrated) */
import { store } from './store.js'; // CENTRÁLNY STORE
import { 
    collection, 
    doc, 
    addDoc, 
    updateDoc, 
    getDocs, 
    getDoc, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    increment, 
    serverTimestamp,
    writeBatch
} from 'firebase/firestore';

import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';
import { logUserAction } from './logs_module.js';
import { isDemoUser } from './demo_mode.js';

let _carsUnsubscribe = null;
let _historyChart = null;

let filterState = {
    month: '', 
    year: new Date().getFullYear().toString()
};

// Inicializácia modulu (bez parametrov)
export function initializeFuelModule() {
    console.log('Inicializujem modul PHM (Store verzia)...');
    
    const activeUser = store.getUser();
    
    // Kontrola oprávnení
    if (!Permissions.canViewModule(activeUser, 'fuel-module')) return;

    setupEventListeners();
    populateYearSelect();
    loadCars(); 

    // Globálne funkcie pre tlačidlá v HTML (história/úprava)
    window.editHistoryRecord = editHistoryRecord;
    window.recalculateHistoryChain = recalculateHistoryChain;
}

function setupEventListeners() {
    const closeFuelBtn = document.getElementById('close-fuel-modal');
    const fuelForm = document.getElementById('fuel-form');
    if (closeFuelBtn) closeFuelBtn.onclick = closeFuelModal;
    if (fuelForm) fuelForm.onsubmit = handleFuelSubmit;

    const closeKmBtn = document.getElementById('close-km-modal');
    const kmForm = document.getElementById('km-form');
    if (closeKmBtn) closeKmBtn.onclick = closeKmModal;
    if (kmForm) kmForm.onsubmit = handleKmSubmit;

    const monthSelect = document.getElementById('fuel-filter-month');
    const yearSelect = document.getElementById('fuel-filter-year');

    if (monthSelect && yearSelect) {
        monthSelect.value = ''; 
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
    
    const infoBtn = document.getElementById('fuel-info-btn');
    const helpModal = document.getElementById('fuel-help-modal');
    const closeHelpBtn = document.getElementById('close-fuel-help');
    const closeHelpFooter = document.getElementById('btn-close-help-footer');

    if (infoBtn && helpModal) {
        infoBtn.onclick = () => helpModal.classList.remove('hidden');
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

    const db = store.getDB();
    if (!db) return;

    grid.innerHTML = '<div class="skeleton-wrapper"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div>';

    const q = query(collection(db, 'cars'), orderBy('brand'));
    
    _carsUnsubscribe = onSnapshot(q, async (snapshot) => {
        grid.innerHTML = '';
        
        if (snapshot.empty) {
            grid.innerHTML = '<p style="padding: 20px;">Zatiaľ nie sú pridané žiadne vozidlá.</p>';
            return;
        }

        const renderPromises = snapshot.docs.map(async (docSnap) => {
            const carData = docSnap.data();
            const carId = docSnap.id;
            
            let displayData = { ...carData }; 
            let isMonthlyView = false;

            const realOverallConsumption = await calculateOverallAverage(carId);

            if (filterState.month !== '') {
                isMonthlyView = true;
                const monthlyStats = await calculateMonthlyStats(
                    carId, 
                    filterState.month, 
                    filterState.year, 
                    realOverallConsumption,
                    carData.norm_city || 0,
                    carData.norm || 0
                );
                
                displayData.current_km = monthlyStats.distance; 
                displayData.average_consumption = monthlyStats.consumption;
                displayData.km_norm_c = monthlyStats.km_c;
                displayData.km_norm_a = monthlyStats.km_a;
                displayData.isVirtual = monthlyStats.isVirtual;
                displayData.monthly_fuel_level = monthlyStats.endOfMonthFuel;

            } else {
                displayData.average_consumption = realOverallConsumption;
                displayData.isVirtual = false;
            }

            return createCarCard(carId, carData, displayData, isMonthlyView);
        });

        const cards = await Promise.all(renderPromises);
        cards.forEach(card => grid.appendChild(card));
    });
}

async function calculateMonthlyStats(carId, monthStr, yearStr, overallAvgFallback, normCity, normOutside) {
    const month = parseInt(monthStr);
    const year = parseInt(yearStr);
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);
    const db = store.getDB();

    try {
        let sumLiters = 0;
        let sumDistance = 0;
        let sumKmC = 0;
        let sumKmA = 0;
        let monthlyEvents = [];

        const refuelingsRef = collection(db, 'cars', carId, 'refuelings');
        const qRefuel = query(refuelingsRef, where('date', '>=', startDate), where('date', '<=', endDate));
        const fuelSnap = await getDocs(qRefuel);

        fuelSnap.forEach(docSnap => {
            const d = docSnap.data();
            sumLiters += (d.liters || 0);
            sumDistance += (d.distance_driven || 0);
            sumKmC += (d.km_c || 0);
            sumKmA += (d.km_a || 0);
            monthlyEvents.push({ date: d.date.toDate(), fuelLevel: d.fuel_level_after });
        });

        const kmLogsRef = collection(db, 'cars', carId, 'km_logs');
        const qKm = query(kmLogsRef, where('date', '>=', startDate), where('date', '<=', endDate));
        const kmSnap = await getDocs(qKm);

        kmSnap.forEach(docSnap => {
            const d = docSnap.data();
            sumDistance += (d.distance_driven || 0);
            sumKmC += (d.km_c || 0);
            sumKmA += (d.km_a || 0);
            monthlyEvents.push({ date: d.date.toDate(), fuelLevel: d.fuel_level_after });
        });

        let endOfMonthFuel = 0;
        if (monthlyEvents.length > 0) {
            monthlyEvents.sort((a, b) => b.date - a.date);
            endOfMonthFuel = monthlyEvents[0].fuelLevel;
            if (endOfMonthFuel === undefined) endOfMonthFuel = 0;
        } else {
            endOfMonthFuel = null; 
        }

        let avgCons = 0;
        let isVirtual = false;
        const referenceValue = overallAvgFallback > 0 ? overallAvgFallback : (parseFloat(normCity) || 0);

        if (sumDistance > 0) {
            if (sumLiters > 0) {
                let calculatedMonthlyCons = (sumLiters / sumDistance) * 100;
                if (referenceValue > 0 && calculatedMonthlyCons > (referenceValue * 2.0)) {
                    avgCons = overallAvgFallback > 0 ? overallAvgFallback : referenceValue;
                    isVirtual = true;
                } else {
                    avgCons = calculatedMonthlyCons;
                }
            } else {
                isVirtual = true;
                if (overallAvgFallback > 0) {
                    avgCons = overallAvgFallback;
                } else {
                    const nCity = parseFloat(normCity) || 0;
                    const nOut = parseFloat(normOutside) || 0;
                    if (nCity > 0 || nOut > 0) {
                        const theoreticalLitersCity = (sumKmC * nCity) / 100;
                        const theoreticalLitersOut = (sumKmA * nOut) / 100;
                        avgCons = ((theoreticalLitersCity + theoreticalLitersOut) / sumDistance) * 100;
                    }
                }
            }
        }
        
        return { 
            distance: sumDistance, 
            consumption: avgCons, 
            km_c: sumKmC, 
            km_a: sumKmA, 
            isVirtual: isVirtual,
            endOfMonthFuel: endOfMonthFuel 
        };

    } catch (e) {
        console.error(e);
        return { distance: 0, consumption: 0, km_c: 0, km_a: 0, isVirtual: false, endOfMonthFuel: 0 };
    }
}

async function calculateOverallAverage(carId) {
    const db = store.getDB();
    try {
        let sumLiters = 0;
        let sumDistance = 0;
        
        const refuelingsRef = collection(db, 'cars', carId, 'refuelings');
        const fuelSnap = await getDocs(refuelingsRef);
        fuelSnap.forEach(d => { sumLiters += (d.data().liters || 0); sumDistance += (d.data().distance_driven || 0); });
        
        const kmLogsRef = collection(db, 'cars', carId, 'km_logs');
        const kmSnap = await getDocs(kmLogsRef);
        kmSnap.forEach(d => { sumDistance += (d.data().distance_driven || 0); });
        
        return sumDistance > 0 ? (sumLiters / sumDistance) * 100 : 0;
    } catch (e) { return 0; }
}

function createCarCard(docId, rawCarData, displayData, isMonthly) {
    const activeUser = store.getUser();
    const div = document.createElement('div');
    div.className = 'fuel-car-card'; 

    const canEdit = Permissions.canEditFuelRecord(activeUser, rawCarData.evidence_number);

    let consumptionClass = 'success'; 
    if (rawCarData.norm_city && displayData.average_consumption > rawCarData.norm_city) {
        consumptionClass = 'danger'; 
    }

    let isVirtual = displayData.isVirtual;

    const normCityDisplay = rawCarData.norm_city ? Number(rawCarData.norm_city).toFixed(1) : '--';
    const normOutsideDisplay = rawCarData.norm ? Number(rawCarData.norm).toFixed(1) : '--';
    const valKm = displayData.current_km ? Number(displayData.current_km).toLocaleString() : '0';
    const valCons = displayData.average_consumption ? Number(displayData.average_consumption).toFixed(2) : '--';

    let rawKmC = displayData.km_norm_c || 0;
    let rawKmA = displayData.km_norm_a || 0;

    if (!isMonthly) {
        rawKmC += (rawCarData.start_km_norm_c || 0);
        rawKmA += (rawCarData.start_km_norm_a || 0);
    }

    const valKmC = Number(rawKmC).toLocaleString();
    const valKmA = Number(rawKmA).toLocaleString();

    const labelTachometer = isMonthly ? `Najazdené (${parseInt(filterState.month) + 1}/${filterState.year})` : 'Tachometer';
    const labelKmC = isMonthly ? 'Mesto (mesiac)' : 'Mesto (celkom)';
    const labelKmA = isMonthly ? 'Mimo (mesiac)' : 'Mimo (celkom)';
    const labelSpotreba = isMonthly ? (isVirtual ? 'Odhad spotreby' : 'Priemer mesiac') : 'Priemer celkom';

    const tankCapacity = rawCarData.tank_capacity || 50; 
    let currentLevel = isMonthly 
        ? (displayData.monthly_fuel_level !== undefined && displayData.monthly_fuel_level !== null ? displayData.monthly_fuel_level : 0)
        : (rawCarData.current_fuel_level || 0);
    
    let litersMissing = tankCapacity - currentLevel;
    if (litersMissing < 0) litersMissing = 0;
    
    const fuelPercentage = Math.min(100, Math.max(0, (currentLevel / tankCapacity) * 100));
    
    let fuelFillClass = 'high';
    if (fuelPercentage < 20) fuelFillClass = 'low';
    else if (fuelPercentage < 50) fuelFillClass = 'medium';

    const labelFuelStatus = isMonthly ? 'Stav na konci' : 'Nádrž';
    const showFuelWidget = !isMonthly || (isMonthly && displayData.monthly_fuel_level !== null);

    div.innerHTML = `
        <div class="fuel-car-header">
            <div class="fuel-car-title">
                <h3 class="fuel-car-name">${rawCarData.brand}</h3>
                
                <div class="fuel-car-plate" style="color: var(--color-orange-accent); background: transparent; padding: 0; font-weight: 700; margin-top: 4px;">
                    ${docId}
                </div>
                
                ${isMonthly ? '<span class="fuel-event-badge drive" style="margin-top:8px; font-size:0.7rem;">Mesačný výkaz</span>' : ''}
            </div>

            <div style="text-align: right;">
                <div style="font-size: 0.9rem; color: var(--color-text-secondary);">
                    ID: <strong style="color: var(--color-text-primary);">${rawCarData.evidence_number}</strong>
                </div>
            </div>
        </div>

        <div class="fuel-car-stats">
            <div class="fuel-stat-item">
                <div class="fuel-stat-label">${labelTachometer}</div>
                <div class="fuel-stat-value">
                    ${valKm} <span class="fuel-stat-unit">km</span>
                </div>
            </div>

            <div class="fuel-stat-item">
                <div class="fuel-stat-label">${labelSpotreba}</div>
                <div class="fuel-stat-value ${consumptionClass}">
                    ${isVirtual ? '<i class="fas fa-calculator" title="Virtuálny výpočet"></i>' : ''}
                    ${valCons} <span class="fuel-stat-unit">L/100km</span>
                </div>
            </div>

            <div class="fuel-stat-item">
                <div class="fuel-stat-label">${labelKmC}</div>
                <div class="fuel-stat-value">
                    ${valKmC} <span class="fuel-stat-unit">km</span>
                </div>
            </div>

            <div class="fuel-stat-item">
                <div class="fuel-stat-label">${labelKmA}</div>
                <div class="fuel-stat-value">
                    ${valKmA} <span class="fuel-stat-unit">km</span>
                </div>
            </div>

            <div class="fuel-stat-item" style="opacity: 0.7;">
                <div class="fuel-stat-label">Norma Mesto</div>
                <div class="fuel-stat-value" style="font-size: 1rem;">${normCityDisplay} <span class="fuel-stat-unit">L</span></div>
            </div>
            <div class="fuel-stat-item" style="opacity: 0.7;">
                <div class="fuel-stat-label">Norma Mimo</div>
                <div class="fuel-stat-value" style="font-size: 1rem;">${normOutsideDisplay} <span class="fuel-stat-unit">L</span></div>
            </div>

            ${showFuelWidget ? `
            <div class="fuel-level-bar">
                <div class="fuel-level-bar-label">
                    <span>${labelFuelStatus}</span>
                    <span style="font-weight:bold;">${Math.round(fuelPercentage)}%</span>
                </div>
                <div class="fuel-level-bar-track">
                    <div class="fuel-level-bar-fill ${fuelFillClass}" style="width: ${fuelPercentage}%;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.75rem; color:var(--color-text-secondary);">
                    <span>${currentLevel.toFixed(1)} L</span>
                    <span>Dotankovať: ${litersMissing.toFixed(1)} L</span>
                </div>
            </div>` : ''}
        </div>

        <div class="fuel-car-actions">
            <button class="fuel-action-btn history-btn">
                <i class="fas fa-history"></i> História
            </button>
            ${canEdit ? `
            <button class="fuel-action-btn km-btn">
                <i class="fas fa-road"></i> Jazda
            </button>
            <button class="fuel-action-btn refuel-btn" style="color:var(--color-orange-accent); border-color:var(--color-orange-accent);">
                <i class="fas fa-gas-pump"></i> Tankovať
            </button>
            ` : ''}
        </div>
    `;

    if (canEdit) {
        div.querySelector('.refuel-btn').onclick = (e) => { e.stopPropagation(); openFuelModal(docId, rawCarData.current_km); };
        div.querySelector('.km-btn').onclick = (e) => { e.stopPropagation(); openKmModal(docId, rawCarData.current_km); };
    }
    div.querySelector('.history-btn').onclick = (e) => { e.stopPropagation(); openHistoryModal(docId, rawCarData.brand); };

    div.onclick = () => openHistoryModal(docId, rawCarData.brand);

    return div;
}

function openFuelModal(carId = null, currentKm = 0) {
    const modal = document.getElementById('fuel-modal');
    const editIdInput = document.getElementById('fuel-edit-record-id');
    if (editIdInput) editIdInput.value = '';

    const title = document.getElementById('fuel-modal-title');
    if(title) title.textContent = 'Zaevidovať tankovanie';

    const carIdInput = document.getElementById('fuel-car-id');
    const dateInput = document.getElementById('fuel-date');
    const kmInput = document.getElementById('fuel-km');
    
    document.getElementById('new-car-fields').classList.add('hidden');
    document.getElementById('refuel-fields').classList.remove('hidden');
    document.getElementById('fuel-form').reset();
    
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
    if (kmInput) {
        kmInput.min = currentKm + 1;
        kmInput.value = currentKm; 
    }
}

function openKmModal(carId, currentKm = 0) {
    const modal = document.getElementById('km-modal');
    document.getElementById('km-form').reset();
    const editIdInput = document.getElementById('km-edit-record-id');
    if (editIdInput) editIdInput.value = '';
    
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
    
    const kmInput = document.getElementById('km-total-state');
    if (kmInput) {
        kmInput.min = currentKm + 1;
        kmInput.value = currentKm; 
    }
    modal.classList.remove('hidden');
}

function closeFuelModal() { document.getElementById('fuel-modal').classList.add('hidden'); }
function closeKmModal() { document.getElementById('km-modal').classList.add('hidden'); }

async function recalculateCarStats(carId) {
    const db = store.getDB();
    const carRef = doc(db, 'cars', carId);
    
    const refuelingsRef = collection(db, 'cars', carId, 'refuelings');
    const kmLogsRef = collection(db, 'cars', carId, 'km_logs');

    const [refuelSnap, kmSnap, carDoc] = await Promise.all([
        getDocs(refuelingsRef),
        getDocs(kmLogsRef),
        getDoc(carRef)
    ]);
    
    let maxKm = carDoc.data().start_km || 0;
    let sumLiters = 0;
    let sumDistance = 0;
    let sumKmC = 0;
    let sumKmA = 0;
    let lastRefuelDate = null;
    let lastRefuelKm = null;

    refuelSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.km_total > maxKm) maxKm = d.km_total;
        sumLiters += (d.liters || 0);
        sumDistance += (d.distance_driven || 0);
        sumKmC += (d.km_c || 0);
        sumKmA += (d.km_a || 0);
        const dDate = d.date.toDate();
        if (!lastRefuelDate || dDate > lastRefuelDate) {
            lastRefuelDate = dDate;
            lastRefuelKm = d.km_total;
        }
    });

    kmSnap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.km_total > maxKm) maxKm = d.km_total;
        sumDistance += (d.distance_driven || 0);
        sumKmC += (d.km_c || 0);
        sumKmA += (d.km_a || 0);
    });

    let newAvgConsumption = 0;
    if (sumDistance > 0 && sumLiters > 0) {
        newAvgConsumption = (sumLiters / sumDistance) * 100;
    }

    const updateData = {
        current_km: maxKm,
        average_consumption: parseFloat(newAvgConsumption.toFixed(2)),
        km_norm_c: sumKmC,
        km_norm_a: sumKmA
    };

    if (lastRefuelDate) {
        updateData.last_refuel_date = lastRefuelDate;
        updateData.last_refuel_total_km = lastRefuelKm;
    }

    await updateDoc(carRef, updateData);
}

async function handleFuelSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Ukladám...';

    const editIdInput = document.getElementById('fuel-edit-record-id');
    const editId = editIdInput ? editIdInput.value : null;

    try {
        if (editId) {
            await updateRefueling(editId);
            showToast('Záznam bol úspešne upravený.', TOAST_TYPE.SUCCESS);
        } else {
            await processRefueling();
            showToast('Záznam uložený. Dáta sa aktualizujú...', TOAST_TYPE.SUCCESS);
        }
        closeFuelModal();
        const historyModal = document.getElementById('history-modal');
        if (!historyModal.classList.contains('hidden')) {
            historyModal.classList.add('hidden'); 
        }
    } catch (error) {
        console.error("Fuel Error:", error);
        showToast('Chyba: ' + error.message, TOAST_TYPE.ERROR);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

async function handleKmSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Ukladám...';

    const editIdInput = document.getElementById('km-edit-record-id');
    const editId = editIdInput ? editIdInput.value : null;

    try {
        if (editId) {
            await updateKmLog(editId);
            showToast('Záznam bol úspešne upravený.', TOAST_TYPE.SUCCESS);
        } else {
            await processKmLogInternal();
            showToast('Jazda bola zaznamenaná.', TOAST_TYPE.SUCCESS);
        }
        closeKmModal();
        const historyModal = document.getElementById('history-modal');
        if (!historyModal.classList.contains('hidden')) {
            historyModal.classList.add('hidden'); 
        }
    } catch (error) {
        console.error("KM Log Error:", error);
        showToast('Chyba: ' + error.message, TOAST_TYPE.ERROR);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

async function processRefueling() {
    const db = store.getDB();
    const carId = document.getElementById('fuel-car-id').value;
    const newKm = parseInt(document.getElementById('fuel-km').value);
    const liters = parseFloat(document.getElementById('fuel-liters').value);
    const price = parseFloat(document.getElementById('fuel-price').value) || 0;
    const date = document.getElementById('fuel-date').value;
    const kmCityInput = parseFloat(document.getElementById('fuel-km-city').value) || 0;
    
    const carRef = doc(db, 'cars', carId);
    const carDoc = await getDoc(carRef);
    if (!carDoc.exists()) throw new Error('Vozidlo neexistuje.');

    const carData = carDoc.data();
    const prevKm = carData.current_km || 0;

    if (newKm <= prevKm) throw new Error(`Nový stav (${newKm}) musí byť vyšší ako predchádzajúci (${prevKm}).`);
    const distanceGap = newKm - prevKm;
    if (kmCityInput > distanceGap) throw new Error(`Km v meste (${kmCityInput}) nemôžu byť vyššie ako prejdená vzdialenosť (${distanceGap}).`);

    const distanceOutside = distanceGap - kmCityInput;
    let referenceKmForConsumption = carData.last_refuel_total_km;
    if (referenceKmForConsumption === undefined || referenceKmForConsumption === null) {
        referenceKmForConsumption = (carData.start_km !== undefined) ? carData.start_km : prevKm;
    }

    const distanceForConsumption = newKm - referenceKmForConsumption;
    let consumption = 0;
    if (distanceForConsumption > 0) consumption = (liters / distanceForConsumption) * 100;

    const refuelingsRef = collection(db, 'cars', carId, 'refuelings');
    await addDoc(refuelingsRef, {
        date: new Date(date),
        liters: liters,
        price: price,
        km_total: newKm,
        distance_driven: distanceGap, 
        calc_base_distance: distanceForConsumption,
        km_c: kmCityInput,              
        km_a: distanceOutside,          
        consumption_l100: parseFloat(consumption.toFixed(2))
    });

    await updateDoc(carRef, {
        current_km: newKm,
        average_consumption: parseFloat(consumption.toFixed(2)),
        last_refuel_date: new Date(date),
        last_refuel_total_km: newKm,
        km_norm_c: increment(kmCityInput),
        km_norm_a: increment(distanceOutside)
    });

    await recalculateHistoryChain(carId);
    logUserAction("PHM", `Tankovanie ${carId}: ${liters}L, Spotreba: ${consumption.toFixed(2)}`);
}

async function updateRefueling(docId) {
    const db = store.getDB();
    const carId = document.getElementById('fuel-car-id').value;
    const date = document.getElementById('fuel-date').value;
    const liters = parseFloat(document.getElementById('fuel-liters').value);
    const price = parseFloat(document.getElementById('fuel-price').value) || 0;
    const newKmTotal = parseInt(document.getElementById('fuel-km').value);
    const newKmCity = parseFloat(document.getElementById('fuel-km-city').value) || 0;

    const refuelRef = doc(db, 'cars', carId, 'refuelings', docId);

    if (!date || isNaN(liters) || isNaN(newKmTotal)) throw new Error("Prosím, vyplňte všetky povinné polia správne.");
    if (newKmTotal <= 0) throw new Error("Stav tachometra musí byť kladné číslo.");

    await updateDoc(refuelRef, {
        date: new Date(date),
        liters: liters,
        price: price,
        km_total: newKmTotal,
        km_c: newKmCity
    });

    await recalculateHistoryChain(carId);
    logUserAction("PHM", `Úprava tankovania ${carId} (ID: ${docId})`);
}

async function updateKmLog(docId) {
    const db = store.getDB();
    const carId = document.getElementById('km-car-id').value;
    const dateVal = document.getElementById('km-date').value;
    const kmTotal = parseInt(document.getElementById('km-total-state').value);
    const kmCity = parseFloat(document.getElementById('km-city-input').value) || 0;

    const kmLogRef = doc(db, 'cars', carId, 'km_logs', docId);
    await updateDoc(kmLogRef, {
        date: new Date(dateVal),
        km_total: kmTotal,
        km_c: kmCity
    });

    await recalculateHistoryChain(carId);
    logUserAction("PHM", `Úprava jazdy ${carId} (ID: ${docId})`);
}

async function processKmLogInternal() {
    const db = store.getDB();
    const user = store.getUser();
    const carId = document.getElementById('km-car-id').value;
    const dateVal = document.getElementById('km-date').value;
    const newKm = parseInt(document.getElementById('km-total-state').value);
    const kmCityInput = parseFloat(document.getElementById('km-city-input').value) || 0;

    const carRef = doc(db, 'cars', carId);
    const carDoc = await getDoc(carRef);
    const prevKm = carDoc.data().current_km;

    if (newKm <= prevKm) throw new Error(`Nový stav (${newKm}) musí byť vyšší ako aktuálny (${prevKm}).`);
    const distanceTotal = newKm - prevKm; 
    if (kmCityInput > distanceTotal) throw new Error(`Km v meste (${kmCityInput}) nemôžu byť vyššie ako celková trasa.`);
    const distanceOutside = distanceTotal - kmCityInput; 

    const kmLogsRef = collection(db, 'cars', carId, 'km_logs');
    await addDoc(kmLogsRef, {
        date: new Date(dateVal),
        km_total: newKm,        
        distance_driven: distanceTotal,
        km_c: kmCityInput,      
        km_a: distanceOutside,  
        created_at: serverTimestamp(),
        user_email: user.email || 'unknown'
    });

    await updateDoc(carRef, {
        current_km: newKm, 
        km_norm_c: increment(kmCityInput),
        km_norm_a: increment(distanceOutside)
    });
}

async function openHistoryModal(carId, carBrand) {
    const db = store.getDB();
    const activeUser = store.getUser();
    const modal = document.getElementById('history-modal');
    const title = document.getElementById('history-modal-title');
    const tbody = document.getElementById('history-table-body');
    const footer = modal.querySelector('.modal-footer'); 
    
    title.textContent = `História: ${carBrand}`;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Načítavam údaje...</td></tr>';
    footer.innerHTML = '';
    footer.style.display = 'flex';
    footer.style.gap = '10px';
    footer.style.justifyContent = 'flex-end';
    modal.classList.remove('hidden');

    // --- DEMO REŽIM LOGIKA ---
    if (isDemoUser(activeUser.email)) {
        console.log("Demo režim: Generujem simulovanú históriu pre vozidlo.");
        
        // 1. Fiktívne dáta
        const normCity = 8.5;
        const normOutside = 6.0;
        const mockEvents = [
            { id: 'demo1', type: 'tankovanie', date: new Date('2024-03-01'), km_total: 150000, distance: 800, liters: 55.5, price: 90.5, consumption: 6.94, km_c: 200, km_a: 600 },
            { id: 'demo2', type: 'jazda', date: new Date('2024-03-10'), km_total: 150300, distance: 300, km_c: 50, km_a: 250 },
            { id: 'demo3', type: 'tankovanie', date: new Date('2024-04-01'), km_total: 151000, distance: 700, liters: 50.0, price: 82.0, consumption: 7.14, km_c: 300, km_a: 400 },
            { id: 'demo4', type: 'jazda', date: new Date('2024-04-15'), km_total: 151200, distance: 200, km_c: 20, km_a: 180 }
        ];

        // 2. Zoradenie
        mockEvents.sort((a, b) => b.date - a.date);
        const eventsForChart = [...mockEvents].sort((a, b) => a.date - b.date);

        // 3. Vykreslenie grafu
        renderHistoryChart(eventsForChart, normCity, normOutside);

        // 4. Výpočet štatistík
        const monthlyStats = {};
        let grandTotalLiters = 0;
        let grandTotalDistance = 0;

        mockEvents.forEach(e => {
            grandTotalDistance += (e.distance || 0);
            if (e.type === 'tankovanie') grandTotalLiters += (e.liters || 0);

            const monthKey = `${e.date.getFullYear()}-${e.date.getMonth()}`;
            if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { km: 0, liters: 0, km_c: 0, km_a: 0 };
            monthlyStats[monthKey].km += (e.distance || 0);
            monthlyStats[monthKey].km_c += (e.km_c || 0);
            monthlyStats[monthKey].km_a += (e.km_a || 0);
            if (e.type === 'tankovanie') monthlyStats[monthKey].liters += (e.liters || 0);
        });

        let globalAverage = 0;
        if (grandTotalDistance > 0) globalAverage = (grandTotalLiters / grandTotalDistance) * 100;

        // 5. Vykreslenie tabuľky (použijeme rovnakú logiku ako v Real móde)
        renderHistoryTableRows(tbody, mockEvents, monthlyStats, normCity, normOutside, globalAverage, false); // false = cannot edit in demo

        // 6. Tlačidlá pätičky (bez funkčnosti v demo)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ua-btn default delete-hover';
        closeBtn.innerHTML = 'Zavrieť';
        closeBtn.onclick = () => modal.classList.add('hidden');
        footer.appendChild(closeBtn);

        return; // UKONČIŤ FUNKCIU (Aby sa nespustil Firestore request)
    }
    // --- KONIEC DEMO LOGIKY ---

    // === PÔVODNÁ LOGIKA (Firestore) ===
    try {
        const carRef = doc(db, 'cars', carId);
        const refuelingsRef = collection(db, 'cars', carId, 'refuelings');
        const kmLogsRef = collection(db, 'cars', carId, 'km_logs');

        const [refuelSnap, kmSnap, carDoc] = await Promise.all([
            getDocs(refuelingsRef),
            getDocs(kmLogsRef),
            getDoc(carRef)
        ]);

        const carData = carDoc.data();
        const normCity = parseFloat(carData.norm_city) || 0;
        const normOutside = parseFloat(carData.norm) || 0;
        const canEdit = Permissions.canEditFuelRecord(activeUser, carData.evidence_number);

        let events = [];
        let grandTotalLiters = 0;
        let grandTotalDistance = 0;

        refuelSnap.forEach(docSnap => {
            const data = docSnap.data();
            grandTotalLiters += (data.liters || 0);
            grandTotalDistance += (data.distance_driven || 0);
            events.push({
                id: docSnap.id,
                type: 'tankovanie',
                date: data.date.toDate(),
                km_total: data.km_total,
                distance: data.distance_driven,
                liters: data.liters,
                price: data.price, 
                consumption: data.consumption_l100, 
                km_c: data.km_c || 0,
                km_a: data.km_a || 0
            });
        });

        kmSnap.forEach(docSnap => {
            const data = docSnap.data();
            grandTotalDistance += (data.distance_driven || 0);
            events.push({
                id: docSnap.id,
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
        const eventsForChart = [...events].sort((a, b) => a.date - b.date);
        renderHistoryChart(eventsForChart, normCity, normOutside);

        const monthlyStats = {};
        events.forEach(e => {
            const monthKey = `${e.date.getFullYear()}-${e.date.getMonth()}`; 
            if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { km: 0, liters: 0, km_c: 0, km_a: 0 };
            monthlyStats[monthKey].km += (e.distance || 0);
            monthlyStats[monthKey].km_c += (e.km_c || 0);
            monthlyStats[monthKey].km_a += (e.km_a || 0);
            if (e.type === 'tankovanie') monthlyStats[monthKey].liters += (e.liters || 0);
        });

        // Volanie renderovacej funkcie
        renderHistoryTableRows(tbody, events, monthlyStats, normCity, normOutside, globalAverage, canEdit, carId);

        const excelBtn = document.createElement('button');
        excelBtn.className = 'ua-btn default';
        excelBtn.innerHTML = 'Export Excel';
        excelBtn.onclick = () => downloadHistoryExcel(carBrand, events, monthlyStats, normCity, normOutside, globalAverage);

        const pdfBtn = document.createElement('button');
        pdfBtn.className = 'ua-btn default';
        pdfBtn.innerHTML = 'Stiahnuť PDF';
        pdfBtn.onclick = () => downloadHistoryPdf(carBrand, events, monthlyStats, normCity, normOutside, globalAverage);

        footer.appendChild(excelBtn);
        footer.appendChild(pdfBtn);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'ua-btn default delete-hover';
        closeBtn.innerHTML = 'Zavrieť';
        closeBtn.onclick = () => modal.classList.add('hidden');
        footer.appendChild(closeBtn);

    } catch (error) {
        console.error("Chyba histórie:", error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: #E53E3E;">Chyba: ${error.message}</td></tr>`;
    }
}

// POMOCNÁ FUNKCIA PRE VYKRESLENIE RIADKOV (Aby sme nekopírovali kód)
function renderHistoryTableRows(tbody, events, monthlyStats, normCity, normOutside, globalAverage, canEdit, carId = null) {
    tbody.innerHTML = '';
    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Zatiaľ žiadne záznamy.</td></tr>';
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
                            ${virtualCons > 0 ? `<span style="color:#DD6B20; font-size: 0.8rem; opacity: 0.8;"><i class="fas fa-calculator"></i> ~${virtualCons.toFixed(2)} L/100km</span>` : ''}
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
                <td></td>
            `;
            tbody.appendChild(summaryRow);
            currentMonthKey = itemMonthKey;
        }

        const tr = document.createElement('tr');
        const dateStr = item.date.toLocaleDateString('sk-SK');
        const isoDate = item.date.toISOString().split('T')[0];
        let typeHtml = '', consumptionHtml = '', editBtnHtml = '';

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
            
            if (canEdit && carId) {
                editBtnHtml = `
                    <button class="action-btn-edit" 
                        onclick="editHistoryRecord('tankovanie', '${item.id}', '${carId}', '${isoDate}', ${item.km_total}, ${item.liters}, ${item.price || 0}, ${item.km_c || 0})"
                        title="Upraviť záznam">
                        <i class="fas fa-edit"></i>
                    </button>`;
            }
        } else {
            typeHtml = `<span class="badge-event badge-drive"><i class="fas fa-route"></i> Jazda</span>`;
            if (globalAverage > 0) consumptionHtml = `<div style="color: #aaa; font-size: 0.8rem;">~${globalAverage.toFixed(2)} L</div>`;
            else consumptionHtml = `<span style="color:#aaa;">-</span>`;
            
            if (canEdit && carId) {
                editBtnHtml = `
                    <button class="action-btn-edit" 
                        onclick="editHistoryRecord('jazda', '${item.id}', '${carId}', '${isoDate}', ${item.km_total}, ${item.km_c || 0}, null, null)"
                        title="Upraviť záznam">
                        <i class="fas fa-edit"></i>
                    </button>`;
            }
        }

        tr.innerHTML = `
            <td style="padding-left: 20px; font-size: 0.9em; opacity: 0.8;">${dateStr}</td>
            <td style="opacity: 0.9;">${typeHtml}</td>
            <td class="text-right" style="opacity: 0.9;">${item.km_total.toLocaleString()} km</td>
            <td class="text-right">+${item.distance.toLocaleString()} km</td>
            <td class="text-right">${consumptionHtml}</td>
            <td class="text-right"><div style="font-size:1em; opacity: 0.7;">C: ${item.km_c} ↔ A: ${item.km_a}</div></td>
            <td class="text-center">${editBtnHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

function editHistoryRecord(type, id, carId, dateStr, kmTotal, val1, val2, val3) {
    if (type === 'tankovanie') {
        const modal = document.getElementById('fuel-modal');
        document.getElementById('fuel-form').reset();
        const editIdInput = document.getElementById('fuel-edit-record-id');
        if (editIdInput) editIdInput.value = id;
        document.getElementById('fuel-car-id').value = carId;
        const title = document.getElementById('fuel-modal-title');
        if(title) title.textContent = 'Upraviť tankovanie';
        document.getElementById('new-car-fields').classList.add('hidden');
        document.getElementById('refuel-fields').classList.remove('hidden');
        document.getElementById('fuel-date').value = dateStr;
        document.getElementById('fuel-km').value = kmTotal;
        document.getElementById('fuel-liters').value = val1; 
        document.getElementById('fuel-price').value = val2 || ''; 
        document.getElementById('fuel-km-city').value = val3 || 0; 
        modal.classList.remove('hidden');
    } else if (type === 'jazda') {
        const modal = document.getElementById('km-modal');
        document.getElementById('km-form').reset();
        const editIdInput = document.getElementById('km-edit-record-id');
        if (editIdInput) editIdInput.value = id;
        document.getElementById('km-car-id').value = carId;
        document.getElementById('km-date').value = dateStr;
        document.getElementById('km-total-state').value = kmTotal;
        document.getElementById('km-city-input').value = val1 || 0; 
        modal.classList.remove('hidden');
    }
}

async function downloadHistoryPdf(carBrand, events, monthlyStats, normCity, normOutside, globalAverage) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    try {
        const fontUrl = 'fonts/DejaVuSans.ttf';
        const response = await fetch(fontUrl);
        if (!response.ok) throw new Error(`Font sa nenašiel`);
        const fontBuffer = await response.arrayBuffer();
        const base64Font = arrayBufferToBase64(fontBuffer);
        doc.addFileToVFS('DejaVuSans.ttf', base64Font);
        doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
        doc.setFont('DejaVuSans'); 
    } catch (e) {
        console.warn("Nepodarilo sa načítať lokálny font:", e);
    }
    doc.setFontSize(18);
    doc.text(`História vozidla: ${carBrand}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Dátum generovania: ${new Date().toLocaleDateString('sk-SK')}`, 14, 28);

    const tableBody = [];
    let currentMonthKey = null;
    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

    events.forEach(item => {
        const itemMonthKey = `${item.date.getFullYear()}-${item.date.getMonth()}`;
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
                    consumptionStr = `~${virtualCons.toFixed(2)} L`;
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
        const dateStr = item.date.toLocaleDateString('sk-SK');
        let typeStr = item.type === 'tankovanie' ? 'Tankovanie' : 'Jazda';
        let consCell = '-';
        if (item.type === 'tankovanie') {
            consCell = `${item.liters.toFixed(2)} L`;
            if(item.consumption) consCell += `\n(${item.consumption.toFixed(2)} L/100km)`;
        } else {
            if (globalAverage > 0) consCell = `(~${globalAverage.toFixed(2)} L/100km)`;
        }
        tableBody.push([dateStr, typeStr, `${item.km_total} km`, `+${item.distance} km`, consCell, `C: ${item.km_c} / A: ${item.km_a}`]);
    });

    doc.autoTable({
        startY: 35,
        head: [['Dátum', 'Udalosť', 'Tachometer', 'Vzdialenosť', 'Spotreba', 'Mesto / Mimo']],
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, font: 'DejaVuSans' },
        headStyles: { fillColor: [44, 62, 80], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });
    const safeBrand = carBrand.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateFile = new Date().toISOString().split('T')[0];
    doc.save(`historia_${safeBrand}_${dateFile}.pdf`);
}

function downloadHistoryExcel(carBrand, events, monthlyStats, normCity, normOutside, globalAverage) {
    if (!events || events.length === 0) {
        showToast('Žiadne dáta na export.', TOAST_TYPE.ERROR);
        return;
    }
    const wsData = [['Dátum', 'Typ udalosti', 'Stav tachometra (km)', 'Prejdená vzdialenosť (km)', 'Natankované (L)', 'Spotreba (L/100km)', 'Jazda mesto (km)', 'Jazda mimo mesto (km)']];
    const monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];
    let currentMonthKey = null;
    const summaryRowIndices = []; 

    events.forEach(item => {
        const itemMonthKey = `${item.date.getFullYear()}-${item.date.getMonth()}`;
        if (itemMonthKey !== currentMonthKey) {
            if (currentMonthKey !== null) wsData.push(['', '', '', '', '', '', '', '']); 
            const stats = monthlyStats[itemMonthKey] || { km: 0, liters: 0 };
            const monthName = monthNames[item.date.getMonth()];
            const year = item.date.getFullYear();
            let consumptionStr = '', litersStr = '';
            if (stats.liters > 0) {
                litersStr = stats.liters;
                if (stats.km > 0) consumptionStr = (stats.liters / stats.km * 100).toFixed(2); 
            } else {
                litersStr = '-';
                consumptionStr = '-';
            }
            wsData.push([`${monthName} ${year}`, '', '', `Spolu: ${stats.km}`, litersStr, consumptionStr, '', '']);
            summaryRowIndices.push(wsData.length - 1);
            currentMonthKey = itemMonthKey;
        }
        const dateStr = item.date.toLocaleDateString('sk-SK');
        let typeStr = item.type === 'tankovanie' ? 'Tankovanie' : 'Jazda';
        wsData.push([dateStr, typeStr, item.km_total, item.distance, item.liters > 0 ? item.liters : '', item.consumption > 0 ? item.consumption : '', item.km_c || 0, item.km_a || 0]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const range = XLSX.utils.decode_range(ws['!ref']);
    ws['!autofilter'] = { ref: ws['!ref'] };

    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[address]) continue;
            if (!ws[address].s) ws[address].s = {};
            if (R === 0) {
                ws[address].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    alignment: { wrapText: true, horizontal: "center", vertical: "center" },
                    fill: { fgColor: { rgb: "44546A" } },
                    border: { bottom: { style: "medium", color: { auto: 1 } } }
                };
            }
            else if (summaryRowIndices.includes(R)) {
                ws[address].s = {
                    font: { bold: true, color: { rgb: "000000" } },
                    fill: { fgColor: { rgb: "E2E8F0" } },
                    alignment: { vertical: "center" },
                    border: { top: { style: "thin", color: { rgb: "A0AEC0" } }, bottom: { style: "thin", color: { rgb: "A0AEC0" } } }
                };
                if (C >= 3) ws[address].s.alignment = { horizontal: "right" };
            }
        }
    }
    ws['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 27 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "História");
    const safeBrand = carBrand.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateFile = new Date().toISOString().split('T')[0];
    const fileName = `export_phm_${safeBrand}_${dateFile}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}

async function recalculateHistoryChain(carId) {
    const db = store.getDB();
    console.log(`[ChainReaction] Spúšťam prepočet histórie pre auto: ${carId}`);
    
    const carRef = doc(db, 'cars', carId);
    const refuelingsRef = collection(db, 'cars', carId, 'refuelings');
    const kmLogsRef = collection(db, 'cars', carId, 'km_logs');

    const [refuelSnap, kmSnap, carDoc] = await Promise.all([
        getDocs(refuelingsRef),
        getDocs(kmLogsRef),
        getDoc(carRef)
    ]);

    if (!carDoc.exists()) return;
    const carData = carDoc.data();
    const startKm = carData.start_km || 0; 
    const tankCapacity = carData.tank_capacity || 50; 
    let currentTankLevel = carData.start_fuel_level || 0; 

    let timeline = [];
    refuelSnap.forEach(docSnap => {
        const d = docSnap.data();
        timeline.push({ id: docSnap.id, collection: 'refuelings', date: d.date.toDate(), km_total: d.km_total, liters: d.liters || 0, km_c: d.km_c || 0, original_data: d });
    });
    kmSnap.forEach(docSnap => {
        const d = docSnap.data();
        timeline.push({ id: docSnap.id, collection: 'km_logs', date: d.date.toDate(), km_total: d.km_total, km_c: d.km_c || 0, original_data: d });
    });

    timeline.sort((a, b) => a.date - b.date);

    let previousKm = startKm;
    let baseKmForConsumption = startKm; 
    const batch = writeBatch(db);
    let changesCount = 0;

    for (let i = 0; i < timeline.length; i++) {
        const record = timeline[i];
        const distanceDriven = record.km_total - previousKm;
        const safeDistance = distanceDriven > 0 ? distanceDriven : 0;
        const kmOutside = safeDistance - record.km_c;
        const safeKmOutside = kmOutside > 0 ? kmOutside : 0;

        let consumptionRate = carData.average_consumption || carData.norm_city || 7.0;
        const litersConsumed = (safeDistance * consumptionRate) / 100;
        
        currentTankLevel -= litersConsumed;
        if (currentTankLevel < 0) currentTankLevel = 0;

        let updateData = { distance_driven: safeDistance, km_a: safeKmOutside };

        if (record.collection === 'refuelings') {
            const distForCons = record.km_total - baseKmForConsumption;
            let newConsumption = 0;
            if (distForCons > 0 && record.liters > 0) newConsumption = (record.liters / distForCons) * 100;
            updateData.calc_base_distance = distForCons;
            updateData.consumption_l100 = parseFloat(newConsumption.toFixed(2));
            baseKmForConsumption = record.km_total;
            currentTankLevel += record.liters;
            if (currentTankLevel > tankCapacity) currentTankLevel = tankCapacity;
        }

        updateData.fuel_level_after = parseFloat(currentTankLevel.toFixed(1));
        const orig = record.original_data;
        const isChanged = orig.distance_driven !== updateData.distance_driven || orig.km_a !== updateData.km_a || (record.collection === 'refuelings' && orig.consumption_l100 !== updateData.consumption_l100) || orig.fuel_level_after !== updateData.fuel_level_after; 

        if (isChanged) {
            const docRef = doc(db, 'cars', carId, record.collection, record.id);
            batch.update(docRef, updateData);
            changesCount++;
        }
        previousKm = record.km_total;
    }

    if (changesCount > 0) {
        await batch.commit();
        console.log(`[ChainReaction] Aktualizovaných ${changesCount} záznamov.`);
        showToast(`Dáta boli prepočítané a opravené (${changesCount} záznamov).`, TOAST_TYPE.INFO);
    } else {
        console.log(`[ChainReaction] Žiadne zmeny v histórii neboli potrebné.`);
    }

    await updateDoc(carRef, { current_fuel_level: parseFloat(currentTankLevel.toFixed(1)) });
    await recalculateCarStats(carId);
}

function renderHistoryChart(events, normCity, normOutside) {
    const ctx = document.getElementById('fuel-history-chart');
    if (!ctx) return;
    if (_historyChart) _historyChart.destroy();

    const chartData = events.filter(e => e.type === 'tankovanie' && e.consumption > 0 && e.consumption < 50).sort((a, b) => a.date - b.date).map(e => ({ x: e.date.toLocaleDateString('sk-SK'), y: e.consumption, liters: e.liters, km: e.distance }));
    if (chartData.length === 0) return;

    const labels = chartData.map(d => d.x);
    const dataPoints = chartData.map(d => d.y);
    const normCityLine = new Array(labels.length).fill(normCity || null);
    const normOutLine = new Array(labels.length).fill(normOutside || null);

    _historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Reálna spotreba (L/100km)',
                    data: dataPoints,
                    borderColor: '#bc8700', 
                    backgroundColor: 'rgba(188, 135, 0, 0.1)',
                    borderWidth: 3,
                    tension: 0.3, 
                    pointBackgroundColor: '#1F2937',
                    pointBorderColor: '#bc8700',
                    pointRadius: 4,
                    fill: true
                },
                {
                    label: 'Norma (Mesto)',
                    data: normCityLine,
                    borderColor: 'rgba(229, 62, 62, 0.6)', 
                    borderWidth: 2,
                    borderDash: [5, 5], 
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: 'Norma (Mimo)',
                    data: normOutLine,
                    borderColor: 'rgba(72, 187, 120, 0.6)', 
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#9CA3AF' } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) label += context.parsed.y.toFixed(2) + ' L';
                            return label;
                        },
                        afterLabel: function(context) {
                            if (context.datasetIndex === 0) { 
                                const idx = context.dataIndex;
                                const item = chartData[idx];
                                return `Natankované: ${item.liters.toFixed(1)} L\nPrejdené: ${item.km} km`;
                            }
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                y: {
                    beginAtZero: false, 
                    ticks: { color: '#9CA3AF' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    title: { display: true, text: 'L / 100km', color: '#6B7280' }
                }
            }
        }
    });
}