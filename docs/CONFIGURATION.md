# Configuration

AegisCart is configured via environment variables. The application loads variables from `.env` in the root directory (if present) and falls back to system environment variables.

## Loading Order
1. System environment variables
2. Variables from `.env` file (if present)
3. Default values (where specified)

## Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | HTTP port the server listens on | `4000` | No |
| `NODE_ENV` | Environment name (`development`, `staging`, `production`) | `development` | No |
| `AEGIS_SIGNING_SECRET` | Secret key for HMAC signing of offers and mandates | `dev-aegis-signing-secret-change-me` | Yes (change in production) |
| `LLM_PROVIDER` | Language model provider (`mock`, `openai`, `anthropic`) | `mock` | No |
| `LLM_API_KEY` | API key for the LLM provider | (empty) | Yes if `LLM_PROVIDER` is `openai` or `anthropic` |
| `LLM_MODEL` | Model identifier (e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`) | `gpt-4o-mini` | Yes if `LLM_PROVIDER` is `openai` or `anthropic` |
| `LLM_BASE_URL` | Base URL for custom LLM endpoints | (empty) | No |
| `LLM_TIMEOUT_MS` | Timeout for LLM requests in milliseconds | `15000` | No |
| `RAZORPAY_KEY_ID` | Razorpay test mode key ID | (empty) | No (simulated payment if absent) |
| `RAZORPAY_KEY_SECRET` | Razorpay test mode key secret | (empty) | No (simulated payment if absent) |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for verifying Razorpay webhooks | (empty) | No |
| `RAZORPAY_API_BASE` | Base URL for Razorpay API | `https://api.razorpay.com/v1` | No |
| `SQLITE_DB_PATH` | Path to the SQLite database file | `data/aegiscart.db` | No |
| `LOG_LEVEL` | Logging level (`error`, `warn`, `info`, `debug`) | `info` | No |
| `ENABLE_SSE` | Enable Server-Sent Events for ledger stream | `true` | No |
| `CACHE_TTL_SECONDS` | Default TTL for cached items in seconds | `300` | No |
| `RATE_LIMIT_WINDOW_MS` | Window for rate limiting in milliseconds | `60000` | No |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` | No |
| `TRUST_PROXY` | Enable trust proxy for X-Forwarded-For headers | `false` | No |

## Environment Files

AegisCart provides sample environment files for different deployment stages:

- `.env.example`: Template with all variables commented
- `.env.development`: Development defaults (mock LLM, simulated payments)
- `.env.staging`: Staging template (point to test Razorpay keys, optional real LLM)
- `.env.production.example`: Production template (fill in all secrets)

To use a specific environment, copy the appropriate file to `.env`:

```bash
# Development
cp .env.development .env

# Staging
cp .env.staging .env

# Production (after editing the template)
cp .env.production.example .env
# THEN EDIT .env TO ADD YOUR PRODUCTION SECRETS
```

## Feature Flags

Feature flags are configured via environment variables prefixed with `FEATURE_`. See [FEATURE_FLAGS.md](docs/FEATURE_FLAGS.md) for details.

## Examples

### Development (default)
```env
# .env.development
PORT=4000
NODE_ENV=development
AEGIS_SIGNING_SECRET=dev-aegis-signing-secret-change-me
LLM_PROVIDER=mock
SQLITE_DB_PATH=data/aegiscart.db
```

### Staging with Test Razorpay
```env
# .env.staging
PORT=4000
NODE_ENV=staging
AEGIS_SIGNING_SECRET=your-staging-signing-secret
LLM_PROVIDER=mock
LLM_API_KEY= # optional if using real LLM for language
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=your-test-secret
SQLITE_DB_PATH=data/aegiscart_staging.db
```

### Production
```env
# .env.production (copy from .env.production.example and fill)
PORT=4000
NODE_ENV=production
AEGIS_SIGNING_SECRET=your-production-signing-secret-must-be-changed
LLM_PROVIDER=openai
LLM_API_KEY=sk-your-openai-key
LLM_MODEL=gpt-4o
RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=your-live-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
SQLITE_DB_PATH=/var/lib/aegiscart/aegisCart.db
LOG_LEVEL=warn
```

## Best Practices

1. **Never commit secrets**: The `.env` file is gitignored. Keep it local to each environment.
2. **Use unique signing secrets**: Each deployment (dev, staging, prod) should have a different `AEGIS_SIGNING_SECRET`.
3. **Limit Razorpay keys**: Use test mode keys for staging and live keys only in production.
4. **Rotate secrets**: Periodically rotate the signing secret and API keys.
5. **Use a secrets manager**: In production, consider loading secrets from a vault (AWS Secrets Manager, HashiCorp Vault, etc.) and exporting them as environment variables.
