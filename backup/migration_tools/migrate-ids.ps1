# ID Migration Script - PowerShell
# Zmena všetkých ID v index.html na namespace verzie

$filePath = "c:\Users\majob\Downloads\okr_portal_app\index.html"

$idMappings = @{
    # CP Module
    'cestovny-prikaz-module' = 'cp__module'
    'cp-employee-detail-card' = 'cp__employee-detail-card'
    'btn-edit-iban' = 'cp__btn-edit-iban'
    'cp-employee-details' = 'cp__employee-details'
    'cp-meal-allowance-card' = 'cp__meal-allowance-card'
    'cp-meal-calculation' = 'cp__meal-calculation'
    'meal-calculation-results' = 'cp__meal-calculation-results'
    'cp-form-embedded' = 'cp__form-embedded'
    'ucel' = 'cp__ucel'
    'miesto' = 'cp__miesto'
    'spolucestujuci' = 'cp__spolucestujuci'
    'datum_zc_datum' = 'cp__datum_zc_datum'
    'datum_zc_cas' = 'cp__datum_zc_cas'
    'datum_kc_datum' = 'cp__datum_kc_datum'
    'datum_kc_cas' = 'cp__datum_kc_cas'
    'datum_1' = 'cp__datum_1'
    'datum_2' = 'cp__datum_2'
    'cesta_z1' = 'cp__cesta_z1'
    'cesta_z2' = 'cp__cesta_z2'
    'cesta_z3' = 'cp__cesta_z3'
    'miesto_1' = 'cp__miesto_1'
    'miesto_2' = 'cp__miesto_2'
    'miesto_3' = 'cp__miesto_3'
    'cesta_k1' = 'cp__cesta_k1'
    'cesta_k2' = 'cp__cesta_k2'
    'cesta_k3' = 'cp__cesta_k3'
    'btn-clear-cp-form' = 'cp__btn-clear-cp-form'
    'generate-btn' = 'cp__generate-btn'

    # DOV Module
    'dov-module' = 'dov__module'
    'vacation-stats-row' = 'dov__vacation-stats-row'
    'stat-prenos' = 'dov__stat-prenos'
    'stat-narok' = 'dov__stat-narok'
    'stat-cerpanie' = 'dov__stat-cerpanie'
    'stat-zostatok' = 'dov__stat-zostatok'
    'new-vacation-form' = 'dov__new-vacation-form'
    'vac-date-from' = 'dov__vac-date-from'
    'vac-date-to' = 'dov__vac-date-to'
    'vac-day-calculation' = 'dov__vac-day-calculation'
    'calc-days-val' = 'dov__calc-days-val'
    'vac-half-day' = 'dov__vac-half-day'
    'btn-save-vacation' = 'dov__btn-save-vacation'
    'limits-title' = 'dov__limits-title'
    'input-prenos' = 'dov__input-prenos'
    'input-narok' = 'dov__input-narok'
    'btn-recalculate-vac' = 'dov__btn-recalculate-vac'
    'btn-update-limits' = 'dov__btn-update-limits'
    'btn-close-year' = 'dov__btn-close-year'
    'dov-year-select' = 'dov__dov-year-select'
    'vacation-history-body' = 'dov__vacation-history-body'
    'btn-download-vac-xlsx' = 'dov__btn-download-vac-xlsx'
    'btn-download-vac-all' = 'dov__btn-download-vac-all'
    'btn-download-vac-all-detailed' = 'dov__btn-download-vac-all-detailed'

    # DUTY Module
    'pohotovost-module' = 'duty__module'
    'duty-groups-list' = 'duty__duty-groups-list'
    'duty-month-select' = 'duty__duty-month-select'
    'duty-year-select' = 'duty__duty-year-select'
    'duty-preview-btn' = 'duty__duty-preview-btn'
    'duty-download-btn' = 'duty__duty-download-btn'
    'duty-delete-btn' = 'duty__duty-delete-btn'
    'duty-weeks-container' = 'duty__duty-weeks-container'

    # IZS Module
    'izs-module' = 'izs__module'
    'izs-drop-zone' = 'izs__izs-drop-zone'
    'izs-file-input' = 'izs__izs-file-input'
    'izs-file-name' = 'izs__izs-file-name'
    'izs-process-btn' = 'izs__izs-process-btn'
    'izs-clear-btn' = 'izs__izs-clear-btn'
    'izs-overtime-drop-zone' = 'izs__izs-overtime-drop-zone'
    'izs-overtime-file-input' = 'izs__izs-overtime-file-input'
    'izs-overtime-file-name' = 'izs__izs-overtime-file-name'
    'izs-overtime-process-btn' = 'izs__izs-overtime-process-btn'
    'izs-overtime-clear-btn' = 'izs__izs-overtime-clear-btn'

    # BBK
    'bbk-year-input' = 'bbk__bbk-year-input'
    'bbk-week-input' = 'bbk__bbk-week-input'
    'bbk-drop-zone' = 'bbk__bbk-drop-zone'
    'bbk-file-input' = 'bbk__bbk-file-input'
    'bbk-process-btn' = 'bbk__bbk-process-btn'
    'bbk-clear-btn' = 'bbk__bbk-clear-btn'
    'bbk-file-list' = 'bbk__bbk-file-list'
    'bbk-file-list-ul' = 'bbk__bbk-file-list-ul'
    'bbk-status-msg' = 'bbk__bbk-status-msg'

    # UA Module
    'ua-contributions-module' = 'ua__module'
    'dropZone' = 'ua__dropZone'
    'fileInput' = 'ua__fileInput'
    'fileNameDisplay' = 'ua__fileNameDisplay'
    'processBtn' = 'ua__processBtn'
    'clearBtn' = 'ua__clearBtn'
    'processResultsDisplay' = 'ua__processResultsDisplay'
    'processResultsList' = 'ua__processResultsList'
    'emailForm' = 'ua__emailForm'
    'emailSelect' = 'ua__emailSelect'
    'emailSubject' = 'ua__emailSubject'
    'emailBody' = 'ua__emailBody'
    'generateEmailBtn' = 'ua__generateEmailBtn'

    # Fuel Module
    'fuel-module' = 'fuel__module'
    'fuel-filter-month' = 'fuel__fuel-filter-month'
    'fuel-filter-year' = 'fuel__fuel-filter-year'
    'fuel-info-btn' = 'fuel__fuel-info-btn'
    'fuel-cars-grid' = 'fuel__fuel-cars-grid'
    'fuel-modal' = 'fuel__fuel-modal'
    'fuel-modal-title' = 'fuel__fuel-modal-title'
    'close-fuel-modal' = 'fuel__close-fuel-modal'
    'fuel-form' = 'fuel__fuel-form'
    'fuel-car-id' = 'fuel__fuel-car-id'
    'fuel-edit-record-id' = 'fuel__fuel-edit-record-id'
    'fuel-action-type' = 'fuel__fuel-action-type'
    'new-car-fields' = 'fuel__new-car-fields'
    'refuel-fields' = 'fuel__refuel-fields'
    'fuel-brand' = 'fuel__fuel-brand'
    'fuel-spz' = 'fuel__fuel-spz'
    'fuel-ev-number' = 'fuel__fuel-ev-number'
    'fuel-init-km' = 'fuel__fuel-init-km'
    'fuel-norm-city' = 'fuel__fuel-norm-city'
    'fuel-norm-outside' = 'fuel__fuel-norm-outside'
    'fuel-date' = 'fuel__fuel-date'
    'fuel-km' = 'fuel__fuel-km'
    'fuel-km-city' = 'fuel__fuel-km-city'
    'fuel-liters' = 'fuel__fuel-liters'
    'fuel-price' = 'fuel__fuel-price'
    'km-modal' = 'fuel__km-modal'
    'close-km-modal' = 'fuel__close-km-modal'
    'km-form' = 'fuel__km-form'
    'km-car-id' = 'fuel__km-car-id'
    'km-edit-record-id' = 'fuel__km-edit-record-id'
    'km-date' = 'fuel__km-date'
    'km-total-state' = 'fuel__km-total-state'
    'km-city-input' = 'fuel__km-city-input'
    'history-modal' = 'fuel__history-modal'
    'history-modal-title' = 'fuel__history-modal-title'
    'close-history-modal' = 'fuel__close-history-modal'
    'history-table-body' = 'fuel__history-table-body'
    'fuel-history-chart' = 'fuel__fuel-history-chart'
    'btn-history-excel' = 'fuel__btn-history-excel'
    'fuel-help-modal' = 'fuel__fuel-help-modal'
    'close-fuel-help' = 'fuel__close-fuel-help'
    'btn-close-help-footer' = 'fuel__btn-close-help-footer'

    # Contacts
    'contacts-modal' = 'contacts__contacts-modal'
    'close-contacts-modal' = 'contacts__close-contacts-modal'
    'contacts-search-input' = 'contacts__contacts-search-input'
    'clear-contacts-search-btn' = 'contacts__clear-contacts-search-btn'
    'filter-okres-select' = 'contacts__filter-okres-select'
    'contacts-results-container' = 'contacts__contacts-results-container'
    'btn-download-contacts-xlsx' = 'contacts__btn-download-contacts-xlsx'
    'edit-contact-id' = 'contacts__edit-contact-id'
    'edit-contact-title' = 'contacts__edit-contact-title'
    'edit-mayor' = 'contacts__edit-mayor'
    'edit-mob' = 'contacts__edit-mob'
    'edit-email' = 'contacts__edit-email'
    'edit-address' = 'contacts__edit-address'
    'edit-contact-form' = 'contacts__edit-contact-form'

    # Auth
    'change-password-modal' = 'auth__change-password-modal'
    'close-password-modal' = 'auth__close-password-modal'
    'change-password-form' = 'auth__change-password-form'
    'current-password' = 'auth__current-password'
    'new-password' = 'auth__new-password'
    'confirm-password' = 'auth__confirm-password'
    'password-error-msg' = 'auth__password-error-msg'
    'forgot-password-modal' = 'auth__forgot-password-modal'
    'close-forgot-modal' = 'auth__close-forgot-modal'
    'forgot-password-form' = 'auth__forgot-password-form'
    'forgot-email' = 'auth__forgot-email'
    'forgot-error-msg' = 'auth__forgot-error-msg'

    # Modals
    'iban-modal' = 'modals__iban-modal'
    'close-iban-modal' = 'modals__close-iban-modal'
    'iban-form' = 'modals__iban-form'
    'iban-input' = 'modals__iban-input'
    'previewModal' = 'modals__previewModal'
    'closeModalButton' = 'modals__closeModalButton'
    'pdfPreviewFrame' = 'modals__pdfPreviewFrame'
    'downloadPdfButton' = 'modals__downloadPdfButton'
    'izsPreviewModal' = 'modals__izsPreviewModal'
    'izsCloseModalBtn' = 'modals__izsCloseModalBtn'
    'izsModalBody' = 'modals__izsModalBody'
    'izsModalFooter' = 'modals__izsModalFooter'
    'delete-logs-overlay' = 'modals__delete-logs-overlay'
    'modal-btn-cancel' = 'modals__modal-btn-cancel'
    'modal-btn-confirm-delete' = 'modals__modal-btn-confirm-delete'

    # AI
    'ai-floating-btn' = 'ai__ai-floating-btn'
    'ai-modal-overlay' = 'ai__ai-modal-overlay'
    'ai-close-btn' = 'ai__ai-close-btn'
    'ai-messages-area' = 'ai__ai-messages-area'
    'ai-input' = 'ai__ai-input'
    'send-ai-btn' = 'ai__send-ai-btn'
    'ai-reset-btn' = 'ai__ai-reset-btn'

    # Announcements
    'announcement-widget-container' = 'announcements__announcement-widget-container'
    'edit-announcement-btn' = 'announcements__edit-announcement-btn'
    'announcement-modal' = 'announcements__announcement-modal'
    'close-announcement-modal' = 'announcements__close-announcement-modal'
    'announcement-form' = 'announcements__announcement-form'
    'announcement-text' = 'announcements__announcement-text'
    'char-counter' = 'announcements__char-counter'
    'btn-delete-announcement' = 'announcements__btn-delete-announcement'
}

Write-Host "=" * 70
Write-Host "ID NAMESPACE MIGRATION TOOL" -ForegroundColor Cyan
Write-Host "=" * 70
Write-Host ""
Write-Host "Citam: $filePath" -ForegroundColor Yellow

$content = Get-Content -Path $filePath -Raw -Encoding UTF8
$originalSize = $content.Length
$totalReplacements = 0

foreach ($oldId in $idMappings.Keys) {
    $newId = $idMappings[$oldId]
    
    # id="..."
    $pattern1 = 'id="' + $oldId + '"'
    if ($content -like "*$pattern1*") {
        $count = ($content | Select-String -Pattern ([regex]::Escape($pattern1)) -AllMatches).Matches.Count
        $content = $content -replace ([regex]::Escape($pattern1)), ('id="' + $newId + '"')
        $totalReplacements += $count
        Write-Host "  [OK] $pattern1 ($count x)" -ForegroundColor Green
    }
    
    # for="..."
    $pattern2 = 'for="' + $oldId + '"'
    if ($content -like "*$pattern2*") {
        $count = ($content | Select-String -Pattern ([regex]::Escape($pattern2)) -AllMatches).Matches.Count
        $content = $content -replace ([regex]::Escape($pattern2)), ('for="' + $newId + '"')
        $totalReplacements += $count
        Write-Host "  [OK] $pattern2 ($count x)" -ForegroundColor Green
    }
}

$content | Set-Content -Path $filePath -Encoding UTF8

$newSize = (Get-Item $filePath).Length
Write-Host ""
Write-Host "[OK] Subor ulozeny!" -ForegroundColor Green
Write-Host "[INFO] Statistika:" -ForegroundColor Cyan
Write-Host "   Celkom nahrad: $totalReplacements"
Write-Host "   Velkost: $originalSize -> $newSize bajtov"
Write-Host "=" * 70
