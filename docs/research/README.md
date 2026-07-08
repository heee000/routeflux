# RouteFlux research lineage

RouteFlux is the productized continuation of the earlier DomainRouter research project. The source material remains outside this repository so its chronology and original Git history are preserved.

After moving this repository to `F:\每周三汇报\3\code\RouteFlux`, the relevant sources are:

| Stage | Source | Role in RouteFlux |
|---|---|---|
| OpenClaw baseline | `../../读clawrouter.docx`, `../ClawRouter-0.12.190/` | Difficulty tiers, capability filters, fallbacks, spend controls |
| Original project | `../DomainRouter/`, `../../domainrouter.docx`, `../../分析.docx` | 12 task domains, 14 difficulty dimensions, transparent model scoring |
| RouteMoA study | `../RouteMoA-main/`, `../../RouteMoA_中文翻译版.docx`, `../../wenxian.pdf` | Query-to-model utility prediction and multi-model evaluation |
| R2-Router study | `../../../4/` | Joint model-output-budget curve routing and lightweight offline predictors |
| Routing surveys | `../../../5/` | Budget-constrained pre-inference routing taxonomy and future cascade extensions |

`F:\每周三汇报\2\wenxian.pdf` and `F:\每周三汇报\3\wenxian.pdf` have the same SHA-256 hash, so they are duplicate copies of the RouteMoA paper rather than two different studies.

See [RESEARCH_TO_IMPLEMENTATION.md](RESEARCH_TO_IMPLEMENTATION.md) for the design mapping and [PROJECT_CONTEXT_CN.md](PROJECT_CONTEXT_CN.md) for the conversation and migration handoff.
