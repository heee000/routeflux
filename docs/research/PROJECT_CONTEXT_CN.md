# RouteFlux 项目上下文与对话交接

更新日期：2026-07-08

## 项目源头

原始研究工程位于 `F:\每周三汇报\3\code\DomainRouter`，当前保留其独立 Git 历史。它不是废弃垃圾目录，而是 RouteFlux 的研究原型和对照实现：

- 12 个任务领域；
- 14 维难度评估；
- n-gram、关键词和可选 embedding 分类器；
- 领域匹配、难度适配、价格与延迟加权；
- OpenClaw 插件、独立代理和多 Provider Adapter。

后续研究位于：

- `F:\每周三汇报\4`：R2-Router，重点是 point routing 到 curve routing、模型与输出长度联合选择，以及开源代码中的 Ridge 预测器；
- `F:\每周三汇报\5`：路由与 LLM Ensemble 综述，明确当前产品主线属于预算约束的生成前路由，并为后续级联/集成保留扩展方向。

## 本轮对话发生了什么

1. 用户希望把只面向 OpenClaw 的原型完全重构成类似 API 钱包/OpenRouter 的平台，同时加入问题难度、领域相似度和动态输出 Token 路由。
2. 新仓库发布到 `https://github.com/heee000/routeflux.git`，主分支为 `main`，中英文 README 互相链接。
3. 曾误把 Windows 用户名 `33599` 当成提交作者；随后重写未发布历史并统一为 `heee000 <heee000@users.noreply.github.com>`。以后提交前必须继续检查作者和 tagger。
4. RouteFlux v0.1-v0.7 在 `C:\Users\33599\Documents\Codex\2026-07-03\z\outputs\routeflux` 中实现，包含 API 网关、PostgreSQL、管理台、钱包、配额、fallback、反馈校准和动态 Token 曲线。
5. 用户在 2026-07-08 指出工作区错误，并要求回到 `F:\每周三汇报` 的真实研究材料进行整理和重构。
6. 逐文件审计确认：v0.7 的平台化代码是真实可运行的，但把原始 12 领域简化成 8 个宽泛领域，也弱化了 14 维难度解释。本次 v0.8 将这两部分恢复并持久化，同时保留 v0.7 已验证的钱包与曲线路由。

## 目录决策

- `F:\每周三汇报\3\code\DomainRouter`：原始研究实现，只作保留和对照，不覆盖；
- `F:\每周三汇报\3\code\RouteFlux`：新的长期主仓库；
- `F:\每周三汇报\4`、`5`：继续保留研究时间线，不复制进 Git 仓库；
- `F:\每周三汇报\3\code.code-workspace`：统一打开主仓库、原型和后续研究资料。

## 下一步优先级

1. 用真实模型评测数据建立模型画像，而不是长期依赖手填 `qualityScore`；
2. 训练并版本化每模型/领域/Token 预算的轻量预测器，优先考虑 Ridge；
3. 建立离线 replay gate，对比 Random、Best Single、Oracle、DomainRouter heuristic、RouteFlux curve router；
4. 扩展 Responses/Embeddings 等 OpenAI 接口；
5. 在生成前路由稳定后，再研究失败升级、低置信度级联和多模型评审。

## 新对话开始时

先打开本文件、`RESEARCH_TO_IMPLEMENTATION.md`、根目录 `README_CN.md`，再检查 Git 状态。不要从空白产品构想重新开始，也不要修改 `DomainRouter` 的历史来伪装成 RouteFlux 历史。
