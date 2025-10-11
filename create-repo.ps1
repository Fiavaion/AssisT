# AssisT GitHub Repository Creation Script (PowerShell)
# Run this in PowerShell: .\create-repo.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AssisT GitHub Repository Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if gh is available
$ghPath = "C:\Program Files\GitHub CLI\gh.exe"
if (-Not (Test-Path $ghPath)) {
    Write-Host "ERROR: GitHub CLI not found at $ghPath" -ForegroundColor Red
    Write-Host "Please install: winget install --id GitHub.cli" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Found GitHub CLI" -ForegroundColor Green
Write-Host ""

# Check authentication
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Step 1: GitHub Authentication" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

$authStatus = & $ghPath auth status 2>&1
if ($authStatus -match "not logged in") {
    Write-Host "🔐 You need to authenticate with GitHub" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Running: gh auth login" -ForegroundColor Gray
    Write-Host "Please follow the prompts..." -ForegroundColor Yellow
    Write-Host ""

    & $ghPath auth login

    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Authentication failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ Already authenticated with GitHub" -ForegroundColor Green
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Step 2: Create Private Repository" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$repoName = "AssisT-EdTech"
$description = "Neuro-Adaptive EdTech Extension for Canvas VLE - TTS/STT accessibility for neurodivergent students"

Write-Host "Repository Details:" -ForegroundColor Cyan
Write-Host "  Name: $repoName" -ForegroundColor White
Write-Host "  Visibility: Private" -ForegroundColor White
Write-Host "  Description: $description" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Create this private repository? (Y/N)"

if ($confirm -eq "Y" -or $confirm -eq "y") {
    Write-Host ""
    Write-Host "🚀 Creating private repository..." -ForegroundColor Yellow

    # Navigate to AssitT directory
    Set-Location -Path "c:\Users\jones\AIprojects\AssitT"

    # Create repository
    & $ghPath repo create $repoName `
        --private `
        --source=. `
        --description=$description `
        --push

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "✅ SUCCESS!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""

        # Get repository URL
        $repoUrl = & $ghPath repo view --json url --jq .url
        Write-Host "🔗 Repository URL: $repoUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Yellow
        Write-Host "  1. Visit: $repoUrl" -ForegroundColor White
        Write-Host "  2. Run: npm install" -ForegroundColor White
        Write-Host "  3. Create extension icons (see SETUP_COMPLETE.md)" -ForegroundColor White
        Write-Host "  4. Begin Phase 1.2 development" -ForegroundColor White
        Write-Host ""
        Write-Host "Repository link saved to REPO_LINK.txt" -ForegroundColor Gray

        # Save link to file
        $repoUrl | Out-File -FilePath "REPO_LINK.txt" -Encoding UTF8

    } else {
        Write-Host ""
        Write-Host "❌ ERROR: Failed to create repository" -ForegroundColor Red
        Write-Host "Please check the error message above" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "⏭️  Repository creation cancelled" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
