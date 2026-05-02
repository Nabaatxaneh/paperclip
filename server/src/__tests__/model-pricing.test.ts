import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeTokenCostCents,
  resetModelPricingCache,
  resolveModelRate,
} from "../services/model-pricing.ts";

vi.mock("../middleware/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("model-pricing", () => {
  const originalEnv = process.env.PAPERCLIP_MODEL_PRICING_JSON;

  beforeEach(() => {
    delete process.env.PAPERCLIP_MODEL_PRICING_JSON;
    resetModelPricingCache();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PAPERCLIP_MODEL_PRICING_JSON;
    } else {
      process.env.PAPERCLIP_MODEL_PRICING_JSON = originalEnv;
    }
    resetModelPricingCache();
  });

  it("returns 0 cents when there is no usage", () => {
    expect(
      computeTokenCostCents("claude-opus-4-7", {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0);
  });

  it("computes cents from token usage for a known model", () => {
    // claude-opus-4-7 default rates: 1500 / 150 / 7500 cents per million.
    // 1M input + 1M output should be 1500 + 7500 = 9000 cents.
    const cents = computeTokenCostCents("claude-opus-4-7", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    });
    expect(cents).toBe(9000);
  });

  it("uses the default rate for an unknown model", () => {
    const known = computeTokenCostCents("claude-opus-4-7", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    const unknown = computeTokenCostCents("unknown-model-x", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    expect(known).toBeGreaterThan(0);
    expect(unknown).toBeGreaterThan(0);
    // default rate is 300 cents/M input.
    expect(unknown).toBe(300);
  });

  it("floors non-zero usage at 1 cent so heartbeats are visibly tracked", () => {
    const cents = computeTokenCostCents("claude-haiku-4-5", {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    // 100 * 80 / 1_000_000 = 0.008 -> rounds to 0 -> floored to 1.
    expect(cents).toBe(1);
  });

  it("model id matching is case-insensitive", () => {
    const lower = computeTokenCostCents("claude-opus-4-7", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    const upper = computeTokenCostCents("CLAUDE-OPUS-4-7", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    expect(upper).toBe(lower);
  });

  it("env override merges into default table", () => {
    process.env.PAPERCLIP_MODEL_PRICING_JSON = JSON.stringify({
      models: {
        "custom-model-1": {
          inputCentsPerMillion: 500,
          cachedInputCentsPerMillion: 50,
          outputCentsPerMillion: 2500,
        },
      },
    });
    resetModelPricingCache();

    const rate = resolveModelRate("custom-model-1");
    expect(rate.inputCentsPerMillion).toBe(500);
    expect(rate.outputCentsPerMillion).toBe(2500);

    // Existing models still resolve.
    const opus = resolveModelRate("claude-opus-4-7");
    expect(opus.outputCentsPerMillion).toBe(7500);
  });

  it("malformed env override falls back to defaults without throwing", () => {
    process.env.PAPERCLIP_MODEL_PRICING_JSON = "{ this is not json";
    resetModelPricingCache();

    const cents = computeTokenCostCents("claude-opus-4-7", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
    });
    expect(cents).toBe(1500);
  });
});
