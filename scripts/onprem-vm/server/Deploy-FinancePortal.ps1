<#
.SYNOPSIS
    Builds and deploys the Al Thuraya Group Finance Portal on the "on-premises" server (CONTOSO-WEB01).

.DESCRIPTION
    Executed as SYSTEM through Azure Run Command (Windows PowerShell 5.1). Idempotent.
    The source package (src/, database/, scripts/) is embedded in this script by LabHelpers.psm1 (Publish-LabApp).
      1. Unpacks the embedded source package
      2. Builds the ASP.NET MVC portal (NuGet + MSBuild) and the Java treasury service (Maven, incl. unit tests)
      3. Creates/updates the ThurayaFinance and ThurayaTreasury databases on SQL Server Express and loads the
         demonstration data - only into empty databases, or when ResetDemoData=true (replaces all demo data)
      4. Removes the earlier Contoso Retail demo application from IIS and Tomcat, if present
      5. Publishes the portal to IIS (site 'ThurayaFinance', app pool 'ThurayaFinancePortal', port 80)
      6. Deploys treasury-service.war to Tomcat 9 (port 8080)
      7. Verifies freshly loaded data against the generator (parity check) and runs the end-to-end smoke test
    Full log: C:\ContosoSetup\logs\deploy-*.log
#>
[CmdletBinding()]
param(
    [string]$SetupRoot = 'C:\ContosoSetup',
    [string]$DataRoot = 'C:\ThurayaData',
    [string]$SiteRoot = 'C:\inetpub\ThurayaFinance',
    [string]$TomcatHome = 'C:\Tomcat9',
    [string]$ResetDemoData = 'false'
)

$SourcePackageBase64 = '__SOURCE_PACKAGE_BASE64__'

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$logDir = Join-Path $SetupRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir ('deploy-{0:yyyyMMdd-HHmmss}.log' -f (Get-Date))) | Out-Null

$appPool = 'ThurayaFinancePortal'
$appPoolAccount = "IIS APPPOOL\$appPool"
$siteName = 'ThurayaFinance'
$localServiceSid = '*S-1-5-19'

# Node.js runs the portal's original data generator (database/seed) to produce the demonstration data.
$nodeVersion = 'v24.13.1'
$nodeZipSha256 = 'fba577c4bb87df04d54dd87bbdaa5a2272f1f99a2acbf9152e1a91b8b5f0b279'

function Write-Step([string]$Message) { Write-Host ('[{0:HH:mm:ss}] {1}' -f (Get-Date), $Message) }

function Invoke-Native([string]$FilePath, [string[]]$ArgumentList = @(), [int[]]$SuccessCodes = @(0)) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = & $FilePath @ArgumentList 2>&1 | ForEach-Object { "$_" } }
    finally { $ErrorActionPreference = $previous }
    if ($SuccessCodes -notcontains $LASTEXITCODE) {
        $output | Select-Object -Last 40 | ForEach-Object { Write-Host "    $_" }
        throw "$([IO.Path]::GetFileName($FilePath)) exited with code $LASTEXITCODE"
    }
    return $output
}

# NuGet and Maven download from the internet: retry transient network failures.
function Invoke-NativeWithRetry([string]$FilePath, [string[]]$ArgumentList = @(), [int]$Attempts = 3) {
    for ($attempt = 1; ; $attempt++) {
        try { return Invoke-Native $FilePath $ArgumentList }
        catch {
            if ($attempt -ge $Attempts) { throw }
            Write-Step "  $([IO.Path]::GetFileName($FilePath)) failed ($($_.Exception.Message)) - retrying in 20 s"
            Start-Sleep -Seconds 20
        }
    }
}

function New-RandomSecret([int]$Length = 28) {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = New-Object byte[] $Length
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return 'Aa1-' + (-join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] }))
}

function Invoke-Sql([string]$Sql, [string]$Database = 'master', [hashtable]$Parameters = @{}) {
    $connectionString = "Server=.\SQLEXPRESS;Database=$Database;Integrated Security=True;Connect Timeout=30"
    for ($attempt = 1; ; $attempt++) {
        $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
        try { $connection.Open(); break }
        catch { $connection.Dispose(); if ($attempt -ge 20) { throw }; Start-Sleep -Seconds 6 }
    }
    try {
        foreach ($batch in [regex]::Split($Sql, '^\s*GO\s*$', 'IgnoreCase, Multiline')) {
            if (-not $batch.Trim()) { continue }
            $command = $connection.CreateCommand()
            $command.CommandTimeout = 300
            $command.CommandText = $batch
            foreach ($key in $Parameters.Keys) { [void]$command.Parameters.AddWithValue($key, $Parameters[$key]) }
            [void]$command.ExecuteNonQuery()
        }
    }
    finally { $connection.Dispose() }
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds = 240) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30
            if ($response.StatusCode -eq 200) { return $response }
        }
        catch { $lastError = $_.Exception.Message }
        Start-Sleep -Seconds 5
    } while ((Get-Date) -lt $deadline)
    throw "$Url did not return HTTP 200 within $TimeoutSeconds s ($lastError)"
}

function Invoke-SqlScalar([string]$Sql, [string]$Database) {
    $connection = New-Object System.Data.SqlClient.SqlConnection "Server=.\SQLEXPRESS;Database=$Database;Integrated Security=True;Connect Timeout=30"
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandText = $Sql
        return $command.ExecuteScalar()
    }
    finally { $connection.Dispose() }
}

# Pinned Node.js (portable zip, SHA-256 verified) under C:\ContosoSetup\tools - not installed system-wide.
function Install-NodeRuntime {
    $toolsDir = Join-Path $SetupRoot 'tools'
    $nodeExe = Join-Path $toolsDir "node-$nodeVersion-win-x64\node.exe"
    if (Test-Path $nodeExe) { return $nodeExe }
    Write-Step "  downloading Node.js $nodeVersion (portable) for the data generator"
    $zip = Join-Path $toolsDir "node-$nodeVersion-win-x64.zip"
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
    for ($attempt = 1; ; $attempt++) {
        try { Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip" -OutFile $zip -UseBasicParsing -TimeoutSec 300; break }
        catch {
            if ($attempt -ge 3) { throw }
            Write-Step "  download failed ($($_.Exception.Message)) - retrying in 20 s"
            Start-Sleep -Seconds 20
        }
    }
    $hash = (Get-FileHash -Path $zip -Algorithm SHA256).Hash
    if ($hash -ne $nodeZipSha256) {
        Remove-Item $zip -Force
        throw "Node.js download failed verification (SHA-256 $hash)"
    }
    Expand-Archive -Path $zip -DestinationPath $toolsDir -Force
    Remove-Item $zip -Force
    if (-not (Test-Path $nodeExe)) { throw "$nodeExe not found after extracting Node.js" }
    return $nodeExe
}

try {
    # ------------------------------------------------------------------ 1. Source
    Write-Step 'Unpacking the embedded source package'
    if ($SourcePackageBase64.StartsWith('__')) { throw 'No source package is embedded - deploy with scripts/Deploy-OnPremVM.ps1 or scripts/Update-OnPremVM.ps1.' }
    $zip = Join-Path $SetupRoot 'finance-portal-source.zip'
    [IO.File]::WriteAllBytes($zip, [Convert]::FromBase64String($SourcePackageBase64))
    Remove-Variable SourcePackageBase64
    $src = Join-Path $SetupRoot 'src'
    if (Test-Path $src) { Remove-Item $src -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $src -Force

    # ------------------------------------------------------------------ 2. Build
    $env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
    $mavenHome = [Environment]::GetEnvironmentVariable('MAVEN_HOME', 'Machine')
    $msbuild = 'C:\BuildTools\MSBuild\Current\Bin\MSBuild.exe'
    $nuget = Join-Path $SetupRoot 'tools\nuget.exe'

    Write-Step 'Building ThurayaFinance.Portal (.NET Framework 4.8) with NuGet + MSBuild'
    $publishDir = Join-Path $SetupRoot 'publish\portal'
    if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }
    Invoke-NativeWithRetry $nuget @('restore', "$src\src\dotnet\ThurayaFinance.sln", '-NonInteractive') | Out-Null
    Invoke-Native $msbuild @("$src\src\dotnet\ThurayaFinance.Portal\ThurayaFinance.Portal.csproj", '/nologo', '/v:minimal', '/m',
        '/p:Configuration=Release', '/p:DeployOnBuild=true', '/p:PublishProfile=FolderProfile', "/p:PublishUrl=$publishDir\") | Out-Null
    if (-not (Test-Path "$publishDir\bin\ThurayaFinance.Portal.dll")) { throw "MSBuild did not produce $publishDir\bin\ThurayaFinance.Portal.dll" }

    Write-Step 'Building treasury-service (Java 8 / Spring Boot 2.7) with Maven, including unit tests'
    $javaProject = "$src\src\java\treasury-service"
    Push-Location $javaProject
    try {
        $mavenOutput = Invoke-NativeWithRetry "$mavenHome\bin\mvn.cmd" @('-B', '-ntp', "-Dmaven.repo.local=$SetupRoot\m2", 'clean', 'package')
    }
    finally { Pop-Location }
    $mavenOutput | Where-Object { $_ -match 'Tests run:.*Fail' } | Select-Object -Last 1 | ForEach-Object { Write-Step "  $_" }
    $war = "$javaProject\target\treasury-service.war"
    if (-not (Test-Path $war)) { throw "Maven did not produce $war" }

    # ------------------------------------------------------------------ 3. Databases and demonstration data
    Write-Step 'Creating/updating the ThurayaFinance and ThurayaTreasury databases on .\SQLEXPRESS'
    Invoke-Sql (Get-Content "$src\database\00-create-databases.sql" -Raw -Encoding UTF8)
    Invoke-Sql (Get-Content "$src\database\ThurayaFinance\01-schema.sql" -Raw -Encoding UTF8) 'ThurayaFinance'
    Invoke-Sql (Get-Content "$src\database\ThurayaTreasury\01-schema.sql" -Raw -Encoding UTF8) 'ThurayaTreasury'

    # Both databases are loaded from the same dataset (payment runs reference invoices), so they are always seeded together.
    $invoiceCount = [int](Invoke-SqlScalar 'SELECT COUNT(*) FROM dbo.invoice;' 'ThurayaFinance')
    $runCount = [int](Invoke-SqlScalar 'SELECT COUNT(*) FROM dbo.payment_run;' 'ThurayaTreasury')
    $seeded = $false
    $dataset = Join-Path $SetupRoot 'seed\dataset.json'
    if ($ResetDemoData -eq 'true' -or $invoiceCount -eq 0 -or $runCount -eq 0) {
        $reason = if ($ResetDemoData -eq 'true') { 'reset requested' } else { 'empty database' }
        Write-Step "Loading the demonstration data ($reason)"
        $node = Install-NodeRuntime
        New-Item -ItemType Directory -Force -Path (Split-Path $dataset) | Out-Null
        Invoke-Native $node @("$src\database\seed\generate-dataset.js", $dataset) | ForEach-Object { Write-Step "  $_" }
        $json = [IO.File]::ReadAllText($dataset, [Text.Encoding]::UTF8)
        Invoke-Sql (Get-Content "$src\database\ThurayaFinance\02-seed.sql" -Raw -Encoding UTF8) 'ThurayaFinance' -Parameters @{ '@data' = $json }
        Invoke-Sql (Get-Content "$src\database\ThurayaTreasury\02-seed.sql" -Raw -Encoding UTF8) 'ThurayaTreasury' -Parameters @{ '@data' = $json }
        Remove-Variable json
        $seeded = $true
    }
    else {
        Write-Step "  keeping the existing demonstration data ($invoiceCount invoices, $runCount payment runs); ResetDemoData=true reloads it"
    }

    # ------------------------------------------------------------------ 4. Retire the earlier Contoso Retail demo on this server
    Import-Module WebAdministration
    if (Test-Path 'IIS:\Sites\ContosoRetail') {
        Write-Step 'Removing the earlier Contoso Retail application (IIS site, app pool, Tomcat web app)'
        Remove-Website -Name 'ContosoRetail'
    }
    if (Test-Path 'IIS:\AppPools\ContosoRetailPortal') { Remove-WebAppPool -Name 'ContosoRetailPortal' }

    # ------------------------------------------------------------------ 5. Local folders used by both applications
    $portalFolders = 'mail-pickup', 'logs' | ForEach-Object { Join-Path "$DataRoot\portal" $_ }
    $treasuryFolders = 'bank-files', 'reports', 'logs' | ForEach-Object { Join-Path "$DataRoot\treasury" $_ }
    $treasuryConfigDir = "$DataRoot\treasury\config"
    New-Item -ItemType Directory -Force -Path ($portalFolders + $treasuryFolders + $treasuryConfigDir + $SiteRoot) | Out-Null

    # ------------------------------------------------------------------ 6. IIS application pool + SQL logins
    Write-Step "Configuring IIS application pool $appPool"
    if (-not (Test-Path "IIS:\AppPools\$appPool")) { New-WebAppPool -Name $appPool | Out-Null }
    Set-ItemProperty "IIS:\AppPools\$appPool" -Name managedRuntimeVersion -Value 'v4.0'
    Set-ItemProperty "IIS:\AppPools\$appPool" -Name managedPipelineMode -Value 'Integrated'
    Set-ItemProperty "IIS:\AppPools\$appPool" -Name processModel.identityType -Value 'ApplicationPoolIdentity'
    Set-ItemProperty "IIS:\AppPools\$appPool" -Name processModel.loadUserProfile -Value $true
    Set-ItemProperty "IIS:\AppPools\$appPool" -Name startMode -Value 'AlwaysRunning'

    Write-Step 'Granting database access (portal: Windows auth via app pool identity, treasury service: SQL login)'
    Invoke-Sql "IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$appPoolAccount') CREATE LOGIN [$appPoolAccount] FROM WINDOWS WITH DEFAULT_DATABASE = [ThurayaFinance];"
    Invoke-Sql @"
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$appPoolAccount') CREATE USER [$appPoolAccount] FOR LOGIN [$appPoolAccount];
ALTER ROLE db_datareader ADD MEMBER [$appPoolAccount];
ALTER ROLE db_datawriter ADD MEMBER [$appPoolAccount];
GRANT EXECUTE ON SCHEMA::dbo TO [$appPoolAccount];
GRANT UPDATE ON OBJECT::dbo.budget_transfer_seq TO [$appPoolAccount];
"@ 'ThurayaFinance'

    $treasuryConfigFile = Join-Path $treasuryConfigDir 'application.properties'
    # Config folder: SYSTEM + Administrators full control, Tomcat's LocalService account read-only. The file inherits it.
    Invoke-Native 'icacls.exe' @($treasuryConfigDir, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', "${localServiceSid}:(OI)(CI)R", '/Q') | Out-Null
    if (Test-Path $treasuryConfigFile) { Invoke-Native 'icacls.exe' @($treasuryConfigFile, '/reset', '/Q') | Out-Null }
    $treasuryPassword = $null
    if (Test-Path $treasuryConfigFile) {
        $line = Select-String -Path $treasuryConfigFile -Pattern '^spring\.datasource\.password=(.+)$' | Select-Object -First 1
        if ($line) { $treasuryPassword = $line.Matches[0].Groups[1].Value.Trim() }
    }
    if (-not $treasuryPassword) { $treasuryPassword = New-RandomSecret }
    Invoke-Sql @"
DECLARE @sql NVARCHAR(MAX);
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'thuraya_treasury')
    SET @sql = N'CREATE LOGIN [thuraya_treasury] WITH PASSWORD = ' + QUOTENAME(@password, '''') + N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [ThurayaTreasury]';
ELSE
    SET @sql = N'ALTER LOGIN [thuraya_treasury] WITH PASSWORD = ' + QUOTENAME(@password, '''') + N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF';
EXEC (@sql);
"@ -Parameters @{ '@password' = $treasuryPassword }
    Invoke-Sql @"
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'thuraya_treasury') CREATE USER [thuraya_treasury] FOR LOGIN [thuraya_treasury];
ALTER ROLE db_datareader ADD MEMBER [thuraya_treasury];
ALTER ROLE db_datawriter ADD MEMBER [thuraya_treasury];
"@ 'ThurayaTreasury'

    # ------------------------------------------------------------------ 7. Portal -> IIS
    Write-Step "Publishing the portal to IIS site $siteName ($SiteRoot)"
    if (Test-Path 'IIS:\Sites\Default Web Site') { Remove-Website -Name 'Default Web Site' }
    if (-not (Test-Path "IIS:\Sites\$siteName")) {
        # Explicit -Id: New-Website throws "Index was outside the bounds of the array" when no site exists.
        $siteId = 2
        while (Get-Website | Where-Object { $_.id -eq $siteId }) { $siteId++ }
        New-Website -Name $siteName -Id $siteId -Port 80 -PhysicalPath $SiteRoot -ApplicationPool $appPool | Out-Null
    }
    if ((Get-WebAppPoolState -Name $appPool).Value -eq 'Started') { Stop-WebAppPool -Name $appPool; Start-Sleep -Seconds 3 }
    Invoke-Native 'robocopy.exe' @($publishDir, $SiteRoot, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2') -SuccessCodes 0, 1, 2, 3, 4, 5, 6, 7 | Out-Null
    Invoke-Native 'icacls.exe' @($SiteRoot, '/grant', "${appPoolAccount}:(OI)(CI)RX", '/T', '/Q') | Out-Null
    Invoke-Native 'icacls.exe' @("$DataRoot\portal", '/grant', "${appPoolAccount}:(OI)(CI)M", '/T', '/Q') | Out-Null
    if (-not [System.Diagnostics.EventLog]::SourceExists('ThurayaFinance.Portal')) { New-EventLog -LogName Application -Source 'ThurayaFinance.Portal' }
    Start-WebAppPool -Name $appPool
    if ((Get-WebsiteState -Name $siteName).Value -ne 'Started') { Start-Website -Name $siteName }

    # ------------------------------------------------------------------ 8. Treasury service -> Tomcat
    Write-Step 'Deploying treasury-service.war to Tomcat 9'
    $slash = { param([string]$Path) $Path -replace '\\', '/' }
    @(
        '# Server-specific overrides for the Group Treasury service (written by Deploy-FinancePortal.ps1).'
        "spring.datasource.password=$treasuryPassword"
        "treasury.bank-file-dir=$(& $slash "$DataRoot\treasury\bank-files")"
        "treasury.report-dir=$(& $slash "$DataRoot\treasury\reports")"
        "logging.file.name=$(& $slash "$DataRoot\treasury\logs")/treasury-service.log"
    ) | Set-Content -Path $treasuryConfigFile -Encoding ASCII
    Remove-Variable treasuryPassword
    Invoke-Native 'icacls.exe' @($treasuryConfigFile, '/reset', '/Q') | Out-Null
    foreach ($folder in $treasuryFolders) { Invoke-Native 'icacls.exe' @($folder, '/grant', "${localServiceSid}:(OI)(CI)M", '/T', '/Q') | Out-Null }

    # One external configuration location for Spring Boot web apps on this Tomcat (replaces the Contoso one).
    $catalinaProperties = "$TomcatHome\conf\catalina.properties"
    $configLocation = 'spring.config.additional-location=optional:file:' + (& $slash $treasuryConfigDir) + '/'
    $kept = @(Get-Content -Path $catalinaProperties | Where-Object { $_ -notmatch '^spring\.config\.additional-location=' -and $_ -notmatch '^# .* external configuration$' }) -join "`r`n"
    Set-Content -Path $catalinaProperties -Value ($kept.TrimEnd() + "`r`n`r`n# Group Treasury service external configuration`r`n$configLocation`r`n") -Encoding ASCII -NoNewline

    Stop-Service -Name 'Tomcat9' -Force
    foreach ($app in 'inventory-service', 'treasury-service') {
        Remove-Item "$TomcatHome\webapps\$app", "$TomcatHome\webapps\$app.war" -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path "$TomcatHome\webapps\ROOT") {
        Set-Content -Path "$TomcatHome\webapps\ROOT\index.html" -Encoding ASCII -Value '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/treasury-service/"><title>Group Treasury service</title></head><body><a href="/treasury-service/">Group Treasury service</a></body></html>'
    }
    Copy-Item $war "$TomcatHome\webapps\treasury-service.war" -Force
    Start-Service -Name 'Tomcat9'
    Wait-HttpOk 'http://localhost:8080/treasury-service/actuator/health' 300 | Out-Null
    Write-Step '  treasury service is UP'

    # ------------------------------------------------------------------ 9. Verify end to end
    Write-Step 'Warming up the portal'
    Wait-HttpOk 'http://localhost/health' 180 | Out-Null
    if ($seeded) {
        Write-Step 'Parity check: the data served by the portal must equal the generated dataset'
        $served = Join-Path $SetupRoot 'seed\served-data.json'
        $response = Invoke-WebRequest -Uri 'http://localhost/api/data' -UseBasicParsing -TimeoutSec 120
        [IO.File]::WriteAllText($served, $response.Content, (New-Object System.Text.UTF8Encoding $false))
        $parity = Invoke-Native $node @("$src\database\seed\compare-dataset.js", $dataset, $served) -SuccessCodes 0, 1
        $parity | Select-Object -Last 26 | ForEach-Object { Write-Step "  $_" }
        if (-not ($parity -match 'PARITY_OK')) { throw 'The data served by the portal differs from the generated dataset' }
    }
    Write-Step 'Running the end-to-end smoke test'
    $smoke = & "$src\scripts\Invoke-SmokeTest.ps1" -PortalUrl 'http://localhost' -TreasuryUrl 'http://localhost:8080/treasury-service' 6>&1 | ForEach-Object { "$_" }
    $smoke | ForEach-Object { Write-Host "  $_" }
    if (-not ($smoke -match 'SMOKE_TEST_PASSED')) { throw 'Smoke test failed' }

    Write-Step 'Summary'
    Write-Host "  Portal (IIS)          : http://localhost/  -> $SiteRoot"
    Write-Host "  Treasury (Tomcat 9)   : http://localhost:8080/treasury-service/"
    Write-Host "  Databases             : .\SQLEXPRESS  ThurayaFinance, ThurayaTreasury"
    Write-Host "  Local data folders    : $DataRoot"
    Write-Host 'DEPLOY_OK'
}
catch {
    Write-Host "DEPLOY_FAILED: $($_.Exception.Message)"
    Write-Host $_.ScriptStackTrace
    exit 1
}
finally {
    Stop-Transcript | Out-Null
}
