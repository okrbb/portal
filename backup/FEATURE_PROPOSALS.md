# Návrhy vylepšení OKR Portálu

> **Dokument:** Detailné návrhy nových funkcií  
> **Vytvorené:** 6. január 2026  
> **Status:** Pripravené na implementáciu

---

## 📋 1. Šablóny cestovných príkazov

### 🎯 Účel funkcie
Umožniť používateľom uložiť často používané destinácie a účely ciest ako šablóny, ktoré môžu jedným klikom načítať do formulára.

---

### 🗄️ Dátová štruktúra (Firestore)

```
templates/
  └── {userId}/
      └── travelTemplates/
          └── {templateId}
              - name: "Školenie Bratislava"
              - ucel: "Účasť na školení BOZP"
              - miesto: "Bratislava, Hotel Crowne Plaza"
              - spolucestujuci: ""
              - typicalDuration: 1 // dni (voliteľné)
              - createdAt: timestamp
              - updatedAt: timestamp
              - useCount: 12 // koľkokrát použitá
              - lastUsed: timestamp
```

**Pravidlá:**
- Každý používateľ má vlastné šablóny (izolované podľa `userId`)
- Maximálny počet šablón: **20** (ošetrené vo validácii)
- Automatické triedenie podľa `useCount` a `lastUsed`

---

### 🎨 UI Implementácia

#### **Umiestnenie tlačidla**
V module **Cestovný príkaz** (`cp__module`), v sekcii `cp-button-container`:

```html
<div class="cp-button-container">
    <button type="button" id="cp__btn-templates" class="ua-btn default">
        <i class="fas fa-bookmark"></i> Šablóny
    </button>
    <button type="button" id="cp__btn-clear-cp-form" class="ua-btn default delete-hover">
        <span>Vymazať formulár</span>
    </button>
    <button type="submit" id="cp__generate-btn" class="ua-btn default">
        Generovať cestovný príkaz
    </button>
</div>
```

#### **Modal šablón**

```html
<div id="cp__templates-modal" class="modal-overlay hidden">
    <div class="modal-content" style="max-width: 700px;">
        <div class="modal-header">
            <h2><i class="fas fa-bookmark"></i> Šablóny cestovných príkazov</h2>
            <button class="modal-close" id="cp__close-templates-modal">&times;</button>
        </div>
        
        <div class="modal-body">
            <!-- Search Bar -->
            <div class="input-group-modern" style="margin-bottom: 20px;">
                <i class="fas fa-search input-icon"></i>
                <input type="text" id="cp__template-search" placeholder="Hľadať šablónu...">
                <i class="fas fa-times clear-search-btn hidden" id="cp__clear-template-search"></i>
            </div>

            <!-- Templates List -->
            <div id="cp__templates-list-container" style="max-height: 400px; overflow-y: auto;">
                <!-- Dynamicky generované šablóny -->
            </div>

            <!-- Empty State -->
            <div id="cp__templates-empty-state" class="hidden" style="text-align: center; padding: 40px; color: var(--color-text-secondary);">
                <i class="fas fa-bookmark" style="font-size: 3rem; opacity: 0.3; margin-bottom: 15px;"></i>
                <p>Zatiaľ nemáte žiadne šablóny.</p>
                <p style="font-size: 0.9rem;">Vyplňte formulár a kliknite na "Uložiť aktuálny formulár".</p>
            </div>
        </div>

        <div class="modal-footer">
            <button class="ua-btn default" id="cp__btn-save-current-as-template">
                <i class="fas fa-plus"></i> Uložiť aktuálny formulár
            </button>
        </div>
    </div>
</div>
```

---

### 🔄 Workflow

#### **Scenár A - Uloženie šablóny**

1. Používateľ vyplní formulár CP (účel, miesto, spolucestujúci)
2. Klikne **"Šablóny"** → **"Uložiť aktuálny formulár"**
3. Zobrazí sa prompt: 
   ```
   ┌────────────────────────────────┐
   │ Zadajte názov šablóny:        │
   │ [________________________]     │
   │                                │
   │    [Zrušiť]   [Uložiť]        │
   └────────────────────────────────┘
   ```
4. Validácia:
   - Názov je povinný (min. 3 znaky)
   - Kontrola duplicity (ignoruje Case)
   - Max. 20 šablón na používateľa
5. Firestore: Vytvorí záznam v `templates/{userId}/travelTemplates/{newId}`

#### **Scenár B - Použitie šablóny**

1. Používateľ otvorí prázdny/vyplnený CP formulár
2. Klikne **"Šablóny"**
3. Zobrazí sa zoznam šablón (zoradené podľa `useCount` DESC, potom `lastUsed` DESC)
4. Klikne na šablónu (napr. "Školenie Bratislava")
5. Formulár sa automaticky vyplní:
   - `cp__ucel` ← `template.ucel`
   - `cp__miesto` ← `template.miesto`
   - `cp__spolucestujuci` ← `template.spolucestujuci`
6. Dátumy a časy **ostávajú prázdne** (musia sa zadať manuálne)
7. Firestore update:
   ```javascript
   useCount++
   lastUsed = new Date()
   ```

---

### 🎨 Dizajn šablón v zozname

```html
<div class="template-item" data-template-id="abc123">
    <div class="template-header">
        <h4 class="template-name">📍 Školenie Bratislava</h4>
        <div class="template-actions">
            <button class="template-edit-btn" title="Upraviť">
                <i class="fas fa-edit"></i>
            </button>
            <button class="template-delete-btn" title="Vymazať">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    </div>
    <div class="template-details">
        <p><strong>Účel:</strong> Účasť na školení BOZP</p>
        <p><strong>Miesto:</strong> Bratislava, Hotel Crowne Plaza</p>
    </div>
    <div class="template-meta">
        <span class="usage-count">
            <i class="fas fa-chart-line"></i> Použité: 12×
        </span>
        <span class="last-used">
            <i class="far fa-clock"></i> Naposledy: 3.1.2026
        </span>
    </div>
</div>
```

**CSS štýly:**
```css
.template-item {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 12px;
    transition: all 0.2s ease;
    cursor: pointer;
}

.template-item:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--color-orange-accent);
    transform: translateX(5px);
}

.template-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.template-name {
    color: var(--color-orange-accent);
    margin: 0;
    font-size: 1rem;
}

.template-actions {
    display: flex;
    gap: 8px;
}

.template-edit-btn,
.template-delete-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 5px 8px;
    border-radius: 4px;
    transition: all 0.2s;
}

.template-edit-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #60A5FA;
}

.template-delete-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #EF4444;
}

.template-details p {
    margin: 5px 0;
    font-size: 0.9rem;
    color: var(--color-text-secondary);
}

.template-meta {
    display: flex;
    gap: 20px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.85rem;
    color: var(--color-text-muted);
}

.usage-count i,
.last-used i {
    margin-right: 5px;
}
```

---

### 🛠️ Funkcie JavaScriptu

#### **Hlavné metódy v `cp_templates_module.js`**

```javascript
// ===== CRUD operácie =====
async function loadTemplates() { /* Načíta šablóny z Firestore */ }
async function saveTemplate(templateData) { /* Uloží novú šablónu */ }
async function updateTemplate(templateId, updates) { /* Aktualizuje šablónu */ }
async function deleteTemplate(templateId) { /* Vymaže šablónu */ }

// ===== UI operácie =====
function renderTemplatesList(templates) { /* Vykreslí zoznam */ }
function applyTemplateToForm(template) { /* Vyplní formulár */ }
function openTemplatesModal() { /* Otvorí modal */ }
function closeTemplatesModal() { /* Zatvorí modal */ }

// ===== Validácia =====
function validateTemplateName(name) { /* Min. 3 znaky, max. 50 */ }
function checkTemplateLimit(userId) { /* Max. 20 šablón */ }
```

---

### ✅ Kontrolný zoznam implementácie

- [ ] **Backend (Firestore)**
  - [ ] Vytvoriť kolekciu `templates/{userId}/travelTemplates`
  - [ ] Nastaviť Security Rules (každý vidí len svoje šablóny)
  - [ ] Indexy pre rýchle dotazy (useCount DESC, lastUsed DESC)

- [ ] **Frontend - Modal**
  - [ ] HTML štruktúra modalu
  - [ ] CSS štýly pre šablóny
  - [ ] Search funkcionalita
  - [ ] Empty state zobrazenie

- [ ] **Frontend - Logika**
  - [ ] `cp_templates_module.js` - hlavný modul
  - [ ] Load šablón pri otvorení modalu
  - [ ] Save funkcia (validácia + prompt)
  - [ ] Apply funkcia (vyplnenie formulára)
  - [ ] Edit/Delete funkcie
  - [ ] useCount++ pri použití

- [ ] **UX Vylepšenia**
  - [ ] Animácie (fade in/out)
  - [ ] Loading states
  - [ ] Error handling + toast notifikácie
  - [ ] Keyboard shortcuts (Enter = použiť, Delete = vymazať)

---

## 🤖 2. Chatbot pre FAQ

### 🎯 Účel funkcie
Rozšíriť existujúci AI asistent o režim **"Nápoveda"** pre častý otázky o používaní aplikácie. Hybridný prístup: lokálne FAQ (rýchle) + AI fallback (komplexné otázky).

---

### 🔄 Rozšírenie existujúceho AI modulu

**Aktuálny stav:** `ai__ai-modal-overlay` - režim "Kontakty"

**Nový dizajn:** Dva prepínateľné režimy

```
┌─────────────────────────────────────────┐
│  [💬 Kontakty] [🔧 Nápoveda]       ✕   │  ← Toggle tlačidlá
├─────────────────────────────────────────┤
│  🤖: Ahoj! Ako ti môžem pomôcť         │
│      s používaním aplikácie?            │
│                                         │
│  👤: ako pridať tankovanie              │
│                                         │
│  🤖: Pre pridanie tankovania:           │
│      1. Prejdi do modulu PHM            │
│      2. Klikni na kartu vozidla         │
│      3. Tlačidlo "Tankovanie"           │
│      4. Vyplň dátum, litre, km          │
│                                         │
│  [📚 Časté otázky ▼]                   │  ← Quick access
└─────────────────────────────────────────┘
```

---

### 📊 FAQ Databáza (Statická)

**Nový súbor:** `js/faq_database.js`

```javascript
export const FAQ_DATABASE = [
    // ===== CESTOVNÝ PRÍKAZ =====
    {
        id: "cp_001",
        category: "Cestovný príkaz",
        questions: [
            "Ako vytvoriť cestovný príkaz?",
            "Ako vypísať CP?",
            "Kde nájdem formulár CP?"
        ],
        keywords: ["cestovný príkaz", "cp", "cesta", "služobná cesta", "travel"],
        answer: `**Vytvorenie cestovného príkazu:**

1. Otvor modul **"Cestovný príkaz"** (ikona kufra)
2. Vpravo klikni na **zamestnanca** zo zoznamu
3. Vyplň povinné polia:
   - Účel cesty
   - Miesto služobnej cesty
   - Dátumy a časy (začiatok + koniec)
4. Klikni **"Generovať cestovný príkaz"**

💡 **Tip:** Použite šablóny pre časté destinácie!`,
        relatedLinks: ["cp_002", "cp_003"]
    },
    
    {
        id: "cp_002",
        category: "Cestovný príkaz",
        questions: [
            "Ako zadať IBAN zamestnanca?",
            "Kde upraviť číslo účtu?",
            "Ako zmeniť bankový účet?"
        ],
        keywords: ["iban", "bankový účet", "číslo účtu", "úprava údajov"],
        answer: `**Úprava IBAN zamestnanca:**

1. V module Cestovný príkaz vyber zamestnanca
2. Klikni na **ikonu ceruzky** (✏️) vedľa mena
3. Zadaj IBAN vo formáte: **SK + 22 číslic**
   - Príklad: SK8975000000000012345678
4. Klikni **"Uložiť"**

⚠️ **Pozor:** IBAN musí byť slovenský (začína "SK")`,
        relatedLinks: ["cp_001"]
    },

    {
        id: "cp_003",
        category: "Cestovný príkaz",
        questions: [
            "Čo sú šablóny CP?",
            "Ako uložiť šablónu?",
            "Ako použiť šablónu cesty?"
        ],
        keywords: ["šablóna", "template", "uložiť cestu", "časté cesty"],
        answer: `**Šablóny cestovných príkazov:**

Šablóny ti umožňujú uložiť často používané destinácie.

**Uloženie šablóny:**
1. Vyplň formulár (účel, miesto)
2. Klikni **"Šablóny"** → **"Uložiť aktuálny formulár"**
3. Zadaj názov (napr. "Školenie BA")

**Použitie šablóny:**
1. Klikni **"Šablóny"**
2. Vyber zo zoznamu
3. Formulár sa automaticky vyplní

💡 **Tip:** Najčastejšie používané sú hore!`,
        relatedLinks: ["cp_001"]
    },

    // ===== DOVOLENKY =====
    {
        id: "dov_001",
        category: "Dovolenky",
        questions: [
            "Ako podať dovolenku?",
            "Kde zadať dovolenku?",
            "Ako požiadať o voľno?"
        ],
        keywords: ["dovolenka", "voľno", "čerpanie", "sick leave", "OČR"],
        answer: `**Podanie žiadosti o dovolenku:**

1. Otvor modul **"Evidencia dovoleniek"**
2. Klikni **"Pridať dovolenku"**
3. Vyplň:
   - Dátum od - do
   - Typ (dovolenka / OČR / sick)
4. Klikni **"Uložiť"**

📊 **Zostatok dovolenky** sa zobrazuje v dashboarde.`,
        relatedLinks: []
    },

    {
        id: "dov_002",
        category: "Dovolenky",
        questions: [
            "Kde vidím zostatok dovolenky?",
            "Koľko mám dní dovolenky?",
            "Ako zistiť zvyšok dovolenky?"
        ],
        keywords: ["zostatok", "dni dovolenky", "zvyšok", "počet dní"],
        answer: `**Zobrazenie zostatku dovolenky:**

Tvoj zostatok vidíš na **dvoch miestach**:

1. **Dashboard** (hlavná stránka)
   - Karta "Tvoja dovolenka"
   - Zobrazuje čerpané / zostatok / celkom

2. **Modul Dovolenky**
   - Horná lišta s prehľadom

🔄 Zostatok sa aktualizuje **automaticky** po schválení.`,
        relatedLinks: ["dov_001"]
    },

    // ===== PHM (PALIVÁ) =====
    {
        id: "fuel_001",
        category: "PHM",
        questions: [
            "Ako pridať tankovanie?",
            "Kde zapísať tankovanú naftu?",
            "Ako zaznamenať PHM?"
        ],
        keywords: ["tankovanie", "phm", "palivo", "nafta", "benzín", "diesel"],
        answer: `**Pridanie tankovania:**

1. Prejdi do modulu **"Evidencia PHM"**
2. Klikni na **kartu vozidla** (napr. Škoda Octavia)
3. Tlačidlo **"Tankovanie"** (ikona pumpy)
4. Vyplň údaje:
   - Dátum tankovania
   - Aktuálny stav tachometra (km)
   - Natankované litre
   - Cena (voliteľné)
5. Klikni **"Uložiť tankovanie"**

✅ **Spotreba sa vypočíta automaticky!**`,
        relatedLinks: ["fuel_002", "fuel_003"]
    },

    {
        id: "fuel_002",
        category: "PHM",
        questions: [
            "Ako zaznamenať jazdu bez tankovania?",
            "Pridať kilometre bez PHM?",
            "Zapísať km bez tankovania?"
        ],
        keywords: ["jazda", "kilometre", "km", "bez tankovania", "distance"],
        answer: `**Záznam jazdy (bez tankovania):**

1. V module PHM klikni na **kartu vozidla**
2. Tlačidlo **"Jazda"** (ikona automobilu)
3. Vyplň:
   - Dátum jazdy
   - Nový stav tachometra
   - Km v meste (voliteľné)
4. Klikni **"Uložiť jazdu"**

ℹ️ **Virtuálna spotreba** sa vypočíta podľa noriem.`,
        relatedLinks: ["fuel_001", "fuel_003"]
    },

    {
        id: "fuel_003",
        category: "PHM",
        questions: [
            "Ako funguje výpočet spotreby?",
            "Čo znamená virtuálna spotreba?",
            "Prečo je ikona kalkulačky?"
        ],
        keywords: ["spotreba", "výpočet", "kalkulačka", "virtuálna", "reálna"],
        answer: `**Metodika výpočtu spotreby:**

📗 **Reálna spotreba** (zelená/červená):
- Vypočíta sa keď **tankuješ**
- Vzorec: (Litre ÷ Km) × 100

📙 **Virtuálna spotreba** (ikona 🧮):
- Použije sa pri **jazde bez tankovania**
- Ak existuje história → dlhodobý priemer vozidla
- Ak neexistuje história → technické normy (mesto/mimo)

ℹ️ **Detail:** Klikni na ikonu (i) v module PHM`,
        relatedLinks: ["fuel_001", "fuel_002"]
    },

    // ===== POHOTOVOSŤ =====
    {
        id: "duty_001",
        category: "Pohotovosť",
        questions: [
            "Ako vytvoriť rozpis pohotovosti?",
            "Kde nastaviť služby?",
            "Ako priradiť pohotovosť?"
        ],
        keywords: ["pohotovosť", "rozpis", "služba", "duty", "schedule"],
        answer: `**Vytvorenie rozpisu pohotovosti:**

1. Otvor modul **"Rozpis pohotovosti OKR"**
2. Vyber **mesiac a rok**
3. Z ľavého panelu **presuň skupinu** do týždňa (drag & drop)
4. Automatická rotácia sa aplikuje
5. Klikni **"Stiahnuť výkaz"** pre PDF

🎯 **Interakcie:**
- **Klik** na zamestnanca = pridať hlásenie
- **Dvojklik** = nastaviť zastupovanie
- **Pravý klik** = vymeniť zamestnancov`,
        relatedLinks: []
    },

    // ===== IZS =====
    {
        id: "izs_001",
        category: "IZS",
        questions: [
            "Ako spracovať dochádzku IZS?",
            "Kde uploadnúť Excel IZS?",
            "Spracovanie služieb IZS?"
        ],
        keywords: ["izs", "dochádzka", "excel", "rozpis služieb", "attendance"],
        answer: `**Spracovanie dochádzky IZS:**

1. Prejdi do modulu **"Agenda KS IZS"**
2. Sekcia **"Rozpis služieb"**
3. Presuň Excel súbor (.xlsx) do zóny
4. Klikni **"Spracovať"**
5. Výsledok sa otvorí v **novom okne**

📝 **Formát súboru:** Štandardný export z dochádzky`,
        relatedLinks: ["izs_002"]
    },

    {
        id: "izs_002",
        category: "IZS",
        questions: [
            "Ako vyúčtovať nadčasy IZS?",
            "Výpočet príplatkov?",
            "Spracovanie overtime?"
        ],
        keywords: ["nadčasy", "overtime", "príplatky", "mzda", "výpočet"],
        answer: `**Vyúčtovanie nadčasov:**

1. V module IZS sekcia **"Vyúčtovanie"**
2. Upload Excel súbor s odpracovanými hodinami
3. Klikni **"Spracovať"**
4. Systém vypočíta:
   - Nadčasy
   - Nočné príplatky
   - Víkendové príplatky

📊 **Export:** Výsledok môžeš stiahnuť ako Excel`,
        relatedLinks: ["izs_001"]
    },

    // ===== UA (UKRAJINA) =====
    {
        id: "ua_001",
        category: "Príspevky UA",
        questions: [
            "Ako spracovať príspevky UA?",
            "Export pre obce?",
            "Generovanie emailov pre starostov?"
        ],
        keywords: ["ua", "ukrajina", "príspevky", "obce", "email", "starosta"],
        answer: `**Spracovanie príspevkov UA:**

1. Modul **"Príspevky UA"**
2. Presuň Excel súbor do zóny
3. Klikni **"Spracovať"**
4. Vyber **obec** zo zoznamu
5. Automaticky sa vygeneruje:
   - Predmet emailu
   - Telo emailu
   - Príloha (Excel)
6. Klikni **"Sťiahnúť prílohu a odslať mail"**

📧 Email sa otvorí v tvojom klientovi.`,
        relatedLinks: []
    },

    // ===== VŠEOBECNÉ =====
    {
        id: "gen_001",
        category: "Všeobecné",
        questions: [
            "Ako zmeniť heslo?",
            "Kde je zmena hesla?",
            "Reset hesla?"
        ],
        keywords: ["heslo", "password", "zmena", "reset", "zabezpečenie"],
        answer: `**Zmena hesla:**

1. Klikni na **ikonu ozubeného kolesa** (⚙️) v hornej lište
2. Vyber **"Zmeniť heslo"**
3. Zadaj:
   - Súčasné heslo
   - Nové heslo (min. 6 znakov)
   - Potvrdenie nového hesla
4. Klikni **"Zmeniť heslo"**

🔒 **Bezpečnosť:** Použite silné heslo!`,
        relatedLinks: ["gen_002"]
    },

    {
        id: "gen_002",
        category: "Všeobecné",
        questions: [
            "Zabudol som heslo",
            "Ako obnoviť prístup?",
            "Reset zabudnutého hesla?"
        ],
        keywords: ["zabudnuté heslo", "forgot password", "obnova", "reset"],
        answer: `**Obnova hesla:**

1. Na prihlasovacej stránke klikni **"Zabudol som heslo"**
2. Zadaj svoj **email**
3. Klikni **"Odoslať"**
4. Skontroluj email (príde link na reset)
5. Klikni na link a zadaj nové heslo

⏱️ **Platnosť linku:** 1 hodina`,
        relatedLinks: ["gen_001"]
    },

    {
        id: "gen_003",
        category: "Všeobecné",
        questions: [
            "Ako vyhľadať zamestnanca?",
            "Kde nájdem kolegu?",
            "Search zamestnancov?"
        ],
        keywords: ["vyhľadávanie", "search", "zamestnanec", "kolega", "employee"],
        answer: `**Vyhľadávanie zamestnancov:**

1. **Horná lišta:** Použij globálny search
   - Začni písať meno/priezvisko
   - Automatické našepkávanie
   
2. **Pravý sidebar:** Klikni na ikonu
   - Zobrazí zoznam všetkých zamestnancov
   - Filter podľa oddelenia

🔍 **Tip:** Stačí zadať prvé 3 písmená`,
        relatedLinks: []
    },

    {
        id: "gen_004",
        category: "Všeobecné",
        questions: [
            "Ako obnoviť aplikáciu?",
            "Reload app?",
            "Aktualizovať portál?"
        ],
        keywords: ["reload", "refresh", "obnoviť", "aktualizovať", "update"],
        answer: `**Obnovenie aplikácie:**

1. Klikni na **ikonu ozubeného kolesa** (⚙️)
2. Vyber **"Obnoviť aplikáciu"**
3. Aplikácia sa znovu načíta

🔄 **Kedy použiť:**
- Ak sa nezobrazujú nové dáta
- Po aktualizácii systému
- Pri problémoch s načítaním

💡 **Skratka:** F5 alebo Ctrl+R`,
        relatedLinks: []
    },

    {
        id: "gen_005",
        category: "Všeobecné",
        questions: [
            "Ako exportovať zoznam zamestnancov?",
            "Stiahnuť Excel zamestnancov?",
            "Export kontaktov?"
        ],
        keywords: ["export", "excel", "zoznam", "zamestnanci", "download"],
        answer: `**Export zoznamu zamestnancov:**

1. Klikni na **ikonu ozubeného kolesa** (⚙️)
2. Vyber **"Zoznam zamestnancov"**
3. Automaticky sa stiahne Excel súbor

📋 **Obsah súboru:**
- Meno a priezvisko
- Pozícia
- Email
- Telefón
- Oddelenie`,
        relatedLinks: []
    }
];

// ===== Utility funkcie =====

/**
 * Vyhľadá FAQ podľa kľúčových slov
 * @param {string} query - Používateľský dotaz
 * @returns {Array} - Zodpovedajúce FAQ
 */
export function searchFAQ(query) {
    const lowerQuery = query.toLowerCase();
    const results = [];

    FAQ_DATABASE.forEach(faq => {
        let score = 0;

        // Presná zhoda v otázkach
        if (faq.questions.some(q => q.toLowerCase().includes(lowerQuery))) {
            score += 10;
        }

        // Zhoda v kľúčových slovách
        const matchedKeywords = faq.keywords.filter(kw => 
            lowerQuery.includes(kw) || kw.includes(lowerQuery)
        );
        score += matchedKeywords.length * 5;

        if (score > 0) {
            results.push({ ...faq, score });
        }
    });

    // Zoradiť podľa skóre
    return results.sort((a, b) => b.score - a.score);
}

/**
 * Získa FAQ podľa ID
 */
export function getFAQById(id) {
    return FAQ_DATABASE.find(faq => faq.id === id);
}

/**
 * Získa FAQ podľa kategórie
 */
export function getFAQByCategory(category) {
    return FAQ_DATABASE.filter(faq => faq.category === category);
}
```

---

### 🎨 UI Rozšírenie AI Modulu

#### **Toggle režimov v headeri**

```html
<div class="ai-modal-header">
    <div class="ai-mode-toggle">
        <button id="ai__mode-contacts" class="ai-mode-btn active">
            <i class="fas fa-address-book"></i> Kontakty
        </button>
        <button id="ai__mode-help" class="ai-mode-btn">
            <i class="fas fa-question-circle"></i> Nápoveda
        </button>
    </div>
    <div class="ai-header-controls">
        <button id="ai__ai-reset-btn" class="ai-action-btn">
            <i class="fas fa-eraser"></i>
        </button>
        <button id="ai__ai-close-btn" class="ai-action-btn close">
            <i class="fas fa-times"></i>
        </button>
    </div>
</div>
```

#### **Quick FAQ Buttons**

```html
<div class="ai-input-wrapper">
    <div id="ai__quick-faq-container" class="hidden">
        <div class="quick-faq-label">Rýchle otázky:</div>
        <div class="quick-faq-buttons">
            <button class="quick-faq-btn" data-query="ako pridať dovolenku">
                📅 Dovolenka
            </button>
            <button class="quick-faq-btn" data-query="ako zmeniť heslo">
                🔒 Heslo
            </button>
            <button class="quick-faq-btn" data-query="ako pridať tankovanie">
                ⛽ Tankovanie
            </button>
            <button class="quick-faq-btn" data-query="ako vytvoriť CP">
                ✈️ Cestovný príkaz
            </button>
        </div>
    </div>
    
    <textarea id="ai__ai-input" rows="1" placeholder="Opíšte problém..."></textarea>
    <button id="ai__send-ai-btn">
        <i class="fas fa-paper-plane"></i>
    </button>
</div>
```

**CSS pre quick buttons:**
```css
.quick-faq-container {
    padding: 10px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    margin-bottom: 10px;
}

.quick-faq-label {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
}

.quick-faq-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.quick-faq-btn {
    background: rgba(221, 89, 13, 0.1);
    border: 1px solid rgba(221, 89, 13, 0.3);
    color: var(--color-orange-accent);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
}

.quick-faq-btn:hover {
    background: rgba(221, 89, 13, 0.2);
    transform: translateY(-2px);
}

.ai-mode-toggle {
    display: flex;
    gap: 5px;
    background: rgba(0, 0, 0, 0.2);
    padding: 4px;
    border-radius: 8px;
}

.ai-mode-btn {
    padding: 8px 16px;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
    font-size: 0.9rem;
}

.ai-mode-btn.active {
    background: var(--color-orange-accent);
    color: white;
}

.ai-mode-btn:not(.active):hover {
    background: rgba(255, 255, 255, 0.05);
}
```

---

### 🧠 AI Logika (Hybridný prístup)

#### **Workflow spracovania dotazu**

```javascript
async function handleUserQuery(userInput) {
    // 1. FÁZA: Lokálne FAQ (instant response)
    const localResults = searchFAQ(userInput);
    
    if (localResults.length > 0 && localResults[0].score >= 15) {
        // Vysoká zhoda → Okamžitá odpoveď
        displayFAQAnswer(localResults[0]);
        
        // Zobraz súvisiace otázky
        if (localResults[0].relatedLinks.length > 0) {
            displayRelatedQuestions(localResults[0].relatedLinks);
        }
        return;
    }
    
    // 2. FÁZA: AI Fallback (pre komplexné otázky)
    if (localResults.length > 0 && localResults[0].score >= 8) {
        // Stredná zhoda → AI s kontextom
        const context = localResults.slice(0, 3).map(faq => faq.answer).join('\n\n');
        const aiResponse = await askAIWithContext(userInput, context);
        displayAIAnswer(aiResponse);
    } else {
        // Nízka/žiadna zhoda → Čistá AI
        const aiResponse = await askAIPure(userInput);
        displayAIAnswer(aiResponse);
        
        // Zaznamenaj neznámu otázku pre analýzu
        logUnknownQuestion(userInput);
    }
}
```

#### **AI System Prompt (Gemini/Groq)**

```javascript
const HELP_MODE_SYSTEM_PROMPT = `
Si asistent OKR Portálu pre Odbor krízového riadenia Banská Bystrica.

TVOJA ÚLOHA:
Pomáhaš používateľom s otázkami o aplikácii. Odpovedaj KRÁTKO, JASNE a PRIATEĽSKY.

MODULY APLIKÁCIE:
1. Dashboard - prehľad (pohotovosť, kalendár, meniny, počasie)
2. Cestovný príkaz - vytváranie CP, IBAN, vyúčtovanie stravy, šablóny
3. Dovolenky - evidencia dovoleniek, zostatok, žiadosti
4. Pohotovosť - rozpis služieb, rotácie, výkazy
5. IZS - dochádzka, nadčasy, príplatky
6. UA - príspevky pre ukrajinských utečencov, emailing pre obce
7. PHM - evidencia tankovaní, spotreba vozidiel, história

ŠTÝL ODPOVEDÍ:
- Používaj **emoji** pre lepšiu vizuálnosť
- Číslovanie krokov (1., 2., 3.)
- Krátke vety
- Ak nevieš → "Odporúčam kontaktovať správcu aplikácie"

DOSTUPNÝ KONTEXT FAQ:
${FAQ_DATABASE.map(faq => `- ${faq.category}: ${faq.questions[0]}`).join('\n')}

PRÍKLAD ODPOVEDE:
User: "ako pridať tankovanie"
Bot: "**Pridanie tankovania:**

1. Prejdi do modulu **PHM** ⛽
2. Klikni na kartu vozidla
3. Tlačidlo **Tankovanie**
4. Vyplň dátum, litre, km
5. Uložiť

✅ Spotreba sa vypočíta automaticky!"
`;
```

---

### 🎯 Pokročilé funkcie

#### **A. Kontextové napovedy**

```javascript
function detectCurrentModule() {
    const activeModule = document.querySelector('.module-content:not(.hidden)');
    return activeModule?.id || 'dashboard__module';
}

function addContextualHint(response, userQuery) {
    const currentModule = detectCurrentModule();
    
    // Ak sa pýta na funkciu v aktuálnom module
    if (userQuery.includes('tankovanie') && currentModule === 'fuel__module') {
        response += '\n\n💡 **Tip:** Práve si v module PHM - tlačidlo je priamo tu!';
        
        // Highlight tlačidlo na 3 sekundy
        highlightElement('#fuel__btn-add-refuel', 3000);
    }
    
    return response;
}

function highlightElement(selector, duration = 3000) {
    const element = document.querySelector(selector);
    if (!element) return;
    
    element.classList.add('ai-highlight');
    setTimeout(() => {
        element.classList.remove('ai-highlight');
    }, duration);
}
```

**CSS pre highlight:**
```css
@keyframes pulseHighlight {
    0%, 100% { box-shadow: 0 0 0 0 rgba(221, 89, 13, 0.7); }
    50% { box-shadow: 0 0 20px 10px rgba(221, 89, 13, 0); }
}

.ai-highlight {
    animation: pulseHighlight 1s ease-out 3;
    border: 2px solid var(--color-orange-accent) !important;
}
```

---

#### **B. Guided Tour (Voliteľné)**

```javascript
function startGuidedTour(topic) {
    const tours = {
        'cestovny-prikaz': [
            {
                step: 1,
                target: '.bento-card[data-target="cestovny-prikaz-module"]',
                message: '➜ Klikni sem pre otvorenie modulu Cestovný príkaz',
                action: 'click'
            },
            {
                step: 2,
                target: '#sidebar__right-panel',
                message: '➜ Tu vpravo vyber zamestnanca',
                highlight: true
            },
            {
                step: 3,
                target: '#cp__ucel',
                message: '➜ Vyplň účel cesty',
                highlight: true
            },
            {
                step: 4,
                target: '#cp__generate-btn',
                message: '➜ Nakoniec klikni Generovať',
                highlight: true
            }
        ]
    };
    
    if (tours[topic]) {
        executeTour(tours[topic]);
    }
}

async function executeTour(steps) {
    for (const step of steps) {
        await showTourStep(step);
        await waitForUserAction(step);
    }
    showToast('✅ Tour dokončený!', 'success');
}
```

---

#### **C. Analytics neznámych otázok**

```javascript
// Firestore štruktúra
unknown_questions/
  └── {timestamp}
      - query: "ako vymazať auto"
      - userId: "user123"
      - currentModule: "fuel__module"
      - timestamp: 2026-01-06T10:30:00
      - resolved: false

// Funkcia logovania
async function logUnknownQuestion(query) {
    if (query.length < 5) return; // Ignoruj krátke
    
    await addDoc(collection(db, 'unknown_questions'), {
        query: query,
        userId: currentUser.uid,
        currentModule: detectCurrentModule(),
        timestamp: new Date(),
        resolved: false
    });
}

// Admin panel - Top neznáme otázky
async function getTopUnknownQuestions(limit = 10) {
    const q = query(
        collection(db, 'unknown_questions'),
        where('resolved', '==', false),
        orderBy('timestamp', 'desc'),
        limit(limit)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
}
```

---

### ✅ Kontrolný zoznam implementácie

- [ ] **FAQ Databáza**
  - [ ] Vytvoriť `js/faq_database.js` s 20-30 FAQ
  - [ ] Testovať search algoritmus
  - [ ] Pridať related links

- [ ] **UI Rozšírenia**
  - [ ] Toggle tlačidlá (Kontakty/Nápoveda)
  - [ ] Quick FAQ buttons
  - [ ] Vizuálne odlíšenie FAQ vs AI odpovedí
  - [ ] CSS animácie pre highlighting

- [ ] **Logika**
  - [ ] Hybridný workflow (FAQ → AI fallback)
  - [ ] searchFAQ() s fuzzy matchingom
  - [ ] AI integration (Gemini/Groq)
  - [ ] System prompt optimization

- [ ] **Pokročilé funkcie**
  - [ ] Kontextové napovedy (modul detection)
  - [ ] Element highlighting
  - [ ] Guided tours (voliteľné)
  - [ ] Analytics neznámych otázok

- [ ] **Testing**
  - [ ] Unit testy pre search
  - [ ] E2E testy pre user flow
  - [ ] Performance (rychlosť odpovedí)
  - [ ] Edge cases (prázdne dotazy, spam)

---

## 📅 Implementačný plán

### **Week 1 - Šablóny CP**
- **Day 1-2:** Firestore štruktúra + Security Rules
- **Day 3-4:** Modal UI + CSS
- **Day 5:** CRUD logika + validácia

### **Week 2 - FAQ Chatbot (Základ)**
- **Day 1-2:** FAQ databáza (20 FAQ)
- **Day 3:** Toggle režimov v UI
- **Day 4:** Lokálny search algoritmus
- **Day 5:** Quick FAQ buttons

### **Week 3 - AI Integrácia**
- **Day 1-2:** Hybridný workflow
- **Day 3:** AI system prompt tuning
- **Day 4:** Kontextové napovedy
- **Day 5:** Testing + bugfixing

### **Week 4 - Polish & Deployment**
- **Day 1:** Guided tours
- **Day 2:** Analytics setup
- **Day 3:** Performance optimization
- **Day 4:** Final testing
- **Day 5:** Production deployment

---

## 🎓 Poznámky pre budúcu implementáciu

### **Priorita funkcií:**
1. ⭐⭐⭐ **Must-have:** Šablóny CP + Základné FAQ
2. ⭐⭐ **Should-have:** AI fallback + Quick buttons
3. ⭐ **Nice-to-have:** Guided tours + Analytics

### **Technické závislosti:**
- Gemini API kľúč (už existuje v `config.js`)
- Firestore indexes pre rýchle dotazy
- Service Worker update pre PWA cache

### **Bezpečnostné úvahy:**
- Rate limiting pre AI API (max. 10 dotazov/min/user)
- Sanitizácia user inputu pred AI
- Firestore Rules: Šablóny len pre vlastníka

---

**Poznámka:** Tento dokument slúži ako referenčná príručka. Pred implementáciou odporúčam:
1. Review s tímom/používateľmi
2. Prototyping UI v Figma
3. A/B testing pre FAQ vs. AI pomer

**Autor:** GitHub Copilot  
**Verzia:** 1.0  
**Posledná aktualizácia:** 6.1.2026
