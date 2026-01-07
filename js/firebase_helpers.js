/* js/firebase_helpers.js - Univerzálne Firebase utility funkcie */
import { 
    collection, 
    query, 
    orderBy, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    where, 
    limit,
    writeBatch,
    serverTimestamp 
} from 'firebase/firestore';
import { store } from './store.js';
import { showToast, TOAST_TYPE } from './utils.js';

/**
 * Univerzálna funkcia na načítanie dokumentov s flexibilnými parametrami
 * @param {string} collectionName - Názov kolekcie
 * @param {Object} options - Konfigurácia query
 * @returns {Promise<Array>} Pole dokumentov s ID
 */
export async function fetchCollection(collectionName, options = {}) {
    const db = store.getDB();
    if (!db) throw new Error('Database not initialized');
    
    const { 
        orderByField = null, 
        orderDirection = 'asc',
        limitCount = null,
        whereConditions = [] // [{field, operator, value}]
    } = options;
    
    let q = collection(db, collectionName);
    
    // Aplikovanie where podmienok
    whereConditions.forEach(condition => {
        q = query(q, where(condition.field, condition.operator, condition.value));
    });
    
    // Aplikovanie orderBy
    if (orderByField) {
        q = query(q, orderBy(orderByField, orderDirection));
    }
    
    // Aplikovanie limitu
    if (limitCount) {
        q = query(q, limit(limitCount));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ 
        id: docSnap.id, 
        ...docSnap.data() 
    }));
}

/**
 * Univerzálne pridanie dokumentu s automatickým timestampom
 * @param {string} collectionName - Názov kolekcie
 * @param {Object} data - Dáta na uloženie
 * @param {boolean} addTimestamp - Či pridať timestamp
 * @returns {Promise<string>} ID nového dokumentu
 */
export async function addDocument(collectionName, data, addTimestamp = true) {
    const db = store.getDB();
    if (!db) throw new Error('Database not initialized');
    
    const finalData = addTimestamp 
        ? { ...data, timestamp: serverTimestamp() }
        : data;
    
    const docRef = await addDoc(collection(db, collectionName), finalData);
    return docRef.id;
}

/**
 * Univerzálna aktualizácia dokumentu
 * @param {string} collectionName - Názov kolekcie
 * @param {string} docId - ID dokumentu
 * @param {Object} data - Dáta na update
 * @param {boolean} addUpdatedAt - Či pridať updatedAt timestamp
 */
export async function updateDocument(collectionName, docId, data, addUpdatedAt = false) {
    const db = store.getDB();
    if (!db) throw new Error('Database not initialized');
    
    const finalData = addUpdatedAt
        ? { ...data, updatedAt: serverTimestamp() }
        : data;
    
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, finalData);
}

/**
 * Univerzálne vymazanie dokumentu
 * @param {string} collectionName - Názov kolekcie
 * @param {string} docId - ID dokumentu
 */
export async function deleteDocument(collectionName, docId) {
    const db = store.getDB();
    if (!db) throw new Error('Database not initialized');
    
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
}

/**
 * Batch operácie - univerzálny helper pre hromadné akcie
 * @param {Array} operations - Pole operácií [{type, collection, id, data}]
 * @param {Object} options - Konfigurácia
 */
export async function batchOperation(operations, options = {}) {
    const db = store.getDB();
    if (!db) throw new Error('Database not initialized');
    
    const { 
        batchSize = 450,
        showProgress = false,
        onProgress = null
    } = options;
    
    let batch = writeBatch(db);
    let opCount = 0;
    let totalProcessed = 0;
    
    for (const op of operations) {
        const docRef = doc(db, op.collection, op.id);
        
        switch (op.type) {
            case 'set':
                batch.set(docRef, op.data);
                break;
            case 'update':
                batch.update(docRef, op.data);
                break;
            case 'delete':
                batch.delete(docRef);
                break;
            default:
                console.warn(`Unknown batch operation type: ${op.type}`);
                continue;
        }
        
        opCount++;
        totalProcessed++;
        
        // Commit keď dosiahneme limit
        if (opCount >= batchSize) {
            await batch.commit();
            
            if (showProgress) {
                showToast(`Spracovaných: ${totalProcessed}/${operations.length}`, TOAST_TYPE.INFO, 1500);
            }
            
            if (onProgress) {
                onProgress(totalProcessed, operations.length);
            }
            
            // Reset batch
            batch = writeBatch(db);
            opCount = 0;
        }
    }
    
    // Commit zvyšných operácií
    if (opCount > 0) {
        await batch.commit();
    }
    
    return totalProcessed;
}

/**
 * Pomocná funkcia pre získanie posledných N záznamov
 * @param {string} collectionName - Názov kolekcie
 * @param {number} count - Počet záznamov
 * @param {string} orderField - Pole pre triedenie (default: timestamp)
 */
export async function fetchLatest(collectionName, count = 10, orderField = 'timestamp') {
    return fetchCollection(collectionName, {
        orderByField: orderField,
        orderDirection: 'desc',
        limitCount: count
    });
}

/**
 * Pomocná funkcia pre vyhľadanie jedného dokumentu podľa podmienky
 * @param {string} collectionName - Názov kolekcie
 * @param {string} field - Pole na vyhľadávanie
 * @param {any} value - Hodnota
 */
export async function findOne(collectionName, field, value) {
    const results = await fetchCollection(collectionName, {
        whereConditions: [{ field, operator: '==', value }],
        limitCount: 1
    });
    
    return results.length > 0 ? results[0] : null;
}

/**
 * Helper pre delete všetkých dokumentov kolekcie (POZOR!)
 * Používať len pre cleanup/testing
 */
export async function clearCollection(collectionName, confirmText = null) {
    if (confirmText !== `DELETE_ALL_${collectionName}`) {
        throw new Error('Confirmation text required for safety');
    }
    
    const db = store.getDB();
    if (!db) throw new Error('Database not initialized');
    
    const snapshot = await getDocs(collection(db, collectionName));
    const operations = snapshot.docs.map(docSnap => ({
        type: 'delete',
        collection: collectionName,
        id: docSnap.id
    }));
    
    return batchOperation(operations);
}
