import { describe, expect, it } from "vitest";
import {
  EMPTY_LEARNING,
  applySpamCorrection,
  dayKeyOf,
  learningRate,
  precisionOf,
  recordAiCall,
  recordJudgedSpam,
  summarizeLearning,
  weeklyPrecision,
  type LearningState,
} from "../src/shared/learning.js";

const NOW = new Date("2026-11-16T12:00:00").getTime();

function fresh(): LearningState {
  return structuredClone(EMPTY_LEARNING);
}

describe("learningRate", () => {
  it("decays: 20% at 0, ~8.4% at 23, ~2.9% at 100", () => {
    expect(learningRate(0)).toBe(0.2);
    expect(Math.abs(learningRate(23) - 0.084)).toBeLessThan(0.002);
    expect(Math.abs(learningRate(100) - 0.029)).toBeLessThan(0.002);
  });
});

describe("applySpamCorrection", () => {
  it("moves sender/domain by rate-scaled deltas and counts the sample", () => {
    const state = fresh();
    const result = applySpamCorrection(state, {
      sender: "billing@cloud.example",
      domain: "cloud.example",
      isSpam: false,
      wasJudgedSpam: true,
      now: NOW,
    });
    // At 0 samples the rate is 20%: sender delta = 180 * 0.2 = 36 (cap), domain = 60 * 0.2 = 12.
    expect(result.senderDelta).toBe(-36);
    expect(result.domainDelta).toBe(-12);
    expect(state.senderAdjust["billing@cloud.example"]).toBe(-36);
    expect(state.domainAdjust["cloud.example"]).toBe(-12);
    expect(state.corrections).toBe(1);
    expect(state.days[dayKeyOf(NOW)].overturned).toBe(1);
  });

  it("clamps sender within ±40 and domain within ±15", () => {
    const state = fresh();
    for (let i = 0; i < 6; i++) {
      applySpamCorrection(state, { sender: "a@b.example", domain: "b.example", isSpam: true, wasJudgedSpam: false, now: NOW });
    }
    expect(state.senderAdjust["a@b.example"]).toBeLessThanOrEqual(40);
    expect(state.domainAdjust["b.example"]).toBeLessThanOrEqual(15);
  });
});

describe("precisionOf", () => {
  it("is null below 5 judged, then 1 - overturned/judged", () => {
    const state = fresh();
    for (let i = 0; i < 4; i++) recordJudgedSpam(state, NOW);
    expect(precisionOf(state).value).toBeNull();
    for (let i = 0; i < 8; i++) recordJudgedSpam(state, NOW);
    for (let i = 0; i < 3; i++) {
      applySpamCorrection(state, { sender: "x@y.example", domain: "y.example", isSpam: false, wasJudgedSpam: true, now: NOW });
    }
    const precision = precisionOf(state);
    expect(precision.judged).toBe(12);
    expect(precision.overturned).toBe(3);
    expect(precision.value).toBe(0.75);
  });
});

describe("recordAiCall / summarizeLearning", () => {
  it("accumulates today's calls, changes and average latency", () => {
    const state = fresh();
    recordAiCall(state, { changed: true, ms: 2000, now: NOW });
    recordAiCall(state, { changed: false, ms: 1000, now: NOW });
    const summary = summarizeLearning(state, NOW);
    expect(summary.aiToday.calls).toBe(2);
    expect(summary.aiToday.changed).toBe(1);
    expect(summary.aiToday.avgMs).toBe(1500);
  });
});

describe("weeklyPrecision", () => {
  it("returns 4 buckets, null when a week has too few judged", () => {
    const state = fresh();
    for (let i = 0; i < 10; i++) recordJudgedSpam(state, NOW);
    const weeks = weeklyPrecision(state, NOW);
    expect(weeks).toHaveLength(4);
    expect(weeks[3].value).toBe(100);
    expect(weeks[0].value).toBeNull();
  });
});
