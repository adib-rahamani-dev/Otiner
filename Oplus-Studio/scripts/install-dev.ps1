[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$EnableDebug
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot '..'))
$BuildRoot = Join-Path $ProjectRoot 'dist\studio.oplus.ae'

if (-not $SkipBuild) {
    & node (Join-Path $ScriptRoot 'build.js')
    if ($LASTEXITCODE -ne 0) {
        throw 'Oplus Studio build failed.'
    }
}

if (-not (Test-Path -LiteralPath $BuildRoot -PathType Container)) {
    throw "Built extension is missing: $BuildRoot"
}

$ExtensionsRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$Target = Join-Path $ExtensionsRoot 'studio.oplus.ae'
$ExtensionsFull = [System.IO.Path]::GetFullPath($ExtensionsRoot)
$TargetFull = [System.IO.Path]::GetFullPath($Target)
$RequiredPrefix = $ExtensionsFull.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
) + [System.IO.Path]::DirectorySeparatorChar

if (
    $TargetFull -eq $ExtensionsFull -or
    -not $TargetFull.StartsWith($RequiredPrefix, [System.StringComparison]::OrdinalIgnoreCase)
) {
    throw "Refusing unsafe install target: $TargetFull"
}

New-Item -ItemType Directory -Force -Path $ExtensionsFull | Out-Null
$BackupRoot = $null
if (Test-Path -LiteralPath (Join-Path $TargetFull 'Database') -PathType Container) {
    $BackupRoot = Join-Path (
        [System.IO.Path]::GetTempPath()
    ) ("oplus-studio-database-" + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $BackupRoot | Out-Null
    Copy-Item -LiteralPath (Join-Path $TargetFull 'Database') -Destination $BackupRoot -Recurse
}
if (Test-Path -LiteralPath $TargetFull) {
    Remove-Item -LiteralPath $TargetFull -Recurse -Force
}
Copy-Item -LiteralPath $BuildRoot -Destination $TargetFull -Recurse -Force
if ($null -ne $BackupRoot) {
    $InstalledDatabase = Join-Path $TargetFull 'Database'
    if (Test-Path -LiteralPath $InstalledDatabase) {
        Remove-Item -LiteralPath $InstalledDatabase -Recurse -Force
    }
    Copy-Item -LiteralPath (Join-Path $BackupRoot 'Database') -Destination $InstalledDatabase -Recurse
    $TempRootFull = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    $BackupFull = [System.IO.Path]::GetFullPath($BackupRoot)
    if (-not $BackupFull.StartsWith($TempRootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing unsafe temporary cleanup target: $BackupFull"
    }
    Remove-Item -LiteralPath $BackupFull -Recurse -Force
}

if ($EnableDebug) {
    $RegistryPath = 'HKCU:\Software\Adobe\CSXS.12'
    New-Item -Path $RegistryPath -Force | Out-Null
    New-ItemProperty -Path $RegistryPath -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
}

Write-Host "Installed Oplus Studio to $TargetFull"
if ($EnableDebug) {
    Write-Host 'Enabled CEP 12 PlayerDebugMode for the current user.'
}
Write-Host 'Restart After Effects, then open Window > Extensions > Oplus Studio.'
