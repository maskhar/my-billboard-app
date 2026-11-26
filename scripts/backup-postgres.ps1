[CmdletBinding()]
param(
    [string]$DatabaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-DatabaseConnection {
    param([string]$ConnectionString)

    if ([string]::IsNullOrWhiteSpace($ConnectionString)) {
        $secureConnectionString = Read-Host 'DATABASE_URL (input hidden)' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConnectionString)
        try {
            $ConnectionString = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        }
    }

    try {
        $uri = [Uri]$ConnectionString
    }
    catch {
        throw 'DATABASE_URL must be a valid PostgreSQL connection URL.'
    }

    if ($uri.Scheme -notin @('postgres', 'postgresql') -or
        [string]::IsNullOrWhiteSpace($uri.Host) -or
        [string]::IsNullOrWhiteSpace($uri.UserInfo) -or
        $uri.AbsolutePath -eq '/') {
        throw 'DATABASE_URL must include PostgreSQL scheme, host, user, and database name.'
    }

    $userInfo = $uri.UserInfo.Split(':', 2)
    $databaseName = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
    if ($databaseName.Contains('/')) {
        throw 'DATABASE_URL must name exactly one database.'
    }

    [pscustomobject]@{
        Host = $uri.Host
        Port = if ($uri.IsDefaultPort) { 5432 } else { $uri.Port }
        User = [Uri]::UnescapeDataString($userInfo[0])
        Password = if ($userInfo.Count -eq 2) { [Uri]::UnescapeDataString($userInfo[1]) } else { $null }
        Database = $databaseName
    }
}

function Invoke-PostgresCommand {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [pscustomobject]$Connection
    )

    $savedPassword = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = $Connection.Password
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Command failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        $env:PGPASSWORD = $savedPassword
    }
}

$pgDump = Get-Command pg_dump -CommandType Application -ErrorAction SilentlyContinue
$pgRestore = Get-Command pg_restore -CommandType Application -ErrorAction SilentlyContinue
if (-not $pgDump -or -not $pgRestore) {
    throw 'pg_dump and pg_restore must be installed and available on PATH.'
}

$connection = Get-DatabaseConnection -ConnectionString $(if ($DatabaseUrl) { $DatabaseUrl } else { $env:DATABASE_URL })
$resolvedOutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$safeDatabaseName = $connection.Database -replace '[^A-Za-z0-9._-]', '_'
$backupPath = Join-Path $resolvedOutputDirectory ("postgres-$safeDatabaseName-$timestamp.dump")

Write-Host "Creating PostgreSQL backup for database '$($connection.Database)'."
Invoke-PostgresCommand -Command $pgDump.Source -Connection $connection -Arguments @(
    '--format=custom', '--no-owner', '--no-privileges', '--verbose',
    "--file=$backupPath", "--host=$($connection.Host)", "--port=$($connection.Port)",
    "--username=$($connection.User)", $connection.Database
)

if (-not (Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -eq 0) {
    throw 'Backup command completed but did not create a non-empty archive.'
}

Invoke-PostgresCommand -Command $pgRestore.Source -Connection $connection -Arguments @('--list', $backupPath)
Write-Host "Backup verified: $backupPath"
