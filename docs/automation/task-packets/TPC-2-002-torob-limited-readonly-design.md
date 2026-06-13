# TPC-2-002 — Torob Limited Read-Only Design

Status: ready for review.

Goal:
- Design the first limited Torob read-only flow.
- Keep execution locked until a later approved implementation packet.

This packet is planning only.

Scope:
- source: torob
- mode: read-only
- product count: 3 to 5 test products maximum
- no login
- no messaging
- no scheduler
- no bulk crawl

Output fields to design:
- job_id
- run_id
- source
- product_name
- product_url
- seller_name
- price
- availability_status
- extracted_at
- status
- error_code

Safety limits:
- no bypass
- no ranking manipulation
- no unnecessary clicks
- no high-volume requests
- no browser automation unless separately approved
- no credentials or secrets

Persistence design questions:
- target table
- duplicate rule
- rollback rule
- evidence rule

Next step after acceptance:
- create a separate implementation packet for limited read-only Torob execution.
