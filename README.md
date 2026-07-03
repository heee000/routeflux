# RouteFlux

RouteFlux is an OpenAI-compatible model gateway with policy-based routing. It keeps provider integration, routing decisions, and usage accounting separate so each can evolve without changing client applications.

## Current release

Version 0.2 provides:

- `POST /v1/chat/completions` with streaming passthrough
- `GET /v1/models`
- generic OpenAI-compatible provider adapters
- manual, economy, balanced, and quality routing modes
- capability and context-window filtering
- encrypted provider credentials at rest
- PostgreSQL migrations and Docker development services
- API-key authentication
- USD wallet balances with transactional holds and settlement
- append-only wallet ledger entries enforced by a database trigger
- usage accounting for JSON and streaming responses
- request-level cost and latency records
- administrator endpoints for users, keys, and wallet credits

Learned routing and the operator console are planned for the next releases.

## Local development

Requirements: Node.js 20+, Docker, and npm.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

Before running the migration, replace `MASTER_KEY` and `ADMIN_TOKEN` in `.env`.
Set the four `BOOTSTRAP_PROVIDER_*` variables to import an initial provider and a comma-separated model list when the API starts.

## Routing modes

Use a catalog model slug for explicit routing, or one of:

- `auto/economy`
- `auto/balanced`
- `auto/quality`

`auto` is an alias for `auto/balanced`.

## First account

Create a user with the `ADMIN_TOKEN`, issue a key, and add credit:

```bash
curl -X POST http://localhost:8080/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","display_name":"Owner"}'

curl -X POST http://localhost:8080/admin/users/USER_ID/keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"default"}'

curl -X POST http://localhost:8080/admin/users/USER_ID/credits \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount_usd":10,"reference_id":"initial-credit"}'
```

The API key is returned only when it is created.

## License

Copyright retained by the project owner. A distribution license will be selected before the first public release.
