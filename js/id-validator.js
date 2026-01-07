/**
 * =========================================
 * ID VALIDATOR - Detekcia kolízií a chýb
 * =========================================
 * 
 * Nástroj na validáciu všetkých ID v projekte:
 * 1. Detekuje duplicitné ID v DOM
 * 2. Skontroluje, či všetky ID v registry sú v DOM
 * 3. Detekuje "sirotské" ID, ktoré nie sú v registry
 * 4. Validuje format namespace (MODULE__element)
 */

import { IDs, validateRegistry } from './id-registry.js';

// Prefixy ID, ktoré ignorujeme (napr. prvky injektované rozšíreniami prehliadača)
const IGNORED_ID_PREFIXES = ['stndz-'];

// Konkrétne ID, ktoré ignorujeme (štýlové helpery a staré, ešte nenamespacované prvky)
const IGNORED_ID_SET = new Set([
  'skip-links',
  'skip-links-style',
  'loading-manager-styles',
  'ripple-styles',
  'enhanced-toast-styles',
  'page-transition-styles',
  'form-enhancement-styles',
  'toast-container',           // Dynamicky vytvorený utils.js helper
  'current-calendar-tooltip',  // Dynamicky vytvorený dashboard.js tooltip
  'backup-data-btn',
  'restore-data-btn',
  'announcement-widget-container',
  'aria-live-region'  // A11Y helper
]);

export class IDValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  /**
   * Komplexná validácia
   */
  validateAll() {
    console.log('%c🔍 ID VALIDATOR - Komplexná validácia', 'font-size: 14px; color: #dd6b20; font-weight: bold;');
    
    this.validateRegistry();
    this.validateDOM();
    this.validateConsistency();
    this.validateNamespaceFormat();
    
    this.printReport();
    
    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      info: this.info
    };
  }

  /**
   * Validácia ID registry
   */
  validateRegistry() {
    const registryIDs = this.getAllRegistryIDs();
    const allUnique = new Set(registryIDs).size === registryIDs.length;
    
    if (!allUnique) {
      this.errors.push('❌ Registry: Nájdené duplicitné ID v registry!');
    } else {
      this.info.push(`✅ Registry: Všetky ID sú unikátne (${registryIDs.length} ID)`);
    }
  }

  /**
   * Validácia DOM - detekcia duplicitných ID
   */
  validateDOM() {
    const allDOMElements = document.querySelectorAll('[id]');
    const idMap = new Map();
    const duplicates = [];
    
    allDOMElements.forEach(el => {
      const id = el.id;
      if (idMap.has(id)) {
        duplicates.push({ id, count: idMap.get(id) + 1 });
      } else {
        idMap.set(id, 1);
      }
    });
    
    if (duplicates.length > 0) {
      duplicates.forEach(dup => {
        this.errors.push(`❌ DOM: Duplicitné ID "${dup.id}" (${dup.count}x)`);
      });
    } else {
      this.info.push(`✅ DOM: Bez duplicitných ID (${allDOMElements.length} prvkov)`);
    }
  }

  /**
   * Validácia konzistencie: Registry vs DOM
   */
  validateConsistency() {
    const registryIDs = this.getAllRegistryIDs();
    const domIDs = Array.from(document.querySelectorAll('[id]'))
      .map(el => el.id)
      .filter(id => !IGNORED_ID_PREFIXES.some(prefix => id.startsWith(prefix)))
      .filter(id => !IGNORED_ID_SET.has(id));
    const domIDSet = new Set(domIDs);
    const registryIDSet = new Set(registryIDs);
    
    // Nájsť ID, ktoré sú v registry ale nie sú v DOM
    const missingInDOM = registryIDs.filter(id => !domIDSet.has(id));
    if (missingInDOM.length > 0) {
      this.warnings.push(`⚠️  Registry: ${missingInDOM.length} ID z registry nie je v DOM (možno sa nenačítali)`);
    }
    
    // Nájsť "sirotské" ID - v DOM ale nie v registry
    const orphanIDs = domIDs.filter(id => !registryIDSet.has(id));
    if (orphanIDs.length > 0) {
      this.warnings.push(`⚠️  DOM: ${orphanIDs.length} "sirotských" ID mimo registry`);
      // Zobrazovať iba prvých 10
      orphanIDs.slice(0, 10).forEach(id => {
        const el = document.getElementById(id);
        const tag = el ? el.tagName : '?';
        console.warn(`    • ${id} (${tag})`);
      });
      if (orphanIDs.length > 10) {
        console.warn(`    ... a ${orphanIDs.length - 10} ďalších`);
      }
    }
  }

  /**
   * Validácia formátu namespace
   */
  validateNamespaceFormat() {
    const registryIDs = this.getAllRegistryIDs();
    const invalidFormat = registryIDs.filter(id => !id.includes('__'));
    
    if (invalidFormat.length > 0) {
      this.errors.push(`❌ Format: ${invalidFormat.length} ID bez namespace prefixu (MODULE__)`);
      invalidFormat.slice(0, 5).forEach(id => {
        console.error(`    • ${id}`);
      });
    } else {
      this.info.push('✅ Format: Všetky ID majú správny namespace format');
    }
  }

  /**
   * Ziskaj všetky ID z registry
   */
  getAllRegistryIDs() {
    const ids = [];
    
    function extractIDs(obj) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          ids.push(value);
        } else if (typeof value === 'object' && value !== null) {
          extractIDs(value);
        }
      }
    }
    
    extractIDs(IDs);
    return ids;
  }

  /**
   * Tlač správy
   */
  printReport() {
    console.log('');
    console.log('%c' + '='.repeat(70), 'font-family: monospace; color: #888;');
    
    if (this.info.length > 0) {
      console.log('%cℹ️  INFO:', 'color: #4CAF50; font-weight: bold;');
      this.info.forEach(msg => console.log(`  ${msg}`));
    }
    
    if (this.warnings.length > 0) {
      console.log('%c⚠️  WARNINGS:', 'color: #FF9800; font-weight: bold;');
      this.warnings.forEach(msg => console.log(`  ${msg}`));
    }
    
    if (this.errors.length > 0) {
      console.log('%c🚨 ERRORS:', 'color: #F44336; font-weight: bold;');
      this.errors.forEach(msg => console.log(`  ${msg}`));
    }
    
    console.log('%c' + '='.repeat(70), 'font-family: monospace; color: #888;');
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('%c✅ Validácia OK - Žiadne problémy!', 'color: #4CAF50; font-size: 13px; font-weight: bold;');
    } else if (this.errors.length === 0) {
      console.log('%c⚠️  Validácia s varovaniami', 'color: #FF9800; font-size: 13px; font-weight: bold;');
    } else {
      console.log('%c❌ Validácia ZLYHALA', 'color: #F44336; font-size: 13px; font-weight: bold;');
    }
    console.log('');
  }

  /**
   * Vyhľadaj element podľa ID
   */
  findByID(id) {
    const element = document.getElementById(id);
    if (element) {
      console.log(`✓ Nájdený: #${id}`, element);
      return element;
    } else {
      console.warn(`✗ Nenájdený: #${id}`);
      return null;
    }
  }

  /**
   * Vyhľadaj všetky elementy s konkrétnym prefixom
   */
  findByPrefix(prefix) {
    const registryIDs = this.getAllRegistryIDs();
    const matching = registryIDs.filter(id => id.startsWith(prefix + '__'));
    
    console.log(`📍 IDs s prefixom "${prefix}": (${matching.length})`);
    const results = [];
    matching.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        results.push({ id, element: el, exists: true });
        console.log(`  ✓ ${id}`);
      } else {
        results.push({ id, element: null, exists: false });
        console.log(`  ✗ ${id}`);
      }
    });
    return results;
  }

  /**
   * Zobrazovanie ID elementu v inspektore
   */
  inspect(id) {
    const el = this.findByID(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '3px solid red';
      setTimeout(() => {
        el.style.outline = '';
      }, 3000);
    }
  }
}

// Export instance pre globálny prístup
const validator = new IDValidator();
window.IDValidator = validator;

// Auto-validácia pri DOMContentLoaded (dev mode)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      setTimeout(() => validator.validateAll(), 500);
    }
  });
} else {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setTimeout(() => validator.validateAll(), 500);
  }
}

export { validator };
