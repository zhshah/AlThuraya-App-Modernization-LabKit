<#
.SYNOPSIS
    Installs the "on-premises" server stack for the Group Finance Portal on Windows Server 2022.

.DESCRIPTION
    Executed as SYSTEM through Azure Run Command (Windows PowerShell 5.1). Idempotent - every component
    is skipped when already present, so a re-run continues where a previous run stopped.
      Phase Runtime    : IIS 10 + ASP.NET 4.8, SQL Server 2022 Express (SQLEXPRESS, TCP 1433),
                         Eclipse Temurin JDK 8, Apache Tomcat 9 (service 'Tomcat9', port 8080, starts after SQL Server)
      Phase BuildTools : Visual Studio 2022 Build Tools (web + .NET Framework 4.8), NuGet CLI, Apache Maven,
                         SQL Server Management Studio (best effort)
    Downloads are pinned and verified (SHA-256/SHA-512 or Microsoft Authenticode signature) and retried.
    Full log: C:\ContosoSetup\logs\prerequisites-*.log
#>
[CmdletBinding()]
param(
    [ValidateSet('All', 'Runtime', 'BuildTools')]
    [string]$Phase = 'All',
    [string]$SetupRoot = 'C:\ContosoSetup',
    [string]$InstallSsms = 'true'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Pinned versions - change here to move the whole lab to newer builds.
$SqlExpressUrl = 'https://download.microsoft.com/download/29654887-7cde-4397-bba3-d7f087970845/SQL2022-SSEI-Expr.exe'
$JdkMsiUrl = 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u504-b01/OpenJDK8U-jdk_x64_windows_hotspot_8u504b01.msi'
$JdkMsiSha256 = '5115720df210f3c98b592ea2cb9981f48ba6b6942a7c40ba7fe4a59c37d5b815'
$TomcatVersion = '9.0.98'
$TomcatSha512 = 'c9c10a4fc0139717196c2f3034fd52966c543c5247e9da6272afcd58ed1825f3910912554660e6f9c29205ee91780806d0f8f795598839c720edc0cb06e9c9b2'
$MavenVersion = '3.9.9'
$MavenSha512 = '8beac8d11ef208f1e2a8df0682b9448a9a363d2ad13ca74af43705549e72e74c9378823bf689287801cbbfc2f6ea9596201d19ccacfdfb682ee8a2ff4c4418ba'
$NuGetUrl = 'https://dist.nuget.org/win-x86-commandline/v7.9.0/nuget.exe'
$NuGetSha256 = '992D70CAC5B06C38EFEC91806CABA64CDCC07E6D963A0959DBBBAF264D33B800'
$VsBuildToolsUrl = 'https://aka.ms/vs/17/release/vs_buildtools.exe'
$SsmsUrl = 'https://aka.ms/ssms/22/release/vs_SSMS.exe'

$downloads = Join-Path $SetupRoot 'downloads'
$toolsDir = Join-Path $SetupRoot 'tools'
$logDir = Join-Path $SetupRoot 'logs'
New-Item -ItemType Directory -Force -Path $downloads, $toolsDir, $logDir | Out-Null
Start-Transcript -Path (Join-Path $logDir ('prerequisites-{0}-{1:yyyyMMdd-HHmmss}.log' -f $Phase, (Get-Date))) | Out-Null

function Write-Step([string]$Message) { Write-Host ('[{0:HH:mm:ss}] {1}' -f (Get-Date), $Message) }

function Get-IntegrityProblem([string]$Path, [string]$Sha256, [string]$Sha512, [bool]$MicrosoftSigned) {
    if ($Sha256 -and (Get-FileHash $Path -Algorithm SHA256).Hash -ne $Sha256.ToUpperInvariant()) { return 'SHA-256 mismatch' }
    if ($Sha512 -and (Get-FileHash $Path -Algorithm SHA512).Hash -ne $Sha512.ToUpperInvariant()) { return 'SHA-512 mismatch' }
    if ($MicrosoftSigned) {
        $signature = Get-AuthenticodeSignature $Path
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
            return "untrusted signature ($($signature.Status))"
        }
    }
    return $null
}

function Get-Download([string]$Uri, [string]$FileName, [string]$Sha256, [string]$Sha512, [switch]$MicrosoftSigned) {
    $path = Join-Path $downloads $FileName
    for ($attempt = 1; $attempt -le 4; $attempt++) {
        if (-not (Test-Path $path)) {
            Write-Step "  downloading $Uri"
            try {
                Invoke-WebRequest -Uri $Uri -OutFile "$path.partial" -UseBasicParsing
                Move-Item "$path.partial" $path -Force
            }
            catch {
                Remove-Item "$path.partial" -Force -ErrorAction SilentlyContinue
                if ($attempt -eq 4) { throw "Download failed after $attempt attempts: $Uri ($($_.Exception.Message))" }
                Write-Step "  download failed ($($_.Exception.Message)) - retrying in $(20 * $attempt) s"
                Start-Sleep -Seconds (20 * $attempt)
                continue
            }
        }
        $problem = Get-IntegrityProblem $path $Sha256 $Sha512 $MicrosoftSigned.IsPresent
        if (-not $problem) { return $path }
        Remove-Item $path -Force
        if ($attempt -eq 4) { throw "Integrity check failed for ${FileName}: $problem" }
        Write-Step "  $FileName failed verification ($problem) - downloading again"
    }
}

function Invoke-Process([string]$FilePath, [string]$Arguments, [int[]]$SuccessCodes = @(0), [switch]$HideArguments) {
    $shown = if ($HideArguments) { '<arguments hidden>' } else { $Arguments }
    Write-Step "  running $([IO.Path]::GetFileName($FilePath)) $shown"
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -Wait -PassThru -NoNewWindow
    if ($SuccessCodes -notcontains $process.ExitCode) { throw "$([IO.Path]::GetFileName($FilePath)) exited with code $($process.ExitCode)" }
}

function Invoke-Native([string]$FilePath, [string[]]$ArgumentList = @()) {
    # Windows PowerShell turns native stderr into terminating errors when EAP=Stop.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $output = & $FilePath @ArgumentList 2>&1 | ForEach-Object { "$_" } }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) {
        $output | Select-Object -Last 30 | ForEach-Object { Write-Host $_ }
        throw "$FilePath exited with code $LASTEXITCODE"
    }
    return $output
}

function New-RandomSecret([int]$Length = 28) {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    $bytes = New-Object byte[] $Length
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return 'Aa1-' + (-join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] }))
}

function Invoke-Sql([string]$Sql, [string]$Database = 'master') {
    $connectionString = "Server=.\SQLEXPRESS;Database=$Database;Integrated Security=True;Connect Timeout=30"
    for ($attempt = 1; ; $attempt++) {
        $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
        try { $connection.Open(); break }
        catch { $connection.Dispose(); if ($attempt -ge 20) { throw }; Start-Sleep -Seconds 6 }
    }
    try {
        foreach ($batch in [regex]::Split($Sql, '^\s*GO\s*$', 'IgnoreCase, Multiline')) {
            if ($batch.Trim()) {
                $command = $connection.CreateCommand()
                $command.CommandTimeout = 300
                $command.CommandText = $batch
                [void]$command.ExecuteNonQuery()
            }
        }
    }
    finally { $connection.Dispose() }
}

function Install-Runtime {
    # ------------------------------------------------------------------ IIS
    Write-Step 'IIS 10 + ASP.NET 4.8'
    $features = 'Web-Server', 'Web-Default-Doc', 'Web-Static-Content', 'Web-Http-Errors', 'Web-Http-Logging',
                'Web-Request-Monitor', 'Web-Stat-Compression', 'Web-Filtering', 'Web-Net-Ext45', 'Web-Asp-Net45',
                'Web-ISAPI-Ext', 'Web-ISAPI-Filter', 'Web-Mgmt-Console', 'Web-Scripting-Tools'
    $iis = Install-WindowsFeature -Name $features
    Write-Step ("  success={0} restartNeeded={1}" -f $iis.Success, $iis.RestartNeeded)

    # ------------------------------------------------------------------ SQL Server 2022 Express
    $sqlService = 'MSSQL$SQLEXPRESS'
    if (-not (Get-Service -Name $sqlService -ErrorAction SilentlyContinue)) {
        Write-Step 'SQL Server 2022 Express'
        $ssei = Get-Download -Uri $SqlExpressUrl -FileName 'SQL2022-SSEI-Expr.exe' -MicrosoftSigned
        $media = Join-Path $downloads 'sql2022'
        if (-not (Get-ChildItem $media -Filter 'SQLEXPR*.exe' -ErrorAction SilentlyContinue)) {
            Invoke-Process $ssei "/ACTION=Download /MEDIAPATH=`"$media`" /MEDIATYPE=Core /QUIET"
        }
        $package = Get-ChildItem $media -Filter 'SQLEXPR*.exe' | Select-Object -First 1
        if (-not $package) { throw 'The SQL Server Express media download did not produce SQLEXPR*.exe' }
        $extracted = Join-Path $media 'setup'
        if (-not (Test-Path (Join-Path $extracted 'SETUP.EXE'))) {
            Invoke-Process $package.FullName "/Q /X:`"$extracted`""
        }
        # sa gets a throw-away random password: administrators connect with Windows authentication.
        $saPassword = New-RandomSecret
        $setupArgs = '/Q /ACTION=Install /FEATURES=SQLENGINE /INSTANCENAME=SQLEXPRESS /SQLSYSADMINACCOUNTS="BUILTIN\Administrators" ' +
                     "/SECURITYMODE=SQL /SAPWD=`"$saPassword`" /TCPENABLED=1 /NPENABLED=0 /UPDATEENABLED=False /IACCEPTSQLSERVERLICENSETERMS"
        try { Invoke-Process (Join-Path $extracted 'SETUP.EXE') $setupArgs -SuccessCodes 0, 3010 -HideArguments }
        catch {
            $summary = Get-ChildItem 'C:\Program Files\Microsoft SQL Server\*\Setup Bootstrap\Log\Summary.txt' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($summary) { Get-Content $summary.FullName -Tail 40 | ForEach-Object { Write-Host $_ } }
            throw
        }
        Remove-Variable saPassword, setupArgs
    }
    $instanceId = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL').SQLEXPRESS
    $tcpKey = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId\MSSQLServer\SuperSocketNetLib\Tcp"
    $ipAll = Get-ItemProperty "$tcpKey\IPAll"
    if ($ipAll.TcpPort -ne '1433' -or $ipAll.TcpDynamicPorts) {
        Write-Step '  configuring static TCP port 1433'
        Set-ItemProperty $tcpKey -Name Enabled -Value 1
        Set-ItemProperty "$tcpKey\IPAll" -Name TcpDynamicPorts -Value ''
        Set-ItemProperty "$tcpKey\IPAll" -Name TcpPort -Value '1433'
        Restart-Service -Name $sqlService -Force
    }
    Set-Service -Name $sqlService -StartupType Automatic
    if ((Get-Service -Name $sqlService).Status -ne 'Running') { Start-Service -Name $sqlService }
    # Leave memory for IIS and Tomcat on the 4 GiB VM.
    Invoke-Sql "EXEC sp_configure 'show advanced options', 1; RECONFIGURE; EXEC sp_configure 'max server memory (MB)', 1024; RECONFIGURE;"

    # ------------------------------------------------------------------ JDK 8
    $javaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
    if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome 'bin\java.exe'))) {
        Write-Step 'Eclipse Temurin JDK 8'
        $msi = Get-Download -Uri $JdkMsiUrl -FileName ([IO.Path]::GetFileName($JdkMsiUrl)) -Sha256 $JdkMsiSha256
        Invoke-Process 'msiexec.exe' "/i `"$msi`" ADDLOCAL=FeatureMain,FeatureEnvironment,FeatureJarFileRunWith,FeatureJavaHome /quiet /norestart /l*v `"$logDir\temurin-jdk8-msi.log`"" -SuccessCodes 0, 3010
        $javaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
        if (-not $javaHome) { throw 'JAVA_HOME was not set by the JDK installer' }
    }
    $env:JAVA_HOME = $javaHome
    $env:Path = "$javaHome\bin;$env:Path"

    # ------------------------------------------------------------------ Tomcat 9
    $tomcatHome = 'C:\Tomcat9'
    if (-not (Test-Path "$tomcatHome\bin\tomcat9.exe")) {
        Write-Step "Apache Tomcat $TomcatVersion"
        $zip = Get-Download -Uri "https://archive.apache.org/dist/tomcat/tomcat-9/v$TomcatVersion/bin/apache-tomcat-$TomcatVersion-windows-x64.zip" `
            -FileName "apache-tomcat-$TomcatVersion-windows-x64.zip" -Sha512 $TomcatSha512
        $staging = Join-Path $downloads 'tomcat'
        Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
        Expand-Archive -Path $zip -DestinationPath $staging -Force
        Move-Item (Join-Path $staging "apache-tomcat-$TomcatVersion") $tomcatHome
        foreach ($app in 'docs', 'examples', 'host-manager', 'manager') {
            Remove-Item (Join-Path "$tomcatHome\webapps" $app) -Recurse -Force -ErrorAction SilentlyContinue
        }
        Set-Content -Path "$tomcatHome\webapps\ROOT\index.html" -Encoding ASCII -Value '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/treasury-service/"><title>Group Treasury service</title></head><body><a href="/treasury-service/">Group Treasury service</a></body></html>'
    }
    if (-not (Get-Service -Name 'Tomcat9' -ErrorAction SilentlyContinue)) {
        Write-Step '  installing Windows service Tomcat9'
        $env:CATALINA_HOME = $tomcatHome
        Invoke-Native 'cmd.exe' @('/c', "$tomcatHome\bin\service.bat", 'install', 'Tomcat9') | Out-Null
    }
    # Tomcat starts after SQL Server so the treasury service never boots without its database.
    Invoke-Native "$tomcatHome\bin\tomcat9.exe" @('//US//Tomcat9', '--Startup', 'auto', '--ServiceUser', 'NT Authority\LocalService', '--JvmMs', '256', '--JvmMx', '512', '--DependsOn', 'MSSQL$SQLEXPRESS') | Out-Null
    Invoke-Native 'icacls.exe' @($tomcatHome, '/grant', '*S-1-5-19:(OI)(CI)M', '/T', '/Q') | Out-Null
    foreach ($rule in @(@{ Name = 'Group Finance Portal (HTTP 80)'; Port = 80 }, @{ Name = 'Group Treasury Service (Tomcat 8080)'; Port = 8080 })) {
        if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Protocol TCP -LocalPort $rule.Port -Action Allow | Out-Null
        }
    }
    if ((Get-Service -Name 'Tomcat9').Status -ne 'Running') { Start-Service -Name 'Tomcat9' }
}

function Install-BuildTools {
    $msbuild = 'C:\BuildTools\MSBuild\Current\Bin\MSBuild.exe'
    if (-not (Test-Path $msbuild)) {
        Write-Step 'Visual Studio 2022 Build Tools (web build tools + .NET Framework 4.8 targeting pack)'
        $vs = Get-Download -Uri $VsBuildToolsUrl -FileName 'vs_buildtools.exe' -MicrosoftSigned
        Invoke-Process $vs '--quiet --wait --norestart --nocache --installPath "C:\BuildTools" --add Microsoft.VisualStudio.Workload.WebBuildTools;includeRecommended --add Microsoft.Net.Component.4.8.TargetingPack' -SuccessCodes 0, 3010
        if (-not (Test-Path $msbuild)) { throw "Build Tools installed but $msbuild is missing" }
    }
    $nuget = Join-Path $toolsDir 'nuget.exe'
    if (-not (Test-Path $nuget)) {
        Write-Step 'NuGet CLI'
        $downloaded = Get-Download -Uri $NuGetUrl -FileName 'nuget.exe' -Sha256 $NuGetSha256
        Copy-Item $downloaded $nuget -Force
    }
    $mavenHome = Join-Path $toolsDir "apache-maven-$MavenVersion"
    if (-not (Test-Path "$mavenHome\bin\mvn.cmd")) {
        Write-Step "Apache Maven $MavenVersion"
        $zip = Get-Download -Uri "https://archive.apache.org/dist/maven/maven-3/$MavenVersion/binaries/apache-maven-$MavenVersion-bin.zip" `
            -FileName "apache-maven-$MavenVersion-bin.zip" -Sha512 $MavenSha512
        Expand-Archive -Path $zip -DestinationPath $toolsDir -Force
    }
    [Environment]::SetEnvironmentVariable('MAVEN_HOME', $mavenHome, 'Machine')
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    foreach ($entry in @("$mavenHome\bin", $toolsDir, 'C:\BuildTools\MSBuild\Current\Bin')) {
        if (($machinePath -split ';') -notcontains $entry) { $machinePath = "$machinePath;$entry" }
    }
    [Environment]::SetEnvironmentVariable('Path', $machinePath, 'Machine')

    if ($InstallSsms -eq 'true' -and -not (Get-ChildItem 'C:\Program Files\Microsoft SQL Server Management Studio*\Release\Common7\IDE\Ssms.exe' -ErrorAction SilentlyContinue)) {
        Write-Step 'SQL Server Management Studio (best effort)'
        try {
            $ssms = Get-Download -Uri $SsmsUrl -FileName 'vs_SSMS.exe' -MicrosoftSigned
            Invoke-Process $ssms '--quiet --wait --norestart --nocache' -SuccessCodes 0, 3010
        }
        catch { Write-Step "  SSMS skipped: $($_.Exception.Message)" }
    }
}

function Write-Summary {
    Write-Step 'Summary'
    $sql = Get-Service 'MSSQL$SQLEXPRESS' -ErrorAction SilentlyContinue
    if ($sql) {
        $instanceId = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL').SQLEXPRESS
        $setup = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceId\Setup"
        Write-Host ("  SQL Server : {0} {1} ({2})" -f $setup.Edition, $setup.Version, $sql.Status)
    }
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\InetStp') { Write-Host ("  IIS        : {0}" -f (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\InetStp').VersionString) }
    $javaHome = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'Machine')
    if ($javaHome -and (Test-Path "$javaHome\bin\java.exe")) { Write-Host ("  Java       : {0}" -f (Invoke-Native "$javaHome\bin\java.exe" @('-version') | Select-Object -First 1)) }
    $tomcat = Get-Service 'Tomcat9' -ErrorAction SilentlyContinue
    if ($tomcat) { Write-Host ("  Tomcat     : {0} service {1}" -f $TomcatVersion, $tomcat.Status) }
    if (Test-Path 'C:\BuildTools\MSBuild\Current\Bin\MSBuild.exe') { Write-Host ("  MSBuild    : {0}" -f (Invoke-Native 'C:\BuildTools\MSBuild\Current\Bin\MSBuild.exe' @('-version', '-nologo') | Select-Object -Last 1)) }
    if (Test-Path (Join-Path $toolsDir "apache-maven-$MavenVersion\bin\mvn.cmd")) { Write-Host "  Maven      : $MavenVersion" }
}

try {
    if ($Phase -in 'All', 'Runtime') { Install-Runtime }
    if ($Phase -in 'All', 'BuildTools') { Install-BuildTools }
    Write-Summary
    Write-Host 'PREREQUISITES_OK'
}
catch {
    Write-Host "PREREQUISITES_FAILED: $($_.Exception.Message)"
    Write-Host $_.ScriptStackTrace
    exit 1
}
finally {
    Stop-Transcript | Out-Null
}
