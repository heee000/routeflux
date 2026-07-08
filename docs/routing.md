# Routing model

The initial router is deterministic and calibration-ready. It does not call another language model on the online request path.

## Features

Each request produces:

- a normalized 12-domain vector from a local bilingual TF-IDF character n-gram classifier;
- a primary domain;
- a difficulty score, four-level tier, and all 14 contributing dimensions;
- an expected output length;
- explicit capability requirements such as tools, vision, and JSON output.

The canonical domains, inherited from DomainRouter, are `math_reasoning`, `code_generation`, `code_debugging`, `data_analysis`, `creative_writing`, `translation`, `factual_qa`, `summarization`, `system_design`, `instruction_following`, `multimodal`, and `agentic_task`. Caller hints add evidence but do not bypass capability checks. Legacy v0.7 model profiles using `coding`, `math`, `science`, `business`, `writing`, `law`, `medicine`, or `general` are expanded into this canonical space.

Difficulty is decomposed into token count, code presence, reasoning markers, technical terms, creative markers, simple indicators, multi-step patterns, question complexity, imperative verbs, constraint count, output format, reference complexity, negation complexity, and domain specificity. The full vector and breakdown are stored with the request so later predictors can be calibrated and audited.

## Candidate generation

For every eligible model, the router creates several output-token budgets around the predicted requirement. Economy mode explores shorter budgets. Quality mode explores the predicted requirement and larger caps. An explicit `max_tokens` or numeric `routing.token_budget` remains a hard limit.

Pairs that violate context length, capability, latency, cost, or minimum-quality constraints are discarded.

## Quality estimate

The baseline quality estimate combines:

- the model's calibrated base quality;
- cosine similarity between request and model domain vectors;
- mismatch between request difficulty and model difficulty capacity;
- the expected quality loss when the token cap is below the predicted requirement;
- a diminishing quality gain when the cap is above the predicted requirement.

Model metadata accepts these calibration fields:

```json
{
  "qualityScore": 0.78,
  "difficultyCapacity": 0.82,
  "latencyMs": 2400,
  "outputLengthMultiplier": 1.1,
  "tokenGain": 0.1
}
```

The final utility is a mode-specific weighted combination of predicted quality, cost, and latency. Candidate features and scores are stored with every request so the deterministic estimates can later be replaced by fitted predictors without changing the public API.

## Calibration

Production calibration uses task-level evaluation labels rather than aggregate model rankings. The implemented sequence is:

1. collect representative prompts and observed provider behavior;
2. score outputs with domain-specific tests, human preference, or controlled judges;
3. submit scores through `/v1/feedback` and run `npm run calibrate -- -- MINIMUM_SAMPLES`;
4. validate predicted quality calibration by domain and difficulty bucket;
5. deploy new predictor versions behind an offline replay gate.

Domain similarity and difficulty are features, not labels. They should influence a model only when evaluation data shows that the model performs differently along those dimensions.

The current job updates base quality, difficulty capacity, and observed domain scores. Every run is recorded in `calibration_runs`. `tokenGain` controls the saturating output-length curve and can be fitted later from prompts with uncapped or high-cap reference generations.
