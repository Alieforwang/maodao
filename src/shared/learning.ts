/**
 * Learning layer: the user's corrections become sender/domain score memory.
 * The learning rate decays as samples accumulate, so early corrections teach
 * fast and later ones nudge gently. All metrics shown in the UI are computed
 * here from the same state, so what the user sees is what the scorer does.
 */

export interface LearningDay {
  aiCalls: number;
  aiChanged: number;
  aiMsTotal: number;
  corrections: number;
  judgedSpam: number;
  overturned: number;
}

export interface LearningState {
  /** Total user corrections (== learning samples). */
  corrections: number;
  /** Learned score offsets per exact sender address (negative = trusted). */
  senderAdjust: Record<string, number>;
  /** Learned score offsets per sender domain. */
  domainAdjust: Record<string, number>;
  days: Record<string, LearningDay>;
}

export const EMPTY_LEARNING: LearningState = { corrections: 0, senderAdjust: {}, domainAdjust: {}, days: {} };

export const AI_DAILY_LIMIT = 30;
export const GRAY_ZONE_MIN = 40;
export const GRAY_ZONE_MAX = 69;
export const LEARNING_GOAL = 100;

export function emptyDay(): LearningDay {
  return { aiCalls: 0, aiChanged: 0, aiMsTotal: 0, corrections: 0, judgedSpam: 0, overturned: 0 };
}

export function dayKeyOf(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 20% at 0 samples, ≈8.4% at 23, ≈2.9% at 100. */
export function learningRate(samples: number): number {
  return 0.2 * (16.7 / (16.7 + Math.max(0, samples)));
}

export function learningProgress(samples: number): number {
  return Math.min(LEARNING_GOAL, Math.max(0, samples));
}

/** One "not spam" correction at the current rate moves the sender by this much. */
export function senderDeltaFor(rate: number): number {
  return Math.max(3, Math.min(36, Math.round(180 * rate)));
}

export function domainDeltaFor(rate: number): number {
  return Math.max(1, Math.min(12, Math.round(60 * rate)));
}

function clampAdjust(value: number, cap: number): number {
  return Math.max(-cap, Math.min(cap, value));
}

/**
 * Apply one spam/ham correction to the learning state (mutates and returns it).
 * isSpam=true means the user says this mail IS junk; false means it is not.
 */
export function applySpamCorrection(
  state: LearningState,
  input: { sender: string; domain: string; isSpam: boolean; wasJudgedSpam: boolean; now: number },
): { senderDelta: number; domainDelta: number; rate: number } {
  const rate = learningRate(state.corrections);
  const sign = input.isSpam ? 1 : -1;
  const senderDelta = sign * senderDeltaFor(rate);
  const domainDelta = sign * domainDeltaFor(rate);
  if (input.sender) {
    state.senderAdjust[input.sender] = clampAdjust((state.senderAdjust[input.sender] || 0) + senderDelta, 40);
  }
  if (input.domain) {
    state.domainAdjust[input.domain] = clampAdjust((state.domainAdjust[input.domain] || 0) + domainDelta, 15);
  }
  state.corrections += 1;
  const key = dayKeyOf(input.now);
  const day = (state.days[key] ||= emptyDay());
  day.corrections += 1;
  if (input.wasJudgedSpam && !input.isSpam) day.overturned += 1;
  pruneDays(state, input.now);
  return { senderDelta, domainDelta, rate };
}

export function recordJudgedSpam(state: LearningState, now: number): void {
  const day = (state.days[dayKeyOf(now)] ||= emptyDay());
  day.judgedSpam += 1;
  pruneDays(state, now);
}

export function recordAiCall(state: LearningState, input: { changed: boolean; ms: number; now: number }): void {
  const day = (state.days[dayKeyOf(input.now)] ||= emptyDay());
  day.aiCalls += 1;
  if (input.changed) day.aiChanged += 1;
  day.aiMsTotal += Math.max(0, Math.round(input.ms));
  pruneDays(state, input.now);
}

export function pruneDays(state: LearningState, now: number): void {
  const keys = Object.keys(state.days).sort();
  const cutoff = dayKeyOf(now - 40 * 86_400_000);
  for (const key of keys) {
    if (key < cutoff) delete state.days[key];
  }
}

export interface PrecisionInfo {
  judged: number;
  overturned: number;
  /** null while judged < 5 — the UI shows “样本不足”. */
  value: number | null;
}

export function precisionOf(state: LearningState): PrecisionInfo {
  let judged = 0;
  let overturned = 0;
  for (const day of Object.values(state.days)) {
    judged += day.judgedSpam;
    overturned += day.overturned;
  }
  return { judged, overturned, value: judged >= 5 ? Math.max(0, 1 - overturned / judged) : null };
}

/** Weekly precision buckets for the trend chart, oldest first, up to 4 weeks. */
export function weeklyPrecision(state: Pick<LearningState, "days">, now: number): Array<{ label: string; value: number | null }> {
  const weeks: Array<{ label: string; value: number | null }> = [];
  for (let back = 3; back >= 0; back--) {
    const end = now - back * 7 * 86_400_000;
    const start = end - 7 * 86_400_000;
    let judged = 0;
    let overturned = 0;
    for (const [key, day] of Object.entries(state.days)) {
      const at = new Date(`${key}T12:00:00`).getTime();
      if (at > start && at <= end) {
        judged += day.judgedSpam;
        overturned += day.overturned;
      }
    }
    weeks.push({ label: `第${4 - back}周`, value: judged >= 3 ? Math.round((1 - overturned / judged) * 100) : null });
  }
  return weeks;
}

export interface LearningSummary {
  corrections: number;
  rate: number;
  progress: number;
  goal: number;
  precision: PrecisionInfo;
  aiToday: { calls: number; changed: number; avgMs: number };
  days: Record<string, LearningDay>;
}

export function summarizeLearning(state: LearningState, now: number): LearningSummary {
  const today = state.days[dayKeyOf(now)] || emptyDay();
  return {
    corrections: state.corrections,
    rate: learningRate(state.corrections),
    progress: learningProgress(state.corrections),
    goal: LEARNING_GOAL,
    precision: precisionOf(state),
    aiToday: {
      calls: today.aiCalls,
      changed: today.aiChanged,
      avgMs: today.aiCalls ? Math.round(today.aiMsTotal / today.aiCalls) : 0,
    },
    days: state.days,
  };
}
