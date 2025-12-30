/* contacts_module.js */
import { db } from './config.js';
import { collection, getDocs } from 'firebase/firestore';
import { debounce, showToast, TOAST_TYPE } from './utils.js';

let allContactsCache = []; // Lokálna cache pre bleskové vyhľadávanie

/**
 * Načíta všetky kontakty zo všetkých okresov do lokálnej pamäte.
 */
export async function loadContactsToCache() {
    // Zoznam okresov, ktoré sme importovali
    const okresy = ["BB", "BS", "BR", "DT", "KA", "LC", "PT", "RA", "RS", "VK", "ZV", "ZC", "ZH"];
    let tempCache = [];

    try {
        console.log("[Adresár] Spúšťam hromadné načítanie okresov...");
        
        // Vytvoríme pole požiadaviek pre každý okres
        const promises = okresy.map(okresId => 
            getDocs(collection(db, "contacts", okresId, okresId))
        );

        // Počkáme na dokončenie všetkých požiadaviek naraz
        const snapshots = await Promise.all(promises);

        snapshots.forEach((querySnapshot, index) => {
            const okresId = okresy[index];
            querySnapshot.forEach(doc => {
                tempCache.push({
                    id: doc.id,      // Názov obce
                    okres: okresId,  // Pridáme info o okrese
                    ...doc.data()
                });
            });
        });

        allContactsCache = tempCache;

        // Zoradenie abecedne podľa názvu obce
        allContactsCache.sort((a, b) => a.id.localeCompare(b.id, 'sk'));
        
        console.log(`[Adresár] Úspešne načítaných ${allContactsCache.length} obcí.`);
        return allContactsCache;

    } catch (e) {
        console.error("Chyba pri načítaní kontaktov do cache:", e);
        return [];
    }
}

/**
 * Vylepšené vyhľadávanie pre AI asistentov.
 * Hľadá názov obce v rámci celého dopytu užívateľa.
 */
export function searchContactsInCache(userQuery) {
    if (!userQuery) return [];
    const lowerQuery = userQuery.toLowerCase();
    
    // Filtrujeme kontakty, ktorých ID (názov obce) sa nachádza v otázke užívateľa
    // alebo otázka obsahuje meno starostu
    return allContactsCache.filter(c => 
        lowerQuery.includes(c.id.toLowerCase()) || 
        (c.starosta && lowerQuery.includes(c.starosta.toLowerCase())) ||
        (c.id.toLowerCase().includes(lowerQuery)) // pre prípady, keď user zadal len názov
    );
}

/**
 * Otvorí modálne okno a zobrazí detail konkrétnej obce alebo zoznam výsledkov.
 */
export function openContactDetail(contactIdOrList) {
    const modal = document.getElementById('contacts-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    
    if (typeof contactIdOrList === 'string') {
        const contact = allContactsCache.find(c => c.id === contactIdOrList);
        renderResults(contact ? [contact] : []);
    } else if (Array.isArray(contactIdOrList)) {
        renderResults(contactIdOrList);
    }
}

/**
 * Inicializácia eventov pre modál adresára (filtre, dynamické "X", export).
 */
export function initializeContactsModule() {
    const modal = document.getElementById('contacts-modal');
    const closeBtn = document.getElementById('close-contacts-modal');
    const closeFooterBtn = document.getElementById('btn-close-contacts-footer');
    
    // Elementy pre vyhľadávanie a filtre
    const searchInput = document.getElementById('contacts-search-input');
    const clearBtn = document.getElementById('clear-contacts-search-btn'); // Tlačidlo "X"
    const okresSelect = document.getElementById('filter-okres-select');
    const downloadBtn = document.getElementById('btn-download-contacts-xlsx');

    if (!modal) return;

    // Funkcia na zatvorenie modálu a resetovanie stavu
    const closeModal = () => {
        modal.classList.add('hidden');
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.classList.add('hidden'); // Skryť X pri zatvorení
        if (okresSelect) okresSelect.value = 'all';
    };

    if (closeBtn) closeBtn.onclick = closeModal;
    if (closeFooterBtn) closeFooterBtn.onclick = closeModal;

    /**
     * Hlavná logika filtrovania - spája hľadanie a okres
     */
    const handleFiltering = () => {
        const term = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const selectedOkres = okresSelect ? okresSelect.value : 'all';
        
        // --- DYNAMICKÁ VIDITEĽNOSŤ TLAČIDLA "X" ---
        if (clearBtn) {
            if (term.length > 0) {
                clearBtn.classList.remove('hidden'); // Ukázať, ak je v poli text
            } else {
                clearBtn.classList.add('hidden');    // Skryť, ak je pole prázdne
            }
        }

        // Filtrovanie dát
        const filtered = allContactsCache.filter(c => {
            const matchesSearch = c.id.toLowerCase().includes(term) || 
                                 (c.starosta && c.starosta.toLowerCase().includes(term));
            const matchesOkres = (selectedOkres === 'all' || c.okres === selectedOkres);
            
            return matchesSearch && matchesOkres;
        });
        
        renderResults(filtered);
    };

    // Eventy pre vstupné polia
    if (searchInput) {
        searchInput.addEventListener('input', handleFiltering);
    }

    if (okresSelect) {
        okresSelect.addEventListener('change', handleFiltering);
    }

    // Kliknutie na "X" - vymazanie textu a reset zoznamu
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.classList.add('hidden'); // Okamžité skrytie X
            searchInput.focus();
            handleFiltering(); // Obnoviť zobrazenie (zobrazia sa všetky obce vo vybranom okrese)
        });
    }

    // Prepojenie tlačidla na sťahovanie XLSX
    if (downloadBtn) {
        downloadBtn.onclick = downloadContactsAsXLSX;
    }
}

/**
 * Vykreslí vizitky kontaktov do kontajnera v modále.
 */
function renderResults(list) {
    const container = document.getElementById('contacts-results-container');
    if (!container) return;
    
    if (list.length === 0) {
        container.innerHTML = `
            <div class="text-center" style="padding: 40px; color: var(--color-text-secondary);">
                <i class="fas fa-search-minus" style="font-size: 3rem; opacity: 0.2; margin-bottom: 15px; display: block;"></i>
                Nenašli sa žiadne kontakty.
            </div>`;
        return;
    }

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 15px;">`;

    list.forEach(c => {
        html += `
            <div class="fuel-car-card" style="cursor: default; padding: 15px; border-top: 4px solid var(--color-orange-accent);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <h3 style="color: var(--color-orange-accent); margin: 0; font-size: 1.25rem;">${c.id}</h3>
                    <i class="fas fa-city" style="opacity: 0.2; font-size: 1.5rem;"></i>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 10px; font-size: 0.9rem;">
                    <div>
                        <p><strong><i class="fas fa-user-tie"></i> Starosta:</strong><br>${c.starosta || '---'}</p>
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
                
                <div style="margin-top: 10px; display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--color-text-secondary); opacity: 0.8;">
                    <span>Tel. starosta: ${c.tc_s || '---'}</span>
                    <span>Tel. domov: <span class="contact-phone-home-value">${c.tc_d || '---'}</span></span>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
}

/**
 * Vygeneruje a stiahne XLSX súbor s kontaktmi podľa vybraného okresu.
 */
export function downloadContactsAsXLSX() {
    // 1. Správne prepojenie na ID z HTML (oprava chyby)
    const selectEl = document.getElementById('filter-okres-select');
    const selectedOkres = selectEl ? selectEl.value : 'all';
    
    // 2. Filtrovanie dát podľa výberu
    let filteredData = allContactsCache;
    if (selectedOkres !== 'all') {
        filteredData = allContactsCache.filter(c => c.okres === selectedOkres);
    }

    if (filteredData.length === 0) {
        alert("Žiadne dáta na stiahnutie.");
        return;
    }

    // 3. Príprava dát
    const excelRows = filteredData.map(c => ({
        "Obec / Mesto": c.id,
        "Okres": c.okres || '',
        "Starosta (Meno)": c.starosta || '',
        "Bydlisko starostu": c.adresa || '',
        "E-mail (Obec)": c.em_o || '',
        "E-mail (Starosta)": c.em_s || '',
        "Mobil (Starosta)": c.mob_s || '',
        "Telefón (Úrad)": c.tc_o || '',
        "Telefón (Starosta)": c.tc_s || '',
        "Telefón (Domov)": c.tc_d || ''
    }));

    // 4. Vytvorenie zošita
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Adresár");

    // --- PRIDANIE FILTRA ---
    // Táto vlastnosť povie Excelu, aby na rozsah dát aplikoval automatický filter
    if (worksheet['!ref']) {
        worksheet['!autofilter'] = { ref: worksheet['!ref'] };
    }

    // 5. Formátovanie stĺpcov
    worksheet["!cols"] = [
        { wch: 25 }, { wch: 10 }, { wch: 25 }, { wch: 30 }, 
        { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, 
        { wch: 15 }, { wch: 15 }
    ];

    // 6. Stiahnutie
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `Adresar_obci_${selectedOkres}.xlsx`;
    
    XLSX.writeFile(workbook, fileName);
}