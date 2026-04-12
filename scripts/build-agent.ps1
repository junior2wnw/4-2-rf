param(
  [string]$Version = "0.1.0",
  [string]$ApiUrl = "https://4-2.xn--p1ai/api",
  [string]$InstallerBaseUrl = "https://4-2.xn--p1ai/api/v1/installers"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$agentRoot = Join-Path $repoRoot "apps\agent"
$distRoot = Join-Path $agentRoot "dist"
$goExe = if (Test-Path "C:\Program Files\Go\bin\go.exe") { "C:\Program Files\Go\bin\go.exe" } else { "go" }

if (Test-Path $distRoot) {
  Remove-Item -Recurse -Force $distRoot
}
New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

$targets = @(
  @{ GoOs = "windows"; Platform = "windows"; Arch = "amd64"; Archive = "zip" },
  @{ GoOs = "windows"; Platform = "windows"; Arch = "arm64"; Archive = "zip" },
  @{ GoOs = "linux"; Platform = "linux"; Arch = "amd64"; Archive = "tar.gz" },
  @{ GoOs = "linux"; Platform = "linux"; Arch = "arm64"; Archive = "tar.gz" },
  @{ GoOs = "darwin"; Platform = "macos"; Arch = "amd64"; Archive = "tar.gz" },
  @{ GoOs = "darwin"; Platform = "macos"; Arch = "arm64"; Archive = "tar.gz" }
)

$manifestItems = @()

foreach ($target in $targets) {
  $workDir = Join-Path $distRoot "$($target.Platform)-$($target.Arch)"
  New-Item -ItemType Directory -Force -Path $workDir | Out-Null

  $binaryName = if ($target.GoOs -eq "windows") { "4-2-agent.exe" } else { "4-2-agent" }
  $binaryPath = Join-Path $workDir $binaryName

  Push-Location $agentRoot
  try {
    $env:GOOS = $target.GoOs
    $env:GOARCH = $target.Arch
    & $goExe build -ldflags "-X main.version=$Version" -o $binaryPath .\cmd\agent
  } finally {
    Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
    Pop-Location
  }

  $archiveName = if ($target.Archive -eq "zip") {
    "4-2-agent-$($target.Platform)-$($target.Arch).zip"
  } else {
    "4-2-agent-$($target.Platform)-$($target.Arch).tar.gz"
  }
  $archivePath = Join-Path $distRoot $archiveName

  if ($target.Archive -eq "zip") {
    if (Test-Path $archivePath) {
      Remove-Item $archivePath -Force
    }
    Compress-Archive -Path $binaryPath -DestinationPath $archivePath -CompressionLevel Optimal
  } else {
    if (Test-Path $archivePath) {
      Remove-Item $archivePath -Force
    }
    & tar -czf $archivePath -C $workDir $binaryName
  }

  $sha256 = (Get-FileHash -Path $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  $installCommand = if ($target.Platform -eq "windows") {
    "`$installRoot = Join-Path `$env:LOCALAPPDATA '4-2'; Expand-Archive -LiteralPath ./$archiveName -DestinationPath `$installRoot -Force; & (Join-Path `$installRoot '4-2-agent.exe') install --api-url $ApiUrl --scope user --enrollment-token <token-from-site>"
  } else {
    "tar -xzf ./$archiveName && ./4-2-agent install --api-url $ApiUrl --scope user --enrollment-token <token-from-site>"
  }

  $notes = switch ($target.Platform) {
    "windows" { @("Default install scope is user, not system.", "Elevation is a separate explicit step and is never requested silently.", "Uses Task Scheduler for persistence in a Windows-native way.") }
    "macos" { @("Default install scope is user, not system.", "Elevation is a separate explicit step and is never requested silently.", "Uses launchd with LaunchAgent by default; LaunchDaemon only on explicit elevated install.") }
    default { @("Default install scope is user, not system.", "Elevation is a separate explicit step and is never requested silently.", "Uses systemd user services by default; system-wide mode requires explicit sudo.") }
  }

  $manifestItems += [ordered]@{
    platform = $target.Platform
    arch = $target.Arch
    filename = $archiveName
    installCommand = $installCommand
    sha256 = $sha256
    url = "$InstallerBaseUrl/$archiveName"
    notes = $notes
  }
}

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  items = $manifestItems
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $distRoot "manifest.json") -Encoding utf8
Write-Host "Agent artifacts generated in $distRoot"
