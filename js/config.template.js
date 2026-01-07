/* js/config.js - Opravená verzia s importom */
import { initializeApp } from 'firebase/app';
// 👇 OPRAVENÝ IMPORT
import { 
    getFirestore, 
    enableIndexedDbPersistence, 
    CACHE_SIZE_UNLIMITED 
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const firebaseConfig = {
    apiKey: "FIREBASE_API_KEY_PLACEHOLDER",
    authDomain: "FIREBASE_AUTH_DOMAIN_PLACEHOLDER",
    projectId: "FIREBASE_PROJECT_ID_PLACEHOLDER",
    storageBucket: "FIREBASE_STORAGE_BUCKET_PLACEHOLDER",
    messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER",
    appId: "FIREBASE_APP_ID_PLACEHOLDER"
};

// Inicializácia aplikácie
const app = initializeApp(firebaseConfig);

// Inicializácia služieb
export const db = getFirestore(app);
export const auth = getAuth(app);

// === OPTIMALIZÁCIA: Zapnutie Offline Cache (šetrí čítania) ===
// Toto zabezpečí, že dáta sa načítajú z lokálneho disku, ak sa nezmenili.
enableIndexedDbPersistence(db, { forceOwnership: true })
    .then(() => {
        console.log('[Persistence] Offline cache bola úspešne aktivovaná.');
    })
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('[Persistence] Viacero otvorených tabov blokuje cache.');
        } else if (err.code == 'unimplemented') {
            console.warn('[Persistence] Prehliadač nepodporuje offline cache.');
        }
    });

export const AI_CONFIG = {
    API_KEY: "GEMINI_API_KEY_PLACEHOLDER", 
    MODEL_NAME: "gemini-2.0-flash",
    GROQ_API_KEY: "GROQ_API_KEY_PLACEHOLDER",
    GROQ_MODEL: "llama-3.1-8b-instant"
};

// === Konštanty pre utils.js ===
export const APP_CONSTANTS = {
    TOAST_DURATION: 3000,
    SEARCH_DEBOUNCE_MS: 300,
    DEFAULT_AVATAR: '--'
};