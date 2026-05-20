variable "project_id" {
  type        = string
  description = "The Google Cloud Project ID to deploy to. Make sure this project already exists in your GCP console."
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Default resource location for Firebase products."
}

variable "database_region" {
  type        = string
  default     = "us-central1"
  description = "The database region. Options: us-central1 (US), europe-west1 (Europe), asia-southeast1 (Asia)."
}

output "database_url" {
  value       = google_firebase_database_instance.default.database_url
  description = "The database REST URL. Copy this URL and paste it into the Snake AI settings panel."
}
