import { z } from "zod";

const contentPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  image_url: z.unknown().optional()
}).passthrough();

const messageSchema = z.object({
  role: z.string(),
  content: z.union([z.string(), z.array(contentPartSchema), z.null()])
}).passthrough();

export const chatCompletionSchema = z.object({
  model: z.string().min(1),
  messages: z.array(messageSchema).min(1),
  stream: z.boolean().default(false),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  tools: z.array(z.unknown()).optional(),
  response_format: z.object({ type: z.string() }).passthrough().optional(),
  routing: z.object({
    max_cost_usd: z.number().positive().optional(),
    max_latency_ms: z.number().int().positive().optional(),
    min_quality: z.number().min(0).max(1).optional(),
    domains: z.array(z.string().min(1)).max(8).optional(),
    token_budget: z.union([z.literal("dynamic"), z.number().int().positive()]).optional(),
    trace: z.boolean().optional()
  }).optional()
}).passthrough();

export const feedbackSchema = z.object({
  request_id: z.string().uuid(),
  score: z.number().min(0).max(1),
  category: z.string().min(1).max(80).optional(),
  comment: z.string().max(2000).optional()
});
