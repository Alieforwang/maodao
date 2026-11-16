import type { HistoryItem, MailSummary } from "./types.js";
import { dayKeyOf } from "./learning.js";

export type StatsRange = 1 | 7 | 30;

export interface OverviewStats {
  /** Trend buckets: 24 hours for range=1, otherwise one per day. */
  series: Array<{ label: string; mails: number; codes: number }>;
  typeDist: Array<{ kind: string; count: number }>;
  accountCounts: Array<{ email: string; count: number }>;
  riskBuckets: number[];
  /** [dayIndex 0=6 days ago … 6=today, slotIndex 0=0–4 … 5=20–24, count] */
  heat: Array<[number, number, number]>;
  heatDays: string[];
  rangeMails: number;
  rangeCodes: number;
  todayMails: number;
  todayCodes: number;
  rangeSpammy: number;
  spamShare: number;
  prevMailsDelta: number | null;
  prevCodesDelta: number | null;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function typeBucket(mail: MailSummary): string {
  if (mail.classification === "code") return "验证码";
  switch (mail.contentKind) {
    case "important": return "重要通知";
    case "promo": return "推广";
    case "subscription": return "订阅";
    case "spammy": return "疑似垃圾";
    default: return "普通";
  }
}

export function computeOverviewStats(input: { mails: MailSummary[]; history: HistoryItem[]; range: StatsRange; now: number }): OverviewStats {
  const { mails, history, range, now } = input;
  const todayStart = startOfDay(now);
  const rangeStart = todayStart - (range - 1) * DAY_MS;
  const inRange = (at: number) => at >= rangeStart && at <= now;
  const rangeMailsList = mails.filter((mail) => inRange(mail.receivedAt));
  const rangeCodesList = history.filter((item) => inRange(item.receivedAt));

  // Trend series.
  const series: OverviewStats["series"] = [];
  if (range === 1) {
    for (let hour = 0; hour < 24; hour++) {
      const from = todayStart + hour * 3_600_000;
      series.push({
        label: `${hour}时`,
        mails: mails.filter((mail) => mail.receivedAt >= from && mail.receivedAt < from + 3_600_000).length,
        codes: history.filter((item) => item.receivedAt >= from && item.receivedAt < from + 3_600_000).length,
      });
    }
  } else {
    for (let back = range - 1; back >= 0; back--) {
      const dayStart = todayStart - back * DAY_MS;
      const key = dayKeyOf(dayStart);
      series.push({
        label: back === 0 ? "今天" : WEEKDAYS[new Date(dayStart).getDay()],
        mails: mails.filter((mail) => dayKeyOf(mail.receivedAt) === key).length,
        codes: history.filter((item) => dayKeyOf(item.receivedAt) === key).length,
      });
    }
  }

  // Type distribution (mutually exclusive buckets).
  const distMap = new Map<string, number>();
  for (const mail of rangeMailsList) distMap.set(typeBucket(mail), (distMap.get(typeBucket(mail)) || 0) + 1);
  const typeDist = ["验证码", "重要通知", "推广", "订阅", "疑似垃圾", "普通"]
    .map((kind) => ({ kind, count: distMap.get(kind) || 0 }))
    .filter((item) => item.count > 0);

  // Per-account counts.
  const accountMap = new Map<string, number>();
  for (const mail of rangeMailsList) accountMap.set(mail.email, (accountMap.get(mail.email) || 0) + 1);
  const accountCounts = [...accountMap.entries()].map(([email, count]) => ({ email, count })).sort((a, b) => a.count - b.count);

  // Risk histogram.
  const riskBuckets = [0, 0, 0, 0, 0, 0];
  for (const mail of rangeMailsList) {
    const score = mail.spamScore ?? 0;
    const index = score < 20 ? 0 : score < 40 ? 1 : score < 55 ? 2 : score < 70 ? 3 : score < 85 ? 4 : 5;
    riskBuckets[index]++;
  }

  // Arrival heatmap: always the last 7 days.
  const heat: OverviewStats["heat"] = [];
  const heatDays: string[] = [];
  for (let back = 6; back >= 0; back--) {
    const dayStart = todayStart - back * DAY_MS;
    const key = dayKeyOf(dayStart);
    heatDays.push(back === 0 ? "今天" : WEEKDAYS[new Date(dayStart).getDay()]);
    for (let slot = 0; slot < 6; slot++) {
      const count = mails.filter((mail) => dayKeyOf(mail.receivedAt) === key && Math.floor(new Date(mail.receivedAt).getHours() / 4) === slot).length;
      heat.push([6 - back, slot, count]);
    }
  }

  const prevStart = rangeStart - range * DAY_MS;
  const prevMails = mails.filter((mail) => mail.receivedAt >= prevStart && mail.receivedAt < rangeStart).length;
  const prevCodes = history.filter((item) => item.receivedAt >= prevStart && item.receivedAt < rangeStart).length;
  const delta = (current: number, prev: number) => (prev > 0 ? Math.round(((current - prev) / prev) * 100) : null);
  const rangeSpammy = rangeMailsList.filter((mail) => mail.contentKind === "spammy").length;

  return {
    series,
    typeDist,
    accountCounts,
    riskBuckets,
    heat,
    heatDays,
    rangeMails: rangeMailsList.length,
    rangeCodes: rangeCodesList.length,
    todayMails: mails.filter((mail) => mail.receivedAt >= todayStart).length,
    todayCodes: history.filter((item) => item.receivedAt >= todayStart).length,
    rangeSpammy,
    spamShare: rangeMailsList.length ? Math.round((rangeSpammy / rangeMailsList.length) * 1000) / 10 : 0,
    prevMailsDelta: delta(rangeMailsList.length, prevMails),
    prevCodesDelta: delta(rangeCodesList.length, prevCodes),
  };
}
