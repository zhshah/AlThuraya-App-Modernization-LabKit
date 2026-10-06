#Requires -Version 7.0
<#
.SYNOPSIS
    Deletes a modernization lab: its resource group, the soft-deleted Key Vault and the locally saved VM password.

.DESCRIPTION
    Only the lab resource group is deleted. When the lab was placed in an existing virtual network
    (-VnetName on Deploy-OnPremVM.ps1) that network is not touched - the VM's NIC lives in the lab resource group.
    Asks you to type the resource group name unless -Force is used.

.EXAMPLE
    ./scripts/Remove-OnPremVM.ps1 -ResourceGroup rg-contoso-lab
#>
[CmdletBinding()]
param(
    [string]$SubscriptionId,
    [string]$ResourceGroup = 'rg-contoso-lab',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'onprem-vm/LabHelpers.psm1') -Force
$stopwatch = [Diagnostics.Stopwatch]::StartNew()

try {
    $account = Connect-LabSubscription $SubscriptionId
    $names = Get-LabNames -SubscriptionId $account.id -ResourceGroup $ResourceGroup -VmName 'vm-contoso-web01'
    $group = Get-AzJsonOrNull group show -n $ResourceGroup -o json

    if ($group) {
        $resources = @(Invoke-AzJson resource list -g $ResourceGroup --query '[].{name:name, type:type}' -o json)
        Write-Host "Resource group $ResourceGroup in subscription '$($account.name)' contains $($resources.Count) resources:"
        $resources | Format-Table -AutoSize | Out-String | Write-Host
        if (-not $Force) {
            $answer = Read-Host "Type '$ResourceGroup' to delete it permanently"
            if ($answer -ne $ResourceGroup) { Write-Host 'Cancelled - nothing was deleted.'; return }
        }
        $vaults = @(Invoke-Az keyvault list -g $ResourceGroup --query '[].name' -o tsv)
        Write-Phase "Deleting resource group $ResourceGroup (5-10 minutes)"
        Invoke-Az group delete -n $ResourceGroup --yes -o none
    }
    else {
        Write-Host "Resource group $ResourceGroup does not exist in '$($account.name)'."
        $vaults = @()
    }

    # Purge soft-deleted vaults so the same lab can be deployed again right away.
    foreach ($vault in @($vaults + $names.KeyVault | Select-Object -Unique)) {
        if (Get-AzJsonOrNull keyvault show-deleted --name $vault --query id -o json) {
            Write-Phase "Purging soft-deleted Key Vault $vault"
            Invoke-Az keyvault purge --name $vault -o none
        }
    }

    $credentialPath = Get-LabCredentialPath -SubscriptionId $account.id -ResourceGroup $ResourceGroup
    if (Test-Path $credentialPath) { Remove-Item $credentialPath -Force }

    Write-Phase ('Lab {0} removed in {1:hh\:mm\:ss}' -f $ResourceGroup, $stopwatch.Elapsed)
}
catch {
    Write-Host "REMOVAL STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Run the same command again to continue.'
    exit 1
}
