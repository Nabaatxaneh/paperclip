import { logger } from "../middleware/logger.js";

export interface ModelRate {
  inputCentsPerMillion: number;
  cachedInputCentsPerMillion: number;
  outputCentsPerMillion: number;
}

export interface ModelPricingTable {
  default: ModelRate;
  models: Record<string, ModelRate>;
}

export interface UsageInput {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

// Public-list reference rates, expressed in cents per million tokens.
// These are starter values for adapters that report token usage but no
// $-amount (e.g. Claude Code on a subscription, where total_cost_usd is 0
// or omitted). They produce an API-equivalent spend signal so budgets and
// cost reports are not silently zero. Override at runtime by setting the
// env var PAPERCLIP_MODEL_PRICING_JSON to a JSON object of the same shape.
const DEFAULT_PRICING: ModelPricingTable = {
  // unknown/unmapped models fall back to mid-tier rates.
  default: {
    inputCentsPerMillion: 300,
    cachedInputCentsPerMillion: 30,
    outputCentsPerMillion: 1500,
  },
  models: {
    "claude-opus-4-7": {
      inputCentsPerMillion: 1500,
      cachedInputCentsPerMillion: 150,
      outputCentsPerMillion: 7500,
    },
    "claude-opus-4-6": {
      inputCentsPerMillion: 1500,
      cachedInputCentsPerMillion: 150,
      outputCentsPerMillion: 7500,
    },
    "claude-opus-4-5": {
      inputCentsPerMillion: 1500,
      cachedInputCentsPerMillion: 150,
      outputCentsPerMillion: 7500,
    },
    "claude-sonnet-4-6": {
      inputCentsPerMillion: 300,
      cachedInputCentsPerMillion: 30,
      outputCentsPerMillion: 1500,
    },
    "claude-sonnet-4-5": {
      inputCentsPerMillion: 300,
      cachedInputCentsPerMillion: 30,
      outputCentsPerMillion: 1500,
    },
    "claude-haiku-4-5": {
      inputCentsPerMillion: 80,
      cachedInputCentsPerMillion: 8,
      outputCentsPerMillion: 400,
    },
  },
};

let cached: ModelPricingTable | null = null;

function isModelRate(value: unknown): value is ModelRate {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.inputCentsPerMillion === "number" &&
    Number.isFinite(candidate.inputCentsPerMillion) &&
    typeof candidate.cachedInputCentsPerMillion === "number" &&
    Number.isFinite(candidate.cachedInputCentsPerMillion) &&
    typeof candidate.outputCentsPerMillion === "number" &&
    Number.isFinite(candidate.outputCentsPerMillion)
  );
}

function mergePricing(base: ModelPricingTable, override: unknown): ModelPricingTable {
  if (typeof override !== "object" || override === null) return base;
  const obj = override as Record<string, unknown>;
  const next: ModelPricingTable = {
    default: isModelRate(obj.default) ? obj.default : base.default,
    models: { ...base.models },
  };
  if (typeof obj.models === "object" && obj.models !== null) {
    for (const [key, rate] of Object.entries(obj.models as Record<string, unknown>)) {
      if (isModelRate(rate)) {
        next.models[key.toLowerCase()] = rate;
      }
    }
  }
  return next;
}

function loadPricing(): ModelPricingTable {
  if (cached) return cached;
  const raw = process.env.PAPERCLIP_MODEL_PRICING_JSON;
  if (raw && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      cached = mergePricing(DEFAULT_PRICING, parsed);
      return cached;
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "PAPERCLIP_MODEL_PRICING_JSON could not be parsed; falling back to defaults",
      );
    }
  }
  cached = DEFAULT_PRICING;
  return cached;
}

export function resetModelPricingCache(): void {
  cached = null;
}

export function resolveModelRate(model: string | null | undefined): ModelRate {
  const table = loadPricing();
  const key = (model ?? "").trim().toLowerCase();
  if (!key) return table.default;
  return table.models[key] ?? table.default;
}

/**
 * Convert token usage to cents using the configured per-model rates.
 *
 * Returns 0 only when there is no usage at all. When usage is non-zero
 * but the computed amount would round to 0 cents (e.g. a tiny prompt on
 * a cheap model), we floor at 1 cent so the heartbeat is visibly tracked
 * in month-to-date spend rather than silently dropped.
 */
export function computeTokenCostCents(
  model: string | null | undefined,
  usage: UsageInput,
): number {
  const inputTokens = Math.max(0, Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0);
  const cachedInputTokens = Math.max(
    0,
    Number.isFinite(usage.cachedInputTokens) ? usage.cachedInputTokens : 0,
  );
  const outputTokens = Math.max(
    0,
    Number.isFinite(usage.outputTokens) ? usage.outputTokens : 0,
  );
  if (inputTokens <= 0 && cachedInputTokens <= 0 && outputTokens <= 0) return 0;

  const rate = resolveModelRate(model);
  const cents =
    (inputTokens * rate.inputCentsPerMillion +
      cachedInputTokens * rate.cachedInputCentsPerMillion +
      outputTokens * rate.outputCentsPerMillion) /
    1_000_000;
  if (!Number.isFinite(cents) || cents <= 0) return 1;
  return Math.max(1, Math.round(cents));
}
