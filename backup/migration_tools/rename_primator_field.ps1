# PowerShell script na premenovanie poľa primátor -> primator v kontaktoch

# Zoznam súborov s kontaktmi
$contactFiles = @(
    "database/contacts_5_ 1_ 2026.json"
)

foreach ($file in $contactFiles) {
    $filePath = Join-Path $PSScriptRoot $file
    
    if (Test-Path $filePath) {
        Write-Host "Spracovávam: $filePath"
        
        # Čítaj JSON
        $json = Get-Content $filePath -Raw | ConvertFrom-Json
        
        # Prejdi všetky kontakty
        foreach ($period in $json.regions.PSObject.Properties) {
            foreach ($contact in $period.Value) {
                # Ak má pole primátor (s dĺžňom), premenovať na primator
                if ($contact.PSObject.Properties.Name -contains "primátor") {
                    $value = $contact."primátor"
                    # Odstráň stare pole
                    $contact.PSObject.Properties.Remove("primátor")
                    # Pridaj nové pole
                    $contact | Add-Member -NotePropertyName "primator" -NotePropertyValue $value
                    Write-Host "  ✓ Prenamed: primátor → primator"
                }
            }
        }
        
        # Ulož späť
        $json | ConvertTo-Json -Depth 10 | Set-Content $filePath
        Write-Host "Hotovo: $file`n"
    }
    else {
        Write-Host "Súbor nenájdený: $filePath`n"
    }
}

Write-Host "Migrácia dokončená!"
