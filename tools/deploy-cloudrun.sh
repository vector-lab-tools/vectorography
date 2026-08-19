#!/usr/bin/env bash
# Vectorography on Cloud Run. Cloud Build compiles the Dockerfile, so nothing
# is built or run locally and Docker need not be installed.
set -euo pipefail

PROJECT="${PROJECT:-vectorography}"
REGION="${REGION:-europe-west2}"      # London
SERVICE="${SERVICE:-vectorography}"

gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
       artifactregistry.googleapis.com

# 1Gi because numpy, scipy and fontTools sit in memory alongside a 30 MB model,
# and the compiler holds a font per master while a journey is being built.
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 120 \
  --concurrency 20 \
  --min-instances 0 \
  --max-instances 4

gcloud run services describe "$SERVICE" --region "$REGION" \
       --format 'value(status.url)'
