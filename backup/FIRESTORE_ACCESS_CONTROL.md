# Firestore Prístupová Kontrola - Detailný Prehľad

**Aktualizácia:** 2026-01-05

---

## 📋 Tabuľka Rolí a Prístupov

| Kolekcia | Admin | Manager 1 | Manager 2 | Super User 1 | Super User 2 | Super User IZS 1 | Super User IZS 2 | Bežný User |
|----------|-------|-----------|-----------|--------------|--------------|------------------|------------------|-----------|
| user_roles | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R |
| access_logs | ✅ R/W | ❌ R | ❌ R | - | - | - | - | ✅ W |
| performance_logs | ✅ R/W | ✅ R | ✅ R | - | - | - | - | ❌ |
| error_logs | ✅ R/W | ❌ R | ❌ R | - | - | - | - | ❌ |
| publishedSchedules | ✅ R/W | ✅ R/W | ✅ R/W | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R |
| publishedSchedulesIZS | ✅ R/C/U | ✅ R/C/U | ✅ R/C/U | ❌ R | ❌ R | ✅ R/C/U | ❌ R | ✅ Delete |
| announcements | ✅ R/W | ✅ R/W | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R |
| towns_em | ✅ R/W | ❌ | ❌ | ❌ | ✅ R | ❌ | ❌ | ❌ |
| employees | ✅ R/W | ✅ R/W | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R | ✅ R / W (own) |
| vacationStats | ✅ R/W | ✅ R/W | ✅ R/W | ❌ | ❌ | ✅ R/W | ❌ | ✅ R / W (own) |
| vacationRequests | ✅ R/W | ✅ R/W | ✅ R/W | ❌ | ❌ | ✅ R/W | ❌ | ✅ R / W (own) |
| dietary | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R |
| knowledge_base | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R |
| settings | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R |
| payments | ✅ R/W | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| cars | ✅ R/W | ✅ R | ✅ R | ✅ R (B82475) | ✅ R (B45539) | ❌ R | ✅ R (B83354) | ❌ |
| refuelings | ✅ R/W | ✅ R | ✅ R | ✅ R/W (B82475) | ✅ R/W (B45539) | ❌ | ✅ R/W (B83354) | ❌ |
| km_logs | ✅ R/W | ✅ R | ✅ R | ✅ R/W (B82475) | ✅ R/W (B45539) | ❌ | ✅ R/W (B83354) | ❌ |
| cp (config) | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R |
| contacts | ✅ R/W | ✅ R/W | ✅ R/W | ❌ R | ❌ R | ❌ R | ❌ R | ❌ R |

**Legenda:**
- ✅ = Povolené
- ❌ = Zakázané
- R = Čítanie
- W = Zápis (Create, Update, Delete)
- C = Create
- U = Update

---

## 👤 Detailný Popis Rolí

### 🔴 **Admin** (admin)
**Najvyššie oprávnenia - Plný prístup**

**Osoby s touto rolou:**
- Mário Banič (ID: 28831)

#### Povolené:
- ✅ Správa všetkých údajov bez obmedzení
- ✅ Čítanie a úprava všetkých kolekcií
- ✅ Zápisové operácie (Create, Update, Delete) vo všetkých kolekcách
- ✅ Spravovanie rolí iných užívateľov
- ✅ Prístup k logom a diagnostike (performance_logs, error_logs)
- ✅ Správa oznámení (Nástenka)
- ✅ Správa konfigurácií (CP, Settings, Knowledge Base)
- ✅ Správa dovoleniek (všetky operácie)
- ✅ Správa vozidiel a tankovaní (všetky vozidlá bez obmedzení)

#### Zakázané:
- ❌ Nič - má plný prístup

---

### 🟡 **Manager 1** (manager_1)
**Vedúci OCOaKP (Oddelenia Civilnej Ochrany a Kríz. Plánovania)**

**Osoby s touto rolou:**
- Vladimír Melikant (ID: 28832)

#### Povolené:
- ✅ Čítanie všetkých základných dát (employees, contacts)
- ✅ Správa rozpisu pohotovosti (publishedSchedules) - R/W
- ✅ Správa oznámení na Nástene (announcements) - R/W
- ✅ Úprava údajov zamestnancov (employees) - R/W
- ✅ Správa dovoleniek (vacationStats, vacationRequests) - R/W
- ✅ Čítanie zoznamov vozidiel (cars) - len čítanie
- ✅ Čítanie analýz výkonu (performance_logs)
- ✅ Úprava adresára miest a obcí (contacts) - R/W

#### Zakázané:
- ❌ Tankovanie vozidiel (refuelings, km_logs)
- ❌ Správa rolí
- ❌ Správa financií (payments)
- ❌ Prístup k error_logs (debugging)
- ❌ Správa konfigurácií (Settings, Knowledge Base)
- ❌ Správa príspevkov UA (towns_em)

---

**Osoby s touto rolou:**
- Juraj Tuhársky (ID: 28845)

### 🟡 **Manager 2** (manager_2)
**Vedúci KS IZS (Koordinačného Strediska Integrovaného Záchranného Systému)**

#### Povolené:
- ✅ Čítanie všetkých základných dát (employees, contacts)
- ✅ Správa rozpisu pohotovosti (publishedSchedules) - R/W
- ✅ Správa rozpisu služieb IZS (publishedSchedulesIZS) - R/W
- ✅ Správa oznámení (announcements) - R/W
- ✅ Úprava údajov zamestnancov (employees) - R/W
- ✅ Správa dovoleniek (vacationStats, vacationRequests) - R/W
- ✅ Čítanie zoznamov vozidiel (cars) - len čítanie
- ✅ Čítanie analýz výkonu (performance_logs)
- ✅ Úprava adresára miest a obcí (contacts) - R/W

#### Zakázané:
- ❌ Tankovanie vozidiel (refuelings, km_logs)
- ❌ Správa rolí
- ❌ Správa financií (payments)
- ❌ Prístup k error_logs (debugging)
- ❌ Správa konfigurácií (Settings, Knowledge Base)
- ❌ Správa príspevkov UA (towns_em)

---

**Osoby s touto rolou:**
- Denis Mičovský (ID: 28836)

### 🟢 **Super User 1** (super_user_1)
**Špecialista na Pohotovosť**

#### Povolené:
- ✅ Čítanie rozpisu pohotovosti - R/W
- ✅ Čítanie zamestnancov (employees)
- ✅ Tankovanie a spravovanie vozidla **B82475** (refuelings, km_logs) - R/W
- ✅ Čítanie ostatných vozidiel
- ✅ Čítanie dovoleniek (vacationStats, vacationRequests)

#### Zakázané:
- ❌ Úprava rozpisu služieb IZS
- ❌ Správa ostatných vozidiel
- ❌ Tankovanie iných vozidiel ako B82475
- ❌ Správa oznámení
- ❌ Správa rolí
- ❌ Správa konfigurácií

---

**Osoby s touto rolou:**
- Maroš Plieštik (ID: 28841)

### 🟢 **Super User 2** (super_user_2)
**Špecialista na Príspevky UA**

#### Povolené:
- ✅ Správa príspevkov UA (towns_em) - R/W
- ✅ Tankovanie a spravovanie vozidla **B45539** (refuelings, km_logs) - R/W
- ✅ Čítanie ostatných vozidiel
- ✅ Čítanie rozpisu pohotovosti
- ✅ Čítanie zamestnancov a dovoleniek

#### Zakázané:
- ❌ Tankovanie iných vozidiel ako B45539
- ❌ Správa rozpisu IZS
- ❌ Správa oznámení
- ❌ Správa rolí a konfigurácií
**Osoby s touto rolou:**
- Silvia Sklenárová (ID: 28852)


---

### 🔵 **Super User IZS 1** (super_user_IZS_1)
**Špecialista na IZS Služby**

#### Povolené:
- ✅ Správa rozpisu služieb IZS (publishedSchedulesIZS) - R/W
- ✅ Správa dovoleniek (vacationStats, vacationRequests) - R/W
- ✅ Čítanie zamestnancov
- ✅ Čítanie rozpisu pohotovosti
- ✅ Čítanie dovoleniek všetkých

#### Zakázané:
- ❌ Tankovanie vozidiel
- ❌ Správa ostatných rozpisu
- ❌ Správa oznámení a rolí
**Osoby s touto rolou:**
- Ján Kubaliak (ID: 28851)


---

### 🔵 **Super User IZS 2** (super_user_IZS_2)
**Špecialista na Vozidlá IZS**

#### Povolené:
- ✅ Tankovanie a spravovanie vozidla **B83354** (refuelings, km_logs) - R/W
- ✅ Čítanie ostatných vozidiel
- ✅ Čítanie rozpisu IZS
- ✅ Čítanie dovoleniek a zamestnancov

#### Zakázané:
- ❌ Tankovanie iných vozidiel
- ❌ Správa rozpisu
- ❌ Správa dovoleniek

---

### 👥 **Bežný User** (user)
**Minimálne oprávnenia - Len vlastné údaje**

#### Povolené:
- ✅ Čítanie všetkých verejných informácií (rozpisy, dovolenky, contacts)
- ✅ Čítanie vlastného profilu v employees
- ✅ Úprava vlastných údajov v employees (len vlastný email zápas)
- ✅ Vytváranie a spravovanie vlastných dovoleniek (vacationRequests)
- ✅ Čítanie vlastných štatistík dovoleniek
- ✅ Mazanie rozpisu IZS (publishedSchedulesIZS delete) - pre demo režim
- ✅ Zápis access_logs (pre audit)
- ✅ Čítanie adresára miest a obcí

#### Zakázané:
- ❌ Úprava údajov iných zamestnancov
- ❌ Tankovanie vozidiel
- ❌ Správa rozpisu pohotovosti
- ❌ Správa rozpisu IZS (Create, Update)
- ❌ Správa oznámení
- ❌ Správa rolí a konfigurácií
- ❌ Správa kľúčových údajov (payments, settings, knowledge_base)

---

## 🚗 Špecifická Pravidla pre Vozidlá

### Vozidlá a Tankovanie (cars)

| Vozidlo | EČV | Super User | Povolené operácie |
|---------|-----|-----------|------------------|
| Vozidlo 1 | B82475 | Super User 1 | Tankovanie, KM logy - R/W |
| Vozidlo 2 | B45539 | Super User 2 | Tankovanie, KM logy - R/W |
| Vozidlo 3 | B83354 | Super User IZS 2 | Tankovanie, KM logy - R/W |

**Poznámka:** Admin má prístup k všetkým vozidlám bez obmedzení.

---

## 📅 Dovolenky - Detailná Kontrola

### Čítanie (read)
- **Všetci prihlásení** - Môžu čítať všetky dovolenky (vacationStats, vacationRequests)

### Vytváranie (create) - vacationStats, vacationRequests
- ✅ **Vlastník** - Môže vytvoriť svoje vlastné dovolenky
- ✅ **Spravovane role** (admin, manager_1, manager_2, super_user_IZS_1, super_user_3)

### Úprava (update) - vacationStats, vacationRequests
- ✅ **Vlastník** - Môže upraviť svoje dovolenky
- ✅ **Spravovane role**

### Mazanie (delete) - vacationStats, vacationRequests
- ✅ **Spravovane role** - Iba admini a manageri (super_user_IZS_1, super_user_3)

---

## 🔐 Bezpečnostné Mechanizmy

### 1. **Autentifikácia**
- Všetky operácie vyžadujú `isSignedIn()` - prihlásený užívateľ

### 2. **Autorifikácia podľa Role**
- Systém čita rolu z kolekcie `user_roles/{userId}`
- Role sú case-sensitive

### 3. **Vlastnícka Kontrola**
- Užívatelia si môžu upraviť len **vlastné** údaje
- Overuje sa shoda emailu v `employees.mail` s `request.auth.token.email`

### 4. **Čas-Citlivá Validácia**
- Všetky logy musia obsahovať timestamp

---

## 📝 Poznámky a Špecifikácie

### Demo Režim
- Demo user (`user@test.sk`) je klasický `user` s minimálnymi oprávneniami
- V demo režime sú maskovane citlivé údaje (telefóny, adresy)

### Predvolené Prístupové Modely
- **Ostatní uživateľia:** Nikto okrem Admin nemá povolenie mazať iných
- **Kolekcia Contacts:** Všetci môžu čítať, ale len Admin a Manageri môžu editovať
- **Performance Logs:** Iba Admin a Manageri ich vidia
- **Error Logs:** Iba Admin ma prístup (pre debugging)

---

## 🔄 Zmeny a Aktualizácie

| Dátum | Zmena |
|-------|-------|
| 2026-01-05 | Vytvorenie detailného dokumentu, pridané maskovanie bydliska v demo režime |

---

**Posledná úprava:** 2026-01-05  
**Autor:** Firestore Security Rules Documentation
