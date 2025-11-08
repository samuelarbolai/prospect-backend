import { calculateCost, PRICING_CONFIG } from "./index.js";

describe("Pricing calculations", () => {
  test("calculates cost for single organization", () => {
    const cost = calculateCost(1);
    const expected = PRICING_CONFIG.BASE_COST * (1 + PRICING_CONFIG.MARKUP);
    expect(cost).toBe(Math.round(expected * 100) / 100);
  });

  test("calculates cost for multiple organizations", () => {
    const cost = calculateCost(3);
    const baseCost = PRICING_CONFIG.BASE_COST;
    const additionalCost = 2 * PRICING_CONFIG.ADDITIONAL_ORG_COST;
    const expected = (baseCost + additionalCost) * (1 + PRICING_CONFIG.MARKUP);
    expect(cost).toBe(Math.round(expected * 100) / 100);
  });

  test("handles zero organizations", () => {
    const cost = calculateCost(0);
    const expected = PRICING_CONFIG.BASE_COST * (1 + PRICING_CONFIG.MARKUP);
    expect(cost).toBe(Math.round(expected * 100) / 100);
  });

  test("validates pricing configuration", () => {
    expect(PRICING_CONFIG.BASE_COST).toBeGreaterThan(0);
    expect(PRICING_CONFIG.ADDITIONAL_ORG_COST).toBeGreaterThan(0);
    expect(PRICING_CONFIG.MARKUP).toBeGreaterThanOrEqual(0);
  });

  test("cost calculation is deterministic", () => {
    const cost1 = calculateCost(5);
    const cost2 = calculateCost(5);
    expect(cost1).toBe(cost2);
  });
});
