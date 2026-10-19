param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GradleArgs = @("assembleDebug")
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$usedDrives = (Get-PSDrive -PSProvider FileSystem).Name
$driveLetter = $null

foreach ($candidate in @("Z", "Y", "X", "W", "V", "U")) {
    if ($usedDrives -notcontains $candidate) {
        $driveLetter = $candidate
        break
    }
}

if (-not $driveLetter) {
    throw "No unused drive letter is available to create a short Android build path."
}

& subst "$driveLetter`:" "$repoRoot"
if ($LASTEXITCODE -ne 0) {
    throw "Could not map the project to drive $driveLetter`:."
}

$mappedRoot = "$driveLetter`:\"
$gradleExitCode = 1

try {
    $nativeBuildDirs = @(
        (Join-Path $mappedRoot "android\.cxx"),
        (Join-Path $mappedRoot "android\app\.cxx")
    )
    $nodeModules = Join-Path $mappedRoot "node_modules"

    if (Test-Path $nodeModules) {
        foreach ($package in Get-ChildItem -LiteralPath $nodeModules -Directory) {
            $nativeBuildDirs += Join-Path $package.FullName "android\.cxx"
            if ($package.Name.StartsWith("@")) {
                foreach ($scopedPackage in Get-ChildItem -LiteralPath $package.FullName -Directory) {
                    $nativeBuildDirs += Join-Path $scopedPackage.FullName "android\.cxx"
                }
            }
        }
    }

    foreach ($nativeBuildDir in $nativeBuildDirs | Select-Object -Unique) {
        if (Test-Path $nativeBuildDir) {
            Remove-Item -LiteralPath $nativeBuildDir -Recurse -Force
        }
    }

    Push-Location (Join-Path $mappedRoot "android")
    try {
        & .\gradlew.bat @GradleArgs
        $gradleExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
}
finally {
    & subst "$driveLetter`:" /d
}

exit $gradleExitCode
