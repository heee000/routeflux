# Architecture

RouteFlux separates the request path into five parts:

1. The HTTP gateway validates OpenAI-compatible requests and authenticates API keys.
2. Per-key rate, budget, and model-scope policies are enforced before provider work begins.
3. The router filters models by hard capabilities, scores eligible model and token-budget pairs, and returns an ordered decision.
4. The provider adapter translates the selected catalog entry into an upstream request and forwards normal or streaming responses.
5. The accounting path reserves the maximum request charge, records observed usage, settles the hold, and appends an immutable ledger entry.

Provider failures release the hold. A completed request is charged from upstream usage when available; otherwise a conservative local token estimate is used. Amounts are stored as integer micro-dollars. Floating-point values are limited to price calculation and never used as wallet balances.

## Data ownership

- `providers` stores endpoint configuration and encrypted credentials.
- `models` stores capabilities, prices, domain profiles, and calibration metadata.
- `users`, `api_keys`, and `wallets` own access and funds.
- `api_key_rate_windows` provides atomic shared rate windows across API instances.
- `wallet_holds` prevents concurrent requests from overspending one balance.
- `wallet_ledger_entries` is append-only. PostgreSQL rejects updates and deletes.
- `request_logs` contains routing features, candidate scores, measured usage, latency, and cost.

## Request lifecycle

```text
authenticate
  -> extract task features
  -> filter and rank model-token pairs
  -> reserve maximum charge
  -> call provider
  -> meter usage
  -> settle wallet hold
  -> append ledger and complete request log
```

The API process is stateless. PostgreSQL is authoritative for catalog, identity, wallet, and audit state. Redis is reserved for distributed rate limits, health snapshots, and short-lived routing caches in a later release.
