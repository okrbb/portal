/* contacts_module.js - REFACTORED with new helpers + LAZY LOADING */
import { store } from './store.js';
import { Permissions } from './accesses.js';
import { db } from './config.js';
import { collection, getDocs } from 'firebase/firestore';
import { IDs } from './id-registry.js';

// ✅ NOVÉ: Import helpers
import { showToast, TOAST_TYPE, ModalManager, setupSearchInput } from './utils.js';
import { searchService } from './search_service.js';
import { lazyLoader } from './lazy_loader.js';
import { updateDocument } from './firebase_helpers.js';
import { logUserAction } from './logs_module.js';

let allContactsCache = []; 
let lastRenderedList = [];
// ✅ PRIDANÉ: Referencia na filtering funkciu pre refresh po editácii
let triggerFiltering = null;

/**
 * ✅ OPRAVA: Globálne funkcie musia byť definované pred použitím v HTML
 */
export async function handleEditContact(contactId) {
    // 1. Zabezpečíme, že modal existuje v DOM
    createEditContactModalHTML();

    // 2. Nájdeme dáta v cache
    const contact = allContactsCache.find(c => c.id === contactId);
    if (!contact) return;

    // ✅ ZACHYTENIE PÔVODNÉHO STAVU pre audit
    const oldMayor = contact.name || '---';

    // 3. Naplníme polia modalu aktuálnymi dátami
    document.getElementById(IDs.CONTACTS.EDIT_CONTACT_ID).value = contactId;
    document.getElementById(IDs.CONTACTS.EDIT_CONTACT_TITLE).innerText = `Upraviť obec: ${contact.municipality}`;
    document.getElementById(IDs.CONTACTS.EDIT_MAYOR).value = contact.name || '';
    document.getElementById(IDs.CONTACTS.EDIT_MOB).value = contact.mob_s || '';
    document.getElementById(IDs.CONTACTS.EDIT_EMAIL).value = contact.em_s || '';
    document.getElementById(IDs.CONTACTS.EDIT_ADDRESS).value = contact.adresa || '';

    // 4. Reset a nastavenie submit listenera
    const form = document.getElementById(IDs.CONTACTS.EDIT_FORM);
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        // Najprv získame novú hodnotu starostu do premennej
        const newMayorValue = document.getElementById(IDs.CONTACTS.EDIT_MAYOR).value.trim();

        const updatedData = {
            name: newMayorValue,
            mob_s: document.getElementById(IDs.CONTACTS.EDIT_MOB).value.trim(),
            em_s: document.getElementById(IDs.CONTACTS.EDIT_EMAIL).value.trim(),
            adresa: document.getElementById(IDs.CONTACTS.EDIT_ADDRESS).value.trim()
        };

        try {
            const [okresId, docId] = contactId.split('_');
            
            // Zápis do Firebase
            await updateDocument(`contacts/${okresId}/${okresId}`, docId, updatedData);

            // Aktualizácia lokálnej cache
            Object.assign(contact, updatedData);
            
            // Re-indexácia vyhľadávania
            searchService.indexData(allContactsCache, 'contacts');

            // ✅ DETAILNÝ AUDIT LOG (teraz s definovanou premennou newMayorValue)
            const logDetail = `zmenil kontakt obce ${contact.municipality} (name: ${oldMayor} -> ${newMayorValue || '---'})`;
            logUserAction('EDIT_CONTACT', logDetail);

            showToast('Kontakt bol úspešne aktualizovaný', TOAST_TYPE.SUCCESS);
            ModalManager.close(IDs.CONTACTS.EDIT_CONTACT_MODAL);
            
            // ✅ OPRAVA: Znovu spustíme filter/vyhľadávanie pre aktualizáciu zobrazenia
            const searchInput = document.getElementById(IDs.CONTACTS.SEARCH_INPUT);
            const searchTerm = searchInput ? searchInput.value.trim() : '';
            triggerFiltering(searchTerm);
        } catch (error) {
            console.error(error);
            showToast('Chyba pri ukladaní do databázy', TOAST_TYPE.ERROR);
        }
    };

    // 5. Otvoríme modal
    ModalManager.open(IDs.CONTACTS.EDIT_CONTACT_MODAL);
}

// ✅ OPRAVA: Priradenie hneď po definícii funkcie
window.openEditContactModal = handleEditContact;

/**
 * Načíta všetky kontakty (obce + zamestnancov) a odošle ich do Workera na indexáciu.
 * ✅ OPTIMALIZOVANÉ: Použitie searchService namiesto manuálneho workera
 * ✅ NOVÉ: Načítava aj zamestnancov z kolekcie 'employees'
 */
export async function loadContactsToCache() {
    const okresy = ["BB", "BS", "BR", "DT", "KA", "LC", "PT", "RA", "RS", "VK", "ZV", "ZC", "ZH"];
    let tempCache = [];

    try {
        // 1. Načítanie kontaktov obcí a miest
        for (const okresId of okresy) {
            const querySnapshot = await getDocs(collection(db, "contacts", okresId, okresId));
            querySnapshot.forEach(doc => {
                const data = doc.data();
                const uniqueId = `${okresId}_${doc.id}`; 
                
                tempCache.push({
                    ...data,  // Najprv rozbalíme všetky dáta z Firebase
                    id: uniqueId,
                    title: doc.id,
                    municipality: doc.id,
                    okres: okresId,
                    type: 'contact'
                });
            });
        }

        // 2. ✅ NOVÉ: Načítanie zamestnancov z kolekcie 'employees'
        try {
            const employeesSnapshot = await getDocs(collection(db, 'employees'));
            employeesSnapshot.forEach(doc => {
                const data = doc.data();
                const empId = data.kod || doc.id;
                
                tempCache.push({
                    id: `emp_${empId}`,
                    title: `${data.meno || ''} ${data.priezvisko || ''}`.trim(),
                    type: 'employee',
                    meno: data.meno || '',
                    priezvisko: data.priezvisko || '',
                    mail: data.mail || '',
                    telefon: data.kontakt || '',
                    oddelenie: data.oddelenie || '',
                    funkcia: data.funkcia || '',
                    ...data
                });
            });
        } catch (e) {
            console.warn("Chyba pri načítaní zamestnancov:", e);
        }

        // 3. ✅ NOVÉ (2026-01-09): Načítanie personálu (staff) z kontaktov
        try {
            // ✅ OPRAVA: Nenačítavaj viackrát - jeden query na všetky dokumenty
            const querySnapshot = await getDocs(collection(db, "contacts"));
            querySnapshot.forEach(doc => {
                const data = doc.data();
                
                // Ak dokument má pole "staff", načítaj personál
                if (data.staff && Array.isArray(data.staff)) {
                    data.staff.forEach((person, index) => {
                        const staffId = `staff_${doc.id}_${index}`;
                        tempCache.push({
                            id: staffId,
                            title: `${person.meno || ''}`.trim(),
                            type: 'staff',
                            meno: person.meno || '',
                            funkcia: person.funkcia || '',
                            kontakt: person.kontakt || '',
                            email: person.email || '',
                            okres: doc.id,  // ID okresu z kontaktu
                            ...person
                        });
                    });
                }
            });
            console.log("[Kontakty] Personál (staff) úspešne načítaný");
        } catch (e) {
            console.warn("Chyba pri načítaní personálu (staff):", e);
        }

        allContactsCache = tempCache;
        allContactsCache.sort((a, b) => a.title.localeCompare(b.title, 'sk'));

        // ✅ NOVÉ: Použitie searchService
        searchService.indexData(allContactsCache, 'contacts');
        
        return allContactsCache;
    } catch (e) {
        console.error("Chyba pri načítaní kontaktov:", e);
        return [];
    }
}

/**
 * ✅ ZACHOVANÉ: Pre kompatibilitu s AI modulom
 */
export async function searchContactsInWorker(queryText) {
    // ✅ NOVÉ: Použitie searchService
    return searchService.searchContacts(queryText);
}

export function searchContactsInCache(userQuery) {
    if (!userQuery) return [];
    const lowerQuery = userQuery.toLowerCase();
    return allContactsCache.filter(c => 
        // Vyhľadávanie obcí/miest
        (c.type === 'contact' && (
            (c.id && c.id.toLowerCase().includes(lowerQuery)) ||
            (c.title && c.title.toLowerCase().includes(lowerQuery)) ||
            (c.municipality && c.municipality.toLowerCase().includes(lowerQuery)) ||
            (c.name && c.name.toLowerCase().includes(lowerQuery)) ||
            (c.mayor && c.mayor.toLowerCase().includes(lowerQuery)) ||
            (c.primator && c.primator.toLowerCase().includes(lowerQuery))
        )) ||
        // Vyhľadávanie zamestnancov
        (c.type === 'employee' && (
            (c.meno && c.meno.toLowerCase().includes(lowerQuery)) ||
            (c.priezvisko && c.priezvisko.toLowerCase().includes(lowerQuery)) ||
            (c.title && c.title.toLowerCase().includes(lowerQuery)) ||
            (c.mail && c.mail.toLowerCase().includes(lowerQuery)) ||
            (c.telefon && c.telefon.toLowerCase().includes(lowerQuery)) ||
            (c.oddelenie && c.oddelenie.toLowerCase().includes(lowerQuery)) ||
            (c.funkcia && c.funkcia.toLowerCase().includes(lowerQuery))
        )) ||
        // ✅ NOVÉ: Vyhľadávanie personálu (staff - novo pridané z Excel)
        (c.type === 'staff' && (
            (c.meno && c.meno.toLowerCase().includes(lowerQuery)) ||
            (c.title && c.title.toLowerCase().includes(lowerQuery)) ||
            (c.funkcia && c.funkcia.toLowerCase().includes(lowerQuery)) ||
            (c.kontakt && c.kontakt.toLowerCase().includes(lowerQuery)) ||
            (c.email && c.email.toLowerCase().includes(lowerQuery)) ||
            (c.okres && c.okres.toLowerCase().includes(lowerQuery))
        ))
    );
}

/**
 * Inicializácia modulu
 * ✅ OPTIMALIZOVANÉ: Použitie ModalManager a setupSearchInput
 */
export function initializeContactsModule() {
    const user = store.getUser(); // Získame aktuálneho používateľa
    const modal = document.getElementById(IDs.CONTACTS.MODAL);
    const okresSelect = document.getElementById(IDs.CONTACTS.PERIOD_SELECT);
    const downloadBtn = document.getElementById(IDs.CONTACTS.DOWNLOAD_XLSX_BTN);

    if (!modal) return;

    if (downloadBtn) {
        // Odstránime staré listenery, ak existujú (vďaka vašej utils funkcii attachListener by to bolo čistejšie)
        downloadBtn.onclick = null; 

        downloadBtn.addEventListener('click', (e) => {
            // Kontrola cez Permissions (ktorá v accesses.js kontroluje demo usera)
            if (!Permissions.canDownloadContacts(user)) {
                e.preventDefault();
                showToast("V demo režime nie je sťahovanie dát povolené.", TOAST_TYPE.ERROR);
                return;
            }

            // Ak nie je demo user, spustí sa sťahovanie
            downloadContactsAsXLSX();
        });
    }

    // ✅ NOVÉ: Setup modalu jedným riadkom
    ModalManager.setupCloseListeners(IDs.CONTACTS.MODAL, IDs.CONTACTS.CLOSE_BTN);
    
    // Close footer button
    const footerBtn = document.getElementById(IDs.CONTACTS.CLOSE_FOOTER_BTN);
    if (footerBtn) {
        footerBtn.addEventListener('click', () => {
            ModalManager.close('contacts-modal', () => {
                const searchInput = document.getElementById(IDs.CONTACTS.SEARCH_INPUT);
                if (searchInput) searchInput.value = '';
                if (okresSelect) okresSelect.value = 'all';
            });
        });
    }

    // ✅ NOVÉ: Setup search inputu jedným riadkom (nahradí ~25 riadkov)
    setupSearchInput(IDs.CONTACTS.SEARCH_INPUT, handleFiltering);

    // Okres filter
    if (okresSelect) {
        okresSelect.addEventListener('change', handleFiltering);
    }
    
    /**
     * ✅ OPTIMALIZOVANÉ: Jednoduchšia filtering logika
     */
    async function handleFiltering(term = '') {
        const selectedOkres = okresSelect ? okresSelect.value : 'all';
        let filtered = [];

        if (term.length > 0) {
            // ✅ NOVÉ: Použitie searchService
            const searchResults = await searchService.searchContacts(term, {
                okres: selectedOkres
            });
            filtered = searchResults;
        } else {
            // Filter len podľa okresu
            filtered = allContactsCache.filter(c => 
                selectedOkres === 'all' || c.okres === selectedOkres
            );
        }
        
        renderResults(filtered);
    }
    
    // ✅ PRIDANÉ: Uložíme referenciu pre použitie po editácii
    triggerFiltering = handleFiltering;
}

/**
 * Zobrazuje vizitky obcí.
 */
function renderResults(list) {
    const container = document.getElementById(IDs.CONTACTS.RESULTS_CONTAINER);
    if (!container) return;

    lastRenderedList = list;
    
    if (list.length === 0) {
        container.innerHTML = `
            <div class="text-center" style="padding: 40px; color: var(--color-text-secondary);">
                <i class="fas fa-search-minus" style="font-size: 3rem; opacity: 0.2; margin-bottom: 15px; display: block;"></i>
                Nenašli sa žiadne výsledky.
            </div>`;
        return;
    }

    // 1. Najprv získame aktuálneho používateľa a jeho práva
    const user = store.getUser(); //
    const canEdit = Permissions.canEditContacts(user); //

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 15px;">`;

    list.forEach(c => {
        // 2. Definujeme tlačidlo vnútri cyklu, aby sme mohli použiť c.id konkrétneho kontaktu
        const editButtonHtml = canEdit ? `
            <button class="edit-contact-btn" title="Upraviť kontakt" onclick="event.stopPropagation(); window.openEditContactModal('${c.id}')">
                <i class="fas fa-pencil-alt"></i>
            </button>
        ` : '';

        // 3. Pridáme triedu 'contact-card' pre CSS efekty (hover) a 'position: relative' pre správne umiestnenie ikony
        html += `
            <div class="fuel-car-card contact-card" style="cursor: default; padding: 15px; border-top: 4px solid var(--color-orange-accent); position: relative;">
                ${editButtonHtml}
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <h3 style="color: var(--color-orange-accent); margin: 0; font-size: 1.25rem;">${c.title}</h3>
                    <div style="text-align: right">
                        <span style="font-size: 0.7rem; display: block; opacity: 0.6;">Okres</span>
                        <span style="font-weight: bold;">${c.okres}</span>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 10px; font-size: 0.9rem;">
                    <div>
                        <p><strong><i class="fas fa-user-tie"></i> name:</strong><br>${c.name || '---'}</p>
                        <p style="margin-top: 8px;"><strong><i class="fas fa-map-marker-alt"></i> Bydlisko:</strong><br>
                        <span class="contact-address-value">${c.adresa || '---'}</span>
                        </p>
                    </div>
                    <div>
                        <p><strong><i class="fas fa-envelope"></i> E-maily:</strong><br>
                            <a href="mailto:${c.em_o}" style="color: var(--color-orange-accent); text-decoration:none;">${c.em_o || 'Obec chýba'}</a><br>
                            <a href="mailto:${c.em_s}" style="color: var(--color-orange-accent); text-decoration:none;">${c.em_s || 'Starosta chýba'}</a>
                        </p>
                    </div>
                </div>

                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--color-border); display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="fuel-stat-item">
                        <span class="fuel-stat-label">Mobil starosta</span>
                        <a href="tel:${c.mob_s}" class="fuel-stat-value" style="text-decoration:none; font-size: 1rem;">${c.mob_s || '---'}</a>
                    </div>
                    <div class="fuel-stat-item">
                        <span class="fuel-stat-label">Telefón obec</span>
                        <a href="tel:${c.tc_o}" class="fuel-stat-value" style="text-decoration:none; font-size: 1rem;">${c.tc_o || '---'}</a>
                    </div>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

export async function downloadContactsAsXLSX() {
    const user = store.getUser();
    const selectEl = document.getElementById(IDs.CONTACTS.PERIOD_SELECT);
    const selectedOkres = selectEl ? selectEl.value : 'all';

    // Poistka priamo vo funkcii
    if (!Permissions.canDownloadContacts(user)) {
        showToast("V demo režime nie je sťahovanie dát povolené.", TOAST_TYPE.ERROR);
        return;
    }
    
    let filteredData = allContactsCache.filter(c => c.type === 'contact'); // Len obce a mestá
    if (selectedOkres !== 'all') {
        filteredData = filteredData.filter(c => c.okres === selectedOkres);
    }

    if (filteredData.length === 0) {
        showToast("Žiadne dáta na stiahnutie.", TOAST_TYPE.WARNING);
        return;
    }

    // ✅ LAZY LOADING: Načítame XLSX knižnicu len pri exporte
    let XLSX;
    try {
        showToast('Pripravujem export adresára...', TOAST_TYPE.INFO, 1500);
        const libs = await lazyLoader.loadExcelBundle();
        XLSX = libs.XLSX;
    } catch (error) {
        console.error('Chyba pri načítaní XLSX knižnice:', error);
        showToast('Chyba: Knižnica pre export sa nepodarila načítať.', TOAST_TYPE.ERROR);
        return;
    }

    const excelRows = filteredData.map(c => ({
        "Obec / Mesto": c.title,
        "Okres": c.okres || '',
        "Starosta (Meno)": c.name || '',
        "Bydlisko starostu": c.adresa || '',
        "E-mail (Obec)": c.em_o || '',
        "E-mail (Starosta)": c.em_s || '',
        "Mobil (Starosta)": c.mob_s || '',
        "Telefón (Úrad)": c.tc_o || '',
        "Telefón (Starosta)": c.tc_s || '',
        "Telefón (Domov)": c.tc_d || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: R, c: C });
            if (!worksheet[address]) continue;
            if (!worksheet[address].s) worksheet[address].s = {};

            if (R === 0) {
                worksheet[address].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    alignment: { wrapText: true, horizontal: "center", vertical: "center" },
                    fill: { fgColor: { rgb: "44546A" } },
                    border: { bottom: { style: "medium", color: { auto: 1 } } }
                };
            }
        }
    }

    // Nastavenie autofiltra a šírok stĺpcov
    worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    worksheet["!cols"] = [
        { wch: 25 }, { wch: 10 }, { wch: 25 }, { wch: 30 }, 
        { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, 
        { wch: 15 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Adresár");
    const fileName = `Adresar_obci_${selectedOkres}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    showToast('Adresár bol úspešne exportovaný.', TOAST_TYPE.SUCCESS);
}

/**
 * Vytvorí HTML štruktúru pre modal editácie kontaktu, ak ešte neexistuje.
 */
function createEditContactModalHTML() {
    if (document.getElementById(IDs.CONTACTS.EDIT_CONTACT_MODAL)) return;

    const modalHtml = `
    <div id="${IDs.CONTACTS.EDIT_CONTACT_MODAL}" class="modal-overlay hidden" style="z-index: 10001;">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h2 id="${IDs.CONTACTS.EDIT_CONTACT_TITLE}">Upraviť údaje obce</h2>
                <button id="${IDs.CONTACTS.EDIT_CLOSE_BTN}" class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <form id="${IDs.CONTACTS.EDIT_FORM}" class="ua-form">
                    <input type="hidden" id="${IDs.CONTACTS.EDIT_CONTACT_ID}">
                    <div class="form-group">
                        <label>Starosta / Primátor:</label>
                        <input type="text" id="${IDs.CONTACTS.EDIT_MAYOR}" class="ua-input" placeholder="Meno a priezvisko">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Mobil name:</label>
                            <input type="text" id="${IDs.CONTACTS.EDIT_MOB}" class="ua-input">
                        </div>
                        <div class="form-group">
                            <label>E-mail name:</label>
                            <input type="email" id="${IDs.CONTACTS.EDIT_EMAIL}" class="ua-input">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Bydlisko:</label>
                        <textarea id="${IDs.CONTACTS.EDIT_ADDRESS}" class="ua-input" rows="3"></textarea>
                    </div>
                    <div class="modal-footer" style="padding: 0; border: none; margin-top: 1rem; display: flex; justify-content: flex-end;">
                        <button type="submit" class="ua-btn accent">Uložiť zmeny</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // ✅ OPRAVA: Inicializácia zatvárania modalu
    ModalManager.setupCloseListeners(IDs.CONTACTS.EDIT_CONTACT_MODAL, IDs.CONTACTS.EDIT_CLOSE_BTN);
}
