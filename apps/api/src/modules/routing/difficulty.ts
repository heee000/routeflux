export type DifficultyTier = "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING";

export interface DifficultyDimension {
  name: string;
  score: number;
  signal: string | null;
}

export interface DifficultyResult {
  score: number;
  tier: DifficultyTier;
  dimensions: DifficultyDimension[];
  signals: string[];
}

const KEYWORDS = {
  codePresence: ["function", "class", "import", "def", "select", "async", "await", "```", "函数", "类", "代码", "异步"],
  reasoningMarkers: ["prove", "theorem", "derive", "step by step", "proof", "logically", "证明", "定理", "推导", "逐步", "逻辑"],
  technicalTerms: ["algorithm", "optimize", "architecture", "distributed", "kubernetes", "database", "算法", "优化", "架构", "分布式", "数据库"],
  creativeMarkers: ["story", "poem", "creative", "imagine", "故事", "诗", "创作", "创意", "想象"],
  simpleIndicators: ["what is", "define", "hello", "yes or no", "capital of", "什么是", "定义", "你好", "是否", "首都"],
  imperativeVerbs: ["build", "create", "implement", "design", "develop", "deploy", "构建", "创建", "实现", "设计", "开发", "部署"],
  constraintCount: ["at most", "at least", "within", "maximum", "minimum", "limit", "budget", "不超过", "至少", "最多", "限制", "预算"],
  outputFormat: ["json", "yaml", "xml", "table", "csv", "markdown", "schema", "表格", "格式化", "结构化"],
  referenceComplexity: ["above", "below", "previous", "the docs", "the code", "attached", "上面", "下面", "之前", "文档", "代码", "附件"],
  negationComplexity: ["don't", "do not", "avoid", "never", "without", "except", "不要", "避免", "从不", "没有", "除了"],
  domainSpecificity: ["quantum", "fpga", "vlsi", "genomics", "topological", "homomorphic", "量子", "光子学", "基因组学", "拓扑", "同态"]
} as const;

const WEIGHTS: Record<string, number> = {
  tokenCount: 0.08,
  codePresence: 0.15,
  reasoningMarkers: 0.20,
  technicalTerms: 0.10,
  creativeMarkers: 0.03,
  simpleIndicators: 0.05,
  multiStepPatterns: 0.10,
  questionComplexity: 0.05,
  imperativeVerbs: 0.05,
  constraintCount: 0.06,
  outputFormat: 0.05,
  referenceComplexity: 0.03,
  negationComplexity: 0.02,
  domainSpecificity: 0.03
};

function matchCount(text: string, keywords: readonly string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword)).length;
}

function dimension(
  name: string,
  count: number,
  lowThreshold: number,
  highThreshold: number,
  lowScore: number,
  highScore: number
): DifficultyDimension {
  if (count >= highThreshold) return { name, score: highScore, signal: `${name}:${count}` };
  if (count >= lowThreshold) return { name, score: lowScore, signal: `${name}:${count}` };
  return { name, score: 0, signal: null };
}

function tokenDimension(tokens: number): DifficultyDimension {
  if (tokens < 50) return { name: "tokenCount", score: -0.8, signal: "tokenCount:very_short" };
  if (tokens < 100) return { name: "tokenCount", score: -0.4, signal: "tokenCount:short" };
  if (tokens > 500) return { name: "tokenCount", score: 0.8, signal: "tokenCount:long" };
  if (tokens > 200) return { name: "tokenCount", score: 0.4, signal: "tokenCount:medium_long" };
  return { name: "tokenCount", score: 0, signal: null };
}

function tierFor(score: number): DifficultyTier {
  if (score < 0.05) return "SIMPLE";
  if (score < 0.30) return "MEDIUM";
  if (score < 0.55) return "COMPLEX";
  return "REASONING";
}

export function analyzeDifficulty(text: string, promptTokens: number): DifficultyResult {
  const lower = text.toLowerCase();
  const multiStepCount = [
    /first[\s\S]{0,80}then/i,
    /step\s*\d/i,
    /第[一二三四五六七八九十]+步/,
    /首先[\s\S]{0,80}(然后|其次|最后)/
  ].filter((pattern) => pattern.test(text)).length;
  const questionCount = (text.match(/[?？]/g) ?? []).length;
  const dimensions: DifficultyDimension[] = [
    tokenDimension(promptTokens),
    dimension("codePresence", matchCount(lower, KEYWORDS.codePresence), 1, 2, 0.5, 1),
    dimension("reasoningMarkers", matchCount(lower, KEYWORDS.reasoningMarkers), 1, 2, 0.7, 1),
    dimension("technicalTerms", matchCount(lower, KEYWORDS.technicalTerms), 2, 4, 0.5, 1),
    dimension("creativeMarkers", matchCount(lower, KEYWORDS.creativeMarkers), 1, 2, 0.3, 0.5),
    dimension("simpleIndicators", matchCount(lower, KEYWORDS.simpleIndicators), 1, 2, -0.8, -0.8),
    dimension("multiStepPatterns", multiStepCount, 1, 2, 0.5, 0.8),
    dimension("questionComplexity", questionCount, 3, 5, 0.5, 0.8),
    dimension("imperativeVerbs", matchCount(lower, KEYWORDS.imperativeVerbs), 1, 2, 0.3, 0.5),
    dimension("constraintCount", matchCount(lower, KEYWORDS.constraintCount), 1, 3, 0.3, 0.6),
    dimension("outputFormat", matchCount(lower, KEYWORDS.outputFormat), 1, 2, 0.3, 0.5),
    dimension("referenceComplexity", matchCount(lower, KEYWORDS.referenceComplexity), 1, 2, 0.3, 0.5),
    dimension("negationComplexity", matchCount(lower, KEYWORDS.negationComplexity), 2, 3, 0.3, 0.5),
    dimension("domainSpecificity", matchCount(lower, KEYWORDS.domainSpecificity), 1, 2, 0.5, 0.8)
  ];
  const positive = dimensions.reduce((total, item) => {
    return total + Math.max(0, item.score * (WEIGHTS[item.name] ?? 0));
  }, 0);
  const negative = dimensions.reduce((total, item) => {
    return total + Math.min(0, item.score * (WEIGHTS[item.name] ?? 0));
  }, 0);
  // Preserve DomainRouter's signed dimensions while calibrating ordinary implementation tasks
  // into MEDIUM instead of collapsing most non-reasoning prompts into SIMPLE.
  let score = 0.08 + positive * 2.2 + negative;
  if (matchCount(lower, KEYWORDS.reasoningMarkers) >= 2) score = Math.max(score, 0.55);
  score = Math.max(0, Math.min(1, score));
  return {
    score,
    tier: tierFor(score),
    dimensions,
    signals: dimensions.flatMap((item) => item.signal ? [item.signal] : [])
  };
}
