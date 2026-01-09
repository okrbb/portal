/* js/staff_import_helper.js - Helper na import personálu do contacts kolekcie */

import { store } from './store.js';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { showToast, TOAST_TYPE } from './utils.js';

/**
 * Importuje personál z staff_import.json do Firebase contacts kolekcie
 * Pridáva pole "staff" do každého dokumentu podľa okresu (ID)
 * 
 * Použitie:
 * 1. Spusti: await importStaffToContacts()
 * 2. Alebo z konzoly: importStaffToContacts()
 */

export async function importStaffToContacts() {
    try {
        console.log('📥 Začínam import personálu do contacts...');
        
        // Prečítaj JSON súbor
        const response = await fetch('./staff_import.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const importData = await response.json();
        const staffByRegion = importData.regions;
        
        console.log(`📊 Nájdených ${Object.keys(staffByRegion).length} okresov`);
        
        const db = store.getDB();
        if (!db) throw new Error('Database not initialized');
        
        // Imporuj jednotlivé okresy
        let successCount = 0;
        let failCount = 0;
        
        for (const [regionId, staffArray] of Object.entries(staffByRegion)) {
            try {
                const docRef = doc(db, 'contacts', regionId);
                
                // Použiteme setDoc s merge: true - vytvorí dokument ak neexistuje, alebo aktualizuje ak existuje
                await setDoc(docRef, {
                    id: regionId,
                    staff: staffArray,
                    staffImportedAt: new Date().toISOString(),
                    staffCount: staffArray.length,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                
                console.log(`✅ ${regionId}: ${staffArray.length} osôb importovaných`);
                successCount++;
            } catch (error) {
                console.error(`❌ Chyba pri ${regionId}:`, error);
                failCount++;
            }
        }
        
        // Výsledok
        console.log('');
        console.log('=== VÝSLEDOK IMPORTU ===');
        console.log(`✅ Úspešne: ${successCount}`);
        console.log(`❌ Chýb: ${failCount}`);
        console.log(`📈 Spolu: ${successCount + failCount}`);
        
        showToast(`Import personálu hotový! Úspešne: ${successCount}`, TOAST_TYPE.SUCCESS);
        
        return { successCount, failCount };
        
    } catch (error) {
        console.error('❌ Kritická chyba pri importe:', error);
        showToast('Chyba pri importe personálu!', TOAST_TYPE.ERROR);
        throw error;
    }
}

/**
 * Skontroluje stav importu - vypíše koľko okresov má staff pole
 */
export async function checkStaffImportStatus() {
    try {
        const db = store.getDB();
        if (!db) throw new Error('Database not initialized');
        
        const collectionRef = collection(db, 'contacts');
        const q = query(collectionRef, where('staff', '!=', null));
        const snapshot = await getDocs(q);
        
        console.log(`Obdoby s personálom: ${snapshot.docs.length}`);
        snapshot.docs.forEach(docSnap => {
            const staff = docSnap.data().staff || [];
            console.log(`  - ${docSnap.id}: ${staff.length} osôb`);
        });
        
        return snapshot.docs.length;
    } catch (error) {
        console.error('Chyba pri kontrole:', error);
    }
}

/**
 * Vymaže import personálu (backup)
 */
export async function removeStaffFromContacts(regionId) {
    try {
        const db = store.getDB();
        if (!db) throw new Error('Database not initialized');
        
        const docRef = doc(db, 'contacts', regionId);
        await setDoc(docRef, {
            staff: null,
            staffImportedAt: null,
            staffCount: null,
            updatedAt: serverTimestamp()
        }, { merge: true });
        
        console.log(`✅ Personál odstránený z ${regionId}`);
    } catch (error) {
        console.error('❌ Chyba pri odstránení:', error);
    }
}

// Export na globálny scope ak potrebuješ
if (typeof window !== 'undefined') {
    window.importStaffToContacts = importStaffToContacts;
    window.checkStaffImportStatus = checkStaffImportStatus;
    window.removeStaffFromContacts = removeStaffFromContacts;
}
