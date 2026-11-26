[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,
    [string]$DatabaseUrl,
    [string]$Confirmation
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

$pgRestore = Get-Command pg_restore -CommandType Application -ErrorAction SilentlyContinue
if (-not $pgRestore) {
    throw 'pg_restore must be installed and available on PATH.'
}

$resolvedBackupPath = (Resolve-Path -LiteralPath $BackupPath -ErrorAction Stop).Path
if ((Get-Item -LiteralPath $resolvedBackupPath).Length -eq 0) {
    throw 'Backup archive is empty.'
}

$connection = Get-DatabaseConnection -ConnectionString $(if ($DatabaseUrl) { $DatabaseUrl } else { $env:DATABASE_URL })

# Validate archive before asking for confirmation or changing the target database.
Invoke-PostgresCommand -Command $pgRestore.Source -Connection $connection -Arguments @('--list', $resolvedBackupPath)

$expectedConfirmation = "RESTORE $($connection.Database)"
Write-Warning "Restore will replace database objects in '$($connection.Database)' on $($connection.Host):$($connection.Port)."
if ([string]::IsNullOrWhiteSpace($Confirmation)) {
    $Confirmation = Read-Host "Type '$expectedConfirmation' to continue"
}
if ($Confirmation -cne $expectedConfirmation) {
    throw 'Restore cancelled: confirmation did not match.'
}

Invoke-PostgresCommand -Command $pgRestore.Source -Connection $connection -Arguments @(
    '--clean', '--if-exists', '--exit-on-error', '--no-owner', '--no-privileges', '--verbose',
    "--dbname=$($connection.Database)", "--host=$($connection.Host)", "--port=$($connection.Port)",
    "--username=$($connection.User)", $resolvedBackupPath
)

Write-Host "Restore completed for database '$($connection.Database)'. Verify the application before reopening traffic."
