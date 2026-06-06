/**
 * AI Model Pricing Table (per 1M tokens, USD)
 *
 * Sourced from AI Model Registry (@toon v1.0) as of 2026-06-07 in https://sumopod.com/dashboard/ai/models.
 * Prices use final (post-discount) values where discounts are active.
 * Add new models here as they're introduced via config `AI_EXTRACTION_MODEL`.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // ── Alibaba ─────────────────────────────────────────────────────────────────
  "qwen3.6-flash": { input: 0.25, output: 1.5 }, // discount expired 2026-06-01
  "qwen3.6-plus": { input: 0.5, output: 3.0 }, // discount expired 2026-06-01
  "qwen3.7-max": { input: 1.25, output: 3.75 }, // 50% discount until 2026-06-15

  // ── Anthropic ───────────────────────────────────────────────────────────────
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },

  // ── Byteplus ────────────────────────────────────────────────────────────────
  "deepseek-v3-2": { input: 0.28, output: 0.42 },
  "glm-4-7": { input: 0.6, output: 2.2 },
  "seed-2-0-code": { input: 0.5, output: 3.0 },
  "seed-2-0-lite": { input: 0.25, output: 2.0 },
  "seed-2-0-mini": { input: 0.1, output: 0.4 },
  "seed-2-0-pro": { input: 0.5, output: 3.0 },

  // ── DeepSeek ────────────────────────────────────────────────────────────────
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "deepseek-v4-pro": { input: 0.43, output: 0.87 }, // 75% discount active

  // ── Gemini ──────────────────────────────────────────────────────────────────
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "gemini-3-flash-preview": { input: 0.5, output: 3.0 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.1-pro-preview": { input: 2.0, output: 12.0 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },

  // ── Mimo ────────────────────────────────────────────────────────────────────
  "mimo-v2.5": { input: 0.14, output: 0.28 },
  "mimo-v2.5-pro": { input: 0.43, output: 0.87 },

  // ── MiniMax ─────────────────────────────────────────────────────────────────
  "MiniMax-M2.7-highspeed": { input: 0.02, output: 0.06 }, // 80% discount active
  "MiniMax-M3": { input: 0.3, output: 1.2 }, // 50% discount active

  // ── Moonshot ────────────────────────────────────────────────────────────────
  "kimi-k2.6": { input: 0.08, output: 0.35 }, // 90% discount active

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5.1": { input: 1.25, output: 10.0 },
  "gpt-5.1-codex": { input: 1.25, output: 10.0 },
  "gpt-5.1-codex-mini": { input: 0.25, output: 2.0 },
  "gpt-5.2": { input: 1.75, output: 14.0 },
  "gpt-5.2-codex": { input: 1.75, output: 14.0 },
  "gpt-5.3-codex": { input: 1.75, output: 14.0 },
  "gpt-5.4": { input: 2.5, output: 15.0 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },

  // ── Sumopod ─────────────────────────────────────────────────────────────────
  "gemma-4-31b-it": { input: 0.12, output: 0.37 },
  "qwen3.6-27b": { input: 0.32, output: 3.2 },

  // ── Z.AI ────────────────────────────────────────────────────────────────────
  "glm-5": { input: 0.1, output: 0.32 }, // 90% discount active
  "glm-5-turbo": { input: 0.1, output: 0.32 }, // 90% discount active
  "glm-5.1": { input: 0.1, output: 0.32 }, // 90% discount active
};

/** Fallback pricing when model is unknown (defaults to gpt-4o-mini tier) */
const DEFAULT_PRICING = { input: 0.15, output: 0.6 };

/**
 * Compute estimated AI cost from token usage.
 *
 * @param inputTokens  — number of input (prompt) tokens
 * @param outputTokens — number of output (completion) tokens
 * @param model        — model identifier (e.g. "gpt-4o-mini")
 * @returns estimated cost in USD
 */
export function computeAiCost(
  inputTokens?: number,
  outputTokens?: number,
  model?: string,
): number {
  const pricing = MODEL_PRICING[model ?? ""] ?? DEFAULT_PRICING;
  const inCost = ((inputTokens ?? 0) / 1_000_000) * pricing.input;
  const outCost = ((outputTokens ?? 0) / 1_000_000) * pricing.output;
  return inCost + outCost;
}
