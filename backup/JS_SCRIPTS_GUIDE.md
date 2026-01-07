# 📚 Zoznam Všetkých JavaScript Súborov – Jednoduchý Sprievodca

Tento dokument opisuje všetky `.js` súbory v aplikácii v jednoduchej reči tak, aby tomu rozumel aj laik.

---

## 🔑 Základné Súbory (Jadro Aplikácie)

### **1. `store.js`** – Pamäť Aplikácie
**Čo robí:** Centrálne úložisko dát aplikácie. Podobne ako počítačová RAM – pamätá si, kto je prihlásený, aké zamestnanci sú v systéme, aké dáta sa práve potrebujú.

**Analogia:** Ako si človek pamätá, kto je jeho blízka rodina a aké sú ich základné informácie.

---

### **2. `config.js` a `config.template.js`** – Nastavenia Aplikácie
**Čo robí:** Obsahuje tajné informácie a nastavenia (ako prihlásiť sa do Firebase databázy, API kľúče). `config.template.js` je vzor, ktorý sa musí vyplniť platnými údajmi.

**Analogia:** Ako heslo k vášmu počítaču – bez neho sa nedá prihlásiť.

---

### **3. `constants.js`** – Fixné Hodnoty
**Čo robí:** Zoznam vecí, ktoré sa nikdy nemenia (ako "Prehľad", "Cestovný príkaz", farby, správy).

**Analogia:** Ako recept na koláč – ingrediencie sú vždy rovnaké.

---

### **4. `auth.js`** – Prihlasovanie a Odhlasovanie
**Čo robí:** Spravuje prihlasovanie používateľov (prihlas sa emailom a heslom), odhlasovanie, zmenu hesla.

**Analogia:** Vrátnica budovy – skontroluje tvoju totožnosť a pustí ťa dovnúť alebo von.

---

### **5. `accesses.js`** – Systém Prístupov
**Čo robí:** Definuje, kto čo môže robiť. Napríklad admin môže mať prístup ku všetkému, bežný zamestnanec len k svojim veciam.

**Analogia:** Ako záverečné práva v budove – admin má kľúč do všetkých miestností, ostatní len do svojej.

---

## 🎨 Obrazovka a Vzhľad

### **6. `navigation.js`** – Navigácia medzi Modulmi
**Čo robí:** Spravuje prepínanie medzi jednotlivými modulmi aplikácie (Prehľad → Cestovný príkaz → Dovolenky...). Automaticky čisti pamäť pri prepínaní.

**Analogia:** Ako tlačítka na výťahu – vyberieš poschodie a výťah ťa tam vezme.

---

### **7. `sidebar.js`** – Bočný Panel
**Čo robí:** Spravuje ľavý panel s zoznamom zamestnancov.

**Analogia:** Ako katalóg v knihovne – vidíš zoznam kníh na vľavo.

---

### **8. `global-handlers.js`** – Globálne Obsluhy
**Čo robí:** Centrálne spracovávanie kliknutí a akcií v celej aplikácii.

**Analogia:** Ako portál pre všetky požiadavky – všetko ide cez neho.

---

### **9. `ui_enhancements.js`** – Vylepšenia Vzhľadu
**Čo robí:** Vylepšuje vzhľad aplikácie (animácie, efekty, tlačítka).

**Analogia:** Ako dekorácia izby – urobí to krajšie.

---

### **10. `accessibility.js`** – Prístupnosť pre Všetkých
**Čo robí:** Zaisťuje, že aplikácia je použiteľná aj pre ľudí so slabozrakom alebo inými hendikepmi (veľký text, vysoký kontrast...).

**Analogia:** Ako bezbariérový prístup v budove – všetci tam môžu ísť.

---

### **11. `action-panel.js`** – Plávajúci Panel Akcií
**Čo robí:** Malý plávajúci panel, ktorý sa zobrazi pri interakcii s aplikáciou.

**Analogia:** Ako asistent, ktorý sa vždy nachádza v rohu obrazovky.

---

## 🔐 Prihlasovanie a Užívateľ

### **12. `app-init.js`** – Štartovanie Aplikácie
**Čo robí:** Inicializuje aplikáciu, keď sa prvý krát otvorí. Nastaví všetko potrebné, aby aplikácia fungovala.

**Analogia:** Ako zapnutie počítača – všetko sa pripraví na použitie.

---

### **13. `admin_panel_module.js`** – Panel Pre Administrátora
**Čo robí:** Špeciálny panel len pre admina – zálohovanie dát, mazanie logov, riadenie prístupu.

**Analogia:** Ako stroj na údržbu budovy – len správca ho môže používať.

---

### **14. `demo_mode.js`** – Ukážkový Režim
**Čo robí:** Umožňuje testovať aplikáciu bez ukladania skutočných dát.

**Analogia:** Ako hraná voľná hra – skúšaš bez rizika.

---

## 📊 Pracovné Moduly

### **15. `cp_module.js`** – Cestovné Príkazy
**Čo robí:** Spravuje cestovné príkazy – vytvorenie, úprava, generovanie PDF-iek.

**Analogia:** Ako kancelária pre cestovné – všetko o službách.

---

### **16. `dov_module.js`** – Dovolenky
**Čo robí:** Spravuje dovolenky zamestnancov – prihlášky, schválenie, excel export.

**Analogia:** Ako knižka dovoleniek – kto má dovolenku a kedy.

---

### **17. `schd_module.js`** – Rozpis Pohotovosti
**Čo robí:** Spravuje pohotovostný plán – kto bude na pohotovosti v ktorý deň.

**Analogia:** Ako tabuľka dyžúr – kto má práve službu.

---

### **18. `schd_izs_module.js`** – Služby IZS
**Čo robí:** Spravuje plány služieb pre integrovaný záchranný systém.

**Analogia:** Ako harmonogram záchranárov – kedy sú k dispozícii.

---

### **19. `schd_bbk_module.js`** – Rozpis BB Kraj
**Čo robí:** Spravuje rozvrh pohotovosti na úrovni BB kraja.

**Analogia:** Ako mestský plán – kto má v ktorom čase službu.

---

### **20. `ua_module.js`** – Príspevky UA
**Čo robí:** Spravuje príspevky za ubytovanie a stravovanie.

**Analogia:** Ako finančná agenda – koľko sa kto zjedol a prespával.

---

### **21. `fuel_module.js`** – Evidence PHM (Palivo)
**Čo robí:** Spravuje tankovanie áut a spotrebu paliva.

**Analogia:** Ako denník jazdy – koľko benzínu sme minuli.

---

## 🔧 Pomocné Nástroje a Služby

### **22. `utils.js`** – Pomocné Funkcie
**Čo robí:** Obsahuje všetky užitočné funkcie, ktoré sa používajú všade (notifikácie, modal okná, debounce...).

**Analogia:** Ako krabica s nástrojmi – všetko potrebné na opravu.

---

### **23. `firebase_helpers.js`** – Pomocník Pre Databázu
**Čo robí:** Jednoduchšie ovládanie Firebase databázy (načítanie, ukladanie, mazanie dát).

**Analogia:** Ako tlmočník – prekladá tvoje príkazy do jazyka databázy.

---

### **24. `db_service.js`** – Služba Pre Lokálnu Pamäť
**Čo robí:** Spravuje cache pamäť na počítači (IndexedDB) – dáta sa uložia lokálne pre rýchlosť.

**Analogia:** Ako skrinka doma – uchovávame si kópiu dôležitých dát.

---

### **25. `lazy_loader.js`** – Lenivé Načítavanie
**Čo robí:** Načítava knižnice len keď sú potrebné (Excel, PDF, Flatpickr...).

**Analogia:** Ako strój, ktorý si nalosuje zbraň len keď ju potrebuješ – šetrí energiu.

---

### **26. `search_service.js`** – Vyhľadávací Servis
**Čo robí:** Vyhľadávanie zamestnancov, kontaktov a iných dát v aplikácii.

**Analogia:** Ako vyhľadávač v Googlovi – rýchlo nájde, čo hľadáš.

---

### **27. `search_worker.js`** – Pozadí Vyhľadávania
**Čo robí:** Vyhľadávanie beží v pozadí, aby aplikácia nečasla.

**Analogia:** Ako sekretárka, ktorá pracuje v pozadí – ty si môžeš robiť niečo iné.

---

### **28. `logs_module.js`** – Systém Logov
**Čo robí:** Zaznamenáva všetky akcie v aplikácii (kto sa kedy prihlásal, čo zmenil...).

**Analogia:** Ako kamera na banke – všetko sa zaznamenáva.

---

### **29. `backup_service.js`** – Zálohovanie Dát
**Čo robí:** Vytvorí zálohu všetkých dát aplikácie.

**Analogia:** Ako kopírovanie fotografií do oblaku – bezpečnosť.

---

### **30. `restore_service.js`** – Obnovenie Dát
**Čo robí:** Obnoví údaje z predošlej zálohy.

**Analogia:** Ako obnovenie fotografií z oblaku – vrátila sa chyba.

---

### **31. `ai_module.js`** – AI Asistent
**Čo robí:** Inteligentný asistent, ktorý odpovedá na otázky o kontaktoch a ľuďoch.

**Analogia:** Ako ChatGPT – hovoríš s ním a odpovie.

---

### **32. `announcements.js`** – Oznamy
**Čo robí:** Zobrazuje oznamy a správy pre používateľov.

**Analogia:** Ako nástenka v kancelárii – všetci vidí novinky.

---

### **33. `widget.js`** – Miniaturný Widget
**Čo robí:** Malý widget, ktorý sa zobrazuje na rôznych miestach aplikácie.

**Analogia:** Ako hodiny na stole – malý, ale užitočný.

---

### **34. `contacts_module.js`** – Modul Kontaktov
**Čo robí:** Spravuje a zobrazuje kontakty na mestá a obce.

**Analogia:** Ako telefónny zoznam – všetky čísla na jednom mieste.

---

### **35. `emp_module.js`** – Modul Zamestnancov
**Čo robí:** Export zamestnancov do Excelu a správa ich zoznamov.

**Analogia:** Ako personálny oddel – všetko o zamestnancoch.

---

### **36. `mainWizard.js`** – Hlavný Sprievodca
**Čo robí:** Koordinuje všetky ostatné moduly pri štartovaní aplikácie.

**Analogia:** Ako riaditeľ – dáva všetkým príkazy, čo majú robiť.

---

### **37. `dashboard.js`** – Prehľad
**Čo robí:** Zobrazuje hlavný prehľad aplikácie – všetko dôležité na jednom mieste.

**Analogia:** Ako nástroj na ovládanom paneli lietadla – všetky informácie naraz.

---

## 🔍 Registrácia ID Prvkov

### **38. `id-registry.js`** – Register ID Prvkov
**Čo robí:** Centrálny zoznam všetkých ID prvkov v HTML (tlačítka, polia, modaly...). Keď potrebuješ nájsť prvok, ideš sa pozrieť sem.

**Analogia:** Ako plán budovy – kde je ktorá miestnosť.

---

### **39. `id-validator.js`** – Validátor ID
**Čo robí:** Skontroluje, či všetky ID v aplikácii sú správne a nie sú duplikáty.

**Analogia:** Ako preverovateľ – skontroluje, či všetko je v poriadku.

---

## ⚙️ Konfiguračné a Špecializované Súbory

### **40. `firestore.rules`** – Pravidlá Bezpečnosti Databázy
**Čo robí:** Definuje, kto má prístup k akým dátam v databáze. Ako zámok a kľúč.

**Analogia:** Ako pravidlá v knižnici – čo môžeš a čo nemôžeš.

---

### **41. `deploy.yml`** – Konfigurácia pre Deploy
**Čo robí:** Nastavenia ako nasadiť aplikáciu na server.

**Analogia:** Ako návod na presunutie domu – všetky kroky.

---

## 📝 Bez Konkrétneho Modulu

- **Existujúce súbory mimo js adresára:** HTML (`index.html`), CSS (`styles.css`, `action-panel.css`, `settings-menu.css`), manifest (`manifest.json`), service worker (`sw.js`).

---

## 🎯 Rýchly Prehľad – Čo Ktorý Súbor Robí

| Súbor | Účel | Úroveň Zložitosti |
|-------|------|------------------|
| `store.js` | Centrálne úložisko dát | 🟡 Stredná |
| `auth.js` | Prihlasovanie | 🟡 Stredná |
| `accesses.js` | Práva a permisie | 🟡 Stredná |
| `navigation.js` | Navigácia | 🟠 Zložitá |
| `cp_module.js` | Cestovné príkazy | 🟠 Zložitá |
| `dov_module.js` | Dovolenky | 🟠 Zložitá |
| `fuel_module.js` | Palivo a tankovanie | 🟠 Zložitá |
| `utils.js` | Pomocné funkcie | 🟢 Jednoduchá |
| `constants.js` | Fixné hodnoty | 🟢 Jednoduchá |
| `firebase_helpers.js` | Databáza | 🟡 Stredná |

---

## 💡 Ako Všetko Pracuje Spolu

```
1. Užívateľ sa prihláša (auth.js)
   ↓
2. App sa štartuje (app-init.js) a nastaví všetko (mainWizard.js)
   ↓
3. Zobrazí sa prehľad (dashboard.js)
   ↓
4. Užívateľ klikne na Dovolenky
   ↓
5. Navigation.js prepne na dov_module.js
   ↓
6. Module čítajú dáta z store.js a zobrazujú ich
   ↓
7. Užívateľ klikne na tlačítko (global-handlers.js to spracuje)
   ↓
8. Akcia sa zaloguje (logs_module.js) a dáta sa uložia do databázy (firebase_helpers.js)
```

---

## 📌 Zhrnutie

- **Základné:** Bez nich aplikácia by nefungovala (`store.js`, `auth.js`, `config.js`)
- **Móduly:** Jednotlivé časti aplikácie (`cp_module.js`, `dov_module.js`, atď.)
- **Pomocníci:** Funkcie na облегчение práce (`utils.js`, `firebase_helpers.js`)
- **Bezpečnosť:** Kontrola prístupu (`accesses.js`, `firestore.rules`)

**Všetky súbory pracujú spolu ako tím – každý má svoju úlohu!** ⚽
