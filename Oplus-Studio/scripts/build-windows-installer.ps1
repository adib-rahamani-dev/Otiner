[CmdletBinding()]
param(
    [string]$IsccPath = ''
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot '..'))
$PackagePath = Join-Path $ProjectRoot 'package.json'
$InstallerScript = Join-Path $ProjectRoot 'Installer\Windows\OplusStudio.iss'

& node (Join-Path $ScriptRoot 'build.js')
if ($LASTEXITCODE -ne 0) {
    throw 'Otiner Studio build failed.'
}

if (-not $IsccPath) {
    $Candidates = @(
        @(
            (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
            (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
        ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) }
    )
    if ($Candidates.Count -gt 0) {
        $IsccPath = $Candidates[0]
    }
}

if (-not $IsccPath -or -not (Test-Path -LiteralPath $IsccPath -PathType Leaf)) {
    throw @'
Inno Setup 6 was not found. Install it from https://jrsoftware.org/isinfo.php,
then run this command again. You may also pass -IsccPath with the full ISCC.exe path.
'@
}

$Package = Get-Content -LiteralPath $PackagePath -Raw | ConvertFrom-Json
$PreviousVersion = $env:OPLUS_INSTALLER_VERSION
try {
    $env:OPLUS_INSTALLER_VERSION = [string]$Package.version
    & $IsccPath $InstallerScript
    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup failed with exit code $LASTEXITCODE."
    }
} finally {
    $env:OPLUS_INSTALLER_VERSION = $PreviousVersion
}

$Output = Join-Path $ProjectRoot ("release\Otiner-Studio-Setup-Windows-{0}.exe" -f $Package.version)
if (-not (Test-Path -LiteralPath $Output -PathType Leaf)) {
    throw "Expected installer was not created: $Output"
}
Write-Host "Created: $Output"
