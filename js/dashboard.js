// === MODUL PRE DASHBOARD FUNKCIONALITY ===

import { store } from './store.js';
import { getSkeletonHTML } from './utils.js';
import { GROUP_COLORS } from './constants.js';
import { lazyLoader } from './lazy_loader.js';
import { IDs } from './id-registry.js';
import {
    collection,
    query,
    where,
    getDocs,
    getDoc,
    doc,
    Timestamp,
    collectionGroup
} from 'firebase/firestore';

/**
 * Trieda na správu dashboard funkcionalít.
 */
export class DashboardManager {
    constructor() {
        this.calendarEl = document.getElementById(IDs.DASHBOARD.CALENDAR_RENDER_AREA);
        this.filterPohotovost = document.getElementById(IDs.DASHBOARD.FILTER_POHOTOVOST);
        this.filterIzsDay = document.getElementById(IDs.DASHBOARD.FILTER_IZS_DAY);
        this.filterIzsNight = document.getElementById(IDs.DASHBOARD.FILTER_IZS_NIGHT);
        this.filterDovolenky = document.getElementById(IDs.DASHBOARD.FILTER_DOVOLENKY);
        this.listElement = document.getElementById(IDs.DASHBOARD.DUTY_LIST_ITEMS);
    }

    /**
     * Inicializuje dashboard kalendár.
     */
    async initializeCalendar() {
        if (!this.calendarEl) return;

        this.calendarEl.innerHTML = getSkeletonHTML('calendar');
        const db = store.getDB();
        if (!db) return;

        const { FullCalendar } = await lazyLoader.loadCalendarBundle();
        try {
            const calendar = new FullCalendar.Calendar(this.calendarEl, {
                initialView: 'dayGridMonth',
                locale: 'sk',
                firstDay: 1,
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek'
                },
                buttonText: { today: 'dnes', month: 'mesiac', week: 'týždeň' },
                height: 'auto',
                dayMaxEvents: 4,

                eventMouseEnter: function(info) {
                    const employeeList = info.event.extendedProps.employeeNames || [];
                    const groupName = info.event.extendedProps.tooltipTitle || info.event.title || '';
                    if (employeeList.length === 0) return;
                    const tooltip = document.createElement('div');
                    tooltip.className = 'calendar-tooltip';
                    tooltip.id = 'current-calendar-tooltip';
                    let namesHtml = employeeList.map(name => `• ${name}`).join('<br>');
                    tooltip.innerHTML = `<strong>${groupName}</strong><div style="margin-top:4px;">${namesHtml}</div>`;
                    document.body.appendChild(tooltip);
                    const padding = 15;
                    tooltip.style.left = (info.jsEvent.pageX + padding) + 'px';
                    tooltip.style.top = (info.jsEvent.pageY + padding) + 'px';
                },

                eventMouseLeave: function(info) {
                    const tooltip = document.getElementById('current-calendar-tooltip');
                    if (tooltip) tooltip.remove();
                },

                events: async (fetchInfo, successCallback, failureCallback) => {
                    await this._loadCalendarEvents(fetchInfo, successCallback, failureCallback);
                }
            });

            calendar.render();
            if (this.filterPohotovost) this.filterPohotovost.addEventListener('change', () => calendar.refetchEvents());
            if (this.filterIzsDay) this.filterIzsDay.addEventListener('change', () => calendar.refetchEvents());
            if (this.filterIzsNight) this.filterIzsNight.addEventListener('change', () => calendar.refetchEvents());
            if (this.filterDovolenky) this.filterDovolenky.addEventListener('change', () => calendar.refetchEvents());
            
            // Store calendar instance for external refetch triggers
            this.calendarInstance = calendar;

        } catch (e) {
            console.error("Chyba pri inicializácii FullCalendar:", e);
            this.calendarEl.innerHTML = `<p style="color: red; padding: 1rem;">Chyba: Nepodarilo sa načítať kalendár.</p>`;
        }
    }

    async _loadCalendarEvents(fetchInfo, successCallback, failureCallback) {
        const showPohotovost = this.filterPohotovost ? this.filterPohotovost.checked : true;
        const showIzsDay = this.filterIzsDay ? this.filterIzsDay.checked : true;
        const showIzsNight = this.filterIzsNight ? this.filterIzsNight.checked : true;
        const showDovolenky = this.filterDovolenky ? this.filterDovolenky.checked : true;

        const start = fetchInfo.start;
        const end = fetchInfo.end;
        let monthsToQuery = new Set();
        let currentDate = new Date(start);

        while (currentDate < end) {
            monthsToQuery.add(`${currentDate.getFullYear()}-${currentDate.getMonth()}`);
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        const endMonthDate = new Date(end);
        endMonthDate.setDate(endMonthDate.getDate() - 1);
        monthsToQuery.add(`${endMonthDate.getFullYear()}-${endMonthDate.getMonth()}`);

        try {
            const db = store.getDB();
            const docIds = Array.from(monthsToQuery);
            const promisesPohotovost = docIds.map(docId => getDoc(doc(db, "publishedSchedules", docId)));
            const promisesIZS = docIds.map(docId => getDoc(doc(db, "publishedSchedulesIZS", docId)));

            const [snapshotsPohotovost, snapshotsIZS] = await Promise.all([
                Promise.all(promisesPohotovost),
                Promise.all(promisesIZS)
            ]);

            let allCalendarEvents = [];

            if (showPohotovost) {
                allCalendarEvents.push(...await this._loadPohotovostEvents(snapshotsPohotovost, start, end));
            }

            if (showIzsDay || showIzsNight) {
                allCalendarEvents.push(...await this._loadIZSEvents(snapshotsIZS, showIzsDay, showIzsNight));
            }

            if (showDovolenky) {
                allCalendarEvents.push(...await this._loadVacationEvents(fetchInfo));
            }

            successCallback(allCalendarEvents);
        } catch (err) {
            console.error("Chyba pri spracovaní dát rozpisov:", err);
            failureCallback(err);
        }
    }

    async _loadPohotovostEvents(snapshotsPohotovost, start, end) {
        const events = [];
        const formatLocalDate = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        for (const docSnap of snapshotsPohotovost) {
            if (!docSnap.exists()) continue;
            const schedule = docSnap.data();
            const dutyAssignments = schedule.dutyAssignments || {};
            const serviceOverrides = schedule.serviceOverrides || {};
            const docYear = schedule.year;
            const docMonth = schedule.month;
            const monthStartDate = new Date(docYear, docMonth, 1);
            const monthEndDate = new Date(docYear, docMonth + 1, 0);

            for (const weekKey in dutyAssignments) {
                const [year, weekNum] = weekKey.split('-').map(Number);
                const weekStartDate_ISO = this._getDateOfISOWeek(weekNum, year);
                const weekEndDate_ISO = new Date(weekStartDate_ISO);
                weekEndDate_ISO.setDate(weekStartDate_ISO.getDate() + 6);

                const finalStartDate = new Date(Math.max(weekStartDate_ISO.getTime(), monthStartDate.getTime()));
                const finalEndDate = new Date(Math.min(weekEndDate_ISO.getTime(), monthEndDate.getTime()));
                const calendarEndDate = new Date(finalEndDate);
                calendarEndDate.setDate(calendarEndDate.getDate() + 1);

                const weekAssignments = dutyAssignments[weekKey];

                if (weekAssignments && weekAssignments.length > 0) {
                    const firstAssignment = weekAssignments[0];
                    const groupName = firstAssignment.skupina || "Neznáma skupina";
                    const groupColor = GROUP_COLORS[groupName] || '#808080';
                    const employeeNames = [];
                    const weekOverrides = serviceOverrides[weekKey] || {};

                    weekAssignments.forEach(assignment => {
                        let fullName = assignment.meno;
                        let suffix = '';
                        if (weekOverrides[assignment.id]) {
                            const overrideData = weekOverrides[assignment.id];
                            fullName = overrideData.meno || 'Neznámy';
                            if (overrideData.type === 'sub') suffix = ' (Zástup)';
                            if (overrideData.type === 'swap') suffix = ' (Výmena)';
                        }
                        const nameParts = fullName.trim().split(/\s+/);
                        const surname = nameParts.length > 0 ? nameParts[nameParts.length - 1] : fullName;
                        employeeNames.push(surname + suffix);
                    });

                    let currentLoopDate = new Date(finalStartDate);
                    while (currentLoopDate < calendarEndDate) {
                        const dateStr = formatLocalDate(currentLoopDate);
                        events.push({
                            start: dateStr, end: dateStr, display: 'background',
                            backgroundColor: groupColor, classNames: ['pohotovost-strip-day'], allDay: true,
                            extendedProps: { tooltipTitle: 'Pohotovosť:', employeeNames: employeeNames }
                        });
                        currentLoopDate.setDate(currentLoopDate.getDate() + 1);
                    }
                }
            }
        }
        return events;
    }

    async _loadIZSEvents(snapshotsIZS, showIzsDay, showIzsNight) {
        const events = [];
        for (const docSnap of snapshotsIZS) {
            if (!docSnap.exists()) continue;
            const data = docSnap.data();
            const year = data.year;
            const monthIndex = data.monthIndex;
            const daysMap = data.days || {};

            for (const [dayStr, shifts] of Object.entries(daysMap)) {
                const day = parseInt(dayStr, 10);
                if (showIzsDay && shifts.dayShift && shifts.dayShift.length > 0) {
                    const startD = new Date(year, monthIndex, day, 6, 30);
                    const endD = new Date(year, monthIndex, day, 18, 30);
                    events.push({
                        start: startD.toISOString(), end: endD.toISOString(), allDay: true, display: 'background',
                        classNames: ['izs-strip-day'],
                        extendedProps: { tooltipTitle: 'IZS denná:', employeeNames: shifts.dayShift.map(name => name.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')) }
                    });
                }
                if (showIzsNight && shifts.nightShift && shifts.nightShift.length > 0) {
                    const startN = new Date(year, monthIndex, day, 18, 30);
                    const endN = new Date(year, monthIndex, day, 23, 59);
                    events.push({
                        start: startN.toISOString(), end: endN.toISOString(), allDay: true, display: 'background',
                        classNames: ['izs-strip-night'],
                        extendedProps: { tooltipTitle: 'IZS nočná:', employeeNames: shifts.nightShift.map(name => name.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')) }
                    });
                }
            }
        }
        return events;
    }

    async _loadVacationEvents(fetchInfo) {
        const events = [];
        try {
            const db = store.getDB();
            const vacRef = collectionGroup(db, "vacationRequests");
            const qVac = query(vacRef,
                where("endDate", ">=", Timestamp.fromDate(fetchInfo.start)),
                where("startDate", "<", Timestamp.fromDate(fetchInfo.end))
            );

            const vacSnap = await getDocs(qVac);

            const dailyVacations = {};

            vacSnap.forEach(vDoc => {
                const vData = vDoc.data();
                
                // ✅ OPRAVA: Získaj employeeId z cesty dokumentu, nie z poľa
                const docPath = vDoc.ref.path;  // napr. "employees/emp-123/vacationRequests/doc-456"
                const pathParts = docPath.split('/');
                const empIdFromPath = pathParts.length >= 2 ? pathParts[1] : null;
                
                // Použi employeeId z poľa ak existuje, inak z cesty
                const empId = vData.employeeId || empIdFromPath;
                if (!empId) return;
                
                const emp = store.getEmployee(empId);
                if (!emp) return;

                const start = vData.startDate.toDate();
                const end = vData.endDate.toDate();

                let current = new Date(start);
                while (current <= end) {
                    const dateKey = current.toISOString().split('T')[0];

                    if (current >= fetchInfo.start && current < fetchInfo.end) {
                        if (!dailyVacations[dateKey]) dailyVacations[dateKey] = new Set();
                        dailyVacations[dateKey].add(emp.displayName);
                    }
                    current.setDate(current.getDate() + 1);
                }
            });

            for (const [date, namesSet] of Object.entries(dailyVacations)) {
                events.push({
                    start: date,
                    end: date,
                    display: 'background',
                    backgroundColor: '#8fad0c',
                    classNames: ['vacation-strip'],
                    allDay: true,
                    extendedProps: {
                        tooltipTitle: 'Dovolenka:',
                        employeeNames: Array.from(namesSet)
                    }
                });
            }
        } catch (err) {
            console.error("Chyba pri načítaní dovoleniek pre kalendár:", err);
        }
        return events;
    }

    _getDateOfISOWeek(w, y) {
        const jan4 = new Date(Date.UTC(y, 0, 4));
        const jan4Day = (jan4.getUTCDay() + 6) % 7;
        const mondayOfW1 = new Date(jan4.valueOf() - jan4Day * 86400000);
        return new Date(mondayOfW1.valueOf() + (w - 1) * 7 * 86400000);
    }

    _getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const isoYear = d.getUTCFullYear();
        const yearStart = new Date(Date.UTC(isoYear, 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return { week: weekNo, year: isoYear };
    }

    /**
     * Obnovuje kalendár (napr. po zmene dovolienko).
     * Volané z iných modulov po zmene dát.
     */
    refetchCalendarEvents() {
        if (this.calendarInstance) {
            console.log('[Dashboard] Obnovujem kalendár...');
            this.calendarInstance.refetchEvents();
        }
    }

    /**
     * Načíta pohotovosť pre dnešok.
     */
    async loadDutyToday() {
        if (!this.listElement) return;

        this.listElement.innerHTML = getSkeletonHTML('list', 3);
        const db = store.getDB();
        if (!db) return;

        try {
            const today = new Date();
            const docId = `${today.getFullYear()}-${today.getMonth()}`;
            const weekInfo = this._getWeekNumber(today);
            const weekKey = `${weekInfo.year}-${weekInfo.week}`;

            const docRef = doc(db, "publishedSchedules", docId);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                this.listElement.innerHTML = '<li>Pre dnešok nie je zverejnený rozpis.</li>';
                return;
            }

            const schedule = docSnap.data();
            const dutyAssignments = schedule.dutyAssignments || {};
            const serviceOverrides = schedule.serviceOverrides || {};
            const reporting = schedule.reporting || {};

            const weekAssignments = dutyAssignments[weekKey];
            const weekOverrides = serviceOverrides[weekKey] || {};
            const reportersForWeek = reporting[weekKey] || [];

            if (!weekAssignments || weekAssignments.length === 0) {
                this.listElement.innerHTML = '<li>Pre tento týždeň nie sú priradení zamestnanci.</li>';
                return;
            }

            let finalEmployees = [];
            for (const assignment of weekAssignments) {
                const originalId = assignment.id;
                let finalEmployeeId = originalId;
                let finalEmployeeName = assignment.meno;
                let suffix = '';

                if (weekOverrides[originalId]) {
                    const overrideData = weekOverrides[originalId];
                    finalEmployeeId = overrideData.id;
                    finalEmployeeName = overrideData.meno || 'Chyba mena';

                    if (overrideData.type === 'sub') suffix = ' (Zástup)';
                    else if (overrideData.type === 'swap') suffix = ' (Výmena)';
                }

                const employeeInfo = store.getEmployee(finalEmployeeId);
                let displayInfo = 'Telefón neuvedený';
                if (employeeInfo && employeeInfo.displayTelefon) {
                    displayInfo = employeeInfo.displayTelefon.split(',')[0].trim();
                }
                const isReporting = reportersForWeek.includes(finalEmployeeId);

                finalEmployees.push({
                    name: finalEmployeeName,
                    suffix: suffix,
                    displayInfo: displayInfo,
                    isReporting: isReporting
                });
            }

            this.listElement.innerHTML = '';
            if (finalEmployees.length === 0) {
                this.listElement.innerHTML = '<li>Nenašli sa žiadni relevantní zamestnanci pre dnešný deň.</li>';
                return;
            }

            finalEmployees.forEach(emp => {
                const li = document.createElement('li');
                if (emp.isReporting) li.classList.add('reporting');

                li.innerHTML = `
                    <div class="dashboard-emp-details">
                        <span class="dashboard-emp-name">${emp.name}${emp.suffix}</span>
                        <span class="dashboard-emp-position">${emp.displayInfo}</span>
                    </div>
                `;
                this.listElement.appendChild(li);
            });

        } catch (error) {
            console.error("Chyba pri načítaní pohotovosti pre dashboard:", error);
            this.listElement.innerHTML = '<li>Chyba pri načítaní dát.</li>';
        }
    }
}