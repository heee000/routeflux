export const SUPPORTED_LANGUAGES = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" }
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number]["value"];

export const isLanguage = (value: string | null): value is Language => value === "zh" || value === "en";

export const localeFor = (language: Language): string => language === "zh" ? "zh-CN" : "en-US";

export const translations = {
  zh: {
    common: {
      language: "语言",
      dismiss: "关闭",
      cancel: "取消",
      save: "保存",
      status: "状态",
      closeDialog: "关闭弹窗",
      empty: "—"
    },
    login: {
      title: "RouteFlux 控制台",
      description: "请输入 API 服务端配置的管理员令牌。",
      adminToken: "管理员令牌",
      submit: "打开控制台"
    },
    nav: {
      overview: "概览",
      models: "模型",
      users: "用户",
      requests: "请求",
      ledger: "账本"
    },
    shell: {
      apiConfigured: "API 已配置",
      signOut: "退出登录",
      eyebrow: "运营控制台"
    },
    notices: {
      keyCreated: (apiKey: string) => `新 API Key（请立即复制）：${apiKey}`,
      creditAdded: (amount: number, email: string) => `已向 ${email} 充值 $${amount.toFixed(2)}`
    },
    prompts: {
      keyName: (email: string) => `${email} 的新 Key 名称`,
      creditAmount: (email: string) => `${email} 的充值金额（USD）`
    },
    errors: {
      loadConsole: "无法加载控制台",
      issueKey: "无法签发 Key",
      addCredit: "无法充值",
      creditPositive: "充值金额必须是正数",
      saveProvider: "无法保存 Provider",
      saveModel: "无法保存模型",
      createUser: "无法创建用户"
    },
    overview: {
      requests24h: "24 小时请求数",
      monthUsage: "本月用量",
      activeUsers: "活跃用户",
      activeModels: "活跃模型",
      recentRequests: "最近请求",
      recentRequestsDescription: "最新网关活动和路由决策"
    },
    models: {
      latency: "延迟",
      failures: "失败数",
      catalog: "模型目录",
      catalogSummary: (providers: number, models: number) => `${providers} 个 Provider · ${models} 个模型`,
      addProvider: "添加 Provider",
      addModel: "添加模型",
      table: {
        model: "模型",
        provider: "Provider",
        context: "上下文",
        input: "输入 / 1M",
        output: "输出 / 1M",
        capabilities: "能力",
        status: "状态"
      },
      capabilities: {
        tools: "工具",
        vision: "视觉",
        json: "JSON"
      }
    },
    users: {
      title: "用户与余额",
      description: "API 访问权限和可用钱包资金",
      addUser: "添加用户",
      table: {
        user: "用户",
        balance: "余额",
        held: "冻结",
        keys: "Keys",
        status: "状态"
      },
      issueKey: "签发 Key",
      addCredit: "充值"
    },
    requests: {
      table: {
        time: "时间",
        route: "路由",
        domain: "领域",
        difficulty: "难度",
        tokens: "Tokens",
        cost: "成本",
        latency: "延迟",
        status: "状态"
      },
      cap: "上限",
      empty: "还没有请求记录。"
    },
    ledger: {
      title: "钱包账本",
      description: "只追加记录充值、用量、退款和调整",
      table: {
        time: "时间",
        user: "用户",
        type: "类型",
        description: "说明",
        amount: "金额",
        balanceAfter: "变动后余额"
      }
    },
    dialogs: {
      provider: {
        title: "添加 Provider",
        slug: "Slug",
        displayName: "显示名称",
        baseUrl: "Base URL",
        apiKey: "API Key",
        priority: "优先级",
        timeout: "超时（ms）",
        save: "保存 Provider"
      },
      model: {
        title: "添加模型",
        provider: "Provider",
        publicSlug: "公开 Slug",
        displayName: "显示名称",
        upstreamModel: "上游模型",
        contextWindow: "上下文窗口",
        maxOutputTokens: "最大输出 Tokens",
        inputPrice: "输入 $ / 1M",
        outputPrice: "输出 $ / 1M",
        qualityScore: "质量分",
        difficultyCapacity: "难度容量",
        latencyEstimate: "延迟估计（ms）",
        domains: "领域",
        save: "保存模型"
      },
      user: {
        title: "添加用户",
        displayName: "显示名称",
        email: "邮箱",
        create: "创建用户"
      }
    },
    status: {
      active: "启用",
      disabled: "停用",
      healthy: "健康",
      degraded: "降级",
      open: "熔断",
      started: "进行中",
      succeeded: "成功",
      failed: "失败",
      suspended: "暂停",
      credit: "充值",
      usage: "用量",
      refund: "退款",
      adjustment: "调整"
    }
  },
  en: {
    common: {
      language: "Language",
      dismiss: "Dismiss",
      cancel: "Cancel",
      save: "Save",
      status: "Status",
      closeDialog: "Close dialog",
      empty: "—"
    },
    login: {
      title: "RouteFlux Console",
      description: "Enter the administrator token configured on the API server.",
      adminToken: "Admin token",
      submit: "Open console"
    },
    nav: {
      overview: "Overview",
      models: "Models",
      users: "Users",
      requests: "Requests",
      ledger: "Ledger"
    },
    shell: {
      apiConfigured: "API configured",
      signOut: "Sign out",
      eyebrow: "Operator console"
    },
    notices: {
      keyCreated: (apiKey: string) => `New API key (copy now): ${apiKey}`,
      creditAdded: (amount: number, email: string) => `Added $${amount.toFixed(2)} to ${email}`
    },
    prompts: {
      keyName: (email: string) => `Name for ${email}'s new key`,
      creditAmount: (email: string) => `USD credit for ${email}`
    },
    errors: {
      loadConsole: "Unable to load the console",
      issueKey: "Unable to issue key",
      addCredit: "Unable to add credit",
      creditPositive: "Credit must be a positive number",
      saveProvider: "Unable to save provider",
      saveModel: "Unable to save model",
      createUser: "Unable to create user"
    },
    overview: {
      requests24h: "Requests · 24h",
      monthUsage: "Month usage",
      activeUsers: "Active users",
      activeModels: "Active models",
      recentRequests: "Recent requests",
      recentRequestsDescription: "Latest gateway activity and routing decisions"
    },
    models: {
      latency: "Latency",
      failures: "Failures",
      catalog: "Model catalog",
      catalogSummary: (providers: number, models: number) => `${providers} providers · ${models} models`,
      addProvider: "Add provider",
      addModel: "Add model",
      table: {
        model: "Model",
        provider: "Provider",
        context: "Context",
        input: "Input / 1M",
        output: "Output / 1M",
        capabilities: "Capabilities",
        status: "Status"
      },
      capabilities: {
        tools: "tools",
        vision: "vision",
        json: "json"
      }
    },
    users: {
      title: "Users and balances",
      description: "API access and available wallet funds",
      addUser: "Add user",
      table: {
        user: "User",
        balance: "Balance",
        held: "Held",
        keys: "Keys",
        status: "Status"
      },
      issueKey: "Issue key",
      addCredit: "Add credit"
    },
    requests: {
      table: {
        time: "Time",
        route: "Route",
        domain: "Domain",
        difficulty: "Difficulty",
        tokens: "Tokens",
        cost: "Cost",
        latency: "Latency",
        status: "Status"
      },
      cap: "cap",
      empty: "No requests recorded yet."
    },
    ledger: {
      title: "Wallet ledger",
      description: "Append-only credits, usage, refunds, and adjustments",
      table: {
        time: "Time",
        user: "User",
        type: "Type",
        description: "Description",
        amount: "Amount",
        balanceAfter: "Balance after"
      }
    },
    dialogs: {
      provider: {
        title: "Add provider",
        slug: "Slug",
        displayName: "Display name",
        baseUrl: "Base URL",
        apiKey: "API key",
        priority: "Priority",
        timeout: "Timeout (ms)",
        save: "Save provider"
      },
      model: {
        title: "Add model",
        provider: "Provider",
        publicSlug: "Public slug",
        displayName: "Display name",
        upstreamModel: "Upstream model",
        contextWindow: "Context window",
        maxOutputTokens: "Max output tokens",
        inputPrice: "Input $ / 1M",
        outputPrice: "Output $ / 1M",
        qualityScore: "Quality score",
        difficultyCapacity: "Difficulty capacity",
        latencyEstimate: "Latency estimate (ms)",
        domains: "Domains",
        save: "Save model"
      },
      user: {
        title: "Add user",
        displayName: "Display name",
        email: "Email",
        create: "Create user"
      }
    },
    status: {
      active: "Active",
      disabled: "Disabled",
      healthy: "Healthy",
      degraded: "Degraded",
      open: "Open",
      started: "Started",
      succeeded: "Succeeded",
      failed: "Failed",
      suspended: "Suspended",
      credit: "Credit",
      usage: "Usage",
      refund: "Refund",
      adjustment: "Adjustment"
    }
  }
} as const;

export type Copy = (typeof translations)["zh"];

export const copyFor = (language: Language): Copy => translations[language] as Copy;
