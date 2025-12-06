/* emp_module.js - Modular SDK Ready (No Firebase calls here) */
import { showToast, TOAST_TYPE } from './utils.js';
import { Permissions } from './accesses.js';

/* =================================== */
/* MODUL PRE DÁTA ZAMESTNANCOV A EXPORT */
/* (emp_module.js) - EXPORT ONLY       */
/* =================================== */

let _allEmployeesData = null;
let localActiveUser = null;

// --- Aktivácia exportu (volané z mainWizard.js) ---
export function activateGlobalExport(user, employeesData) {
    localActiveUser = user;
    _allEmployeesData = employeesData;

    const exportBtn = document.querySelector('#export-excel-btn');
    if (exportBtn) {
        // Clone node na odstránenie starých listenerov
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

// --- Funkcia exportu zamestnancov ---
function exportEmployeesToExcel() {
    // Kontrola oprávnenia
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
        // Úprava názvu oddelenia pre export
        const finalOddelenie = oddelenie.trim().toLowerCase() === 'odbor krízového riadenia' ? 'OKR' : oddelenie;
        
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

        XLSX.utils.book_append_sheet(wb, ws, "Zoznam zamestnancov");
        
        let filename = "zamestnanci";
        if (localActiveUser && localActiveUser.funkcia === 'vedúci odboru') filename += "_OKR";
        else if (localActiveUser && localActiveUser.funkcia === 'vedúci oddelenia') filename += "_" + (localActiveUser.oddelenie || 'X');
        filename += ".xlsx";

        XLSX.writeFile(wb, filename);
        showToast('Export bol úspešne vytvorený.', TOAST_TYPE.SUCCESS);

    } catch (error) {
        console.error('Chyba pri vytváraní XLSX súboru:', error);
        showToast('Nastala chyba pri vytváraní súboru.', TOAST_TYPE.ERROR);
    }
}

// --- Pomocná funkcia pre filtrovanie ---
function filterEmployeesForExport(allEmployeesArray) {
    if (!localActiveUser) return [];

    const isVeduciOdboru = localActiveUser.funkcia === 'vedúci odboru';
    const isVeduciOddelenia = localActiveUser.funkcia === 'vedúci oddelenia';

    let employeesToExport = [];

    if (isVeduciOdboru) {
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

    } else if (isVeduciOddelenia) {
        employeesToExport = allEmployeesArray.filter(emp => emp.oddelenie === localActiveUser.oddelenie);
        employeesToExport.sort((a, b) => {
            const isLeaderA = (a.funkcia || '').toLowerCase() === 'vedúci oddelenia';
            const isLeaderB = (b.funkcia || '').toLowerCase() === 'vedúci oddelenia';
            if (isLeaderA && !isLeaderB) return -1;
            if (!isLeaderA && isLeaderB) return 1;
            return (a.priezvisko || '').localeCompare(b.priezvisko || '', 'sk');
        });
    } else {
         employeesToExport = allEmployeesArray.filter(emp => emp.mail && emp.mail.toLowerCase() === localActiveUser.email.toLowerCase());
    }
    
    return employeesToExport;
}