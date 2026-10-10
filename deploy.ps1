# -------------------------------------------------------------------------
# CogniTwin One-Click Deployment Script for GitHub, Vercel & Firebase
# -------------------------------------------------------------------------

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       CogniTwin AI — Unified Deployment Pipeline          " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. GitHub Deployment
Write-Host "`n[1/3] Pushing to GitHub (origin main)..." -ForegroundColor Green
try {
    git push -u origin main
    Write-Host "✓ GitHub push complete!" -ForegroundColor Green
} catch {
    Write-Host "Note: If the GitHub remote repository does not exist yet, create 'cognitwin' at https://github.com/new and rerun." -ForegroundColor Yellow
}

# 2. Vercel Deployment
Write-Host "`n[2/3] Deploying to Vercel..." -ForegroundColor Green
Write-Host "Running: npx vercel deploy --prod" -ForegroundColor Gray
npx vercel deploy --prod

# 3. Firebase Hosting Deployment
Write-Host "`n[3/3] Deploying to Firebase..." -ForegroundColor Green
Write-Host "Running: firebase deploy --only hosting" -ForegroundColor Gray
firebase deploy --only hosting

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "Deployment steps initiated successfully!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
