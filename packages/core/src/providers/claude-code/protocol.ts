// Wire protocol Beaver expects from the Claude Code CLI's structured
// output stream (one JSON event per stdout line).
//
// v0.1 covers the minimum set the orchestrator needs to drive a run:
// streamed text, tool calls and their results, per-turn token usage,
// and a stop sentinel. Real Claude Code emits a richer stream; the
// adapter ignores any unknown `type` values.

import { z } from 'zod';

export const ClaudeMessageDeltaSchema = z.object({
  type: z.literal('message_delta'),
  text: z.string(),
});

export const ClaudeToolUseSchema = z.object({
  type: z.literal('tool_use'),
  name: z.string().min(1),
  input: z.unknown().optional(),
});

export const ClaudeToolResultSchema = z.object({
  type: z.literal('tool_result'),
  name: z.string().min(1),
  output: z.string(),
  isError: z.boolean().optional(),
});

export const ClaudeUsageSchema = z.object({
  type: z.literal('usage'),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  /** Phase 8 — Anthropic prompt cache hits (input tokens served from cache). */
  cachedInputTokens: z.number().int().nonnegative().optional(),
  model: z.string().min(1),
});

export const ClaudeStopSchema = z.object({
  type: z.literal('stop'),
  reason: z.string().optional(),
});

export const ClaudeStreamEventSchema = z.discriminatedUnion('type', [
  ClaudeMessageDeltaSchema,
  ClaudeToolUseSchema,
  ClaudeToolResultSchema,
  ClaudeUsageSchema,
  ClaudeStopSchema,
]);
export type ClaudeStreamEvent = z.infer<typeof ClaudeStreamEventSchema>;
