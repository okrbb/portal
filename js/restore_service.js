/* js/restore_service.js - Modular SDK v9+ (Store Integrated) */
import { store } from './store.js'; // CENTRÁLNY STORE
import { doc, setDoc, writeBatch, Timestamp, collection } from 'firebase/firestore';
import { showToast, TOAST_TYPE } from './utils.js';

/**
 * Hlavná funkcia na obnovu dát zo súboru.
 * @param {File} file - JSON súbor vybraný používateľom
 */
export async function restoreCollectionFromFile(file) {
    const db = store.getDB();

    if (!file || !db) {
        if (!db) showToast("Chyba: Databáza nie je pripojená.", TOAST_TYPE.ERROR);
        return;
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            // 1. Parsovanie JSONu s automatickou konverziou dátumov
            const jsonContent = JSON.parse(e.target.result, dateReviver);
            
            // Základná validácia
            if (!jsonContent.collection || !Array.isArray(jsonContent.data)) {
                throw new Error("Neplatný formát zálohy (chýba 'collection' alebo 'data').");
            }

            const collectionName = jsonContent.collection;
            const records = jsonContent.data;
            const totalRecords = records.length;

            if (!confirm(`Chcete obnoviť kolekciu "${collectionName}"?\nPočet záznamov: ${totalRecords}\n\nPOZOR: Existujúce záznamy s rovnakým ID budú prepísané!`)) {
                return;
            }

            showToast(`Začínam import do: ${collectionName}...`, TOAST_TYPE.INFO);
            console.log(`[Restore] Začínam import ${totalRecords} záznamov do ${collectionName}`);

            // 2. Dávkové spracovanie (Batching) - max 500 operácií na batch
            const BATCH_SIZE = 450; 
            let batch = writeBatch(db);
            let operationCount = 0;
            let subCollectionOps = 0;

            for (const docData of records) {
                const docId = docData._id; // Získame ID
                
                // Odstránime _id z dát, aby sa neuložilo ako pole do dokumentu
                const { _id, refuelings_backup, km_logs_backup, ...dataToSave } = docData;

                const docRef = doc(db, collectionName, docId);
                batch.set(docRef, dataToSave);
                operationCount++;

                // 2.1 Špeciálna logika pre Autá (Sub-kolekcie)
                if (collectionName === 'cars') {
                    // Obnova Refuelings
                    if (Array.isArray(refuelings_backup)) {
                        for (const refuel of refuelings_backup) {
                            const { _id: rId, ...rData } = refuel;
                            const subRef = doc(db, 'cars', docId, 'refuelings', rId);
                            batch.set(subRef, rData);
                            operationCount++;
                            subCollectionOps++;
                        }
                    }
                    // Obnova KM Logs
                    if (Array.isArray(km_logs_backup)) {
                        for (const log of km_logs_backup) {
                            const { _id: lId, ...lData } = log;
                            const subRef = doc(db, 'cars', docId, 'km_logs', lId);
                            batch.set(subRef, lData);
                            operationCount++;
                            subCollectionOps++;
                        }
                    }
                }

                // Ak batch dosiahne limit, odošleme ho a vytvoríme nový
                if (operationCount >= BATCH_SIZE) {
                    await batch.commit();
                    console.log(`[Restore] Odoslaný batch (${operationCount} operácií).`);
                    batch = writeBatch(db);
                    operationCount = 0;
                }
            }

            // Odoslanie zvyšku
            if (operationCount > 0) {
                await batch.commit();
            }

            const successMsg = `Úspešne obnovené: ${collectionName} (${totalRecords} dok. + ${subCollectionOps} pod-dok.)`;
            showToast(successMsg, TOAST_TYPE.SUCCESS);
            console.log(`[Restore] Hotovo. ${successMsg}`);

            // Ak sme obnovili zamestnancov, môžeme (voliteľne) požiadať store o refresh
            if (collectionName === 'employees') {
                store.loadEmployees(true); // Vynútený refresh
            }

        } catch (error) {
            console.error("[Restore] Chyba:", error);
            showToast(`Chyba importu: ${error.message}`, TOAST_TYPE.ERROR);
        }
    };

    reader.readAsText(file);
}

/**
 * Pomocná funkcia pre JSON.parse.
 * Automaticky konvertuje ISO stringy dátumov späť na Firestore Timestamp.
 */
function dateReviver(key, value) {
    if (typeof value === 'string') {
        // Regex pre ISO 8601 dátum (napr. 2023-10-27T10:00:00.000Z)
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
        if (isoDateRegex.test(value)) {
            const date = new Date(value);
            return Timestamp.fromDate(date);
        }
    }
    return value;
}