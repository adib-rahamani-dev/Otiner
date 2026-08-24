$ErrorActionPreference = 'Stop'
$RegistryPath = 'HKCU:\Software\Adobe\CSXS.12'
New-Item -Path $RegistryPath -Force | Out-Null
New-ItemProperty -Path $RegistryPath -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
Write-Host 'Enabled CEP 12 PlayerDebugMode for the current Windows user.'
Write-Host 'Restart After Effects before loading an unsigned development build.'
