[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot '..'))
$ReleaseRoot = Join-Path $ProjectRoot 'release'
$BuildRoot = Join-Path $ProjectRoot 'dist\studio.oplus.ae'
$Package = Get-Content -LiteralPath (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
$Output = Join-Path $ReleaseRoot ("Otiner-Update-{0}.zip" -f $Package.version)

if (-not $SkipBuild) {
    & node (Join-Path $ScriptRoot 'build.js')
    if ($LASTEXITCODE -ne 0) {
        throw 'Otiner Studio build failed.'
    }
}
if (-not (Test-Path -LiteralPath $BuildRoot -PathType Container)) {
    throw "Built extension is missing: $BuildRoot"
}
New-Item -ItemType Directory -Force -Path $ReleaseRoot | Out-Null
if (Test-Path -LiteralPath $Output) {
    $ResolvedRelease = [System.IO.Path]::GetFullPath($ReleaseRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $ResolvedOutput = [System.IO.Path]::GetFullPath($Output)
    if (-not $ResolvedOutput.StartsWith($ResolvedRelease, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing unsafe update output target: $ResolvedOutput"
    }
    Remove-Item -LiteralPath $ResolvedOutput -Force
}
Compress-Archive -LiteralPath $BuildRoot -DestinationPath $Output -CompressionLevel Optimal
if (-not (Test-Path -LiteralPath $Output -PathType Leaf)) {
    throw "Update package was not created: $Output"
}
$Hash = Get-FileHash -LiteralPath $Output -Algorithm SHA256
Write-Host "Created: $Output"
Write-Host "SHA256: $($Hash.Hash)"
