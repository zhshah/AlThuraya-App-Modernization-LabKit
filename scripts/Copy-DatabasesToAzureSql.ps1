<#
.SYNOPSIS
    Migrates the Group Finance Portal databases (schema and data) from the on-premises SQL Server to Azure SQL Database.

.DESCRIPTION
    The "DBA" step of the modernization lab. Run it ON the on-premises server (CONTOSO-WEB01) in an
    elevated Windows PowerShell after the Azure SQL logical server exists:
      1. Downloads SqlPackage (Microsoft signature verified) to C:\ThurayaData\migration.
      2. Extracts each database with all table data into a .dacpac.
      3. Publishes it to Azure SQL Database with Microsoft Entra authentication (access token).
         Windows logins, users and permissions are NOT migrated: in Azure the applications use managed identities.
      4. Carries over sequence positions (for example the budget transfer numbers).
      5. Compares the row count of every table in the source and the target.
    The Azure SQL server must allow this server's public IP address in its firewall.

.PARAMETER TargetServer
    The Azure SQL logical server, for example sql-thuraya-team1.database.windows.net.

.PARAMETER AccessToken
    A Microsoft Entra access token for Azure SQL of an Entra admin of the server. Create it on your own machine with
    az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv
    If omitted, the script asks for it (the input is hidden).

.EXAMPLE
    C:\ContosoSetup\src\scripts\Copy-DatabasesToAzureSql.ps1 -TargetServer sql-thuraya-team1.database.windows.net
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$TargetServer,
    [string]$AccessToken,
    [string]$Databases = 'ThurayaFinance,ThurayaTreasury',
    [string]$SourceServer = '.\SQLEXPRESS',
    [string]$WorkDir = 'C:\ThurayaData\migration'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step([string]$Message) { Write-Host ('[{0:HH:mm:ss}] {1}' -f (Get-Date), $Message) }

function Invoke-Query([string]$ConnectionString, [string]$Sql, [string]$Token) {
    $connection = New-Object System.Data.SqlClient.SqlConnection $ConnectionString
    if ($Token) { $connection.AccessToken = $Token }
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandText = $Sql
        $command.CommandTimeout = 120
        $table = New-Object System.Data.DataTable
        $table.Load($command.ExecuteReader())
        return , $table
    }
    finally { $connection.Dispose() }
}

$rowCountsSql = @"
SELECT s.name + '.' + t.name AS table_name, SUM(p.rows) AS row_count
FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE t.is_ms_shipped = 0
GROUP BY s.name, t.name;
"@

try {
    if ($TargetServer -notmatch '^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]?\.database\.windows\.net$') {
        throw "TargetServer must look like <name>.database.windows.net (got '$TargetServer')."
    }
    if (-not $AccessToken) {
        $secure = Read-Host -AsSecureString 'Paste the Azure SQL access token (input hidden)'
        $AccessToken = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    }
    $AccessToken = $AccessToken.Trim()
    if ($AccessToken.Split('.').Count -ne 3) { throw 'The access token is not a JWT - create it with: az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv' }

    # ------------------------------------------------------------------ SqlPackage
    New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
    $sqlPackage = Join-Path $WorkDir 'sqlpackage\sqlpackage.exe'
    if (-not (Test-Path $sqlPackage)) {
        Write-Step 'Downloading SqlPackage'
        $zip = Join-Path $WorkDir 'sqlpackage.zip'
        Invoke-WebRequest -Uri 'https://aka.ms/sqlpackage-windows' -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath (Join-Path $WorkDir 'sqlpackage') -Force
        Remove-Item $zip -Force
    }
    $signature = Get-AuthenticodeSignature -FilePath $sqlPackage
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
        throw "SqlPackage signature check failed ($($signature.Status), $($signature.SignerCertificate.Subject))"
    }
    Write-Step ('SqlPackage {0} (Microsoft signature valid)' -f (Get-Item $sqlPackage).VersionInfo.ProductVersion)

    $failed = 0
    foreach ($database in ($Databases -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })) {
        Write-Step "=== $database"
        $source = "Server=$SourceServer;Database=$database;Integrated Security=True;TrustServerCertificate=True"
        $target = "Server=tcp:$TargetServer,1433;Database=$database;Encrypt=True;TrustServerCertificate=False;Connect Timeout=60"
        $targetMaster = "Server=tcp:$TargetServer,1433;Database=master;Encrypt=True;TrustServerCertificate=False;Connect Timeout=60"

        $exists = (Invoke-Query $targetMaster "SELECT COUNT(*) AS n FROM sys.databases WHERE name = N'$database';" $AccessToken).Rows[0].n -gt 0
        if ($exists) {
            $tables = (Invoke-Query $target "SELECT COUNT(*) AS n FROM sys.tables WHERE is_ms_shipped = 0;" $AccessToken).Rows[0].n
            if ($tables -gt 0) {
                throw "Azure SQL database $database already contains tables. To migrate again, delete the Azure database first (its data would be replaced)."
            }
        }

        Write-Step "  extracting schema and data from $SourceServer"
        $dacpac = Join-Path $WorkDir "$database.dacpac"
        & $sqlPackage /Action:Extract "/SourceConnectionString:$source" "/TargetFile:$dacpac" /OverwriteFiles:True `
            /p:ExtractAllTableData=True /p:IgnoreUserLoginMappings=True /p:IgnorePermissions=True /p:VerifyExtraction=False | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dacpac)) { throw "SqlPackage extract of $database failed (exit $LASTEXITCODE)" }
        Write-Step ('  {0:N0} KB package' -f ((Get-Item $dacpac).Length / 1KB))

        Write-Step "  publishing to $TargetServer (new databases are created in the Basic tier)"
        $publish = & $sqlPackage /Action:Publish "/SourceFile:$dacpac" "/TargetConnectionString:$target" "/AccessToken:$AccessToken" `
            /p:AllowIncompatiblePlatform=True /p:ExcludeObjectTypes="Users;Logins;RoleMembership;Permissions;ServerRoleMembership;ServerRoles" `
            /p:DatabaseEdition=Basic /p:DatabaseServiceObjective=Basic 2>&1 | ForEach-Object { "$_" }
        if ($LASTEXITCODE -ne 0) {
            $publish | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" }
            if ($publish -match 'Client with IP address') { Write-Host '    -> add this server''s public IP address to the Azure SQL firewall and run the script again.' }
            throw "SqlPackage publish of $database failed (exit $LASTEXITCODE)"
        }

        # Sequences are created with their original start value: continue where the on-premises database stopped.
        $sequences = Invoke-Query $source "SELECT s.name AS schema_name, q.name, CAST(q.last_used_value AS BIGINT) AS last_used, CAST(q.increment AS BIGINT) AS increment FROM sys.sequences q JOIN sys.schemas s ON s.schema_id = q.schema_id WHERE q.last_used_value IS NOT NULL;"
        foreach ($sequence in $sequences.Rows) {
            $next = [long]$sequence.last_used + [long]$sequence.increment
            Invoke-Query $target "ALTER SEQUENCE [$($sequence.schema_name)].[$($sequence.name)] RESTART WITH $next; SELECT 1 AS ok;" $AccessToken | Out-Null
            Write-Step "  sequence $($sequence.name) continues at $next"
        }

        $sourceRows = @{}
        foreach ($row in (Invoke-Query $source $rowCountsSql).Rows) { $sourceRows[$row.table_name] = [long]$row.row_count }
        $targetRows = @{}
        foreach ($row in (Invoke-Query $target $rowCountsSql $AccessToken).Rows) { $targetRows[$row.table_name] = [long]$row.row_count }
        $mismatches = @($sourceRows.Keys | Where-Object { $targetRows[$_] -ne $sourceRows[$_] })
        $total = ($sourceRows.Values | Measure-Object -Sum).Sum
        if ($mismatches.Count -gt 0) {
            $failed++
            $mismatches | ForEach-Object { Write-Host ('    MISMATCH {0}: on-premises {1}, Azure {2}' -f $_, $sourceRows[$_], $targetRows[$_]) }
        }
        else {
            Write-Step ('  verified: {0} tables, {1:N0} rows identical in Azure SQL' -f $sourceRows.Count, $total)
        }
    }
    if ($failed -gt 0) { throw "$failed database(s) differ after the migration" }
    Write-Host 'MIGRATION_OK'
}
catch {
    Write-Host "MIGRATION_FAILED: $($_.Exception.Message)"
    exit 1
}
finally {
    Remove-Variable AccessToken -ErrorAction SilentlyContinue
}
