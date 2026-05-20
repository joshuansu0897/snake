terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

# 1. Enable Firebase API
resource "google_project_service" "firebase" {
  provider           = google
  project            = var.project_id
  service            = "firebase.googleapis.com"
  disable_on_destroy = false
}

# 2. Enable Realtime Database API
resource "google_project_service" "database" {
  provider           = google
  project            = var.project_id
  service            = "firebasedatabase.googleapis.com"
  disable_on_destroy = false
}

# 3. Configure the Firebase Project on GCP
resource "google_firebase_project" "default" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.firebase]
}

# 4. Create default Realtime Database Instance
resource "google_firebase_database_instance" "default" {
  provider    = google-beta
  project     = var.project_id
  instance_id = "${var.project_id}-default-rtdb"
  type        = "DEFAULT_DATABASE"
  region      = var.database_region

  depends_on = [
    google_firebase_project.default,
    google_project_service.database
  ]
}
