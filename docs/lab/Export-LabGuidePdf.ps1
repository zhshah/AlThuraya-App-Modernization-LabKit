<#
.SYNOPSIS
    Exports lab-guide.html to lab-guide.pdf - the print edition: cover, contents with page numbers,
    a banner for every part, running headers, page numbers and PDF bookmarks.
.DESCRIPTION
    The design lives in lab-guide.html (@page rules and @media print), so the guide's Print button and this
    script produce the same document. The script adds what a browser print can't: every collapsible section
    expanded and the page numbers in the contents - it prints once, reads the page of every section from the
    PDF, writes the numbers into the contents and prints again until they are stable.
    GitHub shows PDF files in the browser but HTML only as source code, so the PDF is the version to read on
    GitHub. Run this script after every change to the guide. Needs Microsoft Edge (installed with Windows).
#>
[CmdletBinding()]
param(
    [string]$EdgePath = (@("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1)
)
$ErrorActionPreference = 'Stop'
if (-not $EdgePath) { throw 'Microsoft Edge was not found.' }

function Invoke-EdgePrint([string]$Page, [string]$Pdf, [string]$ProfileDir) {
    if (Test-Path $Pdf) { Remove-Item $Pdf }
    $arguments = '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--generate-pdf-document-outline',
        "--user-data-dir=`"$ProfileDir`"", '--virtual-time-budget=10000', "--print-to-pdf=`"$Pdf`"", ([Uri]$Page).AbsoluteUri
    $edge = Start-Process -FilePath $EdgePath -ArgumentList $arguments -PassThru `
        -RedirectStandardOutput "$ProfileDir-out.log" -RedirectStandardError "$ProfileDir-err.log"
    # With --generate-pdf-document-outline Edge can keep running after it has written the PDF: wait until the
    # file exists and its size stays the same for 2 seconds, then end the Edge processes of this profile.
    $deadline = (Get-Date).AddSeconds(180)
    $lastSize = -1
    $sameSize = 0
    while (-not $edge.HasExited -and (Get-Date) -lt $deadline -and $sameSize -lt 4) {
        Start-Sleep -Milliseconds 500
        $size = if (Test-Path $Pdf) { (Get-Item $Pdf).Length } else { 0 }
        $sameSize = if ($size -gt 0 -and $size -eq $lastSize) { $sameSize + 1 } else { 0 }
        $lastSize = $size
    }
    Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ProfileDir) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    if (-not (Test-Path $Pdf) -or (Get-Item $Pdf).Length -eq 0) { throw 'Edge did not create the PDF.' }
}

# Page number (the cover is page 1) of every named destination - Edge writes one for each in-page link target.
function Get-PdfDestinationPages([string]$Pdf) {
    $t = [IO.File]::ReadAllText($Pdf, [Text.Encoding]::Latin1)
    $getObject = {
        param([string]$Number)
        $m = [regex]::Match($t, "(?:^|[\r\n])$Number 0 obj\b")
        if (-not $m.Success) { throw "PDF object $Number not found in $Pdf" }
        $t.Substring($m.Index, $t.IndexOf('endobj', $m.Index + $m.Length) - $m.Index)
    }
    $pageObjects = [System.Collections.Generic.List[string]]::new()
    $walk = {
        param([string]$Number)
        $body = & $getObject $Number
        if ($body -match '/Type\s*/Pages\b') {
            foreach ($kid in [regex]::Matches([regex]::Match($body, '/Kids\s*\[([^\]]*)\]').Groups[1].Value, '(\d+)\s+0\s+R')) { & $walk $kid.Groups[1].Value }
        }
        else { $pageObjects.Add($Number) }
    }
    $root = [regex]::Matches($t, '/Root\s+(\d+)\s+0\s+R') | Select-Object -Last 1
    $catalog = & $getObject $root.Groups[1].Value
    & $walk ([regex]::Match($catalog, '/Pages\s+(\d+)\s+0\s+R').Groups[1].Value)
    $destsRef = [regex]::Match($catalog, '/Dests\s+(\d+)\s+0\s+R')
    $dests = if ($destsRef.Success) { & $getObject $destsRef.Groups[1].Value } else { $catalog }
    $map = @{}
    foreach ($d in [regex]::Matches($dests, '/([^\s/\[\]<>()]+)\s*\[\s*(\d+)\s+0\s+R')) {
        $name = [regex]::Replace($d.Groups[1].Value, '#([0-9A-Fa-f]{2})', { param($m) [string][char][Convert]::ToInt32($m.Groups[1].Value, 16) })
        $map[$name] = $pageObjects.IndexOf($d.Groups[2].Value) + 1
    }
    return [pscustomobject]@{ Pages = $map; Count = $pageObjects.Count; Outline = $t.Contains('/Outlines') }
}

function Set-ContentsPageNumbers([string]$Html, [hashtable]$Pages) {
    return [regex]::Replace($Html, '(?s)(<a(?: class="part-link")? href="#([\w-]+)">(?:(?!</a>).)*?<span class="pn">)[^<]*(</span>)', {
            param($m)
            $m.Groups[1].Value + $Pages[$m.Groups[2].Value] + $m.Groups[3].Value
        })
}

$labDir = $PSScriptRoot
$target = Join-Path $labDir 'lab-guide.pdf'
$work = Join-Path ([IO.Path]::GetTempPath()) "lab-guide-pdf-$PID"
New-Item -ItemType Directory -Force -Path $work | Out-Null
try {
    $base = ([Uri]($labDir.TrimEnd('\') + '\')).AbsoluteUri
    $html = (Get-Content -Raw -Encoding UTF8 (Join-Path $labDir 'lab-guide.html')).
        Replace('<head>', "<head><base href=`"$base`">").
        Replace('<details>', '<details open>').
        Replace(' loading="lazy"', '')
    $page = Join-Path $work 'lab-guide.html'
    $pdf = Join-Path $work 'lab-guide.pdf'
    $pages = @{}
    for ($pass = 1; $pass -le 4; $pass++) {
        [IO.File]::WriteAllText($page, (Set-ContentsPageNumbers $html $pages), [Text.UTF8Encoding]::new($false))
        Invoke-EdgePrint -Page $page -Pdf $pdf -ProfileDir (Join-Path $work "profile-$pass")
        $result = Get-PdfDestinationPages $pdf
        $stable = $pass -gt 1 -and -not ($result.Pages.Keys | Where-Object { $result.Pages[$_] -ne $pages[$_] })
        $pages = $result.Pages
        if ($stable) { break }
    }
    if (-not $stable) { Write-Warning 'The page numbers in the contents did not settle after 4 passes.' }
    $contentsIds = [regex]::Matches($html, '(?s)<nav class="toc".*?</nav>').Value | ForEach-Object { [regex]::Matches($_, 'href="#([\w-]+)"') } | ForEach-Object { $_.Groups[1].Value }
    $unnumbered = @($contentsIds | Where-Object { -not $pages[$_] })
    if ($unnumbered) { Write-Warning "No page found for: $($unnumbered -join ', ')" }
    Copy-Item $pdf $target -Force
    '{0} - {1} pages, {2:N0} KB, contents numbered {3}/{4}, bookmarks {5}, passes {6}' -f $target, $result.Count,
        ((Get-Item $target).Length / 1KB), ($contentsIds.Count - $unnumbered.Count), $contentsIds.Count, $(if ($result.Outline) { 'yes' } else { 'no' }), $pass
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
