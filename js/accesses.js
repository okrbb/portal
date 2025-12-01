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
    SUPER_USER_IZS: 'super_user_IZS', // Silvia S.
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
            moduleId === 'ai-module') { // AI zatiaľ nie je v menu ako ID, ale pre istotu
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
                    ROLES.SUPER_USER_IZS,
                    ROLES.USER_IZS // Aj bežný user_IZS má tu 'A'
                );

            case 'izs-module': // Rozpis služieb IZS
                return hasRole(user, 
                    ROLES.ADMIN, 
                    ROLES.MANAGER_2, 
                    ROLES.SUPER_USER_IZS
                );

            case 'ua-contributions-module': // Príspevky UA
                return hasRole(user, 
                    ROLES.ADMIN, 
                    ROLES.SUPER_USER_2
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
     * Rieši stĺpec: "Zoznam zamestnancov (zobrazenie zoznamu kliknutím na ikonu)"
     */
    canViewEmployeeList: (user, targetEmp, activeModuleId) => {
        if (!user || !targetEmp) return false;

        // 1. Admin vidí všetkých
        if (hasRole(user, ROLES.ADMIN)) return true;

        // 2. Každý vidí sám seba (vždy a všade)
        if (isOwnProfile(user, targetEmp)) return true;

        // 3. Manager 1 vidí iba OCOaKP
        if (hasRole(user, ROLES.MANAGER_1)) {
            // Predpokladáme, že v DB je oddelenie uložené ako 'OCOaKP' alebo podobne
            // Ak nemáte v targetEmp presný názov oddelenia, treba upraviť logiku
            // Tu kontrolujeme, či targetEmp patrí pod OCOaKP
            const oddelenie = targetEmp.oddelenie || '';
            return oddelenie.toLowerCase().includes('ocoakp');
        }

        // 4. Manager 2 vidí iba KS IZS
        if (hasRole(user, ROLES.MANAGER_2)) {
            const oddelenie = targetEmp.oddelenie || '';
            return oddelenie.toLowerCase().includes('izs');
        }

        // 5. Ostatní (User, Super Users, User IZS) vidia iba seba
        // (Podmienka "iba seba" je už splnená v bode 2, takže tu vraciame false)
        return false;
    },

    /**
     * Detailné zobrazenie a práca s CP (Cestovný príkaz)
     * Väčšinou kopíruje logiku zoznamu zamestnancov.
     */
    canViewCP: (user, targetEmp) => {
        // Použijeme rovnakú logiku ako pre zoznam
        return Permissions.canViewEmployeeList(user, targetEmp, 'cestovny-prikaz-module');
    },

    /**
     * Stĺpec: "Zoznam zamestnancov (download)" -> Tlačidlo Export Excel
     */
    canExportEmployees: (user) => {
        if (!user) return false;
        // Podľa matice majú 'A' (resp. čiastočné A) iba Admin a Manageri
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
    }
};