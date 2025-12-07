/* js/backup_service.js - Modular SDK v9+ (Samostatné súbory) */
import { collection, getDocs } from 'firebase/firestore';
import { showToast, TOAST_TYPE } from './utils.js';

// Zoznam kolekcií, ktoré chceme zálohovať (Bez 'announcements')
const COLLECTIONS_TO_BACKUP = [
    'employees',            // Zamestnanci
    'publishedSchedules',   // Rozpisy pohotovosti
    'publishedSchedulesIZS',// Rozpisy IZS
    'cars',                 // Autá a PHM
    'dietary',              // Stravné jednotky
    'payments',             // Platové triedy
    'towns_em',             // E-maily obcí
    'user_roles'            // Role používateľov
];

/**
 * Spustí proces zálohovania (každá kolekcia = 1 súbor).
 * @param {Object} db - Inštancia Firestore
 */
export async function performFullBackup(db) {
    if (!db) {
        showToast("Chyba: Databáza nie je pripojená.", TOAST_TYPE.ERROR);
        return;
    }

    if (typeof saveAs === 'undefined') {
        showToast("Chyba: Knižnica FileSaver.js (saveAs) chýba.", TOAST_TYPE.ERROR);
        return;
    }

    showToast("Začínam sťahovať kolekcie...", TOAST_TYPE.INFO);
    console.log("[Backup] Začiatok sťahovania po súboroch.");

    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0]; // YYYY-MM-DD

    try {
        // Prejdeme všetky definované kolekcie a každú spracujeme a stiahneme zvlášť
        for (const collectionName of COLLECTIONS_TO_BACKUP) {
            console.log(`[Backup] Sťahujem kolekciu: ${collectionName}...`);
            
            const colRef = collection(db, collectionName);
            const snapshot = await getDocs(colRef);
            
            const records = [];
            snapshot.forEach(doc => {
                const rawData = doc.data();
                const cleanData = convertTimestamps(rawData);
                records.push({ _id: doc.id, ...cleanData });
            });

            // Špeciálna logika pre Autá (sub-kolekcie pribalíme do cars.json)
            if (collectionName === 'cars') {
                console.log(`[Backup] Sťahujem sub-kolekcie pre vozidlá...`);
                for (const car of records) {
                    const carId = car._id;
                    
                    // 1. Refuelings
                    const refuelSnap = await getDocs(collection(db, 'cars', carId, 'refuelings'));
                    car.refuelings_backup = refuelSnap.docs.map(d => ({ _id: d.id, ...convertTimestamps(d.data()) }));

                    // 2. Km Logs
                    const kmSnap = await getDocs(collection(db, 'cars', carId, 'km_logs'));
                    car.km_logs_backup = kmSnap.docs.map(d => ({ _id: d.id, ...convertTimestamps(d.data()) }));
                }
            }

            // Vytvorenie štruktúry pre jeden súbor
            const fileData = {
                collection: collectionName,
                meta: {
                    timestamp: timestamp,
                    generatedBy: "OKR Portal Client",
                    count: records.length
                },
                data: records
            };

            // Uloženie súboru
            const jsonString = JSON.stringify(fileData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
            const fileName = `${collectionName}_${dateStr}.json`;

            saveAs(blob, fileName);
            
            // Malá pauza, aby prehliadač stihol spracovať downloady a nezablokoval ich ako spam
            await new Promise(r => setTimeout(r, 200));
        }

        showToast(`Všetky vybrané kolekcie boli odoslané na stiahnutie.`, TOAST_TYPE.SUCCESS);
        console.log("[Backup] Hotovo.");

    } catch (error) {
        console.error("[Backup] Chyba:", error);
        showToast(`Zálohovanie zlyhalo: ${error.message}`, TOAST_TYPE.ERROR);
    }
}

// Rekurzívna konverzia Timestampov na stringy
function convertTimestamps(obj) {
    if (obj === null || typeof obj !== 'object') return obj;

    if (obj.seconds !== undefined && obj.nanoseconds !== undefined) {
        const milliseconds = obj.seconds * 1000 + obj.nanoseconds / 1000000;
        return new Date(milliseconds).toISOString();
    }

    if (Array.isArray(obj)) {
        return obj.map(item => convertTimestamps(item));
    }

    const newObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = convertTimestamps(obj[key]);
        }
    }
    return newObj;
}