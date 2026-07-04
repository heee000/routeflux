# RouteFlux

[English](README.md) | [简体中文](README_CN.md)

RouteFlux 是一个兼容 OpenAI API 的模型网关，支持基于策略的智能路由。Provider 接入、路由决策和用量计费彼此分离，各模块可以独立演进，而无需修改客户端应用。

## 当前版本

v0.6 已实现：

- 支持流式透传的 `POST /v1/chat/completions`
- `GET /v1/models`
- 通用 OpenAI-compatible Provider 适配器
- 手动、经济、均衡和质量优先四种路由模式
- 模型能力和上下文窗口硬约束过滤
- Provider 密钥加密存储
- PostgreSQL 数据迁移与 Docker 开发环境
- API Key 鉴权
- 基于美元的钱包余额、事务预占和结算
- 由数据库触发器保证不可修改的钱包流水
- 普通响应和流式响应用量计费
- 请求级成本、延迟和路由记录
- 用户、API Key 和钱包充值管理接口
- 基于领域向量相似度的路由
- 问题难度与预期输出长度估计
- 模型与输出 Token 预算联合优化
- 用户侧成本、延迟和最低预测质量约束
- 保存路由特征和候选评分，支持后续校准
- 用户、余额、模型目录、请求和钱包流水管理控制台
- 通过加密管理接口配置 Provider 和模型
- 生产容器、同源反向代理和持续集成
- Provider 超时和可重试错误的跨 Provider 回退
- Provider 滚动延迟、失败计数和熔断
- 与实际计费请求关联的用户反馈
- 模型质量、难度容量和领域画像离线校准任务
- 多 API 实例共享的 API Key 每分钟请求限制
- API Key 月度预算和单次请求成本上限
- 在手动或自动路由之前执行模型白名单限制

下一版本将重点扩展更多 OpenAI API 接口，并加入自动化评测数据导入。

## 本地开发

环境要求：Node.js 20+、Docker 和 npm。

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run dev:api
npm run dev:web
```

运行数据库迁移前，请替换 `.env` 中的 `MASTER_KEY` 和 `ADMIN_TOKEN`。

如需在 API 启动时自动导入首个 Provider，可以配置四个 `BOOTSTRAP_PROVIDER_*` 环境变量，并通过逗号分隔模型列表。

## 路由模式

使用模型目录中的 slug 可以显式指定模型，也可以使用：

- `auto/economy`
- `auto/balanced`
- `auto/quality`

`auto` 是 `auto/balanced` 的别名。

自动路由请求可以携带可选路由策略，标准 OpenAI-compatible 字段保持不变：

```json
{
  "model": "auto/balanced",
  "messages": [{ "role": "user", "content": "分析这个问题" }],
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

网关会在 `x-routeflux-*` 响应头中返回最终模型、主要领域、预估难度和 Token 预算。RouteFlux 专用的 `routing` 对象不会发送给上游 Provider。

当上游返回 `408`、`409`、`425`、`429`、`5xx` 或发生连接失败时，系统会切换到 Provider 不同的候选模型。Provider 连续失败三次后将熔断 30 秒。

## 创建第一个账户

使用 `ADMIN_TOKEN` 创建用户、签发 API Key 并充值：

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

API Key 只会在创建时返回一次。

创建 API Key 时还可以设置：

```json
{
  "name": "production",
  "requests_per_minute": 120,
  "monthly_budget_usd": 50,
  "max_request_usd": 0.25,
  "allowed_models": ["provider/model-a", "provider/model-b"]
}
```

`allowed_models` 为空数组时，Key 可以调用模型目录中的全部启用模型。限流响应会返回剩余次数和重置时间；预算限制会在钱包预占及 Provider 调用之前执行。

## 路由反馈与校准

客户端可以对自己发起的请求提交评分：

```http
POST /v1/feedback
Content-Type: application/json

{
  "request_id": "x-request-id 响应头中的请求 UUID",
  "score": 0.9,
  "category": "correct"
}
```

积累足够反馈后运行校准：

```bash
npm run calibrate -- -- 20
```

参数表示每个模型所需的最低反馈数量。校准过程会向模型原始分数收缩，避免少量样本导致目录参数剧烈变化。

## 生产容器

在 `.env` 中配置 `MASTER_KEY` 和 `ADMIN_TOKEN`，然后运行：

```bash
docker compose --profile app up -d --build
```

管理控制台位于 `3000` 端口，API 仍可通过 `8080` 端口直接访问。API 容器会先执行尚未应用的数据库迁移，再开始接收请求。

## 设计文档

- [系统架构](docs/architecture.md)
- [路由模型](docs/routing.md)
- [部署说明](docs/deployment.md)

## 许可证

项目所有者保留版权。首次公开发行前将确定具体分发许可证。
