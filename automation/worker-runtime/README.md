# AfraKala Worker Runtime — Minimal Skeleton

**Phase:** PHASE-1-IMPLEMENTATION  
**Packet:** TPC-I-001 — Minimal Worker Runtime Skeleton  
**Status:** Skeleton only

This package contains the minimal Python Worker Runtime skeleton for AfraKala Automation.

It is intentionally small. It does **not** implement any real Torob, Google Maps, Divar, WhatsApp, Instagram, OCR/STT, AI, browser automation, migration, or UI work.

## Purpose

The goal is to create a controlled worker foundation before any real driver is built.

The worker skeleton provides:

- environment-based config loading
- structured logging
- Supabase client wrapper shape
- job claim skeleton
- heartbeat skeleton
- checkpoint save/load skeleton
- job runner skeleton
- graceful shutdown hooks
- mock/test mode

## Out of scope

The following are forbidden in this packet:

```text
Real Torob extraction
Google Maps extraction
Divar
WhatsApp
Instagram
OCR/STT
AI production
Playwright
Selenium
External website calls
Redis
RabbitMQ
Supabase migration
UI implementation
New API route
Parallel Core
Parallel database
Parallel admin panel
Hardcoded secret
Production schedule
```

## Local setup

```powershell
1. cd automation/worker-runtime
2. python -m pip install -e .
3. pytest
```

If `pytest` is not available in your environment, install it in your local development environment only.

## Run in mock mode

```powershell
1. cd automation/worker-runtime
2. $env:WORKER_MODE="mock"
3. $env:WORKER_ID="local-worker-001"
4. python -m main
```

No real secrets are required for mock mode.

## Environment variables

See `.env.example`.

Important rule: never commit real secrets.

## Notes

This runtime is not production-ready yet. It is only a minimal contract skeleton so the next packet can add a mock driver contract test safely.
