import { Permissions } from './accesses.js'; //

/**
 * Vykreslí Admin Widget "Stav systému" do pravého stĺpca dashboardu.
 * @param {Object} db - Firestore inštancia
 * @param {Object} user - Aktívny používateľ
 */
export async function renderAdminWidget(db, user) {
    // 1. Kontrola oprávnení (iba vedúci odboru vidí tento widget)
    // Používame existujúcu logiku z accesses.js
    if (!Permissions.canManageLogs(user)) {
        return; 
    }

    const rightCol = document.querySelector('.dashboard-right-col'); //
    if (!rightCol) return;

    // 2. Vytvorenie kontajnera pre widget (vložíme ho hneď pod privítanie)
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'dashboard-card'; //
    widgetContainer.style.borderLeft = '4px solid #E53E3E'; // Červený prúžok pre odlíšenie (Admin)
    widgetContainer.innerHTML = `
        <h2 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-shield-alt"></i> Stav systému
        </h2>
        <div id="admin-system-alerts"></div>
        <h3 style="font-size: 0.9rem; text-transform: uppercase; color: var(--color-text-secondary); margin-top: 1rem; margin-bottom: 0.5rem;">
            Posledná aktivita
        </h3>
        <ul id="admin-recent-logs" class="admin-logs-list">
            <li style="text-align: center;">Načítavam logy...</li>
        </ul>
    `;

    // Vložíme widget do DOMu (za prvý element, zvyčajne Welcome Card)
    if (rightCol.children.length > 0) {
        rightCol.insertBefore(widgetContainer, rightCol.children[1]); 
    } else {
        rightCol.appendChild(widgetContainer);
    }

    // 3. KONTROLA: Chýbajúci rozpis pohotovosti
    checkScheduleStatus(db);

    // 4. NAČÍTANIE: Posledné logy
    loadRecentLogs(db);
}

/**
 * Skontroluje, či existuje rozpis na aktuálny mesiac.
 */
async function checkScheduleStatus(db) {
    const alertsContainer = document.getElementById('admin-system-alerts');
    const now = new Date();
    const currentDocId = `${now.getFullYear()}-${now.getMonth()}`; // Formát ID z schd_module.js

    try {
        const docSnap = await db.collection("publishedSchedules").doc(currentDocId).get();
        
        // Ak dokument neexistuje alebo nemá priradenia
        if (!docSnap.exists || !docSnap.data().dutyAssignments || Object.keys(docSnap.data().dutyAssignments).length === 0) {
            alertsContainer.innerHTML = `
                <div class="admin-alert-box">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>POZOR: Nie je zverejnený rozpis pohotovosti na tento mesiac!</span>
                </div>
            `;
        }
    } catch (error) {
        console.error("Chyba pri kontrole rozpisu:", error);
    }
}

/**
 * Načíta posledných 5 logov z kolekcie access_logs.
 */
async function loadRecentLogs(db) {
    const logsList = document.getElementById('admin-recent-logs');
    
    try {
        // Firestore query: access_logs, zoradené podľa času, limit 5
        const snapshot = await db.collection("access_logs")
            .orderBy("timestamp", "desc")
            .limit(5)
            .get();

        if (snapshot.empty) {
            logsList.innerHTML = '<li>Žiadna nedávna aktivita.</li>';
            return;
        }

        logsList.innerHTML = ''; // Vyčistiť loader

        snapshot.forEach(doc => {
            const log = doc.data(); //
            
            // Formátovanie času
            let timeStr = '---';
            if (log.timestamp && log.timestamp.toDate) {
                const date = log.timestamp.toDate();
                timeStr = date.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' }) + 
                          ` (${date.getDate()}.${date.getMonth() + 1}.)`;
            }

            // Formátovanie textu akcie
            const actionText = log.action || 'NEZNÁMA AKCIA';
            const userText = log.meno || log.email || 'Neznámy';
            const statusColor = log.success ? 'var(--color-text-primary)' : '#fc8181'; // Červená pre chyby

            const li = document.createElement('li');
            li.innerHTML = `
                <div class="log-meta">
                    <span>${userText}</span>
                    <span>${timeStr}</span>
                </div>
                <div class="log-action" style="color: ${statusColor}">
                    ${actionText}: ${log.details || ''}
                </div>
            `;
            logsList.appendChild(li);
        });

    } catch (error) {
        console.error("Chyba pri načítaní logov:", error);
        logsList.innerHTML = '<li style="color: #fc8181;">Nepodarilo sa načítať logy.</li>';
    }
}