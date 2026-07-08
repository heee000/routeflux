# Research-to-implementation map

## What was preserved

The original DomainRouter repository remains untouched as a reference implementation. RouteFlux ports its distinctive research layer into a multi-user API-wallet product instead of rewriting or deleting that repository.

| Research idea | RouteFlux implementation | Status |
|---|---|---|
| 12-domain task representation | `domain-classifier.ts` | Implemented with local bilingual TF-IDF character n-grams |
| 14-dimensional difficulty analysis | `difficulty.ts` | Implemented and persisted per request |
| Domain × difficulty × price decision | `router.ts` | Implemented with quality, cost, and latency utility |
| User-owned provider access | encrypted provider catalog | Implemented for OpenAI-compatible endpoints |
| Capability filtering | tools, vision, JSON, context window | Implemented as hard constraints |
| Fallback chain | provider-diverse retry candidates | Implemented with circuit breakers |
| API wallet | wallet holds, immutable ledger, per-key quotas | Implemented as the product layer added by RouteFlux |
| R2-style curve routing | joint `(model, output token budget)` search | Implemented with a saturating token-quality curve |
| Learned quality curves | offline fitted per-model predictors | Extension point only; heuristics remain the online baseline |
| Post-generation cascade / ensemble | response evaluation and escalation | Not implemented; deliberately outside the current pre-inference path |

## Online routing sequence

```text
OpenAI-compatible request
  -> 12-domain n-gram vector
  -> 14-dimension difficulty breakdown
  -> expected output length
  -> hard capability/context/policy filters
  -> score every (model, token budget) pair
  -> atomic wallet and API-key budget reservation
  -> provider-diverse execution and fallback
  -> usage settlement, request features, and feedback storage
```

## Why the learned router is not hard-coded yet

The R2-Router code review showed that lightweight Ridge predictors are sufficient for curve routing, but a predictor is only meaningful when trained on evaluation data for the actual model pool. RouteFlux therefore stores the feature vector, difficulty breakdown, selected budget, observed usage, latency, and feedback first. A later offline pipeline can fit and version predictors without placing another LLM on the online request path.

## Compatibility

RouteFlux v0.7 used broad model-domain keys such as `coding`, `math`, and `writing`. v0.8 accepts those legacy keys and expands them into the canonical 12-domain space, while new model records should use the canonical names documented in `docs/routing.md`.
