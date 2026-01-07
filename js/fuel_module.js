/* fuel_module.js - REFACTORED with Floating Point Fix */
import { store } from './store.js';
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

import { showToast, TOAST_TYPE, safeAsync, ModalManager } from './utils.js';
import { fetchCollection, addDocument, updateDocument, deleteDocument } from './firebase_helpers.js';
import { lazyLoader } from './lazy_loader.js';

import { Permissions } from './accesses.js';
import { logUserAction } from './logs_module.js';
import { isDemoUser } from './demo_mode.js';
import { IDs } from './id-registry.js';

// ✅ NOVÉ: Helper pre presné zaokrúhľovanie (prevencia floating point errors)
const round2 = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

// ✅ NOVÉ: Helper pre formátovanie čísiel s tisícovými oddeľovačmi (medzery)
const formatNumber = (num, decimals = 0) => {
    if (typeof num !== 'number' || isNaN(num)) return num;
    return num.toLocaleString('sk-SK', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

let _carsUnsubscribe = null;
let unsubscribeStore = null;
let _historyChart = null;

let filterState = {
    month: '', 
    year: new Date().getFullYear().toString()
};

/**
 * Inicializácia modulu
 */
export function initializeFuelModule() {
    console.log('Inicializujem modul PHM (Store verzia)...');
    
    if (unsubscribeStore) {
        unsubscribeStore();
    }
    
    unsubscribeStore = store.subscribe((state) => {
        if (state.user && state.employees.size > 0) {
            console.log("[FuelModule] Store state updated");
        }
    });
    
    const activeUser = store.getUser();
    
    if (!Permissions.canViewModule(activeUser, IDs.FUEL.MODULE)) return;

    setupEventListeners();
    populateYearSelect();
    loadCars(); 

    window.editHistoryRecord = editHistoryRecord;
    window.recalculateHistoryChain = recalculateHistoryChain;
}

export function cleanupFuelModule() {
    if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
    }
    if (_carsUnsubscribe) {
        _carsUnsubscribe();
        _carsUnsubscribe = null;
    }
    console.log("[FuelModule] Cleanup completed.");
}

function setupEventListeners() {
    ModalManager.setupCloseListeners(IDs.FUEL.MODAL, IDs.FUEL.CLOSE_MODAL_BTN);
    ModalManager.setupCloseListeners(IDs.FUEL.KM_MODAL, IDs.FUEL.KM_CLOSE_BTN);
    ModalManager.setupCloseListeners(IDs.FUEL.HISTORY_MODAL, IDs.FUEL.CLOSE_HISTORY_MODAL);
    ModalManager.setupCloseListeners(IDs.FUEL.HELP_MODAL, IDs.FUEL.CLOSE_HELP_BTN);
    
    const fuelForm = document.getElementById(IDs.FUEL.FORM);
    const kmForm = document.getElementById(IDs.FUEL.KM_FORM);
    if (fuelForm) fuelForm.onsubmit = handleFuelSubmit;
    if (kmForm) kmForm.onsubmit = handleKmSubmit;

    const monthSelect = document.getElementById(IDs.FUEL.FILTER_MONTH);
    const yearSelect = document.getElementById(IDs.FUEL.FILTER_YEAR);

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
    
    const infoBtn = document.getElementById(IDs.FUEL.INFO_BTN);
    if (infoBtn) {
        infoBtn.onclick = () => ModalManager.open(IDs.FUEL.HELP_MODAL);
    }
    
    const closeHelpFooter = document.getElementById(IDs.FUEL.CLOSE_HELP_FOOTER_BTN);
    if (closeHelpFooter) {
        closeHelpFooter.onclick = () => ModalManager.close(IDs.FUEL.HELP_MODAL);
    }
}

function populateYearSelect() {
    const yearSelect = document.getElementById(IDs.FUEL.FILTER_YEAR);
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
    const grid = document.getElementById(IDs.FUEL.CARS_GRID);
    if (!grid) return;
    
    const activeUser = store.getUser();

    if (_carsUnsubscribe) {
        _carsUnsubscribe();
    }

    if (isDemoUser(activeUser.email)) {
        console.log("Demo režim: Generujem simulované vozidlá.");
        grid.innerHTML = '';

        const demoCars = [
            { id: 'demo_1', data: { brand: 'Škoda Octavia Combi III', evidence_number: 'OKR-DEMO-01', norm_city: 6.5, norm: 5.1, tank_capacity: 50, current_fuel_level: 32.5, current_km: 158420, start_km_norm_c: 5000, start_km_norm_a: 12000 }, display: { current_km: 158420, average_consumption: 5.85, km_norm_c: 5200, km_norm_a: 12500, isVirtual: false, monthly_fuel_level: null } },
            { id: 'demo_2', data: { brand: 'Kia Sportage', evidence_number: 'OKR-DEMO-02', norm_city: 8.2, norm: 6.8, tank_capacity: 60, current_fuel_level: 12.0, current_km: 45200, start_km_norm_c: 2000, start_km_norm_a: 8000 }, display: { current_km: 45200, average_consumption: 7.9, km_norm_c: 2200, km_norm_a: 8500, isVirtual: false, monthly_fuel_level: null } },
            { id: 'demo_3', data: { brand: 'Hyundai Tucson', evidence_number: 'OKR-DEMO-03', norm_city: 9.0, norm: 7.2, tank_capacity: 55, current_fuel_level: 50.0, current_km: 12500, start_km_norm_c: 500, start_km_norm_a: 3000 }, display: { current_km: 12500, average_consumption: 8.5, km_norm_c: 600, km_norm_a: 3200, isVirtual: true, monthly_fuel_level: null } }
        ];

        demoCars.forEach(car => {
            const card = createCarCard(car.id, car.data, car.display, false);
            grid.appendChild(card);
        });
        return;
    }

    const db = store.getDB();
    if (!db) return;

    grid.innerHTML = '<div class="skeleton-wrapper"><div class="skeleton-line long"></div><div class="skeleton-line medium"></div></div>';
    const q = query(collection(db, 'cars'), orderBy('brand'));
    
    _carsUnsubscribe = onSnapshot(q, async (snapshot) => {
        grid.innerHTML = '';
        if (snapshot.empty) { grid.innerHTML = '<p style="padding: 20px;">Zatiaľ nie sú pridané žiadne vozidlá.</p>'; return; }

        for (const docSnap of snapshot.docs) {
            const carData = docSnap.data();
            const carId = docSnap.id;
            let displayData = { current_km: carData.current_km || 0, average_consumption: carData.average_consumption || 0, km_norm_c: carData.km_norm_c || 0, km_norm_a: carData.km_norm_a || 0, isVirtual: false, monthly_fuel_level: null };

            if (filterState.month !== '') {
                displayData = await calculateMonthlyStats(carId, filterState.month, filterState.year);
            }
            grid.appendChild(createCarCard(carId, carData, displayData, filterState.month !== ''));
        }
    });
}

/**
 * ✅ OPRAVENÉ: Použitie round2 pri agregácii mesačných dát
 */
async function calculateMonthlyStats(carId, monthStr, yearStr) {
    const db = store.getDB();
    const month = parseInt(monthStr);
    const year = parseInt(yearStr);
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    try {
        const [refuelings, kmLogs, carSnap] = await Promise.all([
            fetchCollection(`cars/${carId}/refuelings`, { whereConditions: [{ field: 'date', operator: '>=', value: startDate }, { field: 'date', operator: '<=', value: endDate }] }),
            fetchCollection(`cars/${carId}/km_logs`, { whereConditions: [{ field: 'date', operator: '>=', value: startDate }, { field: 'date', operator: '<=', value: endDate }] }),
            getDoc(doc(db, 'cars', carId))
        ]);

        const carData = carSnap.exists() ? carSnap.data() : {};
        const normCity = parseFloat(carData.norm_city) || 0;
        const normOutside = parseFloat(carData.norm) || 0;
        const overallAvgFallback = carData.average_consumption || 0;

        let sumLiters = 0, sumDistance = 0, sumKmC = 0, sumKmA = 0, maxKm = 0, monthlyEvents = [];

        refuelings.forEach(d => {
            sumLiters = round2(sumLiters + (d.liters || 0));
            sumDistance = round2(sumDistance + (d.distance_driven || 0));
            sumKmC = round2(sumKmC + (d.km_c || 0));
            sumKmA = round2(sumKmA + (d.km_a || 0));
            if (d.km_total > maxKm) maxKm = d.km_total;
            monthlyEvents.push({ date: d.date.toDate(), fuelLevel: d.fuel_level_after });
        });

        kmLogs.forEach(d => {
            sumDistance = round2(sumDistance + (d.distance_driven || 0));
            sumKmC = round2(sumKmC + (d.km_c || 0));
            sumKmA = round2(sumKmA + (d.km_a || 0));
            if (d.km_total > maxKm) maxKm = d.km_total;
            monthlyEvents.push({ date: d.date.toDate(), fuelLevel: d.fuel_level_after });
        });

        let endOfMonthFuel = null;
        if (monthlyEvents.length > 0) {
            monthlyEvents.sort((a, b) => b.date - a.date);
            endOfMonthFuel = monthlyEvents[0].fuelLevel ?? 0;
        }

        let avgCons = 0, isVirtual = false;
        const referenceValue = overallAvgFallback > 0 ? overallAvgFallback : normCity;

        if (sumDistance > 0) {
            if (sumLiters > 0) {
                let calculatedMonthlyCons = (sumLiters / sumDistance) * 100;
                if (referenceValue > 0 && calculatedMonthlyCons > (referenceValue * 2.0)) {
                    avgCons = referenceValue;
                    isVirtual = true;
                } else {
                    avgCons = calculatedMonthlyCons;
                }
            } else {
                isVirtual = true;
                if (overallAvgFallback > 0) {
                    avgCons = overallAvgFallback;
                } else if (normCity > 0 || normOutside > 0) {
                    const theoreticalLitersCity = (sumKmC * normCity) / 100;
                    const theoreticalLitersOut = (sumKmA * normOutside) / 100;
                    avgCons = ((theoreticalLitersCity + theoreticalLitersOut) / sumDistance) * 100;
                }
            }
        }
        
        return { current_km: maxKm, average_consumption: round2(avgCons), km_norm_c: sumKmC, km_norm_a: sumKmA, isVirtual: isVirtual, monthly_fuel_level: endOfMonthFuel };
    } catch (e) {
        console.error("Chyba calculateMonthlyStats:", e);
        return { current_km: 0, average_consumption: 0, km_norm_c: 0, km_norm_a: 0, isVirtual: false, monthly_fuel_level: null };
    }
}

function createCarCard(docId, rawCarData, displayData, isMonthly) {
    const activeUser = store.getUser();
    const div = document.createElement('div');
    div.className = 'fuel-car-card'; 
    const canEdit = Permissions.canEditFuelRecord(activeUser, rawCarData.evidence_number);

    let consumptionClass = (rawCarData.norm_city && displayData.average_consumption > rawCarData.norm_city) ? 'danger' : 'success';

    const normCityDisplay = rawCarData.norm_city ? Number(rawCarData.norm_city).toFixed(1) : '--';
    const normOutsideDisplay = rawCarData.norm ? Number(rawCarData.norm).toFixed(1) : '--';
    const valKm = displayData.current_km ? Number(displayData.current_km).toLocaleString() : '0';
    const valCons = displayData.average_consumption ? Number(displayData.average_consumption).toFixed(2) : '--';

    let rawKmC = round2((displayData.km_norm_c || 0) + (isMonthly ? 0 : (rawCarData.start_km_norm_c || 0)));
    let rawKmA = round2((displayData.km_norm_a || 0) + (isMonthly ? 0 : (rawCarData.start_km_norm_a || 0)));

    const tankCapacity = rawCarData.tank_capacity || 50; 
    let currentLevel = isMonthly ? (displayData.monthly_fuel_level ?? 0) : (rawCarData.current_fuel_level || 0);
    let litersMissing = Math.max(0, tankCapacity - currentLevel);
    const fuelPercentage = Math.min(100, Math.max(0, (currentLevel / tankCapacity) * 100));
    
    let fuelFillClass = 'high';
    if (fuelPercentage < 20) fuelFillClass = 'low';
    else if (fuelPercentage < 50) fuelFillClass = 'medium';

    div.innerHTML = `
        <div class="fuel-car-header">
            <div class="fuel-car-title">
                <h3 class="fuel-car-name">${rawCarData.brand}</h3>
                <div class="fuel-car-plate" style="color: var(--color-orange-accent); background: transparent; padding: 0; font-weight: 700; margin-top: 4px;">${docId}</div>
                ${isMonthly ? '<span class="fuel-event-badge drive" style="margin-top:8px; font-size:0.7rem;">Mesačný výkaz</span>' : ''}
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.9rem; color: var(--color-text-secondary);">ID: <strong style="color: var(--color-text-primary);">${rawCarData.evidence_number}</strong></div>
            </div>
        </div>
        <div class="fuel-car-stats">
            <div class="fuel-stat-item"><div class="fuel-stat-label">${isMonthly ? `Najazdené (${parseInt(filterState.month) + 1}/${filterState.year})` : 'Tachometer'}</div><div class="fuel-stat-value">${valKm} <span class="fuel-stat-unit">km</span></div></div>
            <div class="fuel-stat-item"><div class="fuel-stat-label">${isMonthly ? (displayData.isVirtual ? 'Odhad spotreby' : 'Priemer mesiac') : 'Priemer celkom'}</div><div class="fuel-stat-value ${consumptionClass}">${displayData.isVirtual ? '<i class="fas fa-calculator"></i>' : ''} ${valCons} <span class="fuel-stat-unit">L/100km</span></div></div>
            <div class="fuel-stat-item"><div class="fuel-stat-label">${isMonthly ? 'Mesto (mesiac)' : 'Mesto (celkom)'}</div><div class="fuel-stat-value">${rawKmC.toLocaleString()} <span class="fuel-stat-unit">km</span></div></div>
            <div class="fuel-stat-item"><div class="fuel-stat-label">${isMonthly ? 'Mimo (mesiac)' : 'Mimo (celkom)'}</div><div class="fuel-stat-value">${rawKmA.toLocaleString()} <span class="fuel-stat-unit">km</span></div></div>
            <div class="fuel-stat-item" style="opacity: 0.7;"><div class="fuel-stat-label">Norma Mesto</div><div class="fuel-stat-value" style="font-size: 1rem;">${normCityDisplay} <span class="fuel-stat-unit">L</span></div></div>
            <div class="fuel-stat-item" style="opacity: 0.7;"><div class="fuel-stat-label">Norma Mimo</div><div class="fuel-stat-value" style="font-size: 1rem;">${normOutsideDisplay} <span class="fuel-stat-unit">L</span></div></div>
            ${(!isMonthly || displayData.monthly_fuel_level !== null) ? `<div class="fuel-level-bar"><div class="fuel-level-bar-label"><span>${isMonthly ? 'Stav na konci' : 'Nádrž'}</span><span style="font-weight:bold;">${Math.round(fuelPercentage)}%</span></div><div class="fuel-level-bar-track"><div class="fuel-level-bar-fill ${fuelFillClass}" style="width: ${fuelPercentage}%;"></div></div><div style="display:flex; justify-content:space-between; margin-top:4px; font-size:0.75rem; color:var(--color-text-secondary);"><span>${currentLevel.toFixed(1)} L</span><span>Dotankovať: ${litersMissing.toFixed(1)} L</span></div></div>` : ''}
        </div>
        <div class="fuel-car-actions">
            <button class="fuel-action-btn history-btn"><i class="fas fa-history"></i> História</button>
            ${canEdit ? `<button class="fuel-action-btn km-btn"><i class="fas fa-road"></i> Jazda</button><button class="fuel-action-btn refuel-btn" style="color:var(--color-orange-accent); border-color:var(--color-orange-accent);"><i class="fas fa-gas-pump"></i> Tankovať</button>` : ''}
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
    const editIdInput = document.getElementById(IDs.FUEL.EDIT_RECORD_ID);
    if (editIdInput) editIdInput.value = '';
    const title = document.getElementById(IDs.FUEL.MODAL_TITLE);
    if(title) title.textContent = 'Zaevidovať tankovanie';
    const carIdInput = document.getElementById(IDs.FUEL.CAR_ID);
    const dateInput = document.getElementById(IDs.FUEL.DATE);
    const kmInput = document.getElementById(IDs.FUEL.KM);
    document.getElementById(IDs.FUEL.NEW_CAR_FIELDS).classList.add('hidden');
    document.getElementById(IDs.FUEL.REFUEL_FIELDS).classList.remove('hidden');
    document.getElementById(IDs.FUEL.FORM).reset();
    let defaultDate = new Date();
    if (filterState.month !== '') {
        const filterMonth = parseInt(filterState.month), filterYear = parseInt(filterState.year);
        if (defaultDate.getMonth() !== filterMonth || defaultDate.getFullYear() !== filterYear) defaultDate = new Date(filterYear, filterMonth, 1, 12, 0, 0); 
    }
    dateInput.valueAsDate = defaultDate;
    ModalManager.open(IDs.FUEL.MODAL, () => {
        carIdInput.value = carId || '';
        if (kmInput) { kmInput.min = currentKm + 1; kmInput.value = currentKm; }
    });
}

function openKmModal(carId, currentKm = 0) {
    document.getElementById(IDs.FUEL.KM_FORM).reset();
    const editIdInput = document.getElementById(IDs.FUEL.KM_EDIT_RECORD_ID);
    if (editIdInput) editIdInput.value = '';
    const dateInput = document.getElementById(IDs.FUEL.KM_DATE);
    let defaultDate = new Date();
    if (filterState.month !== '') {
        const filterMonth = parseInt(filterState.month), filterYear = parseInt(filterState.year);
        if (defaultDate.getMonth() !== filterMonth || defaultDate.getFullYear() !== filterYear) defaultDate = new Date(filterYear, filterMonth, 1, 12, 0, 0); 
    }
    dateInput.valueAsDate = defaultDate;
    document.getElementById(IDs.FUEL.KM_CAR_ID).value = carId;
    const kmInput = document.getElementById(IDs.FUEL.KM_TOTAL_STATE);
    ModalManager.open(IDs.FUEL.KM_MODAL, () => {
        if (kmInput) { kmInput.min = currentKm + 1; kmInput.value = currentKm; }
    });
}

function closeFuelModal() { ModalManager.close(IDs.FUEL.MODAL); }
function closeKmModal() { ModalManager.close(IDs.FUEL.KM_MODAL); }

/**
 * ✅ OPRAVENÉ: Použitie round2 pri globálnom prepočte štatistík auta
 */
async function recalculateCarStats(carId) {
    await safeAsync(async () => {
        const db = store.getDB();
        const carRef = doc(db, 'cars', carId);
        const [refuelings, kmLogs, carDoc] = await Promise.all([fetchCollection(`cars/${carId}/refuelings`), fetchCollection(`cars/${carId}/km_logs`), getDoc(carRef)]);
        
        let maxKm = carDoc.data().start_km || 0, sumLiters = 0, sumDistance = 0, sumKmC = 0, sumKmA = 0, lastRefuelDate = null, lastRefuelKm = null;

        refuelings.forEach(r => {
            if (r.km_total > maxKm) maxKm = r.km_total;
            sumLiters = round2(sumLiters + (r.liters || 0));
            sumDistance = round2(sumDistance + (r.distance_driven || 0));
            sumKmC = round2(sumKmC + (r.km_c || 0));
            sumKmA = round2(sumKmA + (r.km_a || 0));
            const dDate = r.date.toDate();
            if (!lastRefuelDate || dDate > lastRefuelDate) { lastRefuelDate = dDate; lastRefuelKm = r.km_total; }
        });

        kmLogs.forEach(k => {
            if (k.km_total > maxKm) maxKm = k.km_total;
            sumDistance = round2(sumDistance + (k.distance_driven || 0));
            sumKmC = round2(sumKmC + (k.km_c || 0));
            sumKmA = round2(sumKmA + (k.km_a || 0));
        });

        const newAvgConsumption = (sumDistance > 0 && sumLiters > 0) ? round2((sumLiters / sumDistance) * 100) : 0;
        const updateData = { current_km: maxKm, average_consumption: newAvgConsumption, km_norm_c: sumKmC, km_norm_a: sumKmA };
        if (lastRefuelDate) { updateData.last_refuel_date = lastRefuelDate; updateData.last_refuel_total_km = lastRefuelKm; }
        await updateDoc(carRef, updateData);
    }, 'Chyba pri prepočítavaní štatistík auta', { showToastOnError: false });
}

async function handleFuelSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]'), originalText = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = 'Ukladám...';
    const editId = document.getElementById(IDs.FUEL.EDIT_RECORD_ID)?.value;

    await safeAsync(async () => {
        if (editId) { await updateRefueling(editId); showToast('Záznam bol úspešne upravený.', TOAST_TYPE.SUCCESS); }
        else { await processRefueling(); showToast('Záznam uložený. Dáta sa aktualizujú...', TOAST_TYPE.SUCCESS); }
        closeFuelModal();
        document.getElementById(IDs.FUEL.HISTORY_MODAL)?.classList.add('hidden');
    }, 'Chyba pri spracovaní tankovania');

    submitBtn.disabled = false; submitBtn.textContent = originalText;
}

async function handleKmSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]'), originalText = submitBtn.textContent;
    submitBtn.disabled = true; submitBtn.textContent = 'Ukladám...';
    const editId = document.getElementById(IDs.FUEL.KM_EDIT_RECORD_ID)?.value;

    await safeAsync(async () => {
        if (editId) { await updateKmLog(editId); showToast('Záznam bol úspešne upravený.', TOAST_TYPE.SUCCESS); }
        else { await processKmLogInternal(); showToast('Jazda bola zaznamenaná.', TOAST_TYPE.SUCCESS); }
        closeKmModal();
        document.getElementById(IDs.FUEL.HISTORY_MODAL)?.classList.add('hidden');
    }, 'Chyba pri spracovaní jazdy');

    submitBtn.disabled = false; submitBtn.textContent = originalText;
}

/**
 * ✅ OPRAVENÉ: Použitie round2 pri spracovaní nového tankovania
 */
async function processRefueling() {
    const db = store.getDB(), carId = document.getElementById(IDs.FUEL.CAR_ID).value;
    const newKm = parseInt(document.getElementById(IDs.FUEL.KM).value), liters = parseFloat(document.getElementById(IDs.FUEL.LITERS).value);
    const price = parseFloat(document.getElementById(IDs.FUEL.PRICE).value) || 0, date = document.getElementById(IDs.FUEL.DATE).value, kmCityInput = parseFloat(document.getElementById(IDs.FUEL.KM_CITY).value) || 0;
    
    const carRef = doc(db, 'cars', carId), carDoc = await getDoc(carRef);
    if (!carDoc.exists()) throw new Error('Vozidlo neexistuje.');

    const carData = carDoc.data(), prevKm = carData.current_km || 0;
    if (newKm <= prevKm) throw new Error(`Nový stav (${newKm}) musí byť vyšší ako predchádzajúci (${prevKm}).`);
    const distanceGap = newKm - prevKm;
    if (kmCityInput > distanceGap) throw new Error(`Km v meste (${kmCityInput}) nemôžu byť vyššie ako prejdená vzdialenosť (${distanceGap}).`);

    const distanceOutside = round2(distanceGap - kmCityInput);
    let referenceKmForConsumption = carData.last_refuel_total_km ?? (carData.start_km ?? prevKm);
    const distanceForConsumption = newKm - referenceKmForConsumption;
    const consumption = distanceForConsumption > 0 ? round2((liters / distanceForConsumption) * 100) : 0;

    await addDocument(`cars/${carId}/refuelings`, { date: new Date(date), liters: liters, price: price, km_total: newKm, distance_driven: distanceGap, calc_base_distance: distanceForConsumption, km_c: kmCityInput, km_a: distanceOutside, consumption_l100: consumption }, false);
    await updateDoc(carRef, { current_km: newKm, average_consumption: consumption, last_refuel_date: new Date(date), last_refuel_total_km: newKm, km_norm_c: increment(kmCityInput), km_norm_a: increment(distanceOutside) });
    await recalculateHistoryChain(carId);
    logUserAction("PHM", `Tankovanie ${carId}: ${liters}L, Spotreba: ${consumption.toFixed(2)}`);
}

async function updateRefueling(docId) {
    const carId = document.getElementById(IDs.FUEL.CAR_ID).value, date = document.getElementById(IDs.FUEL.DATE).value, liters = parseFloat(document.getElementById(IDs.FUEL.LITERS).value), price = parseFloat(document.getElementById(IDs.FUEL.PRICE).value) || 0, newKmTotal = parseInt(document.getElementById(IDs.FUEL.KM).value), newKmCity = parseFloat(document.getElementById(IDs.FUEL.KM_CITY).value) || 0;
    if (!date || isNaN(liters) || isNaN(newKmTotal)) throw new Error("Prosím, vyplňte všetky povinné polia správne.");
    await updateDocument(`cars/${carId}/refuelings`, docId, { date: new Date(date), liters: liters, price: price, km_total: newKmTotal, km_c: newKmCity });
    await recalculateHistoryChain(carId);
    logUserAction("PHM", `Úprava tankovania ${carId} (ID: ${docId})`);
}

async function updateKmLog(docId) {
    const carId = document.getElementById(IDs.FUEL.KM_CAR_ID).value, dateVal = document.getElementById(IDs.FUEL.KM_DATE).value, kmTotal = parseInt(document.getElementById(IDs.FUEL.KM_TOTAL_STATE).value), kmCity = parseFloat(document.getElementById(IDs.FUEL.KM_CITY_INPUT).value) || 0;
    await updateDocument(`cars/${carId}/km_logs`, docId, { date: new Date(dateVal), km_total: kmTotal, km_c: kmCity });
    await recalculateHistoryChain(carId);
    logUserAction("PHM", `Úprava jazdy ${carId} (ID: ${docId})`);
}

async function processKmLogInternal() {
    const db = store.getDB(), user = store.getUser(), carId = document.getElementById(IDs.FUEL.KM_CAR_ID).value, dateVal = document.getElementById(IDs.FUEL.KM_DATE).value, newKm = parseInt(document.getElementById(IDs.FUEL.KM_TOTAL_STATE).value), kmCityInput = parseFloat(document.getElementById(IDs.FUEL.KM_CITY_INPUT).value) || 0;
    const carRef = doc(db, 'cars', carId), carDoc = await getDoc(carRef);
    if (!carDoc.exists()) throw new Error('Vozidlo neexistuje.');
    const carData = carDoc.data(), prevKm = carData.current_km || 0;
    if (newKm <= prevKm) throw new Error(`Nový stav (${newKm}) musí byť vyšší ako súčasný (${prevKm}).`);
    const distanceGap = newKm - prevKm;
    if (kmCityInput > distanceGap) throw new Error(`Km v meste (${kmCityInput}) nemôžu byť vyššie ako celková vzdialenosť (${distanceGap}).`);
    const distanceOutside = round2(distanceGap - kmCityInput);

    await addDocument(`cars/${carId}/km_logs`, { date: new Date(dateVal), km_total: newKm, distance_driven: distanceGap, km_c: kmCityInput, km_a: distanceOutside, user: user?.email || 'neznamy' }, false);
    await updateDoc(carRef, { current_km: newKm, km_norm_c: increment(kmCityInput), km_norm_a: increment(distanceOutside) });
    await recalculateHistoryChain(carId);
    logUserAction("PHM", `Jazda ${carId}: ${distanceGap}km (Mesto: ${kmCityInput}, Mimo: ${distanceOutside})`);
}

async function openHistoryModal(carId, carBrand) {
    await safeAsync(async () => {
        const activeUser = store.getUser();
        
        // 🔥 DEMO REŽIM: Použijeme simulované dáta
        if (isDemoUser(activeUser.email)) {
            console.log("Demo režim: Generujem simulovanú históriu vozidla.");
            
            // Simulované normy
            const normCity = 6.5;
            const normOutside = 5.1;
            
            // Simulované udalosti (tankovania a jazdy) s kompletným dátovým modelom
            const mockEvents = [
                { id: 'event1', type: 'refuel', date: { toDate: () => new Date(2025, 11, 15) }, liters: 45.5, distance_driven: 520, km_c: 280, km_a: 240, km_total: 158420, consumption_l100: 8.75, price: 1.45 },
                { id: 'event2', type: 'drive', date: { toDate: () => new Date(2025, 11, 10) }, distance_driven: 120, km_c: 80, km_a: 40, km_total: 157900, consumption_l100: 0, price: 0 },
                { id: 'event3', type: 'refuel', date: { toDate: () => new Date(2025, 11, 5) }, liters: 38.2, distance_driven: 445, km_c: 220, km_a: 225, km_total: 157780, consumption_l100: 8.58, price: 1.42 },
                { id: 'event4', type: 'drive', date: { toDate: () => new Date(2025, 10, 28) }, distance_driven: 95, km_c: 60, km_a: 35, km_total: 157335, consumption_l100: 0, price: 0 },
                { id: 'event5', type: 'refuel', date: { toDate: () => new Date(2025, 10, 20) }, liters: 42.0, distance_driven: 480, km_c: 250, km_a: 230, km_total: 157240, consumption_l100: 8.75, price: 1.48 }
            ];
            
            document.getElementById(IDs.FUEL.HISTORY_MODAL_TITLE) && (document.getElementById(IDs.FUEL.HISTORY_MODAL_TITLE).textContent = `História - ${carBrand}`);
            const stats = renderHistoryTable(mockEvents, carId, normCity, normOutside);
            renderHistoryChart(mockEvents, normCity, normOutside);
            const excelBtn = document.getElementById(IDs.FUEL.HISTORY_EXCEL_BTN);
            // V demo režime zakážeme stiahnutie Excelu
            if (excelBtn) {
                excelBtn.disabled = true;
                excelBtn.style.opacity = '0.5';
                excelBtn.style.cursor = 'not-allowed';
                excelBtn.title = 'Export do Excel nie je dostupný v demo režime';
            }
            ModalManager.open(IDs.FUEL.HISTORY_MODAL);
            return;
        }
        
        // REÁLNY REŽIM: Načítanie z Firestore
        const db = store.getDB(), carDoc = await getDoc(doc(db, 'cars', carId)), carData = carDoc.exists() ? carDoc.data() : {};
        const normCity = parseFloat(carData.norm_city) || 0, normOutside = parseFloat(carData.norm) || 0;
        const [refuelings, kmLogs] = await Promise.all([fetchCollection(`cars/${carId}/refuelings`, { orderByField: 'date', orderDirection: 'desc' }), fetchCollection(`cars/${carId}/km_logs`, { orderByField: 'date', orderDirection: 'desc' })]);
        const allEvents = [...refuelings.map(r => ({ ...r, type: 'refuel' })), ...kmLogs.map(k => ({ ...k, type: 'drive' }))].sort((a, b) => b.date.toDate() - a.date.toDate());
        document.getElementById(IDs.FUEL.HISTORY_MODAL_TITLE) && (document.getElementById(IDs.FUEL.HISTORY_MODAL_TITLE).textContent = `História - ${carBrand}`);
        const stats = renderHistoryTable(allEvents, carId, normCity, normOutside);
        renderHistoryChart(allEvents, normCity, normOutside);
        const excelBtn = document.getElementById(IDs.FUEL.HISTORY_EXCEL_BTN);
        if (excelBtn) excelBtn.onclick = () => downloadHistoryExcel(carBrand, allEvents, stats.monthlyStats, normCity, normOutside, stats.globalAverage);
        ModalManager.open(IDs.FUEL.HISTORY_MODAL);
    }, 'Nepodarilo sa načítať históriu');
}

function renderHistoryTable(events, carId, normCity, normOutside) {
    const tbody = document.getElementById(IDs.FUEL.HISTORY_TABLE_BODY);
    if (!tbody || events.length === 0) { tbody && (tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">Zatiaľ žiadne záznamy.</td></tr>'); return { monthlyStats: {}, globalAverage: 0 }; }

    let grandTotalLiters = 0, grandTotalDistance = 0;
    const monthlyStats = {}, monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'];

    events.forEach(e => {
        const dist = e.distance_driven || 0; grandTotalDistance = round2(grandTotalDistance + dist);
        if (e.type === 'refuel') grandTotalLiters = round2(grandTotalLiters + (e.liters || 0));
        const dateObj = e.date.toDate(), monthKey = `${dateObj.getFullYear()}-${dateObj.getMonth()}`;
        if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { km: 0, liters: 0, km_c: 0, km_a: 0 };
        monthlyStats[monthKey].km = round2(monthlyStats[monthKey].km + dist);
        monthlyStats[monthKey].km_c = round2(monthlyStats[monthKey].km_c + (e.km_c || 0));
        monthlyStats[monthKey].km_a = round2(monthlyStats[monthKey].km_a + (e.km_a || 0));
        if (e.type === 'refuel') monthlyStats[monthKey].liters = round2(monthlyStats[monthKey].liters + (e.liters || 0));
    });

    const globalAverage = grandTotalDistance > 0 ? round2((grandTotalLiters / grandTotalDistance) * 100) : 0;
    let html = '', currentMonthKey = null;

    events.forEach(item => {
        const itemDate = item.date.toDate(), itemMonthKey = `${itemDate.getFullYear()}-${itemDate.getMonth()}`;
        if (itemMonthKey !== currentMonthKey) {
            const stats = monthlyStats[itemMonthKey], monthName = monthNames[itemDate.getMonth()];
            let consumptionStr = '<span style="color:#aaa;">--</span>';
            if (stats.km > 0) {
                if (stats.liters > 0) {
                    const realCons = round2((stats.liters / stats.km) * 100);
                    consumptionStr = `<strong style="color:${(globalAverage > 0 && realCons > globalAverage * 1.3) ? '#E53E3E' : '#48BB78'};">${realCons.toFixed(2)} L/100km</strong>`;
                } else {
                    let virtualCons = (normCity > 0 || normOutside > 0) ? round2((((stats.km_c * normCity) + (stats.km_a * normOutside)) / 100) / stats.km * 100) : 0;
                    consumptionStr = `<div style="text-align:right; line-height:1.2;"><span style="font-size: 0.75rem; color:#aaa;">(bez PHM)</span><br>${virtualCons > 0 ? `<span style="color:#DD6B20; font-size: 0.85rem;"><i class="fas fa-calculator"></i> ~${virtualCons.toFixed(2)}</span>` : ''}</div>`;
                }
            }
            html += `<tr style="background: rgba(255,255,255,0.03); font-weight: 700;"><td colspan="2" style="padding: 12px 15px; color: var(--color-orange-accent);">${monthName} ${itemDate.getFullYear()}</td><td colspan="2" class="text-right">Spolu: ${stats.km.toLocaleString()} km</td><td class="text-right">${consumptionStr}</td><td colspan="2"></td></tr>`;
            currentMonthKey = itemMonthKey;
        }
        const isRefuel = item.type === 'refuel';
        html += `<tr><td style="padding-left: 20px; font-size: 0.85rem; opacity: 0.7;">${itemDate.toLocaleDateString('sk-SK')}</td><td><span class="badge-event badge-${isRefuel ? 'refuel' : 'drive'}"><i class="fas fa-${isRefuel ? 'gas-pump' : 'route'}"></i> ${isRefuel ? 'Tankovanie' : 'Jazda'}</span></td><td class="text-right">${item.km_total.toLocaleString()} km</td><td class="text-right" style="color:var(--color-orange-accent);">+${item.distance_driven.toLocaleString()} km</td><td class="text-right">${isRefuel ? `<div style="font-weight:bold;">${item.liters.toFixed(2)} L</div><div style="font-size:0.75rem; color:${(globalAverage > 0 && item.consumption_l100 > (globalAverage * 2.0)) ? '#DD6B20' : '#aaa'};">${(globalAverage > 0 && item.consumption_l100 > (globalAverage * 2.0)) ? '<i class="fas fa-calculator"></i> ~' + globalAverage.toFixed(2) : item.consumption_l100.toFixed(2)} L/100km</div>` : `<span style="color:#aaa; font-size:0.85rem;">~${((item.distance_driven * globalAverage) / 100).toFixed(2)} L</span>`}</td><td class="text-right" style="font-size:0.8rem; opacity:0.6;">C: ${item.km_c || 0} | A: ${item.km_a || 0}</td><td class="text-center"><button class="action-btn-edit" onclick="editHistoryRecord('${isRefuel ? 'tankovanie' : 'jazda'}', '${item.id}', '${carId}', '${itemDate.toISOString().split('T')[0]}', ${item.km_total}, ${isRefuel ? item.liters : item.km_c || 0}, ${isRefuel ? item.price || 0 : 0}, ${isRefuel ? item.km_c || 0 : 0})"><i class="fas fa-edit"></i></button></td></tr>`;
    });
    tbody.innerHTML = html;
    return { monthlyStats, globalAverage };
}

async function renderHistoryChart(events, normCity, normOutside) {
    const ctx = document.getElementById(IDs.FUEL.HISTORY_CHART);
    if (!ctx || events.length === 0) return;
    if (_historyChart) _historyChart.destroy();
    let Chart;
    try { Chart = await lazyLoader.loadChartJS(); } catch (e) { ctx.innerHTML = '<p style="text-align:center;padding:20px;color:var(--color-text-secondary);">Graf sa nepodarilo načítať.</p>'; return; }

    const chartData = events.filter(e => e.type === 'refuel' && e.consumption_l100 > 0 && e.consumption_l100 < 50).sort((a, b) => a.date.toDate() - b.date.toDate()).map(e => ({ x: e.date.toDate().toLocaleDateString('sk-SK'), y: e.consumption_l100, liters: e.liters, km: e.distance_driven }));
    if (chartData.length === 0) return;

    _historyChart = new Chart(ctx, { type: 'line', data: { labels: chartData.map(d => d.x), datasets: [{ label: 'Reálna spotreba (L/100km)', data: chartData.map(d => d.y), borderColor: '#bc8700', backgroundColor: 'rgba(188, 135, 0, 0.1)', borderWidth: 3, tension: 0.3, pointRadius: 4, fill: true }, { label: 'Norma (Mesto)', data: new Array(chartData.length).fill(normCity || null), borderColor: 'rgba(229, 62, 62, 0.6)', borderWidth: 2, borderDash: [5, 5], pointRadius: 0 }, { label: 'Norma (Mimo)', data: new Array(chartData.length).fill(normOutside || null), borderColor: 'rgba(72, 187, 120, 0.6)', borderWidth: 2, borderDash: [5, 5], pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: '#9CA3AF' } }, y: { ticks: { color: '#9CA3AF' } } } } });
}

async function deleteHistoryRecord(carId, recordId, recordType) {
    if (!confirm('Naozaj vymazať tento záznam?')) return;
    await safeAsync(async () => {
        await deleteDocument(`cars/${carId}/${recordType === 'refuel' ? 'refuelings' : 'km_logs'}`, recordId);
        await recalculateCarStats(carId); await recalculateHistoryChain(carId);
        showToast('Záznam bol vymazaný.', TOAST_TYPE.SUCCESS);
        if (!document.getElementById(IDs.FUEL.HISTORY_MODAL)?.classList.contains('hidden')) { openHistoryModal(carId, (await getDoc(doc(store.getDB(), 'cars', carId))).data().brand); }
    }, 'Chyba pri mazaní záznamu');
}

function editHistoryRecord(type, id, carId, dateStr, kmTotal, val1, val2, val3) {
    if (type === 'tankovanie') {
        const editIdInput = document.getElementById(IDs.FUEL.EDIT_RECORD_ID); if (editIdInput) editIdInput.value = id;
        document.getElementById(IDs.FUEL.CAR_ID).value = carId; document.getElementById(IDs.FUEL.MODAL_TITLE).textContent = 'Upraviť tankovanie';
        document.getElementById(IDs.FUEL.DATE).value = dateStr; document.getElementById(IDs.FUEL.KM).value = kmTotal; document.getElementById(IDs.FUEL.LITERS).value = val1; document.getElementById(IDs.FUEL.PRICE).value = val2 || ''; document.getElementById(IDs.FUEL.KM_CITY).value = val3 || 0;
        document.getElementById(IDs.FUEL.MODAL).classList.remove('hidden');
    } else if (type === 'jazda') {
        const editIdInput = document.getElementById(IDs.FUEL.KM_EDIT_RECORD_ID); if (editIdInput) editIdInput.value = id;
        document.getElementById(IDs.FUEL.KM_CAR_ID).value = carId; document.getElementById(IDs.FUEL.KM_DATE).value = dateStr; document.getElementById(IDs.FUEL.KM_TOTAL_STATE).value = kmTotal; document.getElementById(IDs.FUEL.KM_CITY_INPUT).value = val1 || 0;
        document.getElementById(IDs.FUEL.KM_MODAL).classList.remove('hidden');
    }
}

/**
 * ✅ OPRAVENÉ: Použitie round2 pri komplexnom prepočte histórie vozidla
 */
async function recalculateHistoryChain(carId) {
    await safeAsync(async () => {
        const db = store.getDB();
        const [refuelings, kmLogs, carDoc] = await Promise.all([fetchCollection(`cars/${carId}/refuelings`, { orderByField: 'date', orderDirection: 'asc' }), fetchCollection(`cars/${carId}/km_logs`, { orderByField: 'date', orderDirection: 'asc' }), getDoc(doc(db, 'cars', carId))]);
        if (!carDoc.exists()) return;

        const carData = carDoc.data(), tankCapacity = carData.tank_capacity || 50; 
        let currentTankLevel = carData.start_fuel_level || 0, previousKm = carData.start_km || 0, baseKmForConsumption = carData.start_km || 0, timeline = [...refuelings.map(r => ({ ...r, collection: 'refuelings', type: 'refuel' })), ...kmLogs.map(k => ({ ...k, collection: 'km_logs', type: 'drive' }))].sort((a, b) => a.date.toDate() - b.date.toDate()), operations = [];

        for (const record of timeline) {
            const safeDistance = round2(Math.max(0, record.km_total - previousKm));
            const litersConsumed = round2((safeDistance * (carData.average_consumption || carData.norm_city || 7.0)) / 100);
            currentTankLevel = round2(Math.max(0, currentTankLevel - litersConsumed));

            let updateData = { distance_driven: safeDistance, km_a: round2(Math.max(0, safeDistance - (record.km_c || 0))) };
            if (record.type === 'refuel') {
                const distForCons = round2(record.km_total - baseKmForConsumption);
                const newConsumption = (distForCons > 0 && record.liters > 0) ? round2((record.liters / distForCons) * 100) : 0;
                updateData.calc_base_distance = distForCons; updateData.consumption_l100 = newConsumption;
                baseKmForConsumption = record.km_total; currentTankLevel = round2(Math.min(tankCapacity, currentTankLevel + record.liters));
            }
            updateData.fuel_level_after = currentTankLevel;
            operations.push({ type: 'update', collection: `cars/${carId}/${record.collection}`, id: record.id, data: updateData });
            previousKm = record.km_total;
        }

        if (operations.length > 0) await batchOperation(operations, { showProgress: false });
        await updateDoc(doc(db, 'cars', carId), { current_fuel_level: currentTankLevel });
        await recalculateCarStats(carId);
    }, 'Chyba pri komplexnom prepočte histórie', { showToastOnError: false });
}

async function downloadHistoryExcel(carBrand, events, monthlyStats, normCity, normOutside, globalAverage) {
    if (!events || events.length === 0) { showToast('Žiadne dáta na export.', TOAST_TYPE.ERROR); return; }
    let XLSX; try { XLSX = (await lazyLoader.loadExcelBundle()).XLSX; } catch (e) { showToast('Chyba knižnice pre export.', TOAST_TYPE.ERROR); return; }

    const wsData = [['Dátum', 'Typ udalosti', 'Stav tachometra (km)', 'Prejdená vzdialenosť (km)', 'Natankované (L)', 'Spotreba (L/100km)', 'Jazda mesto (km)', 'Jazda mimo mesto (km)']], monthNames = ['Január', 'Február', 'Marec', 'Apríl', 'Máj', 'Jún', 'Júl', 'August', 'September', 'Október', 'November', 'December'], summaryRowIndices = [];
    let currentMonthKey = null;

    events.forEach(item => {
        const itemDate = item.date.toDate(), itemMonthKey = `${itemDate.getFullYear()}-${itemDate.getMonth()}`;
        if (itemMonthKey !== currentMonthKey) {
            if (currentMonthKey !== null) wsData.push(['', '', '', '', '', '', '', '']);
            const stats = monthlyStats[itemMonthKey] || { km: 0, liters: 0 };
            wsData.push([`${monthNames[itemDate.getMonth()]} ${itemDate.getFullYear()}`, '', '', `Spolu: ${formatNumber(stats.km, 0)}`, stats.liters > 0 ? formatNumber(stats.liters, 2) : '-', stats.km > 0 ? (stats.liters > 0 ? formatNumber(stats.liters / stats.km * 100, 2) : formatNumber((stats.km_c * normCity + stats.km_a * normOutside) / 100 / stats.km * 100, 2)) : '-', '', '']);
            summaryRowIndices.push(wsData.length - 1); currentMonthKey = itemMonthKey;
        }
        wsData.push([itemDate.toLocaleDateString('sk-SK'), item.type === 'refuel' ? 'Tankovanie' : 'Jazda', formatNumber(item.km_total, 0), formatNumber(item.distance_driven, 0), item.type === 'refuel' ? formatNumber(item.liters, 2) : '', item.consumption_l100 ? formatNumber(item.consumption_l100, 2) : '', formatNumber(item.km_c || 0, 0), formatNumber(item.km_a || 0, 0)]);
    });

    const wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.decode_range(ws['!ref']);

    // Nastavenie šírky stĺpcov
    ws['!cols'] = [
        {wch: 15}, // Dátum
        {wch: 13}, // Typ udalosti
        {wch: 17}, // Stav tachometra (km)
        {wch: 13}, // Prejdená vzdialenosť (km)
        {wch: 12}, // Natankované (L)
        {wch: 11}, // Spotreba (L/100km)
        {wch: 11}, // Jazda mesto (km)
        {wch: 11}  // Jazda mimo mesto (km)
    ];

    // Vizuálne vylepšenia: farebné rozlíšenie riadkov a formátovanie
    for (let r = 1; r < wsData.length; r++) {
        const row = wsData[r];
        const isSummary = row[0] && monthNames.some(m => row[0].startsWith(m));
        const isRefuel = row[1] === 'Tankovanie';
        const isDrive = row[1] === 'Jazda';

        for (let c = 0; c < 8; c++) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            if (!ws[cellRef]) continue;

            let style = ws[cellRef].s || {};

            if (isSummary) {
                style.fill = { fgColor: { rgb: "4F4F4F" } }; // tmavosivá
                style.font = { bold: true, color: { rgb: "FFFFFF" } };
            } else if (isRefuel) {
                style.fill = { fgColor: { rgb: "E8F5E8" } }; // jemný zelený nádych
            }

            // Zebra striedanie pre jazdu a tankovanie
            if (!isSummary && !style.fill && (r % 2 === 0)) {
                style.fill = { fgColor: { rgb: "F5F5F5" } }; // svetlosivá pre striedanie
            }

            // Zarovnanie doprava pre číselné stĺpce
            if (c >= 2 && c <= 7) {
                style.alignment = { horizontal: "right" };
            }

            ws[cellRef].s = style;
        }
    }

    // Nastavenie štýlu pre prvý riadok: rovnaký ako v kontaktoch
    for (let col = 0; col < 8; col++) {
        const cellRef = XLSX.utils.encode_cell({r: 0, c: col});
        if (ws[cellRef]) {
            ws[cellRef].s = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                alignment: { wrapText: true, horizontal: "center", vertical: "center" },
                fill: { fgColor: { rgb: "44546A" } },
                border: { bottom: { style: "medium", color: { auto: 1 } } }
            };
        }
    }

    XLSX.utils.book_append_sheet(wb, ws, "História");
    XLSX.writeFile(wb, `export_phm_${carBrand.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

window.editHistoryRecord = editHistoryRecord;
window.recalculateHistoryChain = recalculateHistoryChain;
window.deleteHistoryRecord = deleteHistoryRecord;