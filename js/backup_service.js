/* js/backup_service.js - FIXED VERSION */
import { store } from './store.js'; 
import { collection, getDocs } from 'firebase/firestore';
import { showToast, TOAST_TYPE } from './utils.js';
import { lazyLoader } from './lazy_loader.js'; 

const COLLECTIONS_TO_BACKUP = [
    'cars',   
    'contacts',  
    'dietary',
    'employees',    
    'payments',   
    'publishedSchedules',   
    'publishedSchedulesIZS',
    'towns_em',             
    'user_roles'        
];

/**
 * Vykoná kompletnú zálohu všetkých definovaných kolekcií do jedného ZIP súboru.
 */
export async function performFullBackup() {
    const db = store.getDB();

    if (!db) {
        showToast("Chyba: Databáza nie je pripojená.", TOAST_TYPE.ERROR);
        return;
    }

        try {
        showToast("Pripravujem prostredie a knižnice...", TOAST_TYPE.INFO);
        
        await Promise.all([
            lazyLoader.loadFileSaver(),
            lazyLoader.loadScript('JSZip', 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', () => window.JSZip)
        ]);

        const zip = new window.JSZip();
        const dateStr = new Date().toLocaleDateString('sk-SK');

        for (const collectionName of COLLECTIONS_TO_BACKUP) {
            let allData = [];

            // ŠPECIÁLNY PRÍPAD PRE KONTAKTY (kvôli hlbokej štruktúre)
            if (collectionName === 'contacts') {
                const okresy = ["BB", "BS", "BR", "DT", "KA", "LC", "PT", "RA", "RS", "VK", "ZV", "ZC", "ZH"];
                console.log("[Backup] Zálohujem hlbokú štruktúru pre contacts...");
                
                for (const okresId of okresy) {
                    // Pristupujeme k ceste contacts/{okresId}/{okresId}
                    const subSnap = await getDocs(collection(db, 'contacts', okresId, okresId));
                    subSnap.forEach(docSnap => {
                        allData.push({ 
                            id: docSnap.id, 
                            _okresContext: okresId, // Pomocný príznak pre budúci restore
                            ...docSnap.data() 
                        });
                    });
                }
            } else {
                // KLASICKÝ POSTUP PRE OSTATNÉ KOLEKCIE
                console.log(`[Backup] Zálohujem: ${collectionName}`);
                const querySnapshot = await getDocs(collection(db, collectionName));
                querySnapshot.forEach(docSnap => {
                    allData.push({ id: docSnap.id, ...docSnap.data() });
                });
            }

            const jsonString = JSON.stringify({
                collection: collectionName,
                backupDate: new Date().toISOString(),
                count: allData.length,
                data: convertTimestamps(allData)
            }, null, 2);

            zip.file(`${collectionName}_${dateStr.replace(/\./g, '_')}.json`, jsonString);
        }

        showToast("Generujem archív (ZIP)...", TOAST_TYPE.INFO);
        
        // Vygenerovanie finálneho ZIP súboru
        const zipBlob = await zip.generateAsync({ type: "blob" });
        saveAs(zipBlob, `OKR_Portal_Zaloha_${dateStr.replace(/\./g, '_')}.zip`);

        showToast(`Záloha všetkých kolekcií bola úspešne stiahnutá.`, TOAST_TYPE.SUCCESS);

    } catch (error) {
        console.error("[Backup] Kritická chyba:", error);
        showToast(`Zálohovanie zlyhalo: ${error.message}`, TOAST_TYPE.ERROR);
    }
}

/**
 * Pomocná funkcia na konverziu Firestore Timestampov na ISO stringy.
 * Funguje rekurzívne pre polia aj vnorené objekty.
 */
function convertTimestamps(obj) {
    if (obj === null || typeof obj !== 'object') return obj;

    // Detekcia Firestore Timestampu (obsahuje seconds a nanoseconds)
    if (obj.seconds !== undefined && obj.nanoseconds !== undefined) {
        const milliseconds = obj.seconds * 1000 + obj.nanoseconds / 1000000;
        return new Date(milliseconds).toISOString();
    }

    if (Array.isArray(obj)) {
        return obj.map(item => convertTimestamps(item));
    }

    const result = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = convertTimestamps(obj[key]);
        }
    }
    return result;
}