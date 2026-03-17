# Check File Size Limits
# Prevents large files from being committed

param(
    [int]$MaxFileSizeMB = 50
)

Write-Host '[CHECK] Checking file sizes...' -ForegroundColor Cyan

$maxSizeBytes = $MaxFileSizeMB * 1024 * 1024
$foundLargeFiles = $false

# Get staged files
$stagedFiles = (git diff --cached --name-only) -split "`n" | Where-Object { $_ }

# Also check for untracked large files that might be about to be added
$untrackedFiles = (git ls-files --others --exclude-standard) -split "`n" | Where-Object { $_ }

$allFiles = @($stagedFiles) + @($untrackedFiles) | Select-Object -Unique

foreach ($file in $allFiles) {
    if (Test-Path $file) {
        $fileSize = (Get-Item $file -ErrorAction SilentlyContinue).Length
        
        if ($fileSize -gt $maxSizeBytes) {
            $fileSizeMB = [math]::Round($fileSize / 1024 / 1024, 2)
            Write-Host "[WARN] Large file: $file ($fileSizeMB MB)" -ForegroundColor Yellow
            $foundLargeFiles = $true
        }
    }
}

if ($foundLargeFiles) {
    Write-Host ''
    Write-Host '[FAIL] FILE SIZE VALIDATION FAILED' -ForegroundColor Red
    Write-Host ''
    Write-Host "Files larger than $MaxFileSizeMB MB cannot be committed:" -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Best practices:' -ForegroundColor Green
    Write-Host '  - Use Git LFS (Large File Storage) for binary files'
    Write-Host '  - Store large assets in cloud storage (S3, etc.)'
    Write-Host '  - Add to .gitignore: *.mp4, *.zip, *.iso, etc.'
    Write-Host '  - Keep compiled artifacts out of git'
    Write-Host ''
    Write-Host 'To set up Git LFS:' -ForegroundColor Cyan
    Write-Host '  git lfs install'
    Write-Host "  git lfs track '*.psd'  # Example for large files"
    Write-Host ''
    exit 1
}

Write-Host '[OK] All files within size limits' -ForegroundColor Green
exit 0
