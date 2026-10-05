#Requires -Version 7.0
# Shared helpers for Deploy-Lab.ps1, Update-LabApp.ps1 and Remove-Lab.ps1.
Set-StrictMode -Version Latest

function Invoke-Az {
    $output = & az @args
    if ($LASTEXITCODE -ne 0) { throw "az $(($args | Select-Object -First 3) -join ' ') failed (exit $LASTEXITCODE) - see the error above" }
    return $output
}

function Invoke-AzJson {
    return (Invoke-Az @args | Out-String | ConvertFrom-Json)
}

# Returns $null instead of failing when the resource does not exist.
function Get-AzJsonOrNull {
    $text = (& az @args 2>$null) | Out-String
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($text)) { return $null }
    return ($text | ConvertFrom-Json)
}

function Invoke-WithRetry([scriptblock]$Action, [string]$What, [int]$Attempts = 18, [int]$DelaySeconds = 10) {
    for ($i = 1; $i -le $Attempts; $i++) {
        try { return & $Action }
        catch {
            if ($i -eq $Attempts) { throw }
            Write-Host "    waiting for $What (attempt $i/$Attempts)..."
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Write-Phase([string]$Message) {
    Write-Host ''
    Write-Host ('==> [{0:HH:mm:ss}] {1}' -f (Get-Date), $Message) -ForegroundColor Cyan
}

function Connect-LabSubscription([string]$SubscriptionId) {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI (az) is not installed: https://aka.ms/installazurecliwindows' }
    az account show -o none 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Not signed in to the Azure CLI. Run: az login' }
    if ($SubscriptionId) { Invoke-Az account set --subscription $SubscriptionId | Out-Null }
    az account get-access-token -o none 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'The Azure CLI token cannot be refreshed (for example Conditional Access). Run: az login --tenant <tenant-id>' }
    return (Invoke-AzJson account show -o json)
}

function Register-LabProviders([string[]]$Namespaces) {
    foreach ($namespace in $Namespaces) {
        $state = Invoke-Az provider show --namespace $namespace --query registrationState -o tsv
        if ($state -ne 'Registered') {
            Write-Host "    registering resource provider $namespace"
            Invoke-Az provider register --namespace $namespace --wait -o none
        }
    }
}

function Get-LabPublicIp {
    foreach ($uri in 'https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com') {
        try { return (Invoke-RestMethod -Uri $uri -TimeoutSec 15).ToString().Trim() } catch { continue }
    }
    throw 'Could not detect your public IP address - pass it with -AllowedSourceIp.'
}

# Deterministic names: re-runs and redeployments of the same subscription + resource group reuse them.
function Get-LabNames([string]$SubscriptionId, [string]$ResourceGroup, [string]$VmName) {
    $hash = [System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes("$SubscriptionId/$ResourceGroup".ToLowerInvariant()))
    $suffix = [Convert]::ToHexString($hash).Substring(0, 5).ToLowerInvariant()
    return [pscustomobject]@{
        Suffix   = $suffix
        KeyVault = "kv-contoso-onprem-$suffix"
        DnsLabel = "contoso-onprem-$suffix"
        Nsg      = "nsg-$VmName"
        PublicIp = "pip-$VmName"
        Nic      = "nic-$VmName"
        OsDisk   = "osdisk-$VmName"
        Vnet     = 'vnet-contoso-onprem'
        Subnet   = 'snet-servers'
    }
}

function Get-LabCredentialPath([string]$SubscriptionId, [string]$ResourceGroup) {
    return (Join-Path $HOME ".contoso-lab/$SubscriptionId-$ResourceGroup-vm-admin.xml")
}

function Get-LabPrincipal {
    $user = Invoke-AzJson account show --query user -o json
    if ($user.type -eq 'servicePrincipal') {
        return [pscustomobject]@{ Id = (Invoke-Az ad sp show --id $user.name --query id -o tsv); Type = 'ServicePrincipal' }
    }
    return [pscustomobject]@{ Id = (Invoke-Az ad signed-in-user show --query id -o tsv); Type = 'User' }
}

function Grant-LabRole([string]$PrincipalId, [string]$PrincipalType, [string]$Role, [string]$Scope) {
    $existing = Invoke-Az role assignment list --scope $Scope --role $Role --query "[?principalId=='$PrincipalId'].id | [0]" -o tsv
    if (-not $existing) {
        Invoke-WithRetry -What 'role assignment' -Attempts 3 -DelaySeconds 10 -Action {
            Invoke-Az role assignment create --assignee-object-id $PrincipalId --assignee-principal-type $PrincipalType --role $Role --scope $Scope -o none
        } | Out-Null
    }
}

# Creates the vault, or recovers it when a previous lab with the same name was deleted (soft delete).
# New vaults use access policies so a Contributor (no role-assignment rights) can still store secrets.
function Initialize-LabKeyVault([string]$Name, [string]$ResourceGroup, [string]$Location, [string[]]$TagArgs) {
    $vault = az keyvault show -n $Name -g $ResourceGroup -o json 2>$null | Out-String | ConvertFrom-Json
    if (-not $vault) {
        $deleted = az keyvault show-deleted --name $Name --query id -o tsv 2>$null
        if ($deleted) {
            Write-Host "    recovering soft-deleted Key Vault $Name"
            Invoke-Az keyvault recover --name $Name -o none
        }
        else {
            Invoke-Az keyvault create -n $Name -g $ResourceGroup -l $Location --enable-rbac-authorization false --retention-days 7 --tags @TagArgs -o none
        }
        $vault = Invoke-AzJson keyvault show -n $Name -g $ResourceGroup -o json
    }
    $principal = Get-LabPrincipal
    if ($vault.properties.enableRbacAuthorization) {
        Grant-LabRole -PrincipalId $principal.Id -PrincipalType $principal.Type -Role 'Key Vault Secrets Officer' -Scope $vault.id
    }
    else {
        Invoke-Az keyvault set-policy -n $Name -g $ResourceGroup --object-id $principal.Id --secret-permissions get list set delete -o none
    }
    return $vault.id
}

function New-LabPassword([int]$Length = 24) {
    # Alphanumerics plus "-_." only: safe for az.cmd, cmd.exe and JSON quoting.
    $upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; $lower = 'abcdefghijkmnopqrstuvwxyz'; $digits = '23456789'; $special = '-_.'
    $all = $upper + $lower + $digits + $special
    $pick = { param([string]$set) $set[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($set.Length)] }
    $chars = [System.Collections.Generic.List[char]]::new()
    foreach ($set in @($lower, $digits, $special, $special)) { $chars.Add((& $pick $set)) }
    while ($chars.Count -lt ($Length - 1)) { $chars.Add((& $pick $all)) }
    $shuffled = $chars | Sort-Object { [System.Security.Cryptography.RandomNumberGenerator]::GetInt32([int]::MaxValue) }
    # Always start with a letter so the value is never mistaken for a CLI option.
    return ([string](& $pick $upper)) + (-join $shuffled)
}

function Get-LabComputeCapacity([string]$SubscriptionId, [string]$Location, [string[]]$Sizes) {
    $filter = (($Sizes | Select-Object -Unique) | ForEach-Object { "name=='$_'" }) -join ' || '
    # Direct REST call: 'az vm list-skus' takes minutes in some regions, this takes seconds.
    $url = 'https://management.azure.com/subscriptions/' + $SubscriptionId + '/providers/Microsoft.Compute/skus?api-version=2021-07-01&$filter=location eq ''' + $Location + ''''
    $skus = Invoke-AzJson rest --method get --url $url `
        --query "value[?resourceType=='virtualMachines' && ($filter)].{name:name, family:family, vcpus:capabilities[?name=='vCPUs'].value | [0], restricted:length(restrictions[?type=='Location'])}" -o json
    $usage = Invoke-AzJson vm list-usage --location $Location --query "[].{name:name.value, used:currentValue, limit:limit}" -o json
    return [pscustomobject]@{ Skus = @($skus); Usage = @($usage) }
}

# First candidate size that is offered, not restricted and has enough vCPU quota.
function Select-LabVmSize($Capacity, [string[]]$Candidates) {
    $regional = $Capacity.Usage | Where-Object { $_.name -eq 'cores' } | Select-Object -First 1
    $regionalFree = if ($regional) { [int]$regional.limit - [int]$regional.used } else { [int]::MaxValue }
    foreach ($size in $Candidates) {
        $sku = $Capacity.Skus | Where-Object { $_.name -eq $size } | Select-Object -First 1
        if (-not $sku) { Write-Host "    ${size}: not offered in this region"; continue }
        if ([int]$sku.restricted -gt 0) { Write-Host "    ${size}: not available to this subscription in this region"; continue }
        $vcpus = [int]$sku.vcpus
        $family = $Capacity.Usage | Where-Object { $_.name -eq $sku.family } | Select-Object -First 1
        $familyFree = if ($family) { [int]$family.limit - [int]$family.used } else { 0 }
        if ($familyFree -lt $vcpus -or $regionalFree -lt $vcpus) {
            Write-Host "    ${size}: not enough vCPU quota (family free $familyFree, regional free $regionalFree, needs $vcpus)"
            continue
        }
        return $size
    }
    return $null
}

# Waits until the VM runs and its guest agent is ready; starts it when it is stopped/deallocated.
function Wait-LabVm([string]$ResourceGroup, [string]$VmName, [int]$TimeoutMinutes = 20) {
    $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
    $started = $false
    while ($true) {
        $view = Get-AzJsonOrNull vm get-instance-view -g $ResourceGroup -n $VmName `
            --query "{power: instanceView.statuses[?starts_with(code, 'PowerState/')].code | [0], agent: instanceView.vmAgent.statuses[0].displayStatus}" -o json
        $power = if ($view) { $view.power } else { $null }
        $agent = if ($view) { $view.agent } else { $null }
        if ($power -eq 'PowerState/running' -and $agent -eq 'Ready') { return }
        if (-not $started -and $power -in 'PowerState/deallocated', 'PowerState/stopped') {
            Write-Host "    VM is $($power -replace 'PowerState/') - starting it"
            Invoke-Az vm start -g $ResourceGroup -n $VmName -o none
            $started = $true
            continue
        }
        if ((Get-Date) -gt $deadline) { throw "VM $VmName is not ready after $TimeoutMinutes minutes (power: $power, agent: $agent)" }
        Start-Sleep -Seconds 15
    }
}

# Runs a script on the VM (as SYSTEM) and requires a success marker in its output.
function Invoke-LabRunCommand {
    param(
        [string]$ResourceGroup, [string]$VmName, [string]$ScriptPath, [string[]]$Parameters = @(),
        [string]$SuccessMarker, [string]$Activity
    )
    $azArgs = @('vm', 'run-command', 'invoke', '-g', $ResourceGroup, '-n', $VmName, '--command-id', 'RunPowerShellScript', '--scripts', "@$ScriptPath", '-o', 'json')
    if ($Parameters.Count -gt 0) { $azArgs += '--parameters'; $azArgs += $Parameters }
    $errorFile = [IO.Path]::GetTempFileName()
    try {
        for ($attempt = 1; ; $attempt++) {
            # Installers can run for 30 minutes and Azure sometimes reports completion minutes after the script
            # has finished, so run az in a background job and show a heartbeat instead of a silent console.
            $job = Start-Job -ScriptBlock {
                param($Arguments, $ErrorFile)
                $output = & az @Arguments 2> $ErrorFile
                [pscustomobject]@{ Json = ($output -join "`n"); ExitCode = $LASTEXITCODE }
            } -ArgumentList $azArgs, $errorFile
            try {
                $started = Get-Date
                while (-not (Wait-Job $job -Timeout 120)) {
                    Write-Host ('    ... still running on the VM ({0:N0} min)' -f ((Get-Date) - $started).TotalMinutes)
                }
                $outcome = Receive-Job $job
            }
            finally { Remove-Job $job -Force -ErrorAction SilentlyContinue }
            if ($outcome -and $outcome.ExitCode -eq 0) { $json = $outcome.Json; break }
            $err = Get-Content $errorFile -Raw
            if (-not $err) { $err = 'az vm run-command invoke returned no result' }
            if ($attempt -lt 40 -and $err -match 'Conflict|in progress|VMAgentStatusCommunicationError|agent.*not ready') {
                Write-Host "    the VM is busy with another Run Command or its agent is not ready - retrying in 30 s ($attempt/40)"
                Start-Sleep -Seconds 30
                continue
            }
            throw "Run Command '$Activity' failed: $err"
        }
    }
    finally { Remove-Item $errorFile -ErrorAction SilentlyContinue }

    $result = $json | ConvertFrom-Json
    $stdout = $result.value | Where-Object { $_.code -like '*StdOut*' } | Select-Object -ExpandProperty message -First 1
    $stderr = $result.value | Where-Object { $_.code -like '*StdErr*' } | Select-Object -ExpandProperty message -First 1
    if ($stdout -notmatch [regex]::Escape($SuccessMarker)) {
        if ($stdout) { Write-Host $stdout }
        if ($stderr) { Write-Host $stderr -ForegroundColor Red }
        throw "$Activity did not complete on the VM. Full logs on the VM: C:\ContosoSetup\logs"
    }
    return $stdout
}

function Write-RunCommandSummary([string]$Output, [string]$StartPattern) {
    $lines = @($Output -split "`r?`n")
    $start = [Math]::Max(0, $lines.Count - 15)
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $StartPattern) { $start = $i; break }
    }
    $lines[$start..($lines.Count - 1)] | Where-Object { $_.Trim() } | ForEach-Object { Write-Host "    $_" }
}

# Zips src/, database/ and scripts/ and runs server/Deploy-FinancePortal.ps1 with the package embedded.
# -ResetDemoData reloads the demonstration data (otherwise it is only loaded into empty databases).
function Publish-LabApp([string]$RepoRoot, [string]$ResourceGroup, [string]$VmName, [switch]$ResetDemoData) {
    $staging = Join-Path ([IO.Path]::GetTempPath()) ('finance-portal-' + [guid]::NewGuid().ToString('N'))
    $package = "$staging.zip"
    $deployScript = "$staging-deploy.ps1"
    try {
        foreach ($folder in 'src', 'database', 'scripts') {
            Copy-Item -Path (Join-Path $RepoRoot $folder) -Destination (Join-Path $staging $folder) -Recurse
        }
        Get-ChildItem $staging -Recurse -Directory -Include 'bin', 'obj', 'packages', 'target', '.vs' |
            Sort-Object { $_.FullName.Length } -Descending | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $package

        $template = Get-Content (Join-Path $PSScriptRoot 'server/Deploy-FinancePortal.ps1') -Raw
        $script = $template.Replace('__SOURCE_PACKAGE_BASE64__', [Convert]::ToBase64String([IO.File]::ReadAllBytes($package)))
        Set-Content -Path $deployScript -Value $script -Encoding utf8NoBOM -NoNewline
        $sizeKb = (Get-Item $deployScript).Length / 1KB
        Write-Host ('    source package {0:N0} KB, deployment script {1:N0} KB' -f ((Get-Item $package).Length / 1KB), $sizeKb)
        if ($sizeKb -gt 900) { throw 'The source package is too large to embed in Run Command (limit used here: 900 KB).' }

        $reset = if ($ResetDemoData) { 'true' } else { 'false' }
        $output = Invoke-LabRunCommand -ResourceGroup $ResourceGroup -VmName $VmName -ScriptPath $deployScript `
            -Parameters @("ResetDemoData=$reset") -SuccessMarker 'DEPLOY_OK' -Activity 'Application build and deployment'
        Write-RunCommandSummary -Output $output -StartPattern 'Unpacking|Building ThurayaFinance'
    }
    finally {
        Remove-Item $staging, $package, $deployScript -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Wait-LabAppReady([string]$ResourceGroup, [string]$VmName) {
    $output = Invoke-LabRunCommand -ResourceGroup $ResourceGroup -VmName $VmName -ScriptPath (Join-Path $PSScriptRoot 'server/Wait-PortalReady.ps1') `
        -SuccessMarker 'READY_OK' -Activity 'Application health check'
    Write-RunCommandSummary -Output $output -StartPattern 'Waiting'
}

# End-to-end smoke test from this machine against the public URL (proves the NSG path too).
function Test-LabAppExternally([string]$RepoRoot, [string]$Fqdn) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        & (Join-Path $RepoRoot 'scripts/Invoke-SmokeTest.ps1') -PortalUrl "http://$Fqdn" -TreasuryUrl "http://${Fqdn}:8080/treasury-service"
        if ($LASTEXITCODE -eq 0) { return $true }
        if ($attempt -lt 3) { Write-Host '    retrying the external smoke test in 30 s...'; Start-Sleep -Seconds 30 }
    }
    return $false
}

function Get-LabPasswordHint([string]$KeyVaultName, [string]$CredentialPath) {
    $secret = az keyvault secret show --vault-name $KeyVaultName -n vm-admin-password --query id -o tsv 2>$null
    if ($secret) { return "az keyvault secret show --vault-name $KeyVaultName -n vm-admin-password --query value -o tsv" }
    if (Test-Path $CredentialPath) { return "(Import-Clixml '$CredentialPath').GetNetworkCredential().Password" }
    return 'not found (set by an earlier deployment) - reset it with: az vm user update -g <rg> -n <vm> -u contosoadmin -p <new-password>'
}

Export-ModuleMember -Function *
