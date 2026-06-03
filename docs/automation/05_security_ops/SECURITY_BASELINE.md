# Security Baseline

## اصل ممنوعیت Secret در GitHub

هیچ مقدار واقعی از موارد زیر نباید وارد GitHub شود:

- API key
- رمز عبور
- Service key
- Service role key
- Cookie
- Token
- JWT secret
- Session file
- Certificate
- Database dump
- Backup
- Production `.env`

## Phase 0 rule

Phase 0 only prepares structure, contracts and dummy-worker boundaries. No real credentials or production integrations are allowed.
