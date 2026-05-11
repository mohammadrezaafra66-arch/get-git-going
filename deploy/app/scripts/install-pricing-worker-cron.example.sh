#!/usr/bin/env bash
# PRICE-RT.5 — Operator helper to install pricing worker scheduler — EXAMPLE.
#
# This script is NOT executed by the build/deploy pipeline. It is a
# copy-paste reference for the self-host operator. Read it before running.
#
# Two modes:
#   1. Host cron     (default; works everywhere)
#   2. systemd timer (preferred on systemd hosts; sub-minute via OnUnitActive)
#
# Prereqs (run once, as root):
#   sudo install -d -m 0750 -o root -g root /etc/afrakala
#   sudo install -d -m 0755 /var/log/afrakala
#   # Place real PRICING_WORKER_TOKEN=<long-random> into /etc/afrakala/app.env
#   sudo chmod 600 /etc/afrakala/app.env
#   sudo install -m 0755 deploy/app/scripts/pricing-worker-cron.example.sh \
#       /usr/local/bin/afrakala-pricing-worker.sh
#
# --- Mode 1: host cron (every ~30s) ---
# sudo crontab -e   # add:
#   * * * * * /usr/local/bin/afrakala-pricing-worker.sh
#   * * * * * sleep 30 ; /usr/local/bin/afrakala-pricing-worker.sh
#
# --- Mode 2: systemd timer (every 30s) ---
# Create /etc/systemd/system/afrakala-pricing-worker.service:
#   [Unit]
#   Description=AfraKala pricing recompute worker (drain queue)
#   After=network-online.target
#
#   [Service]
#   Type=oneshot
#   EnvironmentFile=/etc/afrakala/app.env
#   ExecStart=/usr/local/bin/afrakala-pricing-worker.sh
#   # token never appears on the command line — script reads it from EnvironmentFile
#   Nice=10
#   ProtectSystem=strict
#   ProtectHome=true
#   PrivateTmp=true
#   NoNewPrivileges=true
#   ReadWritePaths=/var/log/afrakala
#
# Create /etc/systemd/system/afrakala-pricing-worker.timer:
#   [Unit]
#   Description=Run AfraKala pricing worker every 30s
#
#   [Timer]
#   OnBootSec=30s
#   OnUnitActiveSec=30s
#   AccuracySec=5s
#   Unit=afrakala-pricing-worker.service
#
#   [Install]
#   WantedBy=timers.target
#
# Enable:
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now afrakala-pricing-worker.timer
#   systemctl list-timers | grep afrakala
#   journalctl -u afrakala-pricing-worker.service -n 50 --no-pager
#
# Disable temporarily (e.g. during migration):
#   sudo systemctl stop afrakala-pricing-worker.timer
#   sudo systemctl disable afrakala-pricing-worker.timer
#
# Re-enable:
#   sudo systemctl enable --now afrakala-pricing-worker.timer
#
# Manual smoke test (does NOT install anything):
#   sudo /usr/local/bin/afrakala-pricing-worker.sh
#   sudo tail -n 5 /var/log/afrakala/pricing-worker.log

echo "This is documentation. Read the comments — do not execute blindly." >&2
exit 1