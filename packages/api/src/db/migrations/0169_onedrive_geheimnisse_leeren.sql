-- Secrets moved to Secrets Manager (c4-<env>-onedrive); the old columns are no longer read.
UPDATE onedrive_verbindung SET client_secret = NULL, refresh_token = NULL, access_token = NULL, access_ablauf = NULL
