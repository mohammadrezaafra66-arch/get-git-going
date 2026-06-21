# TPC-3-011 — Safe Row Summary Packet

## Status

Documentation-only planning packet for the next PHASE-3 boundary.

## Background

Confirmed checkpoints:

1. TPC-3-009 single-row step is merged.
2. The single-row step has local test evidence.
3. TPC-3-010 operator flow packet is merged.

Latest reported worker-runtime result:

    173 passed in 0.47s

## Goal

Define a safe summary shape for one reviewed PHASE-3 evidence row.

The future summary should expose only fields needed for operator review.

## Scope

Docs only.

## Allowed summary fields

A future summary may include:

- summary id
- job id
- run id
- status
- phase label
- source kind
- target table
- item count
- completion count
- safe flags needed for review

## Not allowed in summary

A future summary must not include:

- raw payload body
- sensitive values
- credential-like values
- full customer data
- full commercial table data
- automatic trigger data

## Required future checks

A future implementation must prove:

1. only one row is summarized
2. phase label remains `PHASE-3`
3. target remains `automation_driver_outputs`
4. unsafe fields are not included
5. local worker-runtime tests pass

## Required future tests

A future implementation PR must include focused tests for:

1. accepted safe summary
2. rejection of invalid phase label
3. rejection of invalid target table
4. absence of raw payload fields
5. preservation of single-row boundary

## Final decision

TPC-3-011 defines a summary boundary only.

It does not add implementation code or runtime behavior.
