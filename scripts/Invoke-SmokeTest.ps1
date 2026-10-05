<#
.SYNOPSIS
    End-to-end smoke test for the Al Thuraya Group Finance Portal: treasury service API, portal page, data and write APIs.

.DESCRIPTION
    Works with Windows PowerShell 5.1 and PowerShell 7. Use it against the on-premises VM, a local
    development machine, or the modernized deployment on Azure (change the URLs).
    Leaves no data behind: the write checks send requests the server must refuse (missing anti-forgery
    token, validation, invalid state), which exercises the full request path without changing the demo data.

.EXAMPLE
    ./scripts/Invoke-SmokeTest.ps1 -PortalUrl http://contoso-onprem-xxxxx.swedencentral.cloudapp.azure.com -TreasuryUrl http://contoso-onprem-xxxxx.swedencentral.cloudapp.azure.com:8080/treasury-service
#>
[CmdletBinding()]
param(
    [string]$PortalUrl = 'http://localhost',
    [string]$TreasuryUrl = 'http://localhost:8080/treasury-service'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PortalUrl = $PortalUrl.TrimEnd('/')
$TreasuryUrl = $TreasuryUrl.TrimEnd('/')
$script:failures = 0

function Test-Step([string]$Name, [scriptblock]$Test) {
    try {
        $detail = & $Test
        Write-Host "[PASS] $Name $detail"
    }
    catch {
        $script:failures++
        Write-Host "[FAIL] $Name - $($_.Exception.Message)"
    }
}

Test-Step 'Treasury service status' {
    $status = Invoke-RestMethod -Uri "$TreasuryUrl/api/status" -TimeoutSec 30
    if ($status.databaseStatus -ne 'UP') { throw "database status is $($status.databaseStatus)" }
    "(v$($status.version), Java $($status.javaVersion), Spring Boot $($status.springBootVersion), $($status.server))"
}

Test-Step 'Treasury position (bank accounts, 13-week cash forecast)' {
    $position = Invoke-RestMethod -Uri "$TreasuryUrl/api/treasury/position" -TimeoutSec 30
    $accounts = @($position.accounts)
    $forecast = @($position.forecast)
    if ($accounts.Count -eq 0 -or $forecast.Count -eq 0) { throw "$($accounts.Count) accounts, $($forecast.Count) forecast weeks" }
    "($($accounts.Count) accounts, $($forecast.Count) forecast weeks, opening cash QAR {0:N0})" -f [decimal]$position.openingCash
}

Test-Step 'Treasury payment runs' {
    # Assign first: Windows PowerShell returns a JSON array as one object.
    $response = Invoke-RestMethod -Uri "$TreasuryUrl/api/payment-runs" -TimeoutSec 30
    $runs = @($response)
    if ($runs.Count -eq 0) { throw 'no payment runs returned' }
    "($($runs.Count) runs, $(@($runs | Where-Object { $_.status -eq 'awaiting' }).Count) awaiting release)"
}

Test-Step 'Portal health endpoint' {
    $health = Invoke-RestMethod -Uri "$PortalUrl/health" -TimeoutSec 60
    if ($health.status -ne 'Healthy') { throw "status is $($health.status): $($health.checks | ConvertTo-Json -Compress)" }
    "($($health.server.machineName), $($health.server.webServer), $($health.server.dotNetFramework))"
}

$script:token = $null
Test-Step 'Portal page' {
    $page = Invoke-WebRequest -Uri "$PortalUrl/" -UseBasicParsing -TimeoutSec 60
    if ($page.Content -notmatch 'Group Finance Portal') { throw 'portal title not found' }
    if (-not $page.Headers['Content-Security-Policy']) { throw 'Content-Security-Policy header missing' }
    $script:token = [regex]::Match($page.Content, '<meta name="csrf-token" content="([^"]+)"').Groups[1].Value
    if (-not $script:token) { throw 'anti-forgery token not found' }
    "(HTTP $($page.StatusCode), $($page.Content.Length) bytes)"
}

foreach ($asset in '/assets/app.css', '/assets/i18n.js', '/assets/app.js') {
    Test-Step "Portal asset $asset" {
        $response = Invoke-WebRequest -Uri "$PortalUrl$asset" -UseBasicParsing -TimeoutSec 60
        "(HTTP $($response.StatusCode), $($response.RawContentLength) bytes)"
    }
}

Test-Step 'Portal dataset script (/portal/data)' {
    $response = Invoke-WebRequest -Uri "$PortalUrl/portal/data" -UseBasicParsing -TimeoutSec 120
    if ($response.Content -notmatch 'window\.ATH\.data = \{') { throw ($response.Content.Substring(0, [Math]::Min(300, $response.Content.Length))) }
    "($([Math]::Round($response.RawContentLength / 1KB)) KB)"
}

$script:paidInvoice = $null
$script:costCentre = $null
Test-Step 'Portal data API (SQL Server + treasury service)' {
    $data = Invoke-RestMethod -Uri "$PortalUrl/api/data" -TimeoutSec 120
    if ($data.treasuryError) { throw "treasury data unavailable: $($data.treasuryError)" }
    $counts = foreach ($name in 'entities', 'vendors', 'invoices', 'receivables', 'accounts', 'paymentRuns', 'approvals', 'audit') { "$name $(@($data.$name).Count)" }
    if (@($data.invoices).Count -eq 0 -or @($data.accounts).Count -eq 0) { throw "incomplete data: $($counts -join ', ')" }
    $script:paidInvoice = (@($data.invoices) | Where-Object { $_.status -eq 'paid' } | Select-Object -First 1).id
    $script:costCentre = (@($data.costCentres) | Select-Object -First 1).id
    "($($counts -join ', '))"
}

function Invoke-PortalApi([string]$Path, [hashtable]$Body, [string]$Token) {
    $headers = @{}
    if ($Token) { $headers['X-CSRF-Token'] = $Token }
    try {
        [void](Invoke-RestMethod -Uri "$PortalUrl$Path" -Method Post -Body ($Body | ConvertTo-Json -Compress) -ContentType 'application/json' -Headers $headers -TimeoutSec 60)
        return [pscustomobject]@{ Status = 200; Code = $null }
    }
    catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        if ($status -eq 0) { throw }
        $code = $null
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { try { $code = ($_.ErrorDetails.Message | ConvertFrom-Json).error.code } catch { $code = $null } }
        return [pscustomobject]@{ Status = $status; Code = $code }
    }
}

function Assert-Refused($Result, [int]$Status, [string]$Code) {
    if ($Result.Status -ne $Status -or $Result.Code -ne $Code) { throw "expected HTTP $Status $Code, got HTTP $($Result.Status) $($Result.Code)" }
    "(HTTP $Status $Code, nothing saved)"
}

# The body is invalid as well, so nothing could be saved even if the token check failed.
Test-Step 'Write API refuses requests without the anti-forgery token' {
    Assert-Refused (Invoke-PortalApi '/api/budget-transfers' @{ from = 'CC-0000'; to = 'CC-0000'; amount = 1; justification = 'smoke test' } $null) 403 'CSRF'
}

Test-Step 'Budget transfer validation (same cost centre)' {
    if (-not $script:costCentre) { throw 'no cost centre found in the data' }
    Assert-Refused (Invoke-PortalApi '/api/budget-transfers' @{ from = $script:costCentre; to = $script:costCentre; amount = 1000; justification = 'smoke test' } $script:token) 400 'VALIDATION'
}

Test-Step 'Invoice hold refused for a paid invoice (SQL lookup)' {
    if (-not $script:paidInvoice) { throw 'no paid invoice found in the data' }
    Assert-Refused (Invoke-PortalApi "/api/invoices/$($script:paidInvoice)/hold" @{ hold = $true } $script:token) 409 'INVALID_STATE'
}

Test-Step 'Rejection without a reason is refused' {
    Assert-Refused (Invoke-PortalApi '/api/approvals/APR-SMOKE-TEST/decision' @{ decision = 'reject'; comment = '' } $script:token) 400 'COMMENT_REQUIRED'
}

Test-Step 'Audit API refuses events the browser may not record' {
    Assert-Refused (Invoke-PortalApi '/api/audit' @{ action = 'approve'; object = 'invoice'; ref = 'smoke test' } $script:token) 400 'VALIDATION'
}

if ($script:failures -eq 0) {
    Write-Host 'SMOKE_TEST_PASSED'
    exit 0
}
else {
    Write-Host "SMOKE_TEST_FAILED ($script:failures failing checks)"
    exit 1
}
