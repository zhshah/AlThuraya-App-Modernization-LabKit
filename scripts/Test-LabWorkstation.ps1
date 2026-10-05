<#
.SYNOPSIS
    Checks a participant workstation for the GitHub Copilot modernization lab (Group Finance Portal).

.DESCRIPTION
    Read-only: reports what is missing and how to fix it; it installs nothing. Works in Windows PowerShell 5.1
    and PowerShell 7. Every check comes from the lab's validation runs:
      - The .NET assessment (AppCAT) and the .NET Framework build need Visual Studio 2022/2026 or Build Tools with
        the web workload and the .NET Framework 4.8 targeting pack ("Msbuild was not found" otherwise).
      - The modernization tools download AppCAT from nuget.org and JDK/Maven artifacts from the internet.
      - The agent provisions JDK 21 and Maven itself, so a JDK is optional.

.EXAMPLE
    ./scripts/Test-LabWorkstation.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:results = New-Object System.Collections.Generic.List[object]

function Add-Result([string]$Area, [string]$Check, [string]$Status, [string]$Detail, [string]$Fix = '') {
    $script:results.Add([pscustomobject]@{ Area = $Area; Check = $Check; Status = $Status; Detail = $Detail; Fix = $Fix })
}

function Get-CommandVersion([string]$Name, [string[]]$Arguments) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) { return $null }
    try { return ((& $command.Source @Arguments 2>&1) | Select-Object -First 1 | Out-String).Trim() } catch { return 'installed' }
}

function Test-Url([string]$Url) {
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 5
        return [int]$response.StatusCode -lt 400
    }
    catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode -lt 500 }
        return $false
    }
}

# ------------------------------------------------------------------ Operating system
$onWindows = [Environment]::OSVersion.Platform -eq 'Win32NT'
if ($onWindows) {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $arch = $env:PROCESSOR_ARCHITEW6432 }
    Add-Result 'System' 'Windows' 'OK' "$([Environment]::OSVersion.VersionString), $arch"
}
else {
    Add-Result 'System' 'Windows' 'FAIL' 'This lab needs Windows: the legacy portal is a .NET Framework 4.8 project.' 'Use a Windows 10/11 machine or a Windows dev VM / Dev Box.'
}

# ------------------------------------------------------------------ Editor and Copilot
$code = Get-Command code -ErrorAction SilentlyContinue
if ($code) {
    $extensions = @(& $code.Source --list-extensions 2>$null)
    Add-Result 'Editor' 'Visual Studio Code' 'OK' ((& $code.Source --version 2>$null | Select-Object -First 1))
    # Recent VS Code versions ship Copilot Chat as a built-in extension, which --list-extensions does not show.
    $installDir = Split-Path (Split-Path $code.Source)
    if (@(Resolve-Path (Join-Path $installDir '*\resources\app\extensions\copilot'), (Join-Path $installDir 'resources\app\extensions\copilot') -ErrorAction SilentlyContinue).Count -gt 0) {
        $extensions += 'github.copilot-chat'
    }
    $wanted = [ordered]@{
        'github.copilot-chat'           = @('GitHub Copilot Chat', 'FAIL', 'Install "GitHub Copilot Chat" and sign in with a GitHub account that has Copilot.')
        'vscjava.migrate-java-to-azure' = @('GitHub Copilot modernization', 'FAIL', 'Install "GitHub Copilot modernization" (vscjava.migrate-java-to-azure).')
        'ms-dotnettools.upgrade-agent'  = @('GitHub Copilot upgrade (.NET)', 'WARN', 'code --install-extension ms-dotnettools.upgrade-agent')
        'ms-dotnettools.csdevkit'       = @('C# Dev Kit', 'WARN', 'code --install-extension ms-dotnettools.csdevkit')
    }
    foreach ($id in $wanted.Keys) {
        $info = $wanted[$id]
        if ($extensions -contains $id) { Add-Result 'Editor' $info[0] 'OK' $id }
        else { Add-Result 'Editor' $info[0] $info[1] "$id not installed" $info[2] }
    }
}
else {
    Add-Result 'Editor' 'Visual Studio Code' 'FAIL' "'code' is not on PATH" 'Install VS Code (https://code.visualstudio.com) and reopen the terminal.'
}

# ------------------------------------------------------------------ .NET toolchain
$sdks = @()
$dotnetVersion = Get-CommandVersion 'dotnet' @('--list-sdks')
if ($dotnetVersion) { $sdks = @(dotnet --list-sdks 2>$null) }
$net10 = $sdks | Where-Object { $_ -match '^(\d+)\.' -and [int]$Matches[1] -ge 10 } | Select-Object -First 1
if ($net10) { Add-Result '.NET' '.NET 10 SDK' 'OK' ($net10 -replace '\s*\[.*$', '') }
elseif ($sdks.Count -gt 0) { Add-Result '.NET' '.NET 10 SDK' 'FAIL' "found $($sdks.Count) older SDK(s)" 'winget install Microsoft.DotNet.SDK.10' }
else { Add-Result '.NET' '.NET 10 SDK' 'FAIL' 'no .NET SDK found' 'winget install Microsoft.DotNet.SDK.10' }

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$msbuildInstance = $null
if (Test-Path $vswhere) {
    $msbuildInstance = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -property installationPath 2>$null | Select-Object -First 1
}
if ($msbuildInstance) {
    Add-Result '.NET' 'MSBuild (VS or Build Tools)' 'OK' $msbuildInstance
    $webTargets = Get-ChildItem -Path (Join-Path $msbuildInstance 'MSBuild\Microsoft\VisualStudio') -Filter 'Microsoft.WebApplication.targets' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($webTargets) { Add-Result '.NET' 'ASP.NET web build targets' 'OK' 'Microsoft.WebApplication.targets found' }
    else { Add-Result '.NET' 'ASP.NET web build targets' 'FAIL' 'web workload missing' 'In the Visual Studio Installer add "ASP.NET and web development" (or Build Tools: Web development build tools).' }
}
else {
    Add-Result '.NET' 'MSBuild (VS or Build Tools)' 'FAIL' 'no Visual Studio / Build Tools instance' 'Install Visual Studio 2026 (ASP.NET and web development) or: winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.WebBuildTools;includeRecommended --add Microsoft.Net.Component.4.8.TargetingPack"'
}
$targetingPack = Join-Path ${env:ProgramFiles(x86)} 'Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8'
if (Test-Path $targetingPack) { Add-Result '.NET' '.NET Framework 4.8 targeting pack' 'OK' $targetingPack }
else { Add-Result '.NET' '.NET Framework 4.8 targeting pack' 'FAIL' 'not installed' 'Visual Studio Installer > Individual components > ".NET Framework 4.8 targeting pack".' }

# ------------------------------------------------------------------ Java toolchain (optional: the agent provisions JDK 21 + Maven)
$java = Get-CommandVersion 'java' @('-version')
if ($java) { Add-Result 'Java' 'JDK' 'OK' $java } else { Add-Result 'Java' 'JDK' 'INFO' 'not on PATH' 'Optional - GitHub Copilot modernization installs JDK 21 and Maven for the upgrade.' }
$mvn = Get-CommandVersion 'mvn' @('-v')
if ($mvn) { Add-Result 'Java' 'Maven' 'OK' $mvn } else { Add-Result 'Java' 'Maven' 'INFO' 'not on PATH' 'Optional - installed by the agent when needed.' }

# ------------------------------------------------------------------ Source control, Azure and CLI tools
$git = Get-CommandVersion 'git' @('--version')
if ($git) { Add-Result 'Tools' 'Git' 'OK' $git } else { Add-Result 'Tools' 'Git' 'FAIL' 'not found' 'winget install Git.Git' }
$az = Get-Command az -ErrorAction SilentlyContinue
if ($az) {
    $account = az account show --query "{name:name, user:user.name}" -o json 2>$null | Out-String
    if ($LASTEXITCODE -eq 0 -and $account.Trim()) {
        $a = $account | ConvertFrom-Json
        Add-Result 'Tools' 'Azure CLI (signed in)' 'OK' "$($a.user) - $($a.name)"
    }
    else { Add-Result 'Tools' 'Azure CLI (signed in)' 'FAIL' 'not signed in' 'az login' }
}
else { Add-Result 'Tools' 'Azure CLI' 'FAIL' 'not found' 'winget install Microsoft.AzureCLI' }
$azd = Get-CommandVersion 'azd' @('version')
if ($azd) { Add-Result 'Tools' 'Azure Developer CLI' 'OK' $azd } else { Add-Result 'Tools' 'Azure Developer CLI' 'WARN' 'not found' 'winget install Microsoft.Azd (used if the agent chooses an azd deployment).' }
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    gh auth status 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Add-Result 'Tools' 'GitHub CLI (signed in)' 'OK' (gh --version | Select-Object -First 1) }
    else { Add-Result 'Tools' 'GitHub CLI (signed in)' 'INFO' 'not signed in - optional, not used by the lab' }
}
else { Add-Result 'Tools' 'GitHub CLI' 'INFO' 'not installed - optional, not used by the lab' }
$modernize = Get-Command modernize -ErrorAction SilentlyContinue
if (-not $modernize -and (Test-Path "$env:LOCALAPPDATA\Programs\modernize\modernize.exe")) {
    Add-Result 'Tools' 'Modernize CLI' 'INFO' 'installed, not on PATH in this terminal - optional, not used by the lab'
}
elseif ($modernize) { Add-Result 'Tools' 'Modernize CLI' 'OK' ((& $modernize.Source --version 2>$null | Select-Object -First 1)) }
else { Add-Result 'Tools' 'Modernize CLI' 'INFO' 'not installed - optional, not used by the lab' }

# ------------------------------------------------------------------ Network: package feeds the agents download from
foreach ($endpoint in @(
        @('https://api.nuget.org/v3/index.json', 'nuget.org (AppCAT for .NET, NuGet packages)', 'FAIL'),
        @('https://repo.maven.apache.org/maven2/', 'Maven Central (Java build)', 'FAIL'),
        @('https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip', 'Microsoft Build of OpenJDK download', 'WARN'),
        @('https://api.githubcopilot.com/_ping', 'Copilot API (agents)', 'FAIL'),
        @('https://github.com', 'github.com (Copilot, code)', 'FAIL'))) {
    if (Test-Url $endpoint[0]) { Add-Result 'Network' $endpoint[1] 'OK' $endpoint[0] }
    else { Add-Result 'Network' $endpoint[1] $endpoint[2] "$($endpoint[0]) not reachable" 'Allow it in the proxy/firewall, or point NuGet/Maven to an approved mirror.' }
}

# ------------------------------------------------------------------ Report
$script:results | Format-Table Area, Check, Status, Detail -AutoSize -Wrap | Out-String -Width 220 | Write-Host
$todo = @($script:results | Where-Object { $_.Status -in 'FAIL', 'WARN' -and $_.Fix })
if ($todo.Count) {
    Write-Host 'To fix:'
    $todo | ForEach-Object { Write-Host ("  [{0}] {1}: {2}" -f $_.Status, $_.Check, $_.Fix) }
}
$failures = @($script:results | Where-Object { $_.Status -eq 'FAIL' }).Count
if ($failures -eq 0) { Write-Host 'WORKSTATION_READY'; exit 0 }
Write-Host "WORKSTATION_NOT_READY ($failures blocking item(s))"
exit 1
