/**
 * =========================================
 * ID REGISTRY - Centralizovaný zoznam ID
 * =========================================
 * 
 * Všetky ID elementy v aplikácii sú namespaced
 * podľa modulu, aby sa zabránilo konfliktom.
 * 
 * Formát: MODULE__ELEMENT_NAME
 * Príklad: auth__login-form, dov__vac-date-from
 * 
 * Použitie:
 * import { IDs } from './id-registry.js';
 * document.getElementById(IDs.AUTH.FORM)
 */

export const IDs = {
  // ============================================
  // AUTHENTICATION MODUL
  // ============================================
  AUTH: {
    OVERLAY: 'auth__login-modal-overlay',
    FORM: 'auth__login-form',
    EMAIL_INPUT: 'auth__email-input',
    PASSWORD_INPUT: 'auth__password-input',
    ERROR_MSG: 'auth__login-error-msg',
    REMEMBER_CHECKBOX: 'auth__remember-me-checkbox',
    FORGOT_LINK: 'auth__forgot-password-link',
  },

  // ============================================
  // NAVIGATION / TOP BAR
  // ============================================
  NAV: {
    GLOBAL_SEARCH: 'nav__global-employee-search',
    CLEAR_SEARCH_BTN: 'nav__clear-search-btn',
    ADDRESS_BOOK_BTN: 'nav__address_book-btn',
    SETTINGS_TOGGLE_BTN: 'nav__settings-toggle-btn',
    EXPORT_EXCEL_BTN: 'nav__export-excel-btn',
    RELOAD_BTN: 'nav__reload-btn',
    CHANGE_PASSWORD_BTN: 'nav__change-password-btn',
    LOGOUT_BTN: 'nav__logout-btn',
    USER_NAME: 'nav__sidebar-user-name',
    USER_POSITION: 'nav__sidebar-user-position',
  },

  // ============================================
  // ADMIN MENU
  // ============================================
  ADMIN: {
    BACKUP_DATA_BTN: 'admin__backup-data-btn',
    RESTORE_DATA_BTN: 'admin__restore-data-btn',
    DOWNLOAD_ACCESS_LOGS_BTN: 'admin__download-access-logs-btn',
    DELETE_ACCESS_LOGS_BTN: 'admin__delete-access-logs-btn',
  },

  // ============================================
  // SIDEBAR (RIGHT PANEL)
  // ============================================
  SIDEBAR: {
    PANEL: 'sidebar__right-panel',
    EMPLOYEES_LIST: 'sidebar__global-employees-list-items',
    EMP_COUNT: 'sidebar__global-emp-count',
    CLOSE_BTN: 'sidebar__close-right-sidebar',
  },

  // ============================================
  // DASHBOARD MODULE
  // ============================================
  DASHBOARD: {
    MODULE: 'dashboard__module',
    WELCOME_CONTAINER: 'dashboard__welcome-card-container',
    WELCOME_GREETING: 'dashboard__welcome-greeting',
    WELCOME_DATE: 'dashboard__welcome-date',
    WELCOME_MENINY: 'dashboard__welcome-meniny',
    WELCOME_SVIATOK: 'dashboard__welcome-sviatok',
    WELCOME_ICON: 'dashboard__welcome-icon',
    WELCOME_TEMP: 'dashboard__welcome-temp',
    ANNOUNCEMENT_WIDGET: 'dashboard__announcement-widget-container',
    DUTY_LIST: 'dashboard__duty-list',
    DUTY_LIST_ITEMS: 'dashboard__duty-list-items',
    CALENDAR_PLACEHOLDER: 'dashboard__calendar-placeholder',
    CALENDAR_RENDER_AREA: 'dashboard__calendar-render-area',
    FILTER_DOVOLENKY: 'dashboard__filter-dovolenky',
    FILTER_POHOTOVOST: 'dashboard__filter-pohotovost',
    FILTER_IZS_DAY: 'dashboard__filter-izs-day',
    FILTER_IZS_NIGHT: 'dashboard__filter-izs-night',
  },

  // ============================================
  // CESTOVNÝ PRÍKAZ (CP) MODULE
  // ============================================
  CP: {
    MODULE: 'cp__module',
    EMPLOYEE_DETAIL_CARD: 'cp__employee-detail-card',
    EMPLOYEE_DETAILS: 'cp__employee-details',
    EDIT_IBAN_BTN: 'cp__btn-edit-iban',
    MEAL_ALLOWANCE_CARD: 'cp__meal-allowance-card',
    MEAL_CALCULATION: 'cp__meal-calculation',
    MEAL_CALCULATION_RESULTS: 'cp__meal-calculation-results',
    FORM: 'cp__form-embedded',
    PURPOSE_INPUT: 'cp__ucel',
    DESTINATION_INPUT: 'cp__miesto',
    COMPANION_INPUT: 'cp__spolucestujuci',
    START_DATE: 'cp__datum_zc_datum',
    START_TIME: 'cp__datum_zc_cas',
    END_DATE: 'cp__datum_kc_datum',
    END_TIME: 'cp__datum_kc_cas',
    ACCOMMODATION_DATE_1: 'cp__datum_1',
    ACCOMMODATION_DATE_2: 'cp__datum_2',
    JOURNEY_FROM_1: 'cp__cesta_z1',
    JOURNEY_PLACE_1: 'cp__miesto_1',
    JOURNEY_TO_1: 'cp__cesta_k1',
    JOURNEY_FROM_2: 'cp__cesta_z2',
    JOURNEY_PLACE_2: 'cp__miesto_2',
    JOURNEY_TO_2: 'cp__cesta_k2',
    JOURNEY_FROM_3: 'cp__cesta_z3',
    JOURNEY_PLACE_3: 'cp__miesto_3',
    JOURNEY_TO_3: 'cp__cesta_k3',
    CLEAR_FORM_BTN: 'cp__btn-clear-cp-form',
    GENERATE_BTN: 'cp__generate-btn',
  },

  // ============================================
  // DOVOLENKY (DOV) MODULE
  // ============================================
  DOV: {
    MODULE: 'dov__module',
    STATS_ROW: 'dov__vacation-stats-row',
    STAT_PRENOS: 'dov__stat-prenos',
    STAT_NAROK: 'dov__stat-narok',
    STAT_CERPANIE: 'dov__stat-cerpanie',
    STAT_ZOSTATOK: 'dov__stat-zostatok',
    NEW_VACATION_FORM: 'dov__new-vacation-form',
    DATE_FROM: 'dov__vac-date-from',
    DATE_TO: 'dov__vac-date-to',
    DAY_CALCULATION: 'dov__vac-day-calculation',
    DAYS_VALUE: 'dov__calc-days-val',
    HALF_DAY_CHECKBOX: 'dov__vac-half-day',
    SAVE_VACATION_BTN: 'dov__btn-save-vacation',
    LIMITS_TITLE: 'dov__limits-title',
    INPUT_PRENOS: 'dov__input-prenos',
    INPUT_NAROK: 'dov__input-narok',
    RECALCULATE_BTN: 'dov__btn-recalculate-vac',
    UPDATE_LIMITS_BTN: 'dov__btn-update-limits',
    CLOSE_YEAR_BTN: 'dov__btn-close-year',
    YEAR_SELECT: 'dov__dov-year-select',
    HISTORY_BODY: 'dov__vacation-history-body',
    DOWNLOAD_XLSX_BTN: 'dov__btn-download-vac-xlsx',
    DOWNLOAD_ALL_BTN: 'dov__btn-download-vac-all',
    DOWNLOAD_ALL_DETAILED_BTN: 'dov__btn-download-vac-all-detailed',
  },

  // ============================================
  // POHOTOVOSŤ (DUTY) MODULE
  // ============================================
  DUTY: {
    MODULE: 'duty__module',
    GROUPS_LIST: 'duty__duty-groups-list',
    MONTH_SELECT: 'duty__duty-month-select',
    YEAR_SELECT: 'duty__duty-year-select',
    PREVIEW_BTN: 'duty__duty-preview-btn',
    DOWNLOAD_BTN: 'duty__duty-download-btn',
    DELETE_BTN: 'duty__duty-delete-btn',
    WEEKS_CONTAINER: 'duty__duty-weeks-container',
  },

  // ============================================
  // IZS MODULE
  // ============================================
  IZS: {
    MODULE: 'izs__module',
    DROP_ZONE: 'izs__izs-drop-zone',
    FILE_INPUT: 'izs__izs-file-input',
    FILE_NAME: 'izs__izs-file-name',
    PROCESS_BTN: 'izs__izs-process-btn',
    CLEAR_BTN: 'izs__izs-clear-btn',
    // ✅ ODSTRÁNENÉ: MODAL_BODY a MODAL_FOOTER - použite IDs.MODALS.IZS_MODAL_BODY a IDs.MODALS.IZS_MODAL_FOOTER
    OVERTIME_DROP_ZONE: 'izs__izs-overtime-drop-zone',
    OVERTIME_FILE_INPUT: 'izs__izs-overtime-file-input',
    OVERTIME_FILE_NAME: 'izs__izs-overtime-file-name',
    OVERTIME_PROCESS_BTN: 'izs__izs-overtime-process-btn',
    OVERTIME_CLEAR_BTN: 'izs__izs-overtime-clear-btn',
  },

  // ============================================
  // BBK (ROZPIS POHOTOVOSTI) MODULE
  // ============================================
  BBK: {
    YEAR_INPUT: 'bbk__bbk-year-input',
    WEEK_INPUT: 'bbk__bbk-week-input',
    DROP_ZONE: 'bbk__bbk-drop-zone',
    FILE_INPUT: 'bbk__bbk-file-input',
    PROCESS_BTN: 'bbk__bbk-process-btn',
    CLEAR_BTN: 'bbk__bbk-clear-btn',
    FILE_LIST: 'bbk__bbk-file-list',
    FILE_LIST_UL: 'bbk__bbk-file-list-ul',
    STATUS_MSG: 'bbk__bbk-status-msg',
  },

  // ============================================
  // UA CONTRIBUTIONS MODULE
  // ============================================
  UA: {
    MODULE: 'ua__module',
    DROP_ZONE: 'ua__dropZone',
    FILE_INPUT: 'ua__fileInput',
    FILE_NAME_DISPLAY: 'ua__fileNameDisplay',
    PROCESS_BTN: 'ua__processBtn',
    CLEAR_BTN: 'ua__clearBtn',
    RESULTS_DISPLAY: 'ua__processResultsDisplay',
    RESULTS_LIST: 'ua__processResultsList',
    EMAIL_FORM: 'ua__emailForm',
    EMAIL_SELECT: 'ua__emailSelect',
    EMAIL_SUBJECT: 'ua__emailSubject',
    EMAIL_BODY: 'ua__emailBody',
    GENERATE_EMAIL_BTN: 'ua__generateEmailBtn',
  },

  // ============================================
  // FUEL MODULE
  // ============================================
  FUEL: {
    MODULE: 'fuel__module',
    FILTER_MONTH: 'fuel__fuel-filter-month',
    FILTER_YEAR: 'fuel__fuel-filter-year',
    INFO_BTN: 'fuel__fuel-info-btn',
    CARS_GRID: 'fuel__fuel-cars-grid',
    // FUEL MODAL
    MODAL: 'fuel__fuel-modal',
    MODAL_TITLE: 'fuel__fuel-modal-title',
    CLOSE_MODAL_BTN: 'fuel__close-fuel-modal',
    FORM: 'fuel__fuel-form',
    CAR_ID: 'fuel__fuel-car-id',
    EDIT_RECORD_ID: 'fuel__fuel-edit-record-id',
    ACTION_TYPE: 'fuel__fuel-action-type',
    NEW_CAR_FIELDS: 'fuel__new-car-fields',
    REFUEL_FIELDS: 'fuel__refuel-fields',
    BRAND: 'fuel__fuel-brand',
    SPZ: 'fuel__fuel-spz',
    EV_NUMBER: 'fuel__fuel-ev-number',
    INIT_KM: 'fuel__fuel-init-km',
    NORM_CITY: 'fuel__fuel-norm-city',
    NORM_OUTSIDE: 'fuel__fuel-norm-outside',
    DATE: 'fuel__fuel-date',
    KM: 'fuel__fuel-km',
    KM_CITY: 'fuel__fuel-km-city',
    LITERS: 'fuel__fuel-liters',
    PRICE: 'fuel__fuel-price',
    // KM MODAL
    KM_MODAL: 'fuel__km-modal',
    KM_CLOSE_BTN: 'fuel__close-km-modal',
    KM_FORM: 'fuel__km-form',
    KM_CAR_ID: 'fuel__km-car-id',
    KM_EDIT_RECORD_ID: 'fuel__km-edit-record-id',
    KM_DATE: 'fuel__km-date',
    KM_TOTAL_STATE: 'fuel__km-total-state',
    KM_CITY_INPUT: 'fuel__km-city-input',
    // HISTORY MODAL
    HISTORY_MODAL: 'fuel__history-modal',
    HISTORY_MODAL_TITLE: 'fuel__history-modal-title',
    CLOSE_HISTORY_MODAL: 'fuel__close-history-modal',
    HISTORY_TABLE_BODY: 'fuel__history-table-body',
    HISTORY_CHART: 'fuel__fuel-history-chart',
    HISTORY_EXCEL_BTN: 'fuel__btn-history-excel',
    // HELP MODAL
    HELP_MODAL: 'fuel__fuel-help-modal',
    CLOSE_HELP_BTN: 'fuel__close-fuel-help',
    CLOSE_HELP_FOOTER_BTN: 'fuel__close-fuel-help-footer',
  },

  // ============================================
  // CONTACTS MODAL
  // ============================================
  CONTACTS: {
    MODAL: 'contacts__contacts-modal',
    CLOSE_BTN: 'contacts__close-contacts-modal',
    CLOSE_FOOTER_BTN: 'contacts__btn-close-contacts-footer',
    SEARCH_INPUT: 'contacts__contacts-search-input',
    CLEAR_SEARCH_BTN: 'contacts__clear-contacts-search-btn',
    PERIOD_SELECT: 'contacts__filter-okres-select',
    RESULTS_CONTAINER: 'contacts__contacts-results-container',
    DOWNLOAD_XLSX_BTN: 'contacts__btn-download-contacts-xlsx',
    EDIT_CONTACT_MODAL: 'contacts__edit-contact-modal',
    EDIT_CONTACT_ID: 'contacts__edit-contact-id',
    EDIT_CONTACT_TITLE: 'contacts__edit-contact-title',
    EDIT_CLOSE_BTN: 'contacts__close-edit-contact-modal',
    EDIT_MAYOR: 'contacts__edit-mayor',
    EDIT_MOB: 'contacts__edit-mob',
    EDIT_EMAIL: 'contacts__edit-email',
    EDIT_ADDRESS: 'contacts__edit-address',
    EDIT_FORM: 'contacts__edit-contact-form',
  },

  // ============================================
  // AUTHENTICATION MODALS
  // ============================================
  AUTH_MODALS: {
    CHANGE_PASSWORD_MODAL: 'auth__change-password-modal',
    CLOSE_PASSWORD_MODAL: 'auth__close-password-modal',
    CHANGE_PASSWORD_FORM: 'auth__change-password-form',
    CURRENT_PASSWORD: 'auth__current-password',
    NEW_PASSWORD: 'auth__new-password',
    CONFIRM_PASSWORD: 'auth__confirm-password',
    PASSWORD_ERROR_MSG: 'auth__password-error-msg',
    FORGOT_PASSWORD_MODAL: 'auth__forgot-password-modal',
    CLOSE_FORGOT_MODAL: 'auth__close-forgot-modal',
    FORGOT_PASSWORD_FORM: 'auth__forgot-password-form',
    FORGOT_EMAIL: 'auth__forgot-email',
    FORGOT_ERROR_MSG: 'auth__forgot-error-msg',
  },

  // ============================================
  // OTHER MODALS
  // ============================================
  MODALS: {
    IBAN_MODAL: 'modals__iban-modal',
    CLOSE_IBAN_MODAL: 'modals__close-iban-modal',
    IBAN_FORM: 'modals__iban-form',
    IBAN_INPUT: 'modals__iban-input',
    PREVIEW_MODAL: 'modals__previewModal',
    CLOSE_PREVIEW_BTN: 'modals__closeModalButton',
    PDF_PREVIEW_FRAME: 'modals__pdfPreviewFrame',
    DOWNLOAD_PDF_BTN: 'modals__downloadPdfButton',
    IZS_PREVIEW_MODAL: 'modals__izsPreviewModal',
    IZS_CLOSE_MODAL_BTN: 'modals__izsCloseModalBtn',
    IZS_MODAL_BODY: 'modals__izsModalBody',
    IZS_MODAL_FOOTER: 'modals__izsModalFooter',
    DELETE_LOGS_OVERLAY: 'modals__delete-logs-overlay',
    DELETE_LOGS_CANCEL_BTN: 'modals__modal-btn-cancel',
    DELETE_LOGS_CONFIRM_BTN: 'modals__modal-btn-confirm-delete',
  },

  // ============================================
  // AI MODUL
  // ============================================
  AI: {
    FLOATING_BTN: 'ai__ai-floating-btn',
    MODAL_OVERLAY: 'ai__ai-modal-overlay',
    CLOSE_BTN: 'ai__ai-close-btn',
    HELP_BTN: 'ai__ai-help-btn',
    MESSAGES_AREA: 'ai__ai-messages-area',
    INPUT: 'ai__ai-input',
    SEND_BTN: 'ai__send-ai-btn',
    RESET_BTN: 'ai__ai-reset-btn',
  },

  // ============================================
  // ANNOUNCEMENTS MODULE
  // ============================================
  ANNOUNCEMENTS: {
    WIDGET_CONTAINER: 'announcements__announcement-widget-container',
    EDIT_BTN: 'announcements__edit-announcement-btn',
    MODAL: 'announcements__announcement-modal',
    CLOSE_BTN: 'announcements__close-announcement-modal',
    FORM: 'announcements__announcement-form',
    TEXTAREA: 'announcements__announcement-text',
    CHAR_COUNTER: 'announcements__char-counter',
    DELETE_BTN: 'announcements__btn-delete-announcement',
  },

  // ============================================
  // ACCESSIBILITY MODULE
  // ============================================
  A11Y: {
    ARIA_LIVE_REGION: 'a11y__aria-live-region',
    SKIP_LINKS: 'a11y__skip-links',
    SKIP_LINKS_STYLE: 'a11y__skip-links-style',
    TOOLBAR: 'a11y__a11y-toolbar',
    TOOLBAR_STYLE: 'a11y__a11y-toolbar-style',
    TOGGLE: 'a11y__a11y-toggle',
    MENU: 'a11y__a11y-menu',
    HIGH_CONTRAST: 'a11y__toggle-high-contrast',
    DYSLEXIC_FONT: 'a11y__toggle-dyslexic-font',
    INCREASE_FONT: 'a11y__increase-font-size',
    DECREASE_FONT: 'a11y__decrease-font-size',
    RESET: 'a11y__reset-a11y',
    MODAL_MENU: 'a11y__a11y-modal-menu',
    CLOSE_MODAL_BTN: 'a11y__close-a11y-modal',
    MODAL_STYLES: 'a11y__a11y-modal-styles',
  },
};

/**
 * Pomocná funkcia na bezpečný prístup k ID
 * @param {string} path - Cesta v tvare "MODULE.PROPERTY" (napr. "AUTH.FORM")
 * @returns {string|undefined} ID elementu alebo undefined
 */
export function getID(path) {
  const parts = path.split('.');
  let obj = IDs;
  
  for (const part of parts) {
    if (obj && typeof obj === 'object' && part in obj) {
      obj = obj[part];
    } else {
      console.warn(`⚠️ ID not found: ${path}`);
      return undefined;
    }
  }
  
  return typeof obj === 'string' ? obj : undefined;
}

/**
 * Validácia: Všetky ID v registry musia byť stringy s namespace prefixom
 */
export function validateRegistry() {
  const errors = [];
  
  function checkObject(obj, path = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'object' && value !== null) {
        checkObject(value, fullPath);
      } else if (typeof value === 'string') {
        // Skontroluj format: MODULE__element-name
        if (!value.includes('__')) {
          errors.push(`❌ ${fullPath}: "${value}" - Missing namespace prefix (expected: MODULE__name)`);
        }
      } else {
        errors.push(`❌ ${fullPath}: Invalid type (expected string, got ${typeof value})`);
      }
    }
  }
  
  checkObject(IDs);
  
  if (errors.length === 0) {
    console.log('✅ ID Registry validation passed!');
    return true;
  } else {
    console.error('❌ ID Registry validation failed:');
    errors.forEach(e => console.error(e));
    return false;
  }
}

// Auto-validácia pri importe (dev mode)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  setTimeout(() => validateRegistry(), 100);
}
