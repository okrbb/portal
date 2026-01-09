/**
 * MIGRATION HELPER: Premenovať pole primátor -> primator v Firebase contacts
 * 
 * Spustenie v konzole:
 * 1. Otvor DevTools (F12)
 * 2. Choď na Console
 * 3. Vlož tento kód (bez import - priamo v konzole):

async function renamePrimatorField() {
    console.log('🔄 Spúšťam migráciu: primátor → primator');
    
    try {
        // Predpokladáme, že db je už dostupný globálne
        if (!window.db) {
            console.error('❌ Firebase db nie je dostupný. Skontroluj, či je aplikácia načítaná.');
            return;
        }
        
        const { collection, getDocs, updateDoc, doc } = window.firebase.firestore;
        
        const contactsRef = collection(window.db, 'contacts');
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
                    await updateDoc(doc(window.db, 'contacts', regionId), {
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

// Spustenie
renamePrimatorField();

 */

// Export ako funkcia pre prípadný budúci modul import
export async function renamePrimatorField() {
    console.log('❌ Prosím spusti kód priamo v DevTools konzole (F12)');
}
