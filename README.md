# RouteFlux

RouteFlux is an OpenAI-compatible model gateway with policy-based routing. It keeps provider integration, routing decisions, and usage accounting separate so each can evolve without changing client applications.

## Current release

Version 0.4 provides:

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
- domain-vector similarity routing
- task difficulty and expected output-length estimation
- joint model and output-token-budget optimization
- caller constraints for cost, latency, and minimum predicted quality
- persisted routing features and candidate scores for later calibration
- operator console for users, balances, catalog, requests, and ledger activity
- provider and model configuration through encrypted administration APIs
- production container builds and same-origin reverse proxy configuration
- continuous integration for type checking, tests, and production builds

The next release focuses on provider health, fallback execution, and data-driven calibration jobs.

## Local development

Requirements: Node.js 20+, Docker, and npm.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev:api
npm run dev:web
```

Before running the migration, replace `MASTER_KEY` and `ADMIN_TOKEN` in `.env`.
Set the four `BOOTSTRAP_PROVIDER_*` variables to import an initial provider and a comma-separated model list when the API starts.

## Routing modes

Use a catalog model slug for explicit routing, or one of:

- `auto/economy`
- `auto/balanced`
- `auto/quality`

`auto` is an alias for `auto/balanced`.

Automatic requests may include an optional routing policy. Standard OpenAI-compatible fields are unchanged.

```json
{
  "model": "auto/balanced",
  "messages": [{ "role": "user", "content": "Analyze this query" }],
  "routing": {
    "max_cost_usd": 0.02,
    "max_latency_ms": 10000,
    "min_quality": 0.65,
    "domains": ["business"],
    "token_budget": "dynamic",
    "trace": true
  }
}
```

The gateway returns the selected model, primary domain, estimated difficulty, and token budget in `x-routeflux-*` response headers. The proprietary `routing` object is removed before the request is sent upstream.

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

## Production containers

Set `MASTER_KEY` and `ADMIN_TOKEN` in `.env`, then run:

```bash
docker compose --profile app up -d --build
```

The console is exposed on port `3000`; the API remains available directly on port `8080`. The API container runs pending migrations before it starts accepting traffic.

## Design notes

- [Architecture](docs/architecture.md)
- [Routing model](docs/routing.md)
- [Deployment](docs/deployment.md)

## License

Copyright retained by the project owner. A distribution license will be selected before the first public release.
