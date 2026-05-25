# PowerShell Deploy Script for Firebase Realtime Database
# Requires: terraform, gcloud CLI

$ErrorActionPreference = "Stop"

# 1. Input parameters
$projectId = Read-Host -Prompt "Enter your GCP Project ID"
if (-not $projectId) {
    Write-Error "Project ID cannot be empty."
}

# 2. Check dependencies
Write-Host "Checking CLI dependencies..." -ForegroundColor Cyan
if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    Write-Error "Terraform CLI is not installed. Please download it from https://www.terraform.io/downloads"
}
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Error "Google Cloud SDK (gcloud) is not installed. Please download it from https://cloud.google.com/sdk"
}

# 3. Check authentication status
Write-Host "Authenticating with GCP..." -ForegroundColor Cyan
try {
    $null = gcloud auth print-access-token --quiet
} catch {
    Write-Host "Access token not found. Running login..." -ForegroundColor Yellow
    gcloud auth login
    gcloud auth application-default login
}

# 4. Initialize and Run Terraform
Write-Host "Initializing Terraform..." -ForegroundColor Cyan
terraform init

Write-Host "Applying Terraform Plan..." -ForegroundColor Cyan
terraform apply -var="project_id=$projectId" -auto-approve

# Get output database URL
$dbUrl = (terraform output -raw database_url).Trim()
if (-not $dbUrl -or $dbUrl -notlike "https://*") {
    Write-Error "Could not retrieve a valid Database URL from Terraform. Check for prior errors. Got: $dbUrl"
}

# 5. Apply Security Rules via REST API (Secure Mode: Require Auth)
Write-Host "Configuring Security Rules to Require Authentication..." -ForegroundColor Cyan
$gcpToken = (gcloud auth print-access-token).Trim()

$rules = @{
    rules = @{
        ".read"  = "auth != null"
        ".write" = "auth != null"
    }
} | ConvertTo-Json -Depth 5

# Firebase rules REST API URL
$rulesUrl = "$dbUrl/.settings/rules.json?access_token=$gcpToken"

try {
    $response = Invoke-RestMethod -Uri $rulesUrl -Method Put -Body $rules -ContentType "application/json"
    Write-Host "Security rules configured successfully!" -ForegroundColor Green
} catch {
    Write-Error "Failed to update security rules: $_"
}

Write-Host "`n===============================================" -ForegroundColor Green
Write-Host "Deployment Successful!" -ForegroundColor Green
Write-Host "Copy this database URL into your Snake AI settings:" -ForegroundColor Green
Write-Host "$dbUrl/qtable.json" -ForegroundColor Yellow
Write-Host "===============================================" -ForegroundColor Green
