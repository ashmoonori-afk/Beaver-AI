// Wire protocol Beaver expects from the Codex CLI's structured output
// stream (one JSON event per stdout line).
//
// Same shape as ClaudeCodeAdapter for v0.1 — a real Codex CLI is not
// hooked up yet, so the mock fixture defines the wire format. The
// adapter ignores any unknown `type` values to stay forward-compatible
// with a richer real CLI.

import { z } from 'zod';

export const CodexOutputDeltaSchema = z.object({
  type: z.literal('output_delta'),
  text: z.string(),
});

export const CodexToolCallSchema = z.object({
  type: z.literal('tool_call'),
  name: z.string().min(1),
  arguments: z.unknown().optional(),
});

export const CodexToolOutputSchema = z.object({
  type: z.literal('tool_output'),
  name: z.string().min(1),
  content: z.string(),
  isError: z.boolean().optional(),
});

export const CodexUsageSchema = z.object({
  type: z.literal('usage'),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  model: z.string().min(1),
});

export const CodexDoneSchema = z.object({
  type: z.literal('done'),
  reason: z.string().optional(),
});

export const CodexStreamEventSchema = z.discriminatedUnion('type', [
  CodexOutputDeltaSchema,
  CodexToolCallSchema,
  CodexToolOutputSchema,
  CodexUsageSchema,
  CodexDoneSchema,
]);
export type CodexStreamEvent = z.infer<typeof CodexStreamEventSchema>;
