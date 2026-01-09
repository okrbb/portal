/**
 * MIGRATION HELPER: Premenovať pole primátor -> primator v Firebase contacts
 * 
 * Spustenie v konzole:
 * 1. Otvor DevTools (F12)
 * 2. Choď na Console
 * 3. Skopíruj a vlož tento kód:
 * 
 * import { renamePrimatorField } from './js/migration_rename_primator.js';
 * await renamePrimatorField();
 */

import { db } from './db_service.js';
import { collection, getDocs, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export async function renamePrimatorField() {
    console.log('🔄 Spúšťam migráciu: primátor → primator');
    
    try {
        const contactsRef = collection(db, 'contacts');
        const querySnapshot = await getDocs(contactsRef);
        
        let processedCount = 0;
        let changedCount = 0;
        
        for (const docSnapshot of querySnapshot.docs) {
            const regionId = docSnapshot.id;
            const regionData = docSnapshot.data();
            
            if (regionData.municipalities && Array.isArray(regionData.municipalities)) {
                let hasChanges = false;
                
                regionData.municipalities.forEach(municipality => {
                    // Ak má pole 'primátor' (s dĺžňom)
                    if (municipality.hasOwnProperty('primátor')) {
                        const value = municipality['primátor'];
                        delete municipality['primátor'];
                        municipality['primator'] = value;
                        hasChanges = true;
                        changedCount++;
                        console.log(`✓ ${regionId}: ${municipality.id} → pole preimenované`);
                    }
                });
                
                // Ulož zmeny
                if (hasChanges) {
                    await updateDoc(doc(db, 'contacts', regionId), {
                        municipalities: regionData.municipalities
                    });
                    console.log(`✅ ${regionId} uložené`);
                }
            }
            
            processedCount++;
        }
        
        console.log(`\n✅ MIGRÁCIA DOKONČENÁ`);
        console.log(`📊 Spracovaných oblastí: ${processedCount}`);
        console.log(`🔄 Zmenených záznamov: ${changedCount}`);
        
    } catch (error) {
        console.error('❌ Chyba pri migrácii:', error);
    }
}
