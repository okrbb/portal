# Migration: primátor → primator

## ⚠️ Problém
Firestore nemá oprávnenia na vzdialený prístup z webovej aplikácie. Migrácia musí byť spustená inak.

## ✅ Riešenie 1: Cloud Function (Odporúčané)

### Krok 1: Presunúť kód do Firebase Functions
Kód je v súbore: `firebase/functions/migrate.js`

### Krok 2: Deploynúť Cloud Function

```bash
# Inštalácia Firebase CLI (ak nemáš)
npm install -g firebase-tools

# Prihlásiť sa
firebase login

# Presunúť sa do Firebase adresára
cd firebase

# Deploy funkcií
firebase deploy --only functions
```

### Krok 3: Spustiť migráciu

Po deploymente pôjdi na:
1. Firebase Console: https://console.firebase.google.com
2. Vyber projekt: **okrbb-portal-prod**
3. Build > Functions
4. Nájdi: **migratePrimatorField**
5. Klikni na ju a vyberi "Testing" tab
6. Klikni "Execute"

Vidieť budeš logy migrácie v real-time.

---

## ✅ Riešenie 2: Firestore Console (Jednoduchšie)

Ak nemáš Firebase CLI, môžeš migráciu spustiť priamo v Firestore konzole:

1. Otvor Firebase Console
2. Firestore Database
3. Pre každý región (ZV, BS, BR, atď.):
   - Otvor region dokument
   - Otvor sub-kolekciu "municipalities"
   - Pre každú mestnosť:
     - Klikni na mestnosť
     - Ak má pole "primátor" (s dĺžňom):
       - Klikni na šípku vedľa poľa a zmazanú ho
       - Pridaj nové pole "primator" s tou istou hodnotou

---

## ✅ Riešenie 3: Firestore Security Rules (Ak máš admin prístup)

Upravť Firestore Security Rules aby umožnili prístup:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Čítanie a zápis do contacts zbierky
    match /contacts/{document=**} {
      allow read, write: if true; // DOČASNE - potom zmeniť na iPhoneAuthRequired
    }
  }
}
```

⚠️ **UPOZORNENIE**: Toto je veľmi permisívne. Po migrácii zmeň Security Rules späť na normálne nastavenia!

---

## Kontakt
Ak potrebuješ pomoc, kontaktuj administrátora Firebase projektu.
