#Requires -Version 7.0
<#
.SYNOPSIS
    Deploys the lab's "on-premises" server with one command: an Azure VM that mimics the customer's data centre, with
    IIS, Tomcat and SQL Server, the running .NET Framework + Java application (Group Finance Portal, Al Thuraya Holding)
    and its two databases with demo data.

.DESCRIPTION
    Phases - all idempotent: after any interruption simply run the same command again.
      1. Pre-flight      Azure CLI sign-in, resource providers, VM sizes and vCPU quota (with fallbacks)
      2. Azure resources Resource group, Key Vault (VM password), network, NSG limited to your public IP,
                         static public IP with DNS name, Windows Server 2022 VM (Windows Update: manual)
      3. Server software IIS, SQL Server 2022 Express, JDK 8, Tomcat 9, build tools     (Run Command, ~20 min)
      4. Application     Build on the server, deploy to IIS + Tomcat, smoke test        (Run Command, ~3 min)
      5. Right-size      Resize to the cheap demo size and wait until everything is healthy
      6. Verify          End-to-end smoke test from this machine through the public URL
    Every resource is tagged SecurityControl=Ignore. Delete everything with ./scripts/Remove-OnPremVM.ps1.

.EXAMPLE
    ./scripts/Deploy-OnPremVM.ps1
    Current Azure CLI subscription, Sweden Central, resource group rg-contoso-lab with its own virtual network.

.EXAMPLE
    ./scripts/Deploy-OnPremVM.ps1 -SubscriptionId <subscription-id> -Location westeurope -ResourceGroup rg-contoso-lab-fabrikam

.EXAMPLE
    ./scripts/Deploy-OnPremVM.ps1 -ResourceGroup rg-contoso-onprem-swc -VnetResourceGroup sweden-central-vnet -VnetName Sweden-vNet -SubnetName default
    Places the VM in an existing subnet instead of creating a virtual network.
#>
[CmdletBinding()]
param(
    [string]$SubscriptionId,
    [string]$Location = 'swedencentral',
    [string]$ResourceGroup = 'rg-contoso-lab',
    [string]$VmName = 'vm-contoso-web01',
    [ValidateLength(1, 15)][string]$ComputerName = 'CONTOSO-WEB01',
    [string]$AdminUsername = 'contosoadmin',
    # Demo size candidates, cheapest first (2 vCPU / 4 GiB is the minimum for IIS + SQL Server + Tomcat).
    [string[]]$VmSizes = @('Standard_B2als_v2', 'Standard_B2s', 'Standard_B2as_v2', 'Standard_D2as_v5', 'Standard_D2s_v5'),
    # Faster sizes used only while the software is installed and built; falls back to the demo size.
    [string[]]$SetupVmSizes = @('Standard_D4as_v5', 'Standard_D4s_v5', 'Standard_D4as_v4', 'Standard_D4s_v4'),
    # Public IPs or CIDR ranges allowed to reach RDP 3389, HTTP 80 and 8080. Default: this machine's public IP.
    [string[]]$AllowedSourceIp,
    [string]$VnetResourceGroup,
    [string]$VnetName,
    [string]$SubnetName,
    [string]$VnetAddressPrefix = '10.42.0.0/24',
    # Reload the demonstration data even when the databases already hold data (re-runs keep it by default).
    [switch]$ResetDemoData,
    [switch]$SkipExternalTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoRoot = Split-Path $PSScriptRoot -Parent
$vmScripts = Join-Path $PSScriptRoot 'onprem-vm'
Import-Module (Join-Path $vmScripts 'LabHelpers.psm1') -Force
$logDir = Join-Path $vmScripts 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ('deploy-{0}-{1:yyyyMMdd-HHmmss}.log' -f $ResourceGroup, (Get-Date))
Start-Transcript -Path $logFile | Out-Null
$stopwatch = [Diagnostics.Stopwatch]::StartNew()
$tags = @('SecurityControl=Ignore', 'workload=modernization-hackathon', 'environment=onprem-simulation', 'app=finance-portal')

try {
    # ------------------------------------------------------------------ 1. Pre-flight
    Write-Phase '1/6 Pre-flight checks'
    $account = Connect-LabSubscription $SubscriptionId
    $SubscriptionId = $account.id
    Write-Host "    subscription : $($account.name) ($SubscriptionId)"
    Write-Host "    signed in as : $($account.user.name)"
    Register-LabProviders @('Microsoft.Compute', 'Microsoft.Network', 'Microsoft.KeyVault')

    $names = Get-LabNames -SubscriptionId $SubscriptionId -ResourceGroup $ResourceGroup -VmName $VmName
    $existingRg = Get-AzJsonOrNull group show -n $ResourceGroup -o json
    $existingVm = Get-AzJsonOrNull vm show -g $ResourceGroup -n $VmName --query '{size:hardwareProfile.vmSize, location:location}' -o json
    $existingNic = Get-AzJsonOrNull network nic show -g $ResourceGroup -n $names.Nic --query '{subnet:ipConfigurations[0].subnet.id, location:location}' -o json

    $subnetId = $null
    if ($VnetName -or $SubnetName -or $VnetResourceGroup) {
        if (-not ($VnetName -and $SubnetName -and $VnetResourceGroup)) { throw 'Use -VnetResourceGroup, -VnetName and -SubnetName together.' }
        $vnet = Invoke-AzJson network vnet show -g $VnetResourceGroup -n $VnetName --query '{location:location}' -o json
        $subnetId = Invoke-Az network vnet subnet show -g $VnetResourceGroup --vnet-name $VnetName -n $SubnetName --query id -o tsv
        $Location = $vnet.location
    }
    if ($existingNic) { $subnetId = $existingNic.subnet; $Location = $existingNic.location }
    if ($existingVm) { $Location = $existingVm.location }

    if (-not $AllowedSourceIp) { $AllowedSourceIp = @(Get-LabPublicIp) }
    $sourcePrefixes = @($AllowedSourceIp | ForEach-Object { if ($_ -match '/') { $_ } else { "$_/32" } })
    Write-Host "    region       : $Location"
    Write-Host "    allowed from : $($sourcePrefixes -join ', ')"

    if ($existingVm -and $VmSizes -contains $existingVm.size) {
        $targetSize = $existingVm.size
        Write-Host "    VM           : $VmName exists ($targetSize)"
    }
    else {
        Write-Host '    checking VM sizes and vCPU quota...'
        $capacity = Get-LabComputeCapacity -SubscriptionId $SubscriptionId -Location $Location -Sizes ($VmSizes + $SetupVmSizes)
        $targetSize = Select-LabVmSize -Capacity $capacity -Candidates $VmSizes
        if (-not $targetSize) { throw "None of these VM sizes can be used in ${Location}: $($VmSizes -join ', '). Pass -Location or -VmSizes." }
        if ($existingVm) {
            Write-Host "    VM           : $VmName exists ($($existingVm.size)), demo size $targetSize"
        }
        else {
            $setupSize = Select-LabVmSize -Capacity $capacity -Candidates $SetupVmSizes
            if (-not $setupSize) { $setupSize = $targetSize; Write-Host '    no faster setup size available - installing on the demo size (slower)' }
            Write-Host "    VM size      : $setupSize while installing, then $targetSize"
        }
    }

    # ------------------------------------------------------------------ 2. Azure resources
    Write-Phase '2/6 Azure resources'
    if ($existingRg) { Invoke-Az tag update --resource-id $existingRg.id --operation Merge --tags @tags -o none }
    else { Invoke-Az group create -n $ResourceGroup -l $Location --tags @tags -o none }
    Write-Host "    resource group $ResourceGroup"

    $keyVaultReady = $false
    try {
        Initialize-LabKeyVault -Name $names.KeyVault -ResourceGroup $ResourceGroup -Location $Location -TagArgs $tags | Out-Null
        $keyVaultReady = $true
        Write-Host "    Key Vault $($names.KeyVault)"
    }
    catch { Write-Warning "Key Vault is not available ($($_.Exception.Message)) - the VM password is kept on this machine only." }

    if (-not $subnetId) {
        if (-not (Get-AzJsonOrNull network vnet show -g $ResourceGroup -n $names.Vnet --query id -o json)) {
            Invoke-Az network vnet create -g $ResourceGroup -n $names.Vnet -l $Location --address-prefixes $VnetAddressPrefix `
                --subnet-name $names.Subnet --subnet-prefixes $VnetAddressPrefix --tags @tags -o none
        }
        $subnetId = Invoke-Az network vnet subnet show -g $ResourceGroup --vnet-name $names.Vnet -n $names.Subnet --query id -o tsv
    }
    Write-Host "    subnet $($subnetId.Split('/')[-3])/$($subnetId.Split('/')[-1])"

    if (-not (Get-AzJsonOrNull network nsg show -g $ResourceGroup -n $names.Nsg --query id -o json)) {
        Invoke-Az network nsg create -g $ResourceGroup -n $names.Nsg -l $Location --tags @tags -o none
    }
    $rules = @(
        @{ Name = 'Allow-RDP-From-Presenter';    Priority = 100; Port = '3389' },
        @{ Name = 'Allow-HTTP-From-Presenter';   Priority = 110; Port = '80' },
        @{ Name = 'Allow-Tomcat-From-Presenter'; Priority = 120; Port = '8080' }
    )
    $currentRules = @(Get-AzJsonOrNull network nsg rule list -g $ResourceGroup --nsg-name $names.Nsg --query '[].{name:name, priority:priority, direction:direction}' -o json)
    foreach ($rule in $rules) {
        # Rules from older lab versions use other names at the same priority; priorities must be unique.
        foreach ($clash in @($currentRules | Where-Object { $_ -and $_.direction -eq 'Inbound' -and $_.priority -eq $rule.Priority -and $_.name -ne $rule.Name })) {
            Invoke-Az network nsg rule delete -g $ResourceGroup --nsg-name $names.Nsg -n $clash.name -o none
        }
        Invoke-Az network nsg rule create -g $ResourceGroup --nsg-name $names.Nsg -n $rule.Name --priority $rule.Priority `
            --direction Inbound --access Allow --protocol Tcp --source-address-prefixes @sourcePrefixes `
            --source-port-ranges '*' --destination-address-prefixes '*' --destination-port-ranges $rule.Port -o none
    }
    Write-Host "    NSG $($names.Nsg) (RDP, HTTP, 8080 from $($sourcePrefixes -join ', '))"

    if (-not (Get-AzJsonOrNull network public-ip show -g $ResourceGroup -n $names.PublicIp --query id -o json)) {
        Invoke-Az network public-ip create -g $ResourceGroup -n $names.PublicIp -l $Location --sku Standard --allocation-method Static `
            --version IPv4 --dns-name $names.DnsLabel --tags @tags -o none
    }
    if (-not $existingNic) {
        Invoke-Az network nic create -g $ResourceGroup -n $names.Nic -l $Location --subnet $subnetId `
            --network-security-group $names.Nsg --public-ip-address $names.PublicIp --tags @tags -o none
    }
    $fqdn = Invoke-Az network public-ip show -g $ResourceGroup -n $names.PublicIp --query dnsSettings.fqdn -o tsv
    Write-Host "    public IP $fqdn"

    $credentialPath = Get-LabCredentialPath -SubscriptionId $SubscriptionId -ResourceGroup $ResourceGroup
    if (-not $existingVm) {
        $password = $null
        if ($keyVaultReady) { $password = az keyvault secret show --vault-name $names.KeyVault -n vm-admin-password --query value -o tsv 2>$null }
        if (-not $password -and (Test-Path $credentialPath)) { $password = (Import-Clixml $credentialPath).GetNetworkCredential().Password }
        if (-not $password) { $password = New-LabPassword }
        # Stored before the VM exists so an interrupted run can never lose the password.
        $stored = $false
        try {
            New-Item -ItemType Directory -Force -Path (Split-Path $credentialPath) | Out-Null
            [pscredential]::new($AdminUsername, (ConvertTo-SecureString $password -AsPlainText -Force)) | Export-Clixml -Path $credentialPath
            $stored = $true
        }
        catch { Write-Warning "Could not save the password locally: $($_.Exception.Message)" }
        if ($keyVaultReady) {
            try {
                Invoke-WithRetry -What 'Key Vault access' -Attempts 12 -Action {
                    Invoke-Az keyvault secret set --vault-name $names.KeyVault -n vm-admin-password "--value=$password" -o none
                } | Out-Null
                Invoke-Az keyvault secret set --vault-name $names.KeyVault -n vm-admin-username "--value=$AdminUsername" -o none
                $stored = $true
            }
            catch { Write-Warning "Could not store the password in Key Vault: $($_.Exception.Message)" }
        }
        if (-not $stored) { throw 'The VM password could not be stored anywhere - fix Key Vault access or the local profile and re-run.' }

        Write-Host "    creating VM $VmName ($setupSize) - about 3 minutes"
        & az vm create -g $ResourceGroup -n $VmName -l $Location --computer-name $ComputerName `
            --image 'MicrosoftWindowsServer:WindowsServer:2022-datacenter-g2:latest' --size $setupSize `
            --nics $names.Nic --admin-username $AdminUsername "--admin-password=$password" `
            --os-disk-name $names.OsDisk --storage-sku StandardSSD_LRS `
            --security-type TrustedLaunch --enable-secure-boot true --enable-vtpm true `
            --patch-mode Manual --enable-auto-update false --tags @tags -o none
        $exit = $LASTEXITCODE
        Remove-Variable password
        if ($exit -ne 0) { throw "az vm create failed (exit $exit) - see the error above" }
    }
    # Best effort: some CLI versions fail to parse the response when Azure Policy adds VM extensions.
    az vm boot-diagnostics enable -g $ResourceGroup -n $VmName -o none 2>$null
    $osDiskId = Invoke-Az vm show -g $ResourceGroup -n $VmName --query storageProfile.osDisk.managedDisk.id -o tsv
    Invoke-Az resource tag --ids $osDiskId --tags @tags --is-incremental -o none
    Write-Host '    waiting for the VM agent...'
    Wait-LabVm -ResourceGroup $ResourceGroup -VmName $VmName
    Write-Host "    VM $VmName is running"

    # ------------------------------------------------------------------ 3. Server software
    Write-Phase '3/6 Server software: IIS, SQL Server 2022 Express, JDK 8, Tomcat 9 (~8 min on first run)'
    $output = Invoke-LabRunCommand -ResourceGroup $ResourceGroup -VmName $VmName -ScriptPath (Join-Path $vmScripts 'server/Install-Prerequisites.ps1') `
        -Parameters @('Phase=Runtime') -SuccessMarker 'PREREQUISITES_OK' -Activity 'Server runtime installation'
    Write-RunCommandSummary -Output $output -StartPattern 'Summary'
    Write-Phase '3/6 Server software: VS Build Tools, NuGet, Maven, SSMS (15-30 min on first run)'
    $output = Invoke-LabRunCommand -ResourceGroup $ResourceGroup -VmName $VmName -ScriptPath (Join-Path $vmScripts 'server/Install-Prerequisites.ps1') `
        -Parameters @('Phase=BuildTools') -SuccessMarker 'PREREQUISITES_OK' -Activity 'Build tools installation'
    Write-RunCommandSummary -Output $output -StartPattern 'Summary'

    # ------------------------------------------------------------------ 4. Application
    Write-Phase '4/6 Application: build on the server, deploy to IIS + Tomcat, smoke test'
    Publish-LabApp -RepoRoot $repoRoot -ResourceGroup $ResourceGroup -VmName $VmName -ResetDemoData:$ResetDemoData

    # ------------------------------------------------------------------ 5. Right-size
    Write-Phase "5/6 Right-size to $targetSize and wait until healthy"
    $currentSize = Invoke-Az vm show -g $ResourceGroup -n $VmName --query hardwareProfile.vmSize -o tsv
    if ($currentSize -ne $targetSize) {
        Write-Host "    resizing $currentSize -> $targetSize (the VM restarts)"
        $resizeOptions = @(Invoke-Az vm list-vm-resize-options -g $ResourceGroup -n $VmName --query '[].name' -o tsv)
        if ($resizeOptions -contains $targetSize) {
            Invoke-Az vm resize -g $ResourceGroup -n $VmName --size $targetSize -o none
        }
        else {
            Invoke-Az vm deallocate -g $ResourceGroup -n $VmName -o none
            Invoke-Az vm resize -g $ResourceGroup -n $VmName --size $targetSize -o none
            Invoke-Az vm start -g $ResourceGroup -n $VmName -o none
        }
    }
    Wait-LabVm -ResourceGroup $ResourceGroup -VmName $VmName
    Wait-LabAppReady -ResourceGroup $ResourceGroup -VmName $VmName

    # ------------------------------------------------------------------ 6. Verify
    Write-Phase '6/6 End-to-end test from this machine through the public URL'
    $externalOk = $true
    if ($SkipExternalTest) { Write-Host '    skipped (-SkipExternalTest)' }
    else { $externalOk = Test-LabAppExternally -RepoRoot $repoRoot -Fqdn $fqdn }

    Write-Phase ('Lab ready in {0:hh\:mm\:ss}' -f $stopwatch.Elapsed)
    Write-Host "  Portal (IIS, .NET Framework 4.8)  : http://$fqdn/"
    Write-Host "  Treasury service (Tomcat, Java 8) : http://${fqdn}:8080/treasury-service/"
    Write-Host "  RDP                                : mstsc /v:$fqdn   (user $AdminUsername)"
    Write-Host "  VM password                        : $(Get-LabPasswordHint -KeyVaultName $names.KeyVault -CredentialPath $credentialPath)"
    Write-Host "  VM size                            : $targetSize"
    Write-Host "  Redeploy after code changes        : ./scripts/Update-OnPremVM.ps1 -ResourceGroup $ResourceGroup"
    Write-Host "  Stop billing between sessions      : az vm deallocate -g $ResourceGroup -n $VmName"
    Write-Host "  Delete the lab                     : ./scripts/Remove-OnPremVM.ps1 -ResourceGroup $ResourceGroup"
    Write-Host "  Log                                : $logFile"
    if (-not $externalOk) {
        Write-Warning ('The app is healthy on the VM but this machine could not complete the test through the public URL. ' +
            'Your outbound IP may differ from the one detected - re-run with -AllowedSourceIp <ip or CIDR>.')
    }
}
catch {
    Write-Host ''
    Write-Host "DEPLOYMENT STOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Fix the cause (if any) and run the same command again - completed steps are skipped.' -ForegroundColor Yellow
    Write-Host "Log: $logFile"
    exit 1
}
finally {
    Stop-Transcript | Out-Null
}
