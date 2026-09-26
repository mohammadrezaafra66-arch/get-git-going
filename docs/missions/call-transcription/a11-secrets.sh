#!/bin/sh
# A11: token variable names must appear; values must not.
# Run from the worktree.
git log -p -- deploy/stt deploy/lan/.env.lan.example docs/missions/call-transcription \
  | grep -nE 'STT_INGEST_TOKEN|CALL_TRANSCRIPT_WORKER_TOKEN' \
  | grep -vE 'STT_INGEST_TOKEN=$|CALL_TRANSCRIPT_WORKER_TOKEN=$|STT_INGEST_TOKEN=|CALL_TRANSCRIPT_WORKER_TOKEN=' \
  || true
echo "--- raw name hits (should be names / empty placeholders only) ---"
git log -p -- deploy/stt deploy/lan/.env.lan.example docs/missions/call-transcription \
  | grep -nE 'STT_INGEST_TOKEN|CALL_TRANSCRIPT_WORKER_TOKEN'
