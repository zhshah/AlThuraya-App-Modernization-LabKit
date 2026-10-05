#Requires -Version 7.0
<#
.SYNOPSIS
    Rebuilds and redeploys the Group Finance Portal on an existing lab VM (for example after source changes) and verifies it.

.DESCRIPTION
    Starts the VM when it is deallocated, ships src/, database/ and scripts/ inside an Azure Run Command,
    builds and deploys on the server, waits until healthy and runs the end-to-end smoke test from this machine.
    The demonstration data in SQL Server is kept (approvals, holds, transfers made in demos stay);
    -ResetDemoData reloads the original data, dated relative to today.

.EXAMPLE
    ./onprem-vm/Update-LabApp.ps1 -ResourceGroup rg-contoso-lab

.EXAMPLE
    ./onprem-vm/Update-LabApp.ps1 -ResourceGroup rg-contoso-lab -ResetDemoData
    Redeploys and resets the demo data before the next customer session.
#>
[CmdletBinding()]
param(
    [string]$SubscriptionId,
    [string]$ResourceGroup = 'rg-contoso-lab',
    [string]$VmName = 'vm-contoso-web01',
    [switch]$ResetDemoData,
    [switch]$SkipExternalTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = Split-Path $PSScriptRoot -Parent
Import-Module (Join-Path $PSScriptRoot 'LabHelpers.psm1') -Force
$stopwatch = [Diagnostics.Stopwatch]::StartNew()

try {
    Write-Phase 'Checking the lab VM'
    $account = Connect-LabSubscription $SubscriptionId
    $names = Get-LabNames -SubscriptionId $account.id -ResourceGroup $ResourceGroup -VmName $VmName
    if (-not (Get-AzJsonOrNull vm show -g $ResourceGroup -n $VmName --query id -o json)) {
        throw "VM $VmName not found in $ResourceGroup ($($account.name)). Deploy the lab first: ./onprem-vm/Deploy-Lab.ps1 -ResourceGroup $ResourceGroup"
    }
    Wait-LabVm -ResourceGroup $ResourceGroup -VmName $VmName

    Write-Phase 'Building on the server and deploying to IIS + Tomcat'
    Publish-LabApp -RepoRoot $repoRoot -ResourceGroup $ResourceGroup -VmName $VmName -ResetDemoData:$ResetDemoData
    Wait-LabAppReady -ResourceGroup $ResourceGroup -VmName $VmName

    $fqdn = Invoke-Az network public-ip show -g $ResourceGroup -n $names.PublicIp --query dnsSettings.fqdn -o tsv
    if (-not $SkipExternalTest) {
        Write-Phase 'End-to-end test from this machine through the public URL'
        if (-not (Test-LabAppExternally -RepoRoot $repoRoot -Fqdn $fqdn)) {
            Write-Warning 'The app is healthy on the VM but not reachable from this machine - re-run Deploy-Lab.ps1 with -AllowedSourceIp <your ip>.'
        }
    }
    Write-Phase ('Updated in {0:hh\:mm\:ss}' -f $stopwatch.Elapsed)
    Write-Host "  Portal           : http://$fqdn/"
    Write-Host "  Treasury service : http://${fqdn}:8080/treasury-service/"
}
catch {
    Write-Host "UPDATE STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
