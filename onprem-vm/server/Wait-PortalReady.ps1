<#
.SYNOPSIS
    Waits until the Group Finance Portal is fully up after a VM start, reboot or resize, then warms it up.

.DESCRIPTION
    Executed as SYSTEM through Azure Run Command. Starts any stopped service, waits for the treasury
    service (Tomcat) and the portal (IIS) health endpoints, and requests the portal page and its data once
    so the first click in front of a customer is fast. If the WAR failed to deploy because SQL Server was
    still recovering at boot, Tomcat is restarted once.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$started = Get-Date

function Write-Step([string]$Message) { Write-Host ('[{0:HH:mm:ss}] {1}' -f (Get-Date), $Message) }

function Get-HttpStatus([string]$Url) {
    try { return [int](Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 60).StatusCode }
    catch {
        $response = $_.Exception.Response
        if ($response) { return [int]$response.StatusCode }
        return 0
    }
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds, [scriptblock]$OnStuck, [int]$StuckAfterSeconds = 0) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $begin = Get-Date
    $recovered = $false
    while ($true) {
        $status = Get-HttpStatus $Url
        if ($status -eq 200) { return }
        if ($OnStuck -and -not $recovered -and $StuckAfterSeconds -gt 0 -and ((Get-Date) - $begin).TotalSeconds -gt $StuckAfterSeconds) {
            & $OnStuck $status
            $recovered = $true
        }
        if ((Get-Date) -gt $deadline) { throw "$Url did not return HTTP 200 within $TimeoutSeconds s (last status $status)" }
        Start-Sleep -Seconds 10
    }
}

try {
    Write-Step 'Waiting for SQL Server, IIS and Tomcat services'
    foreach ($name in 'MSSQL$SQLEXPRESS', 'W3SVC', 'Tomcat9') {
        $deadline = (Get-Date).AddMinutes(10)
        while ((Get-Service -Name $name).Status -ne 'Running') {
            if ((Get-Service -Name $name).Status -eq 'Stopped') {
                try { Start-Service -Name $name } catch { Write-Step "  start of $name failed: $($_.Exception.Message)" }
            }
            if ((Get-Date) -gt $deadline) { throw "Service $name is not running after 10 minutes" }
            Start-Sleep -Seconds 5
        }
    }

    Write-Step 'Waiting for the treasury service (Tomcat 9)'
    Wait-HttpOk -Url 'http://localhost:8080/treasury-service/actuator/health' -TimeoutSeconds 600 -StuckAfterSeconds 180 -OnStuck {
        param($status)
        Write-Step "  treasury service still returns $status - restarting Tomcat9 once"
        Restart-Service -Name 'Tomcat9' -Force
    }

    Write-Step 'Waiting for the portal (IIS)'
    Wait-HttpOk -Url 'http://localhost/health' -TimeoutSeconds 300

    Write-Step 'Warming up the portal'
    foreach ($page in '/', '/portal/data', '/assets/app.js', '/assets/i18n.js', '/assets/app.css') {
        $status = Get-HttpStatus "http://localhost$page"
        if ($status -ne 200) { throw "Portal URL $page returned $status" }
    }
    Write-Step ("Ready after {0:N0} s" -f ((Get-Date) - $started).TotalSeconds)
    Write-Host 'READY_OK'
}
catch {
    Write-Host "READY_FAILED: $($_.Exception.Message)"
    exit 1
}
