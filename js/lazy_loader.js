/* js/lazy_loader.js - Dynamic Import Manager */
/**
 * =============================================
 * LAZY LOADER - Dynamické načítanie knižníc
 * Optimalizácia: Zníženie initial bundle size
 * VERSION: 1.1.0 (2025-01-03) - Pridaná XlsxPopulate
 * =============================================
 */

class LazyLibraryLoader {
    constructor() {
        this.loadedLibs = new Set();
        this.pendingLoads = new Map();
    }

    /**
     * Generický loader pre externe knižnice
     * @param {string} libName - Názov knižnice
     * @param {string} url - CDN URL
     * @param {Function} checkFn - Funkcia na overenie či je knižnica loaded
     */
    async loadScript(libName, url, checkFn) {
        // Ak už je loaded, vráť ju
        if (this.loadedLibs.has(libName) && checkFn()) {
            return checkFn();
        }

        // Ak už prebieha loading, čakaj na neho
        if (this.pendingLoads.has(libName)) {
            return this.pendingLoads.get(libName);
        }

        // Nový load
        const loadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            
            script.onload = () => {
                this.loadedLibs.add(libName);
                this.pendingLoads.delete(libName);
                
                const lib = checkFn();
                if (lib) {
                    console.log(`[LazyLoader] ✅ ${libName} loaded`);
                    resolve(lib);
                } else {
                    reject(new Error(`${libName} not found after load`));
                }
            };
            
            script.onerror = () => {
                this.pendingLoads.delete(libName);
                reject(new Error(`Failed to load ${libName}`));
            };
            
            document.head.appendChild(script);
        });

        this.pendingLoads.set(libName, loadPromise);
        return loadPromise;
    }

    /**
     * Chart.js - Pre grafy a štatistiky
     */
    async loadChartJS() {
        return this.loadScript(
            'ChartJS',
            'https://cdn.jsdelivr.net/npm/chart.js',
            () => window.Chart
        );
    }

    /**
     * XLSX - Pre Excel export/import
     */
    async loadXLSX() {
        return this.loadScript(
            'XLSX',
            'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
            () => window.XLSX
        );
    }

    /**
     * FullCalendar - Pre rozvrhy
     */
    async loadFullCalendar() {
        return this.loadScript(
            'FullCalendar',
            'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js',
            () => window.FullCalendar
        );
    }

    /**
     * jsPDF - Pre PDF export
     */
    async loadJsPDF() {
        await this.loadScript(
            'jsPDF',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            () => window.jspdf
        );

        // AutoTable plugin
        if (!window.jspdf.jsPDF.API.autoTable) {
            await this.loadScript(
                'AutoTable',
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
                () => window.jspdf.jsPDF.API.autoTable
            );
        }

        return window.jspdf;
    }

    /**
     * Docxtemplater - Pre Word dokumenty
     */
    async loadDocxTemplater() {
        // PizZip dependency
        if (!window.PizZip) {
            await this.loadScript(
                'PizZip',
                'https://unpkg.com/pizzip@3.1.1/dist/pizzip.js',
                () => window.PizZip
            );
        }

        return this.loadScript(
            'Docxtemplater',
            'https://cdnjs.cloudflare.com/ajax/libs/docxtemplater/3.57.3/docxtemplater.js',
            () => window.docxtemplater
        );
    }

    /**
     * Flatpickr - Date picker
     */
    async loadFlatpickr() {
        // CSS
        if (!document.querySelector('link[href*="flatpickr"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
            document.head.appendChild(link);
        }

        // JS
        const flatpickr = await this.loadScript(
            'Flatpickr',
            'https://cdn.jsdelivr.net/npm/flatpickr',
            () => window.flatpickr
        );

        // Slovak localization
        if (!window.flatpickr.l10ns.sk) {
            await this.loadScript(
                'FlatpickrSK',
                'https://npmcdn.com/flatpickr/dist/l10n/sk.js',
                () => window.flatpickr.l10ns.sk
            );
        }

        return flatpickr;
    }

    /**
     * DOMPurify - XSS protection
     */
    async loadDOMPurify() {
        return this.loadScript(
            'DOMPurify',
            'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.8/purify.min.js',
            () => window.DOMPurify
        );
    }

    /**
     * Sortable.js - Drag & Drop
     */
    async loadSortable() {
        return this.loadScript(
            'Sortable',
            'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.2/Sortable.min.js',
            () => window.Sortable
        );
    }

    /**
     * ExcelJS - Pokročilý Excel manipulation
     */
    async loadExcelJS() {
        return this.loadScript(
            'ExcelJS',
            'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
            () => window.ExcelJS
        );
    }

    /**
     * FileSaver.js - Sťahovanie súborov
     */
    async loadFileSaver() {
        return this.loadScript(
            'FileSaver',
            'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js',
            () => window.saveAs
        );
    }

    /**
     * XlsxPopulate - Pokročilé Excel spracovanie s farbami
     */
    async loadXlsxPopulate() {
        return this.loadScript(
            'XlsxPopulate',
            'https://cdn.jsdelivr.net/npm/xlsx-populate@1.21.0/browser/xlsx-populate.min.js',
            () => window.XlsxPopulate
        );
    }

    /**
     * =============================================
     * HELPER METÓDY PRE KOMBINÁCIE
     * =============================================
     */

    /**
     * Načíta všetky knižnice potrebné pre Excel operácie
     */
    async loadExcelBundle() {
        const [XLSX, ExcelJS, FileSaver] = await Promise.all([
            this.loadXLSX(),
            this.loadExcelJS(),
            this.loadFileSaver()
        ]);

        return { XLSX, ExcelJS, FileSaver };
    }

    /**
     * Načíta všetky knižnice potrebné pre PDF operácie
     */
    async loadPDFBundle() {
        const [jsPDF, DOMPurify] = await Promise.all([
            this.loadJsPDF(),
            this.loadDOMPurify()
        ]);

        return { jsPDF, DOMPurify };
    }

    /**
     * Načíta všetky knižnice potrebné pre Word operácie
     */
    async loadWordBundle() {
        const [Docxtemplater, FileSaver] = await Promise.all([
            this.loadDocxTemplater(),
            this.loadFileSaver()
        ]);

        return { Docxtemplater, FileSaver, PizZip: window.PizZip };
    }

    /**
     * Načíta všetky knižnice pre kalendárne funkcie
     */
    async loadCalendarBundle() {
        const [FullCalendar, Flatpickr] = await Promise.all([
            this.loadFullCalendar(),
            this.loadFlatpickr()
        ]);

        return { FullCalendar, Flatpickr };
    }

    /**
     * Predčítanie knižníc (preload pri idle time)
     */
    preloadCommonLibs() {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                this.loadXLSX();
                this.loadFileSaver();
            });
        }
    }

    /**
     * Získať status načítania
     */
    getStatus() {
        return {
            loaded: Array.from(this.loadedLibs),
            pending: Array.from(this.pendingLoads.keys())
        };
    }
}

// Singleton instance
export const lazyLoader = new LazyLibraryLoader();

/**
 * =============================================
 * USAGE EXAMPLES
 * =============================================
 * 
 * // V module kde potrebujete Excel:
 * import { lazyLoader } from './lazy_loader.js';
 * 
 * async function exportToExcel() {
 *     const { XLSX, FileSaver } = await lazyLoader.loadExcelBundle();
 *     
 *     const wb = XLSX.utils.book_new();
 *     // ... work with Excel
 *     XLSX.writeFile(wb, 'export.xlsx');
 * }
 * 
 * // Pre PDF:
 * async function generatePDF() {
 *     const { jsPDF } = await lazyLoader.loadPDFBundle();
 *     
 *     const doc = new jsPDF.jsPDF();
 *     // ... create PDF
 * }
 * 
 * =============================================
 */
