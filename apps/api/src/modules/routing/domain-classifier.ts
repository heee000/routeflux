export const DOMAIN_NAMES = [
  "math_reasoning",
  "code_generation",
  "code_debugging",
  "data_analysis",
  "creative_writing",
  "translation",
  "factual_qa",
  "summarization",
  "system_design",
  "instruction_following",
  "multimodal",
  "agentic_task"
] as const;

export type DomainName = (typeof DOMAIN_NAMES)[number];

// These bilingual prototypes come from the original DomainRouter research implementation.
// Character n-grams make Chinese and mixed-language prompts work without an online classifier.
const DOMAIN_PROTOTYPES: Record<DomainName, string[]> = {
  math_reasoning: [
    "prove", "theorem", "derive", "proof", "equation", "integral", "derivative", "algebra",
    "geometry", "calculus", "probability", "statistics", "matrix", "calculate", "solve",
    "证明", "定理", "推导", "方程", "积分", "导数", "代数", "几何", "概率", "统计", "矩阵", "计算", "求解"
  ],
  code_generation: [
    "write a function", "implement", "build an app", "generate code", "programming", "api endpoint",
    "component", "module", "class", "python", "typescript", "javascript", "react", "dockerfile",
    "写一个函数", "实现", "构建", "编写", "编程", "代码", "程序", "接口", "组件", "前端", "后端", "算法"
  ],
  code_debugging: [
    "fix", "debug", "error", "bug", "not working", "fails", "crash", "exception", "stack trace",
    "wrong output", "root cause", "troubleshoot", "修复", "调试", "错误", "报错", "异常", "崩溃", "排查", "根因", "不工作"
  ],
  data_analysis: [
    "analyze data", "dataset", "csv", "excel", "pandas", "sql", "query", "aggregate", "correlation",
    "regression", "clustering", "machine learning", "visualize", "chart", "分析", "数据", "统计", "可视化", "图表", "聚类", "回归", "趋势"
  ],
  creative_writing: [
    "story", "poem", "creative", "fiction", "character", "plot", "dialogue", "novel", "essay",
    "copywriting", "brainstorm", "故事", "诗", "创作", "小说", "散文", "人物", "情节", "文案", "润色", "广告语"
  ],
  translation: [
    "translate", "translation", "localize", "to english", "to chinese", "in japanese", "i18n",
    "翻译", "译成", "译为", "英译", "中译", "本地化", "用中文", "用英文", "汉化"
  ],
  factual_qa: [
    "what is", "who is", "when was", "where is", "define", "definition", "capital of", "history of",
    "facts about", "tell me about", "什么是", "是谁", "哪里", "定义", "首都", "历史", "事实", "介绍一下", "科普"
  ],
  summarization: [
    "summarize", "summary", "tldr", "key points", "abstract", "overview", "recap", "condense",
    "总结", "摘要", "关键点", "概述", "提炼", "精简", "大纲", "概括", "归纳", "梳理"
  ],
  system_design: [
    "architecture", "system design", "infrastructure", "distributed", "scalable", "microservice",
    "database schema", "trade-off", "workflow", "deployment", "high availability", "架构", "系统设计", "基础设施", "分布式", "微服务", "技术选型", "权衡", "高并发", "高可用", "重构"
  ],
  instruction_following: [
    "follow the instructions", "according to", "as specified", "output as", "strictly", "exactly",
    "template", "do not", "must", "按照", "遵循", "根据", "格式", "严格", "模板", "不要", "必须", "确保"
  ],
  multimodal: [
    "image", "picture", "photo", "vision", "ocr", "screenshot", "diagram", "describe this image",
    "图片", "图像", "照片", "视觉", "识别", "截图", "图表", "看图", "文字识别"
  ],
  agentic_task: [
    "edit file", "create file", "execute", "deploy", "install", "run tests", "first then", "keep trying",
    "iterate", "verify", "tool", "agent", "autonomous", "编辑文件", "创建文件", "执行", "部署", "安装", "测试", "迭代", "验证", "工具", "代理", "提交", "推送"
  ]
};

const LEGACY_ALIASES: Record<string, DomainName[]> = {
  coding: ["code_generation", "code_debugging"],
  math: ["math_reasoning"],
  science: ["factual_qa", "data_analysis"],
  business: ["data_analysis", "factual_qa"],
  writing: ["creative_writing", "translation", "summarization"],
  law: ["factual_qa", "instruction_following"],
  medicine: ["factual_qa", "instruction_following"],
  general: ["factual_qa", "instruction_following"]
};

const STRONG_SIGNALS: Partial<Record<DomainName, RegExp>> = {
  math_reasoning: /\b(prove|theorem|integral|equation)\b|证明|定理|积分|方程/i,
  code_generation: /\b(implement|write (?:a )?(?:function|program)|build (?:an? )?(?:app|api))\b|编写|实现|写.*(?:函数|代码|程序)/i,
  code_debugging: /\b(debug|bug|error|exception|root cause|troubleshoot)\b|调试|报错|修复|异常|排查|根因/i,
  translation: /\btranslate|translation|locali[sz]e\b|翻译|译成|译为|汉化/i,
  summarization: /\bsummari[sz]e|summary|tldr\b|总结|摘要|概括|提炼/i,
  system_design: /\b(system design|architecture|distributed|high availability)\b|系统设计|架构|分布式|高可用/i,
  multimodal: /\b(image|photo|screenshot|ocr|vision)\b|图片|图像|照片|截图|视觉|文字识别/i,
  agentic_task: /\b(edit file|create file|run tests|deploy|keep trying|iterate)\b|编辑文件|创建文件|运行测试|部署|迭代/i
};

function tokenize(value: string): string[] {
  const text = value.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return [];
  const terms: string[] = [];
  for (let index = 0; index < text.length - 1; index += 1) terms.push(text.slice(index, index + 2));
  for (let index = 0; index < text.length - 2; index += 1) terms.push(text.slice(index, index + 3));
  for (const word of text.split(/[\s,.?!;:()[\]{}"'\/\\]+/).filter((item) => item.length >= 2)) {
    terms.push(`w:${word}`);
  }
  return terms;
}

const documentFrequency = new Map<string, number>();
const prototypeVectors = new Map<DomainName, Map<string, number>>();

function weightedVector(terms: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const vector = new Map<string, number>();
  let magnitude = 0;
  for (const [term, frequency] of frequencies) {
    const idf = Math.log((DOMAIN_NAMES.length + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;
    const value = frequency * idf;
    vector.set(term, value);
    magnitude += value * value;
  }
  magnitude = Math.sqrt(magnitude);
  if (magnitude > 0) {
    for (const [term, value] of vector) vector.set(term, value / magnitude);
  }
  return vector;
}

for (const domain of DOMAIN_NAMES) {
  for (const term of new Set(tokenize(DOMAIN_PROTOTYPES[domain].join(" ")))) {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
}
for (const domain of DOMAIN_NAMES) {
  prototypeVectors.set(domain, weightedVector(tokenize(DOMAIN_PROTOTYPES[domain].join(" "))));
}

function cosine(left: Map<string, number>, right: Map<string, number>): number {
  let result = 0;
  for (const [term, value] of left) result += value * (right.get(term) ?? 0);
  return Math.max(0, result);
}

function hintedDomains(hint: string): DomainName[] {
  const normalized = hint.trim().toLowerCase();
  if ((DOMAIN_NAMES as readonly string[]).includes(normalized)) return [normalized as DomainName];
  return LEGACY_ALIASES[normalized] ?? [];
}

export function classifyDomains(text: string, hints: string[] = []): Record<DomainName, number> {
  const query = weightedVector(tokenize(text));
  const raw = Object.fromEntries(DOMAIN_NAMES.map((domain) => [
    domain,
    0.04 + cosine(query, prototypeVectors.get(domain)!)
  ])) as Record<DomainName, number>;
  for (const domain of DOMAIN_NAMES) {
    if (STRONG_SIGNALS[domain]?.test(text)) raw[domain] += 0.8;
  }
  if (!text.trim()) raw.factual_qa += 0.12;
  for (const hint of hints) {
    for (const domain of hintedDomains(hint)) raw[domain] += 0.75;
  }
  const magnitude = Math.sqrt(Object.values(raw).reduce((sum, value) => sum + value * value, 0)) || 1;
  return Object.fromEntries(DOMAIN_NAMES.map((domain) => [domain, raw[domain] / magnitude])) as Record<DomainName, number>;
}

export function expandLegacyDomainVector(vector: Record<string, number>): Record<string, number> {
  const expanded = { ...vector };
  for (const [legacy, domains] of Object.entries(LEGACY_ALIASES)) {
    const value = vector[legacy];
    if (value === undefined) continue;
    for (const domain of domains) expanded[domain] = Math.max(expanded[domain] ?? 0, value);
  }
  return expanded;
}
