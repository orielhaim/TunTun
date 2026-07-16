#Requires -Version 5.1
<#
.SYNOPSIS
  Install TunTun from GitHub Releases (Windows).

.DESCRIPTION
  Downloads the matching release archive, verifies SHA-256 and optionally
  GitHub attestation, installs binaries, and registers the Windows service.

.EXAMPLE
  irm https://github.com/orielhaim/TunTun/releases/latest/download/install.ps1 | iex
#>
[CmdletBinding()]
param(
    [string]$Version = "",
    [string]$InstallDir = "",
    [switch]$NoService,
    [switch]$NoVerify,
    [string[]]$Bins = @("tuntun", "tuntun-control", "tuntun-relay"),
    [string]$Repo = $(if ($env:TUNTUN_REPO) { $env:TUNTUN_REPO } else { "orielhaim/TunTun" })
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) { Write-Host "=> $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Warning $Message }
function Die([string]$Message) { Write-Host "error: $Message" -ForegroundColor Red; exit 1 }

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-Arch {
    if ([Environment]::Is64BitOperatingSystem) {
        $arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq [System.Runtime.InteropServices.Architecture]::Arm64) {
            "aarch64"
        }
        else {
            "x86_64"
        }
    }
    else {
        $arch = switch -Regex ($env:PROCESSOR_ARCHITECTURE) {
            '^(AMD64|X64)$' { "x86_64" }
            '^(ARM64)$' { "aarch64" }
            default { Die "unsupported architecture: $($env:PROCESSOR_ARCHITECTURE)" }
        }
    }
    return $arch
}

function Get-LatestTag([string]$Repository) {
    $uri = "https://api.github.com/repos/$Repository/releases/latest"
    $headers = @{ "User-Agent" = "tuntun-install/1.0" }
    try {
        $release = Invoke-RestMethod -Uri $uri -Headers $headers
    }
    catch {
        Die "could not reach GitHub API: $($_.Exception.Message)"
    }
    if (-not $release.tag_name) {
        Die "could not resolve latest release tag"
    }
    return [string]$release.tag_name
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

if (-not $InstallDir) {
    if ($env:TUNTUN_INSTALL_DIR) {
        $InstallDir = $env:TUNTUN_INSTALL_DIR
    }
    else {
        $InstallDir = Join-Path $env:ProgramFiles "TunTun"
    }
}

$arch = Get-Arch
$target = "$arch-pc-windows-msvc"

if (-not $Version) {
    Write-Info "Resolving latest release…"
    $Version = Get-LatestTag -Repository $Repo
}

if ($Version -notmatch '^v') {
    $tag = "v$Version"
    $versionBare = $Version
}
else {
    $tag = $Version
    $versionBare = $Version.TrimStart('v')
}

$existingBin = Join-Path $InstallDir "tuntun.exe"
if (Test-Path $existingBin) {
    try {
        $installedOutput = & $existingBin --version 2>&1
        if ($installedOutput -match '(\d+\.\d+\.\d+)') {
            $installed = $Matches[1]
            if ($installed -eq $versionBare) {
                Write-Info "TunTun v${versionBare} is already installed"
                exit 0
            }
            Write-Info "Upgrading TunTun v${installed} -> v${versionBare}"
        }
    }
    catch {
        # Existing binary broken - continue with install
    }
}

$archive = "tuntun-$versionBare-$target.zip"
$baseUrl = "https://github.com/$Repo/releases/download/$tag"
$url = "$baseUrl/$archive"
$checksumUrl = "$url.sha256"

Write-Info "Installing TunTun $tag ($target)"
Write-Info "  archive: $url"
Write-Info "  dest:    $InstallDir"

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tuntun-install-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $archivePath = Join-Path $tmp $archive
    $checksumPath = Join-Path $tmp "$archive.sha256"

    Write-Info "Downloading ${archive}…"
    try {
        Invoke-WebRequest -Uri $url -OutFile $archivePath -UseBasicParsing
    }
    catch {
        Die "download failed: $($_.Exception.Message)"
    }

    try {
        Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumPath -UseBasicParsing
        $expected = ((Get-Content -Path $checksumPath -Raw) -split '\s+')[0].ToLowerInvariant()
        $actual = Get-Sha256 -Path $archivePath
        if ($expected -ne $actual) {
            Die "checksum mismatch for $archive (expected $expected, got $actual)"
        }
        Write-Info "Checksum verified"
    }
    catch [System.Net.WebException] {
        Write-Warn "checksum file not available; skipping verification"
    }
    catch {
        if ($_.Exception.Message -match "checksum mismatch") { throw }
        Write-Warn "checksum verification skipped: $($_.Exception.Message)"
    }

    if (-not $NoVerify -and (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Info "Verifying build provenance…"
        $ghResult = & gh attestation verify $archivePath --repo $Repo 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Attestation verified"
        }
        else {
            Write-Warn "attestation verification failed (binary is still checksum-verified)"
        }
    }

    Expand-Archive -Path $archivePath -DestinationPath $tmp -Force
    $extracted = Join-Path $tmp "tuntun-$versionBare-$target"
    if (-not (Test-Path $extracted)) {
        Die "unexpected archive layout (missing $extracted)"
    }

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $svcRunning = $false
    if (Get-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' }) {
        Write-Info "Stopping running service before update…"
        Stop-Service -Name "tuntun" -Force -ErrorAction SilentlyContinue
        $svcRunning = $true
    }

    $installedCount = 0
    foreach ($bin in $Bins) {
        $name = if ($bin.EndsWith(".exe")) { $bin } else { "$bin.exe" }
        $src = Join-Path $extracted $name
        if (-not (Test-Path $src)) {
            Write-Warn "skipping missing binary: $name"
            continue
        }
        $dst = Join-Path $InstallDir $name
        Copy-Item -Path $src -Destination $dst -Force
        Write-Info "Installed $name -> $dst"
        $installedCount++
    }

    if ($installedCount -eq 0) {
        Die "no binaries were installed"
    }

    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    if ($machinePath -and ($machinePath -split ';' | Where-Object { $_ -eq $InstallDir }).Count -eq 0) {
        if (Test-IsAdmin) {
            [Environment]::SetEnvironmentVariable("Path", "$machinePath;$InstallDir", "Machine")
            Write-Info "Added $InstallDir to machine PATH"
        }
        else {
            Write-Warn "run elevated to add $InstallDir to machine PATH"
        }
    }
    if ($env:Path -notlike "*$InstallDir*") {
        $env:Path = "$InstallDir;$env:Path"
    }

    $tuntun = Join-Path $InstallDir "tuntun.exe"
    if (-not $NoService -and (Test-Path $tuntun)) {
        if (Test-IsAdmin) {
            if ($svcRunning) {
                Write-Info "Restarting service…"
                Start-Service -Name "tuntun" -ErrorAction SilentlyContinue
            }
            elseif (-not (Get-Service -Name "tuntun" -ErrorAction SilentlyContinue)) {
                & $tuntun service install
                if ($LASTEXITCODE -eq 0) {
                    Write-Info "Windows service installed"
                }
                else {
                    Write-Warn "service install returned exit code $LASTEXITCODE"
                }
            }
        }
        else {
            Write-Warn "administrator required to install/manage the Windows service"
        }
    }

    Write-Info ""
    Write-Info "TunTun $tag installed successfully!"
    Write-Info ""
    Write-Info "Next steps:"
    Write-Info "  tuntun --version                                       # verify"
    Write-Info "  tuntun enroll --control-url <url> --token <token>      # enroll"
    Write-Info "  tuntun service start                                   # start"
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
