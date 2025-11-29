# OKR Portál - Interný Zamestnanecký Systém

Moderná webová aplikácia pre správu zamestnancov, rozpisov pohotovostí, cestovných príkazov a príspevkov úrazového poistenia.

## 📋 Popis

OKR Portál je integrovaný systém určený pre interné procesy organizácie, ktorý kombinuje správu ľudských zdrojov s plánovacími a administratívnymi funkciami. Aplikácia využíva Firebase Firestore ako cloudovú databázu a poskytuje moderné používateľské rozhranie s tmavým dizajnom.

## 🎯 Hlavné Funkcie

### Dashboard
- **Prehľad pohotovostí**: Zobrazenie zamestnancov na pohotovosti pre aktuálny deň
- **Kalendár rozpisov**: Integrácia FullCalendar pre vizualizáciu mesačných rozpisov pohotovostí s podporou týždenných cyklov
- **Globálny zoznam zamestnancov**: Centralizovaný a prehľadný zoznam všetkých zamestnancov s real-time aktualizáciou

### Modul Ľudské Zdroje (Admin Panel)
- **Správa zamestnancov**: Kompletná databáza s kontaktmi a dátumom nástupu
- **Platové údaje**: Platové triedy, tarify, osobné príplatky, zmeny a pohotovosti
- **Export logov**: Sťahovanie prístupových logov do Excel formátu
- **Mazanie logov**: Dávkové mazanie prístupových logov s modálnym potvrdením

### Modul Rozpis Pohotovosti
- **Automatické rozpisovanie**: Drag & drop rozpisovanie troch pohotovostných skupín do týždenných slotov
- **Zastupovanie**: Dvojklikom výber zamestnanca a priradenie náhradníka
- **Výmena**: Pravým tlačidlom myši výmena dvoch zamestnancov medzi sebou
- **Reporting**: Označovanie zamestnancov, ktorí skutočne vykonali službu
- **PDF náhľad**: Generovanie PDF dokumentu s náhľadom pred stiahnutím
- **DOCX export**: Generovanie výkazu pohotovosti do Word dokumentu podľa šablóny
- **Publikovanie**: Automatické ukladanie rozpisov do kolekcie `publishedSchedules` pre zobrazenie v kalendári
- **Unicode podpora**: Zobrazovanie symbolov zastúpenia (🕒) a výmeny (⇆) v PDF exportoch

### Modul Rozpis pohotovosti BB kraj
- **Nahratie spborov**: Drag & drop pre nahratie pohotovosti jednotlivých OU
- **Generovnie**: Vygenerovanie kompletného rozpisu pre celý kraj

- ### Modul Rozpis služieb IZS
- **Nahratie spborov**: Drag & drop pre nahratie plánu služieb
- **Generovnie**: Vygenerovanie kompletného rozpisu pre IZS

### Modul Cestovné Príkazy
- **Automatické vyplnenie**: Výber zamestnanca zo zoznamu s automatickým načítaním osobných údajov
- **Formulár**: Komplexný formulár s cieľom, miestom, dátumami a časmi cesty
- **Účtovanie trás**: Zadanie troch úsekov cesty s dátumami a trasami
- **Výpočet stravného**: Automatický výpočet náhrady stravného podľa sadzobníka z Firebase
- **Denné rozpisovanie stravného**: Výpočet stravného samostatne pre každý deň služobnej cesty s prehľadnou tabuľkou
- **Kategorizácia**: Aplikácia sadzieb podľa trvania (5-12h, 12-18h, nad 18h)
- **DOCX generovanie**: Vytváranie cestovného príkazu z Word šablóny s názvom súboru obsahujúcim miesto a dátum

### Modul Príspevky UA (Úrazové Poistenie)
- **Excel import**: Drag & drop nahrávanie Excel súborov s pohotovosťami
- **Spracovanie dát**: Automatická analýza a zoskupenie príspevkov podľa obcí
- **Generovanie emailov**: Automatické vytvorenie emailových správ pre obce s prehľadom príspevkov
- **Emailová databáza**: Načítanie emailových adries obcí z Firebase kolekcie `towns_em`

## 🛠️ Technológie

### Frontend
- **HTML5** + **CSS3**: Moderný sémantický markup a responzívny dizajn
- **JavaScript (ES6+)**: Modulárna architektúra s async/await
- **Firebase SDK**: Autentifikácia a Firestore databáza
- **FullCalendar**: Kalendárne zobrazenie rozpisov
- **SortableJS**: Drag & drop funkcionalita pre rozpisovanie

### Backend & Databáza
- **Firebase Firestore**: NoSQL cloudová databáza s real-time aktualizáciami
- **Firebase Authentication**: Autentifikácia používateľov s emailom

### Knižnice
- **jsPDF**: Generovanie PDF dokumentov
- **jsPDF-AutoTable**: Tabuľky v PDF exportoch
- **docxtemplater**: Generovanie Word dokumentov zo šablón
- **PizZip**: Práca so ZIP archívmi pre DOCX súbory
- **SheetJS (XLSX)**: Import a export Excel súborov
- **FileSaver.js**: Sťahovanie generovaných súborov
- **Flatpickr**: Slovenský kalendárový picker
- **DejaVuSans**: Custom font pre Unicode podporu v PDF

## 🎨 Dizajn

Aplikácia využíva **moderný tmavý režim** s firemným farebným schémom:
- **Primárne farby**: Modrá (#0A2C55) a oranžová (#bc8700)
- **Typografia**: Space Grotesk (nadpisy) a Inter (telo textu)
- **Responzívny dizajn**: Mobilné hamburger menu pre obrazovky pod 900px
- **Efekt skla**: Backdrop filter s rozmazaním pre moderný vzhľad
- **Animácie**: Smooth transitions a hover efekty

### Layout
- **Ľavý sidebar**: Navigačné menu s animovanými gradient bordermi
- **Pravý sidebar**: Globálny zoznam zamestnancov s real-time vyhľadávaním
- **Centrálny obsah**: Modulárna scrollovacia oblasť

## 🔐 Autentifikácia

Systém využíva **Firebase Authentication** s podporou:
- Email/heslo prihlásenie
- Automatické presmerovanie na prihlasovaciu stránku
- Logovanie prístupov do kolekcie `access_logs`
- Zobrazenie používateľa v sidebar päte

## 👥 Používateľské Role

Systém aktuálne rozlišuje prístupy podľa funkcie zamestnanca:
- **Vedúci odboru**: Podpisuje rozpisy pohotovostí
- **Vedúci oddelenia OCOaKP**: Zodpovedá za rozpisy pohotovostí
- **Ostatní používatelia**: Prístup k zobrazeniu a editácii

## 📱 Responzívnosť

Aplikácia je optimalizovaná pre:
- **Desktop**: Plná funkcionalita s trojstĺpcovým layoutom
- **Tablet (< 1200px)**: Skrytie pravého sidebaru
- **Mobil (< 900px)**: Hamburger menu, kolapsnúť panely

## 🔄 Real-time Aktualizácie

Centrálna mapa `allEmployeesData` v `mainWizard.js` zabezpečuje:
- Synchronizáciu dát medzi modulmi
- Automatické prekreslenie zoznamov pri zmene
- Globálne vyhľadávanie v pravom paneli
- Real-time zobrazenie zmien bez refresh stránky

## 🎯 Špecifické Vlastnosti

### Výpočet Stravného
- Načítanie platných sadzieb z Firebase podľa dátumu cesty
- Denné rozpisovanie s kategorizáciou podľa trvania
- Automatické sumovanie celkového stravného
- Zobrazenie validFrom dátumu pre kontrolu

### Rozpis Pohotovostí
- ISO týždenné číslovanie s korekciou na prelome mesiacov
- Unikátne state kľúče vo formáte `${year}-${month}-${weekKey}`
- Prevencia prelievania dát medzi mesiacmi
- Orezanie dátumov na hranice kalendárneho mesiaca

### Bezpečnosť
- Modálne potvrdzovacie dialógy pre kritické akcie
- Validácia povinných polí pri ukladaní
- Prevencia prepsania existujúcich záznamov
- Loading indikátory pre asynchrónne operácie

## 📞 Kontakt a Podpora

Aplikácia je vyvíjaná interným tímom OKR Banská Bystrica.

---

**Verzia**: 2.0 (November 2025)  
**Autor**: OKR Portál Development Team  
**Licencia**: Interné použitie
