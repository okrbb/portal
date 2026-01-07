/* js/restore_service.js - REFACTORED with new helpers */
import { store } from './store.js';
import { Timestamp } from 'firebase/firestore';

// ✅ NOVÉ: Import helpers
import { showToast, TOAST_TYPE, safeAsync } from './utils.js';
import { batchOperation } from './firebase_helpers.js';

/**
 * Hlavná funkcia na obnovu dát zo súboru.
 * ✅ OPTIMALIZOVANÉ: Použitie batchOperation namiesto manuálneho batch management
 */
export async function restoreCollectionFromFile(file) {
    const db = store.getDB();

    if (!file || !db) {
        if (!db) showToast("Chyba: Databáza nie je pripojená.", TOAST_TYPE.ERROR);
        return;
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
        await safeAsync(
            async () => {
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

                // ✅ NOVÉ: Pripravíme všetky operácie dopredu
                const operations = [];
                let subCollectionOps = 0;

                for (const docData of records) {
                    const docId = docData._id;
                    const { _id, refuelings_backup, km_logs_backup, ...dataToSave } = docData;

                    // Hlavný dokument
                    operations.push({
                        type: 'set',
                        collection: collectionName,
                        id: docId,
                        data: dataToSave
                    });

                    // Špeciálna logika pre Autá (Sub-kolekcie)
                    if (collectionName === 'cars') {
                        // Refuelings
                        if (Array.isArray(refuelings_backup)) {
                            for (const refuel of refuelings_backup) {
                                const { _id: rId, ...rData } = refuel;
                                operations.push({
                                    type: 'set',
                                    collection: `cars/${docId}/refuelings`,
                                    id: rId,
                                    data: rData
                                });
                                subCollectionOps++;
                            }
                        }
                        // KM Logs
                        if (Array.isArray(km_logs_backup)) {
                            for (const log of km_logs_backup) {
                                const { _id: lId, ...lData } = log;
                                operations.push({
                                    type: 'set',
                                    collection: `cars/${docId}/km_logs`,
                                    id: lId,
                                    data: lData
                                });
                                subCollectionOps++;
                            }
                        }
                    }
                }

                // ✅ NOVÉ: Použitie batchOperation helper s progress barom
                await batchOperation(operations, {
                    showProgress: true,
                    onProgress: (current, total) => {
                        console.log(`[Restore] Progress: ${current}/${total}`);
                    }
                });

                const successMsg = `Úspešne obnovené: ${collectionName} (${totalRecords} dok. + ${subCollectionOps} pod-dok.)`;
                showToast(successMsg, TOAST_TYPE.SUCCESS);
                console.log(`[Restore] Hotovo. ${successMsg}`);

                // Refresh employees ak potrebné
                if (collectionName === 'employees') {
                    store.loadEmployees(true);
                }
            },
            'Chyba importu dát'
        );
    };

    reader.readAsText(file);
}

/**
 * Pomocná funkcia pre JSON.parse.
 * Automaticky konvertuje ISO stringy dátumov späť na Firestore Timestamp.
 */
function dateReviver(key, value) {
    if (typeof value === 'string') {
        // Flexibilnejší regex pre ISO dátumy s voliteľnými desatinnými miestami
        const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
        if (isoDateRegex.test(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return Timestamp.fromDate(date);
            }
        }
    }
    return value;
}
