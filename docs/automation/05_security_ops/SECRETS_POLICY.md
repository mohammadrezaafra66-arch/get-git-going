# Secrets Policy

## Hard rule

Never commit real secrets to GitHub.

## Forbidden values

- API key
- password
- service key
- service role key
- cookie
- token
- JWT secret
- session file
- private certificate
- database dump
- backup
- production env file

## Allowed values

- empty placeholders
- `.env.example` without real values
- documentation that names secret fields without exposing their values

## Phase 0 rule

Dummy Worker and automation contracts may only use empty placeholders. No real external account or production credential is allowed.
