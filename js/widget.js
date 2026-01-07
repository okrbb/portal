/* widget.js - Modular SDK Ready (No Firebase calls here) */
import { IDs } from './id-registry.js';

/**
 * ===================================
 * WIDGET PRE PRIVÍTANIE, POČASIE, MENINY (Lokálne JSON) A SVIATKY (API)
 * (widget.js)
 * ===================================
 */

/**
 * Aktualizuje widget s privítaním, meninami, sviatkami a počasím.
 * @param {Object} user - Objekt prihláseného používateľa
 */
export async function updateWelcomeWidget(user) {
    const greetingEl = document.getElementById(IDs.DASHBOARD.WELCOME_GREETING);
    const dateEl = document.getElementById(IDs.DASHBOARD.WELCOME_DATE);
    const meninyEl = document.getElementById(IDs.DASHBOARD.WELCOME_MENINY);
    const sviatokEl = document.getElementById(IDs.DASHBOARD.WELCOME_SVIATOK);
    const iconEl = document.getElementById(IDs.DASHBOARD.WELCOME_ICON);
    const tempEl = document.getElementById(IDs.DASHBOARD.WELCOME_TEMP);

    if (!greetingEl || !dateEl) return;

    const now = new Date();
    const hour = now.getHours();
    
    // 1. Meno používateľa
    const name = user.meno ? user.meno : (user.displayName || 'Používateľ');

    // 2. Základný pozdrav podľa času
    let greetingText = '';
    let iconClass = 'fa-cloud'; 

    if (hour >= 6 && hour < 10) {
        greetingText = `Dobré ráno, ${name}`;
        iconClass = 'fa-mug-hot'; 
    } else if (hour >= 10 && hour < 18) {
        greetingText = `Dobrý deň, ${name}`;
        iconClass = 'fa-sun'; 
    } else {
        greetingText = `Dobrý večer, ${name}`;
        iconClass = 'fa-moon'; 
    }

    // 3. Formátovanie dátumu
    const days = ['nedeľa', 'pondelok', 'utorok', 'streda', 'štvrtok', 'piatok', 'sobota'];
    const dayName = days[now.getDay()];
    
    // Pre zobrazenie (s nulami na začiatku)
    const dayStr = String(now.getDate()).padStart(2, '0');
    const monthStr = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    
    // Pre vyhľadávanie v JSON (čísla)
    const currentMonthInt = now.getMonth() + 1;
    const currentDayInt = now.getDate();

    const dateText = `je ${dayName}, ${dayStr}.${monthStr}.${year}`;

    // Vykreslenie základných textov
    greetingEl.textContent = greetingText;
    dateEl.textContent = dateText;
    if (iconEl) iconEl.className = `fas ${iconClass} welcome-icon`;

    // ============================================================
    // 4. DÁTA: MENINY (JSON) + SVIATKY (API) + POČASIE (API)
    // ============================================================

    const API_KEY_WEATHER = 'a98b050275806f5b5ed7c2d720ac5e4c'; 
    const LAT = '48.7333'; // Banská Bystrica
    const LON = '19.1500';

    const promises = [];

    // A) MENINY (Lokálny JSON: data/names.json)
    if (meninyEl) {
        const meninyPromise = fetch('./data/names.json')
            .then(response => {
                if (!response.ok) throw new Error('Chyba načítania names.json');
                return response.json();
            })
            .then(namesData => {
                // namesData je pole objektov: [{ "month": 1, "day": 2, "names": ["Alexandra", ...] }, ...]
                // Nájdeme objekt pre dnešný deň
                const todayEntry = namesData.find(item => item.month === currentMonthInt && item.day === currentDayInt);
                
                if (todayEntry && todayEntry.names && todayEntry.names.length > 0) {
                    // Spojíme mená čiarkou (napr. "Alexandra, Sandra, Karina")
                    meninyEl.textContent = `Meniny má: ${todayEntry.names.join(', ')}`;
                } else {
                    meninyEl.textContent = ''; 
                }
            })
            .catch(err => {
                console.warn('Widget: Nepodarilo sa načítať meniny z JSON:', err);
                meninyEl.textContent = '';
            });
        promises.push(meninyPromise);
    }

    // B) SVIATKY (API: date.nager.at)
    if (sviatokEl) {
        const todayString = `${year}-${monthStr}-${dayStr}`; // Formát YYYY-MM-DD

        const sviatkyPromise = fetch(`https://date.nager.at/api/v3/publicholidays/${year}/SK`)
            .then(response => {
                if (!response.ok) throw new Error('Chyba sviatky API');
                return response.json();
            })
            .then(data => {
                const holiday = data.find(h => h.date === todayString);
                
                if (holiday) {
                    sviatokEl.innerHTML = `Sviatok:<br><span>${holiday.localName}</span>`;
                    sviatokEl.style.display = 'block';
                } else {
                    sviatokEl.textContent = '';
                    sviatokEl.style.display = 'none';
                }
            })
            .catch(err => {
                console.warn('Widget: Nepodarilo sa načítať sviatky:', err);
                sviatokEl.textContent = '';
            });
        promises.push(sviatkyPromise);
    }

    // C) POČASIE (OpenWeatherMap)
    if (API_KEY_WEATHER !== 'VAS_API_KLUC') {
        const weatherPromise = fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${LAT}&lon=${LON}&appid=${API_KEY_WEATHER}&units=metric`)
            .then(response => {
                if (!response.ok) throw new Error('Chyba počasie API');
                return response.json();
            })
            .then(data => {
                const weatherId = data.weather[0].id; 
                const isNight = (hour >= 20 || hour < 6); 

                let weatherIcon = 'fa-cloud';
                if (weatherId >= 200 && weatherId < 300) weatherIcon = 'fa-bolt'; 
                else if (weatherId >= 300 && weatherId < 500) weatherIcon = 'fa-cloud-rain'; 
                else if (weatherId >= 500 && weatherId < 600) weatherIcon = 'fa-cloud-showers-heavy'; 
                else if (weatherId >= 600 && weatherId < 700) weatherIcon = 'fa-snowflake'; 
                else if (weatherId >= 700 && weatherId < 800) weatherIcon = 'fa-smog'; 
                else if (weatherId === 800) weatherIcon = isNight ? 'fa-moon' : 'fa-sun';
                else if (weatherId > 800) {
                    weatherIcon = 'fa-cloud'; 
                    if (weatherId === 801 || weatherId === 802) weatherIcon = isNight ? 'fa-cloud-moon' : 'fa-cloud-sun';
                }

                if (iconEl) {
                    iconEl.className = `fas ${weatherIcon} welcome-icon`;
                    iconEl.title = `Aktuálne: ${data.weather[0].description}`;
                }
                if (tempEl) {
                    const teplota = Math.round(data.main.temp);
                    tempEl.textContent = `${teplota}°C`;
                }
            })
            .catch(err => {
                console.warn("Widget: Nepodarilo sa načítať počasie:", err);
            });
        promises.push(weatherPromise);
    }

    await Promise.allSettled(promises);
}