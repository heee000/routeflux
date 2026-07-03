# Deployment

## Required secrets

- `MASTER_KEY` encrypts provider API keys. Back it up and do not rotate it without re-encrypting stored credentials.
- `ADMIN_TOKEN` protects operator APIs and the console.
- Provider keys may be bootstrapped from environment variables or added from the console.

Generate secrets with a cryptographically secure random source. Do not commit `.env`.

## Container deployment

The application profile contains four services:

- `postgres`: authoritative state and ledger;
- `redis`: distributed runtime cache and rate-limit dependency reserved for the next release;
- `api`: gateway, router, billing, and administration API;
- `web`: static console and reverse proxy.

```bash
docker compose --profile app up -d --build
```

The API container applies pending SQL migrations before starting. Migrations are forward-only. Back up PostgreSQL before deploying a new version.

## Reverse proxy

Terminate TLS before exposing the service publicly. Preserve streaming by disabling proxy buffering for `/v1/` and use an upstream timeout longer than the largest provider timeout.

Only the console needs `/admin/`. Restrict it by network policy when possible. User traffic needs `/v1/` and optionally `/health`.

## Operational checks

After a deployment:

1. verify `/health` reports the expected version;
2. authenticate to `/v1/models` with a funded test account;
3. issue one manual-model request and one `auto/balanced` request;
4. confirm the wallet hold returns to zero;
5. confirm request and ledger entries contain the same cost and request identifier.

