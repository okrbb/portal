/* =================================== */
/* CENTRÁLNE RIADENIE PRÍSTUPOV        */
/* (accesses.js)                       */
/* =================================== */

export const ROLES = {
    VEDUCI_ODBORU: 'vedúci odboru',
    VEDUCI_ODDELENIA: 'vedúci oddelenia',
};

// --- Pomocné interné funkcie ---

const isVeduciOdboru = (user) => user?.funkcia?.toLowerCase() === ROLES.VEDUCI_ODBORU;
const isVeduciOddelenia = (user) => user?.funkcia?.toLowerCase() === ROLES.VEDUCI_ODDELENIA;

const isOwnProfile = (user, targetEmp) => {
    if (!user?.email || !targetEmp?.mail) return false;
    return user.email.toLowerCase() === targetEmp.mail.toLowerCase();
};

const isSameDepartment = (user, targetEmp) => {
    if (!user?.oddelenie || !targetEmp?.oddelenie) return false;
    return user.oddelenie === targetEmp.oddelenie;
};

// --- Verejný objekt s pravidlami ---

export const Permissions = {
    
    /**
     * Určuje, či má používateľ prístup k položke v menu (modulu).
     */
    canViewModule: (user, moduleId) => {
        if (!user) return false;
        
        if (isVeduciOdboru(user)) return true; 

        switch (moduleId) {
            case 'pohotovost-module':
                if (isVeduciOddelenia(user)) return true;
                if (user.kod === '28836' || user.id === '28836') return true;
                return false;

            case 'izs-module':
                if (user.kod === '28845' || user.id === '28845') return true;
                if (user.kod === '28852' || user.id === '28852') return true;
                return false;
            
            // --- AKTUALIZOVANÉ PRE BB KRAJ ---
            case 'bbk-module':
                // 1. Pôvodné výnimky (konkrétni ľudia)
                if (user.kod === '28845' || user.id === '28845') return true;
                if (user.kod === '28852' || user.id === '28852') return true;
                
                // 2. NOVÉ: Prístup pre všetkých operátorov linky 112
                if (user.funkcia && user.funkcia.toLowerCase().includes('operátor linky 112')) {
                    return true;
                }
                
                return false;
            // --------------------------------

            case 'ua-contributions-module':
                if (user.id === '28841' || user.kod === '28841') return true;
                return isVeduciOdboru(user);
            
            case 'cestovny-prikaz-module':
            case 'admin-panel-module':
            case 'dashboard-module':
                return true; 
                
            default:
                return true;
        }
    },

    /**
     * UPRAVENÁ FUNKCIA: Prijíma aj activeModuleId
     */
    canViewEmployeeList: (user, targetEmp, activeModuleId) => {
        if (!user || !targetEmp) return false;

        // 1. Vedúci odboru vidí vždy všetkých
        if (isVeduciOdboru(user)) return true;

        // 2. Každý vidí sám seba (vždy)
        if (isOwnProfile(user, targetEmp)) return true;

        // 3. Špeciálna logika pre zamestnanca 28852 (Silvia S.)
        if (user.id === '28852' || user.kod === '28852') {
            // Ak je práve v module Cestovný príkaz, vidí svoje oddelenie
            if (activeModuleId === 'cestovny-prikaz-module') {
                return isSameDepartment(user, targetEmp);
            }
            // Ak je v module Zamestnanci (alebo inde), vidí len seba (fallthrough na false)
            return false;
        }

        // 4. Vedúci oddelenia vidí svoje oddelenie
        if (isVeduciOddelenia(user) && isSameDepartment(user, targetEmp)) {
            return true;
        }

        return false;
    },

    /**
     * Určuje, či používateľ môže EDITOVAŤ údaje daného zamestnanca.
     */
    canEditEmployee: (user, targetEmp) => {
        if (!user || !targetEmp) return false;
        
        if (isVeduciOdboru(user)) return true;

        if (isVeduciOddelenia(user)) {
            if (!isSameDepartment(user, targetEmp)) return false;
            const targetFunkcia = targetEmp.funkcia?.toLowerCase();
            if (targetFunkcia === ROLES.VEDUCI_ODBORU || targetFunkcia === ROLES.VEDUCI_ODDELENIA) {
                return false; 
            }
            return true;
        }

        return false;
    },

    /**
     * Určuje, či používateľ môže PRIDAŤ nového zamestnanca.
     */
    canAddEmployee: (user) => {
        if (!user) return false;
        return isVeduciOdboru(user) || isVeduciOddelenia(user);
    },

    /**
     * Určuje, či používateľ môže VYMAZAŤ zamestnanca.
     */
    canDeleteEmployee: (user, targetEmp) => {
        if (!user) return false;
        return isVeduciOdboru(user);
    },

    /**
     * Určuje, či používateľ vidí detailné informácie a môže generovať CP.
     * Tu má 28852 stále prístup, aby mohol robiť CP.
     */
    canViewCP: (user, targetEmp) => {
        if (!user || !targetEmp) return false;
        
        // 1. Vedúci odboru vidí všetkých bez obmedzenia
        if (isVeduciOdboru(user)) return true;

        // 2. Každý vidí sám seba
        if (isOwnProfile(user, targetEmp)) return true;

        // 3. Vedúci oddelenia a špeciálny používateľ 28852 vidia iba svoje oddelenie
        const isSpecialUser = (user.id === '28852' || user.kod === '28852');
        
        if ((isVeduciOddelenia(user) || isSpecialUser) && isSameDepartment(user, targetEmp)) {
            return true;
        }
        
        return false;
    },

    /**
     * Určuje, či má používateľ právo na hromadný export (tlačidlo Excel).
     */
    canExportEmployees: (user) => {
        if (!user) return false;
        return isVeduciOdboru(user) || isVeduciOddelenia(user);
    },

    /**
     * Určuje, či používateľ môže spravovať logy (stiahnuť/zmazať).
     */
    canManageLogs: (user) => {
        if (!user) return false;
        return isVeduciOdboru(user);
    }
};