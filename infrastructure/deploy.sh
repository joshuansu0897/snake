#!/usr/bin/env bash
# Bash Deploy Script for Firebase Realtime Database
# Requires: terraform, gcloud CLI

set -e

# 1. Input parameters
read -p "Enter your GCP Project ID: " PROJECT_ID
if [ -z "$PROJECT_ID" ]; then
    echo "Error: Project ID cannot be empty."
    exit 1
fi

# 2. Check dependencies
echo "Checking CLI dependencies..."
if ! command -v terraform &> /dev/null; then
    echo "Error: Terraform CLI is not installed. Please download it from https://www.terraform.io/downloads"
    exit 1
fi
if ! command -v gcloud &> /dev/null; then
    echo "Error: Google Cloud SDK (gcloud) is not installed. Please download it from https://cloud.google.com/sdk"
    exit 1
fi

# 3. Check authentication status
echo "Authenticating with GCP..."
if ! gcloud auth print-access-token &> /dev/null; then
    echo "Access token not found. Running login..."
    gcloud auth login
    gcloud auth application-default login
fi

# 4. Initialize and Run Terraform
echo "Initializing Terraform..."
terraform init

echo "Applying Terraform Plan..."
terraform apply -var="project_id=${PROJECT_ID}" -auto-approve

# Get output database URL
DB_URL=$(terraform output -raw database_url | tr -d '\r\n')
if [[ ! "$DB_URL" =~ ^https:// ]]; then
    echo "Error: Could not retrieve a valid Database URL. Got: $DB_URL"
    exit 1
fi

# 5. Apply Security Rules via REST API (Test Mode: Open Read/Write)
echo "Configuring Security Rules to Open Test Mode..."
GCP_TOKEN=$(gcloud auth print-access-token | tr -d '\r\n')

RULES_BODY='{
  "rules": {
    ".read": "true",
    ".write": "true"
  }
}'

curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d "$RULES_BODY" \
  "$DB_URL/.settings/rules.json?access_token=$GCP_TOKEN" > /dev/null

echo "Security rules configured successfully!"

echo -e "\n==============================================="
echo "Deployment Successful!"
echo "Copy this database URL into your Snake AI settings:"
echo -e "\033[1;33m$DB_URL/qtable.json\033[0m"
echo "==============================================="
