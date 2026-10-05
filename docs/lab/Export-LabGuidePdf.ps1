<#
.SYNOPSIS
    Exports lab-guide.html to lab-guide.pdf, with every collapsible section expanded.
.DESCRIPTION
    GitHub shows PDF files in the browser but HTML only as source code, so the PDF is the version
    to read on GitHub. Run the lab from the HTML guide. Run this script after every change to the guide.
    Needs Microsoft Edge (installed with Windows).
#>
[CmdletBinding()]
param(
    [string]$EdgePath = (@("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1)
)
$ErrorActionPreference = 'Stop'
if (-not $EdgePath) { throw 'Microsoft Edge was not found.' }

$labDir = $PSScriptRoot
$target = Join-Path $labDir 'lab-guide.pdf'
$work = Join-Path ([IO.Path]::GetTempPath()) "lab-guide-pdf-$PID"
New-Item -ItemType Directory -Force -Path $work | Out-Null
try {
    $base = ([Uri]($labDir.TrimEnd('\') + '\')).AbsoluteUri
    $printCss = '<style>@page { size: A4; margin: 14mm 12mm; } html { -webkit-print-color-adjust: exact; print-color-adjust: exact; } ' +
        '.table-wrap { overflow: visible !important; } td, th { overflow-wrap: break-word; } code { overflow-wrap: anywhere; }</style>'
    $html = (Get-Content -Raw -Encoding UTF8 (Join-Path $labDir 'lab-guide.html')).
        Replace('<head>', "<head><base href=`"$base`">").
        Replace('</head>', "$printCss</head>").
        Replace('<details>', '<details open>').
        Replace(' loading="lazy"', '')
    $page = Join-Path $work 'lab-guide.html'
    [IO.File]::WriteAllText($page, $html, [Text.UTF8Encoding]::new($false))
    if (Test-Path $target) { Remove-Item $target }
    # Piping to Out-Null makes PowerShell wait for Edge to finish.
    & $EdgePath --headless=new --disable-gpu --no-pdf-header-footer --user-data-dir="$work\profile" `
        --virtual-time-budget=10000 --print-to-pdf="$target" ([Uri]$page).AbsoluteUri 2>$null | Out-Null
    if (-not (Test-Path $target)) { throw 'Edge did not create the PDF.' }
    $pages = ([regex]::Matches([IO.File]::ReadAllText($target, [Text.Encoding]::Latin1), '/Type\s*/Page[^s]')).Count
    '{0} - {1} pages, {2:N0} KB' -f $target, $pages, ((Get-Item $target).Length / 1KB)
}
finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
