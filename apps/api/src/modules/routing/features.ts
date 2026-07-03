import { estimateMessageTokens, estimateTextTokens } from "./estimate.js";
import type { TaskFeatures } from "./types.js";

export const DOMAIN_NAMES = ["coding", "math", "science", "business", "writing", "law", "medicine", "general"] as const;

type DomainName = (typeof DOMAIN_NAMES)[number];

const DOMAIN_PATTERNS: Record<DomainName, RegExp[]> = {
  coding: [
    /\b(code|debug|function|class|api|sql|typescript|javascript|python|java|rust|docker|git|regex|database)\b/gi,
    /(代码|编程|报错|调试|接口|数据库|函数|算法|前端|后端|部署)/g,
    /```[\s\S]*?```/g
  ],
  math: [
    /\b(proof|theorem|equation|integral|derivative|matrix|probability|calculate|algebra|geometry)\b/gi,
    /(证明|定理|方程|积分|导数|矩阵|概率|计算|代数|几何)/g,
    /[∑∫√≈≠≤≥]|\$[^$]+\$/g
  ],
  science: [
    /\b(physics|chemistry|biology|experiment|hypothesis|molecule|quantum|scientific|research)\b/gi,
    /(物理|化学|生物|实验|假设|分子|量子|科研|论文)/g
  ],
  business: [
    /\b(market|finance|revenue|strategy|customer|investment|pricing|sales|economics)\b/gi,
    /(市场|金融|营收|战略|客户|投资|定价|销售|经济)/g
  ],
  writing: [
    /\b(write|rewrite|story|essay|copywriting|translate|summary|speech|tone)\b/gi,
    /(写作|改写|故事|文章|文案|翻译|总结|演讲稿|语气)/g
  ],
  law: [
    /\b(law|legal|contract|statute|regulation|compliance|court|liability)\b/gi,
    /(法律|合同|法规|合规|法院|责任|条款)/g
  ],
  medicine: [
    /\b(medical|medicine|clinical|diagnosis|treatment|patient|disease|drug|symptom)\b/gi,
    /(医学|临床|诊断|治疗|患者|疾病|药物|症状)/g
  ],
  general: []
};

function messageText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  const parts: string[] = [];
  for (const value of messages) {
    if (!value || typeof value !== "object") continue;
    const content = (value as Record<string, unknown>).content;
    if (typeof content === "string") parts.push(content);
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
          parts.push((part as Record<string, unknown>).text as string);
        }
      }
    }
  }
  return parts.join("\n");
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function matchCount(text: string, patterns: RegExp[]): number {
  return patterns.reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
}

function domainVector(text: string, hints: string[] = []): Record<string, number> {
  const raw: Record<string, number> = {};
  for (const domain of DOMAIN_NAMES) {
    raw[domain] = domain === "general" ? 0.25 : matchCount(text, DOMAIN_PATTERNS[domain]);
  }
  for (const hint of hints) {
    const normalized = hint.trim().toLowerCase();
    if (normalized in raw) raw[normalized] = (raw[normalized] ?? 0) + 3;
  }
  const magnitude = Math.sqrt(Object.values(raw).reduce((sum, value) => sum + value * value, 0)) || 1;
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, value / magnitude]));
}

function predictDifficulty(text: string, promptTokens: number, toolCount: number): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0.12 + Math.min(0.22, Math.log10(promptTokens + 1) * 0.07);
  const reasoning = matchCount(text, [
    /\b(prove|derive|analyze|reason|optimize|architecture|trade-?off|step by step|root cause)\b/gi,
    /(证明|推导|分析|推理|优化|架构|权衡|逐步|根因|深入)/g
  ]);
  if (reasoning) {
    score += Math.min(0.25, reasoning * 0.045);
    signals.push("reasoning");
  }
  const codeBlocks = (text.match(/```/g)?.length ?? 0) / 2;
  if (codeBlocks) {
    score += Math.min(0.15, codeBlocks * 0.05);
    signals.push("code");
  }
  const formulas = matchCount(text, [/[∑∫√≈≠≤≥]/g, /\$[^$]+\$/g]);
  if (formulas) {
    score += Math.min(0.18, formulas * 0.035);
    signals.push("formal_math");
  }
  const constraints = matchCount(text, [
    /\b(must|without|at least|at most|constraint|requirement|simultaneously)\b/gi,
    /(必须|不能|至少|至多|约束|要求|同时)/g
  ]);
  if (constraints >= 2) {
    score += Math.min(0.14, constraints * 0.02);
    signals.push("multi_constraint");
  }
  if (toolCount) {
    score += Math.min(0.12, toolCount * 0.03);
    signals.push("tools");
  }
  return { score: clamp(score, 0.05, 0.98), signals };
}

function predictOutputTokens(text: string, promptTokens: number, primaryDomain: string, difficulty: number): number {
  const concise = /(简短|简洁|一句话|只回答|brief|concise|one sentence|short answer)/i.test(text);
  const exhaustive = /(完整|详细|深入|全面|逐步|报告|论文|教程|complete|detailed|comprehensive|in-depth|tutorial|report)/i.test(text);
  if (concise) return 192;
  let predicted = 320 + promptTokens * 0.18 + difficulty * 700;
  if (primaryDomain === "coding") predicted += 280;
  if (primaryDomain === "writing") predicted += 360;
  if (exhaustive) predicted *= 1.65;
  const explicit = text.match(/(?:约|大约|不超过|within|about|around)\s*(\d{2,5})\s*(?:字|词|words?|tokens?)/i);
  if (explicit?.[1]) {
    const amount = Number(explicit[1]);
    if (/字|词|words?/i.test(explicit[0])) predicted = amount * 1.5;
    else predicted = amount;
  }
  return Math.round(clamp(predicted, 128, 8192));
}

export function extractTaskFeatures(
  messages: unknown,
  tools: unknown[] = [],
  domainHints: string[] = []
): TaskFeatures {
  const text = messageText(messages);
  const promptTokens = estimateMessageTokens(messages);
  const domains = domainVector(text, domainHints);
  const primaryDomain = Object.entries(domains).sort(([, left], [, right]) => right - left)[0]?.[0] ?? "general";
  const difficulty = predictDifficulty(text, promptTokens, tools.length);
  return {
    promptTokens,
    textTokens: estimateTextTokens(text),
    domainVector: domains,
    primaryDomain,
    difficulty: difficulty.score,
    predictedOutputTokens: predictOutputTokens(text, promptTokens, primaryDomain, difficulty.score),
    signals: difficulty.signals
  };
}

