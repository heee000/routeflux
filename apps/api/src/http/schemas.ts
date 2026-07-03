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
  response_format: z.object({ type: z.string() }).passthrough().optional()
}).passthrough();

