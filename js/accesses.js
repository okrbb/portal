/* =================================== */
/* CENTRÁLNE RIADENIE PRÍSTUPOV        */
/* (accesses.js) - RBAC Model          */
/* =================================== */

// Definícia rolí presne podľa vašej DB a Excelu
export const ROLES = {
    ADMIN: 'admin',
    MANAGER_1: 'manager_1',      // Vedúci OCOaKP
    MANAGER_2: 'manager_2',      // Vedúci KS IZS
    SUPER_USER_1: 'super_user_1', // Denis M.
    SUPER_USER_2: 'super_user_2', // Maroš P.
    SUPER_USER_IZS_1: 'super_user_IZS_1', // Silvia S.
    SUPER_USER_IZS_2: 'super_user_IZS_2', // Ján K.
    USER: 'user',
    USER_IZS: 'user_IZS'
};

// --- Pomocné interné funkcie ---

const hasRole = (user, ...allowedRoles) => {
    if (!user || !user.role) return false;
    return allowedRoles.includes(user.role);
};

const isOwnProfile = (user, targetEmp) => {
    if (!user?.email || !targetEmp?.mail) return false;
    return user.email.toLowerCase() === targetEmp.mail.toLowerCase();
};

const isDepartment = (targetEmp, deptName) => {
    return targetEmp?.oddelenie?.toLowerCase() === deptName.toLowerCase(); // Napr. 'ocoakp' alebo 'ks izs'
};

// --- Verejný objekt s pravidlami (Implementácia matice) ---

export const Permissions = {
    
    /**
     * Matica prístupov k modulom (Menu vľavo)
     */
    canViewModule: (user, moduleId) => {
        if (!user || !user.role) return false;

        // 1. Dashboard, Cestovný príkaz a AI vidia VŠETCI (A)
        if (moduleId === 'dashboard-module' || 
            moduleId === 'cestovny-prikaz-module' || 
            moduleId === 'ai-module') { 
            return true;
        }

        // 2. Ostatné moduly podľa matice
        switch (moduleId) {
            case 'pohotovost-module': // Rozpis pohotovosti
                return hasRole(user, 
                    ROLES.ADMIN, 
                    ROLES.MANAGER_1, 
                    ROLES.MANAGER_2, 
                    ROLES.SUPER_USER_1
                );

            case 'bbk-module': // Rozpis pohotovosti BB kraj
                return hasRole(user, 
                    ROLES.ADMIN, 
                    ROLES.MANAGER_1, 
                    ROLES.MANAGER_2, 
                    ROLES.SUPER_USER_IZS_1,
                    ROLES.USER_IZS 
                );

            case 'izs-module': // Rozpis služieb IZS
                return hasRole(user, 
                    ROLES.ADMIN, 
                    ROLES.MANAGER_2, 
                    ROLES.SUPER_USER_IZS_1,
                );

            case 'ua-contributions-module': // Príspevky UA
                return hasRole(user, 
                    ROLES.ADMIN, 
                    ROLES.SUPER_USER_2
                );
            
            case 'fuel-module': // Spotreba PHM
                return hasRole(user, 
                    ROLES.ADMIN, 
                    ROLES.MANAGER_1, 
                    ROLES.MANAGER_2, 
                    ROLES.SUPER_USER_1, 
                    ROLES.SUPER_USER_2,
                    ROLES.SUPER_USER_IZS_2,
                );
            
            // Logy nemajú vlastný modul v menu (sú v sidebare), ale kontrola je tu
            case 'logs-view': 
                return hasRole(user, ROLES.ADMIN);

            default:
                return false;
        }
    },

    /**
     * Zoznam zamestnancov (Pravý panel a Detail)
     */
    canViewEmployeeList: (user, targetEmp, activeModuleId) => {
        if (!user || !targetEmp) return false;

        // 1. Admin vidí všetkých
        if (hasRole(user, ROLES.ADMIN)) return true;

        // 2. Každý vidí sám seba (vždy a všade)
        if (isOwnProfile(user, targetEmp)) return true;

        // 3. Manager 1 vidí iba OCOaKP
        if (hasRole(user, ROLES.MANAGER_1)) {
            const oddelenie = targetEmp.oddelenie || '';
            return oddelenie.toLowerCase().includes('ocoakp');
        }

        // 4. Manager 2 vidí celé KS IZS (všetkých v IZS)
        if (hasRole(user, ROLES.MANAGER_2)) {
            const oddelenie = targetEmp.oddelenie || '';
            return oddelenie.toLowerCase().includes('izs');
        }

        // 5. Super User IZS 1 (Silvia S.) vidí IZS, ale NIE Managera 2
        if (hasRole(user, ROLES.SUPER_USER_IZS_1)) {
            const oddelenie = targetEmp.oddelenie || '';
            const isIZS = oddelenie.toLowerCase().includes('izs');
            
            const isTargetManager = targetEmp.role === ROLES.MANAGER_2;

            return isIZS && !isTargetManager;
        }

        return false;
    },

    /**
     * Detailné zobrazenie a práca s CP (Cestovný príkaz)
     */
    canViewCP: (user, targetEmp) => {
        return Permissions.canViewEmployeeList(user, targetEmp, 'cestovny-prikaz-module');
    },

    /**
     * Stĺpec: "Zoznam zamestnancov (download)" -> Tlačidlo Export Excel
     */
    canExportEmployees: (user) => {
        if (!user) return false;
        return hasRole(user, ROLES.ADMIN, ROLES.MANAGER_1, ROLES.MANAGER_2);
    },

    /**
     * Stĺpec: "Logy"
     */
    canManageLogs: (user) => {
        return hasRole(user, ROLES.ADMIN);
    },

    /**
     * Stĺpec: "Nástenka (pridávať oznámenia)"
     */
    canManageAnnouncements: (user) => {
        return hasRole(user, 
            ROLES.ADMIN, 
            ROLES.MANAGER_1, 
            ROLES.MANAGER_2
        );
    },

    /**
     * NOVÉ: Práva na zápis/editáciu v module PHM pre konkrétne vozidlo
     * @param {Object} user - Aktívny používateľ
     * @param {string} evidenceNumber - EČV vozidla (napr. BB215GN)
     */
    canEditFuelRecord: (user, evidenceNumber) => {
        if (!user) return false;
        
        // Admin má plný prístup všade
        if (hasRole(user, ROLES.ADMIN)) return true;

        // Manageri majú iba Read-Only (prezerať áno, editovať nie)
        if (hasRole(user, ROLES.MANAGER_1, ROLES.MANAGER_2)) return false;

        // Normalizácia EČV (odstránenie medzier a pomlčiek pre istotu)
        const targetEcV = (evidenceNumber || '').replace(/[\s-]/g, '').toUpperCase();

        // Super User 1 -> iba AA713BJ
        if (hasRole(user, ROLES.SUPER_USER_1) && targetEcV === 'B82475') return true;

        // Super User 2 -> iba BB215GN
        if (hasRole(user, ROLES.SUPER_USER_2) && targetEcV === 'B45539') return true;

        // Super User IZS 2 -> iba AA362IM
        if (hasRole(user, ROLES.SUPER_USER_IZS_2) && targetEcV === 'B83354') return true;

        // Všetci ostatní nemôžu editovať
        return false;
    }
};